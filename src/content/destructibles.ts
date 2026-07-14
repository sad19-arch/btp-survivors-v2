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

type Material = 'wood' | 'metal' | 'rubble'

/**
 * Réglages par MATÉRIAU (partagés stages 02→10) : PV, hitbox, économie de pièces,
 * fragments+SFX de casse. Un cassable neuf ne fournit que son sprite intact + son
 * matériau → zéro nouvel asset VFX/audio (réutilise les 3 kits de casse existants).
 */
const MAT: Record<Material, {
  hp: number; radius: number; coinChance: number; coinMin: number; coinMax: number
  fragmentKey: string; fragmentFile: string; breakSfx: string
}> = {
  wood: { hp: 22, radius: 36, coinChance: 0.35, coinMin: 1, coinMax: 3, fragmentKey: FRAG_WOOD, fragmentFile: FRAG_WOOD_FILE, breakSfx: 'break_wood' },
  metal: { hp: 34, radius: 38, coinChance: 0.6, coinMin: 2, coinMax: 5, fragmentKey: FRAG_METAL, fragmentFile: FRAG_METAL_FILE, breakSfx: 'break_metal' },
  rubble: { hp: 16, radius: 32, coinChance: 0.18, coinMin: 1, coinMax: 2, fragmentKey: FRAG_RUBBLE, fragmentFile: FRAG_RUBBLE_FILE, breakSfx: 'break_rubble' }
}

/**
 * Fabrique un `DestructibleDef` pour les stages 02→10 : `nn` = numéro de stage
 * (dossier `stageNN/props/`), `slug` = nom de fichier/clé, `material` = kit de
 * casse réutilisé. Le débris au sol réutilise le décalque générique de stage 01.
 */
function mkDestructible(nn: string, stageId: string, slug: string, name: string, material: Material, scale = 0.72): DestructibleDef {
  const m = MAT[material]
  return {
    id: `d${nn}_${slug}`, name, stageId,
    assetKey: `prop_stage${nn}_${slug}`, file: `stage${nn}/props/prop_stage${nn}_${slug}.png`,
    debrisKey: DEBRIS_01, debrisFile: DEBRIS_01_FILE,
    hp: m.hp, scale, radius: m.radius, coinChance: m.coinChance, coinMin: m.coinMin, coinMax: m.coinMax,
    material, fragmentKey: m.fragmentKey, fragmentFile: m.fragmentFile, breakSfx: m.breakSfx
  }
}

function mkDestructibleFile(
  slug: string,
  file: string,
  name: string,
  material: Material,
  scale: number,
  radius?: number
): DestructibleDef {
  const m = MAT[material]
  return {
    id: `d03_${slug}`,
    name,
    stageId: 'fondations',
    assetKey: `prop_stage03_breakable_${slug}`,
    file: `stage03/props/${file}`,
    debrisKey: DEBRIS_01,
    debrisFile: DEBRIS_01_FILE,
    hp: m.hp,
    scale,
    radius: radius ?? m.radius,
    coinChance: m.coinChance,
    coinMin: m.coinMin,
    coinMax: m.coinMax,
    material,
    fragmentKey: m.fragmentKey,
    fragmentFile: m.fragmentFile,
    breakSfx: m.breakSfx
  }
}

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
  },

  // Stage 02 — terrassement (golden batch : sprites PixelLab validés)
  d02_tas_terre: mkDestructible('02', 'terrassement', 'tas_terre', 'Tas de terre', 'rubble', 0.72),
  d02_touret_cable: mkDestructible('02', 'terrassement', 'touret_cable', 'Touret de câble', 'wood', 0.72),

  // Stage 03 — fondations
  d03_sac_ciment: mkDestructible('03', 'fondations', 'sac_ciment', 'Sac de ciment', 'rubble', 0.72),
  d03_coffrage_bois: mkDestructible('03', 'fondations', 'coffrage_bois', 'Coffrage bois', 'wood', 0.72),
  d03_concrete_bag_single: mkDestructibleFile('concrete_bag_single', 'concrete_bag_single.png', 'Sac de béton', 'rubble', 0.9, 26),
  d03_concrete_bag_pallet: mkDestructibleFile('concrete_bag_pallet', 'concrete_bag_pallet.png', 'Palette de sacs', 'rubble', 0.72, 42),
  d03_plywood_panel: mkDestructibleFile('plywood_panel', 'plywood_panel.png', 'Panneau de coffrage', 'wood', 0.8, 38),
  d03_formwork_panels: mkDestructibleFile('formwork_panels', 'formwork_panels_pallet.png', 'Palette de panneaux', 'wood', 0.72, 44),
  d03_rebar_bundle: mkDestructibleFile('rebar_bundle', 'rebar_bundle.png', 'Fagot de fers à béton', 'metal', 0.78, 40),
  d03_mesh_stack: mkDestructibleFile('mesh_stack', 'welded_mesh_stack.png', 'Pile de treillis', 'metal', 0.78, 42),
  d03_tarp_materials: mkDestructibleFile('tarp_materials', 'tarp_covered_materials.png', 'Matériaux bâchés', 'wood', 0.76, 42),

  // Stage 04 — réseaux enterrés
  d04_touret_tuyaux: mkDestructible('04', 'reseaux_enterres', 'touret_tuyaux', 'Touret de tuyaux', 'metal', 0.72),
  d04_plots_piquets: mkDestructible('04', 'reseaux_enterres', 'plots_piquets', 'Piquets de chantier', 'wood', 0.72),

  // Stage 05 — gros œuvre
  d05_palette_parpaings: mkDestructible('05', 'gros_oeuvre', 'palette_parpaings', 'Palette de parpaings', 'rubble', 0.72),
  d05_brouette_gravats: mkDestructible('05', 'gros_oeuvre', 'brouette_gravats', 'Brouette de gravats', 'metal', 0.72),

  // Stage 06 — échafaudages
  d06_cadre_echafaudage: mkDestructible('06', 'echafaudages', 'cadre_echafaudage', 'Cadre d\'échafaudage', 'metal', 0.72),
  d06_pile_planches: mkDestructible('06', 'echafaudages', 'pile_planches', 'Pile de planches', 'wood', 0.72),

  // Stage 07 — charpente / toiture
  d07_tuiles_empilees: mkDestructible('07', 'charpente_toiture', 'tuiles_empilees', 'Tuiles empilées', 'rubble', 0.72),
  d07_chevrons: mkDestructible('07', 'charpente_toiture', 'chevrons', 'Chevrons', 'wood', 0.72),

  // Stage 08 — second œuvre
  d08_plaques_platre: mkDestructible('08', 'second_oeuvre', 'plaques_platre', 'Plaques de plâtre', 'rubble', 0.72),
  d08_pots_pvc: mkDestructible('08', 'second_oeuvre', 'pots_pvc', 'Tuyaux PVC', 'metal', 0.72),

  // Stage 09 — finitions
  d09_pots_peinture: mkDestructible('09', 'finitions', 'pots_peinture', 'Pots de peinture', 'metal', 0.72),
  d09_bache_cartons: mkDestructible('09', 'finitions', 'bache_cartons', 'Cartons bâchés', 'wood', 0.72),

  // Stage 10 — livraison / audit
  d10_cones_empiles: mkDestructible('10', 'livraison_audit', 'cones_empiles', 'Cônes de chantier', 'metal', 0.72),
  d10_cartons_palette: mkDestructible('10', 'livraison_audit', 'cartons_palette', 'Cartons palette', 'wood', 0.72)
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
  ],
  // Stages 02→10 : ~18 cassables/stage (2 types thématiques par phase).
  terrassement: [
    { typeId: 'd02_tas_terre', count: 10 },
    { typeId: 'd02_touret_cable', count: 8 }
  ],
  fondations: [
    { typeId: 'd03_concrete_bag_single', count: 6 },
    { typeId: 'd03_concrete_bag_pallet', count: 3 },
    { typeId: 'd03_plywood_panel', count: 4 },
    { typeId: 'd03_formwork_panels', count: 4 },
    { typeId: 'd03_rebar_bundle', count: 4 },
    { typeId: 'd03_mesh_stack', count: 3 },
    { typeId: 'd03_tarp_materials', count: 3 }
  ],
  reseaux_enterres: [
    { typeId: 'd04_touret_tuyaux', count: 8 },
    { typeId: 'd04_plots_piquets', count: 10 }
  ],
  gros_oeuvre: [
    { typeId: 'd05_palette_parpaings', count: 8 },
    { typeId: 'd05_brouette_gravats', count: 8 }
  ],
  echafaudages: [
    { typeId: 'd06_cadre_echafaudage', count: 8 },
    { typeId: 'd06_pile_planches', count: 10 }
  ],
  charpente_toiture: [
    { typeId: 'd07_tuiles_empilees', count: 10 },
    { typeId: 'd07_chevrons', count: 8 }
  ],
  second_oeuvre: [
    { typeId: 'd08_plaques_platre', count: 10 },
    { typeId: 'd08_pots_pvc', count: 8 }
  ],
  finitions: [
    { typeId: 'd09_pots_peinture', count: 8 },
    { typeId: 'd09_bache_cartons', count: 10 }
  ],
  livraison_audit: [
    { typeId: 'd10_cones_empiles', count: 10 },
    { typeId: 'd10_cartons_palette', count: 8 }
  ]
}

export function destructibleDef(typeId: string): DestructibleDef | undefined {
  return DESTRUCTIBLES[typeId]
}

/** Types de destructibles disponibles pour un stage (palette éditeur + scatter). */
export function destructiblesForStage(stageId: string): DestructibleDef[] {
  return Object.values(DESTRUCTIBLES).filter((d) => d.stageId === stageId)
}
