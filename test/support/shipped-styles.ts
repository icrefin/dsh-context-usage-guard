/**
 * The two shipped declarations this plugin's stylesheet has to agree with,
 * read from the installed packages rather than copied into the test.
 *
 * A one-pixel typography fix is only correct while it *matches* the declaration
 * it is copied from, and only *needed* while the declaration it replaces still
 * differs. Both facts live in the shipped client bundles, so this module reads
 * them out of the built `lib/client.js` of each package:
 *
 * - `dsh-client-ui-chat` owns the composer's statistics pills;
 * - `dsh-client-ui-conversation` owns the context-usage meter.
 *
 * The lookup is anchored on each module's own stylesheet tag id and fails
 * loudly, so a runtime that renames the file or drops the declaration turns into
 * a visible test failure rather than a silent pass.
 *
 * @module dsh-context-usage-guard/test/support/shipped-styles
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

/** Where each declaration lives: package, and the module whose tag marks the stylesheet. */
const SHIPPED: Record<string, { pkg: string; module: string }> = {
  stats: { pkg: '@deepseek-ai/dsh-client-ui-chat', module: 'StatsPills.module.css' },
  meter: { pkg: '@deepseek-ai/dsh-client-ui-conversation', module: 'ContextMeter.module.css' },
}

const require = createRequire(import.meta.url)

/** How far back from a module's tag id its own stylesheet can start. */
const STYLESHEET_SEARCH_WINDOW = 20_000

/**
 * Read one shipped `font-size` declaration.
 * @param which - `stats` for the statistics pills, `meter` for the ring.
 * @returns the declaration exactly as the bundle carries it, e.g. `font-size:…`.
 */
export function shippedFigureSize(which: 'stats' | 'meter'): string {
  const target = SHIPPED[which]
  if (target === undefined) throw new Error(`${JSON.stringify(which)} is not a known shipped stylesheet`)

  const manifest = require.resolve(`${target.pkg}/package.json`)
  const bundle = path.join(path.dirname(manifest), 'lib', 'client.js')
  const source = readFileSync(bundle, 'utf8')

  const marker = source.indexOf(`${target.pkg}/${target.module}`)
  if (marker < 0) {
    throw new Error(`${bundle} no longer names ${target.module}; the shipped stylesheet moved and this test must be re-pointed`)
  }

  // The module's CSS literal sits immediately before its tag id, so the last
  // declaration in that window belongs to the module named above.
  const window = source.slice(Math.max(0, marker - STYLESHEET_SEARCH_WINDOW), marker)
  const declarations = [...window.matchAll(
    /font-size:var\(--dsh-content-font-size-secondary[^)]*\)|font-size:calc\(var\(--dsh-content-font-size-secondary[^)]*\)[^)]*\)/g,
  )]
  const last = declarations.at(-1)?.[0]
  if (last === undefined) {
    throw new Error(`${bundle} carries no --dsh-content-font-size-secondary font-size before ${target.module}; the declaration this test pins is gone`)
  }
  return last
}