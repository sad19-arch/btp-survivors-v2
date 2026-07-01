import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Palette-swap « casque doré » (déblocage code Konami) : mappe chaque pixel opaque
// non-contour vers une rampe dorée selon sa luminance, en préservant le contour
// sombre (silhouette lisible, DA 16-bit). Purement cosmétique, déterministe.
//
// Usage: node recolor-gold.mjs <in.png> <out.png>
const [, , inPath, outPath] = process.argv
if (inPath === undefined || outPath === undefined) {
  console.error('usage: node recolor-gold.mjs <in.png> <out.png>')
  process.exit(2)
}

// Seuil sous lequel un pixel est considéré comme contour → conservé tel quel.
const OUTLINE_L = 46
// Rampe dorée (sombre → clair), interpolée par luminance.
const RAMP = [
  [40, 26, 8],
  [120, 82, 18],
  [196, 148, 34],
  [236, 194, 66],
  [255, 232, 140]
]

function goldFor(l) {
  const t = Math.max(0, Math.min(1, l / 255)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(t))
  const f = t - i
  const a = RAMP[i]
  const b = RAMP[i + 1]
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f)
  ]
}

const png = PNG.sync.read(readFileSync(inPath))
for (let i = 0; i < png.data.length; i += 4) {
  const alpha = png.data[i + 3]
  if (alpha < 24) {
    continue
  }
  const r = png.data[i]
  const g = png.data[i + 1]
  const b = png.data[i + 2]
  const l = 0.299 * r + 0.587 * g + 0.114 * b
  if (l < OUTLINE_L) {
    continue // contour sombre conservé (silhouette nette)
  }
  const [gr, gg, gb] = goldFor(l)
  png.data[i] = gr
  png.data[i + 1] = gg
  png.data[i + 2] = gb
}
writeFileSync(outPath, PNG.sync.write(png))
console.log(`wrote ${outPath} (recolor or, ${png.width}x${png.height})`)
