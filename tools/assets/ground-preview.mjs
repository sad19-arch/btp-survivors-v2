import { PNG } from 'pngjs'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

// Aperçu « comme en jeu » du sol : grande zone remplie de tuiles de base
// tirées au sort par cellule (hash déterministe des coords) + décalques épars
// posés hors grille (PRNG seedé). Sert à juger variété / coutures / répétition.
//
// Usage: node ground-preview.mjs <baseDir> <indicesCSV> <decalsDir> <outPath> [W=640] [H=448] [decalCount=22]
const [, , baseDir, indicesCsv, decalsDir, outPath, wArg, hArg, dcArg] = process.argv
const TILE = 32
const W = Number(wArg ?? 640)
const H = Number(hArg ?? 448)
const DECALS = Number(dcArg ?? 22)

const baseIdx = indicesCsv.split(',').map((s) => Number(s.trim()))
const bases = baseIdx.map((i) => PNG.sync.read(readFileSync(`${baseDir}/tile_${i}.png`)))
const decals = readdirSync(decalsDir)
  .filter((f) => f.endsWith('.png'))
  .map((f) => PNG.sync.read(readFileSync(`${decalsDir}/${f}`)))

const out = new PNG({ width: W, height: H })

function hash32(a, b) {
  let h = (a * 73856093) ^ (b * 19349663)
  return (h >>> 0)
}
function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// 1) base tiles, variante = hash(cellX,cellY) % bases.length
for (let cy = 0; cy * TILE < H; cy++) {
  for (let cx = 0; cx * TILE < W; cx++) {
    const tile = bases[hash32(cx, cy) % bases.length]
    const ox = cx * TILE
    const oy = cy * TILE
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const si = (y * tile.width + x) * 4
        const di = ((oy + y) * W + (ox + x)) * 4
        out.data[di] = tile.data[si]
        out.data[di + 1] = tile.data[si + 1]
        out.data[di + 2] = tile.data[si + 2]
        out.data[di + 3] = 255
      }
    }
  }
}

// 2) décalques épars (alpha-over)
function blitAlpha(src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y
    if (dy < 0 || dy >= H) continue
    for (let x = 0; x < src.width; x++) {
      const dx = ox + x
      if (dx < 0 || dx >= W) continue
      const si = (y * src.width + x) * 4
      const a = src.data[si + 3] / 255
      if (a === 0) continue
      const di = (dy * W + dx) * 4
      out.data[di] = Math.round(src.data[si] * a + out.data[di] * (1 - a))
      out.data[di + 1] = Math.round(src.data[si + 1] * a + out.data[di + 1] * (1 - a))
      out.data[di + 2] = Math.round(src.data[si + 2] * a + out.data[di + 2] * (1 - a))
    }
  }
}
const rng = mulberry32(1234)
for (let i = 0; i < DECALS; i++) {
  const d = decals[Math.floor(rng() * decals.length)]
  const ox = Math.floor(rng() * (W - d.width))
  const oy = Math.floor(rng() * (H - d.height))
  blitAlpha(d, ox, oy)
}

writeFileSync(outPath, PNG.sync.write(out))
console.log(`wrote ${outPath} ${W}x${H} — ${bases.length} bases + ${decals.length} décalques (${DECALS} posés)`)
