import { PNG } from 'pngjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

// Ouvrier prisonnier = SOSIE du héros (player_j1) avec une longue barbe grise.
// Dérivé des 4 frames de MARCHE SUD de player_j1 (rangée 0) → cohérence DA garantie,
// et il peut s'ANIMER en courant quand on le libère. Barbe peinte sur chaque frame
// (la tête bouge peu dans un cycle de marche → même barbe alignée). Sortie 768×192.
//
// Usage: node make-prisoner.mjs
const FRAME = 192
const NF = 4
const src = PNG.sync.read(readFileSync('public/player_j1.png'))
const out = new PNG({ width: FRAME * NF, height: FRAME }) // rangée sud, 4 frames

// Recopie une frame sud (col, rangée 0) de la planche source vers la sortie (à colOut).
function copyFrame(col, colOut) {
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      const si = (y * src.width + (col * FRAME + x)) * 4
      const di = (y * out.width + (colOut * FRAME + x)) * 4
      out.data[di] = src.data[si]
      out.data[di + 1] = src.data[si + 1]
      out.data[di + 2] = src.data[si + 2]
      out.data[di + 3] = src.data[si + 3]
    }
  }
}
for (let c = 0; c < NF; c++) copyFrame(c, c)

// Détecte la peau du visage sur la 1re frame (haut du sprite) → bbox.
const HEAD_MAX_Y = Math.floor(FRAME * 0.45)
let minX = FRAME
let maxX = 0
let minY = FRAME
let maxY = 0
let found = false
for (let y = 0; y < HEAD_MAX_Y; y++) {
  for (let x = 0; x < FRAME; x++) {
    const i = (y * out.width + x) * 4 // frame 0 (colOut 0)
    if (out.data[i + 3] < 128) continue
    const r = out.data[i]
    const g = out.data[i + 1]
    const b = out.data[i + 2]
    if (Math.hypot(r - 249, g - 193, b - 158) < 62 && r > g && g > b) {
      found = true
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
if (!found) {
  minX = FRAME * 0.4
  maxX = FRAME * 0.6
  minY = FRAME * 0.28
  maxY = FRAME * 0.42
}
const cx = (minX + maxX) / 2
const faceH = maxY - minY
const faceHalf = Math.max(10, (maxX - minX) / 2)
const beardTop = Math.round(maxY - 6)
const beardLen = Math.round(faceH * 0.95)

const FILL = [198, 194, 184]
const SHADE = [150, 146, 136]
const HI = [224, 220, 210]
const OUT = [34, 30, 26]

function set(colOut, x, y, c) {
  const gx = colOut * FRAME + x
  if (gx < 0 || y < 0 || gx >= out.width || y >= FRAME) return
  const i = (y * out.width + gx) * 4
  out.data[i] = c[0]
  out.data[i + 1] = c[1]
  out.data[i + 2] = c[2]
  out.data[i + 3] = 255
}

// Peint la barbe (mèches verticales + reflet + pointe effilochée) sur une frame.
function drawBeard(colOut) {
  for (let k = 0; k <= beardLen; k++) {
    const y = beardTop + k
    const p = k / beardLen
    const half = Math.round(faceHalf * (1 - p * 0.72))
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      const strand = Math.floor((x - cx) / 2)
      if (p > 0.68 && (strand * 3 + (x & 1)) % 3 === 0 && k % 2 === 0) continue
      const edge = x <= cx - half + 1 || x >= cx + half - 1
      const center = Math.abs(x - cx) < half * 0.32
      set(colOut, x, y, edge ? OUT : (strand & 1) === 0 ? SHADE : center ? HI : FILL)
    }
  }
  for (let x = Math.round(cx - faceHalf * 0.7); x <= cx + faceHalf * 0.7; x++) {
    set(colOut, x, beardTop - 1, (x & 1) === 0 ? SHADE : FILL)
  }
}
for (let c = 0; c < NF; c++) drawBeard(c)

mkdirSync('public/stage01/npc', { recursive: true })
writeFileSync('public/stage01/npc/prisoner_walk.png', PNG.sync.write(out))
console.log(`wrote public/stage01/npc/prisoner_walk.png ${FRAME * NF}x${FRAME} (marche sud barbue, 4 frames)`)
