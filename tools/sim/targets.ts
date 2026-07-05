import type { BotAggregate } from './metrics'

export interface TargetReport {
  pass: boolean
  failures: string[]
}

/**
 * Cibles « tendu ET GAGNABLE » (refonte playtest : le jeu doit pouvoir se
 * gagner). Le kite-bot est un joueur moyen (choisit toujours la 1re carte) ; un
 * humain fait mieux. On vise donc :
 *  - le kite GAGNE une part des runs (tue le boss final) — la gagnabilité est
 *    la cible n°1 (avant : 0 %, jeu injouable) ; mais PAS toujours (tension),
 *  - il atteint la fin de run sans mort punitive au tout début,
 *  - ses PV plongent (climax),
 *  - idle (immobile) meurt toujours ; greedy (imprudent) meurt le plus souvent
 *    mais un build chanceux peut occasionnellement passer (jeu gagnable ⇒ ce
 *    n'est plus « toujours mourir »).
 * Oracle final = playtest humain ; ces seuils sont un garde-fou de régression.
 */
const KITE_MIN_WIN_PCT = 12 // DOIT gagner au moins ceci (sinon jeu injouable — cible n°1)
const KITE_MAX_WIN_PCT = 65 // mais pas trivialement toujours (tension)
const KITE_MIN_SURVIVAL_MEDIAN_MS = 300000 // survie médiane ≥ 5:00 (atteint le boss de mi-parcours)
const KITE_MAX_SURVIVE_FULL_PCT = 60 // ne doit PAS survivre/gagner passivement trop souvent
const KITE_MIN_FIRST_DEATH_MS = 60000 // aucune run ne meurt avant 1:00 (départ non punitif)
const KITE_MAX_HP_DIP_PCT = 40 // les PV médians doivent plonger sous ce seuil (climax 9-11 min)
/** Greedy (imprudent) : peut survivre par chance mais pas de façon fiable. */
const GREEDY_MAX_SURVIVE_FULL_PCT = 25
/**
 * Idle (immobile) : doit mourir la GRANDE majorité du temps. Tolérance faible
 * (~8% mesuré sur le monde agrandi 3200×2400) : dans une grande arène, les
 * projectiles portent leur pleine distance (le petit monde les clampait au mur)
 * → l'auto-tir du joueur planté nettoie parfois l'anneau convergent. Reste très
 * strict (idle meurt 85%+) ; l'oracle final = playtest humain.
 */
const IDLE_MAX_SURVIVE_FULL_PCT = 15
/** Un bot non-skillé meurt, mais pas dans les toutes premières secondes. */
const UNSKILLED_MIN_DEATH_MS = 45000

export function evaluateTargets(aggs: BotAggregate[]): TargetReport {
  const byBot = new Map(aggs.map((a) => [a.bot, a]))
  const failures: string[] = []

  const kite = byBot.get('kite')
  if (kite !== undefined) {
    if (kite.survivalMsMedian < KITE_MIN_SURVIVAL_MEDIAN_MS) {
      failures.push(
        `kite: survie médiane ${Math.round(kite.survivalMsMedian / 1000)}s < ${KITE_MIN_SURVIVAL_MEDIAN_MS / 1000}s (trop fragile)`
      )
    }
    if (kite.survivedFullPct > KITE_MAX_SURVIVE_FULL_PCT) {
      failures.push(
        `kite: survie pleine ${Math.round(kite.survivedFullPct)}% > ${KITE_MAX_SURVIVE_FULL_PCT}% (trop sûr, pas assez tendu)`
      )
    }
    if (kite.survivalMsMin < KITE_MIN_FIRST_DEATH_MS) {
      failures.push(`kite: une run meurt à ${Math.round(kite.survivalMsMin / 1000)}s (< ${KITE_MIN_FIRST_DEATH_MS / 1000}s, départ trop brutal)`)
    }
    // Tension : le PV MIN par run (médiane, morts inclus) doit plonger. On mesure
    // le min-par-run et non la courbe médiane des survivants (biais de survivant :
    // les runs forts qui GAGNENT croisent haut — c'est la power fantasy voulue ;
    // le climax vient des runs qui meurent, invisibles dans la médiane-survivants).
    if (kite.minHpPctMedian >= KITE_MAX_HP_DIP_PCT) {
      failures.push(
        `kite: PV min médian ${Math.round(kite.minHpPctMedian)}% jamais sous ${KITE_MAX_HP_DIP_PCT}% — jeu trop sûr, pas de climax`
      )
    }
    // Cible n°1 : le jeu doit être GAGNABLE (le kite tue le boss final au moins parfois).
    if (kite.winPct < KITE_MIN_WIN_PCT) {
      failures.push(
        `kite: victoire ${Math.round(kite.winPct)}% < ${KITE_MIN_WIN_PCT}% (jeu non gagnable — on n'atteint/ne bat pas le boss)`
      )
    }
    if (kite.winPct > KITE_MAX_WIN_PCT) {
      failures.push(
        `kite: victoire ${Math.round(kite.winPct)}% > ${KITE_MAX_WIN_PCT}% (trop facile à gagner, plus de tension)`
      )
    }
  }

  const greedy = byBot.get('greedy')
  if (greedy !== undefined) {
    if (greedy.survivedFullPct > GREEDY_MAX_SURVIVE_FULL_PCT) {
      failures.push(`greedy: ${Math.round(greedy.survivedFullPct)}% survivent la run pleine > ${GREEDY_MAX_SURVIVE_FULL_PCT}% (l'imprudent ne doit pas passer de façon fiable)`)
    } else if (greedy.survivalMsMedian < UNSKILLED_MIN_DEATH_MS) {
      failures.push(`greedy: mort médiane ${Math.round(greedy.survivalMsMedian / 1000)}s < ${UNSKILLED_MIN_DEATH_MS / 1000}s (punitif au démarrage)`)
    }
  }

  const idle = byBot.get('idle')
  if (idle !== undefined) {
    if (idle.survivedFullPct > IDLE_MAX_SURVIVE_FULL_PCT) {
      failures.push(`idle: ${Math.round(idle.survivedFullPct)}% survivent la run pleine > ${IDLE_MAX_SURVIVE_FULL_PCT}% (immobile, trop facile)`)
    } else if (idle.survivalMsMedian < UNSKILLED_MIN_DEATH_MS) {
      failures.push(`idle: mort médiane ${Math.round(idle.survivalMsMedian / 1000)}s < ${UNSKILLED_MIN_DEATH_MS / 1000}s (punitif au démarrage)`)
    }
  }

  return { pass: failures.length === 0, failures }
}
