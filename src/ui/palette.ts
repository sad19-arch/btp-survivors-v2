/**
 * Palette 16-bit imposée (PRD). Le cyan est un accent rare, pas une couleur
 * principale. Source unique de vérité pour toute l'UI (panneaux pixel).
 *
 * Interdits DA (rappel) : glassmorphism, gradients modernes, glow excessif,
 * coins arrondis, emojis dans l'UI.
 */
export const PALETTE = {
  contour: '#101014',
  brunSombre: '#2B2018',
  solSable: '#B78345',
  jauneSecurite: '#FFD24A',
  orangeDanger: '#E86F1F',
  rougeAlerte: '#D83B2D',
  cyanAccent: '#28B9D6',
  vertBonus: '#3DDC84',
  blanc: '#FFFFFF'
} as const

/** Équivalents numériques (Phaser) des couleurs de la palette. */
export const PALETTE_HEX = {
  contour: 0x101014,
  brunSombre: 0x2b2018,
  solSable: 0xb78345,
  jauneSecurite: 0xffd24a,
  orangeDanger: 0xe86f1f,
  rougeAlerte: 0xd83b2d,
  cyanAccent: 0x28b9d6,
  vertBonus: 0x3ddc84,
  blanc: 0xffffff
} as const
