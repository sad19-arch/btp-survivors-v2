/**
 * stageLayout — TYPES PARTAGÉS de la composition de stage (data pure).
 *
 * Format d'échange produit par le Stage Composer Editor (`src/editor/`) et
 * consommé par le jeu (`src/core/siteLayout.ts`). Zéro Phaser/DOM/Math.random :
 * un simple contrat de données, importable par `src/content`, `src/core` ET
 * `src/editor` sans dépendance croisée.
 *
 * Espace de coordonnées « composition » : origine (0,0) = CENTRE DU MONDE
 * (= spawn par défaut). x → est, y → sud. Le consommateur ajoute worldW/2, worldH/2.
 */

export const SCHEMA_VERSION = 1

export interface Vec2 {
  x: number
  y: number
}

/** Forme collidable embarquée (cercle ou segment), en coordonnées LOCALES à dx/dy. */
export type EmbeddedShape =
  | { kind: 'circle'; r: number }
  | { kind: 'segment'; x2: number; y2: number; thickness: number }

/**
 * Élément concret EMBARQUÉ dans une instance au moment de la sauvegarde « jeu »
 * ou de l'import d'un stage généré (l'éditeur résout le prefab → ses sprites +
 * collision). Permet au cœur de consommer la compo SANS le catalogue éditeur.
 *
 * Collision LOSSLESS : `collide` reprend les vraies familles (both/enemies) et
 * `shape` la vraie forme (cercle OU segment) → les clôtures restent des segments,
 * les engins passent bloquants, etc. `collide:'none'` = décor pur.
 */
/**
 * Couche d'affichage d'un élément de décor. C'est une donnée de RENDU pure : la
 * simulation ne la lit jamais (elle ne connaît que `collide`/`shape`).
 *
 * Elle existe parce que le rendu déduisait la profondeur d'un MATCH DE SOUS-CHAÎNE
 * sur la clé d'asset (`road_*`/`decal_*`). Conséquence : `piste_strip`, pourtant
 * déclaré « décal », ne commençait par aucun des deux et s'affichait à la hauteur
 * d'un prop — une bande de terre qui flottait au-dessus du sol. Tout futur asset
 * mal préfixé (les tuiles `route_*` du kit de routes, par exemple) aurait hérité
 * du même bug silencieux. La couche est donc portée par la donnée, pas devinée.
 */
export type RenderLayer = 'ground' | 'decal' | 'prop' | 'struct'

/**
 * Plaque de texture RÉPÉTÉE (TileSprite), en pixels monde.
 *
 * Sans ça, une tuile de sol 64×64 posée « en grand » serait une image ÉTIRÉE :
 * 8× plus grosse et floue. Une plaque répète le motif — c'est ce qui distingue
 * un sol d'un décor.
 */
export interface TilePatch {
  w: number
  h: number
}

export interface EmbeddedElement {
  assetKey: string
  dx: number
  dy: number
  scale: number
  flipX?: boolean
  /** Couche d'affichage. Absent = déduite par le rendu (contenu hérité). */
  layer?: RenderLayer
  /** Si présent : texture RÉPÉTÉE sur w×h px (plaque de sol), et non étirée. */
  tile?: TilePatch
  /** Défaut : 'none' (décor). */
  collide?: 'none' | 'both' | 'enemies'
  /** Forme collidable (requise si collide ≠ 'none' ; sinon un cercle par défaut est déduit). */
  shape?: EmbeddedShape
  /**
   * Objet DESTRUCTIBLE : si présent, cet élément est routé vers les entités
   * destructibles de la sim (PV + casse + pièces), PAS vers le décor statique.
   * `typeId` référence `DESTRUCTIBLES` (src/content/destructibles.ts).
   */
  destructible?: { typeId: string }
  /**
   * Otage/prisonnier À LIBÉRER : si présent, cet élément est routé vers les
   * entités « prisonnier » de la sim (`composedToSiteLayout` → `SiteLayout.prisoners`),
   * PAS vers le décor. Sentinelle sans donnée — il n'existe qu'un seul type d'otage.
   */
  prisoner?: Record<string, never>
}

/** Une scène/prefab posée dans le monde. */
export interface LayoutInstance {
  id: string
  prefab: string
  x: number
  y: number
  flipX: boolean
  variant: number
  rotation: number
  /** Échelle UNIFORME de l'instance (redimensionnement sans déformation). Défaut 1. */
  scale?: number
  locked: boolean
  /** Éléments résolus (sauvegarde « jeu ») — absent en sauvegarde éditable. */
  elements?: EmbeddedElement[]
}

/**
 * Type de marqueur (outil de conception ÉDITEUR). Les cinq types canoniques
 * représentent les macro-zones A à E. Les identifiants historiques ne sont
 * acceptés qu'à l'import par `parseLayout`, puis normalisés avant d'entrer dans
 * ce contrat partagé.
 */
export type MarkerType =
  | 'signature_zone'
  | 'zone_access'
  | 'zone_storage'
  | 'zone_secondary'
  | 'zone_atmosphere'

export interface LayoutMarker {
  id: string
  type: MarkerType
  x: number
  y: number
  w: number
  h: number
}

export type PathType = 'truck_path' | 'worker_path'

/**
 * Bornes des réglages de chemin. CLAMPÉES au parse (jamais un rejet : une compo
 * doit rester chargeable). `speed.min > 0` est structurel : `tTrajet = longueur
 * / vitesse` — une vitesse nulle ferait exploser le calcul.
 */
export const PATH_LIMITS = {
  count: { min: 0, max: 8 },
  speed: { min: 10, max: 400 },
  pauseMs: { min: 0, max: 30000 }
} as const

/**
 * Vitesse par défaut, par famille (px/s). Ici et NON dans `render/` : c'est de
 * la DONNÉE, et l'éditeur comme le rendu la lisent. La dupliquer ferait
 * afficher une valeur à l'inspecteur pendant que le jeu en applique une autre.
 */
export const PATH_DEFAULT_SPEED: Record<PathType, number> = {
  worker_path: 74,
  truck_path: 150
}

/**
 * Un trajet tracé dans l'éditeur. **Le chemin porte ses marcheurs** : il ne
 * déplace pas un PNJ posé, il fabrique ses propres marcheurs. Les PNJ posés
 * (`npcs[]`) restent fixes à leur poste.
 *
 * Tous les réglages sont OPTIONNELS : absent = comportement historique exact
 * (1 marcheur, aller-retour continu, sans pause).
 *
 * `type` est CONSERVÉ et n'est pas une simple étiquette : il porte une vraie
 * différence de RENDU (un camion ne joue pas d'animation de marche et s'oriente
 * autrement — cf. `isCamion` dans siteWorkers). Il détermine aussi la couleur du
 * tracé dans l'éditeur et le skin par défaut.
 */
export interface LayoutPath {
  id: string
  type: PathType
  points: Vec2[]
  /** Nom libre, pour s'y retrouver dans l'inspecteur (« Livraison béton »). */
  name?: string
  /** Skin du marcheur. Défaut : porteur / camion selon `type`. */
  skin?: string
  /** Nombre de marcheurs, étalés automatiquement. Défaut 1. 0 = chemin repère. */
  count?: number
  /** Vitesse px/s. Défaut : 74 (ouvrier) / 150 (camion). */
  speed?: number
  /** Aller-retour : arrêt VISIBLE aux bouts. Sens unique : temps INVISIBLE. */
  pauseMs?: number
  /** true = A→B puis disparaît et réapparaît en A (flux). Défaut false. */
  oneWay?: boolean
}

/** Catégorie de PNJ : 'trade' = métier fixe animé ; 'worker' = ouvrier mobile (marche + fuite). */
export type NpcKind = 'trade' | 'worker'

/** Un PNJ posé dans la composition. Système distinct des instances de décor. */
export interface LayoutNpc {
  id: string
  /** Clé de skin (feuille de sprite) — ex. 'npc_stage01' (métier) ou 'npc_stage01_ouvrier_a' (ouvrier). */
  skin: string
  kind: NpcKind
  x: number
  y: number
}

export interface StageLayout {
  schemaVersion: number
  stage: string
  worldSize: { width: number; height: number }
  spawn: Vec2
  cameraPreview: { width: number; height: number }
  instances: LayoutInstance[]
  markers: LayoutMarker[]
  paths: LayoutPath[]
  npcs: LayoutNpc[]
  /**
   * Tuile du SOL DE FOND de la composition (clé d'asset, ex. `ground_stage05_2`).
   *
   * Permet de jouer le stage 01 sur le sol du 05. Absent = tuile de base du stage
   * (comportement historique). C'est une donnée de RENDU : la sim ne la lit pas.
   */
  groundKey?: string
  /**
   * `false` : le plan de chantier PROCÉDURAL ne doit PAS se superposer à la
   * compo (la compo se suffit à elle-même). Absent = comportement actuel
   * inchangé (plan conservé) — défaut sûr, aucune compo existante ne bouge.
   * Champ pur (pas de logique ici) : le branchement sim/rendu est une tâche
   * séparée.
   */
  keepSitePlan?: boolean
}

/** Layout vide par défaut (spawn au centre = origine composition). */
export function emptyLayout(stage: string): StageLayout {
  return {
    schemaVersion: SCHEMA_VERSION,
    stage,
    worldSize: { width: 10240, height: 7680 },
    spawn: { x: 0, y: 0 },
    cameraPreview: { width: 1280, height: 720 },
    instances: [],
    markers: [],
    paths: [],
    npcs: []
  }
}
