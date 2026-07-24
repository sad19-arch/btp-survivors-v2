import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSolidity } from '../../src/content/assetSolidity'
import type {
  EmbeddedElement,
  LayoutInstance,
  LayoutNpc,
  LayoutPath,
  RenderLayer,
  StageLayout,
} from '../../src/content/stageLayout'
import { getStageCatalog, type AssetRole, type PaletteEntry } from '../../src/editor/PrefabCatalog'
import { initialiseFromStage01 } from './initStageFromStage01'

interface Placement {
  prefab: string
  x: number
  y: number
  rotation?: number
  flipX?: boolean
  scale?: number
}

interface StageSpec {
  groundKey: string
  placements: Placement[]
  paths: LayoutPath[]
  npcs: LayoutNpc[]
}

const instance = (stage: string, placement: Placement, index: number): LayoutInstance => ({
  id: `${stage}_instance_${String(index + 1).padStart(3, '0')}`,
  prefab: placement.prefab,
  x: placement.x,
  y: placement.y,
  flipX: placement.flipX ?? false,
  variant: 0,
  rotation: placement.rotation ?? 0,
  scale: placement.scale ?? 1,
  locked: false,
})

const npc = (id: string, skin: string, x: number, y: number): LayoutNpc => ({
  id,
  skin,
  kind: 'trade',
  x,
  y,
})

const workerPath = (
  id: string,
  points: LayoutPath['points'],
  skin: string,
  count = 1,
): LayoutPath => ({ id, type: 'worker_path', points, skin, count, speed: 70, pauseMs: 900 })

const truckPath = (
  id: string,
  points: LayoutPath['points'],
  skin = 'camion',
): LayoutPath => ({ id, type: 'truck_path', points, skin, count: 1, speed: 135, pauseMs: 1200 })

const PRISONER_PLACEMENTS: Placement[] = [
  { prefab: 'otage', x: -1450, y: -950 },
  { prefab: 'otage', x: 1450, y: -950 },
  { prefab: 'otage', x: -1450, y: 950 },
  { prefab: 'otage', x: 1450, y: 950 },
  { prefab: 'otage', x: 0, y: 1200 },
]

const STAGE_NPC_PREFIX: Record<string, string> = {
  terrassement: 'npc_stage02',
  fondations: 'npc_stage03',
  reseaux_enterres: 'npc_stage04',
  gros_oeuvre: 'npc_stage05',
  echafaudages: 'npc_stage06',
  charpente_toiture: 'npc_stage07',
  second_oeuvre: 'npc_stage08',
  finitions: 'npc_stage09',
  livraison_audit: 'npc_stage10',
}

const SPECS: Record<string, StageSpec> = {
  terrassement: {
    groundKey: 'ground_s2_0',
    placements: [
      { prefab: 'scene_dig_active_spawn', x: 330, y: -120 },
      { prefab: 'obj_decal_s2_tracks', x: 0, y: 80, scale: 1.3 },
      { prefab: 'obj_prop_s2_dirt', x: -230, y: -60 },
      { prefab: 'obj_decal_s2_puddle', x: 170, y: 120 },
      { prefab: 'scene_spoil', x: 1050, y: -350 },
      { prefab: 'scene_stock', x: 750, y: 850 },
      { prefab: 'obj_prop_s2_truck', x: 250, y: 950, rotation: 90 },
      { prefab: 'scene_roll', x: -1100, y: 300 },
      { prefab: 'scene_dig_done', x: -900, y: -900 },
      { prefab: 'obj_decal_s2_tracks', x: 0, y: 850, rotation: 90, scale: 1.6 },
      { prefab: 'obj_prop_s2_dirt', x: 1250, y: -700 },
      { prefab: 'obj_prop_s2_dozer', x: 1200, y: -300 },
    ],
    paths: [
      truckPath('terrassement_truck_access', [{ x: -1500, y: 1050 }, { x: 0, y: 1050 }, { x: 850, y: 750 }]),
      workerPath('terrassement_porter_route', [{ x: 650, y: 700 }, { x: 900, y: 150 }, { x: 350, y: -350 }], 'npc_stage02_porteur'),
    ],
    npcs: [
      npc('terrassement_excavator_operator', 'npc_stage02_conducteur_trade', -180, -260),
      npc('terrassement_signaller', 'npc_stage02_signaleur', 260, -220),
    ],
  },
  fondations: {
    groundKey: 'ground_stage03_0',
    placements: [
      { prefab: 'obj_landmark_stage03', x: -380, y: 20, scale: 1.25 },
      { prefab: 'obj_struct_stage03_pump', x: 350, y: -160, scale: 1.05 },
      { prefab: 'obj_struct_stage03_mixer_work', x: 360, y: 180 },
      { prefab: 'obj_prop_stage03_rebar', x: -210, y: -80, scale: 0.9 },
      { prefab: 'obj_decal_stage03_spill', x: 170, y: 90, scale: 1.2 },
      { prefab: 'obj_prop_stage03_wheelbarrow', x: 210, y: -80 },
      { prefab: 'obj_prop_stage03_concrete_mixer_work', x: 900, y: 700 },
      { prefab: 'scene_foundation_prepared_grid', x: -1050, y: -500 },
      { prefab: 'scene_rebar_stock_big', x: -900, y: 750 },
      { prefab: 'obj_prop_stage03_formwork', x: -650, y: 780 },
      { prefab: 'scene_slab_done', x: 1050, y: -550 },
      { prefab: 'scene_small_mixer_patch', x: 900, y: 700 },
      { prefab: 'scene_access_concrete_trucks', x: 0, y: 1050 },
      { prefab: 'obj_prop_stage03_column_cage', x: -1250, y: -850 },
    ],
    paths: [
      truckPath('fondations_concrete_delivery', [{ x: -1550, y: 1100 }, { x: 150, y: 1100 }, { x: 420, y: -620 }]),
      workerPath('fondations_formwork_route', [{ x: -950, y: 700 }, { x: -650, y: 100 }, { x: -350, y: -500 }], 'npc_stage03_coffreur'),
    ],
    npcs: [
      npc('fondations_concrete_worker', 'npc_stage03_betonnier', 190, 190),
      npc('fondations_formworker', 'npc_stage03_coffreur_trade', -240, -180),
      npc('fondations_patch_worker', 'npc_stage03_cimentier', 900, 560),
    ],
  },
  reseaux_enterres: {
    groundKey: 'ground_stage04_2',
    placements: [
      { prefab: 'obj_landmark_stage04', x: -380, y: 30, scale: 1.2 },
      { prefab: 'obj_prop_stage04_pipes', x: -180, y: -80 },
      { prefab: 'obj_prop_stage04_cable', x: 180, y: 80 },
      { prefab: 'obj_decal_stage04_mud', x: 20, y: 150 },
      { prefab: 'obj_struct_stage04_excavator_work', x: 360, y: -150 },
      ...Array.from({ length: 19 }, (_, index): Placement => ({
        prefab: 'obj_decal_stage04_trench',
        x: -260 + (index - 9) * 110,
        y: -170,
        scale: 1.25,
      })),
      ...Array.from({ length: 12 }, (_, index): Placement => ({
        prefab: 'obj_decal_stage04_trench',
        x: -260,
        y: -720 + index * 110,
        rotation: 90,
        scale: 1.25,
      })),
      { prefab: 'obj_struct_stage04_trench', x: -260, y: -520 },
      { prefab: 'obj_prop_stage04_regard', x: -260, y: -520 },
      { prefab: 'obj_prop_stage04_regard', x: -260, y: 490 },
      { prefab: 'scene_reseaux_enterres_stock', x: -1050, y: 650 },
      { prefab: 'obj_prop_stage04_pipes', x: -1250, y: 850 },
      { prefab: 'obj_prop_stage04_cable', x: -850, y: 850 },
      { prefab: 'obj_decal_stage04_mud', x: 1150, y: 150, scale: 1.5 },
      { prefab: 'obj_prop_stage04_regard', x: -1200, y: -600 },
      { prefab: 'obj_prop_stage04_regard', x: -1200, y: -900 },
    ],
    paths: [
      truckPath('reseaux_pipe_delivery', [{ x: -1800, y: 1150 }, { x: -1100, y: 650 }, { x: -300, y: 150 }]),
      workerPath('reseaux_maintenance_route', [{ x: -1200, y: -900 }, { x: -1200, y: -600 }, { x: -800, y: -520 }], 'npc_stage04_poseur_cable'),
    ],
    npcs: [
      npc('reseaux_electrician', 'npc_stage04_electricien_trade', 170, -210),
      npc('reseaux_pipefitter', 'npc_stage04_plombier', -420, 140),
      npc('reseaux_duct_worker', 'npc_stage04_gainier', -1150, -720),
    ],
  },
  gros_oeuvre: {
    groundKey: 'ground_stage05_0',
    placements: [
      { prefab: 'obj_landmark_stage05', x: -380, y: 20, scale: 1.25 },
      { prefab: 'obj_struct_stage05_crane_work', x: 370, y: -150 },
      { prefab: 'obj_prop_stage05_block_pallet', x: -200, y: -70 },
      { prefab: 'obj_decal_stage05_mortar', x: 170, y: 100 },
      { prefab: 'obj_prop_stage05_concrete_pole', x: 220, y: -70 },
      { prefab: 'obj_struct_stage05_wall', x: 0, y: -650, scale: 1.2 },
      { prefab: 'cluster_storage_gros_oeuvre', x: 0, y: 850 },
      { prefab: 'obj_prop_stage05_block_pallet', x: 450, y: 900 },
      { prefab: 'cluster_plant_gros_oeuvre', x: 1050, y: -250 },
      { prefab: 'obj_decal_stage05_rubble', x: -1150, y: 100, scale: 1.5 },
      { prefab: 'obj_pal_rubble_skip', x: -1250, y: 250 },
      { prefab: 'obj_decal_stage05_lifting_mark', x: 0, y: -850 },
    ],
    paths: [
      truckPath('gros_oeuvre_block_delivery', [{ x: -1600, y: 1050 }, { x: 0, y: 1050 }, { x: 450, y: 850 }]),
      workerPath('gros_oeuvre_block_carrier', [{ x: 0, y: 780 }, { x: 0, y: 300 }, { x: -260, y: -260 }], 'npc_stage05_porteur_blocs'),
    ],
    npcs: [
      npc('gros_oeuvre_mason', 'npc_stage05', -220, -180),
      npc('gros_oeuvre_blocklayer', 'npc_stage05_parpaingueur', -420, 120),
      npc('gros_oeuvre_crane_operator', 'npc_stage05_grutier_trade', 330, -230),
    ],
  },
  echafaudages: {
    groundKey: 'ground_stage06_2',
    placements: [
      { prefab: 'obj_continuity_stage05_shell', x: 0, y: -850, scale: 1.9 },
      { prefab: 'obj_landmark_stage06', x: -390, y: 20, scale: 1.4 },
      { prefab: 'obj_struct_stage06_nacelle_work', x: 380, y: -150 },
      { prefab: 'obj_prop_stage06_tubes', x: -210, y: -60 },
      { prefab: 'obj_prop_stage06_plancher', x: 190, y: 80 },
      { prefab: 'obj_decal_stage06_bolt', x: 0, y: 120 },
      { prefab: 'obj_prop_stage06_scaffold', x: -560, y: -500, scale: 1.7 },
      { prefab: 'obj_prop_stage06_scaffold', x: 560, y: -500, scale: 1.7 },
      { prefab: 'obj_struct_stage06_nacelle_work', x: 1150, y: -250 },
      { prefab: 'cluster_storage_echafaudages', x: 0, y: 900 },
      { prefab: 'obj_prop_stage06_scaffold', x: -1250, y: -650, rotation: 90, scale: 1.7 },
      { prefab: 'obj_prop_stage06_scaffold', x: -1250, y: 0, rotation: 90, scale: 1.7 },
      { prefab: 'obj_prop_stage06_scaffold', x: 1250, y: -650, rotation: 90, scale: 1.7 },
      { prefab: 'obj_prop_stage06_scaffold', x: 1250, y: 0, rotation: 90, scale: 1.7 },
      { prefab: 'obj_prop_stage06_scaffold', x: -650, y: -1050, scale: 1.7 },
      { prefab: 'obj_prop_stage06_scaffold', x: 0, y: -1050, scale: 1.7 },
      { prefab: 'obj_prop_stage06_scaffold', x: 650, y: -1050, scale: 1.7 },
      { prefab: 'obj_decal_stage06_shadow', x: -600, y: -600, scale: 1.5 },
      { prefab: 'obj_decal_stage06_bolt', x: 650, y: -300 },
      { prefab: 'obj_prop_stage06_echelle', x: 350, y: 850 },
    ],
    paths: [
      truckPath('echafaudages_nacelle_access', [{ x: 1750, y: 1100 }, { x: 1450, y: 350 }, { x: 1150, y: -250 }]),
      workerPath('echafaudages_assembly_route', [{ x: 0, y: 850 }, { x: -500, y: 200 }, { x: -300, y: -500 }], 'npc_stage06_monteur_tube'),
      workerPath('echafaudages_plank_carrier', [{ x: -300, y: 850 }, { x: -500, y: 350 }, { x: -560, y: -500 }], 'npc_stage06_porteur_planche'),
      workerPath('echafaudages_ladder_carrier', [{ x: 350, y: 850 }, { x: 520, y: 350 }, { x: 560, y: -500 }], 'npc_stage06_porteur_echelle'),
    ],
    npcs: [
      npc('echafaudages_assembler', 'npc_stage06_monteur_trade', -220, -180),
      npc('echafaudages_lift_operator', 'npc_stage06', 1100, -420),
    ],
  },
  charpente_toiture: {
    groundKey: 'ground_stage07_1',
    placements: [
      { prefab: 'obj_continuity_stage05_shell', x: 0, y: -850, scale: 1.9 },
      { prefab: 'obj_landmark_stage07', x: -390, y: 20, scale: 1.35 },
      { prefab: 'obj_struct_stage07_crane_work', x: 380, y: -150 },
      { prefab: 'obj_struct_stage07_load', x: 300, y: -520 },
      { prefab: 'obj_prop_stage07_beam', x: -210, y: -60 },
      { prefab: 'obj_prop_stage07_tile_pile', x: 190, y: 80 },
      { prefab: 'obj_decal_stage07_sawdust', x: 0, y: 120 },
      { prefab: 'obj_struct_stage07_truss', x: 0, y: -900 },
      { prefab: 'obj_prop_stage07_tile_pile', x: 1050, y: 650 },
      { prefab: 'scene_charpente_toiture_stock', x: -1100, y: 100 },
      { prefab: 'obj_prop_stage07_beam', x: -1250, y: 350 },
      { prefab: 'obj_prop_stage07_insul', x: 1000, y: -650 },
      { prefab: 'obj_prop_stage07_gutter', x: 1250, y: -650 },
      { prefab: 'obj_decal_stage07_sawdust', x: -1050, y: -750, scale: 1.5 },
      { prefab: 'obj_decal_stage07_truss_shadow', x: 0, y: -200, scale: 1.4 },
    ],
    paths: [
      truckPath('charpente_tile_delivery', [{ x: 1600, y: 1100 }, { x: 1250, y: 700 }, { x: 800, y: 350 }]),
      workerPath('charpente_tile_carrier', [{ x: 1200, y: 700 }, { x: 700, y: 250 }, { x: 260, y: -300 }], 'npc_stage07_porteur_tuiles'),
    ],
    npcs: [
      npc('charpente_carpenter', 'npc_stage07_charpentier_trade', -220, -180),
      npc('charpente_frame_worker', 'npc_stage07_charpentier', -1050, 100),
      npc('charpente_roofer', 'npc_stage07_poseur_liteau', 1050, 500),
    ],
  },
  second_oeuvre: {
    groundKey: 'ground_stage08_2',
    placements: [
      { prefab: 'obj_continuity_stage05_shell', x: 0, y: -900, scale: 2 },
      { prefab: 'obj_landmark_stage08', x: -390, y: 20, scale: 1.35 },
      { prefab: 'obj_struct_stage08_partition', x: 390, y: -160, scale: 1.3 },
      { prefab: 'obj_prop_stage08_drywall', x: -210, y: -60 },
      { prefab: 'obj_prop_stage08_pvc', x: 190, y: 80 },
      { prefab: 'obj_decal_stage08_cables', x: 0, y: 120 },
      { prefab: 'obj_struct_stage08_partition', x: -650, y: -450, rotation: 90, scale: 1.5 },
      { prefab: 'obj_struct_stage08_partition', x: 650, y: -450, scale: 1.5 },
      { prefab: 'obj_struct_stage08_column', x: -900, y: -800, scale: 1.4 },
      { prefab: 'obj_struct_stage08_column', x: 900, y: -800, scale: 1.4 },
      { prefab: 'cluster_storage_second_oeuvre', x: 0, y: 900 },
      { prefab: 'obj_prop_stage08_elecpanel', x: 1150, y: -250 },
      { prefab: 'obj_prop_stage08_cables', x: 950, y: 100 },
      { prefab: 'obj_prop_stage08_pvc', x: -1100, y: 50 },
      { prefab: 'obj_struct_stage08_partition', x: 0, y: -700, scale: 1.5 },
      { prefab: 'obj_struct_stage08_partition', x: -650, y: 350, rotation: 90, scale: 1.5 },
      { prefab: 'obj_struct_stage08_partition', x: 650, y: 350, scale: 1.5 },
      { prefab: 'obj_decal_stage08_cables', x: 750, y: -100, scale: 1.4 },
      { prefab: 'obj_decal_stage08_plaster', x: -650, y: -650, scale: 1.4 },
    ],
    paths: [
      truckPath('second_oeuvre_dry_delivery', [{ x: -1600, y: 1100 }, { x: 0, y: 1100 }, { x: 0, y: 800 }]),
      workerPath('second_oeuvre_drywall_carrier', [{ x: 0, y: 820 }, { x: -350, y: 350 }, { x: -650, y: -350 }], 'npc_stage08_porteur'),
    ],
    npcs: [
      npc('second_oeuvre_plaquiste', 'npc_stage08_plaquiste_trade', -220, -180),
      npc('second_oeuvre_electrician', 'npc_stage08_elec', 1080, -220),
      npc('second_oeuvre_plumber', 'npc_stage08_plombier_trade', -1050, 200),
    ],
  },
  finitions: {
    groundKey: 'ground_stage09_3',
    placements: [
      { prefab: 'obj_continuity_stage05_shell', x: 0, y: -900, scale: 2 },
      { prefab: 'obj_continuity_stage08_partition', x: -700, y: -450, rotation: 90, scale: 1.4 },
      { prefab: 'obj_continuity_stage08_partition', x: 700, y: -450, scale: 1.4 },
      { prefab: 'obj_landmark_stage09', x: -390, y: 20, scale: 1.35 },
      { prefab: 'obj_struct_stage09_station', x: 380, y: -150 },
      { prefab: 'obj_prop_stage09_paint', x: -210, y: -60 },
      { prefab: 'obj_prop_stage09_tarp', x: 190, y: 80 },
      { prefab: 'obj_decal_stage09_paint_spot', x: 0, y: 120 },
      { prefab: 'obj_prop_stage09_paint', x: -180, y: -300, scale: 1.3 },
      { prefab: 'obj_prop_stage09_tarp', x: 160, y: -260, scale: 1.3 },
      { prefab: 'obj_prop_stage09_tile_pallet', x: -1100, y: 50 },
      { prefab: 'obj_prop_stage09_tile_cutter', x: -950, y: 250 },
      { prefab: 'cluster_storage_finitions', x: 0, y: 900 },
      { prefab: 'obj_struct_stage09_room', x: 0, y: -1050, scale: 1.8 },
      { prefab: 'obj_decal_stage09_paint_spot', x: 950, y: 650, scale: 1.2 },
      { prefab: 'obj_decal_stage09_masking_tape', x: 1150, y: 750 },
    ],
    paths: [
      workerPath('finitions_paint_route', [{ x: 0, y: 820 }, { x: 0, y: 100 }, { x: -150, y: -500 }], 'npc_stage09_porteur_pots'),
    ],
    npcs: [
      npc('finitions_painter', 'npc_stage09', -220, -180),
      npc('finitions_tiler', 'npc_stage09_carreleur_trade', -1000, 100),
      npc('finitions_floor_worker', 'npc_stage09_poseur_sol', 0, -900),
    ],
  },
  livraison_audit: {
    groundKey: 'ground_stage10_2',
    placements: [
      { prefab: 'obj_landmark_stage10', x: -390, y: 20, scale: 1.35 },
      { prefab: 'obj_struct_stage10_van', x: 380, y: -150 },
      { prefab: 'obj_prop_stage10_cones', x: -210, y: -60 },
      { prefab: 'obj_prop_stage10_sign_ok', x: 190, y: 80 },
      { prefab: 'obj_decal_stage10_tape', x: 0, y: 120 },
      { prefab: 'obj_site_gate', x: -360, y: -330 },
      { prefab: 'obj_struct_stage10_building', x: 0, y: -1050, scale: 4 },
      { prefab: 'obj_struct_stage10_building', x: -900, y: -900, scale: 2 },
      { prefab: 'obj_struct_stage10_building', x: 900, y: -900, scale: 2 },
      { prefab: 'scene_livraison_audit_stock', x: -800, y: 0 },
      { prefab: 'obj_decal_stage10_tape', x: 0, y: 450, scale: 1.5 },
      { prefab: 'obj_prop_stage10_cones', x: -600, y: 550 },
      { prefab: 'obj_prop_stage10_cones', x: 600, y: 550 },
      { prefab: 'obj_decal_stage10_crack', x: 1100, y: 750 },
      { prefab: 'obj_prop_stage10_barrier', x: 1250, y: 850 },
    ],
    paths: [
      truckPath('livraison_clean_circulation', [{ x: -1800, y: 1150 }, { x: 0, y: 1150 }, { x: 0, y: 300 }, { x: -250, y: -350 }]),
      workerPath('livraison_audit_route', [{ x: -750, y: 0 }, { x: -250, y: -300 }, { x: 350, y: -450 }], 'npc_stage10_technicien'),
      workerPath('livraison_carton_carrier', [{ x: -1200, y: 650 }, { x: -800, y: 100 }, { x: -250, y: -250 }], 'npc_stage10_porteur_carton'),
    ],
    npcs: [
      npc('livraison_inspector', 'npc_stage10_inspecteur_trade', 190, -210),
      npc('livraison_reception_agent', 'npc_stage10_agent_reception', -220, -180),
      npc('livraison_technician', 'npc_stage10_technicien_trade', -780, -100),
    ],
  },
}

function layerForRole(role: AssetRole | undefined): RenderLayer | undefined {
  if (role === 'ground') {return 'ground'}
  if (role === 'decal') {return 'decal'}
  if (role === 'landmark' || role === 'structure' || role === 'column') {return 'struct'}
  if (role === 'prop' || role === 'destructible') {return 'prop'}
  return undefined
}

function resolvedElements(stage: string, entry: PaletteEntry): EmbeddedElement[] {
  const catalog = getStageCatalog(stage)
  if (entry.prisoner === true) {
    const element = entry.elements?.[0]
    return element === undefined
      ? []
      : [{ assetKey: element.assetKey, dx: element.dx, dy: element.dy, scale: element.scale, collide: 'none', prisoner: {} }]
  }
  if (entry.destructibleTypeId !== undefined) {
    const element = entry.elements?.[0]
    return element === undefined
      ? []
      : [{
          assetKey: element.assetKey,
          dx: element.dx,
          dy: element.dy,
          scale: element.scale,
          collide: 'none',
          destructible: { typeId: entry.destructibleTypeId },
        }]
  }
  return (entry.elements ?? []).map((element): EmbeddedElement => {
    const role = catalog.assets.find((asset) => asset.key === element.assetKey)?.role
    const fallback =
      role === 'landmark' || role === 'structure' || role === 'column'
        ? { collide: 'both' as const, shape: { kind: 'circle' as const, r: Math.max(16, element.scale * 40) } }
        : undefined
    const solidity = resolveSolidity(element.assetKey, undefined, fallback)
    const embedded: EmbeddedElement = {
      assetKey: element.assetKey,
      dx: element.dx,
      dy: element.dy,
      scale: element.scale,
      collide: solidity.collide,
    }
    const layer = layerForRole(role)
    if (layer !== undefined) {embedded.layer = layer}
    if (element.tile !== undefined) {embedded.tile = structuredClone(element.tile)}
    if (element.flipX === true) {embedded.flipX = true}
    if (solidity.collide !== 'none') {embedded.shape = structuredClone(solidity.shape)}
    return embedded
  })
}

function bakeInstanceScale(placed: LayoutInstance): void {
  const scale = placed.scale ?? 1
  if (scale === 1 || placed.elements === undefined) {
    placed.scale = 1
    return
  }
  placed.elements = placed.elements.map((element): EmbeddedElement => {
    const scaled: EmbeddedElement = { ...element, scale: element.scale * scale }
    if (element.tile !== undefined) {
      scaled.tile = { w: element.tile.w * scale, h: element.tile.h * scale }
    }
    if (element.shape?.kind === 'circle') {
      scaled.shape = { kind: 'circle', r: element.shape.r * scale }
    } else if (element.shape?.kind === 'segment') {
      scaled.shape = {
        kind: 'segment',
        x2: element.shape.x2 * scale,
        y2: element.shape.y2 * scale,
        thickness: element.shape.thickness * scale,
      }
    }
    return scaled
  })
  placed.scale = 1
}

function completeExplicitPopulation(stage: string, spec: StageSpec): { npcs: LayoutNpc[]; paths: LayoutPath[] } {
  const npcs = structuredClone(spec.npcs)
  const paths = structuredClone(spec.paths)
  const used = new Set([
    ...npcs.map((entry) => entry.skin),
    ...paths.flatMap((entry) => entry.skin === undefined ? [] : [entry.skin]),
  ])
  const prefix = STAGE_NPC_PREFIX[stage]
  if (prefix === undefined) {throw new Error(`${stage}: préfixe PNJ absent`)}
  const entries = getStageCatalog(stage).entries.filter(
    (entry) => entry.npcSkin?.startsWith(prefix) === true && !used.has(entry.npcSkin),
  )
  const anchors = [
    { x: -900, y: -700 },
    { x: 900, y: -700 },
    { x: -1000, y: 600 },
    { x: 1000, y: 600 },
    { x: -650, y: 900 },
    { x: 650, y: 900 },
  ]
  for (const [index, entry] of entries.entries()) {
    const skin = entry.npcSkin
    if (skin === undefined) {continue}
    const anchor = anchors[index % anchors.length] as { x: number; y: number }
    if (entry.npcKind === 'trade') {
      npcs.push(npc(`${stage}_trade_${index + 1}`, skin, anchor.x, anchor.y))
    } else {
      paths.push(workerPath(
        `${stage}_worker_${index + 1}`,
        [
          { x: anchor.x - 180, y: anchor.y },
          { x: anchor.x, y: anchor.y - 180 },
          { x: anchor.x + 180, y: anchor.y },
        ],
        skin,
      ))
    }
    used.add(skin)
  }
  return { npcs, paths }
}

function validateNpcSkins(stage: string, npcs: LayoutNpc[], paths: LayoutPath[]): void {
  const skins = new Set(
    getStageCatalog(stage).entries
      .filter((entry) => entry.npcSkin !== undefined)
      .map((entry) => entry.npcSkin as string),
  )
  skins.add('camion')
  for (const item of [...npcs, ...paths.filter((path) => path.skin !== undefined).map((path) => ({ skin: path.skin as string }))]) {
    if (!skins.has(item.skin)) {throw new Error(`${stage}: skin inconnu ${item.skin}`)}
  }
}

export function composeStage(stage01: StageLayout, stage: string, spec: StageSpec): StageLayout {
  const layout = initialiseFromStage01(stage01, stage)
  const catalog = getStageCatalog(stage)
  const population = completeExplicitPopulation(stage, spec)
  validateNpcSkins(stage, population.npcs, population.paths)
  const authored = [...spec.placements, ...PRISONER_PLACEMENTS].map(
    (placement, index) => instance(stage, placement, index),
  )
  for (const placed of authored) {
    const entry = catalog.entries.find((candidate) => candidate.id === placed.prefab)
    if (entry === undefined) {throw new Error(`${stage}: prefab inconnu ${placed.prefab}`)}
    placed.elements = resolvedElements(stage, entry)
    bakeInstanceScale(placed)
  }
  layout.instances.push(...authored)
  layout.paths = population.paths
  layout.npcs = population.npcs
  layout.groundKey = spec.groundKey
  layout.keepSitePlan = false
  return layout
}

export { SPECS }

export const MANUAL_LAYOUT_SOURCE_OF_TRUTH =
  'Génération CLI désactivée : les stages 02-10 sont une source manuelle. Utiliser Charger un fichier dans le Stage Composer.'

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  throw new Error(MANUAL_LAYOUT_SOURCE_OF_TRUTH)
}
