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
export interface EmbeddedElement {
  assetKey: string
  dx: number
  dy: number
  scale: number
  flipX?: boolean
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
  locked: boolean
  /** Éléments résolus (sauvegarde « jeu ») — absent en sauvegarde éditable. */
  elements?: EmbeddedElement[]
}

export type MarkerType = 'signature_zone'

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
