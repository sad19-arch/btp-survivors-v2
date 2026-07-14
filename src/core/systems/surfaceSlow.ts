import type { SurfaceSlowZone } from '../siteLayout'

/** Retourne le ralentissement le plus fort parmi les surfaces contenant le point. */
export function surfaceSlowMultiplierAt(
  x: number,
  y: number,
  zones: readonly SurfaceSlowZone[]
): number {
  let multiplier = 1
  for (const zone of zones) {
    const dx = x - zone.x
    const dy = y - zone.y
    if (dx * dx + dy * dy <= zone.radius * zone.radius) {
      multiplier = Math.min(multiplier, zone.multiplier)
    }
  }
  return multiplier
}
