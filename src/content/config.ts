import type { GameMode } from '@core/types'

/**
 * Données de configuration du jeu (data-driven, pures).
 *
 * Toute valeur d'équilibrage vit ici, pas en dur dans les systèmes.
 */

/** Dimensions du monde, en pixels. */
export const WORLD = {
  width: 1600,
  height: 1200
} as const

/** Stats de base d'un joueur. */
export const PLAYER_BASE = {
  hp: 240,
  speed: 200, // px/seconde
  vigilance: 100,
  /** Rayon d'aimantation des gemmes d'XP, en px. */
  pickupRadius: 90
} as const

/** Progression XP → niveaux (porté de l'ancien jeu). */
export const PROGRESSION = {
  /** XP requise pour le 1er niveau. */
  firstThreshold: 25,
  /** Facteur multiplicatif du seuil à chaque niveau. */
  growth: 1.15,
  /** Nombre de cartes proposées à chaque montée de niveau. */
  choices: 4
} as const

/** Paramètres des pickups. */
export const PICKUP = {
  /** Vitesse d'aimantation vers le joueur, en px/seconde. */
  magnetSpeed: 420,
  /** Rayon de collecte (en plus du rayon joueur), en px. */
  collectRadius: 10,
  /**
   * Durée de vie (ms) d'une gemme d'XP non ramassée avant qu'elle disparaisse.
   * Borne l'accumulation de gemmes loin du joueur (horde). `coffre`/`heal`/
   * `magnet` n'ont PAS de durée de vie (persistants).
   */
  gemLifeMs: 20000
} as const

/**
 * Drops bonus à la mort d'un ennemi (en plus de la gemme d'XP systématique).
 * Tirés dans l'ordre via un Rng de loot dédié ; au plus un bonus par mort.
 * `heal` rend des PV, `chest` donne un lot d'XP, `magnet` aspire toutes les gemmes.
 *
 * ⚠️ DORMANT : `chance = 0` pour l'instant. Le tuning « skill récompensé » est
 * calibré à marge zéro ; tout drop actif perturbe la trajectoire déterministe et
 * fait basculer les cibles (creux HP / survie). L'infra (types, rendu, effets,
 * tests, assets) est prête ; à ACTIVER + re-tuner lors d'une passe d'équilibrage
 * dédiée (les `value` ci-dessous sont les valeurs proposées à ce moment-là).
 */
export const PICKUP_DROPS = {
  heal: { chance: 0, value: 18 },
  magnet: { chance: 0, value: 0 },
  chest: { chance: 0, value: 35 }
} as const

/** Nombre de joueurs selon le mode. */
export const MODE_PLAYER_COUNT: Record<GameMode, number> = {
  solo: 1,
  coop: 2,
  coop3: 3,
  coop4: 4
}

/**
 * Dérive le `GameMode` de boot à partir d'un nombre de joueurs (sélecteur titre).
 * Hors plage [1,4] : bornée à la valeur valide la plus proche (garde défensive).
 */
export function modeForCount(n: number): GameMode {
  const clamped = Math.min(4, Math.max(1, Math.round(n)))
  switch (clamped) {
    case 1:
      return 'solo'
    case 2:
      return 'coop'
    case 3:
      return 'coop3'
    default:
      return 'coop4'
  }
}

/**
 * Laisse souple coop (« tether ») : au-delà de ce rayon (px) autour du
 * centroïde du groupe, la composante radiale sortante de la vélocité d'un
 * joueur est annulée (pas un ressort, juste un mur souple). No-op en solo
 * (`playerCount<=1`), cf. `tetherSystem`.
 */
export const TETHER = {
  maxRadius: 450
} as const

/** Rayons de collision (px), par catégorie d'entité. */
export const HITBOX = {
  player: 16,
  enemy: 12,
  projectile: 6
} as const

/** Armes de départ du joueur (slice 1). */
export const STARTING_WEAPONS: readonly string[] = ['cloueur']

/** Capacité d'inventaire du joueur (armes / passifs simultanés). */
export const INVENTORY = { weapons: 6, passives: 6 } as const

/**
 * Paramètres de spawn (géométrie & perf). La cadence et la quantité d'ennemis
 * dans le temps vivent dans `spawnRamp.ts` (rampe data-driven) ; le mini-boss
 * à 5:00 est géré par le directeur de spawn (`simulation.ts`).
 */
export const SPAWN = {
  /** Rayon d'apparition autour du centre des joueurs (hors écran).
   *  Resserré (700→560) pour laisser moins de temps de réaction et favoriser la nasse. */
  ringRadius: 560,
  /** Plafond d'ennemis simultanés (perf). */
  maxActive: 300
} as const

/**
 * Boss de mi-parcours (PRD : apparition à 5:00). Rôle `mid` : NE déclenche PAS
 * la victoire — sa mort lâche un coffre d'évolution (cf. reap.ts) qui rend une
 * évolution atteignable EN COURS DE RUN, avant le boss final.
 */
export const MINI_BOSS = {
  /** Instant d'apparition, en ms de temps de jeu. */
  atMs: 5 * 60_000,
  /**
   * Rayon d'apparition du boss (px), plus court que l'anneau normal (560) pour le
   * faire entrer À L'ÉCRAN → le combat de climax est vu et engagé, pas un spawn
   * hors-champ que le joueur fond à distance sans le remarquer.
   */
  spawnRadius: 320
} as const

/**
 * Boss final (rôle `final`). Sa mort est la condition de victoire de la run
 * (remplace l'ancienne victoire au mini-boss de 5:00 — cf. Plan B1, split de boss).
 */
export const FINAL_BOSS = {
  /** Instant d'apparition, en ms de temps de jeu (~10:30). */
  atMs: 630_000,
  /** Rayon d'apparition du boss (px), même logique que MINI_BOSS : à l'écran. */
  spawnRadius: 320
} as const

/**
 * Ouvrier prisonnier (clin d'œil « otage à libérer »). 1 par run, position seedée
 * via un RNG dédié (n'altère pas la séquence de spawn/upgrade). Libéré par simple
 * proximité → petit soin en récompense.
 *
 * ⚠️ ÉQUILIBRAGE : `heal > 0` viole la marge zéro du tuning « skill récompensé ».
 * `heal` est volontairement modeste ; à re-vérifier via `npm run sim` et à réduire
 * si une cible bascule (cf. balance-zero-margin).
 */
export const RESCUE = {
  /** Rayon de proximité (px) pour déclencher la libération. */
  radius: 64,
  /** PV rendus au joueur libérateur (borné à maxHp). */
  heal: 40,
  /** Distance min/max du spawn au centre du monde (évite l'auto-libération au départ). */
  minDist: 360,
  maxDist: 560,
  /** Vitesse de fuite (px/s) de l'ouvrier libéré, qui part vers le bas hors écran. */
  fleeSpeed: 260
} as const

/**
 * Relève co-op : un joueur à terre (hp<=0) peut être relevé par un coéquipier
 * VIVANT qui reste à proximité en maintenant l'action. Solo : aucun coéquipier
 * possible → no-op naturel (jamais relevé, game-over identique à aujourd'hui).
 */
export const REVIVE = {
  /** Rayon de proximité (px) entre le releveur et le joueur à terre. */
  radius: 80,
  /** Temps (s) de maintien continu pour relever complètement. */
  fillSeconds: 3,
  /** Temps (s) pour que le progrès retombe à 0 une fois le maintien interrompu. */
  decaySeconds: 2,
  /** Fraction des PV max restaurés à la relève complète. */
  hpFraction: 0.5
} as const

/** Intro de run (micro-animation d'entrée du héros). Purement cosmétique. */
export const INTRO = {
  /** Durée du préambule pendant lequel la sim est gelée, en ms. */
  durationMs: 2000
} as const
