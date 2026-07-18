import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Télécharge les frames d'une animation d'OBJET PixelLab, MESURE le mouvement,
// DÉCIDE boucle directe vs aller-retour, et packe en feuille horizontale à
// frames CARRÉES (load.spritesheet n'accepte qu'UN nombre : frameWidth=frameHeight).
//
// Usage: node pack-engin.mjs <baseUrl> <nframes> <out.png> [startIndex=0]
//
// startIndex : 1re frame à récupérer. Les anims v3 stockent la frame de RÉFÉRENCE
// en index 0 ; quand l'objet a été généré sur fond OPAQUE, cette frame 0 traîne un
// fond gris alors que les frames générées sont transparentes (constaté sur la grue
// à tour). Dans ce cas → startIndex=1. Même convention que pack-npc.mjs.
//
// Critère (spec 2026-07-16) : raccord(dernière→première) > 2,2 × moyenne(frame→frame)
// ⇒ sens unique ⇒ aller-retour. Sinon ⇒ boucle directe (feuille 2× plus légère).
// Garde-fou : mouvement moyen < 0,2 % des pixels ⇒ animation MORTE, on signale.
// [loop] : 'auto' (défaut, la MESURE décide) | 'pingpong' | 'direct'. L'override
// existe parce que la mesure est PIXELLIQUE, pas SÉMANTIQUE : elle compare des
// images, elle ne sait pas ce qu'elles racontent. Cas réel (bulldozer `_work`) :
// un tas de terre s'ACCUMULE devant la lame frame après frame. Le raccord sort à
// 1,45× (« boucle directe ») parce que chaque pas est déjà gros — mais boucler
// en direct ferait DISPARAÎTRE le tas d'un coup. Un processus qui accumule de la
// matière est à sens unique, quoi qu'en dise le ratio. À n'utiliser QUE là, en
// justifiant : le défaut reste la mesure.
const [, , baseUrl, nArg, out, startArg, loopArg] = process.argv
if (baseUrl === undefined || out === undefined) {
  console.error('usage: node pack-engin.mjs <baseUrl> <nframes> <out.png> [startIndex=0] [auto|pingpong|direct]')
  process.exit(2)
}
const NF = Number(nArg)
const START = Number(startArg ?? 0)
const LOOP = loopArg ?? 'auto'
const PINGPONG_RATIO = 2.2
const DEAD_THRESHOLD = 0.002 // 0,2 % des pixels

async function fetchPng(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return PNG.sync.read(Buffer.from(await r.arrayBuffer()))
}

const frames = []
for (let i = 0; i < NF; i++) frames.push(await fetchPng(`${baseUrl}/${START + i}.png`))

// Garde : une frame au fond OPAQUE dans une feuille transparente = carré visible
// en jeu. On refuse de livrer plutôt que de laisser passer (cf. grue à tour).
frames.forEach((f, i) => {
  let opaque = 0
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++) if (f.data[(y * f.width + x) * 4 + 3] > 16) opaque++
  if (opaque === 36) {
    console.error(
      `ERREUR: frame ${START + i} a un FOND OPAQUE (coin plein). ` +
        `Si c'est la frame de référence v3, relancer avec startIndex=${START + i + 1}.`
    )
    process.exit(3)
  }
})

// --- MESURE : fraction de pixels qui changent entre deux frames ---------------
// Compare RGBA avec un seuil : un pixel « change » si sa couleur composite bouge
// nettement (évite de compter le bruit de quantisation comme du mouvement).
function diffFraction(a, b) {
  let changed = 0
  const n = a.width * a.height
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const aA = a.data[o + 3]
    const bA = b.data[o + 3]
    // Transparent des deux côtés = pixel de fond, on l'ignore du comptage utile.
    if (aA < 16 && bA < 16) continue
    const d =
      Math.abs(a.data[o] - b.data[o]) +
      Math.abs(a.data[o + 1] - b.data[o + 1]) +
      Math.abs(a.data[o + 2] - b.data[o + 2]) +
      Math.abs(aA - bA)
    if (d > 48) changed++
  }
  return changed / n
}

const steps = []
for (let i = 0; i < NF - 1; i++) steps.push(diffFraction(frames[i], frames[i + 1]))
const seam = diffFraction(frames[NF - 1], frames[0])
const mean = steps.reduce((s, v) => s + v, 0) / steps.length
const ratio = seam / mean
const measured = ratio > PINGPONG_RATIO
const pingpong = LOOP === 'auto' ? measured : LOOP === 'pingpong'

// --- DÉCISION ----------------------------------------------------------------
// Aller-retour : 0..N-1 puis N-2..1 (on ne répète NI la dernière NI la première).
const order = pingpong
  ? [...frames.keys(), ...[...frames.keys()].slice(1, -1).reverse()]
  : [...frames.keys()]

// --- PACKING : cellules CARRÉES ---------------------------------------------
const CELL = Math.max(...frames.map((f) => Math.max(f.width, f.height)))
const sheet = new PNG({ width: CELL * order.length, height: CELL })
function blitCentered(dst, src, cellX) {
  const ox = cellX + Math.floor((CELL - src.width) / 2)
  const oy = Math.floor((CELL - src.height) / 2)
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4
      const di = ((oy + y) * dst.width + ox + x) * 4
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
}
order.forEach((fi, i) => blitCentered(sheet, frames[fi], i * CELL))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, PNG.sync.write(sheet))

// --- bbox de la figure (frame 0) pour calibrer scale -------------------------
const f0 = frames[0]
const oy0 = Math.floor((CELL - f0.height) / 2)
let minY = CELL
let maxY = 0
for (let y = 0; y < f0.height; y++) {
  for (let x = 0; x < f0.width; x++) {
    if (f0.data[(y * f0.width + x) * 4 + 3] > 40) {
      const gy = oy0 + y
      if (gy < minY) minY = gy
      if (gy > maxY) maxY = gy
    }
  }
}
const figureH = maxY - minY + 1
const dead = mean < DEAD_THRESHOLD
console.log(
  JSON.stringify({
    out,
    cell: CELL,
    framesIn: NF,
    framesOut: order.length,
    loop: pingpong ? 'ALLER-RETOUR' : 'boucle directe',
    decidePar: LOOP === 'auto' ? 'mesure' : `FORCÉ (${LOOP}) — la mesure disait « ${measured ? 'aller-retour' : 'boucle directe'} »`,
    meanPerFrame: `${(mean * 100).toFixed(2)}%`,
    seam: `${(seam * 100).toFixed(2)}%`,
    ratio: ratio.toFixed(2),
    figureH,
    dead: dead ? 'MORTE — NE PAS LIVRER' : 'ok',
  })
)
