import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

/**
 * PLANCHE DE JUGEMENT EN CONTEXTE (skill `assets` §5/§15).
 *
 * Juger un asset sur fond damier MENT : on n'y voit ni s'il se lit à ~100 px, ni
 * s'il se confond avec le sol, ni s'il est à l'échelle du joueur, ni si sa
 * perspective jure avec la sienne. On le pose donc sur le VRAI sol du stage, à
 * côté du VRAI joueur, aux tailles réelles du jeu.
 *
 * Ça n'est pas théorique : c'est cette planche qui a révélé que la camionnette du
 * golden batch était en vue de CÔTÉ et la tache d'huile VIOLETTE — deux défauts
 * invisibles sur les vignettes de PixelLab.
 *
 * Usage : node tools/assets/context-board.mjs <spec.json>
 *
 * spec.json = {
 *   "out":    "chemin/de/sortie.png",
 *   "ground": "public/stage01/ground/tile_0.png",   // optionnel
 *   "items":  [{ "file": "public/signs/x.png", "label": "X", "h": 92 }]
 * }
 * `h` = hauteur VOULUE en jeu, en pixels écran (le joueur en fait 99).
 */

const specPath = process.argv[2]
if (specPath === undefined) {
  console.error('usage: node tools/assets/context-board.mjs <spec.json>')
  process.exit(1)
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'))
const items = spec.items
const groundFile = spec.ground ?? 'public/stage01/ground/tile_0.png'

function load(p) { return PNG.sync.read(readFileSync(p)) }

/** Échelle de rendu du joueur en jeu : planche 192 → ~99 px à l'écran. */
const PLAYER_SCALE = 0.516

const CELL_W = 230
const CELL_H = 270
const COLS = Math.min(4, items.length)
const ROWS = Math.ceil(items.length / COLS)
const W = CELL_W * COLS
const H = CELL_H * ROWS

const out = new PNG({ width: W, height: H })

// Fond : le VRAI sol du stage, tuilé (comme le TileSprite en jeu).
const ground = load(groundFile)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const s = ((y % ground.height) * ground.width + (x % ground.width)) * 4
    const d = (y * W + x) * 4
    out.data[d] = ground.data[s]
    out.data[d + 1] = ground.data[s + 1]
    out.data[d + 2] = ground.data[s + 2]
    out.data[d + 3] = 255
  }
}

/** Blit alpha, redimensionné au plus proche voisin (pixel art : jamais d'interpolation). */
function blit(src, sx0, sy0, sw, sh, dx, dy, dw, dh) {
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const px = Math.round(dx + x)
      const py = Math.round(dy + y)
      if (px < 0 || py < 0 || px >= W || py >= H) { continue }
      const ux = sx0 + Math.floor((x / dw) * sw)
      const uy = sy0 + Math.floor((y / dh) * sh)
      const s = (uy * src.width + ux) * 4
      const a = src.data[s + 3] / 255
      if (a <= 0.02) { continue }
      const d = (py * W + px) * 4
      for (let c = 0; c < 3; c++) {
        out.data[d + c] = Math.round(src.data[s + c] * a + out.data[d + c] * (1 - a))
      }
      out.data[d + 3] = 255
    }
  }
}

// Le joueur dans CHAQUE case : l'étalon d'échelle ET de direction artistique.
const player = load('public/player_j1.png')
const F = player.width / 4 // 768/4 = 192
const PLAYER_H = Math.round(F * PLAYER_SCALE) // ≈ 99 px, comme en jeu

for (let i = 0; i < items.length; i++) {
  const it = items[i]
  const cx = (i % COLS) * CELL_W
  const cy = Math.floor(i / COLS) * CELL_H
  const baseY = cy + CELL_H - 42 // ligne de sol commune à la case

  const img = load(it.file)
  const dh = it.h
  const dw = Math.round((img.width / img.height) * dh)

  blit(img, 0, 0, img.width, img.height, cx + 26, baseY - dh, dw, dh)
  blit(player, 0, 0, F, F, cx + CELL_W - PLAYER_H - 22, baseY - PLAYER_H, PLAYER_H, PLAYER_H)

  // Repère de sol : vérifie l'assise (un objet qui « flotte » se voit ici).
  for (let x = cx + 8; x < cx + CELL_W - 8; x++) {
    const d = (baseY * W + x) * 4
    out.data[d] = 20; out.data[d + 1] = 18; out.data[d + 2] = 14
  }
}

writeFileSync(spec.out, PNG.sync.write(out))
console.log(`planche ${W}x${H} → ${spec.out}`)
console.log(`  joueur ${PLAYER_H}px (échelle jeu) · sol ${groundFile}`)
for (const it of items) { console.log(`  ${it.label} → ${it.h}px`) }
