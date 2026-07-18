/**
 * Types fondamentaux du cœur de simulation.
 *
 * Repère de coordonnées (documenté pour le seam de test) :
 *   origine en haut-gauche, +x vers la droite, +y vers le bas.
 */

import type { PlayerStats } from '@content/passives'
import type { Card } from '@core/systems/cards'
import type { WaveEventKind } from '@content/waveEvents'

export type EntityId = number

export interface Vec2 {
  x: number
  y: number
}

export interface Health {
  hp: number
  maxHp: number
}

/** Données propres à une entité joueur. */
export interface PlayerComp {
  playerId: number
  speed: number // px/seconde
  vigilance: number
  /**
   * Multiplicateur de dégâts des armes. RÉSERVÉ/INUTILISÉ actuellement : le
   * système d'armes (`weaponSystem`/`effectiveWeaponStats`) lit `stats` (agrégé
   * des passifs), pas ce champ. Conservé pour éviter du churn ; pas de logique lue.
   */
  damageMult: number
  /**
   * Multiplicateur de cooldown des armes (<1 = tire plus vite). RÉSERVÉ/INUTILISÉ
   * actuellement, pour la même raison que `damageMult` ci-dessus.
   */
  cooldownMult: number
  /** Rayon d'aimantation des pickups, en px. */
  pickupRadius: number
  /**
   * Id du personnage jouable (`@content/characters`), déterminant l'arme de
   * départ et (plus tard) le skin. Optionnel pour ne pas casser les fixtures
   * de test existantes qui construisent un `PlayerComp` littéral sans ce
   * champ ; absent ⇒ traité comme `DEFAULT_CHARACTER_ID` par `collectPlayers`.
   */
  characterId?: string
  /**
   * Dernière direction cardinale non-nulle de déplacement (snappée N/S/E/O),
   * pour les armes à visée manuelle (ex. `bonbonne_chantier`). Écrite par
   * `applyPlayerInputs` : PERSISTE quand le joueur s'arrête (jamais remise à
   * zéro). Optionnel pour la même raison que `characterId` (fixtures de test
   * existantes) ; absent ⇒ traité comme sud `{x:0,y:1}` par les lecteurs.
   */
  facing?: Vec2
}

/** Progression d'un joueur (XP / niveau). Par joueur → prêt-N-joueurs. */
export interface ProgressComp {
  /** XP accumulée vers le prochain niveau. */
  xp: number
  level: number
  /** XP requise pour le prochain niveau. */
  nextThreshold: number
}

/** Comportements d'IA disponibles pour les ennemis. */
export type EnemyBehavior = 'chase' | 'zigzag' | 'circler' | 'sweep' | 'charger' | 'boss'

/**
 * Placement d'un ennemi dans un groupe de vague (directeur de vagues).
 * `angle` et `radius` définissent la position relative au centre de la vague ;
 * `behavior` et `bAngle` surchargent les defaults de l'ennemi.
 */
export interface WavePlacement {
  angle: number
  radius: number
  behavior: EnemyBehavior
  bAngle?: number
}

/** Données propres à une entité ennemie. */
export interface EnemyComp {
  type: string
  speed: number // px/seconde
  isElite: boolean
  isBoss: boolean
  /** Résistance au recul physique (1 = standard, plus bas = plus lourd). */
  knockbackMult?: number
  /**
   * Porteur de coffre : sa mort lâche un coffre d'évolution GARANTI
   * (`collectDeadChestBearers` dans simulation.ts). Posé au spawn par le
   * directeur de coffres. Absent = ennemi ordinaire.
   */
  chestBearer?: boolean
  /** Rôle de boss (mini-boss intermédiaire vs boss final). Absent pour les ennemis non-boss. */
  bossRole?: 'mid' | 'final'
  /**
   * Tué par une boule d'un ALLIÉ enragé (otage libéré) : lu par `reapDeadEnemies`
   * pour réduire la gemme d'XP (`RAGE.allyKillXpFraction`) et éviter le flood d'XP
   * d'un wipe de masse. Absent = mort normale (XP pleine).
   */
  allyKill?: boolean
  contactDamage: number
  /** XP lâchée à la mort. */
  xpValue: number
  /** Comportement d'IA. Absent sur les fixtures de test anciennes → traité comme 'chase'. */
  behavior?: EnemyBehavior
  /** Phase interne du comportement (utilisée par zigzag, circler…). */
  bPhase?: number
  /** Angle courant du comportement (utilisé par circler…). */
  bAngle?: number
  /** Mode interne du comportement (utilisé par charger, boss…). */
  bMode?: number
  /** Timer interne du comportement (utilisé par charger, boss…). */
  bTimer?: number
  /**
   * Boss « enragé » : posé par `bossSystem` quand ses PV passent sous
   * `BEHAVIOR_TUNING.boss.enrageHpPct`. Lu par `steerBoss` (vitesse + cadence
   * de charge). Absent = non enragé.
   */
  bEnraged?: boolean
  /**
   * Nombre de seuils d'invocation déjà franchis par ce boss (index dans
   * `BEHAVIOR_TUNING.boss.summonAtHpPct`). Empêche de re-invoquer au même palier.
   */
  bSummonIdx?: number
  /**
   * PlayerId du dernier joueur ayant infligé des dégâts à cet ennemi.
   * Posé à chaque site de dégât (projectile, aura, orbital, sweep, strike, cone, hazard).
   * Utilisé par `reapDeadEnemies` pour attribuer le kill au bon joueur.
   * Absent si l'ennemi n'a encore reçu aucun dégât de joueur (ex. contact ennemi→joueur
   * uniquement). Un ennemi mort sans `lastHitBy` est compté dans le score global mais
   * n'est pas attribué à un joueur individuel.
   */
  lastHitBy?: number
  /**
   * Id de l'arme du dernier coup reçu. DONNÉE MORTE pour la simulation : aucun
   * système ne la lit, elle n'entre dans aucun calcul. Elle n'existe que pour être
   * relue à la mort par la couche rendu (Mode Carnage : la scie gicle en long, le
   * marteau en radial). Absente si l'ennemi n'a jamais été touché par une arme.
   */
  lastHitWeapon?: string
  /**
   * Direction du dernier coup reçu (déjà calculée par le recul). Même statut que
   * `lastHitWeapon` : purement descriptif, jamais relu par la simulation.
   */
  lastHitDir?: Vec2
}

/** Types de pickups ramassables. */
export type PickupKind = 'xp' | 'heal' | 'magnet' | 'chest' | 'coffre' | 'coin'

/** Un pickup ramassable au sol (gemme d'XP, soin, aimant, coffre). */
export interface PickupComp {
  type: PickupKind
  value: number
  /** Durée de vie restante (ms) avant despawn auto. Seules les gemmes d'XP en ont une. */
  lifeMs?: number
  /**
   * Power-up aimant actif sur cette gemme : elle est tirée vers le joueur quel
   * que soit le rayon d'aimantation, puis collectée au contact (pas de vacuum sec).
   */
  magnetized?: boolean
  /**
   * Coffre RARE « super » (doré giga-brillant, 1/10) : donne 1 évolution + 2 montées
   * (ou 3 montées) et déclenche le spectacle renforcé. Posé au drop du coffre.
   */
  isSuper?: boolean
}

/** Un projectile en vol. */
export interface ProjectileComp {
  type: string
  damage: number
  ownerId: number
  /** Durée de vie restante, en ms. */
  lifeMs: number
  radius: number
  /** Nombre d'ennemis SUPPLÉMENTAIRES que le projectile peut encore traverser après un impact (0 = despawn au 1er impact). */
  pierce: number
  /** Force de recul transmise à l'ennemi lors de l'impact. */
  knockback?: number
  /** Nombre de rebonds restants (ricochet). Absent ou 0 = comportement classique. */
  bounces?: number
  /**
   * Temps avant inversion (boomerang), en ms. Décrémenté par `boomerangSystem`.
   * `undefined` = pas un boomerang (champ absent). `<= 0` avec `returning=false` → déclenche l'inversion.
   */
  boomerangOutMs?: number
  /** Vrai une fois l'inversion déclenchée : le projectile revient vers son owner. */
  returning?: boolean
  /** Liste des ids d'ennemis déjà touchés par ce projectile (pour le ricochet, éviter re-hit). */
  hitIds?: number[]
}

/**
 * Une flaque de goudron au sol (kind `hazard`).
 * Inflige `damagePerTick` à tous les ennemis vivants dans son `radius` toutes
 * les `tickMs` ms, jusqu'à ce que `lifeMs` atteigne 0 (despawn automatique).
 */
export interface HazardComp {
  /** Id de l'arme source (ex. `'goudron'`). */
  type: string
  /** PlayerId du joueur qui a posé la flaque. */
  ownerId: number
  /** Dégâts infligés par intervalle. */
  damagePerTick: number
  /** Rayon de la zone (px). */
  radius: number
  /** Durée entre deux ticks de dégâts (ms). */
  tickMs: number
  /** Temps restant avant le prochain tick (ms). 0 ou négatif → tick immédiat. */
  tickLeftMs: number
  /** Durée de vie restante de la flaque (ms). 0 ou négatif → despawn. */
  lifeMs: number
}

/** Progrès de relève d'un joueur à terre (hp<=0), en cours de secours par un coéquipier. */
export interface ReviveComp {
  /** Progression vers la relève, [0,1[ ; >=1 déclenche la relève (retire ce composant). */
  progress: number
}

/** Une lame en orbite autour d'un joueur (arme « scie »). */
export interface OrbiterComp {
  ownerId: number
  weaponId: string
  /** Angle courant autour du propriétaire, en radians. */
  angle: number
  radius: number
  hitRadius: number
}

/** Un ouvrier prisonnier à libérer (clin d'œil « otage » ; cosmétique + petit bonus). */
export interface PrisonerComp {
  /** true une fois le joueur passé à proximité (cage ouverte, remerciement). */
  freed: boolean
}

/**
 * Otage libéré ENRAGÉ (allié TEMPORAIRE). Porté par l'entité `prisoner` (qui garde
 * `freed:true`) — pas d'entité séparée. Il suit le joueur `ownerPlayerId` et lance
 * des salves de boules de feu jusqu'à `remainingMs<=0`, puis dit « Merci » et fuit.
 */
export interface AllyComp {
  /** PlayerId du sauveteur : cible du suivi ET owner des kills (attribution/XP). */
  ownerPlayerId: number
  /** Durée de vie restante (ms) avant « merci » + départ. */
  remainingMs: number
  /** Temps restant avant la prochaine salve (ms). */
  salvoLeftMs: number
}

/**
 * Boule de feu homing lancée par un allié enragé. Vise l'ENTITÉ `targetId` et
 * applique son effet à l'impact : létal (ennemi normal) ou plafonné (boss/élite).
 * N'est PAS un `projectile` (jamais passée à `collisionSystem`) → le compte de
 * victimes reste EXACT (l'ensemble est figé au moment de la salve).
 */
export interface AllyBoltComp {
  ownerPlayerId: number
  targetId: EntityId
  damage: number
  /** true = tue la cible à l'impact (ennemi normal) ; false = dégât plafonné (boss/élite). */
  lethal: boolean
  speed: number
}

/**
 * Effet de ralentissement posé sur un ennemi (premier effet de contrôle du jeu).
 * Posé par les armes de kind `cone` (extincteur, canon_mousse).
 * Retiré par `slowSystem` quand `remainingMs` atteint 0.
 */
export interface SlowComp {
  /** Multiplicateur de vélocité appliqué par `enemyAiSystem` (< 1 = ralenti). */
  mult: number
  /** Durée restante du ralentissement, en ms. */
  remainingMs: number
}

/** Impulsion physique indépendante de la vélocité calculée par l'IA. */
export interface KnockbackComp {
  vx: number
  vy: number
}

/**
 * Objet DESTRUCTIBLE posé sur la carte (non-ennemi, immobile, non-bloquant).
 * A des PV (composant `health`) ; cassé par les armes ET le contact du joueur.
 * `coinDrop` (pré-tiré au spawn, déterministe) = nb de pièces lâchées à la casse.
 */
export interface DestructibleComp {
  typeId: string
  coinDrop: number
}

/** Une arme équipée, son niveau et son cooldown courant. */
export interface WeaponSlot {
  id: string
  level: number
  cooldownLeftMs: number
}

/** L'arsenal d'une entité (joueur). */
export interface WeaponLoadout {
  slots: WeaponSlot[]
}

/** Un passif possédé et son niveau. */
export interface PassiveSlot {
  id: string
  level: number
}

/** Les passifs possédés par une entité (joueur). */
export interface PassiveLoadout {
  list: PassiveSlot[]
}

/**
 * Registre des composants ECS : nom → forme des données.
 * Ajouter un composant = ajouter une entrée ici (typage propagé partout).
 */
export interface Components {
  position: Vec2
  velocity: Vec2
  knockback: KnockbackComp
  health: Health
  player: PlayerComp
  progress: ProgressComp
  enemy: EnemyComp
  projectile: ProjectileComp
  pickup: PickupComp
  orbiter: OrbiterComp
  weapons: WeaponLoadout
  prisoner: PrisonerComp
  /** Otage libéré enragé (allié temporaire qui suit le joueur et tire des boules de feu). */
  ally: AllyComp
  /** Boule de feu homing d'un allié enragé (vise une entité, applique l'effet à l'impact). */
  allyBolt: AllyBoltComp
  /** Objet destructible posé (PV + drop de pièces à la casse). */
  destructible: DestructibleComp
  passives: PassiveLoadout
  /** Stats dérivées des passifs possédés (recalculées par `recomputePlayerStats`). */
  stats: PlayerStats
  /** Présent uniquement pendant qu'un joueur à terre est en cours de relève. */
  revive: ReviveComp
  /** Flaque de goudron au sol (kind `hazard`) : dégâts par tick. */
  hazard: HazardComp
  /**
   * Ralentissement actif sur un ennemi (posé par les armes de kind `cone`).
   * Absent = pas de slow courant.
   */
  slow: SlowComp
}

export type ComponentKey = keyof Components

// --- Modes & scènes -------------------------------------------------------

export type GameMode = 'solo' | 'coop' | 'coop3' | 'coop4'
export type SceneName = 'title' | 'game' | 'paused' | 'gameover' | 'won'

// --- Entrées joueur (injectées via le seam) -------------------------------

export interface PlayerInput {
  /** Direction de déplacement, composantes dans [-1, 1]. */
  move: Vec2
  attack: boolean
  /** Bouton d'action MAINTENU (relever un coéquipier à terre). Optionnel : lu `?? false`. */
  action?: boolean
}

// --- État de jeu sérialisable (contrat du seam window.__GAME__) -----------

export interface PlayerState {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  vigilance: number
  level: number
  xp: number
  nextThreshold: number
  alive: boolean
  /** À terre (hp<=0) mais partie en cours (pas de game over) — en attente de relève. */
  downed: boolean
  /** Progrès de relève courant [0,1] (0 si pas à terre ou pas en cours de relève). */
  reviveProgress: number
  /** Id du personnage jouable (`@content/characters`). Additif. */
  characterId: string
  weapons: string[]
  weaponLevels: number[]
  passives: { id: string; level: number }[]
  /** Nombre d'ennemis tués par ce joueur (attribution par dernier frappeur). */
  kills: number
}

export interface EnemyState {
  id: number
  type: string
  x: number
  y: number
  hp: number
  maxHp: number
  isElite: boolean
  isBoss: boolean
  /** Porteur de coffre (élite « convoyeur ») → marqueur coffre au-dessus. Cosmétique (render-only). */
  chestBearer?: boolean
  /** Rôle de boss (mini-boss intermédiaire vs boss final). Absent pour les ennemis non-boss. */
  bossRole?: 'mid' | 'final'
  /**
   * Phase de charge du boss (behavior 'boss'), pour le télégraphe visuel :
   * `'telegraph'` = wind-up (fenêtre d'esquive), `'charge'` = dash en cours.
   * Absent hors phase de charge / pour les non-boss. Cosmétique (render-only).
   */
  bossCharge?: 'telegraph' | 'charge'
}

export interface ProjectileState {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  type: string
}

export interface PickupState {
  id: number
  x: number
  y: number
  type: PickupKind
  value: number
  /** Coffre RARE super doré (1/10) → sprite au sol distinct + spectacle renforcé. */
  isSuper?: boolean
}

export interface PrisonerState {
  id: number
  x: number
  y: number
  freed: boolean
}

/** Vue d'un allié enragé (otage libéré qui suit le joueur et tire des boules de feu). */
export interface AllyState {
  id: number
  x: number
  y: number
  /** PlayerId du sauveteur (owner). */
  ownerId: number
  /** Durée de vie restante (ms) — pour l'aura enragée + un éventuel décompte. */
  remainingMs: number
}

/** Vue d'un objet destructible (rendu observateur : sprite du type + feedback de PV). */
export interface DestructibleState {
  id: number
  x: number
  y: number
  typeId: string
  hp: number
  maxHp: number
}

/** Flaque de goudron exposée dans le view-state (pour le rendu — Task 7/8). */
export interface HazardState {
  id: number
  x: number
  y: number
  radius: number
  remainingMs: number
}

export interface PendingLevelUp {
  playerId: number
  choices: Card[]
}

/**
 * Formation annoncée non encore spawnée (télégraphe, Task 10).
 * Exposée dans `GameState.pendingFormations` pour le rendu (marqueur au sol + flèche).
 */
export interface PendingFormation {
  /** Type de formation (détermine la forme du marqueur : anneau, ligne, spirale…). */
  kind: WaveEventKind
  /**
   * Angle de référence de la formation, en radians (tiré par `_waveRng`
   * au moment de l'annonce — déterministe).
   */
  angle: number
  /** Rayon de l'anneau de spawn (px), identique à `SPAWN.ringRadius`. */
  radius: number
  /** Temps restant avant le spawn (ms). `max(0, triggersAtMs - elapsedMs)`. */
  triggersInMs: number
}

export interface GameState {
  scene: SceneName
  seed: number
  /** Phase/stage courant (id, ex. 'terrain_vierge'). Pilote le thème + les assets. */
  stageId: string
  elapsedMs: number
  wave: number
  score: number
  /**
   * Boss neutralisés depuis le début de la run (`mid` + `final` confondus).
   *
   * Cumul de run au même titre que `score`, et pour la même raison : c'est la
   * seule source FIABLE de morts de boss. `EnemyDiedEvent` porte bien `bossRole`
   * mais il est plafonné par pas (événement de rendu) — un boss tué au milieu
   * d'une vague n'y apparaîtrait pas.
   */
  bossKills: number
  /** Repère documenté pour décider sans regarder l'écran. */
  coordSystem: string
  players: PlayerState[]
  enemies: EnemyState[]
  projectiles: ProjectileState[]
  pickups: PickupState[]
  /** Ouvriers prisonniers présents (cage + sosie à libérer). */
  prisoners: PrisonerState[]
  /** Alliés enragés actifs (otages libérés qui suivent le joueur et lancent des boules de feu). */
  allies: AllyState[]
  /** Objets destructibles posés sur la carte (rendu + feedback de casse). */
  destructibles: DestructibleState[]
  /** Progression des sauvetages (mini-carte + HUD). */
  rescue: { total: number; rescued: number }
  /** Flaques de goudron actives (pour le rendu — Task 7/8). */
  hazards: HazardState[]
  pendingLevelUp: PendingLevelUp | null
  /**
   * Formations annoncées non encore spawnées (télégraphe, Task 10).
   * 0 ou 1 élément (le directeur n'annonce qu'une formation à la fois).
   * `triggersInMs = max(0, triggersAtMs - elapsedMs)`.
   * Consommé par `telegraphRenderer` pour dessiner marqueur au sol + flèche de bord.
   */
  pendingFormations: readonly PendingFormation[]
  /**
   * Transitoire (one-shot) : id de l'arme évoluée pendant exactement une frame
   * (le pas où une évolution vient d'être déclenchée) ; `null` sinon.
   * Remis à `null` au pas suivant / après lecture dans `getState`.
   * Consommé par `overlay.sync` côté rendu pour lancer le jackpot — ne jamais
   * lire deux fois sans avancer le temps.
   */
  justEvolved: string | null
  /**
   * Transitoire (one-shot) : résultat de l'ouverture d'un coffre CE pas (les 3
   * branches : évolution / cartes / soin), ou `null`. Remis à `null` au pas
   * suivant / après lecture dans `getState`. Consommé par `overlay.sync` pour
   * lancer la machine à sous. Purement cosmétique (jamais relu par la sim).
   */
  chestOpened: ChestOpenOutcome | null
  /** Pièces d'or collectées durant CE run (monnaie méta ; persistée côté app en fin de run). */
  coins: number
}

/**
 * UNE issue d'ouverture de coffre, révélée par un rouleau de la machine à sous.
 * `evolution` = une arme évolue en super-arme ; `weapon-up` = une arme possédée
 * monte de niveau ; `heal` = soin de repli (tout maxé). PLUS de « cartes » : le
 * coffre ne propose jamais d'écran de choix.
 */
export interface ChestResult {
  kind: 'evolution' | 'weapon-up' | 'heal'
  /** Arme concernée (id évolué, ou id de l'arme montée). '' pour un soin. */
  weaponId: string
  /** Niveau résultant (montée : nouveau niveau ; évolution : 1). Absent pour un soin. */
  level?: number
}

/**
 * Résultat d'ouverture d'un coffre (one-shot, cosmétique) — alimente la machine à
 * sous. `results` : 1 issue (coffre normal) ou jusqu'à 3 (super coffre : 1 évo + 2
 * montées, ou 3 montées). `isSuper` : super coffre doré (rareté 1/10) → spectacle
 * renforcé côté rendu.
 */
export interface ChestOpenOutcome {
  isSuper: boolean
  results: ChestResult[]
}
