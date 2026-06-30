/**
 * Helpers de rendu des sprites de personnages.
 *
 * Convention des feuilles 4×4 (comme `player_j1`) : lignes dans l'ordre
 * south / east / north / west (= bas / droite / haut / gauche), 4 frames chacune.
 */
export const SHEET_FRAMES = 4

/** Ligne de direction (0=sud/bas, 1=est/droite, 2=nord/haut, 3=ouest/gauche) depuis un vecteur. */
export function dirRow(vx: number, vy: number): number {
  if (vx === 0 && vy === 0) {
    return 0
  }
  if (Math.abs(vx) >= Math.abs(vy)) {
    return vx >= 0 ? 1 : 3
  }
  return vy >= 0 ? 0 : 2
}

/** Frame de marche (0..15) dans une feuille 4×4 selon la direction et le temps. */
export function walkFrame(row: number, timeMs: number, periodMs = 130): number {
  const col = Math.floor(timeMs / periodMs) % SHEET_FRAMES
  return row * SHEET_FRAMES + col
}

/** Frame immobile (1re colonne) pour une direction donnée. */
export function idleFrame(row: number): number {
  return row * SHEET_FRAMES
}

/** Clé de feuille de sprite pour un type d'ennemi (mapping rôles → créatures de chantier). */
export function enemySheetKey(type: string, isBoss: boolean): string | null {
  if (isBoss) {
    return 'boss'
  }
  switch (type) {
    case 'huissier':
      return 'brute'
    case 'inspecteur':
      return 'imp'
    case 'paperasse':
      return 'mudling'
    default:
      return null
  }
}
