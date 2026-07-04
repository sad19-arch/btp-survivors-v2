import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Télécharge les frames de marche PixelLab (4 directions) et les assemble en une
// feuille au format du jeu : grille (N colonnes × 4 lignes) de cellules CELL×CELL,
// ordre des lignes south/east/north/west (= down/right/up/left, comme player_j1).
// Chaque frame native (≤ CELL) est centrée horizontalement, ancrée en BAS de la
// cellule (comme un perso posé au sol) pour un rendu cohérent avec player_j1.
//
// Usage:
//   node fetch-pack-character.mjs <out.png> <cell> <nframes> <start> \
//        <southBase> <eastBase> <northBase> <westBase>
// où <dirBase> sert les frames à `<dirBase>/<i>.png` (i ∈ [start..start+nframes-1]).
// Imprime la bbox verticale (frame sud 0) + l'échelle suggérée pour ~83px affichés
// (= hauteur affichée de player_j1 : 160px natif × 0.516).
const [, , out, cellArg, nArg, startArg, sBase, eBase, nBase, wBase] = process.argv
if (out === undefined || sBase === undefined || wBase === undefined) {
  console.error(
    'usage: node fetch-pack-character.mjs <out.png> <cell> <nframes> <start> <southBase> <eastBase> <northBase> <westBase>'
  )
  process.exit(2)
}
const CELL = Number(cellArg ?? 192)
const NF = Number(nArg ?? 4)
const START = Number(startArg ?? 0)
const TARGET_DISPLAY = 83 // hauteur affichée cible = player_j1
const bases = [sBase, eBase, nBase, wBase] // rangées south/east/north/west

async function fetchPng(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return PNG.sync.read(Buffer.from(await r.arrayBuffer()))
}

// Centré dans la cellule (même convention que pack-character.mjs → cohérent
// avec player_j1 et les feuilles d'ennemis, origine sprite au centre 0.5/0.5).
function blit(dst, src, cellX, cellY) {
  const ox = cellX + Math.floor((CELL - src.width) / 2)
  const oy = cellY + Math.floor((CELL - src.height) / 2)
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y
    if (dy < 0 || dy >= dst.height) continue
    for (let x = 0; x < src.width; x++) {
      const dx = ox + x
      if (dx < 0 || dx >= dst.width) continue
      const si = (y * src.width + x) * 4
      const di = (dy * dst.width + dx) * 4
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
}

const sheet = new PNG({ width: CELL * NF, height: CELL * 4 }) // data zéro = transparent
let firstSouth
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < NF; c++) {
    const frame = await fetchPng(`${bases[r]}/${START + c}.png`)
    if (r === 0 && c === 0) firstSouth = frame
    blit(sheet, frame, c * CELL, r * CELL)
  }
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, PNG.sync.write(sheet))

// bbox verticale de la figure (frame sud 0) pour calibrer renderScale.
let minY = CELL
let maxY = 0
for (let y = 0; y < firstSouth.height; y++) {
  for (let x = 0; x < firstSouth.width; x++) {
    if (firstSouth.data[(y * firstSouth.width + x) * 4 + 3] > 40) {
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
const figureH = maxY - minY + 1
console.log(
  `wrote ${out} ${CELL * NF}x${CELL * 4} · figure H=${figureH}px natif · renderScale pour ~${TARGET_DISPLAY}px = ${(TARGET_DISPLAY / figureH).toFixed(3)}`
)
