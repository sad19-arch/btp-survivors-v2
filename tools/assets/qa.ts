/**
 * QA automatique des assets (« valider par batch, pas un par un » — manifest §5).
 *
 * Parcourt `public/`, lit chaque PNG et vérifie : dimensions, transparence et
 * nommage (conventions manifest §6). Imprime un rapport ; sort en code 1 si un
 * asset est invalide (illisible, non-PNG, ou sprite sans transparence).
 *
 * Usage: npm run assets:qa
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PNG } from 'pngjs'
import { parsePng } from './png'

const PUBLIC_DIR = 'public'

/** Fichiers de référence tolérés hors conventions de nommage. */
const REFERENCE_FILES = new Set(['player_j1.png'])

/**
 * Dossiers de travail : générations brutes en attente de tri, jamais chargées par
 * le jeu. Les linter reviendrait à noter un brouillon.
 */
const IGNORED_DIRS = new Set(['_gate'])

/**
 * Catégories d'assets, portées par le DOSSIER (`public/stage01/enemies/imp_walk.png`).
 *
 * Le manifest §6 décrit un nommage PLAT (`enemy_stage01_imp_walk_192.png`), mais le
 * dépôt s'est structuré en arborescence : le dossier porte le stage et la catégorie,
 * le fichier ne porte plus que le nom. Exiger le préfixe plat sur l'arbre marquait
 * 574 des 653 assets fautifs (88 %) — le linter ne mesurait plus rien. On valide donc
 * ce qui est réellement en vigueur : le chemin.
 *
 * `needsAlpha` : la catégorie exige un fond transparent.
 */
const CATEGORIES: Record<string, { needsAlpha: boolean }> = {
  ground: { needsAlpha: false }, // tuiles de sol : opaques par nature
  ui: { needsAlpha: true },
  vfx: { needsAlpha: true },
  decals: { needsAlpha: true },
  props: { needsAlpha: true },
  structures: { needsAlpha: true },
  landmarks: { needsAlpha: true },
  npc: { needsAlpha: true },
  enemies: { needsAlpha: true },
  boss: { needsAlpha: true },
  pickups: { needsAlpha: true },
  weapons: { needsAlpha: true },
  player: { needsAlpha: true },
  routes: { needsAlpha: false }, // tuiles de route raccordables : bord à bord opaque
  signs: { needsAlpha: true }
}

/**
 * Packs partagés entre les 10 stages. Ils sont plats (pas de sous-dossier de
 * catégorie), donc leur catégorie est déclarée ici.
 */
const SHARED_PACKS: Record<string, string> = {
  city: 'structures', // immeubles de bordure de carte
  carnage: 'decals', // flaques/éclaboussures du Mode Carnage
  terrain: 'props', // clôtures, portails, bandes de route
  shared: 'npc', // convoyeur & co.
  signs: 'signs' // signalétique temporaire compositée
}

/**
 * Catégories dont un sprite DOIT être détouré (fond transparent).
 * Un fond opaque plein (4 coins pleins = « boîte ») y est un DÉFAUT de détourage
 * que le simple test `hasAlpha` ne détecte pas (une boîte a un canal alpha à 255).
 * Exclus : `ground`/`routes` (tuiles opaques par nature), `decals` (marques au sol
 * à bord doux), `vfx` (glows semi-transparents voulus), `ui` (panneaux opaques).
 */
const CUTOUT_CATEGORIES = new Set([
  'props', 'structures', 'landmarks', 'npc', 'enemies', 'boss', 'pickups', 'weapons', 'player'
])

/**
 * Tailles de sprite reconnues. Sans cette liste, `_(\d+)` attrapait aussi les
 * suffixes de VARIANTE (`tile_3`) et de frame (`couvreurA_7`), et exigeait d'une
 * tuile 64×64 qu'elle soit multiple de 3 : 39 avertissements, tous faux.
 */
const SIZE_TOKENS = new Set([32, 64, 96, 128, 192, 256, 384, 512])

/** Nom de fichier dans l'arborescence : snake_case, la catégorie venant du dossier. */
const TREE_NAME_RE = /^[a-z0-9_]+\.png$/

/** Forme minimale d'un PNG décodé (pngjs ne fournit pas de types résolvables ici). */
interface DecodedPng { width: number; height: number; data: Uint8Array }

/** Compte les coins (0..4) dont l'alpha est opaque (>200). Décode les pixels via pngjs. */
function opaqueCorners(bytes: Uint8Array): number {
  const sync = (PNG as unknown as { sync: { read(b: Buffer): DecodedPng } }).sync
  const png = sync.read(Buffer.from(bytes))
  const W = png.width
  const H = png.height
  const data = png.data
  const corners: Array<[number, number]> = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]
  let n = 0
  for (const [x, y] of corners) {
    if ((data[(y * W + x) * 4 + 3] ?? 0) > 200) { n += 1 }
  }
  return n
}

/** Conventions de nommage (manifest §6) → catégorie. */
const NAME_PATTERNS: { re: RegExp; kind: string; needsAlpha: boolean }[] = [
  { re: /^enemy_stage\d{2}_[a-z0-9]+(_elite)?_walk_192\.png$/, kind: 'ennemi', needsAlpha: true },
  { re: /^boss_stage\d{2}_[a-z0-9]+_(walk|attack|intro|death)_(256|384)\.png$/, kind: 'boss', needsAlpha: true },
  { re: /^prop_stage\d{2}_[a-z0-9]+\.png$/, kind: 'prop', needsAlpha: true },
  { re: /^dressing_stage\d{2}_[a-z0-9]+\.png$/, kind: 'habillage', needsAlpha: true },
  { re: /^tile_stage\d{2}_[a-z0-9]+_32\.png$/, kind: 'tile', needsAlpha: false },
  { re: /^hazard_stage\d{2}_[a-z0-9]+\.png$/, kind: 'danger', needsAlpha: true },
  { re: /^landmark_stage\d{2}_[a-z0-9]+\.png$/, kind: 'landmark', needsAlpha: true },
  { re: /^icon_[a-z0-9_]+_(32|64)\.png$/, kind: 'icône', needsAlpha: true },
  { re: /^ui_[a-z0-9_]+\.png$/, kind: 'ui', needsAlpha: true },
  { re: /^vfx_[a-z0-9_]+(_sheet)?\.png$/, kind: 'vfx', needsAlpha: true },
  { re: /^pickup_[a-z0-9_]+\.png$/, kind: 'pickup', needsAlpha: true },
  { re: /^weapon_[a-z0-9_]+\.png$/, kind: 'arme', needsAlpha: true },
  { re: /^player_[a-z0-9_]+\.png$/, kind: 'joueur', needsAlpha: true },
  { re: /^shadow_[a-z0-9_]+\.png$/, kind: 'ombre', needsAlpha: true }
]

interface Report {
  file: string
  errors: string[]
  warnings: string[]
}

/** Liste récursive des fichiers .png sous un dossier. */
function listPngs(dir: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (IGNORED_DIRS.has(name)) { continue }
      out.push(...listPngs(full))
    } else if (name.toLowerCase().endsWith('.png')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Résout la catégorie d'un asset depuis son chemin, ou `null` si le chemin ne suit
 * aucune structure connue (= le vrai signal de nommage).
 *
 * - `stage03/props/x.png` → `props` (dossier porteur)
 * - `city/x.png`          → `structures` (pack partagé plat)
 * - `terrain/routes/x.png`→ `routes` (sous-dossier de catégorie dans un pack)
 */
function categoryOf(dirs: readonly string[]): string | null {
  const last = dirs[dirs.length - 1] ?? ''
  if (last in CATEGORIES) { return last }
  const pack = dirs[0] ?? ''
  return SHARED_PACKS[pack] ?? null
}

/** Vérifie un asset et renvoie ses erreurs/avertissements. */
function check(path: string): Report {
  const file = relative(PUBLIC_DIR, path).replace(/\\/g, '/')
  const base = file.split('/').pop() ?? file
  const errors: string[] = []
  const warnings: string[] = []

  let info
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(readFileSync(path))
    info = parsePng(bytes)
  } catch {
    return { file, errors: ['fichier illisible ou non-PNG'], warnings }
  }

  if (REFERENCE_FILES.has(base)) {
    return { file, errors, warnings } // référence : pas de contrainte de nommage
  }

  const dirs = file.split('/').slice(0, -1)
  let category: string

  if (dirs.length === 0) {
    // Racine de `public/` : pas de dossier porteur, donc le préfixe plat fait foi.
    const matched = NAME_PATTERNS.find((p) => p.re.test(base))
    if (matched === undefined) {
      warnings.push('nommage hors conventions : à la racine de public/, le préfixe est la seule catégorie (ui_/icon_/player_/vfx_…)')
      category = ''
    } else {
      category = matched.kind === 'joueur' ? 'player' : ''
      if (matched.needsAlpha && !info.hasAlpha) {
        errors.push(`transparence requise pour un asset « ${matched.kind} »`)
      }
    }
  } else {
    const resolved = categoryOf(dirs)
    if (resolved === null) {
      warnings.push(`dossier « ${dirs.join('/')} » hors structure connue (attendu : stageNN/<catégorie>/ ou un pack partagé)`)
      category = ''
    } else {
      category = resolved
      if (!TREE_NAME_RE.test(base)) {
        warnings.push('nom hors convention : snake_case minuscule attendu (la catégorie vient du dossier)')
      }
      if (CATEGORIES[resolved]?.needsAlpha === true && !info.hasAlpha) {
        errors.push(`transparence requise pour un asset « ${resolved} »`)
      }
    }
  }

  // Dimensions : un suffixe de TAILLE reconnu impose des dimensions multiples.
  // Restreint à `SIZE_TOKENS` — sinon `tile_3` (variante 3) et `couvreurA_7`
  // (frame 7) étaient lus comme des tailles et déclenchaient 39 faux positifs.
  const sizeTok = base.match(/_(\d+)\.png$/)
  if (sizeTok !== null) {
    const n = Number.parseInt(sizeTok[1] ?? '0', 10)
    if (SIZE_TOKENS.has(n) && (info.width % n !== 0 || info.height % n !== 0)) {
      warnings.push(`dimensions ${info.width}×${info.height} non multiples de ${n}`)
    }
  }

  // Détourage : un asset « sprite » (perso/prop/engin/pickup/arme) ne doit PAS
  // avoir un fond opaque (4 coins pleins = boîte non détourée). Attrape le bug
  // « mal détouré » invisible au simple test `hasAlpha`.
  if (CUTOUT_CATEGORIES.has(category)) {
    try {
      if (opaqueCorners(bytes) >= 4) {
        errors.push('fond opaque (asset « en boîte » — détourage manquant)')
      }
    } catch {
      // Décodage impossible : l'en-tête a déjà été validé, on n'échoue pas dessus.
    }
  }

  return { file, errors, warnings }
}

function main(): void {
  const files = listPngs(PUBLIC_DIR)
  if (files.length === 0) {
    console.log('[assets:qa] aucun PNG dans public/ (rien à valider).')
    return
  }

  const reports = files.map(check)
  let errCount = 0
  let warnCount = 0

  for (const r of reports) {
    if (r.errors.length === 0 && r.warnings.length === 0) {
      console.log(`  OK   ${r.file}`)
      continue
    }
    for (const e of r.errors) {
      errCount += 1
      console.log(`  FAIL ${r.file} — ${e}`)
    }
    for (const w of r.warnings) {
      warnCount += 1
      console.log(`  WARN ${r.file} — ${w}`)
    }
  }

  console.log(`[assets:qa] ${files.length} assets · ${errCount} erreur(s) · ${warnCount} avertissement(s)`)
  if (errCount > 0) {
    process.exit(1)
  }
}

main()
