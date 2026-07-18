/**
 * PALETTE_ASSETS — source de vérité UNIQUE des ~60 textures du catalogue palette
 * de l'éditeur (mobilier urbain, réseaux/stockage, engins statiques, vie de
 * chantier, marquages, nature, routes — `public/palette/**`).
 *
 * Extrait de `src/editor/PrefabCatalog.ts` (retour playtest : les routes/bancs
 * posés dans l'éditeur restaient INVISIBLES en jeu normal). Cause : ce catalogue
 * n'était chargé QUE par l'éditeur (préchargement propre) ; `GameScene.preload()`
 * ne le chargeait JAMAIS, et `siteRenderer.ts` ignore SILENCIEUSEMENT tout élément
 * dont la texture n'est pas en cache (pas de warning). Vivre dans `src/content`
 * (pur, aucune dépendance à `@render/stages` ni logique éditeur) permet à
 * `PrefabCatalog.ts` (éditeur) ET `GameScene.preload()` (jeu réel) de partager
 * EXACTEMENT la même liste — plus jamais de divergence possible entre les deux.
 */

/** Rôle de rendu d'un asset — identique à `AssetRole` (`@editor/PrefabCatalog`, domaine éditeur). */
export type PaletteAssetRole =
  | 'ground'
  | 'landmark'
  | 'structure'
  | 'prop'
  | 'decal'
  | 'worker'
  | 'column'
  | 'destructible'

export interface PaletteAssetDef {
  key: string
  file: string
  label: string
  category: string
  role: PaletteAssetRole
  /** Pas de grille imposé à la pose (px) — cf. `PaletteEntry.snap` côté éditeur. */
  snap?: number
}

export const PALETTE_ASSETS: readonly PaletteAssetDef[] = [
  // ── Verdure ───────────────────────────────────────────────────────────────
  { key: 'pal_tree_dead', file: 'palette/props/tree_dead.png', label: 'Arbre mort', category: 'verdure', role: 'prop' },
  { key: 'pal_tree_pine', file: 'palette/props/tree_pine.png', label: 'Conifère', category: 'verdure', role: 'prop' },
  { key: 'pal_tree_sapling', file: 'palette/props/tree_sapling.png', label: 'Jeune arbre tuteuré', category: 'verdure', role: 'prop' },
  { key: 'pal_hedge', file: 'palette/props/hedge.png', label: 'Haie taillée', category: 'verdure', role: 'prop' },
  { key: 'pal_tall_grass', file: 'palette/props/tall_grass.png', label: 'Herbes hautes', category: 'verdure', role: 'prop' },
  { key: 'pal_stump', file: 'palette/props/stump.png', label: 'Souche', category: 'verdure', role: 'prop' },
  { key: 'pal_leaf_pile', file: 'palette/props/leaf_pile.png', label: 'Tas de feuilles', category: 'verdure', role: 'prop' },
  { key: 'pal_planter', file: 'palette/props/planter.png', label: 'Jardinière', category: 'verdure', role: 'prop' },
  { key: 'pal_flower_bed', file: 'palette/props/flower_bed.png', label: 'Massif fleuri', category: 'verdure', role: 'prop' },

  // ── Mobilier urbain ───────────────────────────────────────────────────────
  { key: 'pal_street_lamp', file: 'palette/props/street_lamp.png', label: 'Lampadaire', category: 'mobilier', role: 'prop' },
  { key: 'pal_bench', file: 'palette/props/bench.png', label: 'Banc public', category: 'mobilier', role: 'prop' },
  { key: 'pal_litter_bin', file: 'palette/props/litter_bin.png', label: 'Corbeille de rue', category: 'mobilier', role: 'prop' },
  { key: 'pal_fire_hydrant', file: 'palette/props/fire_hydrant.png', label: 'Borne incendie', category: 'mobilier', role: 'prop' },
  { key: 'pal_bollards', file: 'palette/props/bollards.png', label: 'Potelets', category: 'mobilier', role: 'prop' },
  { key: 'pal_post_box', file: 'palette/props/post_box.png', label: 'Boîte aux lettres', category: 'mobilier', role: 'prop' },
  { key: 'pal_bus_shelter', file: 'palette/structures/bus_shelter.png', label: 'Abribus', category: 'mobilier', role: 'structure' },
  { key: 'pal_manhole_cover', file: 'palette/decals/manhole_cover.png', label: "Plaque d'égout", category: 'mobilier', role: 'decal' },
  { key: 'pal_tree_grate', file: 'palette/decals/tree_grate.png', label: "Grille d'arbre", category: 'mobilier', role: 'decal' },

  // ── Réseaux & stockage ────────────────────────────────────────────────────
  { key: 'pal_electrical_cabinet', file: 'palette/props/electrical_cabinet.png', label: 'Coffret électrique', category: 'reseaux', role: 'prop' },
  { key: 'pal_site_locker', file: 'palette/props/site_locker.png', label: 'Armoire de chantier', category: 'reseaux', role: 'prop' },
  { key: 'pal_generator', file: 'palette/props/generator.png', label: 'Groupe électrogène', category: 'reseaux', role: 'prop' },
  { key: 'pal_air_compressor', file: 'palette/props/air_compressor.png', label: 'Compresseur', category: 'reseaux', role: 'prop' },
  { key: 'pal_water_tank', file: 'palette/props/water_tank.png', label: 'Citerne à eau', category: 'reseaux', role: 'prop' },
  { key: 'pal_rubble_skip', file: 'palette/props/rubble_skip.png', label: 'Benne à gravats', category: 'reseaux', role: 'prop' },
  { key: 'pal_big_bag', file: 'palette/props/big_bag.png', label: 'Big-bag', category: 'reseaux', role: 'prop' },
  { key: 'pal_block_pallet', file: 'palette/props/block_pallet.png', label: 'Palette de parpaings', category: 'reseaux', role: 'prop' },
  { key: 'pal_cement_bags', file: 'palette/props/cement_bags.png', label: 'Sacs de ciment', category: 'reseaux', role: 'prop' },
  { key: 'pal_pvc_pipes', file: 'palette/props/pvc_pipes.png', label: 'Tuyaux PVC', category: 'reseaux', role: 'prop' },
  { key: 'pal_duct_coil', file: 'palette/props/duct_coil.png', label: 'Couronne de gaine', category: 'reseaux', role: 'prop' },
  { key: 'pal_concrete_foot', file: 'palette/props/concrete_foot.png', label: 'Plot béton', category: 'reseaux', role: 'prop' },
  { key: 'pal_jersey_barrier', file: 'palette/props/jersey_barrier.png', label: 'Séparateur GBA', category: 'reseaux', role: 'prop' },

  // ── Engins statiques ──────────────────────────────────────────────────────
  { key: 'pal_van', file: 'palette/props/van.png', label: 'Camionnette', category: 'engins', role: 'prop' },
  { key: 'pal_plant_trailer', file: 'palette/props/plant_trailer.png', label: 'Remorque porte-engin', category: 'engins', role: 'prop' },
  { key: 'pal_site_dumper', file: 'palette/props/site_dumper.png', label: 'Dumper', category: 'engins', role: 'prop' },
  { key: 'pal_forklift', file: 'palette/props/forklift.png', label: 'Chariot élévateur', category: 'engins', role: 'prop' },

  // ── Vie de chantier ───────────────────────────────────────────────────────
  { key: 'pal_site_office', file: 'palette/structures/site_office.png', label: 'Bungalow de chantier', category: 'vie_chantier', role: 'structure' },
  { key: 'pal_site_canteen', file: 'palette/structures/site_canteen.png', label: 'Réfectoire', category: 'vie_chantier', role: 'structure' },
  { key: 'pal_site_changing_room', file: 'palette/structures/site_changing_room.png', label: 'Vestiaire', category: 'vie_chantier', role: 'structure' },
  { key: 'pal_scaffold_bay', file: 'palette/structures/scaffold_bay.png', label: "Module d'échafaudage", category: 'vie_chantier', role: 'structure' },
  { key: 'pal_notice_board', file: 'palette/props/notice_board.png', label: "Panneau d'affichage", category: 'vie_chantier', role: 'prop' },
  { key: 'pal_fire_extinguisher', file: 'palette/props/fire_extinguisher.png', label: 'Extincteur', category: 'vie_chantier', role: 'prop' },
  { key: 'pal_trestles', file: 'palette/props/trestles.png', label: 'Tréteaux', category: 'vie_chantier', role: 'prop' },
  { key: 'pal_step_ladder', file: 'palette/props/step_ladder.png', label: 'Échelle', category: 'vie_chantier', role: 'prop' },

  // ── Marquages & traces ────────────────────────────────────────────────────
  { key: 'pal_oil_stain', file: 'palette/decals/oil_stain.png', label: "Tache d'huile", category: 'marquages', role: 'decal' },
  { key: 'pal_crosswalk', file: 'palette/decals/crosswalk.png', label: 'Passage piéton', category: 'marquages', role: 'decal' },
  { key: 'pal_road_arrow', file: 'palette/decals/road_arrow.png', label: 'Flèche au sol', category: 'marquages', role: 'decal' },
  { key: 'pal_hazard_hatching', file: 'palette/decals/hazard_hatching.png', label: 'Zébras de danger', category: 'marquages', role: 'decal' },
  { key: 'pal_steel_road_plate', file: 'palette/props/steel_road_plate.png', label: "Plaque d'acier", category: 'marquages', role: 'prop' },
  { key: 'pal_footbridge', file: 'palette/props/footbridge.png', label: 'Passerelle de chantier', category: 'marquages', role: 'prop' },

  // ── Nature & périphérie ───────────────────────────────────────────────────
  { key: 'pal_gravel_pile', file: 'palette/props/gravel_pile.png', label: 'Tas de gravier', category: 'nature', role: 'prop' },
  { key: 'pal_sand_pile', file: 'palette/props/sand_pile.png', label: 'Tas de sable', category: 'nature', role: 'prop' },
  { key: 'pal_culvert_pipes', file: 'palette/props/culvert_pipes.png', label: 'Buses béton', category: 'nature', role: 'prop' },
  { key: 'pal_embankment', file: 'palette/props/embankment.png', label: 'Talus', category: 'nature', role: 'prop' },
  { key: 'pal_farm_fence', file: 'palette/props/farm_fence.png', label: 'Clôture agricole', category: 'nature', role: 'prop' },
  { key: 'pal_muddy_pond', file: 'palette/decals/muddy_pond.png', label: 'Mare', category: 'nature', role: 'decal' },

  // ── Routes & accès (kit 256 px) ───────────────────────────────────────────
  // Tuiles composées par `tools/assets/make-roads.mjs` : chaussée + accotements
  // en matière PixelLab, géométrie exacte. Elles raccordent PAR CONSTRUCTION —
  // l'axe traverse toujours le bord au milieu (128) et perpendiculairement, donc
  // toutes les pièces présentent le MÊME profil de bord.
  //
  // `role: 'decal'` (→ `layerForRole` → couche 'decal') : une route est peinte au
  // SOL et ne bloque pas. C'est exactement le bug historique de `piste_strip`,
  // qui flottait à hauteur de prop faute de rôle correct.
  //
  // `snap: 256` : sans lui, les tuiles ne tombent jamais en face (grille 128,
  // snap global à false par défaut). Une seule orientation par pièce suffit —
  // l'instance porte `rotation` (0/90/180/270), transportée jusqu'au jeu par
  // `buildSiteLayout` (`rotationDeg`) puis appliquée par `siteRenderer`.
  { key: 'pal_route_goudron_droite', file: 'palette/routes/goudron_droite.png', label: 'Goudron — droite', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_goudron_virage', file: 'palette/routes/goudron_virage.png', label: 'Goudron — virage 90°', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_goudron_te', file: 'palette/routes/goudron_te.png', label: 'Goudron — T', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_goudron_croisement', file: 'palette/routes/goudron_croisement.png', label: 'Goudron — croisement', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_goudron_fin', file: 'palette/routes/goudron_fin.png', label: 'Goudron — fin (barre d\'arrêt)', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_piste_droite', file: 'palette/routes/piste_droite.png', label: 'Piste — droite', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_piste_virage', file: 'palette/routes/piste_virage.png', label: 'Piste — virage 90°', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_piste_te', file: 'palette/routes/piste_te.png', label: 'Piste — T', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_piste_croisement', file: 'palette/routes/piste_croisement.png', label: 'Piste — croisement', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_piste_fin', file: 'palette/routes/piste_fin.png', label: 'Piste — fin', category: 'routes', role: 'decal', snap: 256 },
  { key: 'pal_route_jonction', file: 'palette/routes/jonction_goudron_piste.png', label: 'Jonction goudron → piste', category: 'routes', role: 'decal', snap: 256 }
]
