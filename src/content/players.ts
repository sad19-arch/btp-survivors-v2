/**
 * Identité couleur par joueur (co-op local). Pur — pas de Phaser/DOM. Réutilisé
 * par `src/ui` (HUD) et plus tard `src/render` (tint des sprites, T3/T7).
 */
export interface PlayerColor {
  hex: string
  num: number
  name: string
}

/** Table concrète (1..4 garantis) — sert de source pour le fallback typé sans `undefined`. */
const TABLE = {
  1: { hex: '#4aa3ff', num: 0x4aa3ff, name: 'Bleu' },
  2: { hex: '#ff5a5a', num: 0xff5a5a, name: 'Rouge' },
  3: { hex: '#5ad25a', num: 0x5ad25a, name: 'Vert' },
  4: { hex: '#ffa64a', num: 0xffa64a, name: 'Orange' }
} as const satisfies Record<1 | 2 | 3 | 4, PlayerColor>

/** Couleurs 16-bit saturées, une par joueur (jusqu'à 4 en co-op local). */
export const PLAYER_COLORS: Readonly<Record<number, PlayerColor>> = TABLE

const FALLBACK: PlayerColor = TABLE[1]

/** Couleur du joueur `id` ; replie sur le joueur 1 si `id` est hors table (jamais d'`undefined`). */
export function playerColor(id: number): PlayerColor {
  return PLAYER_COLORS[id] ?? FALLBACK
}
