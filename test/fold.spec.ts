/**
 * The regression test for the reported symptom, driven through the *shipped*
 * `contextPressure` fold.
 *
 * It replays the real durable sequence around the retry storm: a successful
 * call reports its usage, a tool result grows the surface, the next attempt
 * fails with a 429 and a usage chunk of zeros, and the retry executor schedules
 * the next attempt. The suite asserts the wire view a client receives — the
 * number the composer's ring renders — before and after the guard.
 *
 * @module dsh-context-usage-guard/test/fold
 */

import { describe, expect, it } from 'vitest'
import {
  AssistantStreamAccumulator,
  expandAssistantStream,
  lastAssistantStreamChunk,
  type AssistantStreamRecord,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { guardEmptyFailureSamples } from '../src/guard.ts'
import { project } from './support/token-meter.ts'
import {
  FAILED_ATTEMPT_STREAM,
  RETRY_SUCCESS_USAGE,
  SUCCESSFUL_MESSAGE,
  SUCCESSFUL_USAGE,
  TOOL_RESULT_MESSAGE,
} from './recorded.ts'

/** The route capacity the session reported for its model. */
const CONTEXT_WINDOW = 1_000_000

/** One timestamp for the whole replay; the folds never read it. */
const TIME = 1_790_867_853_136

/** Events before the first state a fresh attempt can overwrite: request, step 11, its result, step 12 opens. */
const PRE_RETRY_EVENTS = 6

/** The reading the ring shows: the whole client-visible value of the projection. */
interface Reading extends Record<string, unknown> {
  pressureTokens?: number
  projectedTokens?: number
  surfaceTokens?: number
  sampledSurfaceTokens?: number
  contextWindow?: number
}

/** Recompact a durable stream after the guard has judged its chunks. */
async function guardedStream(stream: readonly AssistantStreamRecord[]): Promise<readonly AssistantStreamRecord[]> {
  const accumulator = new AssistantStreamAccumulator()
  async function* source(): AsyncIterable<StreamChunk> {
    for (const timed of expandAssistantStream(stream)) yield timed.chunk
  }
  for await (const chunk of guardEmptyFailureSamples(source())) accumulator.push({ time: TIME, chunk })
  return accumulator.snapshot()
}

/**
 * The durable sequence around the retry.
 * @param attemptStream - the failed attempt's stream, raw or guarded.
 * @param retrySucceeds - append the message the retried step eventually produced.
 * @returns the events in order.
 */
function sequence(attemptStream: readonly AssistantStreamRecord[], retrySucceeds = false): unknown[] {
  const events: unknown[] = [
    { type: 'request/context', seq: 1, time: TIME, data: { contextWindow: CONTEXT_WINDOW } },
    { type: 'step/start', seq: 2, time: TIME, data: { turn: 1, step: 11 } },
    {
      type: 'assistant/message',
      seq: 3,
      time: TIME,
      surfaceOp: 'append',
      data: { turn: 1, step: 11, usage: SUCCESSFUL_USAGE, message: SUCCESSFUL_MESSAGE },
    },
    {
      type: 'tool/result',
      seq: 4,
      time: TIME,
      surfaceOp: 'append',
      data: { turn: 1, step: 11, message: TOOL_RESULT_MESSAGE },
    },
    { type: 'step/end', seq: 5, time: TIME, data: { turn: 1, step: 11 } },
    { type: 'step/start', seq: 6, time: TIME, data: { turn: 1, step: 12 } },
    { type: 'assistant/attempt', seq: 7, time: TIME, data: { turn: 1, step: 12, stream: attemptStream } },
    { type: 'llm/retry', seq: 8, time: TIME, data: { turn: 1, step: 12, retry: 1 } },
    { type: 'llm/retry-started', seq: 9, time: TIME, data: { turn: 1, step: 12, retry: 1 } },
  ]
  if (retrySucceeds) {
    events.push({
      type: 'assistant/message',
      seq: 10,
      time: TIME,
      data: { turn: 1, step: 12, usage: RETRY_SUCCESS_USAGE, message: SUCCESSFUL_MESSAGE },
    })
  }
  return events
}

const reading = async (events: readonly unknown[]): Promise<Reading> =>
  (await project('contextPressure', events)) as Reading

describe('the recorded failed attempt', () => {
  it('carries an all-zero usage sample that the shipped reading path picks up', () => {
    expect(lastAssistantStreamChunk(FAILED_ATTEMPT_STREAM, 'usage')?.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    })
  })

  it('loses that sample once the guard has judged the stream', async () => {
    const guarded = await guardedStream(FAILED_ATTEMPT_STREAM)
    expect(lastAssistantStreamChunk(guarded, 'usage')).toBeUndefined()
    expect(guarded).toHaveLength(FAILED_ATTEMPT_STREAM.length - 1)
  })
})

describe('the context-usage reading across a retry', () => {
  it('collapses to 0% with the unguarded stream — the reported symptom', async () => {
    const pre = await reading(sequence(FAILED_ATTEMPT_STREAM).slice(0, PRE_RETRY_EVENTS))
    const after = await reading(sequence(FAILED_ATTEMPT_STREAM))

    expect(pre.projectedTokens).toBeGreaterThan(0)
    expect(after.projectedTokens).toBe(0)
    expect(after.pressureTokens).toBe(0)
    // The capacity survives, so the ring renders rather than hiding: it shows 0%.
    expect(after.contextWindow).toBe(CONTEXT_WINDOW)
  })

  it('holds the last real reading with the guarded stream', async () => {
    const pre = await reading(sequence(FAILED_ATTEMPT_STREAM).slice(0, PRE_RETRY_EVENTS))
    const after = await reading(sequence(await guardedStream(FAILED_ATTEMPT_STREAM)))

    // The tool result grew the surface after the sample was taken, so the
    // reading sits above the raw prompt size: it must survive the retry intact,
    // not merely stop moving.
    expect(pre.projectedTokens).toBeGreaterThan(pre.pressureTokens ?? 0)
    expect(after.projectedTokens).toBe(pre.projectedTokens)
    expect(after.pressureTokens).toBe(pre.pressureTokens)
    expect(after.sampledSurfaceTokens).toBe(pre.sampledSurfaceTokens)
  })

  it('still advances to the retried attempt\'s own usage when it succeeds', async () => {
    const pre = await reading(sequence(FAILED_ATTEMPT_STREAM).slice(0, PRE_RETRY_EVENTS))
    const after = await reading(sequence(await guardedStream(FAILED_ATTEMPT_STREAM), true))
    const expected = RETRY_SUCCESS_USAGE.inputTokens
      + (RETRY_SUCCESS_USAGE.cacheReadTokens ?? 0)
      + (RETRY_SUCCESS_USAGE.cacheWriteTokens ?? 0)

    expect(after.pressureTokens).toBe(expected)
    expect(after.projectedTokens).toBe(expected)
    expect(after.projectedTokens).toBeGreaterThan(pre.projectedTokens ?? 0)
  })
})

describe('token accounting', () => {
  it('is untouched by withholding the empty sample', async () => {
    const unguarded = await project('tokenUsage', sequence(FAILED_ATTEMPT_STREAM))
    const guarded = await project('tokenUsage', sequence(await guardedStream(FAILED_ATTEMPT_STREAM)))

    expect(guarded).toEqual(unguarded)
  })
})