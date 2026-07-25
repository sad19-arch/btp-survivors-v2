import type { ViewportState } from './viewport'

const TITLE_GUARD_PX = 16
const EXPANDED_COMPOSITION = { width: 1100, height: 920 } as const
const COMPACT_COMPOSITION = { width: 840, height: 520 } as const
const EXPANDED_MIN_SAFE_HEIGHT = 640
const TITLE_ARCBAR_CLEARANCE_PX = 32

export type TitleDensity = 'expanded' | 'compact'

export interface TitleRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TitleLayout {
  density: TitleDensity
  scale: number
  composition: { width: number; height: number }
  safe: TitleRect
  rendered: { width: number; height: number }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function floor2(value: number): number {
  return Math.floor(value * 100) / 100
}

/**
 * Calcule le fit indépendant du titre. Le HUD conserve son propre `uiScale` :
 * une fenêtre basse peut donc garder un menu titre lisible sans hériter du
 * plancher à 0.5 prévu pour les barres de jeu.
 */
export function computeTitleLayout(viewport: ViewportState): TitleLayout {
  const baseSafeHeight = Math.max(0, viewport.usableH - TITLE_GUARD_PX * 2)
  const density: TitleDensity = baseSafeHeight >= EXPANDED_MIN_SAFE_HEIGHT ? 'expanded' : 'compact'
  const arcbarClearance = density === 'expanded' ? TITLE_ARCBAR_CLEARANCE_PX : 0
  const safe: TitleRect = {
    x: round2(viewport.safe.l + TITLE_GUARD_PX),
    y: round2(viewport.safe.t + TITLE_GUARD_PX + arcbarClearance),
    width: round2(Math.max(0, viewport.usableW - TITLE_GUARD_PX * 2)),
    height: round2(Math.max(0, baseSafeHeight - arcbarClearance))
  }
  const composition = density === 'expanded' ? EXPANDED_COMPOSITION : COMPACT_COMPOSITION
  const widthFit = safe.width / composition.width
  const heightFit = safe.height / composition.height
  const scale = floor2(Math.min(1, Math.max(0, Math.min(widthFit, heightFit))))

  return {
    density,
    scale,
    composition,
    safe,
    rendered: {
      width: round2(composition.width * scale),
      height: round2(composition.height * scale)
    }
  }
}
