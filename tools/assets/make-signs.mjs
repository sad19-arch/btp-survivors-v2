import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { glyph, GW, GH, textWidth } from './signFont.mjs'

// Signalétique stage 01 AVEC TEXTE + ligne de marquage topo, authorées en pixel
// pur (police 5×7 maison) — PixelLab ne rend pas de texte lisible (prompt global
// « no text »). DA 16-bit : contour sombre, palette limitée, panneaux carrés.
//
// Produit :
//   - stage01/landmarks/permit.png        « PERMIS DE CONSTRUIRE » (landmark_stage01)
//   - stage01/props/site_sign.png         « ATTENTION TRAVAUX »    (struct_stage01_sign)
//   - stage01/props/sign_speed.png        panneau rond rouge « 30 » (prop_stage01_sign_speed)
//   - stage01/decals/layout_line.png      ligne de marquage plate  (decal_stage01_layout_line)
//
// Usage: node tools/assets/make-signs.mjs
mkdirSync('public/stage01/landmarks', { recursive: true })
mkdirSync('public/stage01/props', { recursive: true })
mkdirSync('public/stage01/decals', { recursive: true })

function png(w, h) {
  return new PNG({ width: w, height: h })
}
function set(p, x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return
  const i = (y * p.width + x) * 4
  p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = a
}
function rect(p, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(p, x, y, r, g, b, a)
}
function frame(p, x0, y0, x1, y1, r, g, b, t = 2) {
  rect(p, x0, y0, x1, y0 + t - 1, r, g, b)
  rect(p, x0, y1 - t + 1, x1, y1, r, g, b)
  rect(p, x0, y0, x0 + t - 1, y1, r, g, b)
  rect(p, x1 - t + 1, y0, x1, y1, r, g, b)
}
function disc(p, cx, cy, rad, r, g, b, a = 255) {
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
    if (x * x + y * y <= rad * rad) set(p, cx + x, cy + y, r, g, b, a)
  }
}
function ring(p, cx, cy, rOut, rIn, r, g, b) {
  for (let y = -rOut; y <= rOut; y++) for (let x = -rOut; x <= rOut; x++) {
    const d = x * x + y * y
    if (d <= rOut * rOut && d >= rIn * rIn) set(p, cx + x, cy + y, r, g, b)
  }
}

function drawText(p, text, x, y, S, ink, gap = 1) {
  let gx = x
  for (const ch of text) {
    const g = glyph(ch)
    for (let ry = 0; ry < GH; ry++) for (let rx = 0; rx < GW; rx++) {
      if (g[ry][rx] === '#') rect(p, gx + rx * S, y + ry * S, gx + rx * S + S - 1, y + ry * S + S - 1, ...ink)
    }
    gx += (GW + gap) * S
  }
}
function drawTextCentered(p, text, cx, y, S, ink) {
  drawText(p, text, Math.round(cx - textWidth(text, S) / 2), y, S, ink)
}

const DARK = [26, 22, 18]
const WOOD = [120, 84, 48]
const WOOD_D = [78, 54, 30]

// ── Panneau générique à texte (planche + poteaux). ──
function board(file, lines, opts) {
  const { fill, ink, header, headerText, S = 2 } = opts
  const maxTextW = Math.max(...lines.map((t) => textWidth(t, S)), header ? textWidth(headerText, S) : 0)
  const padX = 14
  const bw = maxTextW + padX * 2
  const lineH = GH * S + 6
  const headH = header ? GH * S + 10 : 0
  const bodyTop = headH
  const bh = headH + 8 + lines.length * lineH + 4
  const postH = 34
  const w = bw + 8
  const h = bh + postH + 4
  const p = png(w, h)
  const bx0 = 4, by0 = 2, bx1 = 4 + bw - 1, by1 = 2 + bh - 1
  // Poteaux bois.
  rect(p, Math.round(w * 0.28), by1 - 4, Math.round(w * 0.28) + 7, h - 3, ...WOOD)
  rect(p, Math.round(w * 0.28), by1 - 4, Math.round(w * 0.28) + 1, h - 3, ...WOOD_D)
  rect(p, Math.round(w * 0.68), by1 - 4, Math.round(w * 0.68) + 7, h - 3, ...WOOD)
  rect(p, Math.round(w * 0.68), by1 - 4, Math.round(w * 0.68) + 1, h - 3, ...WOOD_D)
  // Planche.
  rect(p, bx0, by0, bx1, by1, ...fill)
  if (header) {
    rect(p, bx0, by0, bx1, by0 + headH - 1, ...header)
    drawTextCentered(p, headerText, (bx0 + bx1) / 2, by0 + 5, S, [244, 240, 230])
  }
  frame(p, bx0, by0, bx1, by1, ...DARK, 3)
  // Lignes de texte.
  let ty = by0 + bodyTop + 8
  for (const t of lines) {
    drawTextCentered(p, t, (bx0 + bx1) / 2, ty, S, ink)
    ty += lineH
  }
  writeFileSync(file, PNG.sync.write(p))
  console.log(`wrote ${file} ${w}x${h}`)
}

// « PERMIS DE CONSTRUIRE » : planche crème, bandeau bleu officiel, texte foncé.
board('public/stage01/landmarks/permit.png', ['PERMIS DE', 'CONSTRUIRE'], {
  fill: [238, 232, 214], ink: DARK, header: [40, 78, 150], headerText: 'MAIRIE', S: 3
})

// « ATTENTION TRAVAUX » : panneau jaune sécurité, texte noir.
board('public/stage01/props/site_sign.png', ['ATTENTION', 'TRAVAUX'], {
  fill: [240, 196, 40], ink: DARK, header: null, headerText: '', S: 2
})

// Panneau rond « 30 » (interdiction de rouler à plus de 30 km/h).
{
  const w = 88, h = 128
  const p = png(w, h)
  const cx = w / 2, cy = 40, rOut = 36
  // Poteau gris.
  rect(p, cx - 4, cy, cx + 3, h - 3, 150, 150, 158)
  rect(p, cx - 4, cy, cx - 3, h - 3, 96, 96, 104)
  // Disque : contour noir, anneau rouge, centre blanc.
  disc(p, cx, cy, rOut + 2, ...DARK)
  disc(p, cx, cy, rOut, 214, 48, 48)
  disc(p, cx, cy, rOut - 9, 244, 244, 244)
  // « 30 » centré.
  const S = 3
  drawTextCentered(p, '30', cx, cy - (GH * S) / 2, S, DARK)
  writeFileSync('public/stage01/props/sign_speed.png', PNG.sync.write(p))
  console.log(`wrote public/stage01/props/sign_speed.png ${w}x${h}`)
}

// Parcelle piquetée : cordeau jaune tendu entre 4 piquets de coin, INTÉRIEUR
// TRANSPARENT (le sol se voit ; c'est une DÉLIMITATION, pas un patch plein → se
// détache du sol jaune sans « boîte »).
{
  const w = 240, h = 200
  const p = png(w, h)
  const ROPE = [236, 200, 40]
  const inset = 22
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset
  // Cordeau (liseré sombre + jaune) sur les 4 côtés.
  for (const [ax, ay, bx, by] of [[x0, y0, x1, y0], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]]) {
    if (ay === by) {
      rect(p, ax, ay - 3, bx, ay + 3, ...DARK)
      rect(p, ax, ay - 2, bx, ay + 1, ...ROPE)
    } else {
      rect(p, ax - 3, ay, ax + 3, by, ...DARK)
      rect(p, ax - 2, ay, ax + 1, by, ...ROPE)
    }
  }
  // Piquets de coin (poteau bois + tête sombre).
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    disc(p, cx, cy, 8, ...DARK)
    disc(p, cx, cy, 6, ...WOOD)
    rect(p, cx - 1, cy - 6, cx, cy + 6, ...WOOD_D)
  }
  writeFileSync('public/stage01/structures/plot.png', PNG.sync.write(p))
  console.log(`wrote public/stage01/structures/plot.png ${w}x${h}`)
}

// Ligne de marquage topo PLATE : tirets blancs nets + fin liseré sombre (visible
// sur le sol jaune, sans effet « tonneau »).
{
  const w = 112, h = 18
  const p = png(w, h)
  const y = h / 2
  const WHITE = [242, 240, 232]
  const EDGE = [70, 66, 58]
  for (let x = 4; x < w - 4; x += 16) {
    rect(p, x, y - 4, x + 9, y - 4, ...EDGE)
    rect(p, x, y + 3, x + 9, y + 3, ...EDGE)
    rect(p, x, y - 3, x + 9, y + 2, ...WHITE)
  }
  writeFileSync('public/stage01/decals/layout_line.png', PNG.sync.write(p))
  console.log(`wrote public/stage01/decals/layout_line.png ${w}x${h}`)
}
