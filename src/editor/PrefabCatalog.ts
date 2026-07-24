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

import { STAGE_RENDER, SHARED_WORKER_NPCS, CITY_BUILDINGS, CAMION_SKIN, type StageRender, type StageAmbientNpc } from '@render/stages'
import { CLUSTERS } from '@content/clusters'
import type { MarkerType, PathType, TilePatch } from '@content/stageLayout'
import { destructiblesForStage } from '@content/destructibles'
import { PALETTE_ASSETS, type PaletteAssetDef } from '@content/paletteAssets'
import { ZONE_DEFS } from './zones'

export type EntryKind = 'scene' | 'stock' | 'route' | 'logistique' | 'marqueur' | 'decor' | 'objet'
export type EntrySize = 'petite' | 'moyenne' | 'grande'

export interface PrefabElement {
  assetKey: string
  dx: number
  dy: number
  scale: number
  flipX?: boolean
  /** Plaque de sol : texture RÉPÉTÉE sur w×h px (et non étirée). */
  tile?: TilePatch
}

export type MarkerTool = 'spawn' | MarkerType | PathType

export interface PaletteEntry {
  id: string
  label: string
  category: string
  kind: EntryKind
  size: EntrySize
  elements?: PrefabElement[]
  marker?: MarkerTool
  /** Skin (feuille) du PNJ posé par cette entrée (sections `npc_metier`/`npc_ouvrier`). */
  npcSkin?: string
  /** Catégorie de PNJ : 'trade' = métier fixe ; 'worker' = ouvrier mobile. */
  npcKind?: 'trade' | 'worker'
  /** Type de destructible posé par cette entrée (catégorie `destructibles`). */
  destructibleTypeId?: string
  /** Otage/prisonnier posé par cette entrée (catégorie `prisoners`). Un seul type. */
  prisoner?: boolean
  /**
   * Pas de grille IMPOSÉ à la pose, en px (défaut : `EditorState.gridSize`, et
   * seulement si le snap global est actif).
   *
   * Le kit de routes est le cas qui l'exige : deux tuiles 256 ne raccordent QUE
   * si elles sont posées sur un multiple de 256. Or le snap global est à `false`
   * par défaut et la grille à 128 → à la souris, deux tuiles ne tombent JAMAIS
   * en face. Une entrée qui déclare `snap` force donc l'alignement, que le snap
   * global soit actif ou non : c'est une contrainte de l'ASSET, pas une
   * préférence de l'utilisateur.
   *
   * Déclaré en DONNÉE (comme le rôle → la couche) : surtout pas déduit d'un
   * match de sous-chaîne sur la clé.
   */
  snap?: number
}

export interface Category {
  id: string
  label: string
}

export type AssetRole = 'ground' | 'landmark' | 'structure' | 'prop' | 'decal' | 'worker' | 'column' | 'destructible'

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
  { id: 'sol', label: 'Sol (textures)' },
  { id: 'npc_metier', label: 'PNJ métier (fixe)' },
  { id: 'npc_ouvrier', label: 'PNJ ouvrier (mobile)' },
  { id: 'destructibles', label: 'Destructibles (cassables)' },
  { id: 'prisoners', label: 'Otages (prisonniers)' },
  { id: 'topo', label: 'Implantation & topographie' },
  { id: 'marking', label: 'Marquage au sol' },
  { id: 'entrance', label: 'Entrée & signalétique' },
  { id: 'baselife', label: 'Base vie légère' },
  { id: 'stocks', label: 'Stocks & logistique' },
  { id: 'routes', label: 'Routes & accès' },
  { id: 'workers', label: 'Chemins (trajets)' },
  { id: 'safety', label: 'Sécurité / barrières' },
  // Pack « palette » (`public/palette/*`) : décor PARTAGÉ par les 10 stages, versé
  // dans `SHARED_DECOR_ASSETS`. L'ordre de ce tableau = l'ordre d'affichage.
  { id: 'verdure', label: 'Verdure' },
  { id: 'mobilier', label: 'Mobilier urbain' },
  { id: 'reseaux', label: 'Réseaux & stockage' },
  { id: 'engins', label: 'Engins statiques' },
  { id: 'vie_chantier', label: 'Vie de chantier' },
  { id: 'marquages', label: 'Marquages & traces' },
  { id: 'nature', label: 'Nature & périphérie' },
  { id: 'decor', label: 'Décor secondaire' },
  { id: 'objects', label: 'Objets isolés avancés' },
  { id: 'buildings', label: 'Immeubles (bordure)' },
  { id: 'divers', label: 'Divers' },
  { id: 'markers', label: 'Marqueurs' }
]

/**
 * PACK « PALETTE » — décor générique PARTAGÉ par les 10 stages (`public/palette/*`).
 *
 * Ces assets n'appartiennent à AUCUNE phase : une haie, un lampadaire ou un
 * big-bag ont leur place sur le terrain vierge comme sur la livraison. Ils ne
 * passent donc pas par `STAGE_RENDER` (qui porte l'identité d'UNE phase) mais par
 * `SHARED_DECOR_ASSETS`, seul mécanisme de partage cross-stage du catalogue.
 * Le jeu ne les scatter jamais : ils sont posés à la main dans l'éditeur.
 *
 * UNE SEULE TABLE pour la donnée d'un asset (fichier + libellé + catégorie + rôle).
 * Les libellés vivaient sinon en double (`EditorAsset.label` ET `ASSET_META.label`),
 * ce qui laisse les deux diverger en silence : ici `PALETTE_PACK` et `ASSET_META`
 * sont tous deux DÉRIVÉS de cette table.
 *
 * ⚠️ `role` n'est pas décoratif : c'est lui qui fixe la COUCHE d'affichage
 * (`layerForRole` → `RenderLayer`) et le repli de solidité (`roleSolidityFallback`).
 * Un marquage au sol DOIT être `decal` (sinon il flotte à hauteur de prop — le bug
 * historique de `piste_strip`) ; un volume habitable DOIT être `structure`.
 * La solidité réelle, elle, est DÉCLARÉE dans `@content/assetSolidity`.
 */
/**
 * Retour playtest (routes/bancs invisibles en jeu) : cette table vit désormais dans
 * `@content/paletteAssets` — source de vérité UNIQUE partagée avec `GameScene.preload()`
 * (qui la charge pour de vrai côté jeu ; avant, seul l'éditeur la préchargeait).
 * `PaletteItem` = alias local (le `role` du contenu est un union IDENTIQUE à `AssetRole`).
 */
type PaletteItem = PaletteAssetDef
const PALETTE_ITEMS: readonly PaletteItem[] = PALETTE_ASSETS

const PALETTE_PACK: EditorAsset[] = PALETTE_ITEMS.map(({ key, file, label, role }) => ({ key, file, label, role }))

/**
 * Décor PARTAGÉ (clôtures/portail/routes) : assets réels (`public/terrain/*`)
 * utilisés par le jeu mais absents de `STAGE_RENDER` → jamais surfacés dans la
 * palette. On les expose sur TOUS les stages (catégorie « Divers » via ASSET_META).
 */
const SHARED_DECOR_ASSETS: EditorAsset[] = [
  { key: 'fence_panel', file: 'terrain/fence_panel.png', label: 'Panneau de clôture', role: 'prop' },
  { key: 'fence_post', file: 'terrain/fence_post.png', label: 'Poteau de clôture', role: 'prop' },
  { key: 'site_gate', file: 'terrain/site_gate.png', label: 'Portail de chantier', role: 'structure' },
  { key: 'road_strip', file: 'terrain/road_strip.png', label: 'Bande de route', role: 'decal' },
  { key: 'piste_strip', file: 'terrain/piste_strip.png', label: 'Bande de piste', role: 'decal' },
  // Immeubles de bordure (anneau urbain) — posables sur tous les stages.
  ...CITY_BUILDINGS.map((b) => ({ key: b.key, file: b.file, label: b.label, role: 'structure' as const })),
  ...PALETTE_PACK
]

/**
 * Méta par clé d'asset : libellé FR lisible + catégorie de palette. Sert à sortir
 * les assets d'implantation de la catégorie fourre-tout « Objets isolés avancés »
 * et à leur donner un nom métier (au lieu du nom de fichier humanisé). Une clé
 * absente = comportement par défaut (catégorie déduite du rôle, libellé humanisé).
 */
const ASSET_META: Record<string, { label: string; category: string; snap?: number }> = {
  // Stage 01 — implantation / topographie (assets EXISTANTS)
  prop_stakes: { label: 'Piquets topo', category: 'topo' },
  struct_stage01_plot: { label: 'Parcelle piquetée', category: 'topo' },
  struct_stage01_sign: { label: 'Panneau accès chantier', category: 'entrance' },
  landmark_stage01: { label: 'Panneau permis', category: 'entrance' },
  struct_stage01_cabin: { label: 'Bungalow / algeco', category: 'baselife' },
  struct_stage01_tape: { label: 'Rubalise de balisage', category: 'safety' },
  prop_rocks: { label: 'Amas de rochers', category: 'decor' },
  prop_weeds: { label: 'Herbes sèches', category: 'decor' },
  prop_soft: { label: 'Terre meuble', category: 'decor' },
  decal_puddle: { label: 'Flaque', category: 'decor' },
  decal_weeds: { label: 'Broussailles', category: 'decor' },
  decal_pebbles: { label: 'Gravillons', category: 'decor' },
  decal_crack: { label: 'Fissure du sol', category: 'decor' },
  decal_tracks: { label: 'Traces de roues', category: 'decor' },
  // Stage 01 — pack implantation généré (assets NEUFS)
  prop_stage01_theodolite: { label: 'Théodolite (trépied)', category: 'topo' },
  prop_stage01_mire: { label: 'Mire de géomètre', category: 'topo' },
  prop_stage01_stake1: { label: 'Piquet topo simple', category: 'topo' },
  prop_stage01_stake_bundle: { label: 'Botte de piquets', category: 'stocks' },
  prop_stage01_tape_reel: { label: 'Rouleau de rubalise', category: 'stocks' },
  prop_stage01_cones: { label: 'Cônes de balisage', category: 'safety' },
  prop_stage01_rubalise: { label: 'Rubalise déroulée', category: 'safety' },
  prop_stage01_sign_speed: { label: 'Panneau 30 km/h', category: 'entrance' },
  prop_stage01_tree_a: { label: 'Arbre rond', category: 'decor' },
  prop_stage01_tree_b: { label: 'Arbre élancé', category: 'decor' },
  prop_stage01_bush_a: { label: 'Buisson', category: 'decor' },
  prop_stage01_bush_b: { label: 'Broussailles épaisses', category: 'decor' },
  struct_stage01_wc: { label: 'WC de chantier', category: 'baselife' },
  struct_stage01_plan_table: { label: 'Table avec plan', category: 'baselife' },
  decal_stage01_layout_cross: { label: 'Croix topo au sol', category: 'marking' },
  decal_stage01_layout_corner: { label: 'Angle de marquage', category: 'marking' },
  // Décor PARTAGÉ (clôtures/portail/routes) → catégorie « Divers » sur tous les stages.
  fence_panel: { label: 'Panneau de clôture', category: 'divers' },
  fence_post: { label: 'Poteau de clôture', category: 'divers' },
  site_gate: { label: 'Portail de chantier', category: 'routes' },
  // Les routes étaient rangées dans « Divers » alors que la catégorie « Routes &
  // accès » existait : elle n'était peuplée que par une scène d'un seul stage,
  // donc vide — et donc MASQUÉE — partout ailleurs. La fonctionnalité était là,
  // c'est l'étiquette qui manquait.
  road_strip: { label: 'Bande de route goudronnée', category: 'routes' },
  piste_strip: { label: 'Bande de piste (terre)', category: 'routes' },
  decal_stage01_layout_line: { label: 'Ligne de marquage', category: 'marking' },
  // Immeubles de bordure (anneau urbain) → catégorie dédiée « Immeubles ».
  building_office: { label: 'Immeuble de bureau', category: 'buildings' },
  building_apartment: { label: "Immeuble d'habitation", category: 'buildings' },
  building_tower: { label: 'Tour de bureaux', category: 'buildings' },
  building_warehouse: { label: 'Entrepôt industriel', category: 'buildings' },
  building_shops: { label: 'Commerces de quartier', category: 'buildings' },
  building_rowhouses: { label: 'Maisons mitoyennes', category: 'buildings' },
  building_parking: { label: 'Parking à étages', category: 'buildings' },
  building_factory: { label: 'Usine en briques', category: 'buildings' },
  building_hotel: { label: 'Hôtel Art déco', category: 'buildings' },
  building_lyon_vieux_lyon: { label: 'Façade du Vieux Lyon', category: 'buildings' },
  building_lyon_canut: { label: 'Immeuble canut', category: 'buildings' },
  building_lyon_bouchon: { label: 'Bouchon lyonnais', category: 'buildings' },
  building_lyon_fourviere: { label: 'Basilique de Fourvière', category: 'buildings' },
  building_lyon_hotel_dieu: { label: 'Grand Hôtel-Dieu', category: 'buildings' },

  // Ouvriers génériques : les 3 sprites sont distincts, leurs anciens noms
  // « A/B/C » ne le disaient pas. Le prénom se lit dans la palette sans cliquer.
  npc_ouvrier_zinedine: { label: 'Ouvrier — Zinedine', category: 'npc_ouvrier' },
  npc_ouvrier_marius: { label: 'Ouvrier — Marius', category: 'npc_ouvrier' },
  npc_ouvrier_erling: { label: 'Ouvrier — Erling', category: 'npc_ouvrier' },

  // Pack « palette » : DÉRIVÉ de `PALETTE_ITEMS` (source unique) — le libellé et la
  // catégorie ne peuvent pas diverger de l'asset qu'ils décrivent.
  ...Object.fromEntries(PALETTE_ITEMS.map((i) => [i.key, { label: i.label, category: i.category, snap: i.snap }]))
}

/** Méta (label FR + catégorie + pas de grille imposé) d'un asset, ou null si non répertorié. */
export function assetMeta(key: string): { label: string; category: string; snap?: number } | null {
  const building = CITY_BUILDINGS.find((candidate) => candidate.key === key)
  if (building !== undefined) {
    return { label: building.label, category: 'buildings' }
  }
  const explicit = ASSET_META[key]
  if (explicit !== undefined) {
    return explicit
  }
  return null
}

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
  // Les 4 macro-zones de conception (A=signature_zone + B/C/D), dérivées de ZONE_DEFS.
  ...ZONE_DEFS.map((z): PaletteEntry => ({
    id: 'marker_' + z.type, label: z.label, category: 'markers', kind: 'marqueur', size: 'grande', marker: z.type
  })),
  // Les 2 outils de chemin vivent dans la MÊME section : « Chemin camion » était
  // rangé dans « Marqueurs » et « Chemin ouvrier » dans « Ouvriers & chemins » —
  // rien ne disait qu'ils allaient ensemble, ni même que le second existait.
  { id: 'marker_truck_path', label: 'Chemin camion', category: 'workers', kind: 'marqueur', size: 'petite', marker: 'truck_path' },
  { id: 'marker_worker_path', label: 'Chemin ouvrier', category: 'workers', kind: 'marqueur', size: 'petite', marker: 'worker_path' }
]

/**
 * Côté d'une plaque de sol posée, en px monde (~4×4 tuiles de 64).
 * L'utilisateur la redimensionne ensuite (échelle uniforme de l'instance).
 */
const GROUND_PATCH_SIZE = 256

/**
 * TOUTES les tuiles de sol de TOUS les stages, en assets PARTAGÉS.
 *
 * Le jeu en déclare 6 par stage (60 au total) et les charge toutes, mais
 * `ground.ts` n'en rend qu'UNE — la tuile de base du stage courant. **50 étaient
 * donc chargées puis jamais affichées.** On les rend posables, et cross-stage :
 * c'est ce qui permet de mettre le sol du 05 sur le 01, sans une seule génération.
 */
const GROUND_TILE_ASSETS: EditorAsset[] = STAGE_LIST.flatMap(({ id, label }) => {
  const sr = STAGE_RENDER[id]
  if (sr === undefined) { return [] }
  return sr.ground.map((g, i) => ({
    key: g.key,
    file: g.file,
    // « Sol — 03 · Fondations (v2) » : le stage d'origine doit être lisible, sinon
    // 60 entrées nommées « Sol » sont indiscernables.
    label: `Sol — ${label}${i > 0 ? ` (v${i + 1})` : ''}`,
    role: 'ground' as const
  }))
})

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
  // Les 60 tuiles (tous stages) : posables partout, et non plus la seule tuile
  // de base du stage courant. `add` déduplique, donc celle du stage y est déjà.
  for (const g of GROUND_TILE_ASSETS) {
    add(g)
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
  // Assets réservés éditeur (implantation, WC, marquages…) : exposés dans la
  // palette + miniature, jamais scatterés par le jeu.
  for (const e of sr.editorExtras ?? []) {
    if (e.frame !== undefined) {
      add({ key: e.key, file: e.file, sheet: true, frame: e.frame, label: humanize(e.file), role: e.role })
    } else {
      add({ key: e.key, file: e.file, label: humanize(e.file), role: e.role })
    }
  }
  // PNJ « métier » du stage (tous les skins ambient) + ouvriers génériques
  // PARTAGÉS (SHARED_WORKER_NPCS, identiques sur tous les stages) : exposés
  // comme assets « worker » (feuille de sprite) → `EditorScene.preload` charge
  // ainsi toutes leurs textures. La palette (npcEntries) s'appuie sur ces skins.
  for (const npc of sr.ambient ?? []) {
    add({ key: npc.key, file: npc.file, sheet: true, frame: npc.frame, label: humanize(npc.file), role: 'worker' })
  }
  for (const npc of SHARED_WORKER_NPCS) {
    add({ key: npc.key, file: npc.file, sheet: true, frame: npc.frame, label: humanize(npc.file), role: 'worker' })
  }
  // Destructibles du stage (sprites props cassables) : exposés comme assets pour
  // que `EditorScene.preload` charge leur texture ; la palette (`destructibleEntries`)
  // s'appuie sur ces clés.
  for (const d of destructiblesForStage(stageId)) {
    add({ key: d.assetKey, file: d.file, label: d.name, role: 'destructible' })
  }
  // Otage posable (feuille du prisonnier, sosie du joueur — partagée par tous les
  // stages) : ajouté comme asset pour que `EditorScene.preload` charge sa texture ;
  // la palette (`prisonerEntries`) s'appuie sur cette clé.
  add({ key: 'prisoner', file: 'stage01/npc/prisoner_walk.png', sheet: true, frame: 192, label: 'Otage', role: 'worker' })
  // Décor PARTAGÉ (clôtures/portail/routes) — sur tous les stages (catégorie « Divers »).
  for (const a of SHARED_DECOR_ASSETS) {
    add({ key: a.key, file: a.file, label: a.label, role: a.role })
  }
  if (sr.interior !== undefined) {
    add({ key: sr.interior.columnKey, file: sr.interior.columnFile, label: 'Poteau', role: 'column' })
  }
  return { assets, groundKey }
}

/** Un objet isolé par asset (hors sol). Catégorie + libellé via ASSET_META, sinon défaut par rôle. */
function objectEntries(assets: EditorAsset[]): PaletteEntry[] {
  const out: PaletteEntry[] = []
  for (const a of assets) {
    if (a.role === 'ground') {
      // Les sols étaient exclus de la palette (`continue` sec) : le stock existait
      // mais restait impossible à poser. Ils deviennent des PLAQUES — texture
      // répétée sur `tile`, non bloquante, sous les décalques.
      out.push({
        id: 'obj_' + a.key,
        label: a.label,
        category: 'sol',
        kind: 'decor',
        size: 'grande',
        elements: [{
          assetKey: a.key,
          dx: 0,
          dy: 0,
          scale: 1.0,
          tile: { w: GROUND_PATCH_SIZE, h: GROUND_PATCH_SIZE }
        }]
      })
      continue
    }
    const meta = assetMeta(a.key)
    const label = meta?.label ?? a.label
    if (a.role === 'worker') {
      // Les PNJ sont gérés par `npcEntries` (2 sections dédiées) — pas de doublon
      // « Ouvrier — … » dans la catégorie « Ouvriers & chemins ».
      continue
    }
    if (a.role === 'destructible') {
      // Gérés par `destructibleEntries` (section dédiée) — pas de doublon « Objet ».
      continue
    }
    const isDecal = a.role === 'decal'
    const size: EntrySize = a.role === 'landmark' || a.role === 'structure' ? 'grande' : isDecal ? 'petite' : 'moyenne'
    const category = meta?.category ?? (isDecal ? 'decor' : 'objects')
    const entry: PaletteEntry = { id: 'obj_' + a.key, label, category, kind: isDecal ? 'decor' : 'objet', size, elements: [{ assetKey: a.key, dx: 0, dy: 0, scale: 1.0 }] }
    // Contrainte de pose portée par l'ASSET (kit de routes) — cf. `PaletteEntry.snap`.
    if (meta?.snap !== undefined) {
      entry.snap = meta.snap
      // Une tuile de route n'est pas une vignette : elle occupe 2 cellules.
      entry.size = 'grande'
    }
    out.push(entry)
  }
  return out
}

/**
 * Une entrée de palette par PNJ, dans 2 sections distinctes :
 *  - MÉTIERS (`sr.ambient`, `kind` absent → 'trade') → « PNJ métier (fixe) » ;
 *  - OUVRIERS génériques (`SHARED_WORKER_NPCS`, `kind:'worker'`), IDENTIQUES sur
 *    tous les stages → « PNJ ouvrier (mobile) ».
 * Poser une entrée ajoute un `LayoutNpc` (via `EditorState.addNpc`) — pas une
 * instance de décor.
 */
function npcEntries(sr: StageRender | undefined): PaletteEntry[] {
  const out: PaletteEntry[] = []
  const push = (npc: StageAmbientNpc): void => {
    const kind: 'trade' | 'worker' = npc.kind === 'worker' ? 'worker' : 'trade'
    out.push({
      id: 'npc_' + npc.key,
      // `assetMeta` d'abord : le nom de fichier humanisé donnerait « Ouvrier
      // Zinedine Walk ». Le prénom ne sert à rien s'il arrive noyé dans du bruit.
      label: assetMeta(npc.key)?.label ?? humanize(npc.file),
      category: kind === 'worker' ? 'npc_ouvrier' : 'npc_metier',
      kind: 'objet',
      size: 'moyenne',
      npcSkin: npc.key,
      npcKind: kind
    })
  }
  for (const npc of sr?.ambient ?? []) {
    push(npc)
  }
  for (const npc of SHARED_WORKER_NPCS) {
    push(npc)
  }
  return out
}

/**
 * Une entrée de palette par type de DESTRUCTIBLE du stage (section « Destructibles »).
 * Poser une entrée ajoute une `LayoutInstance` (prefab `des_<typeId>`) qui rend le
 * sprite via `elements` ; `EditorState.exportGameJson` la convertit en
 * `EmbeddedElement.destructible {typeId}` (non-bloquant) consommé par la sim.
 */
function destructibleEntries(stageId: string): PaletteEntry[] {
  return destructiblesForStage(stageId).map((d) => ({
    id: 'des_' + d.id,
    label: d.name,
    category: 'destructibles',
    kind: 'objet',
    size: 'moyenne',
    destructibleTypeId: d.id,
    elements: [{ assetKey: d.assetKey, dx: 0, dy: 0, scale: d.scale }]
  }))
}

/**
 * Entrée de palette pour poser un OTAGE (section « Otages »). Poser une entrée
 * ajoute une `LayoutInstance` qui rend la feuille du prisonnier ;
 * `EditorState.exportGameJson` la convertit en `EmbeddedElement.prisoner {}`
 * (non-bloquant) routé par `composedToSiteLayout` vers `SiteLayout.prisoners`.
 * Un seul type d'otage → une seule entrée (partagée par tous les stages).
 */
function prisonerEntries(): PaletteEntry[] {
  return [{
    id: 'otage',
    label: 'Otage',
    category: 'prisoners',
    kind: 'objet',
    size: 'moyenne',
    prisoner: true,
    elements: [{ assetKey: 'prisoner', dx: 0, dy: 0, scale: 0.62 }]
  }]
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
  if (stageId === 'terrain_vierge') {
    const THEO = 'prop_stage01_theodolite', MIRE = 'prop_stage01_mire', STK = 'prop_stage01_stake1'
    const CROSS = 'decal_stage01_layout_cross', LINE = 'decal_stage01_layout_line', CORN = 'decal_stage01_layout_corner'
    const BUNDLE = 'prop_stage01_stake_bundle', REEL = 'prop_stage01_tape_reel', CONES = 'prop_stage01_cones'
    const WC = 'struct_stage01_wc', PTABLE = 'struct_stage01_plan_table'
    const SIGN = 'struct_stage01_sign', PERMIT = 'landmark_stage01', CABIN = 'struct_stage01_cabin'
    return [
      { id: 'scene_stage01_survey_setup', label: 'Poste de relevé topo', category: 'scenes', kind: 'scene', size: 'grande', elements: [
        { assetKey: THEO, dx: 0, dy: -20, scale: 1.0 }, { assetKey: MIRE, dx: 80, dy: 10, scale: 0.9 },
        { assetKey: STK, dx: -70, dy: 45, scale: 0.8 }, { assetKey: STK, dx: 50, dy: 60, scale: 0.8, flipX: true },
        { assetKey: CROSS, dx: 0, dy: 70, scale: 0.85 } ] },
      { id: 'scene_stage01_future_footprint_small', label: 'Petite emprise future', category: 'scenes', kind: 'scene', size: 'grande', elements: [
        { assetKey: LINE, dx: 0, dy: -95, scale: 1.0 }, { assetKey: LINE, dx: 0, dy: 95, scale: 1.0 },
        { assetKey: CORN, dx: -140, dy: -85, scale: 0.8 }, { assetKey: CORN, dx: 140, dy: -85, scale: 0.8, flipX: true },
        { assetKey: STK, dx: -140, dy: 90, scale: 0.75 }, { assetKey: STK, dx: 140, dy: 90, scale: 0.75, flipX: true },
        { assetKey: CROSS, dx: 0, dy: 0, scale: 0.8 } ] },
      { id: 'scene_stage01_future_footprint_large', label: 'Grande emprise future', category: 'scenes', kind: 'scene', size: 'grande', elements: [
        { assetKey: LINE, dx: 0, dy: -150, scale: 1.5 }, { assetKey: LINE, dx: 0, dy: 150, scale: 1.5 },
        { assetKey: CORN, dx: -230, dy: -135, scale: 0.9 }, { assetKey: CORN, dx: 230, dy: -135, scale: 0.9, flipX: true },
        { assetKey: STK, dx: -230, dy: 140, scale: 0.8 }, { assetKey: STK, dx: 230, dy: 140, scale: 0.8, flipX: true },
        { assetKey: CROSS, dx: 0, dy: 0, scale: 0.9 } ] },
      { id: 'scene_stage01_site_entrance', label: 'Entrée terrain / panneau', category: 'entrance', kind: 'scene', size: 'grande', elements: [
        { assetKey: SIGN, dx: 0, dy: -20, scale: 1.0 }, { assetKey: PERMIT, dx: -95, dy: 25, scale: 0.9 },
        { assetKey: CONES, dx: 95, dy: 45, scale: 0.8 }, { assetKey: 'decal_tracks', dx: 0, dy: 75, scale: 1.0 } ] },
      { id: 'scene_stage01_base_life_light', label: 'Base vie légère', category: 'baselife', kind: 'scene', size: 'grande', elements: [
        { assetKey: CABIN, dx: 0, dy: 0, scale: 1.1 }, { assetKey: WC, dx: 115, dy: 20, scale: 0.9 },
        { assetKey: REEL, dx: -95, dy: 60, scale: 0.7 }, { assetKey: BUNDLE, dx: 85, dy: 70, scale: 0.7 } ] },
      { id: 'scene_stage01_topo_stock', label: 'Stock topo / balisage', category: 'stocks', kind: 'stock', size: 'moyenne', elements: [
        { assetKey: BUNDLE, dx: -70, dy: 5, scale: 0.85 }, { assetKey: REEL, dx: 35, dy: 15, scale: 0.8 },
        { assetKey: STK, dx: 95, dy: -10, scale: 0.7 }, { assetKey: PTABLE, dx: 0, dy: -70, scale: 0.85 } ] },
      { id: 'scene_stage01_raw_ground_cluster', label: 'Terrain brut', category: 'decor', kind: 'decor', size: 'moyenne', elements: [
        { assetKey: 'prop_rocks', dx: -60, dy: 0, scale: 0.9 }, { assetKey: 'prop_weeds', dx: 45, dy: 20, scale: 0.9 },
        { assetKey: 'decal_puddle', dx: 0, dy: 50, scale: 1.0 }, { assetKey: 'prop_soft', dx: 70, dy: -20, scale: 1.0 } ] }
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

/**
 * Scènes dérivées des CLUSTERS du stage (repli pour les stages sans scènes
 * authorées, ex. 04→10) : toute compo `CLUSTERS` dont l'id finit par le stageId
 * (`cluster_work_<stage>`, `cluster_storage_<stage>`, `cluster_plant_<stage>`…) —
 * plus riche que les 2 gabarits auto.
 */
const CAUSAL_SCENE_CLUSTERS: Readonly<Record<string, readonly string[]>> = {
  reseaux_enterres: ['cluster_work_reseaux', 'cluster_storage_reseaux', 'cluster_plant_reseaux'],
  charpente_toiture: ['cluster_work_charpente', 'cluster_storage_charpente', 'cluster_plant_charpente'],
  livraison_audit: ['cluster_work_livraison', 'cluster_storage_livraison', 'cluster_plant_livraison']
}

function clusterScenes(stageId: string): PaletteEntry[] {
  const ids = CAUSAL_SCENE_CLUSTERS[stageId] ?? Object.keys(CLUSTERS).filter((id) => id.endsWith(stageId))
  const out: PaletteEntry[] = []
  for (const id of ids) {
    const label = humanize(id.replace(/^cluster_/, '').replace(/_/g, ' '))
    const e = clusterEntry(id, label, 'scene', 'grande', 'scenes')
    if (e !== null) {
      out.push(e)
    }
  }
  return out
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
  const sr = STAGE_RENDER[stageId] ?? STAGE_RENDER.terrain_vierge
  const { assets, groundKey } = buildStageAssets(stageId)
  const authored = authoredScenes(stageId)
  const fromClusters = authored.length > 0 ? authored : clusterScenes(stageId)
  const scenes = fromClusters.length > 0 ? fromClusters : autoScenes(stageId, assets)
  const entries = [...scenes, ...destructibleEntries(stageId), ...prisonerEntries(), ...npcEntries(sr), ...objectEntries(assets), ...MARKERS]
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

/**
 * Sprites de véhicule utilisables comme marcheurs d'un chemin camion, PROPRES à un
 * stage : proposés seulement là où `STAGE_RENDER` les charge vraiment.
 *
 * `prop_s2_truck` n'est déclaré qu'au stage 02 (`terrassement`) et reste une image
 * MONO-frame retournée par `flipX` — c'était la source de l'échec silencieux tant
 * qu'il servait aussi de REPLI. Ce n'est plus le cas : le repli est désormais
 * `CAMION_SKIN`, partagé par les 10 stages (cf. `SHARED_VEHICLE_SKINS`).
 */
const VEHICLE_SKINS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'prop_s2_truck', label: 'Camion benne (stage 02, 1 sens)' }
]

/**
 * Véhicules PARTAGÉS : chargés par `GameScene.preload` sur les 10 stages, ils ne
 * figurent dans aucun `STAGE_RENDER` — les filtrer par stage les rendrait donc
 * invisibles PARTOUT. On les propose inconditionnellement.
 */
const SHARED_VEHICLE_SKINS: ReadonlyArray<{ key: string; label: string }> = [
  { key: CAMION_SKIN.key, label: 'Camion benne (4 directions)' }
]

/**
 * Skins proposés pour les marcheurs d'un chemin, FILTRÉS par la famille.
 *
 * Le filtre n'est pas cosmétique : `type` décide de l'animation de marche et de
 * l'orientation (`isCamion` dans siteWorkers). Un skin de camion sur un chemin
 * d'ouvrier produirait un camion qui MARCHE.
 */
export function walkerSkinsFor(
  stageId: string,
  type: PathType
): Array<{ key: string; label: string }> {
  const sr = STAGE_RENDER[stageId]
  if (type === 'truck_path') {
    // Un véhicule n'est proposé que si le stage le charge VRAIMENT — et il faut
    // balayer les 3 familles : `prop_s2_truck` est déclaré en `structures` (engin
    // -héros posé une fois), pas en `props`. Ne regarder que `props` rendrait la
    // liste vide PARTOUT, y compris sur le seul stage qui a un camion.
    const loaded = new Set<string>()
    for (const s of sr?.structures ?? []) {loaded.add(s.key)}
    for (const p of sr?.props ?? []) {loaded.add(p.key)}
    for (const e of sr?.editorExtras ?? []) {loaded.add(e.key)}
    // Les partagés d'abord : c'est le défaut sain (4 directions, tous stages).
    return [...SHARED_VEHICLE_SKINS, ...VEHICLE_SKINS.filter((v) => loaded.has(v.key))]
  }
  const out: Array<{ key: string; label: string }> = []
  const seen = new Set<string>()
  const push = (npc: StageAmbientNpc): void => {
    if (seen.has(npc.key)) {return}
    seen.add(npc.key)
    out.push({ key: npc.key, label: assetMeta(npc.key)?.label ?? humanize(npc.file) })
  }
  for (const npc of sr?.ambient ?? []) {push(npc)}
  for (const npc of SHARED_WORKER_NPCS) {push(npc)}
  return out
}
