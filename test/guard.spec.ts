/**
 * The chunk filter, driven with the stream recorded from the session that
 * showed the symptom.
 *
 * @module dsh-context-usage-guard/test/guard
 */

import { describe, expect, it } from 'vitest'
import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { guardEmptyFailureSamples, isEmptySample, isFailureFinish, type HeldSample } from '../src/guard.ts'
import { FAILED_ATTEMPT_STREAM } from './recorded.ts'

/** Every chunk of a durable stream record, in order. */
function chunksOf(stream = FAILED_ATTEMPT_STREAM): StreamChunk[] {
  return stream.flatMap((record) => (record.type === 'chunk' ? [record.chunk] : []))
}

/** Run chunks through the guard and collect what it released. */
async function filter(
  chunks: readonly StreamChunk[],
  onHeld?: (held: HeldSample) => void,
): Promise<StreamChunk[]> {
  async function* source(): AsyncIterable<StreamChunk> {
    yield* chunks
  }
  const released: StreamChunk[] = []
  for await (const chunk of guardEmptyFailureSamples(source(), onHeld)) released.push(chunk)
  return released
}

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
const usageChunk = (usage: TokenUsage): StreamChunk => ({ type: 'usage', usage })
const errorFinish: StreamChunk = {
  type: 'finish',
  reason: { kind: 'error', failure: { message: 'rate limited', code: 'RATE_LIMIT' } },
}
const abortedFinish: StreamChunk = {
  type: 'finish',
  reason: { kind: 'aborted', failure: { message: 'cancelled', code: 'ABORTED' } },
}
const stopFinish: StreamChunk = { type: 'finish', reason: { kind: 'stop' } }

describe('isEmptySample', () => {
  it('treats the recorded failed-attempt sample as empty', () => {
    expect(isEmptySample(ZERO_USAGE)).toBe(true)
  })

  it('treats an absent count as zero', () => {
    expect(isEmptySample({ inputTokens: 0, outputTokens: 0 })).toBe(true)
    expect(isEmptySample({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(true)
  })

  it('refuses to call a sample empty when any reported count is real', () => {
    expect(isEmptySample({ inputTokens: 645, outputTokens: 0 })).toBe(false)
    expect(isEmptySample({ inputTokens: 0, outputTokens: 154 })).toBe(false)
    expect(isEmptySample({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 63744 })).toBe(false)
    expect(isEmptySample({ inputTokens: 0, outputTokens: 0, reasoningTokens: 12 })).toBe(false)
    expect(isEmptySample({ inputTokens: 0, outputTokens: 0, totalTokens: 64543 })).toBe(false)
  })
})

describe('isFailureFinish', () => {
  it('recognises the terminal failures a retry answers', () => {
    expect(isFailureFinish(errorFinish)).toBe(true)
    expect(isFailureFinish(abortedFinish)).toBe(true)
  })

  it('leaves a completed attempt alone', () => {
    expect(isFailureFinish(stopFinish)).toBe(false)
    expect(isFailureFinish({ type: 'finish', reason: { kind: 'tool-calls' } })).toBe(false)
    expect(isFailureFinish(usageChunk(ZERO_USAGE))).toBe(false)
  })
})

describe('guardEmptyFailureSamples', () => {
  it('drops the recorded empty sample from the failed attempt', async () => {
    const held: HeldSample[] = []
    const released = await filter(chunksOf(), (sample) => held.push(sample))

    // Everything the recorded stream carried except the empty sample survives,
    // including the terminal failure the retry executor reads.
    expect(released).toEqual([chunksOf().at(-1)])
    expect(held).toHaveLength(1)
    expect(held[0]?.usage).toEqual(ZERO_USAGE)
    expect(held[0]?.code).toBe('RATE_LIMIT')
  })

  it('drops an empty sample from a cancelled request too', async () => {
    const released = await filter([usageChunk(ZERO_USAGE), abortedFinish])
    expect(released).toEqual([abortedFinish])
  })

  it('keeps a real sample from a failed attempt', async () => {
    const partial: TokenUsage = { inputTokens: 645, outputTokens: 0, cacheReadTokens: 63744 }
    const released = await filter([usageChunk(partial), errorFinish])
    expect(released).toEqual([usageChunk(partial), errorFinish])
  })

  it('keeps every sample attached to a completed attempt', async () => {
    const released = await filter([usageChunk(ZERO_USAGE), stopFinish])
    expect(released).toEqual([usageChunk(ZERO_USAGE), stopFinish])
  })

  it('passes visible deltas through in order and leaves the finish terminal', async () => {
    const text = { type: 'text-delta', index: 0, text: 'hi' } as const
    const sample: TokenUsage = { inputTokens: 10, outputTokens: 2 }
    const released = await filter([text, usageChunk(sample), stopFinish])

    expect(released).toEqual([text, usageChunk(sample), stopFinish])
    expect(released.at(-1)?.type).toBe('finish')
  })

  it('releases a held sample when the stream ends without a terminal finish', async () => {
    const released = await filter([usageChunk(ZERO_USAGE)])
    expect(released).toEqual([usageChunk(ZERO_USAGE)])
  })

  it('never swallows a second sample from a malformed stream', async () => {
    const first: TokenUsage = { inputTokens: 1, outputTokens: 1 }
    const released = await filter([usageChunk(first), usageChunk(ZERO_USAGE), errorFinish])

    // The first sample is released to keep the malformed producer faithful, and
    // the second is the one judged against the terminal failure.
    expect(released).toEqual([usageChunk(first), errorFinish])
  })

  it('drops nothing when no sample was ever emitted', async () => {
    const released = await filter([errorFinish])
    expect(released).toEqual([errorFinish])
  })
})