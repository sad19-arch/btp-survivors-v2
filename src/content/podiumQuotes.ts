/**
 * Répliques du PODIUM de fin de run (co-op) : félicitations au meilleur tueur,
 * pique au dernier. Pendant « social » de `victoryQuotes` / `deathQuotes` :
 * là où celles-ci jugent la run, celles-ci jugent les joueurs entre eux.
 *
 * Data PURE — aucun Math.random(), Date.now() ici. Le roll est fourni par
 * l'appelant (composition root), comme pour les autres pools de phrases.
 *
 * Ton : la moquerie vise le SCORE, jamais le joueur. On charrie un collègue au
 * comptoir, on ne l'humilie pas — c'est un jeu de canapé, la personne moquée est
 * assise à côté.
 */

/** Félicitations au joueur ayant le plus de kills. */
export const PRAISE_QUOTES: readonly string[] = [
  'Machine à démolir. Le chantier te doit une prime.',
  'Meilleur rendement du chantier. Les autres ont regardé.',
  'À lui seul une équipe complète. Syndicat prévenu.',
  'Rendement hors normes. Le bureau d’études enquête.',
  'Chef de chantier autoproclamé — et personne ne conteste.',
  'Il est venu, il a vu, il a facturé.',
]

/** Pique (gentille) au joueur ayant le moins de kills. */
export const MOCK_QUOTES: readonly string[] = [
  'A surtout sécurisé le périmètre. De très loin.',
  'Était en pause syndicale. Toute la partie.',
  'A tenu la lampe. Consciencieusement.',
  'Présent sur la feuille de pointage. C’est déjà ça.',
  'A supervisé. C’est un métier aussi.',
  'Payé à l’heure, visiblement.',
]

/**
 * Sélectionne la félicitation du meilleur tueur, de façon déterministe.
 * @param roll - Aléa dans [0, 1) fourni par l'appelant.
 */
export function selectPraiseQuote({ roll }: { roll: number }): string {
  return pick(PRAISE_QUOTES, roll)
}

/**
 * Sélectionne la pique du dernier, de façon déterministe.
 * @param roll - Aléa dans [0, 1) fourni par l'appelant.
 */
export function selectMockQuote({ roll }: { roll: number }): string {
  return pick(MOCK_QUOTES, roll)
}

/** Indexe un pool par un roll [0,1), borné aux extrémités (roll=1 → dernier). */
function pick(pool: readonly string[], roll: number): string {
  const n = pool.length
  if (n === 0) {
    return ''
  }
  const i = Math.min(n - 1, Math.max(0, Math.floor(roll * n)))
  return pool[i] ?? ''
}
