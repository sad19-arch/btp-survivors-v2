/**
 * Monnaie MÉTA persistante (pièces d'or), stockée en localStorage — indépendante
 * de la sim (couche app/UI, comme le déblocage `goldSkin`). Sert de base à une
 * future boutique / méta-progression. Robuste aux environnements sans localStorage
 * (SSR/headless) : lecture/écriture protégées.
 */
const KEY = 'btp:metaCoins'

export function getMetaCoins(): number {
  try {
    const v = parseInt(localStorage.getItem(KEY) ?? '0', 10)
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}

/** Ajoute `n` pièces (arrondi, ignore ≤ 0) au total persistant. */
export function addMetaCoins(n: number): void {
  if (!(n > 0)) {
    return
  }
  try {
    localStorage.setItem(KEY, String(getMetaCoins() + Math.floor(n)))
  } catch {
    // no-op : pas de localStorage (test headless) → la persistance est simplement absente.
  }
}
