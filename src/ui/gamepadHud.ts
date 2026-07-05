/**
 * Modèle pur du HUD « manettes branchées » (jusqu'à 4 joueurs en co-op local).
 * Séparé du DOM pour être testable sans navigateur : `overlay.ts` lui passe le
 * résultat de `navigator.getGamepads()` et rend les 4 pastilles + le compte.
 */

/** Nombre de slots joueurs affichés (co-op local 1-4). */
export const MAX_PADS = 4

export interface GamepadHudModel {
  /** Nombre de manettes connectées (parmi les 4 slots). */
  count: number
  /** Slot i (joueur i+1) connecté ? — toujours de longueur `MAX_PADS`. */
  slots: boolean[]
}

/**
 * Réduit la liste brute de `navigator.getGamepads()` (avec trous `null`) à 4
 * booléens + un compte. Un slot est « connecté » si la manette existe et que
 * son drapeau `connected` est vrai. Déterministe, sans effet de bord.
 */
export function gamepadHudModel(
  pads: ReadonlyArray<{ connected: boolean } | null>
): GamepadHudModel {
  const slots: boolean[] = []
  for (let i = 0; i < MAX_PADS; i++) {
    const pad = pads[i]
    slots.push(pad !== null && pad !== undefined && pad.connected)
  }
  return { count: slots.filter(Boolean).length, slots }
}
