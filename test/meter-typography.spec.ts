// @vitest-environment jsdom

/**
 * The typography rule: its value, and what it selects.
 *
 * The selector is asserted against the *markup shapes* the shipped components
 * render — the meter's ring button and the statistics pills' icon buttons — so
 * "matches the meter" and "leaves its neighbours alone" are both checked, not
 * assumed.
 *
 * @module dsh-context-usage-guard/test/meter-typography
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FOOTER_FIGURE_SIZE,
  installMeterTypography,
  METER_TYPOGRAPHY_CSS,
  METER_TRIGGER_SELECTOR,
  PLUGIN_ID,
  STYLE_TAG_ID,
} from '../src/client/meter-typography.ts'
import { shippedFigureSize } from './support/shipped-styles.ts'

/** The statistics pill the shipped `StatsPills` renders: a dialog button with a path icon. */
const STATS_PILL = `
  <div data-composer-stats="true">
    <button type="button" class="OpZ85W_pill" aria-haspopup="dialog" aria-expanded="false">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 8h12" /></svg>
      <span>Cache hit 94%</span>
    </button>
  </div>
`

/** The context meter the shipped `ContextMeter` renders: a dialog button whose icon is the ring. */
const METER = `
  <span class="y0jqnG_root">
    <button type="button" class="y0jqnG_trigger" aria-haspopup="dialog" aria-expanded="false" aria-label="30% of context used">
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <circle class="y0jqnG_track" cx="7" cy="7" r="5.5" />
        <circle class="y0jqnG_fill" cx="7" cy="7" r="5.5" stroke-dasharray="10 34.5" transform="rotate(-90 7 7)" />
      </svg>
      <span>30%</span>
    </button>
  </span>
`

/** Other dialog-opening controls that sit on or near the same line. */
const NEIGHBOURS = `
  <button type="button" class="model-trigger" aria-haspopup="menu"><span>example-model-v1</span></button>
  <button type="button" class="add-button" aria-expanded="false"><span>+</span></button>
  <button type="button" class="send" aria-label="Send"><span>Send</span></button>
`

/** Build the composer footer band from the shapes above. */
function footer(): void {
  document.body.innerHTML = `<div class="composer-dock">${STATS_PILL}${METER}${NEIGHBOURS}</div>`
}

beforeEach(() => {
  document.head.innerHTML = ''
  footer()
})

describe('the shipped declarations this rule copies and replaces', () => {
  it('renders the statistics figures one pixel below the secondary size', () => {
    expect(shippedFigureSize('stats')).toBe(`font-size:${FOOTER_FIGURE_SIZE}`)
  })

  it('renders the meter one pixel above them — the mismatch, still present upstream', () => {
    const meter = shippedFigureSize('meter')

    expect(meter).toBe('font-size:var(--dsh-content-font-size-secondary,13px)')
    expect(meter).not.toBe(shippedFigureSize('stats'))
  })

  it('states the size the statistics prove, so the two cannot drift apart', () => {
    expect(METER_TYPOGRAPHY_CSS).toBe(`${METER_TRIGGER_SELECTOR}{${shippedFigureSize('stats')}}`)
  })
})

describe('the selector', () => {
  it('matches the meter trigger', () => {
    const trigger = document.querySelector('button[aria-label="30% of context used"]')
    expect(trigger).not.toBeNull()
    expect(trigger!.matches(METER_TRIGGER_SELECTOR)).toBe(true)
  })

  it('leaves the statistics pills, whose icons are paths, alone', () => {
    const pill = document.querySelector('button.OpZ85W_pill')
    expect(pill).not.toBeNull()
    expect(pill!.matches(METER_TRIGGER_SELECTOR)).toBe(false)
  })

  it('leaves the other controls on the line alone', () => {
    const others = [...document.querySelectorAll('.composer-dock button')]
      .filter((button) => button.getAttribute('aria-label') !== '30% of context used' && !button.classList.contains('OpZ85W_pill'))
    expect(others).toHaveLength(3)
    for (const button of others) expect(button.matches(METER_TRIGGER_SELECTOR)).toBe(false)
  })
})

describe('installMeterTypography', () => {
  it('injects one self-tagged stylesheet carrying the rule', () => {
    installMeterTypography(document)

    const tags = [...document.head.querySelectorAll('style')]
    expect(tags).toHaveLength(1)
    expect(tags[0]!.getAttribute('data-plugin')).toBe(PLUGIN_ID)
    expect(tags[0]!.getAttribute('data-plugin-css')).toBe(STYLE_TAG_ID)
    expect(tags[0]!.textContent).toBe(METER_TYPOGRAPHY_CSS)
  })

  it('adopts an existing tag instead of stacking a second one', () => {
    installMeterTypography(document)
    installMeterTypography(document)

    expect(document.head.querySelectorAll('style')).toHaveLength(1)
  })

  it('hands back a disposer that removes the tag', () => {
    const dispose = installMeterTypography(document)
    expect(document.head.querySelectorAll('style')).toHaveLength(1)

    dispose()
    expect(document.head.querySelectorAll('style')).toHaveLength(0)
  })
})

describe('the browser half', () => {
  it('installs the rule on materialization and registers its removal', async () => {
    vi.resetModules()
    const effects: Array<() => void> = []
    const ctx = {
      effect(callback: () => (() => void) | void) {
        const dispose = callback()
        if (typeof dispose === 'function') effects.push(dispose)
        return () => {}
      },
    }

    const client = await import('../src/client/index.ts')
    client.apply(ctx)

    expect(document.head.querySelectorAll('style')).toHaveLength(1)
    expect(effects).toHaveLength(1)

    effects[0]!()
    expect(document.head.querySelectorAll('style')).toHaveLength(0)
  })

  it('never lets a mounting failure reach the shell', async () => {
    vi.resetModules()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = {
      effect() {
        throw new Error('no effect scope')
      },
    }

    const client = await import('../src/client/index.ts')
    expect(() => client.apply(ctx)).not.toThrow()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('meter typography rule could not be installed'),
      expect.any(Error),
    )
    warn.mockRestore()
  })
})