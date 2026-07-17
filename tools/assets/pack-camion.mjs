import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Assemble la feuille du camion benne au format du jeu : 4 colonnes × 4 LIGNES de
// cellules FRAME×FRAME, lignes south/east/north/west (= down/right/up/left, comme
// `player_j1`). `walkFrame(row, t) = row*4 + col` (src/render/sprites.ts) IMPOSE ce
// gabarit : 4 colonnes, pas une de plus.
//
// Trois partis pris, tous mesurés (cf. rapport du lot) :
//
//  1. AUCUN redimensionnement. Les vues sortent sur un canvas 192 et la figure n'y
//     dépasse jamais la cellule : elle RENTRE nativement. Un resize rétrécirait le
//     camion et abîmerait la grille de pixels. On recadre sur la bbox OPAQUE puis
//     on blitte CENTRÉ — la bbox, jamais le canvas : une figure décentrée dans son
//     canvas ferait SAUTER le camion à chaque changement de direction, l'origine du
//     sprite étant au centre (0.5, 0.5).
//
//  2. `west` est le MIROIR de `east`. Un camion est latéralement symétrique et le
//     rendu est en `flat shading` (pas de lumière directionnelle à retourner) : le
//     miroir met la cabine du bon côté et garantit une identité STRICTEMENT
//     identique entre les deux profils. Générer `west` à part ferait dériver la
//     teinte et les proportions → clignotement au demi-tour. Attention : c'est un
//     miroir CUIT dans la feuille, pas un `flipX` au runtime (que le lot RETIRE :
//     un camion vu de dessus n'est pas son propre miroir entre sud et nord).
//
//  3. Les 4 colonnes d'une ligne sont IDENTIQUES : les vues sont statiques, la
//     feuille n'anime pas les roues. Le gabarit 4×4 est une contrainte du moteur,
//     pas une promesse d'animation ; le mouvement vient du `bob` de `siteWorkers`.
//     Le remplissage garde `setFrame` valide quelle que soit la colonne.
//
// Usage: node pack-camion.mjs <srcDir> <out.png> [frame=192]
//   srcDir/{south,east,north}.png  (west = miroir de east)
const [, , srcDir, outPath, frameArg] = process.argv
if (srcDir === undefined || outPath === undefined) {
  console.error('usage: node pack-camion.mjs <srcDir> <out.png> [frame=192]')
  process.exit(2)
}
const FRAME = Number(frameArg ?? 192)
const COLS = 4
const ROWS = ['south', 'east', 'north', 'west']

/** bbox des pixels opaques (alpha > 8). */
function bbox(png) {
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1
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
  if (maxX < 0) throw new Error('image entièrement transparente')
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Recadre sur la bbox, en miroir horizontal si demandé. */
function crop(png, mirror) {
  const b = bbox(png)
  const out = new PNG({ width: b.w, height: b.h })
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const sx = b.minX + (mirror ? b.w - 1 - x : x)
      const si = ((b.minY + y) * png.width + sx) * 4
      const di = (y * b.w + x) * 4
      out.data[di] = png.data[si]
      out.data[di + 1] = png.data[si + 1]
      out.data[di + 2] = png.data[si + 2]
      out.data[di + 3] = png.data[si + 3]
    }
  }
  return out
}

/** Blit centré de `src` dans la cellule (cellX, cellY). */
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

const sheet = new PNG({ width: FRAME * COLS, height: FRAME * ROWS.length }) // 0 = transparent
for (let r = 0; r < ROWS.length; r++) {
  const dir = ROWS[r]
  const mirror = dir === 'west'
  const file = `${srcDir}/${mirror ? 'east' : dir}.png`
  const fig = crop(PNG.sync.read(readFileSync(file)), mirror)
  if (fig.width > FRAME || fig.height > FRAME) {
    // Garde-fou : on ne redimensionne PAS — on refuse plutôt que de rétrécir.
    console.error(`ERREUR ${dir}: figure ${fig.width}x${fig.height} > cellule ${FRAME}`)
    process.exit(1)
  }
  for (let c = 0; c < COLS; c++) blitCentered(sheet, fig, c * FRAME, r * FRAME)
  console.log(`${dir.padEnd(6)} figure ${String(fig.width).padStart(3)}x${String(fig.height).padStart(3)}${mirror ? '  (miroir de east)' : ''}`)
}
writeFileSync(outPath, PNG.sync.write(sheet))
console.log(`wrote ${outPath} ${FRAME * COLS}x${FRAME * ROWS.length} (cellule=${FRAME}, ${COLS} colonnes identiques par ligne)`)
