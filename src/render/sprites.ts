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

/**
 * Frame de marche adaptée au GABARIT RÉEL de la feuille.
 *
 * `walkFrame` suppose une feuille 4×4 (16 frames, 4 orientations). C'est le cas
 * du joueur et du camion. Mais TOUTES les feuilles PNJ sont MONO-LIGNE (mesuré :
 * porteur_work = 6 frames, terrassier_work = 5, geometre_trade = 8) : elles
 * portent un GESTE, pas des orientations. Sur celles-ci, `row*4+col` adresse des
 * frames inexistantes dès que le PNJ marche vers l'est (row 1 → frames 4..7) ;
 * Phaser conserve alors la frame précédente et le PNJ se FIGE en marchant.
 *
 * Ici : on lit le nombre de frames disponibles et on défile le geste sans jamais
 * sortir de la feuille. Les feuilles 4×4 gardent leur comportement d'origine.
 *
 * @param totalFrames Nombre de frames RÉEL de la feuille (hors `__BASE` Phaser).
 */
export function walkFrameOf(totalFrames: number, row: number, timeMs: number, periodMs = 130): number {
  if (totalFrames >= SHEET_FRAMES * SHEET_FRAMES) {
    return walkFrame(row, timeMs, periodMs)
  }
  const n = Math.max(1, totalFrames)
  return Math.floor(timeMs / periodMs) % n
}

/** Frame immobile (1re colonne) pour une direction donnée. */
export function idleFrame(row: number): number {
  return row * SHEET_FRAMES
}

/**
 * Frame immobile adaptée au gabarit réel (cf. `walkFrameOf`) : sur une feuille
 * mono-ligne, la seule frame « au repos » disponible est la première.
 */
export function idleFrameOf(totalFrames: number, row: number): number {
  return totalFrames >= SHEET_FRAMES * SHEET_FRAMES ? idleFrame(row) : 0
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
