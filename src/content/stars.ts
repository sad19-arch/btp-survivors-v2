/** Note de fin de stage : 0 à 3 étoiles. */
export type StarRating = 0 | 1 | 2 | 3

/** Nombre d'emplacements affichés (toujours 3, même à 0 étoile). */
export const STAR_SLOTS = 3

export interface StarInputs {
  /** Le stage a été terminé (boss final battu). Seule une victoire ouvre la notation. */
  victory: boolean
  /** Au moins une arme évoluée pendant la run (n'importe quel joueur en co-op). */
  evolvedAny: boolean
  /** Les 5 prisonniers libérés (compteur d'équipe). */
  rescuedAll: boolean
}

/**
 * Étoiles **cumulatives strictes** : chaque palier ajoute une exigence aux
 * précédentes, il n'y a pas de raccourci.
 *
 * - 0 ★ : chantier non terminé
 * - 1 ★ : chantier terminé
 * - 2 ★ : terminé **et** au moins une arme évoluée
 * - 3 ★ : terminé, une arme évoluée **et** les 5 prisonniers libérés
 *
 * Conséquence assumée : finir avec les 5 prisonniers mais sans aucune évolution
 * donne 2 ★, pas 3 — l'évolution reste un prérequis du sans-faute.
 *
 * Prend un booléen `victory` plutôt que le `RunOutcome` de la couche App : le
 * flux de dépendances va `app → content`, jamais l'inverse.
 *
 * Pur et déterministe : aucune horloge, aucun aléa. La note est une lecture de
 * la run, jamais un tirage.
 */
export function computeStars({ victory, evolvedAny, rescuedAll }: StarInputs): StarRating {
  if (!victory) {
    return 0
  }
  if (!evolvedAny) {
    return 1
  }
  return rescuedAll ? 3 : 2
}
