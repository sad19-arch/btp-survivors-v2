/**
 * Fonctions PURES pour les PNJ d'ambiance non-hostiles (vie du chantier).
 * Aucun RNG runtime, aucun import Phaser, aucun import src/core → reproductible
 * et testable en Vitest sans DOM. Phase B2 de la feature « vie du chantier ».
 */

export const NAG_PHRASES = [
  'Arrête de glander !',
  'Va bosser !',
  "Tu n'en as pas marre de prendre des pauses ?",
  'Tu veux aller manger ?'
] as const

/** Choisit une phrase de râlerie de façon déterministe à partir d'un seed entier. */
export function pickPhrase(seed: number): string {
  const i = ((seed % NAG_PHRASES.length) + NAG_PHRASES.length) % NAG_PHRASES.length
  return NAG_PHRASES[i] ?? NAG_PHRASES[0]
}

/**
 * Errance cosmétique bornée : sinus seedés, aucun RNG runtime → reproductible.
 * - behavior 'work'   → rayon ≤ 24 px  (PNJ reste sur son poste)
 * - behavior 'patrol' → rayon ≤ 120 px (PNJ se promène dans une zone)
 */
export function ambientOffset(
  seed: number,
  elapsedMs: number,
  behavior: 'work' | 'patrol'
): { dx: number; dy: number } {
  const r = behavior === 'patrol' ? 120 : 24
  const s = seed * 0.001
  const t = elapsedMs / 1000
  // Deux fréquences déphasées par le seed → trajectoire de Lissajous douce, |offset| ≤ r.
  const dx = 0.5 * r * (Math.sin(t * 0.6 + s) + Math.sin(t * 0.23 + s * 2))
  const dy = 0.5 * r * (Math.cos(t * 0.5 + s * 1.7) + Math.sin(t * 0.31 + s))
  // Normalise pour garantir la borne r (les deux sinus ∈ [-2r·0.5, ...]).
  const m = Math.hypot(dx, dy)
  const scale = m > r ? r / m : 1
  return { dx: dx * scale, dy: dy * scale }
}

/** Renvoie true si le joueur est assez proche pour déclencher une bulle de râlerie. */
export function shouldBubble(playerDist: number): boolean {
  return playerDist <= 150
}
