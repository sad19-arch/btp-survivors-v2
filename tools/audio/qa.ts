/**
 * QA automatique des NIVEAUX audio.
 *
 * Le manque que ce script comble : jusqu'ici, le critère de recette d'un SFX
 * généré était « chargement 200 vérifié » (cf. commits b67ec6c / 1480078) —
 * autrement dit « le fichier se télécharge », pas « le fichier s'entend ». Deux
 * SFX d'armes (goudron, coulee_bitume) ont ainsi été livrés à 45-53 dB sous
 * leurs voisines, donc parfaitement inaudibles, et personne ne pouvait le voir :
 * un mix ne se juge qu'à l'oreille, mais un fichier VIDE se MESURE.
 *
 * Ce que le script vérifie, et lui seul :
 *  1. Aucun fichier n'est en pratique silencieux (niveau plancher absolu).
 *  2. À l'intérieur d'une FAMILLE (armes, gore, voix…), les fichiers ne
 *     s'écartent pas de plus de `spreadMaxDb` de la médiane de leur famille.
 *     Une famille partage un gain nominal unique dans le manifeste : ce gain ne
 *     veut rien dire si les sources ne sont pas alignées.
 *
 * Ce qu'il NE vérifie PAS, et ne peut pas : si le mix SONNE bien. Les seuils
 * ci-dessous détectent l'accident (un son mort, un son 20 dB à côté de ses
 * pairs), pas le goût. Un écart signalé n'est pas forcément une faute — c'est
 * un point à écouter.
 *
 * Métrique : max momentané EBU R128 (fenêtre 400 ms). Sur des one-shots courts,
 * c'est le meilleur proxy du « punch » perçu — nettement plus honnête qu'un RMS
 * sur tout le fichier, qui pénalise les transitoires (un pic sec suivi de
 * silence a un RMS bas alors qu'il claque fort).
 *
 * Nécessite ffmpeg dans le PATH. Absent → le script sort en SKIP (code 0) :
 * c'est un outil de recette manuelle, pas un gate CI.
 *
 * Usage: npm run audio:qa
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'
import {
  WEAPON_FILE_TRIM,
  WEAPON_SFX_FILES_REJETES,
  CARNAGE_GORE_IDS_REJETES
} from '@/audio/manifest'

const AUDIO_DIR = join('public', 'audio')

/**
 * Familles de sons, par préfixe de chemin. Une famille = un ensemble censé
 * partager un même gain nominal dans `src/audio/manifest.ts`, donc censé être
 * aligné en niveau à la source.
 *
 * `floorDb` : sous ce niveau, le son est considéré MORT (erreur).
 * `spreadMaxDb` : écart max toléré à la médiane de la famille (avertissement).
 *   Large sur les SFX (un « clic » et une « explosion » n'ont aucune raison de
 *   peser pareil), serré là où les fichiers sont interchangeables dans un pool
 *   tiré au sort (gore, armes, voix) — là, un écart S'ENTEND comme un trou.
 */
interface Famille {
  readonly prefixe: string
  readonly nom: string
  readonly floorDb: number
  readonly spreadMaxDb: number
}

const FAMILLES: readonly Famille[] = [
  { prefixe: 'sfx/weapons/', nom: 'SFX armes (fichier)', floorDb: -32, spreadMaxDb: 14 },
  { prefixe: 'sfx/carnage/', nom: 'SFX gore (pool tiré au sort)', floorDb: -32, spreadMaxDb: 8 },
  { prefixe: 'sfx/destructibles/', nom: 'SFX casse', floorDb: -32, spreadMaxDb: 12 },
  { prefixe: 'voice/', nom: 'Voix annonceur', floorDb: -30, spreadMaxDb: 10 },
  { prefixe: 'music/', nom: 'Musique', floorDb: -25, spreadMaxDb: 8 },
  { prefixe: 'amb/', nom: 'Ambiance', floorDb: -40, spreadMaxDb: 99 },
  { prefixe: 'sfx/', nom: 'SFX divers', floorDb: -36, spreadMaxDb: 99 }
]

/**
 * Fichiers présents mais volontairement NON déclarés au manifeste, en attente de
 * régénération. On les mesure quand même (le rapport doit dire pourquoi ils sont
 * hors-jeu) mais ils ne font échouer personne : leur défaut est déjà acté.
 * Dérivé du manifeste — pas de seconde liste à tenir à jour.
 */
const REJETES_CONNUS = new Set<string>([
  ...WEAPON_SFX_FILES_REJETES.map((id) => `sfx/weapons/weapon_${id}.mp3`),
  ...CARNAGE_GORE_IDS_REJETES.map((n) => `sfx/carnage/gore_${n}.mp3`)
])

/**
 * Trim appliqué au fichier À L'EXÉCUTION (cf. `WEAPON_FILE_TRIM`). On mesure le
 * FICHIER, mais ce qui compte est ce que le joueur ENTEND : un fichier bas
 * remonté de +17 dB au runtime n'est pas un fichier mort.
 */
function trimDb(fichier: string): number {
  const m = /^sfx\/weapons\/weapon_(.+)\.mp3$/.exec(fichier)
  const id = m?.[1]
  if (id === undefined) {
    return 0
  }
  return WEAPON_FILE_TRIM[id]?.gainDb ?? 0
}

interface Mesure {
  readonly fichier: string
  /** Max momentané EBU R128 (LUFS). `null` = mesure impossible (fichier vide/illisible). */
  readonly lufsM: number | null
  readonly pic: number | null
}

function lister(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      out.push(...lister(p))
    } else if (/\.(mp3|ogg|wav)$/i.test(e)) {
      out.push(p)
    }
  }
  return out
}

function ffmpeg(args: readonly string[]): string {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 1 << 26 })
  return String(r.stderr ?? '')
}

function mesurer(fichier: string): Mesure {
  // `apad` : la fenêtre R128 fait 400 ms — sans padding, un one-shot de 300 ms
  // ne remplit jamais une fenêtre et ne produit aucune mesure.
  const sortie = ffmpeg(['-hide_banner', '-nostats', '-i', fichier, '-af', 'apad=pad_dur=1,ebur128', '-f', 'null', '-'])
  let max = -Infinity
  for (const m of sortie.matchAll(/M:\s*(-?[\d.]+|nan)/g)) {
    const brut = m[1]
    if (brut === undefined || brut === 'nan') {
      continue
    }
    const v = Number(brut)
    // −120.7 = le silence absolu tel que le rapporte ebur128 ; ce n'est pas un niveau.
    if (v > max && v > -100) {
      max = v
    }
  }
  const stats = ffmpeg(['-hide_banner', '-nostats', '-i', fichier, '-af', 'astats=metadata=1:reset=0', '-f', 'null', '-'])
  const pic = /Peak level dB:\s*(-?[\d.]+)/.exec(stats)
  return {
    fichier: relative(AUDIO_DIR, fichier).replace(/\\/g, '/'),
    lufsM: max === -Infinity ? null : Number(max.toFixed(1)),
    pic: pic?.[1] !== undefined ? Number(Number(pic[1]).toFixed(1)) : null
  }
}

function familleDe(fichier: string): Famille {
  // Premier préfixe qui matche : l'ordre de `FAMILLES` fait foi (sfx/weapons/
  // avant sfx/, sinon tout tomberait dans « SFX divers »).
  for (const f of FAMILLES) {
    if (fichier.startsWith(f.prefixe)) {
      return f
    }
  }
  return { prefixe: '', nom: 'Hors famille', floorDb: -40, spreadMaxDb: 99 }
}

function mediane(vals: readonly number[]): number {
  const t = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(t.length / 2)
  if (t.length % 2 === 1) {
    return t[mid] ?? 0
  }
  return ((t[mid - 1] ?? 0) + (t[mid] ?? 0)) / 2
}

function main(): void {
  if (!existsSync(AUDIO_DIR)) {
    console.error(`Dossier introuvable : ${AUDIO_DIR}`)
    process.exit(1)
  }
  if (spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status !== 0) {
    console.log('SKIP — ffmpeg absent du PATH. Ce script est un outil de recette manuelle.')
    process.exit(0)
  }

  const fichiers = lister(AUDIO_DIR)
  console.log(`Mesure de ${fichiers.length} fichiers (EBU R128, max momentané)...\n`)
  const mesures = fichiers.map(mesurer)

  const parFamille = new Map<string, Mesure[]>()
  for (const m of mesures) {
    const f = familleDe(m.fichier)
    const liste = parFamille.get(f.nom)
    if (liste === undefined) {
      parFamille.set(f.nom, [m])
    } else {
      liste.push(m)
    }
  }

  let erreurs = 0
  let avertissements = 0

  for (const famille of FAMILLES) {
    const membres = parFamille.get(famille.nom)
    if (membres === undefined || membres.length === 0) {
      continue
    }
    // On juge le niveau EFFECTIF (fichier + trim runtime), pas le fichier brut :
    // c'est ce que le joueur entend. Les fichiers écartés sont exclus de la
    // médiane — sinon un fichier mort tirerait la référence vers le bas et
    // masquerait ses voisins.
    const effectif = (m: Mesure): number | null => (m.lufsM === null ? null : m.lufsM + trimDb(m.fichier))
    const niveaux = membres
      .filter((m) => !REJETES_CONNUS.has(m.fichier))
      .map(effectif)
      .filter((v): v is number => v !== null)
    const med = niveaux.length > 0 ? mediane(niveaux) : 0
    console.log(`=== ${famille.nom} (n=${membres.length}) — médiane ${med.toFixed(1)} LUFS ===`)

    for (const m of [...membres].sort((a, b) => (effectif(a) ?? -999) - (effectif(b) ?? -999))) {
      const rejete = REJETES_CONNUS.has(m.fichier)
      const marque = rejete ? ' [écarté du manifeste, à régénérer]' : ''
      const trim = trimDb(m.fichier)
      const noteTrim = trim !== 0 ? ` [fichier ${m.lufsM} + trim ${trim > 0 ? '+' : ''}${trim} dB]` : ''
      const niv = effectif(m)
      if (niv === null) {
        console.log(`  MUET     ${m.fichier} — aucun signal mesurable${marque}`)
        if (!rejete) {
          erreurs++
        }
        continue
      }
      const ecart = niv - med
      if (niv < famille.floorDb) {
        console.log(
          `  MORT     ${m.fichier} — ${niv.toFixed(1)} LUFS (plancher ${famille.floorDb}, pic ${m.pic ?? '?'} dBFS)${marque}`
        )
        if (!rejete) {
          erreurs++
        }
      } else if (Math.abs(ecart) > famille.spreadMaxDb) {
        console.log(
          `  ÉCART    ${m.fichier} — ${niv.toFixed(1)} LUFS, ${ecart > 0 ? '+' : ''}${ecart.toFixed(1)} dB / médiane${marque}${noteTrim}`
        )
        if (!rejete) {
          avertissements++
        }
      } else {
        console.log(`  ok       ${m.fichier} — ${niv.toFixed(1)} LUFS${noteTrim}`)
      }
    }
    console.log('')
  }

  console.log(`--- ${erreurs} erreur(s), ${avertissements} avertissement(s) ---`)
  if (erreurs > 0) {
    console.log('Un fichier MORT/MUET ne s\'entendra jamais en jeu, quel que soit le mix.')
    process.exit(1)
  }
  if (avertissements > 0) {
    console.log('Les ÉCARTS sont à ÉCOUTER : le script mesure, il ne juge pas le goût.')
  }
}

main()
