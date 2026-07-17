/** Issue d'une run terminée, pour le calcul de score. */
export type RunScoreOutcome = 'defeat' | 'victory'

/**
 * Entrées du calcul de score. Volontairement un type distinct de `RunReport`
 * (couche `app`) : le flux de dépendances va `app → content`, jamais l'inverse,
 * donc ce module ne peut pas importer `RunReport`. C'est à l'app d'adapter son
 * rapport vers ces champs.
 */
export interface RunScoreInput {
  /** Ennemis tués sur la run (déjà le `score` de la sim — cf. simulation.ts). */
  kills: number
  /** Temps écoulé à la fin de la run, en millisecondes. */
  elapsedMs: number
  /** Niveau atteint (joueur 1 en co-op, cf. `RunReport.level`). */
  level: number
  /** Or ramassé sur la run. */
  coins: number
  outcome: RunScoreOutcome
}

/** Points par ennemi tué. */
const KILL_WEIGHT = 10
/** Points par seconde écoulée (le temps survécu compte, pas seulement le score de kills). */
const SECOND_WEIGHT = 5
/** Points par niveau atteint (récompense la montée en puissance, pas seulement le farm). */
const LEVEL_WEIGHT = 100
/** Points par pièce d'or ramassée. */
const COIN_WEIGHT = 2
/** Multiplicateur final si le chantier a été livré (boss battu) plutôt qu'interrompu. */
const VICTORY_MULTIPLIER = 1.5

/**
 * Score de classement d'une run, distinct du `score` de la simulation (qui
 * n'est que le compteur de kills, cf. `src/core/simulation.ts`). Combine kills,
 * temps survécu, niveau et or pour que le tableau des high scores affiche une
 * vraie deuxième colonne, pas un doublon de la première.
 *
 * Pur et déterministe : aucune horloge, aucun aléa. Le score est une lecture
 * du rapport de fin de run, jamais un tirage.
 */
export function computeRunScore({ kills, elapsedMs, level, coins, outcome }: RunScoreInput): number {
  const elapsedSeconds = elapsedMs / 1000
  const base =
    kills * KILL_WEIGHT + elapsedSeconds * SECOND_WEIGHT + level * LEVEL_WEIGHT + coins * COIN_WEIGHT
  const total = outcome === 'victory' ? base * VICTORY_MULTIPLIER : base
  return Math.round(total)
}
