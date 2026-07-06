/** Mappe une position monde vers le panneau mini-carte (clampée). PURE. */
export function worldToMinimap(
  x: number,
  y: number,
  worldW: number,
  worldH: number,
  mapW: number,
  mapH: number
): { mx: number; my: number } {
  const mx = Math.max(0, Math.min(mapW, (x / worldW) * mapW))
  const my = Math.max(0, Math.min(mapH, (y / worldH) * mapH))
  return { mx, my }
}
