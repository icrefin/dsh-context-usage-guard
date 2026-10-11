/**
 * Render the built browser half **outside the GUI** and screenshot the composer
 * footer it typesets.
 *
 * The browser half has no component and no slot of its own: it adds one
 * stylesheet rule to the meter's trigger, and every check in
 * `test/meter-typography.spec.ts` runs in jsdom. jsdom has no layout engine, so
 * nothing there can say what the rule *looks* like on screen. This harness
 * answers that half. It:
 *
 *   1. builds `lib/client.js` first when it is missing (or with `--build`);
 *   2. loads that bundle through a stub `window.__ModuleLoader__`, calls the
 *      plugin's `apply()` with a minimal fake client context (whose `effect`
 *      runs the callback the way cordis does), and asserts that exactly the one
 *      self-tagged stylesheet tag materialized;
 *   3. paints a rehearsal of the composer's footer band — the session
 *      statistics pills and the context-usage meter — from the **installed**
 *      `dsh-client-ui-chat` / `dsh-client-ui-conversation` stylesheets, read out
 *      of those packages' real bundles rather than copied here, so the shot
 *      cannot drift from the typography the rule is about;
 *   4. replays plausible session projections through that footer: a step count,
 *      throughput, a token total, a cache-hit rate and a context pressure
 *      reading, formatted with the shipped components' own arithmetic
 *      (`billedInputTokens`, `formatTokens`, `contextOccupancy`) so the figures
 *      are derived, not typed in;
 *   5. screenshots the page with headless Google Chrome, then re-reads the
 *      rendered font sizes with `--dump-dom` and **fails** unless the meter now
 *      matches the pills and did not match them before the rule.
 *
 * It renders outside the GUI: it never reads the real `~/.dsh` profile, never
 * touches a session log and never uses the network. Everything it shows comes
 * from the arguments at the top of this file.
 *
 * The card the footer sits in (padding, border, shadow, model chip, send
 * button) is preview scaffolding, not a reproduction of the GUI's composer;
 * the footer band itself — its markup, its class names and its stylesheets —
 * is reproduced from the shipped packages.
 *
 * Usage (needs Google Chrome on the host; `lib/client.js` is built on demand):
 *
 *     node tools/preview.mjs [--out <dir>] [--png <file>] [--open] [--build]
 *                            [--width <px>] [--height <px>] [--scale <n>]
 *
 * The geometry flags default to 720x160 CSS pixels at scale 2, which is the
 * 1440-wide shot committed as `docs/images/context-usage-ring.png`.
 *
 * @module dsh-context-usage-guard/tools/preview
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const bundle = join(packageRoot, 'lib', 'client.js')

/** Chrome-family binaries to try, in order. */
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

/** The two shipped stylesheets the composer's footer band is drawn from. */
const SHIPPED = {
  stats: { pkg: '@deepseek-ai/dsh-client-ui-chat', module: 'StatsPills.module.css' },
  meter: { pkg: '@deepseek-ai/dsh-client-ui-conversation', module: 'ContextMeter.module.css' },
}

/** How far back from a module's tag id its own stylesheet can start. */
const STYLESHEET_SEARCH_WINDOW = 20_000

/**
 * The replayed host face: one session's projections, read mid-retry — a failed
 * attempt has just been withheld, so the pressure reading is the last real one.
 *
 * The numbers are a rehearsal, not a capture: no session log is opened. They
 * are chosen to land on the figures the two halves of this plugin are about
 * (`26 turns 182 steps · 238 tok/s`, `33.4M tok · Cache hit 94%`, a ring at
 * `30%`), which is what makes the shot a product shot rather than an empty one.
 */
const SESSION = {
  turns: 26,
  steps: 182,
  /** Output tokens and their decode window, for the throughput figure. */
  decodeTokens: 268_000,
  decodeMs: 1_126_000,
  /** Prompt-side billing buckets plus output, for the total and the cache rate. */
  usage: {
    uncachedInputTokens: 1_998_000,
    cacheReadTokens: 31_302_000,
    cacheWriteTokens: 0,
    outputTokens: 110_000,
  },
  /** `contextPressure` as the projection would publish it while a retry is in flight. */
  pressure: {
    pressureTokens: 64_389,
    projectedTokens: 60_128,
    contextWindow: 200_000,
  },
}

/**
 * Read one shipped stylesheet and the class prefix its module hashed it under.
 *
 * A hashed prefix differs per build, so it is read rather than hard-coded — the
 * same approach `test/support/shipped-styles.ts` takes for the declarations.
 *
 * @param which - `stats` for the statistics pills, `meter` for the ring.
 * @returns the stylesheet text, its class prefix, and its own tag id.
 */
function readShipped(which) {
  const target = SHIPPED[which]
  const source = readFileSync(join(packageRoot, 'node_modules', target.pkg, 'lib', 'client.js'), 'utf8')

  const marker = source.indexOf(`${target.pkg}/${target.module}`)
  if (marker < 0) {
    throw new Error(`${target.pkg} no longer names ${target.module}; the preview must be re-pointed`)
  }

  const window = source.slice(Math.max(0, marker - STYLESHEET_SEARCH_WINDOW), marker)
  const literals = [...window.matchAll(/const css\$\d+ = "((?:[^"\\]|\\.)*)"/g)]
  const literal = literals.at(-1)?.[1]
  if (literal === undefined) throw new Error(`${target.pkg} carries no stylesheet literal before ${target.module}`)

  const css = JSON.parse(`"${literal}"`)
  const prefix = /\.([A-Za-z0-9_]+)_root\{/.exec(css)?.[1]
  if (prefix === undefined) throw new Error(`${target.module} no longer declares a hashed *_root class`)

  return { css, prefix, tagId: `${target.pkg}/${target.module}` }
}

/**
 * Assert the mismatch this plugin repairs is still the shipped one, so a runtime
 * that fixes the trigger upstream fails here instead of leaving a silent shot.
 *
 * @param shipped - both stylesheets read by {@link readShipped}.
 */
function assertShippedMismatch(shipped) {
  const statsFigure = /font-size:calc\(var\(--dsh-content-font-size-secondary[^)]*\)[^)]*\)/.exec(shipped.stats.css)?.[0]
  const meterFigure = /font-size:var\(--dsh-content-font-size-secondary[^)]*\)/.exec(shipped.meter.css)?.[0]

  if (statsFigure === undefined) throw new Error('StatsPills no longer declares the pill figure size this rule copies')
  if (meterFigure === undefined) throw new Error('ContextMeter no longer declares the trigger figure size this rule replaces')
  if (!statsFigure.includes('- 1px)')) {
    throw new Error(`the pills' figure is no longer "secondary - 1px" (${statsFigure}); re-point this preview`)
  }
  if (meterFigure !== 'font-size:var(--dsh-content-font-size-secondary,13px)') {
    throw new Error(`the meter's figure is no longer the plain secondary size (${meterFigure}); the fix landed upstream`)
  }
}

/**
 * Derive the footer's figures from the replayed projections, with the shipped
 * components' own arithmetic: `billedInputTokens`, `formatTokens`,
 * `formatTokensPerSecond` and `contextOccupancy`.
 *
 * @returns every string and number the preview page paints.
 */
function figures() {
  const { usage, pressure } = SESSION

  const scaled = (candidate) => (candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10))
  const compact = (value) => {
    if (value < 1e3) return String(value)
    if (value < 1e6) return `${scaled(value / 1e3)}K`
    return `${scaled(value / 1e6)}M`
  }

  const billedInput = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const total = billedInput + usage.outputTokens
  const speed = SESSION.decodeMs > 0 ? SESSION.decodeTokens / (SESSION.decodeMs / 1e3) : 0
  const usedTokens = pressure.projectedTokens ?? pressure.pressureTokens
  const percent = Math.min(100, Math.round((usedTokens / pressure.contextWindow) * 100))

  // RADIUS 5.5 and the 2πr dash the shipped ContextMeter uses.
  const radius = 5.5
  const circumference = 2 * Math.PI * radius

  return {
    counts: `${SESSION.turns} turns ${SESSION.steps} steps`,
    speed: `${speed >= 10 ? String(Math.round(speed)) : String(Math.round(speed * 10) / 10)} tok/s`,
    total: `${compact(total)} tok`,
    cacheHit: `Cache hit ${Math.round((usage.cacheReadTokens / billedInput) * 100)}%`,
    percent,
    reading: `${percent}%`,
    sentence: `${percent}% of context used`,
    used: compact(usedTokens),
    contextWindow: compact(pressure.contextWindow),
    ringDash: `${(circumference * percent) / 100} ${circumference}`,
  }
}

/**
 * The rehearsal page: theme tokens, the shipped stylesheets, the built bundle,
 * then the footer band and the render check.
 *
 * @param shipped - both shipped stylesheets.
 * @param figure - the derived figures.
 * @param bundleSource - the built `lib/client.js` body.
 * @returns a self-contained HTML document.
 */
function page(shipped, figure, bundleSource) {
  const payload = {
    shipped: [
      { tagId: shipped.stats.tagId, plugin: SHIPPED.stats.pkg, css: shipped.stats.css },
      { tagId: shipped.meter.tagId, plugin: SHIPPED.meter.pkg, css: shipped.meter.css },
    ],
    stats: { prefix: shipped.stats.prefix },
    meter: { prefix: shipped.meter.prefix },
    figure,
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>dsh-context-usage-guard — composer footer preview</title>
<style>
/* Preview palette. The label, border and interactive values are the desktop
   theme's own light-mode alias values; its surface aliases resolve to white in
   that mode, so the canvas and the card are both white and separated by a border
   and a shadow. The one alias the theme does not define at all
   (--dsw-alias-separator-primary) is given a legible value here. Nothing in this
   file comes from a user profile. */
:root{
  color-scheme: light;
  --dsw-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --dsh-content-font-size: 14px;
  --dsh-content-font-size-secondary: 13px;
  --dsh-content-font-delta-secondary: 0px;
  --dsw-alias-bg-base: #fff;
  --dsw-alias-bg-layer-1: #fff;
  --dsw-alias-label-primary: #0f1115;
  --dsw-alias-label-secondary: #61666b;
  --dsw-alias-label-tertiary: #81858c;
  --dsw-alias-border-l1: rgba(0, 0, 0, .06);
  --dsw-alias-border-l2: rgba(0, 0, 0, .1);
  --dsw-alias-border-l3: rgba(0, 0, 0, .12);
  --dsw-alias-interactive-bg-hover: rgba(38, 49, 72, .06);
  /* Not defined by the desktop theme; the separator dot simply inherits its colour there. */
  --dsw-alias-separator-primary: rgba(0, 0, 0, .2);
  --dsw-radius-sm: 8px;
  --dsw-radius-lg: 16px;
}
html,body{margin:0;height:100%;background:var(--dsw-alias-bg-layer-1);
  font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);
  -webkit-font-smoothing:antialiased}
.canvas{box-sizing:border-box;height:100vh;display:flex;align-items:center;justify-content:center;padding:28px 32px}
.composer{box-sizing:border-box;width:100%;max-width:920px;background:var(--dsw-alias-bg-base);
  border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);
  box-shadow:0 10px 30px rgba(15,17,21,.07);padding:12px 14px 8px;
  display:flex;flex-direction:column;gap:12px}
.controls{display:flex;align-items:center;gap:8px;min-height:30px}
.model{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;line-height:20px;
  color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);
  border-radius:var(--dsw-radius-sm);padding:3px 9px}
.model svg{width:14px;height:14px;flex:none}
.spacer{flex:1}
.control{box-sizing:border-box;width:28px;height:28px;border:0;border-radius:999px;padding:0;
  display:inline-flex;align-items:center;justify-content:center;background:0 0;
  color:var(--dsw-alias-label-tertiary);cursor:pointer}
.control svg{width:16px;height:16px}
.control.send{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}
.footer{display:flex;align-items:center;justify-content:space-between;gap:16px;
  border-top:1px solid var(--dsw-alias-border-l1);padding:4px 2px 0}
</style>
<!-- The shipped stylesheets, injected the way their own modules inject them. -->
<style data-plugin="${SHIPPED.stats.pkg}" data-plugin-css="${shipped.stats.tagId}">${shipped.stats.css}</style>
<style data-plugin="${SHIPPED.meter.pkg}" data-plugin-css="${shipped.meter.tagId}">${shipped.meter.css}</style>
</head>
<body>
<div class="canvas"><div class="composer" id="composer"></div></div>
<script>window.__ModuleLoader__ = { load: (definition) => { window.__definition = definition } }</script>
<script>${bundleSource}</script>
<script>
const PAYLOAD = ${JSON.stringify(payload)}
const F = PAYLOAD.figure

/* The client module system hands the plugin its bootstrap; this harness only
   supplies the fake root context that apply() expects. */
const definition = window.__definition
if (!definition || definition.id !== 'dsh-context-usage-guard') {
  throw new Error('the bundle did not register dsh-context-usage-guard')
}

const effects = []
definition.factory((name) => { throw new Error('unexpected require: ' + name) })
  .apply({
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') effects.push(dispose)
      return () => {}
    },
  })

const guardTags = [...document.querySelectorAll('style[data-plugin="dsh-context-usage-guard"]')]
if (guardTags.length !== 1 || effects.length !== 1) {
  throw new Error('apply() did not install exactly one stylesheet and one effect')
}

const S = PAYLOAD.stats.prefix
const M = PAYLOAD.meter.prefix

/* Markup shapes reproduced from the shipped components. The two pill icons are
   <path>-based; the meter's icon is the ring itself, an <svg> of <circle>s —
   the structural difference the plugin's selector keys on. */
const GAUGE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 12.5a6.5 6.5 0 1 1 11 0"/><path d="M8 9l2.4-2.6"/></svg>'
const DATABASE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2c3 0 5 .7 5 1.5S11 5 8 5 3 4.3 3 3.5 5 2 8 2Z"/><path d="M3 3.5v9c0 .8 2 1.5 5 1.5s5-.7 5-1.5v-9"/><path d="M3 8c0 .8 2 1.5 5 1.5s5-.7 5-1.5"/></svg>'
const PLUS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>'
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5V4M4.5 7.5 8 4l3.5 3.5"/></svg>'

const pill = (icon, label, ariaLabel) =>
  '<span class="' + S + '_anchor"><button type="button" class="' + S + '_pill" aria-haspopup="dialog" aria-expanded="false" aria-label="' + ariaLabel + '">'
  + icon + '<span class="' + S + '_label">' + label + '</span></button></span>'

const sep = '<span class="' + S + '_sep" aria-hidden="true">·</span>'

const stats =
  '<div class="' + S + '_root" data-composer-stats="true">'
  + pill(GAUGE, F.counts + sep + F.speed, F.counts + ' · ' + F.speed)
  + pill(DATABASE, F.total + sep + F.cacheHit, F.total + ' · ' + F.cacheHit)
  + '</div>'

const ring =
  '<span class="' + M + '_root" data-preview-meter="true">'
  + '<button type="button" class="' + M + '_trigger" aria-haspopup="dialog" aria-expanded="false" aria-label="' + F.sentence + '">'
  + '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">'
  + '<circle class="' + M + '_track" cx="7" cy="7" r="5.5"/>'
  + '<circle class="' + M + '_fill" cx="7" cy="7" r="5.5" stroke-dasharray="' + F.ringDash + '" transform="rotate(-90 7 7)"/>'
  + '</svg><span>' + F.reading + '</span></button></span>'

document.getElementById('composer').innerHTML =
  '<div class="controls">'
  + '<span class="model"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 5h10M5.5 8h5M7 11h2"/></svg>example-model-v1</span>'
  + '<span class="spacer"></span>'
  + '<button type="button" class="control" aria-label="Add">' + PLUS + '</button>'
  + '<button type="button" class="control send" aria-label="Send">' + ARROW + '</button>'
  + '</div>'
  + '<div class="footer">' + stats + ring + '</div>'

/* Measure the rendered band: the pills' figure size, the meter's with the rule
   installed, and the meter's with the rule's tag disabled — the three numbers
   that say the shot shows the repair and not a coincidence. */
const pillButton = document.querySelector('[data-composer-stats] button[aria-haspopup="dialog"]')
const trigger = document.querySelector('[data-preview-meter] button[aria-haspopup="dialog"]')
const ruleTag = guardTags[0]
const ruleSelector = (ruleTag.textContent || '').split('{')[0]

const withRule = getComputedStyle(trigger).fontSize
ruleTag.disabled = true
const withoutRule = getComputedStyle(trigger).fontSize
ruleTag.disabled = false

document.documentElement.dataset.renderCheck = encodeURIComponent(JSON.stringify({
  pill: getComputedStyle(pillButton).fontSize,
  meter: withRule,
  meterWithoutRule: withoutRule,
  percent: F.percent,
  reading: F.reading,
  usedTokens: F.used,
  contextWindow: F.contextWindow,
  ruleSelector: ruleSelector,
  selectorMatchesTrigger: trigger.matches(ruleSelector),
  selectorMatchesPill: pillButton.matches(ruleSelector),
  guardTags: guardTags.length,
}))
window.__ready = true
</script>
</body></html>`
}

/**
 * Chrome flags shared by both headless invocations.
 *
 * `--user-data-dir` points at the preview directory on purpose: a headless
 * Chrome otherwise reaches for the machine's real browser profile, and this
 * harness must not read a user's chrome. `--no-sandbox` is what lets the
 * browser start where the GPU process cannot be isolated.
 *
 * @param profileDir - directory to use as the throwaway browser profile.
 * @returns the flags, in order.
 */
function chromeFlags(profileDir) {
  return [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-crash-reporter',
    '--hide-scrollbars',
    `--user-data-dir=${profileDir}`,
  ]
}

/** Run the screenshot through headless Chrome. */
function screenshot(chrome, file, png, profileDir, width, height, scale) {
  execFileSync(
    chrome,
    [
      ...chromeFlags(profileDir),
      `--force-device-scale-factor=${String(scale)}`,
      `--window-size=${String(width)},${String(height)}`,
      '--virtual-time-budget=8000',
      `--screenshot=${png}`,
      `file://${file}`,
    ],
    { stdio: 'pipe' },
  )
}

/** Re-read the rendered page to check the sizes it actually painted. */
function renderCheck(chrome, file, profileDir) {
  const dom = execFileSync(
    chrome,
    [...chromeFlags(profileDir), '--virtual-time-budget=8000', '--dump-dom', `file://${file}`],
    { stdio: 'pipe', encoding: 'utf8' },
  )
  const encoded = /data-render-check="([^"]*)"/.exec(dom)?.[1]
  if (encoded === undefined) throw new Error('the page reported no render check; the footer did not paint')
  return JSON.parse(decodeURIComponent(encoded))
}

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(name)
  return index === -1 ? fallback : argv[index + 1]
}
const number = (name, fallback) => {
  const value = flag(name, undefined)
  return value === undefined ? fallback : Number(value)
}

if (argv.includes('--build') || !existsSync(bundle)) {
  console.log('building lib/client.js with `pnpm build` …')
  execFileSync('pnpm', ['build'], { cwd: packageRoot, stdio: 'inherit' })
}
if (!existsSync(bundle)) {
  console.error('lib/client.js is still missing after `pnpm build`.')
  process.exit(1)
}

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
if (chrome === undefined) {
  console.error('No Chrome-family browser found; looked at:\n  ' + CHROME_CANDIDATES.join('\n  '))
  process.exit(1)
}

const shipped = { stats: readShipped('stats'), meter: readShipped('meter') }
assertShippedMismatch(shipped)

const outDir = resolve(flag('--out', join(tmpdir(), 'dsh-context-usage-guard-preview')))
const png = resolve(flag('--png', join(outDir, 'composer-footer.png')))
// 720x160 CSS pixels at scale 2: a 1440-wide screenshot whose 12px figures are
// rendered at 24 device pixels, so the ring and the numbers stay legible.
const width = number('--width', 720)
const height = number('--height', 160)
const scale = number('--scale', 2)

// `--out` is emptied before the render, so it must not be this package.
if (outDir === packageRoot || packageRoot.startsWith(outDir + sep)) {
  console.error(`refusing to use ${outDir} as --out: it contains this package`)
  process.exit(1)
}
for (const [name, value] of [['--width', width], ['--height', height], ['--scale', scale]]) {
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name} needs a positive number, got ${String(value)}`)
    process.exit(1)
  }
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
mkdirSync(dirname(png), { recursive: true })

const file = join(outDir, 'index.html')
const profileDir = join(outDir, 'chrome-profile')
writeFileSync(file, page(shipped, figures(), readFileSync(bundle, 'utf8')))
screenshot(chrome, file, png, profileDir, width, height, scale)

const check = renderCheck(chrome, file, profileDir)
console.log(`preview html: ${file}`)
console.log(`screenshot:   ${png}`)
console.log(`render check: ${JSON.stringify(check)}`)

const failures = []
if (check.percent < 1) failures.push(`the ring reads ${check.reading}; the harness must show a non-zero reading`)
if (check.pill !== check.meter) failures.push(`the meter (${check.meter}) does not match the pills (${check.pill})`)
if (check.meterWithoutRule === check.pill) failures.push('the shipped declarations no longer differ, so the rule repairs nothing')
if (!check.selectorMatchesTrigger) failures.push('the plugin selector does not match the meter trigger')
if (check.selectorMatchesPill) failures.push('the plugin selector also matches a statistics pill')
if (failures.length > 0) {
  console.error('\nrender failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

if (argv.includes('--open')) execFileSync('open', [png])
