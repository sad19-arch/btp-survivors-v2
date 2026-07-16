/**
 * Phrases de VICTOIRE affichées dans l'écran « Rapport de chantier ».
 * Pendant festif de `deathQuotes` : là où la défaite moque, la victoire félicite.
 *
 * Data PURE — aucun Math.random(), Date.now() ici. Le roll est fourni par
 * l'appelant (issu du Rng à seed). Sélection déterministe garantie.
 */

/** Phrase de gloire : chantier livré SANS avoir été mis à terre une seule fois. */
export const FLAWLESS_VICTORY_QUOTE = 'Livré sans une égratignure. Les normes, c’est toi qui les écris maintenant.'

/** Pool de félicitations (chantier livré). */
export const VICTORY_QUOTES: readonly string[] = [
  'Chantier livré, dans les règles de l’art. Le contremaître n’a rien à redire.',
  'Réception des travaux : conforme. Signé, tamponné, encadré.',
  'Tu as bétonné la concurrence. Le chantier est à toi.',
  'Livraison dans les temps. Quelque part, un chef de projet pleure de joie.',
  'Aucune réserve à la livraison. Du jamais vu sur ce chantier.',
  'Le permis était pour construire. Tu en as fait une démonstration.',
  'Les inspections sont passées. Elles ne repasseront pas.',
  'Zéro non-conformité. Le bureau d’études va encadrer ton rapport.',
  'Tu es arrivé avec un casque. Tu repars avec le chantier.',
  'Mission accomplie : le béton a pris, les nuisibles non.',
  'Le chantier est sécurisé. Va boire un café, tu l’as mérité.',
  'Livré. La prochaine phase peut commencer — elle t’attend déjà.',
]

/**
 * Sélectionne une phrase de victoire de façon déterministe.
 * @param roll - Aléa dans [0, 1) fourni par l'appelant (Rng à seed / composition root).
 * @param flawless - Vrai si aucun joueur n'est tombé → phrase de gloire dédiée.
 */
export function selectVictoryQuote({ roll, flawless = false }: { roll: number; flawless?: boolean }): string {
  if (flawless) {
    return FLAWLESS_VICTORY_QUOTE
  }
  const n = VICTORY_QUOTES.length
  if (n === 0) {
    return ''
  }
  const i = Math.min(n - 1, Math.max(0, Math.floor(roll * n)))
  return VICTORY_QUOTES[i] ?? ''
}
