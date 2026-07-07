import type { GameMode } from '@core/types'

/**
 * Données de configuration du jeu (data-driven, pures).
 *
 * Toute valeur d'équilibrage vit ici, pas en dur dans les systèmes.
 */

/**
 * Dimensions du monde, en pixels. Monde ×10 la surface de la base (1024×768) :
 * agrandi à 10240×7680 pour une zone explorable vaste (playtest « une map dix
 * fois plus grande »). Coût per-frame CONSTANT quelle que soit la taille :
 *  - Sol : un TileSprite GPU (O(1), 1 objet) ;
 *  - Décalques + props : streamés par chunks de 1024 px autour de la caméra
 *    (DecorStreamer, `src/render/decorStreamer.ts`) — seuls ~16 chunks sont
 *    chargés simultanément, les autres sont détruits → coût borné ;
 *  - Ennemis : spawnés en anneau AUTOUR du joueur, indépendant de la taille.
 * Plus d'espace pour manœuvrer, horde inchangée.
 * Multiples de 1024 (taille de chunk) pour un alignement propre des chunks.
 */
export const WORLD = {
  width: 10240,
  height: 7680
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

/**
 * Directeur de coffres d'évolution.
 *
 * Contrôle l'économie de coffres : apparition périodique + drop sur mort d'élite.
 * Plafon `maxActive` garantit que jamais plus de N coffres ne coexistent.
 *
 * Ces valeurs sont tunables séparément de `PICKUP_DROPS` (coffres d'évolution,
 * pas simples bonus de loot) — la décision est déterministe via un RNG dédié.
 */
export const CHEST = {
  /** Intervalle (ms) entre deux apparitions périodiques de coffre. */
  intervalMs: 55000,
  /** Probabilité qu'un ennemi élite lâche un coffre à sa mort (0..1). */
  eliteDropChance: 0.35,
  /** Nombre maximum de coffres actifs simultanément (inclut le coffre mini-boss). */
  maxActive: 5,
  /** Rayon d'apparition (px) autour du joueur vivant le plus proche. */
  spawnRadius: 260,
  /**
   * Soin de repli si aucune évolution ET aucune carte éligible (tout maxé).
   * Fraction de maxHp rendue. Ex : 0.30 → +30 % des PV max, borné à maxHp.
   */
  fallbackHealPct: 0.30,
  /**
   * Gemmes d'XP à faire apparaître si les PV sont déjà au max (repli ultime).
   * Actuellement non utilisé (soin brut toujours appliqué, même sur PV pleins).
   * Conservé pour extension future sans churn.
   */
  fallbackGems: 0
} as const

/** Nombre de joueurs selon le mode. */
export const MODE_PLAYER_COUNT: Record<GameMode, number> = {
  solo: 1,
  coop: 2,
  coop3: 3,
  coop4: 4
}

/**
 * Facteur de renforcement des PV ennemis/boss par joueur supplémentaire (co-op).
 * `coopHpFactor(n) = 1 + (n-1) * COOP_HP_K` : n=1→1.0 (solo inchangé), n=2→1.5,
 * n=3→2.0, n=4→2.5. Ne s'applique qu'aux PV (pas aux dégâts de contact ni à la
 * vitesse) — cf. Plan « Fin de CO-2 » tâche 3.
 */
export const COOP_HP_K = 0.5

/** Multiplicateur de PV à appliquer selon le nombre de joueurs (borné à 1 min). */
export function coopHpFactor(playerCount: number): number {
  return 1 + (Math.max(1, playerCount) - 1) * COOP_HP_K
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
 * Boss final (rôle `final`). Sa mort est la condition de victoire de la run
 * (remplace l'ancienne victoire au mini-boss de 5:00 — cf. Plan B1, split de boss).
 */
export const FINAL_BOSS = {
  /** Instant d'apparition, en ms de temps de jeu (~20:00 — arc long). */
  atMs: 1_200_000,
  /** Rayon d'apparition du boss (px), plus court que l'anneau normal (560) : le boss entre À L'ÉCRAN, combat vu et engagé. */
  spawnRadius: 320,
  /**
   * Multiplicateur de PV du boss FINAL (× la def `contremaitre`). La VICTOIRE
   * dépend de le tuer → battable avec un build de fin de run complet.
   * Arc 20 min : le joueur a pu évoluer 2-3 armes. PV ajusté pour viser 25-40 %
   * de win (cible sim `KITE_MIN_WIN_PCT`).
   */
  hpMult: 0.85
} as const

/**
 * Mini-boss/reapers périodiques intermédiaires (rôle `mid`). Trois paliers :
 * 5:00 / 10:00 / 15:00 — ponctuent l'arc long, laissent chacun un coffre d'évolution
 * à leur mort. La condition de victoire est UNIQUEMENT le boss FINAL à 20:00.
 *
 * `atMs` : liste des instants d'apparition en ms. Chaque palier ne spawn qu'une fois.
 * `hpMults` : scaling PV par palier (le boss de 10:00 est plus costaud que celui de 5:00,
 * et celui de 15:00 encore davantage — pression croissante).
 */
export const MID_BOSS_WAVES = {
  atMs: [5 * 60_000, 10 * 60_000, 15 * 60_000] as readonly number[],
  hpMults: [1.0, 1.1, 1.5] as readonly number[],
  spawnRadius: 320
} as const

/**
 * Ouvrier prisonnier (clin d'œil « otage à libérer »). 1 par run, position seedée
 * via un RNG dédié (n'altère pas la séquence de spawn/upgrade). Libéré par simple
 * proximité → petit soin en récompense.
 *
 * ÉQUILIBRAGE : 5 prisonniers éparpillés LOIN (`distMin`/`distMax`), chacun rend
 * `healFraction` du maxHp. Le trajet (exposition à la horde) est le prix — les bots
 * sim ne détournent pas vers eux, donc `sim:check` reste VERT (cf. vie-du-chantier).
 */
export const RESCUE = {
  /** Rayon de proximité (px) pour déclencher la libération. */
  radius: 64,
  /** Fraction du maxHp du libérateur rendue en PV (remplace le soin plat). */
  healFraction: 0.30,
  /** Nombre de prisonniers éparpillés par run. */
  count: 5,
  /** Distance min/max au centre du monde (éparpillement lointain, exploration). */
  distMin: 1200,
  distMax: 2800,
  /** Vitesse de fuite (px/s) de l'ouvrier libéré (part vers le bas hors écran). */
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

/**
 * Demi-angle du cône des armes de kind `cone` (extincteur, canon_mousse), en radians.
 * Le cône total fait `2 × CONE_HALF_ANGLE` (≈ 57° au total pour 0.5 rad).
 * Un ennemi est dans le cône si l'angle entre la direction du cône et la direction
 * joueur→ennemi est ≤ CONE_HALF_ANGLE.
 */
export const CONE_HALF_ANGLE = 0.5 as const

/**
 * Paramètres de détection du « camping » (joueur qui ne bouge pas assez).
 *
 * Si la LONGUEUR DE CHEMIN CUMULÉE du joueur (somme des déplacements pas-à-pas)
 * sur la fenêtre `windowMs` est inférieure à `minMove` px ET que le cooldown est
 * épuisé, le directeur force un encerclement de chargeurs qui oblige à bouger.
 * NB : métrique = chemin cumulé, PAS le déplacement net — un kiter qui tourne en
 * cercle parcourt un long chemin et n'est donc jamais puni (cf. reactiveHook).
 *
 * `cooldownMs` empêche le re-déclenchement immédiat : après un événement
 * anti-camping, au moins `cooldownMs` ms doivent s'écouler avant le suivant.
 */
export const CAMPER = {
  /** Fenêtre de mesure du chemin cumulé (ms). */
  windowMs: 6000,
  /** Longueur de chemin cumulée minimale sur la fenêtre pour NE PAS déclencher (px). */
  minMove: 120,
  /** Cooldown entre deux événements anti-camping (ms). */
  cooldownMs: 12000
} as const
