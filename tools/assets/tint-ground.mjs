import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Teinte les tuiles de sol d'un stage vers la couleur d'accent de sa phase, en
// PRÉSERVANT la luminance de chaque pixel (donc la texture + le seamless). But :
// désambiguïser les sols qui se ressemblent (deux bruns, trio pâle). Déterministe,
// zéro quota, réversible via git.
//
// Usage: node tint-ground.mjs <stageDir> <hexAccent> <strength 0..1> [nTiles=6]
const [, , dir, hex, strengthArg, nArg] = process.argv
if (dir === undefined || hex === undefined || strengthArg === undefined) {
  console.error('usage: node tint-ground.mjs <stageDir> <hexAccent> <strength> [nTiles=6]')
  process.exit(2)
}
const strength = Number(strengthArg)
const N = Number(nArg ?? 6)
const h = hex.replace('#', '')
const aR = parseInt(h.slice(0, 2), 16)
const aG = parseInt(h.slice(2, 4), 16)
const aB = parseInt(h.slice(4, 6), 16)
const aL = 0.299 * aR + 0.587 * aG + 0.114 * aB || 1

function tint(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue
    const r = png.data[i]
    const g = png.data[i + 1]
    const b = png.data[i + 2]
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    const s = l / aL // accent mis à la luminance du pixel → décalage de teinte, texture gardée
    const tr = Math.min(255, aR * s)
    const tg = Math.min(255, aG * s)
    const tb = Math.min(255, aB * s)
    png.data[i] = Math.round(r + (tr - r) * strength)
    png.data[i + 1] = Math.round(g + (tg - g) * strength)
    png.data[i + 2] = Math.round(b + (tb - b) * strength)
  }
}

for (let k = 0; k < N; k++) {
  const path = `${dir}/ground/tile_${k}.png`
  const png = PNG.sync.read(readFileSync(path))
  tint(png)
  writeFileSync(path, PNG.sync.write(png))
}
console.log(`teinté ${dir}/ground (×${N}) → #${h} @${strength}`)
