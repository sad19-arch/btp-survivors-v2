import { describe, expect, it } from 'vitest'
import { computeTitleLayout } from '@ui/titleLayout'
import type { ViewportState } from '@ui/viewport'

function viewport(overrides: Partial<ViewportState> = {}): ViewportState {
  return {
    availW: 1920,
    availH: 1080,
    usableW: 1920,
    usableH: 1080,
    aspect: 1.78,
    orientation: 'landscape',
    safe: { t: 0, r: 0, b: 0, l: 0 },
    inputType: 'pointer',
    dpr: 1,
    fullscreen: false,
    narrow: false,
    uiMobile: false,
    cameraZoom: 1.2,
    uiScale: 1,
    controlReserves: { stick: { x: 0, y: 0, w: 1056, h: 1080 } },
    ...overrides
  }
}

describe('computeTitleLayout', () => {
  it('uses the expanded composition at desktop scale without coupling to the HUD scale', () => {
    const layout = computeTitleLayout(viewport({ uiScale: 0.5 }))

    expect(layout.density).toBe('expanded')
    expect(layout.scale).toBe(1)
    expect(layout.composition).toEqual({ width: 1100, height: 920 })
    expect(layout.safe).toEqual({ x: 16, y: 48, width: 1888, height: 1016 })
  })

  it('switches to compact for a short landscape viewport and fits inside its safe area', () => {
    const layout = computeTitleLayout(viewport({
      availW: 667,
      availH: 375,
      usableW: 667,
      usableH: 375,
      aspect: 1.78,
      orientation: 'landscape',
      uiMobile: true
    }))

    expect(layout.density).toBe('compact')
    expect(layout.composition).toEqual({ width: 840, height: 520 })
    expect(layout.scale).toBe(0.65)
    expect(layout.rendered.width).toBeLessThanOrEqual(layout.safe.width)
    expect(layout.rendered.height).toBeLessThanOrEqual(layout.safe.height)
  })

  it('keeps the title inside visual safe areas with a 16px guard margin', () => {
    const layout = computeTitleLayout(viewport({
      availW: 915,
      availH: 412,
      usableW: 855,
      usableH: 372,
      safe: { t: 12, r: 24, b: 28, l: 36 },
      uiMobile: true
    }))

    expect(layout.safe).toEqual({ x: 52, y: 28, width: 823, height: 340 })
    expect(layout.rendered.width).toBeLessThanOrEqual(823)
    expect(layout.rendered.height).toBeLessThanOrEqual(340)
  })

  it('does not apply the HUD 0.5 scale floor and rounds stable layout values', () => {
    const layout = computeTitleLayout(viewport({
      availW: 480,
      availH: 260,
      usableW: 480,
      usableH: 260,
      aspect: 1.85,
      orientation: 'landscape',
      uiMobile: true
    }))

    expect(layout.scale).toBeLessThan(0.5)
    expect(layout.scale).toBe(Math.round(layout.scale * 100) / 100)
  })
})
