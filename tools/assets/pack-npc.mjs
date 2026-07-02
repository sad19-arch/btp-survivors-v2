import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Télécharge les N frames de marche SUD d'un perso PixelLab et les packe dans une
// feuille 1 rangée × cellules CELL (centrées) → rendu via walkFrame(0,...). Mesure
// la bbox de la figure (frame 0) et suggère l'échelle pour ~cible px affichés.
//
// Usage: node pack-npc.mjs <baseUrlSouth> <nframes> <cell> <out.png> [targetPx=95] [startIndex=0]
// startIndex : 1re frame à récupérer (utile pour sauter la frame de référence des anims v3).
const [, , baseUrl, nArg, cellArg, out, targetArg, startArg] = process.argv
if (baseUrl === undefined || out === undefined) {
  console.error('usage: node pack-npc.mjs <baseUrlSouth> <nframes> <cell> <out.png> [targetPx=95] [startIndex=0]')
  process.exit(2)
}
const NF = Number(nArg)
const CELL = Number(cellArg)
const target = Number(targetArg ?? 95)
const START = Number(startArg ?? 0)

async function fetchPng(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return PNG.sync.read(Buffer.from(await r.arrayBuffer()))
}

const frames = []
for (let i = 0; i < NF; i++) frames.push(await fetchPng(`${baseUrl}/${START + i}.png`))

const sheet = new PNG({ width: CELL * NF, height: CELL })
function blitCentered(dst, src, cellX) {
  const ox = cellX + Math.floor((CELL - src.width) / 2)
  const oy = Math.floor((CELL - src.height) / 2)
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y
    if (dy < 0 || dy >= CELL) continue
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
frames.forEach((f, i) => blitCentered(sheet, f, i * CELL))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, PNG.sync.write(sheet))

// bbox verticale de la figure (frame 0) pour calibrer l'échelle.
const f0 = frames[0]
const oy = Math.floor((CELL - f0.height) / 2)
let minY = CELL
let maxY = 0
for (let y = 0; y < f0.height; y++) {
  for (let x = 0; x < f0.width; x++) {
    if (f0.data[(y * f0.width + x) * 4 + 3] > 40) {
      const gy = oy + y
      if (gy < minY) minY = gy
      if (gy > maxY) maxY = gy
    }
  }
}
const bboxH = maxY - minY
console.log(`wrote ${out} ${CELL * NF}x${CELL} · figure H=${bboxH}px · scale pour ~${target}px = ${(target / bboxH).toFixed(3)}`)
