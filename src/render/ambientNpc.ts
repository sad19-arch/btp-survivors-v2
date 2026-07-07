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
 * - behavior 'work'   → rayon ≤ 110 px (PNJ déambule sur son chantier, trajet lent)
 * - behavior 'patrol' → rayon ≤ 120 px (PNJ se promène dans une zone)
 *
 * Lissajous à 2 fréquences lentes (0.07 + 0.19 Hz ≈ 5–14 s par demi-tour) pour
 * un chemin « déambulatoire » doux : le PNJ circule visiblement sans paraître
 * erratique ni menaçant.
 */
export function ambientOffset(
  seed: number,
  elapsedMs: number,
  behavior: 'work' | 'patrol'
): { dx: number; dy: number } {
  const r = behavior === 'patrol' ? 120 : 100
  const s = seed * 0.001
  const t = elapsedMs / 1000
  // 'work' : fréquences plus lentes (0.07 + 0.19 rad/s) → parcours large et lent.
  // 'patrol' : fréquences légèrement plus rapides (reprend l'ancien 'work').
  const [fx1, fx2, fy1, fy2] =
    behavior === 'work'
      ? [0.07, 0.19, 0.11, 0.13]
      : [0.6, 0.23, 0.5, 0.31]
  const dx = 0.5 * r * (Math.sin(t * fx1 + s) + Math.sin(t * fx2 + s * 2))
  const dy = 0.5 * r * (Math.cos(t * fy1 + s * 1.7) + Math.sin(t * fy2 + s))
  // Normalise pour garantir la borne r (les deux sinus ∈ [-2r·0.5, ...]).
  const m = Math.hypot(dx, dy)
  const scale = m > r ? r / m : 1
  return { dx: dx * scale, dy: dy * scale }
}

/** Renvoie true si le joueur est assez proche pour déclencher une bulle de râlerie. */
export function shouldBubble(playerDist: number): boolean {
  return playerDist <= 150
}
