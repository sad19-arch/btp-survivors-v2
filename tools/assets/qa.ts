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
 * Catégories (= dossier parent) dont un sprite DOIT être détouré (fond transparent).
 * Un fond opaque plein (4 coins pleins = « boîte ») y est un DÉFAUT de détourage
 * que le simple test `hasAlpha` ne détecte pas (une boîte a un canal alpha à 255).
 * Exclus : `ground` (tuiles opaques par nature), `decals` (marques au sol à bord
 * doux), `vfx` (glows semi-transparents voulus), `ui` (panneaux opaques voulus).
 */
const CUTOUT_CATEGORIES = new Set([
  'props', 'structures', 'landmarks', 'npc', 'enemies', 'boss', 'pickups', 'weapons', 'player'
])

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
      out.push(...listPngs(full))
    } else if (name.toLowerCase().endsWith('.png')) {
      out.push(full)
    }
  }
  return out
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

  const matched = NAME_PATTERNS.find((p) => p.re.test(base))
  if (matched === undefined) {
    warnings.push('nommage hors conventions (manifest §6)')
  } else if (matched.needsAlpha && !info.hasAlpha) {
    errors.push(`transparence requise pour un asset « ${matched.kind} »`)
  }

  // Dimensions : si le nom finit par _<n>, attendre des multiples de n.
  const sizeTok = base.match(/_(\d+)\.png$/)
  if (sizeTok !== null) {
    const n = Number.parseInt(sizeTok[1] ?? '0', 10)
    if (n > 0 && (info.width % n !== 0 || info.height % n !== 0)) {
      warnings.push(`dimensions ${info.width}×${info.height} non multiples de ${n}`)
    }
  }

  // Détourage : un asset « sprite » (perso/prop/engin/pickup/arme) ne doit PAS
  // avoir un fond opaque (4 coins pleins = boîte non détourée). Attrape le bug
  // « mal détouré » invisible au simple test `hasAlpha`.
  const segs = file.split('/')
  const category = segs.length >= 2
    ? (segs[segs.length - 2] ?? '')
    : (base.startsWith('player_') ? 'player' : '')
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
