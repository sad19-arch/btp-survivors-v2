import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Feuille d'attente « impatiente » du héros, DÉRIVÉE de player_j1 (source de vérité
// visuelle) → cohérence DA garantie, zéro quota. On extrait la frame sud (repos) et
// on synthétise 4 frames d'un léger balancement vertical + dandinement (le perso
// piétine d'impatience). Sortie : 768×192 (4 frames sud), chargée comme spritesheet 192.
//
// Usage: node make-idle.mjs
const FRAME = 192
const NF = 4
const src = PNG.sync.read(readFileSync('public/player_j1.png'))

// Frame sud, repos = ligne 0 (south), colonne 0 de la planche 4×4.
function readCell(col, row) {
  const cell = new PNG({ width: FRAME, height: FRAME })
  const ox = col * FRAME
  const oy = row * FRAME
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      const si = ((oy + y) * src.width + (ox + x)) * 4
      const di = (y * FRAME + x) * 4
      cell.data[di] = src.data[si]
      cell.data[di + 1] = src.data[si + 1]
      cell.data[di + 2] = src.data[si + 2]
      cell.data[di + 3] = src.data[si + 3]
    }
  }
  return cell
}

const rest = readCell(0, 0)
const out = new PNG({ width: FRAME * NF, height: FRAME })

// Balancement subtil : léger rebond vertical + dandinement horizontal (impatience).
const DY = [0, -2, -3, -1]
const DX = [0, 1, 0, -1]

for (let f = 0; f < NF; f++) {
  const dx = DX[f]
  const dy = DY[f]
  for (let y = 0; y < FRAME; y++) {
    const sy = y - dy
    if (sy < 0 || sy >= FRAME) continue
    for (let x = 0; x < FRAME; x++) {
      const sx = x - dx
      if (sx < 0 || sx >= FRAME) continue
      const si = (sy * FRAME + sx) * 4
      if (rest.data[si + 3] === 0) continue
      const di = (y * out.width + (f * FRAME + x)) * 4
      out.data[di] = rest.data[si]
      out.data[di + 1] = rest.data[si + 1]
      out.data[di + 2] = rest.data[si + 2]
      out.data[di + 3] = rest.data[si + 3]
    }
  }
}
writeFileSync('public/player_idle.png', PNG.sync.write(out))
console.log(`wrote public/player_idle.png ${FRAME * NF}x${FRAME} (4 frames sud, dérivé de player_j1)`)
