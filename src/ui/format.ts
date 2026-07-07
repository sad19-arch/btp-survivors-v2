/** Utilitaires de formatage pour l'UI (déterministes, sans dépendance locale). */

/** Formate un temps en ms vers `m:ss`. Ex. : 1 002 000 → "16:42", 42 000 → "0:42". */
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Formate un entier avec une espace fine (U+0020) comme séparateur de milliers,
 * par groupes de 3 depuis la droite. Déterministe (pas de toLocaleString).
 * Ex. : 1 248 → "1 248", 37 → "37", 1 234 567 → "1 234 567", 0 → "0".
 */
export function formatNumber(n: number): string {
  const sign = n < 0 ? '-' : ''
  const digits = Math.trunc(Math.abs(n)).toString()
  const remainder = digits.length % 3
  const parts: string[] = []

  if (remainder !== 0) {
    parts.push(digits.slice(0, remainder))
  }

  for (let i = remainder; i < digits.length; i += 3) {
    parts.push(digits.slice(i, i + 3))
  }

  return sign + parts.join(' ')
}
