/**
 * Objets DESTRUCTIBLES (data-driven, thématiques par stage).
 *
 * Un destructible = un objet posé sur la carte, avec des PV, cassé par les armes
 * ET le contact du joueur. Non-bloquant (décor). Certains contiennent des pièces
 * d'or (`coinChance` → `[coinMin, coinMax]` pièces, tiré au spawn de façon
 * déterministe côté sim). Placés automatiquement par stage (scatter) et/ou dans
 * l'éditeur.
 *
 * Données pures (pas de Phaser/DOM). Le rendu résout `assetKey`/`debrisKey` en
 * textures ; le preload lit `file`/`debrisFile`.
 */

export interface DestructibleDef {
  id: string
  name: string
  /** Stage où ce type apparaît (id de phase, ex. `terrain_vierge`). */
  stageId: string
  /** Clé de texture du sprite intact (rendu) + chemin de fichier (preload). */
  assetKey: string
  file: string
  /** Clé/fichier du décalque de débris laissé au sol à la casse. */
  debrisKey: string
  debrisFile: string
  /** PV de base (cassé par les armes ; le contact joueur casse d'un coup). */
  hp: number
  /** Échelle de rendu du sprite. */
  scale: number
  /** Rayon de hitbox (px) : cible des armes (grille de dégât) + casse au contact. */
  radius: number
  /** Proba de contenir des pièces (0..1). */
  coinChance: number
  /** Bornes du nombre de pièces si l'objet en contient. */
  coinMin: number
  coinMax: number
  /**
   * Matériau (JUICE) : pilote la TEINTE du boom, le nombre de fragments qui
   * giclent et le son de casse. Purement cosmétique (sim-neutre).
   */
  material: 'wood' | 'metal' | 'rubble'
  /** Feuille de fragments PixelLab qui giclent à la casse (texture + fichier preload). */
  fragmentKey: string
  fragmentFile: string
  /** Id de cue SFX joué à la casse (par matériau, cf. `manifest.ts`). */
  breakSfx: string
}

const DEBRIS_01 = 'debris_stage01_generic'
const DEBRIS_01_FILE = 'stage01/decals/debris_stage01_generic.png'

// Fragments de casse (PixelLab) par matériau — sheet dans `public/stage01/vfx/`.
const FRAG_WOOD = 'vfx_debris_wood', FRAG_WOOD_FILE = 'stage01/vfx/vfx_debris_wood.png'
const FRAG_METAL = 'vfx_debris_metal', FRAG_METAL_FILE = 'stage01/vfx/vfx_debris_metal.png'
const FRAG_RUBBLE = 'vfx_debris_rubble', FRAG_RUBBLE_FILE = 'stage01/vfx/vfx_debris_rubble.png'

export const DESTRUCTIBLES: Record<string, DestructibleDef> = {
  // Stage 01 — terrain vierge (implantation / topographie)
  d01_caisse_outils: {
    id: 'd01_caisse_outils', name: 'Caisse à outils', stageId: 'terrain_vierge',
    assetKey: 'prop_stage01_caisse_outils', file: 'stage01/props/prop_stage01_caisse_outils.png',
    debrisKey: DEBRIS_01, debrisFile: DEBRIS_01_FILE,
    hp: 30, scale: 0.72, radius: 36, coinChance: 1, coinMin: 3, coinMax: 6,
    material: 'metal', fragmentKey: FRAG_METAL, fragmentFile: FRAG_METAL_FILE, breakSfx: 'break_metal'
  },
  d01_palette_bois: {
    id: 'd01_palette_bois', name: 'Palette de bois', stageId: 'terrain_vierge',
    assetKey: 'prop_stage01_palette_bois', file: 'stage01/props/prop_stage01_palette_bois.png',
    debrisKey: DEBRIS_01, debrisFile: DEBRIS_01_FILE,
    hp: 22, scale: 0.72, radius: 36, coinChance: 0.35, coinMin: 1, coinMax: 3,
    material: 'wood', fragmentKey: FRAG_WOOD, fragmentFile: FRAG_WOOD_FILE, breakSfx: 'break_wood'
  },
  d01_tas_gravats: {
    id: 'd01_tas_gravats', name: 'Tas de gravats', stageId: 'terrain_vierge',
    assetKey: 'prop_stage01_tas_gravats', file: 'stage01/props/prop_stage01_tas_gravats.png',
    debrisKey: DEBRIS_01, debrisFile: DEBRIS_01_FILE,
    hp: 16, scale: 0.7, radius: 32, coinChance: 0.15, coinMin: 1, coinMax: 2,
    material: 'rubble', fragmentKey: FRAG_RUBBLE, fragmentFile: FRAG_RUBBLE_FILE, breakSfx: 'break_rubble'
  }
}

/** Clé de texture du pickup pièce d'or (partagé, tous stages). */
export const COIN_PICKUP = { key: 'pickup_coin', file: 'pickup_coin.png' } as const

/** Un destructible à faire apparaître à une position monde (issu du scatter OU de l'éditeur). */
export interface DestructibleSpawn {
  typeId: string
  x: number
  y: number
}

/**
 * Dispersion automatique par stage : `count` objets de chaque `typeId`, placés
 * de façon déterministe par `scatterDestructibles` (siteLayout.ts). VIDE tant
 * qu'un stage n'a pas été peuplé — permet de valider `sim:check` diff 0 (aucun
 * destructible) AVANT d'en ajouter (puis re-baseline).
 */
export const DESTRUCTIBLE_SCATTER: Record<string, { typeId: string; count: number }[]> = {
  // Stage 01 — terrain vierge (monde 10240×7680 → ~1 objet / écran).
  terrain_vierge: [
    { typeId: 'd01_caisse_outils', count: 12 },
    { typeId: 'd01_palette_bois', count: 18 },
    { typeId: 'd01_tas_gravats', count: 24 }
  ]
}

export function destructibleDef(typeId: string): DestructibleDef | undefined {
  return DESTRUCTIBLES[typeId]
}

/** Types de destructibles disponibles pour un stage (palette éditeur + scatter). */
export function destructiblesForStage(stageId: string): DestructibleDef[] {
  return Object.values(DESTRUCTIBLES).filter((d) => d.stageId === stageId)
}
