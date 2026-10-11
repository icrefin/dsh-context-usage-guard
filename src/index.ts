/**
 * dsh-context-usage-guard — host half.
 *
 * Keeps the composer's context-usage ring from collapsing to 0% while a model
 * request is being retried.
 *
 * The ring renders `contextPressure`, the session projection that takes the
 * newest provider usage sample as the current prompt size. A failed attempt
 * still ends its stream with a `usage` chunk of zeros, because the adapter's
 * accumulator starts at zero and nothing overwrote it, so that empty sample
 * becomes "the newest sample" and the ring reports 0% until the retried request
 * finally succeeds.
 *
 * This plugin sits on the LlmRuntime's documented `llm/stream` waterfall and
 * removes exactly that sample, so the projection keeps the last real reading.
 * See `guard.ts` for the rule and why dropping the chunk is legal.
 *
 * One registration, inside `ctx.effect`: cordis runs the disposer when the
 * plugin unloads, when the profile patch disables the row, or at shutdown. A
 * bare `ctx.on` outside an effect would leak the listener past unload.
 *
 * @module dsh-context-usage-guard
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only import: the declaration merging that types the `llm/stream` waterfall.
import type {} from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { guardEmptyFailureSamples, type HeldSample } from './guard.ts'

/** Loader row id; also the settings namespace, because an entry's Config is its namespace. */
export const name = 'dsh-context-usage-guard'

/** The waterfall belongs to the LLM service, so the service must exist first. */
export const inject = ['llm']

/**
 * The row's Config — and therefore this plugin's settings namespace.
 *
 * Both fields are `.volatile()`, making them writable at runtime: the Loader
 * updates the value in place on the running fiber, so the listener registered
 * in `apply()` reads the current setting with no reload.
 */
export const Config = z.object({
  /** While off, every stream is passed through untouched. */
  enabled: z.boolean().default(true).volatile(),
  /** Log one host line per withheld sample: provider, model and failure code. */
  logHeldSamples: z.boolean().default(false).volatile(),
})

/**
 * A volatile config field arrives as a live holder rather than a plain value;
 * a schema-less mount can also hand over the plain value directly.
 */
type Flag = boolean | { get(): unknown } | undefined

/** Config as `apply` receives it: volatile holders, not plain booleans. */
export interface GuardConfig {
  enabled?: Flag
  logHeldSamples?: Flag
}

/**
 * Read one boolean setting in either shape a mount can produce.
 * @param field - the config field.
 * @param fallback - the value to use when the field is absent or not a boolean.
 * @returns the current setting.
 */
function readFlag(field: Flag, fallback: boolean): boolean {
  if (field === undefined || field === null) return fallback
  const holder = field as { get?: unknown }
  const value = typeof holder.get === 'function' ? (field as { get(): unknown }).get() : field
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Install the stream guard.
 * @param ctx - host plugin context carrying the LLM service.
 * @param config - the row's config, with live volatile fields.
 */
export function apply(ctx: Context, config: GuardConfig = {}): void {
  ctx.effect(() => {
    const dispose = ctx.on('llm/stream', (options, next) => {
      if (!readFlag(config.enabled, true)) return next()
      const heldSamplesVisible = readFlag(config.logHeldSamples, false)
      return guardEmptyFailureSamples(next(), (held: HeldSample) => {
        if (!heldSamplesVisible) return
        const route = `${options.provider ?? 'unknown'}/${options.model ?? 'unknown'}`
        ctx.logger.info(
          '[dsh-context-usage-guard] held an empty usage sample from a failed request'
            + ` (${route}${held.code === undefined ? '' : `, ${held.code}`}); the context reading stays at its last value`,
        )
      })
    })
    ctx.logger.info('[dsh-context-usage-guard] guarding llm/stream against empty failed-attempt usage samples')
    return () => {
      dispose()
    }
  }, 'dsh-context-usage-guard: llm/stream')
}