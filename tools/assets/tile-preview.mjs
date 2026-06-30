import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Aperçu de tiling : chaque tuile répétée REPEAT×REPEAT, en grille, pour juger
// la couture et l'effet de répétition avant de choisir les tuiles de base.
const DIR = process.argv[2]
const N = Number(process.argv[3] ?? 16)
const TILE = 32
const REPEAT = 4
const BLOCK = TILE * REPEAT
const GAP = 8
const COLS = 4
const ROWS = Math.ceil(N / COLS)
const W = COLS * BLOCK + (COLS + 1) * GAP
const H = ROWS * BLOCK + (ROWS + 1) * GAP

const out = new PNG({ width: W, height: H })
for (let i = 0; i < out.data.length; i += 4) {
  out.data[i] = 40; out.data[i + 1] = 40; out.data[i + 2] = 40; out.data[i + 3] = 255
}

function blitTiled(dst, tile, ox, oy) {
  for (let by = 0; by < BLOCK; by++) {
    for (let bx = 0; bx < BLOCK; bx++) {
      const sx = bx % TILE
      const sy = by % TILE
      const si = (sy * tile.width + sx) * 4
      const di = ((oy + by) * dst.width + (ox + bx)) * 4
      const a = tile.data[si + 3] / 255
      dst.data[di] = Math.round(tile.data[si] * a + dst.data[di] * (1 - a))
      dst.data[di + 1] = Math.round(tile.data[si + 1] * a + dst.data[di + 1] * (1 - a))
      dst.data[di + 2] = Math.round(tile.data[si + 2] * a + dst.data[di + 2] * (1 - a))
      dst.data[di + 3] = 255
    }
  }
}

for (let n = 0; n < N; n++) {
  const tile = PNG.sync.read(readFileSync(`${DIR}/tile_${n}.png`))
  const col = n % COLS
  const row = Math.floor(n / COLS)
  const ox = GAP + col * (BLOCK + GAP)
  const oy = GAP + row * (BLOCK + GAP)
  blitTiled(out, tile, ox, oy)
}

writeFileSync(`${DIR}/tiling_preview.png`, PNG.sync.write(out))
console.log(`wrote ${DIR}/tiling_preview.png (${W}x${H}) — chaque case = 1 tuile répétée ${REPEAT}x${REPEAT}`)
