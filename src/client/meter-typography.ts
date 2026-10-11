/**
 * One stylesheet rule: the composer's context-usage percentage, at the size
 * every other figure on its own line already uses.
 *
 * ## What is inconsistent
 *
 * The composer's footer band holds the session statistics and the
 * context-usage meter side by side. Both draw their figures from the same
 * theme token, but the shipped rules disagree by one pixel:
 *
 * ```css
 * /* @deepseek-ai/dsh-client-ui-chat — StatsPills.module.css (the pills) *
 * .OpZ85W_root { font-size: calc(var(--dsh-content-font-size-secondary,13px) - 1px) }
 *
 * /* @deepseek-ai/dsh-client-ui-conversation — ContextMeter.module.css (the ring) *
 * .y0jqnG_trigger { font-size: var(--dsh-content-font-size-secondary,13px) }
 * ```
 *
 * (Class names are content-hashed per build; the declarations are quoted from
 * the 0.2.0-rc.2 bundles, and `test/meter-typography.spec.ts` re-reads both from
 * the installed packages rather than trusting this comment.)
 *
 * So the ring's `30%` is rendered ~8% larger than the `182 steps`, `238 tok/s`,
 * `33.4M tok` and `Cache hit 94%` beside it — which reads as a different font.
 * The meter's own breakdown panel is already `12px`, so the *trigger* is the
 * outlier, not the statistic pills.
 *
 * ## How it is corrected
 *
 * The rule repeats the statistics declaration verbatim, so the two cannot drift:
 * both sides resolve to `secondary - 1px`, and the meter's line box is unchanged
 * because the two shipped rules already share `line-height`.
 *
 * It selects the trigger by its own structural signature rather than by a
 * hashed class name: the meter's button is the only `aria-haspopup="dialog"`
 * button whose icon is the ring itself — an inline `<svg>` with `<circle>`
 * children. The statistics pills are the same kind of button but draw
 * `<path>`-based icons, so they never match. Specificity
 * `(0,1,3)` beats the shipped `(0,1,0)`, so no `!important` is needed, and a
 * build that renames the class cannot break the rule.
 *
 * @module dsh-context-usage-guard/client/meter-typography
 */

/** The plugin id the loader knows this package by, also used to claim the style tag. */
export const PLUGIN_ID = 'dsh-context-usage-guard'

/** Identity of the tag, so injection is idempotent and the loader can evict it. */
export const STYLE_TAG_ID = `${PLUGIN_ID}/meter-typography.css`

/**
 * The figure size shared by everything on the composer's footer line: the
 * secondary content size, one pixel down — the statistics pills' declaration,
 * copied exactly.
 */
export const FOOTER_FIGURE_SIZE = 'calc(var(--dsh-content-font-size-secondary,13px) - 1px)'

/**
 * The meter's trigger, addressed by structure: a dialog-opening button whose
 * icon is the ring SVG.
 */
export const METER_TRIGGER_SELECTOR = 'button[aria-haspopup="dialog"]:has(> svg > circle)'

/** The whole stylesheet: one rule, one declaration. */
export const METER_TYPOGRAPHY_CSS = `${METER_TRIGGER_SELECTOR}{font-size:${FOOTER_FIGURE_SIZE}}`

/**
 * Install the rule, or adopt the tag that already carries it.
 *
 * The tag is self-tagged with `data-plugin`, which is what the client module
 * system evicts when this plugin unloads; the returned disposer covers a row
 * that is disabled while the page stays open.
 *
 * @param doc - the document to install into.
 * @returns a disposer that removes this plugin's tag.
 */
export function installMeterTypography(doc: Document): () => void {
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`
  const existing = doc.querySelector(selector)
  if (existing !== null) return () => existing.remove()

  const tag = doc.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = METER_TYPOGRAPHY_CSS
  doc.head.append(tag)
  return () => tag.remove()
}