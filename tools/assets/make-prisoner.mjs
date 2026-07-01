import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Ouvrier prisonnier = SOSIE du héros (player_j1) avec une longue barbe. Dérivé de la
// frame sud de player_j1 (cohérence DA garantie, zéro quota) : on repère la zone de
// peau (visage) et on peint une barbe grise par-dessus. Sortie 192×192 (frame sud unique).
//
// Usage: node make-prisoner.mjs
const FRAME = 192
const src = PNG.sync.read(readFileSync('public/player_j1.png'))

const cell = new PNG({ width: FRAME, height: FRAME })
for (let y = 0; y < FRAME; y++) {
  for (let x = 0; x < FRAME; x++) {
    const si = (y * src.width + x) * 4 // frame sud (0,0)
    const di = (y * FRAME + x) * 4
    cell.data[di] = src.data[si]
    cell.data[di + 1] = src.data[si + 1]
    cell.data[di + 2] = src.data[si + 2]
    cell.data[di + 3] = src.data[si + 3]
  }
}

// Repère la peau (~ 249,193,158) UNIQUEMENT dans le haut du sprite (tête) → bbox du
// visage. On exclut le bas (mains/bras) qui, sinon, gonfle la barbe démesurément.
const HEAD_MAX_Y = Math.floor(FRAME * 0.45)
let minX = FRAME
let maxX = 0
let minY = FRAME
let maxY = 0
let found = false
for (let y = 0; y < HEAD_MAX_Y; y++) {
  for (let x = 0; x < FRAME; x++) {
    const i = (y * FRAME + x) * 4
    if (cell.data[i + 3] < 128) continue
    const r = cell.data[i]
    const g = cell.data[i + 1]
    const b = cell.data[i + 2]
    const d = Math.hypot(r - 249, g - 193, b - 158)
    if (d < 62 && r > g && g > b) {
      found = true
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
if (!found) {
  // repli : zone tête approximative (haut-centre du sprite)
  minX = FRAME * 0.4
  maxX = FRAME * 0.6
  minY = FRAME * 0.28
  maxY = FRAME * 0.42
}

const cx = (minX + maxX) / 2
const faceH = maxY - minY
const faceHalf = Math.max(10, (maxX - minX) / 2)
// Barbe : part du bas du visage (menton) et descend d'une longueur modérée (~ hauteur
// du visage). Longue mais sans recouvrir tout le corps.
const beardTop = Math.round(maxY - 6)
const beardLen = Math.round(faceH * 0.95)

const FILL = [198, 194, 184]
const SHADE = [150, 146, 136]
const HI = [224, 220, 210]
const OUT = [34, 30, 26]

function set(x, y, c) {
  if (x < 0 || y < 0 || x >= FRAME || y >= FRAME) return
  const i = (y * FRAME + x) * 4
  cell.data[i] = c[0]
  cell.data[i + 1] = c[1]
  cell.data[i + 2] = c[2]
  cell.data[i + 3] = 255
}

// Barbe en brins verticaux (mèches) : ombrage par colonne, reflet central, pointe
// effilochée → moins « triangle plein », plus poilu.
for (let k = 0; k <= beardLen; k++) {
  const y = beardTop + k
  const p = k / beardLen
  const half = Math.round(faceHalf * (1 - p * 0.72))
  for (let x = Math.round(cx - half); x <= cx + half; x++) {
    const strand = Math.floor((x - cx) / 2)
    // trous vers la pointe (effiloché) selon la mèche
    if (p > 0.68 && (strand * 3 + (x & 1)) % 3 === 0 && k % 2 === 0) {
      continue
    }
    const edge = x <= cx - half + 1 || x >= cx + half - 1
    const center = Math.abs(x - cx) < half * 0.32
    const c = edge ? OUT : ((strand & 1) === 0 ? SHADE : center ? HI : FILL)
    set(x, y, c)
  }
}
// petite moustache au-dessus de la barbe
for (let x = Math.round(cx - faceHalf * 0.7); x <= cx + faceHalf * 0.7; x++) {
  set(x, beardTop - 1, (x & 1) === 0 ? SHADE : FILL)
}

writeFileSync('public/stage01/npc/prisoner_walk.png', PNG.sync.write(cell))
console.log(`wrote public/stage01/npc/prisoner_walk.png ${FRAME}x${FRAME} (sosie barbu)`)
