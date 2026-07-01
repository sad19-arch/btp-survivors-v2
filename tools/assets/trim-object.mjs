import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Recadre un PNG à sa bounding box non-transparente (+ padding optionnel).
// Utile pour les props/projectiles/icônes : la génération centre l'art dans un
// canevas avec du transparent autour → on le resserre pour un rendu/échelle net.
//
// Usage: node trim-object.mjs <in.png> <out.png> [pad=1]
const [, , inp, outp, padArg] = process.argv
const pad = Number(padArg ?? 1)
const png = PNG.sync.read(readFileSync(inp))
let minX = png.width,
  minY = png.height,
  maxX = -1,
  maxY = -1
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
if (maxX < 0) {
  console.error(`vide (tout transparent): ${inp}`)
  process.exit(1)
}
minX = Math.max(0, minX - pad)
minY = Math.max(0, minY - pad)
maxX = Math.min(png.width - 1, maxX + pad)
maxY = Math.min(png.height - 1, maxY + pad)
const w = maxX - minX + 1
const h = maxY - minY + 1
const out = new PNG({ width: w, height: h })
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const si = ((minY + y) * png.width + (minX + x)) * 4
    const di = (y * w + x) * 4
    out.data[di] = png.data[si]
    out.data[di + 1] = png.data[si + 1]
    out.data[di + 2] = png.data[si + 2]
    out.data[di + 3] = png.data[si + 3]
  }
}
writeFileSync(outp, PNG.sync.write(out))
console.log(`${outp} ${w}×${h}`)
