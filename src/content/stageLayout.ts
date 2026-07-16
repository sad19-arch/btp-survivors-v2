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
export type RenderLayer = 'decal' | 'prop' | 'struct'

export interface EmbeddedElement {
  assetKey: string
  dx: number
  dy: number
  scale: number
  flipX?: boolean
  /** Couche d'affichage. Absent = déduite par le rendu (contenu hérité). */
  layer?: RenderLayer
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
 * Type de marqueur (outil de conception ÉDITEUR). `signature_zone` = macro-zone A
 * (compat cartes existantes) ; les 3 autres = macro-zones B/C/D. Ces marqueurs ne
 * sont JAMAIS lus par la sim/le rendu jeu (voir src/editor/zones.ts).
 */
export type MarkerType = 'signature_zone' | 'zone_main_work' | 'zone_logistics' | 'zone_atmosphere'

export interface LayoutMarker {
  id: string
  type: MarkerType
  x: number
  y: number
  w: number
  h: number
}

export type PathType = 'truck_path' | 'worker_path'

export interface LayoutPath {
  id: string
  type: PathType
  points: Vec2[]
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
