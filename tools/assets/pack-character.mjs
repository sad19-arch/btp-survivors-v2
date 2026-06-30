import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Assemble une feuille de marche 4 directions × N frames au format du jeu :
// grille (N colonnes × 4 lignes) de cellules FRAME×FRAME, ordre des lignes
// south/east/north/west (= down/right/up/left, comme player_j1).
// Chaque frame PixelLab (taille native ≤ FRAME) est centrée dans sa cellule.
//
// Usage: node pack-character.mjs <inputDir> <outPath> [frame=192] [nframes=4]
//   inputDir/<dir>/<i>.png  pour dir ∈ {south,east,north,west}, i ∈ [0..nframes-1]
const [, , inDir, outPath, frameArg, nArg] = process.argv
if (inDir === undefined || outPath === undefined) {
  console.error('usage: node pack-character.mjs <inputDir> <outPath> [frame=192] [nframes=4]')
  process.exit(2)
}
const FRAME = Number(frameArg ?? 192)
const NF = Number(nArg ?? 4)
const DIRS = ['south', 'east', 'north', 'west']

const out = new PNG({ width: FRAME * NF, height: FRAME * DIRS.length }) // data zéro = transparent

function blitCentered(dst, src, cellX, cellY) {
  const ox = cellX + Math.floor((FRAME - src.width) / 2)
  const oy = cellY + Math.floor((FRAME - src.height) / 2)
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

let maxSrc = 0
for (let r = 0; r < DIRS.length; r++) {
  for (let c = 0; c < NF; c++) {
    const src = PNG.sync.read(readFileSync(`${inDir}/${DIRS[r]}/${c}.png`))
    maxSrc = Math.max(maxSrc, src.width, src.height)
    blitCentered(out, src, c * FRAME, r * FRAME)
  }
}
writeFileSync(outPath, PNG.sync.write(out))
console.log(`wrote ${outPath} ${FRAME * NF}x${FRAME * DIRS.length} (frame=${FRAME}, src max=${maxSrc}px)`)
