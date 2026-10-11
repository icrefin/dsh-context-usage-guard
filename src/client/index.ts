/**
 * dsh-context-usage-guard — browser half.
 *
 * The host half keeps the ring's *value* honest across a retry; this half keeps
 * its *typography* consistent with the figures beside it. See
 * `meter-typography.ts` for the one-pixel mismatch being corrected and why the
 * selector is structural.
 *
 * The tag is created when the bundle materializes, because that is the moment
 * the client module system claims styles from and the moment it evicts them
 * again; `apply` re-asserts it and registers its removal on the plugin's own
 * effect, so a row disabled while the page stays open also cleans up.
 *
 * A client `apply` that throws takes the whole shell boot down with it — the
 * loader fails the boot when a plugin's `apply` throws — so the body is wrapped.
 *
 * @module dsh-context-usage-guard/client
 */

import { installMeterTypography } from './meter-typography.ts'

/** Structural face of the client root context this plugin uses. */
interface ClientContext {
  /** Register cleanup that cordis runs when the row unloads or is disabled. */
  effect(callback: () => (() => void) | void, label?: string): void
}

/**
 * Keep the meter's percentage at the composer footer's figure size.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  try {
    ctx.effect(
      () => installMeterTypography(document),
      'dsh-context-usage-guard: meter typography',
    )
  } catch (error) {
    console.warn('[dsh-context-usage-guard] the meter typography rule could not be installed', error)
  }
}

// Materialization: the style tag exists before any plugin code runs, and the
// loader attributes it to this package for eviction.
installMeterTypography(document)