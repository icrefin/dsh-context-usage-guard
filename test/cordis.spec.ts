/**
 * Activation on a real cordis Context.
 *
 * The other suites stub the host surface. This one does not: it mounts the
 * shipped `apply()` and its `Config` on a real `Context`, provides the `llm`
 * service its `inject` names, and dispatches through the real `ctx.waterfall`
 * exactly as `LlmRuntime.streamWithRegistration` does. It is the closest thing
 * to "the row activated in a host process" that a test can assert.
 *
 * @module dsh-context-usage-guard/test/cordis
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, LlmRuntime, StreamChunk } from '@deepseek-ai/dsh-llm'
import { apply, Config, inject, name } from '../src/index.ts'
import { FAILED_ATTEMPT_STREAM } from './recorded.ts'

/** Let the cordis scheduler run the fibers that mounting queued. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10))

/** The chunks of the recorded failed attempt. */
function failedChunks(): StreamChunk[] {
  return FAILED_ATTEMPT_STREAM.flatMap((record) => (record.type === 'chunk' ? [record.chunk] : []))
}

/**
 * The waterfall's declared `this` is the runtime service. These stand-ins
 * reproduce its dispatch without standing up an adapter registry, so the cast
 * says exactly that and nothing more.
 * @param value - the stand-in owner of the dispatch.
 * @returns the same value, typed as the runtime the waterfall declares.
 */
const asRuntime = (value: unknown): LlmRuntime => value as LlmRuntime

/**
 * A minimal `llm` service shaped like LlmRuntime: one `stream()` that dispatches
 * through the `llm/stream` waterfall over a fixed provider stream, exactly as
 * `LlmRuntime.streamWithRegistration` does.
 * @param providerStream - what the "adapter" yields.
 * @returns a cordis plugin providing `llm`.
 */
function llmStub(providerStream: () => AsyncIterable<StreamChunk>) {
  return {
    name: 'llm-stub',
    apply(ctx: Context) {
      const service = {
        stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
          return ctx.waterfall(asRuntime(service), 'llm/stream', options, () => providerStream())
        },
      }
      ctx.provide('llm', service as never)
    },
  }
}

/** Consume a stream the way the agent loop does. */
async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const request = { provider: 'example-provider', model: 'example-model-v1' } as GenerateOptions

describe('activation on a real cordis context', () => {
  it('guards the waterfall once its injected llm service exists, and stops when unloaded', async () => {
    const ctx = new Context()
    ctx.plugin(llmStub(() => (async function* () {
      yield* failedChunks()
    })()))
    const row = ctx.plugin({ name, inject, apply, Config })
    await settle()

    const llm = ctx.get('llm') as unknown as { stream(options: GenerateOptions): AsyncIterable<StreamChunk> }
    expect(await drain(llm.stream(request))).toHaveLength(failedChunks().length - 1)

    await row.dispose()
    await settle()

    // With the row unloaded the empty sample reaches the consumer again, which
    // is exactly the shipped behavior this plugin exists to change.
    expect(await drain(llm.stream(request))).toEqual(failedChunks())
  })

  it('holds the listener back until the injected service is provided', async () => {
    const ctx = new Context()
    const source = (): AsyncIterable<StreamChunk> => (async function* () {
      yield* failedChunks()
    })()

    ctx.plugin({ name, inject, apply, Config })
    await settle()

    // `inject: ['llm']` is not decoration: with no llm service the fiber waits,
    // so nothing guards the waterfall yet.
    const before = ctx.waterfall(asRuntime(ctx), 'llm/stream', request, source)
    expect(await drain(before)).toEqual(failedChunks())

    ctx.provide('llm', { stream() {} } as never)
    await settle()

    const after = ctx.waterfall(asRuntime(ctx), 'llm/stream', request, source)
    expect(await drain(after)).toHaveLength(failedChunks().length - 1)
  })
})