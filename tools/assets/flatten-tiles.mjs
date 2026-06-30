import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Aplatit/normalise des tuiles de sol pour un rendu SEAMLESS sans damier.
// Cause du damier : variation de luminance ENTRE tuiles (le hash alterne
// claire/sombre) + taches INTERNES. Remède :
//   1) ramener toutes les tuiles retenues à la MÊME moyenne RVB (→ plus d'alternance),
//   2) tirer chaque pixel vers la moyenne de sa tuile (contraste interne × K → moins de taches).
// On retient les N tuiles les plus UNIFORMES (plus faible écart-type de luminance).
//
// Usage: node flatten-tiles.mjs <srcDir> <outDir> [N=6] [K=0.4] [count=16]
const [, , srcDir, outDir, nArg, kArg, cArg] = process.argv
const N = Number(nArg ?? 6)
const K = Number(kArg ?? 0.4)
const COUNT = Number(cArg ?? 16)
const clamp = (x) => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x))

const tiles = []
for (let i = 0; i < COUNT; i++) {
  const png = PNG.sync.read(readFileSync(`${srcDir}/tile_${i}.png`))
  const n = png.width * png.height
  let sum = 0
  const lum = new Float64Array(n)
  for (let p = 0; p < n; p++) {
    const L = 0.299 * png.data[p * 4] + 0.587 * png.data[p * 4 + 1] + 0.114 * png.data[p * 4 + 2]
    lum[p] = L
    sum += L
  }
  const mean = sum / n
  let v = 0
  for (let p = 0; p < n; p++) {
    const d = lum[p] - mean
    v += d * d
  }
  tiles.push({ i, png, std: Math.sqrt(v / n) })
}

// N tuiles les plus uniformes (écart-type le plus bas).
const chosen = [...tiles].sort((a, b) => a.std - b.std).slice(0, N)

// Moyenne RVB cible = moyenne des moyennes des tuiles retenues.
let tr = 0,
  tg = 0,
  tb = 0
for (const t of chosen) {
  const n = t.png.width * t.png.height
  let r = 0,
    g = 0,
    b = 0
  for (let p = 0; p < n; p++) {
    r += t.png.data[p * 4]
    g += t.png.data[p * 4 + 1]
    b += t.png.data[p * 4 + 2]
  }
  tr += r / n
  tg += g / n
  tb += b / n
}
tr /= chosen.length
tg /= chosen.length
tb /= chosen.length

chosen.forEach((t, idx) => {
  const png = t.png
  const n = png.width * png.height
  let mr = 0,
    mg = 0,
    mb = 0
  for (let p = 0; p < n; p++) {
    mr += png.data[p * 4]
    mg += png.data[p * 4 + 1]
    mb += png.data[p * 4 + 2]
  }
  mr /= n
  mg /= n
  mb /= n
  for (let p = 0; p < n; p++) {
    png.data[p * 4] = clamp(tr + (png.data[p * 4] - mr) * K)
    png.data[p * 4 + 1] = clamp(tg + (png.data[p * 4 + 1] - mg) * K)
    png.data[p * 4 + 2] = clamp(tb + (png.data[p * 4 + 2] - mb) * K)
    png.data[p * 4 + 3] = 255
  }
  writeFileSync(`${outDir}/tile_${idx}.png`, PNG.sync.write(png))
})

console.log(
  `chosen (i:std): ${chosen.map((t) => `${t.i}:${t.std.toFixed(1)}`).join(' ')} | target rgb ${tr.toFixed(0)},${tg.toFixed(0)},${tb.toFixed(0)} | K=${K}`
)
