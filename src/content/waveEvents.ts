/**
 * Événements de horde (Task 7) — formations de spawn pour le directeur de vagues.
 *
 * Module PUR et DÉTERMINISTE : toute source d'aléa passe par le `rng` fourni
 * en argument. JAMAIS Math.random / Date.now / new Date.
 *
 * Consommé par le directeur (T8). `placeEvent` n'est pas encore appelé en
 * production → `npm run sim:check` DIFF 0 attendu.
 */

import { Rng } from '@core/rng'
import type { EnemyBehavior, WavePlacement } from '@core/types'
import { ConstructionPhaseId } from '@content/phases'

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type WaveEventKind = 'converge' | 'pincer' | 'encircle' | 'burst' | 'sweep' | 'miniBoss'

export interface WaveEventDef {
  kind: WaveEventKind
  /** Poids de tirage dans le pool (entier ≥ 1). */
  weight: number
  /** Nombre minimal d'ennemis dans la formation. */
  countMin: number
  /** Nombre maximal d'ennemis dans la formation. */
  countMax: number
  /** Temps écoulé minimal (secondes) avant que cet événement soit éligible. */
  allowedFromSec: number
  /**
   * Surcharge optionnelle de comportement : si présent, chaque placement de la
   * formation utilise ce behavior au lieu du défaut du kind.
   * Reporté ici sur le WaveEventDef ; `placeEvent` l'accepte aussi en 5e arg.
   */
  behaviorOverride?: EnemyBehavior
}

// ---------------------------------------------------------------------------
// placeEvent
// ---------------------------------------------------------------------------

/**
 * Calcule les placements d'une formation de horde.
 *
 * @param kind            - Type de formation.
 * @param count           - Nombre d'ennemis à placer.
 * @param ringRadius      - Rayon de référence (px) — la position exacte peut
 *                          être mise à l'échelle par kind (ex. encircle × 0.7).
 * @param rng             - RNG déterministe (seule source d'aléa autorisée).
 * @param behaviorOverride - Surcharge optionnelle du behavior par défaut du
 *                          kind. Quand présent, TOUS les placements utilisent
 *                          ce behavior à la place du défaut.
 *
 * Comportements par défaut selon le kind (sauf `behaviorOverride`) :
 *   converge  → 'chase'
 *   pincer    → 'chase'
 *   encircle  → 'circler'
 *   burst     → 'chase'
 *   sweep     → 'sweep'
 *   miniBoss  → [] (géré par le directeur en T10, pas une formation d'ennemis)
 */
export function placeEvent(
  kind: WaveEventKind,
  count: number,
  ringRadius: number,
  rng: Rng,
  behaviorOverride?: EnemyBehavior
): WavePlacement[] {
  switch (kind) {
    case 'converge':
      return placeConverge(count, ringRadius, rng, behaviorOverride)
    case 'pincer':
      return placePincer(count, ringRadius, rng, behaviorOverride)
    case 'encircle':
      return placeEncircle(count, ringRadius, rng, behaviorOverride)
    case 'burst':
      return placeBurst(count, ringRadius, rng, behaviorOverride)
    case 'sweep':
      return placeSweep(count, ringRadius, rng, behaviorOverride)
    case 'miniBoss':
      // Formation vide : le directeur (T10) gère le spawn du mini-boss directement,
      // sans passer par une liste de placements classique.
      return []
  }
}

// ---------------------------------------------------------------------------
// Formations privées
// ---------------------------------------------------------------------------

const TWO_PI = 2 * Math.PI

/**
 * converge : `count` ennemis dans un arc ÉTROIT autour d'un angle de base.
 * Chaque ennemi est décalé de ±0.25 rad autour de `base`.
 */
function placeConverge(
  count: number,
  ringRadius: number,
  rng: Rng,
  behaviorOverride?: EnemyBehavior
): WavePlacement[] {
  const behavior: EnemyBehavior = behaviorOverride ?? 'chase'
  const base = rng.float(0, TWO_PI)
  const result: WavePlacement[] = []
  for (let i = 0; i < count; i++) {
    const angle = base + rng.float(-0.25, 0.25)
    result.push({ angle, radius: ringRadius, behavior })
  }
  return result
}

/**
 * pincer : 2 sous-groupes (~count/2 chacun) à des angles OPPOSÉS (±π).
 * Petit spread ±0.2 rad dans chaque groupe.
 */
function placePincer(
  count: number,
  ringRadius: number,
  rng: Rng,
  behaviorOverride?: EnemyBehavior
): WavePlacement[] {
  const behavior: EnemyBehavior = behaviorOverride ?? 'chase'
  const base = rng.float(0, TWO_PI)
  const result: WavePlacement[] = []
  const half = Math.floor(count / 2)
  const remainder = count - half

  // Groupe 1 : autour de `base`
  for (let i = 0; i < half; i++) {
    const angle = base + rng.float(-0.2, 0.2)
    result.push({ angle, radius: ringRadius, behavior })
  }
  // Groupe 2 : angle opposé (`base + π`)
  for (let i = 0; i < remainder; i++) {
    const angle = base + Math.PI + rng.float(-0.2, 0.2)
    result.push({ angle, radius: ringRadius, behavior })
  }
  return result
}

/**
 * encircle : `count` ennemis ÉQUIRÉPARTIS sur un anneau resserré (×0.7).
 * `bAngle` = position de l'ennemi sur l'anneau (utilisé par le comportement
 * `circler` pour dériver en orbite autour du joueur).
 */
function placeEncircle(
  count: number,
  ringRadius: number,
  rng: Rng,
  behaviorOverride?: EnemyBehavior
): WavePlacement[] {
  const behavior: EnemyBehavior = behaviorOverride ?? 'circler'
  const base = rng.float(0, TWO_PI)
  const radius = ringRadius * 0.7
  const result: WavePlacement[] = []
  for (let i = 0; i < count; i++) {
    const angle = base + i * (TWO_PI / count)
    result.push({ angle, radius, behavior, bAngle: angle })
  }
  return result
}

/**
 * burst : `count` ennemis répartis tout autour avec un jitter léger.
 * Équirépartition de base + jitter rng.float(-0.15, 0.15) sur l'angle.
 */
function placeBurst(
  count: number,
  ringRadius: number,
  rng: Rng,
  behaviorOverride?: EnemyBehavior
): WavePlacement[] {
  const behavior: EnemyBehavior = behaviorOverride ?? 'chase'
  const base = rng.float(0, TWO_PI)
  const result: WavePlacement[] = []
  for (let i = 0; i < count; i++) {
    const angle = base + i * (TWO_PI / count) + rng.float(-0.15, 0.15)
    result.push({ angle, radius: ringRadius, behavior })
  }
  return result
}

/**
 * sweep : une LIGNE de `count` ennemis positionnés du côté opposé à `dir`
 * (ils traversent toute l'arène dans la direction `dir`).
 *
 * Positionnement :
 *   - `dir` = direction de traversée (angle en rad), tiré aléatoirement.
 *   - Spawn du côté OPPOSÉ : angle de spawn = `dir + π`.
 *   - Les ennemis sont alignés PERPENDICULAIREMENT à `dir`, espacés de
 *     `2 * ringRadius / (count - 1)` (ou 0 si count = 1).
 *   - `bAngle = dir` sur tous les placements → le comportement `sweep` lit
 *     `bAngle` comme direction de déplacement (mur qui traverse).
 *
 * Note : l'`angle` d'un placement est relatif au centre de la vague (calculé
 * par `spawnGroup`) ; pour alignement perpendiculaire on positionne les
 * ennemis comme des points sur le cercle de rayon `ringRadius` autour du
 * côté opposé, en étalant sur l'arc perpendiculaire.
 */
function placeSweep(
  count: number,
  ringRadius: number,
  rng: Rng,
  behaviorOverride?: EnemyBehavior
): WavePlacement[] {
  const behavior: EnemyBehavior = behaviorOverride ?? 'sweep'
  const dir = rng.float(0, TWO_PI)
  // Le côté de spawn = opposé à `dir`
  const spawnSide = dir + Math.PI
  // Spread perpendiculaire : les ennemis s'étalent autour de `spawnSide`
  // sur un arc de ±0.4 rad (étalé linéairement si count > 1)
  const spread = 0.4
  const result: WavePlacement[] = []
  for (let i = 0; i < count; i++) {
    const offset = count === 1
      ? 0
      : -spread + (2 * spread * i) / (count - 1)
    const angle = spawnSide + offset
    result.push({ angle, radius: ringRadius, behavior, bAngle: dir })
  }
  return result
}

// ---------------------------------------------------------------------------
// EVENT_POOL_DEFAULT
// ---------------------------------------------------------------------------

/**
 * Pool générique d'événements de horde.
 *
 * Stratégie :
 *  - converge / pincer / burst : poids élevés, dispo dès le début (allowedFromSec=0)
 *    → formations simples et lisibles en début de run.
 *  - encircle : plus tard (120 s) → implique `circler`, plus menaçant.
 *  - sweep : encore plus tard (180 s) → mur qui traverse = fort.
 *  - miniBoss : présent dans le pool mais géré directement par le directeur
 *    (placeEvent renvoie [] ; le directeur l'intercepte pour spawn custom).
 */
export const EVENT_POOL_DEFAULT: readonly WaveEventDef[] = [
  {
    kind: 'converge',
    weight: 5,
    countMin: 4,
    countMax: 6,
    allowedFromSec: 0
  },
  {
    kind: 'pincer',
    weight: 4,
    countMin: 4,
    countMax: 8,
    allowedFromSec: 0
  },
  {
    kind: 'burst',
    weight: 4,
    countMin: 6,
    countMax: 10,
    allowedFromSec: 0
  },
  {
    kind: 'encircle',
    weight: 3,
    countMin: 8,
    countMax: 12,
    allowedFromSec: 120
  },
  {
    kind: 'sweep',
    weight: 3,
    countMin: 4,
    countMax: 7,
    allowedFromSec: 180
  },
  {
    kind: 'miniBoss',
    weight: 1,
    countMin: 1,
    countMax: 1,
    allowedFromSec: 300
  }
] as const

// ---------------------------------------------------------------------------
// EVENT_POOL_BY_PHASE
// ---------------------------------------------------------------------------

/**
 * Pools d'événements de horde par phase de chantier (Task 12).
 *
 * Identité de chaque phase exprimée par les POIDS et les seuils `allowedFromSec` :
 *   - Phases précoces (1-3) : formations directes (converge/pincer/burst dominants).
 *   - Phases intermédiaires (4-7) : montée progressive des formations complexes.
 *   - Phases tardives (8-10) : encircle + sweep prédominants, seuils abaissés.
 *
 * CONTRAINTE D'ÉQUILIBRAGE (critique) :
 *   `TERRAIN_VIERGE` n'est PAS dans ce map → repli sur `EVENT_POOL_DEFAULT` garanti.
 *   `npm run sim:check` ne mesure que `terrain_vierge` → baseline conservée exacte.
 *
 * Note : `miniBoss` est INERTE dans le pool (filtré par `triggerEvent`) — les
 * reapers de mi-parcours viennent du mécanisme `MID_BOSS_WAVES` dans simulation.ts.
 * On le conserve par cohérence de forme, avec un poids décoratif.
 */
export const EVENT_POOL_BY_PHASE: Partial<Record<ConstructionPhaseId, readonly WaveEventDef[]>> = {
  // terrain_vierge intentionnellement ABSENT → repli EVENT_POOL_DEFAULT
  // (garde-fou sim:check diff 0)

  // Phase 2 — Terrassement : bulldozers et tranchées, afflux frontaux par groupes
  [ConstructionPhaseId.TERRASSEMENT]: [
    { kind: 'converge', weight: 6, countMin: 4, countMax: 7, allowedFromSec: 0 },
    { kind: 'pincer',   weight: 5, countMin: 4, countMax: 8, allowedFromSec: 0 },
    { kind: 'burst',    weight: 3, countMin: 6, countMax: 10, allowedFromSec: 0 },
    { kind: 'encircle', weight: 2, countMin: 8, countMax: 12, allowedFromSec: 120 },
    { kind: 'sweep',    weight: 2, countMin: 4, countMax: 7,  allowedFromSec: 180 },
    { kind: 'miniBoss', weight: 1, countMin: 1, countMax: 1,  allowedFromSec: 300 }
  ],

  // Phase 3 — Fondations : coulages en série, vagues denses de masse
  [ConstructionPhaseId.FONDATIONS]: [
    { kind: 'burst',    weight: 6, countMin: 6, countMax: 10, allowedFromSec: 0 },
    { kind: 'converge', weight: 5, countMin: 4, countMax: 7,  allowedFromSec: 0 },
    { kind: 'pincer',   weight: 4, countMin: 4, countMax: 8,  allowedFromSec: 0 },
    { kind: 'encircle', weight: 2, countMin: 8, countMax: 12, allowedFromSec: 110 },
    { kind: 'sweep',    weight: 2, countMin: 4, countMax: 7,  allowedFromSec: 170 },
    { kind: 'miniBoss', weight: 1, countMin: 1, countMax: 1,  allowedFromSec: 300 }
  ],

  // Phase 4 — Réseaux enterrés : tranchées et gaines qui surgissent de partout
  [ConstructionPhaseId.RESEAUX_ENTERRES]: [
    { kind: 'burst',    weight: 5, countMin: 6, countMax: 10, allowedFromSec: 0 },
    { kind: 'converge', weight: 4, countMin: 4, countMax: 7,  allowedFromSec: 0 },
    { kind: 'encircle', weight: 4, countMin: 8, countMax: 12, allowedFromSec: 100 },
    { kind: 'pincer',   weight: 3, countMin: 4, countMax: 8,  allowedFromSec: 0 },
    { kind: 'sweep',    weight: 3, countMin: 4, countMax: 7,  allowedFromSec: 160 },
    { kind: 'miniBoss', weight: 1, countMin: 1, countMax: 1,  allowedFromSec: 300 }
  ],

  // Phase 5 — Gros œuvre : murs et planchers, formations encadrantes en montée
  [ConstructionPhaseId.GROS_OEUVRE]: [
    { kind: 'converge', weight: 4, countMin: 4, countMax: 7,  allowedFromSec: 0 },
    { kind: 'burst',    weight: 4, countMin: 6, countMax: 10, allowedFromSec: 0 },
    { kind: 'encircle', weight: 4, countMin: 8, countMax: 12, allowedFromSec: 90 },
    { kind: 'pincer',   weight: 3, countMin: 4, countMax: 8,  allowedFromSec: 0 },
    { kind: 'sweep',    weight: 4, countMin: 4, countMax: 7,  allowedFromSec: 150 },
    { kind: 'miniBoss', weight: 1, countMin: 1, countMax: 1,  allowedFromSec: 300 }
  ],

  // Phase 6 — Échafaudages : tubes qui tombent de haut — sweep = chute de rangées
  [ConstructionPhaseId.ECHAFAUDAGES]: [
    { kind: 'sweep',    weight: 7, countMin: 5, countMax: 8,  allowedFromSec: 90 },
    { kind: 'encircle', weight: 4, countMin: 8, countMax: 12, allowedFromSec: 80 },
    { kind: 'burst',    weight: 3, countMin: 6, countMax: 10, allowedFromSec: 0 },
    { kind: 'converge', weight: 3, countMin: 4, countMax: 7,  allowedFromSec: 0 },
    { kind: 'pincer',   weight: 2, countMin: 4, countMax: 8,  allowedFromSec: 0 },
    { kind: 'miniBoss', weight: 1, countMin: 1, countMax: 1,  allowedFromSec: 300 }
  ],

  // Phase 7 — Charpente & toiture : poutres en travers, murs qui traversent
  [ConstructionPhaseId.CHARPENTE_TOITURE]: [
    { kind: 'sweep',    weight: 6, countMin: 5, countMax: 8,  allowedFromSec: 80 },
    { kind: 'encircle', weight: 5, countMin: 8, countMax: 12, allowedFromSec: 80 },
    { kind: 'burst',    weight: 3, countMin: 6, countMax: 10, allowedFromSec: 0 },
    { kind: 'pincer',   weight: 3, countMin: 4, countMax: 8,  allowedFromSec: 0 },
    { kind: 'converge', weight: 2, countMin: 4, countMax: 7,  allowedFromSec: 0 },
    { kind: 'miniBoss', weight: 1, countMin: 1, countMax: 1,  allowedFromSec: 300 }
  ],

  // Phase 8 — Second œuvre : cloisons et gaines, cercles serrés + traversées croisées
  [ConstructionPhaseId.SECOND_OEUVRE]: [
    { kind: 'encircle', weight: 6, countMin: 8, countMax: 12, allowedFromSec: 70 },
    { kind: 'sweep',    weight: 6, countMin: 5, countMax: 8,  allowedFromSec: 70 },
    { kind: 'burst',    weight: 3, countMin: 6, countMax: 10, allowedFromSec: 0 },
    { kind: 'pincer',   weight: 2, countMin: 4, countMax: 8,  allowedFromSec: 0 },
    { kind: 'converge', weight: 2, countMin: 4, countMax: 7,  allowedFromSec: 0 },
    { kind: 'miniBoss', weight: 1, countMin: 1, countMax: 1,  allowedFromSec: 300 }
  ],

  // Phase 9 — Finitions : audit minutieux, cerclages et passages en inspection
  [ConstructionPhaseId.FINITIONS]: [
    { kind: 'encircle', weight: 7, countMin: 8, countMax: 13, allowedFromSec: 60 },
    { kind: 'sweep',    weight: 6, countMin: 5, countMax: 8,  allowedFromSec: 60 },
    { kind: 'burst',    weight: 2, countMin: 6, countMax: 10, allowedFromSec: 0 },
    { kind: 'pincer',   weight: 2, countMin: 4, countMax: 8,  allowedFromSec: 0 },
    { kind: 'converge', weight: 1, countMin: 4, countMax: 7,  allowedFromSec: 0 },
    { kind: 'miniBoss', weight: 1, countMin: 1, countMax: 1,  allowedFromSec: 300 }
  ],

  // Phase 10 — Livraison & audit : commission qui cerne + inspection en rang serrés
  [ConstructionPhaseId.LIVRAISON_AUDIT]: [
    { kind: 'encircle', weight: 8, countMin: 10, countMax: 14, allowedFromSec: 60 },
    { kind: 'sweep',    weight: 7, countMin: 5,  countMax: 8,  allowedFromSec: 60 },
    { kind: 'burst',    weight: 2, countMin: 6,  countMax: 10, allowedFromSec: 0 },
    { kind: 'pincer',   weight: 2, countMin: 4,  countMax: 8,  allowedFromSec: 0 },
    { kind: 'converge', weight: 1, countMin: 4,  countMax: 7,  allowedFromSec: 0 },
    { kind: 'miniBoss', weight: 1, countMin: 1,  countMax: 1,  allowedFromSec: 300 }
  ]
} as const

// ---------------------------------------------------------------------------
// eventPoolForPhase
// ---------------------------------------------------------------------------

/**
 * Renvoie le pool d'événements correspondant à une phase de chantier.
 *
 * Repli sur `EVENT_POOL_DEFAULT` si la phase n'a pas de pool dédié
 * (`terrain_vierge` intentionnellement absent → baseline sim:check préservée).
 */
export function eventPoolForPhase(phaseId: ConstructionPhaseId): readonly WaveEventDef[] {
  return EVENT_POOL_BY_PHASE[phaseId] ?? EVENT_POOL_DEFAULT
}
