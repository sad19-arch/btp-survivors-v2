/**
 * Utilitaires d'animation purs (aucun Math.random, aucun Date.now / new Date).
 * Le delta de temps est fourni en argument — déterministe, testable en Vitest.
 */

/**
 * Rapproche `current` de `target` d'un pas proportionnel au temps écoulé, borné :
 * ne dépasse jamais la cible, ne recule jamais si déjà à la cible.
 * `ratePerSec` = vitesse de rapprochement (fraction/seconde, défaut 6).
 * Pur et déterministe (aucun Math.random/Date — dt fourni).
 */
export function approach(current: number, target: number, dtMs: number, ratePerSec = 6): number {
  const factor = Math.min(1, ratePerSec * dtMs / 1000)
  // factor===1 : on atteint exactement la cible (évite la dérive flottante)
  if (factor >= 1) { return target }
  return current + (target - current) * factor
}
