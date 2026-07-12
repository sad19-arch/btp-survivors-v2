import { describe, it, expect } from 'vitest'
import {
  computeViewport,
  viewportStatesEqual,
  DESKTOP_ZOOM,
  TOUCH_ZOOM_MIN,
  TOUCH_ZOOM_MAX,
  REF_HALF_DIAG,
  type RawViewportInputs
} from '@ui/viewport'

/** Fabrique d'entrées brutes (défauts desktop sains, surchargables). */
function raw(over: Partial<RawViewportInputs> = {}): RawViewportInputs {
  return {
    innerW: 1920,
    innerH: 1080,
    vvW: null,
    vvH: null,
    pointerCoarse: false,
    dpr: 1,
    fullscreen: false,
    safe: { t: 0, r: 0, b: 0, l: 0 },
    ...over
  }
}

describe('computeViewport — zoom caméra', () => {
  it('desktop 1920×1080 (pointer) → zoom = DESKTOP_ZOOM (1.2), parité PC stricte', () => {
    const v = computeViewport(raw())
    expect(v.inputType).toBe('pointer')
    expect(v.cameraZoom).toBe(DESKTOP_ZOOM)
  })

  it('desktop PETIT écran (pointer) → zoom RESTE 1.2 (adaptatif pointer = tâche ultérieure)', () => {
    const v = computeViewport(raw({ innerW: 1024, innerH: 640 }))
    expect(v.cameraZoom).toBe(DESKTOP_ZOOM)
  })

  it('tactile Pixel-7 (412×839) → zoom ≈ demiDiag/RÉF ≈ 0.51 (dans [min,max])', () => {
    const v = computeViewport(raw({ innerW: 412, innerH: 839, pointerCoarse: true }))
    const expected = Math.hypot(412, 839) / 2 / REF_HALF_DIAG
    expect(v.cameraZoom).toBeCloseTo(expected, 2)
    expect(v.cameraZoom).toBeGreaterThan(TOUCH_ZOOM_MIN)
    expect(v.cameraZoom).toBeLessThan(TOUCH_ZOOM_MAX)
  })

  it('tactile minuscule (320×480) → clampé au plancher de lisibilité', () => {
    const v = computeViewport(raw({ innerW: 320, innerH: 480, pointerCoarse: true }))
    expect(v.cameraZoom).toBe(TOUCH_ZOOM_MIN)
  })

  it('tablette tactile 1920×1080 → clampé au plafond (jamais plus zoomé que le desktop)', () => {
    const v = computeViewport(raw({ innerW: 1920, innerH: 1080, pointerCoarse: true }))
    expect(v.cameraZoom).toBe(TOUCH_ZOOM_MAX)
  })

  it('la diagonale visible tactile ne dépasse jamais la référence (spawns hors écran)', () => {
    // Balaye des tailles d'écran variées : halfDiag(écran)/zoom ≤ RÉF partout
    // (au plancher TOUCH_ZOOM_MIN près, où l'écran est si petit que la vue
    // reste très en-dessous de la référence de toute façon).
    const sizes: Array<[number, number]> = [
      [412, 839], [390, 844], [844, 390], [915, 412], [768, 1024], [1024, 768], [360, 640]
    ]
    for (const [w, h] of sizes) {
      const v = computeViewport(raw({ innerW: w, innerH: h, pointerCoarse: true }))
      const visibleHalfDiag = Math.hypot(w, h) / 2 / v.cameraZoom
      expect(visibleHalfDiag).toBeLessThanOrEqual(REF_HALF_DIAG + 1) // +1 : arrondi round2
    }
  })
})

describe('computeViewport — échelle HUD (--ui-scale)', () => {
  it('desktop → 1 (aucune mise à l\'échelle)', () => {
    expect(computeViewport(raw()).uiScale).toBe(1)
  })

  it('tactile 412 de large → (412−16)/720 snappé à 0.55', () => {
    const v = computeViewport(raw({ innerW: 412, innerH: 839, pointerCoarse: true }))
    expect(v.uiScale).toBe(0.55)
  })

  it('plancher 0.5 sur très petit écran', () => {
    const v = computeViewport(raw({ innerW: 320, innerH: 480, pointerCoarse: true }))
    expect(v.uiScale).toBe(0.5)
  })

  it('les safe areas réduisent la largeur UTILE donc l\'échelle', () => {
    const sans = computeViewport(raw({ innerW: 412, innerH: 839, pointerCoarse: true }))
    const avec = computeViewport(
      raw({ innerW: 412, innerH: 839, pointerCoarse: true, safe: { t: 0, r: 40, b: 0, l: 40 } })
    )
    expect(avec.uiScale).toBeLessThan(sans.uiScale)
    expect(avec.usableW).toBe(332)
  })
})

describe('computeViewport — orientation, breakpoints, visualViewport', () => {
  it('orientation portrait/paysage', () => {
    expect(computeViewport(raw({ innerW: 400, innerH: 800 })).orientation).toBe('portrait')
    expect(computeViewport(raw({ innerW: 800, innerH: 400 })).orientation).toBe('landscape')
  })

  it('narrow : < 760 vrai, ≥ 760 faux ; uiMobile = narrow OU tactile', () => {
    expect(computeViewport(raw({ innerW: 759, innerH: 900 })).narrow).toBe(true)
    expect(computeViewport(raw({ innerW: 760, innerH: 900 })).narrow).toBe(false)
    expect(computeViewport(raw({ innerW: 1920, innerH: 1080, pointerCoarse: true })).uiMobile).toBe(true)
    expect(computeViewport(raw({ innerW: 1920, innerH: 1080 })).uiMobile).toBe(false)
  })

  it('visualViewport prioritaire sur inner* quand disponible (barres navigateur)', () => {
    const v = computeViewport(raw({ innerW: 412, innerH: 915, vvW: 412, vvH: 839 }))
    expect(v.availH).toBe(839)
  })

  it('zone stick = fraction gauche de la zone utile, décalée des safe areas', () => {
    const v = computeViewport(
      raw({ innerW: 800, innerH: 400, pointerCoarse: true, safe: { t: 10, r: 0, b: 0, l: 20 } })
    )
    expect(v.controlReserves.stick.x).toBe(20)
    expect(v.controlReserves.stick.y).toBe(10)
    expect(v.controlReserves.stick.w).toBeCloseTo((800 - 20) * 0.55, 1)
  })
})

describe('computeViewport — déterminisme et idempotence', () => {
  it('mêmes entrées ⇒ états STRICTEMENT égaux (deep equal + viewportStatesEqual)', () => {
    const input = raw({ innerW: 412, innerH: 839, pointerCoarse: true, dpr: 2.63 })
    const a = computeViewport(input)
    const b = computeViewport(input)
    expect(b).toEqual(a)
    expect(viewportStatesEqual(a, b)).toBe(true)
  })

  it('viewportStatesEqual détecte un changement réel (zoom, safe, fullscreen)', () => {
    const a = computeViewport(raw())
    expect(viewportStatesEqual(a, computeViewport(raw({ innerW: 1280 })))).toBe(false)
    expect(viewportStatesEqual(a, computeViewport(raw({ fullscreen: true })))).toBe(false)
    expect(
      viewportStatesEqual(a, computeViewport(raw({ safe: { t: 5, r: 0, b: 0, l: 0 } })))
    ).toBe(false)
  })
})
