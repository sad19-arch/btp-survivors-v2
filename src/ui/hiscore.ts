/**
 * HI-SCORE de l'écran titre arcade (refonte « BTP Carnage »). Couche UI/impure :
 * persiste le meilleur score en localStorage (clé `btp:hiscore`). Robuste aux
 * environnements sans localStorage (SSR/test). N'affecte JAMAIS la sim.
 */
const KEY = 'btp:hiscore'

/** Meilleur score enregistré, ou 0 par défaut (valeur invalide → 0). */
export function readHiScore(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch {
    return 0
  }
}

/** Enregistre `n` comme HI-SCORE s'il est un entier positif fini. */
export function writeHiScore(n: number): void {
  try {
    if (Number.isFinite(n) && n > 0) {
      localStorage.setItem(KEY, String(Math.floor(n)))
    }
  } catch {
    // Pas de localStorage → HI-SCORE simplement non persistant.
  }
}
