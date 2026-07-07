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
 * Hook réactif (Task 9) : `reactiveHook` est appelé à chaque pas mais reste no-op
 * ici ; il pourra être implémenté par Task 9 sans toucher au directeur.
 */

import type { Rng } from '../rng'
import type { WavePlacement } from '../types'
import type { SpawnRampStep } from '@content/spawnRamp'
import { spawnParamsAt } from '@content/spawnRamp'
import { placeEvent, type WaveEventDef } from '@content/waveEvents'

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Point de passage du joueur (trail anti-camping, utilisé par Task 9). */
export interface TrailPoint {
  x: number
  y: number
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
    playerTrail: []
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

  // Hook réactif no-op (Task 9 implémentera la logique ici sans modifier le directeur).
  reactiveHook(state, input)

  // 2. Slot d'événement ?
  if (elapsedMs >= state.nextEventMs && state.budgetAcc >= EVENT_BUDGET_THRESHOLD) {
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

  // Filtre les events éligibles par le temps (ignore miniBoss ici — géré en T10).
  const eligible = events.filter((e) => e.kind !== 'miniBoss' && e.allowedFromSec <= elapsedSec)

  // Recalcule le nextEventMs dans tous les cas (même si aucun event éligible).
  const gap = Math.max(GAP_MIN_MS, GAP_INITIAL_MS - elapsedMs / GAP_DECAY)
  state.nextEventMs = elapsedMs + gap

  if (eligible.length === 0) {
    // Aucun event éligible : filet de secours si budget suffisant.
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

  // Count borné par le budget disponible.
  const rawCount = rng.int(chosen.countMin, chosen.countMax)
  const count = Math.min(rawCount, Math.floor(state.budgetAcc))

  if (count <= 0) {
    return []
  }

  const placements = placeEvent(chosen.kind, count, ringRadius, rng, chosen.behaviorOverride)
  state.budgetAcc -= count

  return placements
}

/**
 * Hook réactif no-op (réservé pour Task 9 — anti-camping / détection de camping).
 * Task 9 peut remplacer ce corps sans modifier `stepWaveDirector`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function reactiveHook(_state: WaveDirectorState, _input: WaveDirectorInput): void {
  // no-op en T8
}
