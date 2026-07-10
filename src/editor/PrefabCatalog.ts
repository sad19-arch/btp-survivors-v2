/**
 * PrefabCatalog — catalogue VISUEL multi-stage du Stage Composer Editor.
 *
 * Data-driven : pour CHAQUE phase, les assets sont dérivés de `STAGE_RENDER`
 * (mêmes fichiers que le jeu, zéro duplication) et exposés en :
 *   - SCÈNES composées (prioritaires) — authorées pour terrassement/fondations,
 *     sinon 2 gabarits auto (poste de travail + stock) à ajuster ;
 *   - OBJETS isolés (un par asset) ;
 *   - MARQUEURS (spawn / zone signature / chemins).
 *
 * Un « catalogue actif » (stage courant) est mémorisé ; `editorAsset`/`paletteEntry`
 * y résolvent leurs clés.
 */

import { STAGE_RENDER } from '@render/stages'
import { CLUSTERS } from '@content/clusters'

export type EntryKind = 'scene' | 'stock' | 'route' | 'logistique' | 'marqueur' | 'decor' | 'objet'
export type EntrySize = 'petite' | 'moyenne' | 'grande'

export interface PrefabElement {
  assetKey: string
  dx: number
  dy: number
  scale: number
  flipX?: boolean
}

export type MarkerTool = 'spawn' | 'signature_zone' | 'worker_path' | 'truck_path'

export interface PaletteEntry {
  id: string
  label: string
  category: string
  kind: EntryKind
  size: EntrySize
  elements?: PrefabElement[]
  marker?: MarkerTool
}

export interface Category {
  id: string
  label: string
}

export type AssetRole = 'ground' | 'landmark' | 'structure' | 'prop' | 'decal' | 'worker' | 'column'

export interface EditorAsset {
  key: string
  file: string
  sheet?: boolean
  frame?: number
  label: string
  role: AssetRole
}

export interface StageCatalog {
  stageId: string
  assets: EditorAsset[]
  entries: PaletteEntry[]
  groundKey: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Stages
// ─────────────────────────────────────────────────────────────────────────────

export const STAGE_LIST: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'terrain_vierge', label: '01 · Terrain vierge' },
  { id: 'terrassement', label: '02 · Terrassement' },
  { id: 'fondations', label: '03 · Fondations' },
  { id: 'reseaux_enterres', label: '04 · Réseaux enterrés' },
  { id: 'gros_oeuvre', label: '05 · Gros œuvre' },
  { id: 'echafaudages', label: '06 · Échafaudages' },
  { id: 'charpente_toiture', label: '07 · Charpente / Toiture' },
  { id: 'second_oeuvre', label: '08 · Second œuvre' },
  { id: 'finitions', label: '09 · Finitions' },
  { id: 'livraison_audit', label: '10 · Livraison / Audit' }
]

export const CATEGORIES: Category[] = [
  { id: 'scenes', label: 'Scènes principales' },
  { id: 'stocks', label: 'Stocks & logistique' },
  { id: 'routes', label: 'Routes & accès' },
  { id: 'workers', label: 'Ouvriers & chemins' },
  { id: 'safety', label: 'Sécurité / barrières' },
  { id: 'decor', label: 'Décor secondaire' },
  { id: 'objects', label: 'Objets isolés avancés' },
  { id: 'markers', label: 'Marqueurs' }
]

export function kindLabel(kind: EntryKind): string {
  const map: Record<EntryKind, string> = {
    scene: 'Scène',
    stock: 'Stock',
    route: 'Route',
    logistique: 'Logistique',
    marqueur: 'Marqueur',
    decor: 'Décor',
    objet: 'Objet'
  }
  return map[kind]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function humanize(file: string): string {
  const base = file.split('/').pop()?.replace(/\.png$/i, '') ?? file
  return base.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const MARKERS: PaletteEntry[] = [
  { id: 'marker_spawn', label: 'Spawn joueur', category: 'markers', kind: 'marqueur', size: 'petite', marker: 'spawn' },
  { id: 'marker_signature_zone', label: 'Zone signature', category: 'markers', kind: 'marqueur', size: 'grande', marker: 'signature_zone' },
  { id: 'marker_truck_path', label: 'Chemin camion', category: 'markers', kind: 'marqueur', size: 'petite', marker: 'truck_path' },
  { id: 'marker_worker_path', label: 'Chemin ouvrier', category: 'workers', kind: 'marqueur', size: 'petite', marker: 'worker_path' }
]

/** Assets d'un stage, dérivés du manifeste de rendu du jeu. */
function buildStageAssets(stageId: string): { assets: EditorAsset[]; groundKey: string | null } {
  const sr = STAGE_RENDER[stageId] ?? STAGE_RENDER.terrain_vierge
  const assets: EditorAsset[] = []
  if (sr === undefined) {
    return { assets, groundKey: null }
  }
  const seen = new Set<string>()
  const add = (a: EditorAsset): void => {
    if (a.key === '' || seen.has(a.key)) {
      return
    }
    seen.add(a.key)
    assets.push(a)
  }

  const groundTile = sr.ground[sr.baseTileIndex ?? 0] ?? sr.ground[0]
  const groundKey = groundTile?.key ?? null
  if (groundTile !== undefined) {
    add({ key: groundTile.key, file: groundTile.file, label: 'Sol', role: 'ground' })
  }
  if (sr.landmark !== undefined) {
    add({ key: sr.landmark.key, file: sr.landmark.file, label: humanize(sr.landmark.file), role: 'landmark' })
  }
  for (const s of sr.structures ?? []) {
    add({ key: s.key, file: s.file, label: humanize(s.file), role: 'structure' })
  }
  for (const p of sr.props) {
    add({ key: p.key, file: p.file, label: humanize(p.file), role: 'prop' })
  }
  for (const d of sr.decals) {
    add({ key: d.key, file: d.file, label: humanize(d.file), role: 'decal' })
  }
  const worker = sr.ambient?.[0]
  if (worker !== undefined) {
    add({ key: worker.key, file: worker.file, sheet: true, frame: worker.frame, label: humanize(worker.file), role: 'worker' })
  }
  if (sr.interior !== undefined) {
    add({ key: sr.interior.columnKey, file: sr.interior.columnFile, label: 'Poteau', role: 'column' })
  }
  return { assets, groundKey }
}

/** Un objet isolé par asset (hors sol). */
function objectEntries(assets: EditorAsset[]): PaletteEntry[] {
  const out: PaletteEntry[] = []
  for (const a of assets) {
    if (a.role === 'ground') {
      continue
    }
    if (a.role === 'decal') {
      out.push({ id: 'obj_' + a.key, label: a.label, category: 'decor', kind: 'decor', size: 'petite', elements: [{ assetKey: a.key, dx: 0, dy: 0, scale: 1.0 }] })
    } else if (a.role === 'worker') {
      out.push({ id: 'obj_' + a.key, label: 'Ouvrier — ' + a.label, category: 'workers', kind: 'logistique', size: 'petite', elements: [{ assetKey: a.key, dx: 0, dy: 0, scale: 0.55 }] })
    } else {
      const size: EntrySize = a.role === 'landmark' || a.role === 'structure' ? 'grande' : 'moyenne'
      out.push({ id: 'obj_' + a.key, label: a.label, category: 'objects', kind: 'objet', size, elements: [{ assetKey: a.key, dx: 0, dy: 0, scale: 1.0 }] })
    }
  }
  return out
}

/** 2 gabarits auto (poste de travail + stock) pour les stages non authorés. */
function autoScenes(stageId: string, assets: EditorAsset[]): PaletteEntry[] {
  const structures = assets.filter((a) => a.role === 'structure')
  const props = assets.filter((a) => a.role === 'prop')
  const landmark = assets.find((a) => a.role === 'landmark')
  const out: PaletteEntry[] = []

  const work: PrefabElement[] = []
  if (landmark !== undefined) {
    work.push({ assetKey: landmark.key, dx: 0, dy: 0, scale: 1.0 })
  }
  if (structures[0] !== undefined) {
    work.push({ assetKey: structures[0].key, dx: -30, dy: -155, scale: 1.05 })
  }
  if (structures[1] !== undefined) {
    work.push({ assetKey: structures[1].key, dx: 195, dy: -40, scale: 0.95 })
  }
  if (props[0] !== undefined) {
    work.push({ assetKey: props[0].key, dx: -140, dy: 60, scale: 0.8 })
    work.push({ assetKey: props[0].key, dx: 125, dy: 75, scale: 0.8 })
  }
  if (work.length >= 2) {
    out.push({ id: `scene_${stageId}_work`, label: 'Poste de travail', category: 'scenes', kind: 'scene', size: 'grande', elements: work })
  }

  const base = props[0]
  if (base !== undefined) {
    const stock: PrefabElement[] = [-135, -45, 45, 135].map((dx, i) => ({ assetKey: (props[i % props.length] ?? base).key, dx, dy: 0, scale: 0.8 }))
    out.push({ id: `scene_${stageId}_stock`, label: 'Stock de matériel', category: 'stocks', kind: 'stock', size: 'moyenne', elements: stock })
  }
  return out
}

/** Convertit un cluster du jeu (clusters.ts) en scène de palette. */
function clusterEntry(id: string, label: string, kind: EntryKind, size: EntrySize, category: string): PaletteEntry | null {
  const def = CLUSTERS[id]
  if (def === undefined) {
    return null
  }
  const elements: PrefabElement[] = def.elements.map((el) => ({ assetKey: el.assetKey, dx: el.dx, dy: el.dy, scale: el.scale, flipX: el.flipX === true }))
  return { id, label, category, kind, size, elements }
}

// Scènes AUTHORÉES (les meilleures) par stage.
const SLAB = 'landmark_stage03', MIXER = 'struct_stage03_mixer', PUMP = 'struct_stage03_pump'
const BAY = 'struct_stage03_bay', SMALLMIX = 'prop_stage03_concrete_mixer', REBAR = 'prop_stage03_rebar'
const FORM = 'prop_stage03_formwork', SPILL = 'decal_stage03_spill', CRACK = 'decal_stage03_crack', W03 = 'npc_stage03'

function authoredScenes(stageId: string): PaletteEntry[] {
  if (stageId === 'fondations') {
    return [
      { id: 'scene_foundation_pour_large', label: 'Coulage de dalle (grande)', category: 'scenes', kind: 'scene', size: 'grande', elements: [
        { assetKey: SLAB, dx: 0, dy: 0, scale: 1.2 }, { assetKey: REBAR, dx: -70, dy: -20, scale: 0.7 }, { assetKey: REBAR, dx: 65, dy: 25, scale: 0.7 },
        { assetKey: BAY, dx: -175, dy: 55, scale: 0.8 }, { assetKey: BAY, dx: 165, dy: -60, scale: 0.8 }, { assetKey: PUMP, dx: 215, dy: -30, scale: 1.05 },
        { assetKey: MIXER, dx: -45, dy: -185, scale: 1.1 }, { assetKey: SPILL, dx: 0, dy: 45, scale: 1.15 }, { assetKey: W03, dx: 95, dy: 70, scale: 0.5 } ] },
      { id: 'scene_foundation_prepared_grid', label: 'Fouille ferraillée (préparée)', category: 'scenes', kind: 'scene', size: 'grande', elements: [
        { assetKey: BAY, dx: -150, dy: -60, scale: 0.8 }, { assetKey: BAY, dx: 150, dy: -60, scale: 0.8 }, { assetKey: BAY, dx: 0, dy: 75, scale: 0.8 },
        { assetKey: REBAR, dx: -65, dy: 10, scale: 0.72 }, { assetKey: REBAR, dx: 70, dy: 20, scale: 0.72 }, { assetKey: FORM, dx: 0, dy: -10, scale: 0.8 } ] },
      { id: 'scene_slab_done', label: 'Dalle coulée (finie)', category: 'scenes', kind: 'scene', size: 'moyenne', elements: [
        { assetKey: SLAB, dx: 0, dy: 0, scale: 1.15 }, { assetKey: CRACK, dx: 35, dy: 25, scale: 0.9 } ] },
      { id: 'scene_small_mixer_patch', label: 'Petit poste bétonnière', category: 'scenes', kind: 'scene', size: 'petite', elements: [
        { assetKey: SMALLMIX, dx: 0, dy: 0, scale: 0.9 }, { assetKey: FORM, dx: -75, dy: 25, scale: 0.7 }, { assetKey: SPILL, dx: 45, dy: 35, scale: 0.9 } ] },
      { id: 'scene_rebar_stock_big', label: 'Stock de ferraillage', category: 'stocks', kind: 'stock', size: 'moyenne', elements: [
        { assetKey: REBAR, dx: -135, dy: 0, scale: 0.8 }, { assetKey: REBAR, dx: -45, dy: 0, scale: 0.8 }, { assetKey: REBAR, dx: 45, dy: 0, scale: 0.8 }, { assetKey: REBAR, dx: 135, dy: 0, scale: 0.8 } ] },
      { id: 'scene_access_concrete_trucks', label: 'Voie d\'accès toupies', category: 'routes', kind: 'route', size: 'grande', elements: [
        { assetKey: MIXER, dx: -160, dy: 0, scale: 1.0 }, { assetKey: MIXER, dx: 160, dy: 8, scale: 1.0, flipX: true }, { assetKey: SPILL, dx: 0, dy: 60, scale: 0.8 } ] }
    ]
  }
  if (stageId === 'terrassement') {
    return [
      clusterEntry('scene_dig_active_spawn', 'Front actif (signature)', 'scene', 'grande', 'scenes'),
      clusterEntry('scene_dig_active', 'Front de creusement', 'scene', 'grande', 'scenes'),
      clusterEntry('scene_dig_done', 'Fouille creusée', 'scene', 'moyenne', 'scenes'),
      clusterEntry('scene_spoil', 'Zone de déblais (bull)', 'scene', 'moyenne', 'stocks'),
      clusterEntry('scene_stock', 'Stock de terre', 'stock', 'moyenne', 'stocks'),
      clusterEntry('scene_roll', 'Compactage (rouleau)', 'scene', 'petite', 'scenes')
    ].filter((e): e is PaletteEntry => e !== null)
  }
  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue par stage (caché) + catalogue « actif »
// ─────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, StageCatalog>()

export function getStageCatalog(stageId: string): StageCatalog {
  const hit = cache.get(stageId)
  if (hit !== undefined) {
    return hit
  }
  const { assets, groundKey } = buildStageAssets(stageId)
  const authored = authoredScenes(stageId)
  const scenes = authored.length > 0 ? authored : autoScenes(stageId, assets)
  const entries = [...scenes, ...objectEntries(assets), ...MARKERS]
  const cat: StageCatalog = { stageId, assets, entries, groundKey }
  cache.set(stageId, cat)
  return cat
}

let active: StageCatalog = getStageCatalog('fondations')

export function setActiveStage(stageId: string): void {
  active = getStageCatalog(stageId)
}
export function activeAssets(): readonly EditorAsset[] {
  return active.assets
}
export function activeEntries(): readonly PaletteEntry[] {
  return active.entries
}
export function activeGroundKey(): string | null {
  return active.groundKey
}
export function editorAsset(key: string): EditorAsset | undefined {
  return active.assets.find((a) => a.key === key)
}
export function paletteEntry(id: string): PaletteEntry | undefined {
  return active.entries.find((e) => e.id === id)
}
