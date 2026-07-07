/**
 * Directeur de vagues (Task 8) — cadence accalmie ↔ événement à BUDGET CONSERVÉ.
 *
 * Module PUR et DÉTERMINISTE : toute source d'aléa passe par le `rng` fourni
 * en argument. JAMAIS Math.random / Date.now / new Date.
 *
 * Principe :
 *  - Le budget (`budgetAcc`) s'accumule au rythme de la rampe plate (`spawnParamsAt`).
 *    Sur une fenêtre donnée, la somme des placements émis ≈ ce qu'aurait émis la rampe.
 *  - En ACCALMIE (entre deux slots d'événement) un filet léger de 1 ennemi
 *    est émis quand `budgetAcc ≥ 1`, MAIS seulement si on n'est pas trop près du
 *    prochain événement (réserve pour le paquet groupé).
 *  - En ÉVÉNEMENT (`elapsedMs ≥ nextEventMs` ET `budgetAcc ≥ EVENT_BUDGET_THRESHOLD`)
 *    un `kind` pondéré est tiré parmi les events éligibles ; le count est borné par
 *    `budgetAcc` ; `nextEventMs` est décalé d'un `gap` décroissant avec le temps.
 *
 * Hook réactif (Task 9) : `reactiveHook` mesure la LONGUEUR DE CHEMIN CUMULÉE du
 * joueur sur une fenêtre glissante (`CAMPER.windowMs`). Si le joueur a peu parcouru
 * (chemin < `CAMPER.minMove`) ET le cooldown est épuisé, un encerclement de chargeurs
 * est déclenché. La métrique chemin (vs déplacement net) évite les faux positifs sur
 * un kiter serré : un joueur en cercle rapide a un long chemin, pas de pénalité.
 */

import type { Rng } from '../rng'
import type { WavePlacement } from '../types'
import type { SpawnRampStep } from '@content/spawnRamp'
import { spawnParamsAt } from '@content/spawnRamp'
import { placeEvent, type WaveEventDef, type WaveEventKind } from '@content/waveEvents'
import { CAMPER, TELEGRAPH_LEAD_MS } from '@content/config'

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Point de passage du joueur (trail anti-camping, utilisé par Task 9). */
export interface TrailPoint {
  x: number
  y: number
}

/**
 * Formation annoncée en attente de spawn (télégraphe, Task 10).
 * Produite quand une formation est décidée ; consommée quand `elapsedMs >= triggersAtMs`.
 */
export interface UpcomingFormation {
  /** Type de formation (détermine le marqueur au sol côté rendu). */
  kind: WaveEventKind
  /** Angle de référence de la formation (px, déterminé au moment de l'annonce). */
  angle: number
  /** Rayon de référence de la formation (px, déterminé au moment de l'annonce). */
  radius: number
  /** Timestamp (ms) auquel la formation spawne réellement. */
  triggersAtMs: number
  /**
   * Snapshot déterministe des paramètres de tirage (count + overrides)
   * pour reproduire exactement les placements au moment du spawn.
   */
  count: number
  behaviorOverride: WaveEventDef['behaviorOverride']
  spreadOverride: WaveEventDef['spreadOverride']
}

/** État interne du directeur de vagues (mutable, passé par référence). */
export interface WaveDirectorState {
  /** Budget accumulé (≈ nombre d'ennemis que la rampe plate aurait émis). */
  budgetAcc: number
  /** Timestamp (ms) du prochain slot d'événement. */
  nextEventMs: number
  /** Cooldown restant (ms) avant qu'un nouvel événement anti-camping puisse se déclencher. */
  camperCooldownMs: number
  /** Trail de positions du joueur (anti-camping, Task 9). */
  playerTrail: TrailPoint[]
  /**
   * Formation annoncée en attente de spawn (télégraphe, Task 10).
   * `null` quand aucune formation n'est en attente.
   * Au plus 1 simultanément (le directeur attend que la précédente spawne avant
   * d'en annoncer une autre via le slot d'événement normal).
   */
  upcoming: UpcomingFormation | null
}

// ---------------------------------------------------------------------------
// Constantes internes
// ---------------------------------------------------------------------------

/** Budget minimal requis pour déclencher un événement groupé. */
const EVENT_BUDGET_THRESHOLD = 4

/** Fraction du gap avant le prochain événement en-dessous de laquelle on ne
 *  dépense PAS en filet (on réserve le budget pour le paquet d'événement). */
const CALM_RESERVE_MS = 500

/** Gap initial (ms) entre deux événements (décroît avec le temps). */
const GAP_INITIAL_MS = 9000

/** Gap minimal (ms) entre deux événements (plancher, fin de run). */
const GAP_MIN_MS = 3500

/** Diviseur temporel pour la décroissance du gap : gap = max(GAP_MIN, GAP_INITIAL - elapsed/GAP_DECAY). */
const GAP_DECAY = 120

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Crée un état initial pour le directeur de vagues.
 * Le premier slot d'événement est fixé à `GAP_INITIAL_MS` ms (≈9 s).
 */
export function createWaveDirectorState(): WaveDirectorState {
  return {
    budgetAcc: 0,
    nextEventMs: GAP_INITIAL_MS,
    camperCooldownMs: 0,
    playerTrail: [],
    upcoming: null
  }
}

// ---------------------------------------------------------------------------
// Inputs du directeur
// ---------------------------------------------------------------------------

export interface WaveDirectorInput {
  /** Pas de temps (ms) de ce tick. */
  dtMs: number
  /** Temps écoulé depuis le début de la run (ms). */
  elapsedMs: number
  /** Centroïde courant des joueurs. */
  center: { x: number; y: number }
  /** Rampe de spawn data-driven. */
  ramp: readonly SpawnRampStep[]
  /** Pool d'événements à utiliser. */
  events: readonly WaveEventDef[]
  /** Rayon de l'anneau de spawn (px). */
  ringRadius: number
  /** RNG déterministe dédié aux vagues. */
  rng: Rng
}

// ---------------------------------------------------------------------------
// stepWaveDirector
// ---------------------------------------------------------------------------

/**
 * Avance le directeur d'un pas de temps et retourne les placements à spawner.
 *
 * Retourne un tableau vide la plupart du temps, un petit paquet lors d'un événement.
 * Le budget est conservé sur la durée (≈ ±15 % vs rampe plate sur 60 s).
 */
export function stepWaveDirector(
  state: WaveDirectorState,
  input: WaveDirectorInput
): WavePlacement[] {
  const { dtMs, elapsedMs, ramp, events, ringRadius, rng } = input

  // 1. Accumulation du budget au rythme de la rampe plate.
  const { intervalMs, countPerWave } = spawnParamsAt(ramp, elapsedMs)
  state.budgetAcc += (dtMs / intervalMs) * countPerWave

  // Décrément du cooldown anti-camping (no-op en T8, utilisé en T9).
  if (state.camperCooldownMs > 0) {
    state.camperCooldownMs = Math.max(0, state.camperCooldownMs - dtMs)
  }

  // 1b. Télégraphe (Task 10) : si une formation est annoncée et que son échéance
  //     est atteinte, on la matérialise maintenant (spawne les placements).
  //     On le fait AVANT l'anti-camping pour que la formation annoncée ait la
  //     priorité sur un encerclement réactif ce même pas.
  if (state.upcoming !== null && elapsedMs >= state.upcoming.triggersAtMs) {
    const u = state.upcoming
    state.upcoming = null
    const placements = placeEvent(u.kind, u.count, u.radius, rng, u.behaviorOverride, u.spreadOverride)
    return placements
  }

  // Hook réactif (Task 9) : anti-camping. Retourne des placements si déclenché.
  // Immédiat (pas de télégraphe) — le hook est une punition réactive, pas une
  // formation prévisible.
  const reactive = reactiveHook(state, input)
  if (reactive.length > 0) {
    // Garde-fou : priorité à l'anti-camping — on saute le slot normal ce pas.
    return reactive
  }

  // 2. Slot d'événement ? On ne déclenche PAS si une formation est déjà en attente
  //    (au plus 1 upcoming à la fois — pas de file d'attente).
  if (
    state.upcoming === null &&
    elapsedMs >= state.nextEventMs &&
    state.budgetAcc >= EVENT_BUDGET_THRESHOLD
  ) {
    return triggerEvent(state, elapsedMs, events, ringRadius, rng)
  }

  // 3. Filet d'accalmie : 1 ennemi si le budget le permet ET on n'est pas trop
  //    près du prochain événement (réserve pour le paquet groupé).
  if (state.budgetAcc >= 1 && elapsedMs < state.nextEventMs - CALM_RESERVE_MS) {
    state.budgetAcc -= 1
    // Un placement chase simple à angle aléatoire.
    const angle = rng.float(0, 2 * Math.PI)
    return [{ angle, radius: ringRadius, behavior: 'chase' }]
  }

  return []
}

// ---------------------------------------------------------------------------
// Helpers privés
// ---------------------------------------------------------------------------

/**
 * Déclenche un événement groupé :
 *  - Filtre les events éligibles (`allowedFromSec ≤ elapsedMs/1000`).
 *  - Tire un `kind` pondéré.
 *  - Calcule `count` borné par `budgetAcc`.
 *  - Appelle `placeEvent` pour obtenir les placements.
 *  - Décrémente `budgetAcc` et programme `nextEventMs`.
 */
function triggerEvent(
  state: WaveDirectorState,
  elapsedMs: number,
  events: readonly WaveEventDef[],
  ringRadius: number,
  rng: Rng
): WavePlacement[] {
  const elapsedSec = elapsedMs / 1000

  // Filtre les events éligibles par le temps (ignore miniBoss ici — géré par la sim).
  const eligible = events.filter((e) => e.kind !== 'miniBoss' && e.allowedFromSec <= elapsedSec)

  // Recalcule le nextEventMs dans tous les cas (même si aucun event éligible).
  const gap = Math.max(GAP_MIN_MS, GAP_INITIAL_MS - elapsedMs / GAP_DECAY)
  state.nextEventMs = elapsedMs + gap

  if (eligible.length === 0) {
    // Aucun event éligible : filet de secours IMMÉDIAT (pas de télégraphe).
    if (state.budgetAcc >= 1) {
      state.budgetAcc -= 1
      const angle = rng.float(0, 2 * Math.PI)
      return [{ angle, radius: ringRadius, behavior: 'chase' }]
    }
    return []
  }

  // Tirage pondéré.
  let totalWeight = 0
  for (const e of eligible) {
    totalWeight += e.weight
  }
  const roll = rng.float(0, totalWeight)
  let acc = 0
  let chosen = eligible[0]
  for (const e of eligible) {
    acc += e.weight
    if (roll < acc) {
      chosen = e
      break
    }
  }

  if (chosen === undefined) {
    return []
  }

  // Count borné par le budget disponible — tiré maintenant (déterministe).
  const rawCount = rng.int(chosen.countMin, chosen.countMax)
  const count = Math.min(rawCount, Math.floor(state.budgetAcc))

  if (count <= 0) {
    return []
  }

  // Angle de référence de la formation — tiré maintenant via _waveRng (déterministe).
  // Ce tirage AVANCE le RNG de la même façon que le ferait `placeEvent` pour son
  // premier rng.float : les formations qui tirent un `base` en premier appel (converge,
  // pincer, encircle, burst, spiral, concentric) consomment exactement 1 float ici
  // → même séquence RNG qu'avant l'introduction du télégraphe.
  const angle = rng.float(0, 2 * Math.PI)

  // Consomme le budget immédiatement (le budget reste conservé dans le temps).
  state.budgetAcc -= count

  // ANNONCER la formation (télégraphe) : stockage dans `upcoming`.
  // `placeEvent` sera appelé UNIQUEMENT quand `elapsedMs >= triggersAtMs`
  // dans le prochain pas de `stepWaveDirector` qui satisfera la condition.
  // On passe `angle` et `radius` pour que le rendu puisse dessiner le marqueur au sol
  // dès maintenant, AVANT que les ennemis apparaissent.
  state.upcoming = {
    kind: chosen.kind,
    angle,
    radius: ringRadius,
    triggersAtMs: elapsedMs + TELEGRAPH_LEAD_MS,
    count,
    behaviorOverride: chosen.behaviorOverride,
    spreadOverride: chosen.spreadOverride
  }

  // Ce pas-ci : aucun placement (la formation est annoncée, pas encore spawnée).
  return []
}

/**
 * Hook réactif anti-camping (Task 9).
 *
 * Échantillonne la position du joueur dans `state.playerTrail` (fenêtre glissante
 * de `CAMPER.windowMs` ms). Quand la fenêtre est pleine ET la LONGUEUR DE CHEMIN
 * CUMULÉE sur la fenêtre est inférieure à `CAMPER.minMove` ET le cooldown est
 * épuisé, force un encerclement de chargeurs qui oblige le joueur à bouger.
 *
 * Métrique = longueur de chemin (somme des déplacements pas-à-pas), PAS le
 * déplacement net. Un kiter qui tourne en cercle a un long chemin → pas de
 * pénalité même si sa position revient près du point de départ.
 *
 * Retourne un tableau vide (pas de déclenchement) ou les placements agressifs.
 * `stepWaveDirector` utilisera ce retour et court-circuitera le slot normal.
 */
function reactiveHook(state: WaveDirectorState, input: WaveDirectorInput): WavePlacement[] {
  const { dtMs, center, ringRadius, rng } = input

  // Calcule le nombre maximal de samples pour couvrir la fenêtre.
  const maxSamples = Math.ceil(CAMPER.windowMs / dtMs)

  // Pousse la position courante dans le trail.
  state.playerTrail.push({ x: center.x, y: center.y })

  // Retire les samples excédentaires (glissement de fenêtre).
  while (state.playerTrail.length > maxSamples) {
    state.playerTrail.shift()
  }

  // Le trail doit être PLEIN (fenêtre complète écoulée) avant de mesurer.
  if (state.playerTrail.length < maxSamples) {
    return []
  }

  // Vérifie le cooldown.
  if (state.camperCooldownMs > 0) {
    return []
  }

  // Longueur de chemin cumulée : somme des déplacements pas-à-pas sur la fenêtre.
  // Évite les faux positifs sur un kiter en cercle serré (déplacement net faible
  // mais chemin long → pas campeur).
  let pathLength = 0
  for (let i = 1; i < state.playerTrail.length; i++) {
    const a = state.playerTrail[i - 1]
    const b = state.playerTrail[i]
    if (a === undefined || b === undefined) {
      continue
    }
    const ddx = b.x - a.x
    const ddy = b.y - a.y
    pathLength += Math.sqrt(ddx * ddx + ddy * ddy)
  }

  // Campeur = a peu parcouru sur la fenêtre.
  if (pathLength >= CAMPER.minMove) {
    // Le joueur bouge suffisamment — pas de punition.
    return []
  }

  // Déclenchement : encerclement de chargeurs.
  // Count = plancher garanti (8), éventuellement complété par budgetAcc disponible.
  // Math.max(MIN_COUNT, …) est superflu car budgetAcc ≥ 0 → le min est MIN_COUNT.
  const MIN_COUNT = 8
  const count = Math.min(MIN_COUNT + Math.floor(state.budgetAcc), 12)
  // On ne consomme PAS le budgetAcc pour cet événement agressif (budget hors-cycle).

  // Pose le cooldown avant de construire les placements (déterministe : même ordre
  // d'appels rng quel que soit le chemin).
  state.camperCooldownMs = CAMPER.cooldownMs

  return placeEvent('encircle', count, ringRadius, rng, 'charger')
}
