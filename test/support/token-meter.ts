/**
 * Test-only access to the shipped `contextPressure` and `tokenUsage` folds.
 *
 * The composer's context-usage ring is fed by the `contextPressure` session
 * projection, which `@deepseek-ai/dsh-token-meter` registers internally: the
 * unit is not part of the package's export map, and the registry it registers
 * into shares a key rather than replacing it. The defect this plugin works
 * around lives in that fold's *input policy* — which sample counts as the
 * newest provider measurement — so a re-implementation of the fold would prove
 * nothing about the real behavior.
 *
 * The regression test therefore loads the shipped module by path and drives the
 * real code. The lookup fails loudly when the layout moves, so a runtime
 * upgrade turns into a visible test failure instead of a silent pass.
 *
 * @module dsh-context-usage-guard/test/support/token-meter
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** The shape this suite relies on from a shipped projection unit. */
export interface ProjectionUnit<State = unknown> {
  readonly key: string
  readonly stateVersion: number
  init(header?: unknown, inheritedEventCount?: number): State
  apply(state: State, event: unknown): State
  wire: { view(state: State): unknown }
}

const require = createRequire(import.meta.url)

/** The exported unit name behind each projection key this suite reads. */
const UNIT_EXPORTS: Record<string, string> = {
  contextPressure: 'contextPressureProjectionDefinition',
  tokenUsage: 'tokenUsageProjectionDefinition',
}

/** The projection module inside the installed token-meter package. */
function projectionModulePath(): string {
  const manifest = require.resolve('@deepseek-ai/dsh-token-meter/package.json')
  return path.join(path.dirname(manifest), 'lib', 'types', 'usage-projection.js')
}

/**
 * Load one shipped projection unit by its projection key.
 * @param key - the unit's projection key, e.g. `contextPressure`.
 * @returns the real unit, typed to the shape this suite drives.
 */
export async function loadProjectionUnit(key: string): Promise<ProjectionUnit> {
  const exported = UNIT_EXPORTS[key]
  if (exported === undefined) throw new Error(`${JSON.stringify(key)} is not a token-meter projection key`)
  const file = projectionModulePath()
  const module_ = (await import(pathToFileURL(file).href)) as Record<string, ProjectionUnit | undefined>
  const unit = module_[exported]
  if (unit === undefined || unit.key !== key) {
    throw new Error(
      `${file} no longer exports ${JSON.stringify(exported)} as projection ${JSON.stringify(key)};`
        + ' the token-meter package changed shape and this regression test must be re-pointed'
        + ' before it can prove anything.',
    )
  }
  return unit
}

/**
 * Fold a sequence of durable events through one shipped unit and read its wire
 * view — exactly the value a client receives for that projection key.
 * @param key - the unit's projection key.
 * @param events - the durable events, in order.
 * @returns the unit's client-visible value after the last event.
 */
export async function project(key: string, events: readonly unknown[]): Promise<Record<string, unknown>> {
  const unit = await loadProjectionUnit(key)
  let state = unit.init(undefined, 0)
  for (const event of events) state = unit.apply(state, event)
  return unit.wire.view(state) as Record<string, unknown>
}