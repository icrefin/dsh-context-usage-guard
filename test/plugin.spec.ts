/**
 * The plugin's own wiring, driven through the real `apply()`.
 *
 * Nothing about the registration is stubbed except the host context: the
 * listener is captured exactly as `ctx.on` delivers it, and the streams it
 * returns are consumed the way LlmRuntime consumes them.
 *
 * @module dsh-context-usage-guard/test/plugin
 */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { apply, Config, name, type GuardConfig } from '../src/index.ts'
import { FAILED_ATTEMPT_STREAM } from './recorded.ts'

type StreamListener = (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>

/** The narrow host surface this plugin touches, plus the teardown cordis would run. */
interface HostStub {
  readonly ctx: Context
  readonly listeners: StreamListener[]
  readonly logs: string[]
  /** Run the effect disposer, as the registry does when the row unloads. */
  unload(): void
}

/** Build a host context that records what the plugin registers and logs. */
function host(): HostStub {
  const listeners: StreamListener[] = []
  const logs: string[] = []
  const disposers: Array<() => void> = []

  const ctx = {
    on(_event: string, listener: StreamListener) {
      listeners.push(listener)
      return () => {
        const at = listeners.indexOf(listener)
        if (at >= 0) listeners.splice(at, 1)
      }
    },
    effect(callback: () => (() => void) | void) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {
        for (const disposer of disposers.splice(0)) disposer()
      }
    },
    logger: {
      info(message: string) {
        logs.push(message)
      },
    },
  } as unknown as Context

  return {
    ctx,
    listeners,
    logs,
    unload() {
      for (const disposer of disposers.splice(0)) disposer()
    },
  }
}

/** Every chunk of the recorded failed attempt, in order. */
function failedChunks(): StreamChunk[] {
  return FAILED_ATTEMPT_STREAM.flatMap((record) => (record.type === 'chunk' ? [record.chunk] : []))
}

/** Build the downstream `next()` the waterfall would hand the listener. */
function downstream(chunks: readonly StreamChunk[]): () => AsyncIterable<StreamChunk> {
  return () => (async function* () {
    yield* chunks
  })()
}

/** Consume a listener's stream the way the agent loop does. */
async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

/** A loop-built model request, as `GenerateOptions` reaches the waterfall. */
const passing = { provider: 'example-provider', model: 'example-model-v1' } as GenerateOptions

describe('the row definition', () => {
  it('keeps the row id and the settings namespace identical', () => {
    expect(name).toBe('dsh-context-usage-guard')
  })

  it('ships defaults that leave stock behavior in place', () => {
    // A volatile field is a live holder even at its default; read it the way a
    // consumer does.
    const flag = (field: unknown): unknown =>
      typeof (field as { get?: unknown } | undefined)?.get === 'function'
        ? (field as { get(): unknown }).get()
        : field

    const defaults = Config({})
    expect(flag(defaults.enabled)).toBe(true)
    expect(flag(defaults.logHeldSamples)).toBe(false)
  })
})

describe('apply', () => {
  it('registers one llm/stream listener and says so', () => {
    const stub = host()
    apply(stub.ctx, {})

    expect(stub.listeners).toHaveLength(1)
    expect(stub.logs).toEqual([expect.stringContaining('guarding llm/stream')])
  })

  it('withdraws the listener when the row unloads', () => {
    const stub = host()
    apply(stub.ctx, {})
    expect(stub.listeners).toHaveLength(1)

    stub.unload()
    expect(stub.listeners).toHaveLength(0)
  })

  it('withholds the empty sample from the recorded failed attempt', async () => {
    const stub = host()
    apply(stub.ctx, {})
    const source = failedChunks()
    const chunks = await drain(stub.listeners[0]!(passing, downstream(source)))

    expect(chunks).toHaveLength(source.length - 1)
    expect(chunks.at(-1)?.type).toBe('finish')
  })

  it('passes the stream through untouched while disabled', async () => {
    const stub = host()
    apply(stub.ctx, { enabled: false } satisfies GuardConfig)
    const source = failedChunks()

    expect(await drain(stub.listeners[0]!(passing, downstream(source)))).toEqual(source)
  })

  it('reads a volatile holder per stream, so a runtime toggle applies live', async () => {
    const stub = host()
    let enabled = true
    apply(stub.ctx, { enabled: { get: () => enabled } })
    const source = failedChunks()

    expect(await drain(stub.listeners[0]!(passing, downstream(source)))).toHaveLength(source.length - 1)

    enabled = false
    expect(await drain(stub.listeners[0]!(passing, downstream(source)))).toEqual(source)
  })

  it('logs a withheld sample only when asked, naming the route and the failure', async () => {
    const quiet = host()
    apply(quiet.ctx, {})
    await drain(quiet.listeners[0]!(passing, downstream(failedChunks())))
    expect(quiet.logs.filter((line) => line.includes('held an empty usage sample'))).toHaveLength(0)

    const loud = host()
    apply(loud.ctx, { logHeldSamples: true })
    await drain(loud.listeners[0]!(passing, downstream(failedChunks())))

    const held = loud.logs.filter((line) => line.includes('held an empty usage sample'))
    expect(held).toHaveLength(1)
    expect(held[0]).toContain('example-provider/example-model-v1')
    expect(held[0]).toContain('RATE_LIMIT')
  })
})