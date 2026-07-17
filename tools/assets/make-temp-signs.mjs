import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { glyph, GW, GH, textWidth } from './signFont.mjs'

/**
 * SIGNALISATION TEMPORAIRE DE CHANTIER — panneaux jaune fluo, partagés par les
 * 10 stages (`public/signs/`).
 *
 * Authorés en pixel pur : PixelLab ne rend pas de texte lisible (son prompt
 * global impose « no text »), et ces panneaux ne SONT que du texte. La police
 * 5×7 vient de `signFont.mjs`, qui JETTE sur un glyphe manquant — sans ça,
 * « DÉVIATION » sortirait muet, sans la moindre erreur.
 *
 * DA 16-bit : coins carrés, contour noir épais, palette limitée, aucun dégradé.
 * Jaune sécurité = `jauneSecurite` de `src/ui/palette.ts` (#FFD24A), la source
 * unique imposée par la DA.
 *
 * Usage : node tools/assets/make-temp-signs.mjs
 */

mkdirSync('public/signs', { recursive: true })

// ── Palette (miroir de src/ui/palette.ts — source unique) ──
const JAUNE = [0xff, 0xd2, 0x4a] // jauneSecurite
const DARK = [26, 22, 18]
const BLANC = [244, 240, 230]
const ROUGE = [190, 40, 34]
const GRIS = [128, 128, 132]
const GRIS_D = [88, 88, 92]
const ORANGE = [226, 122, 36]

function png(w, h) {
  const p = new PNG({ width: w, height: h })
  p.data.fill(0)
  return p
}
function set(p, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) { return }
  const i = (y * p.width + x) * 4
  p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = a
}
function rect(p, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++) { for (let x = x0; x <= x1; x++) { set(p, x, y, r, g, b, a) } }
}
function frame(p, x0, y0, x1, y1, r, g, b, t = 2) {
  for (let i = 0; i < t; i++) {
    for (let x = x0; x <= x1; x++) { set(p, x, y0 + i, r, g, b); set(p, x, y1 - i, r, g, b) }
    for (let y = y0; y <= y1; y++) { set(p, x0 + i, y, r, g, b); set(p, x1 - i, y, r, g, b) }
  }
}
function disc(p, cx, cy, rad, r, g, b) {
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= rad * rad) { set(p, cx + x, cy + y, r, g, b) }
    }
  }
}
function drawText(p, text, x, y, S, ink) {
  let gx = x
  for (const ch of text) {
    const g = glyph(ch)
    for (let ry = 0; ry < GH; ry++) {
      for (let rx = 0; rx < GW; rx++) {
        if (g[ry][rx] === '#') {
          rect(p, gx + rx * S, y + ry * S, gx + rx * S + S - 1, y + ry * S + S - 1, ...ink)
        }
      }
    }
    gx += (GW + 1) * S
  }
}
function drawTextCentered(p, text, cx, y, S, ink) {
  drawText(p, text, Math.round(cx - textWidth(text, S) / 2), y, S, ink)
}

/** Pieds : deux jambes de tréteau métallique gris sous la planche. */
function legs(p, w, top, bottom) {
  const lx = Math.round(w * 0.30)
  const rx = Math.round(w * 0.70)
  for (const x of [lx, rx]) {
    rect(p, x, top, x + 5, bottom, ...GRIS)
    rect(p, x, top, x + 1, bottom, ...GRIS_D)
  }
  // Traverse.
  const my = Math.round(top + (bottom - top) * 0.55)
  rect(p, lx, my, rx + 5, my + 3, ...GRIS_D)
}

/**
 * Panneau RECTANGULAIRE jaune fluo sur pieds. Auto-dimensionné au texte.
 * `stand:false` = panneau à plat / posé (pas de pieds).
 */
function panneau(name, lines, opts = {}) {
  const { S = 2, stand = true, fill = JAUNE, ink = DARK } = opts
  const maxW = Math.max(...lines.map((t) => textWidth(t, S)))
  const padX = 12
  const bw = maxW + padX * 2
  const lineH = GH * S + 5
  const bh = 10 + lines.length * lineH + 4
  const footH = stand ? 30 : 0
  const w = bw + 6
  const h = bh + footH + 3
  const p = png(w, h)
  const x0 = 3, y0 = 1, x1 = 3 + bw - 1, y1 = 1 + bh - 1
  if (stand) { legs(p, w, y1 - 3, h - 2) }
  rect(p, x0, y0, x1, y1, ...fill)
  frame(p, x0, y0, x1, y1, ...DARK, 3)
  let ty = y0 + 8
  for (const t of lines) {
    drawTextCentered(p, t, (x0 + x1) / 2, ty, S, ink)
    ty += lineH
  }
  writeFileSync(`public/signs/${name}.png`, PNG.sync.write(p))
  console.log(`  ${name}.png ${w}x${h}`)
}

/** Panneau ROND réglementaire (vitesse) : disque blanc, anneau rouge, chiffres. */
function panneauRond(name, texte, opts = {}) {
  const { stand = true } = opts
  const rad = 34
  const d = rad * 2 + 6
  const footH = stand ? 34 : 0
  const w = d
  const h = d + footH
  const p = png(w, h)
  const cx = Math.round(w / 2)
  const cy = rad + 3
  if (stand) {
    rect(p, cx - 3, cy + rad - 4, cx + 3, h - 4, ...GRIS)
    rect(p, cx - 3, cy + rad - 4, cx - 2, h - 4, ...GRIS_D)
    rect(p, cx - 12, h - 5, cx + 12, h - 2, ...GRIS_D)
  }
  disc(p, cx, cy, rad, ...DARK)
  disc(p, cx, cy, rad - 3, ...ROUGE)
  disc(p, cx, cy, rad - 11, ...BLANC)
  drawTextCentered(p, texte, cx, cy - Math.round((GH * 3) / 2), 3, DARK)
  writeFileSync(`public/signs/${name}.png`, PNG.sync.write(p))
  console.log(`  ${name}.png ${w}x${h}`)
}

/**
 * Panneau TRIANGLE de danger : triangle blanc bordé rouge + point d'exclamation.
 * Le triangle est tracé par balayage de lignes (pas d'anti-crénelage : pixel pur).
 */
function panneauTriangle(name, opts = {}) {
  const { stand = true } = opts
  const side = 74
  const th = Math.round(side * 0.88)
  const footH = stand ? 32 : 0
  const w = side + 6
  const h = th + 6 + footH
  const p = png(w, h)
  const cx = Math.round(w / 2)
  if (stand) {
    rect(p, cx - 3, th, cx + 3, h - 4, ...GRIS)
    rect(p, cx - 12, h - 5, cx + 12, h - 2, ...GRIS_D)
  }
  const apexY = 3
  const baseY = th
  const drawTri = (inset, col) => {
    for (let y = apexY + inset; y <= baseY - Math.round(inset * 0.6); y++) {
      const t = (y - apexY) / (baseY - apexY)
      const halfW = Math.round((side / 2) * t) - inset
      if (halfW < 0) { continue }
      rect(p, cx - halfW, y, cx + halfW, y, ...col)
    }
  }
  drawTri(0, DARK)
  drawTri(3, ROUGE)
  drawTri(9, JAUNE)
  // « ! » central.
  const bx = cx - 2
  rect(p, bx, apexY + 26, bx + 4, apexY + 46, ...DARK)
  rect(p, bx, apexY + 51, bx + 4, apexY + 55, ...DARK)
  writeFileSync(`public/signs/${name}.png`, PNG.sync.write(p))
  console.log(`  ${name}.png ${w}x${h}`)
}

/** Cône de chantier vu en 3/4 : décal orange à bandes blanches. */
function cone(name) {
  const w = 44, h = 52
  const p = png(w, h)
  const cx = Math.round(w / 2)
  // Embase.
  rect(p, 4, h - 10, w - 5, h - 3, ...ORANGE)
  frame(p, 4, h - 10, w - 5, h - 3, ...DARK, 2)
  // Corps conique (triangle plein).
  for (let y = 6; y < h - 9; y++) {
    const t = (y - 6) / (h - 15)
    const half = Math.round(2 + t * 12)
    rect(p, cx - half, y, cx + half, y, ...ORANGE)
    set(p, cx - half, y, ...DARK)
    set(p, cx + half, y, ...DARK)
  }
  // Bandes blanches réfléchissantes.
  for (const [a, b] of [[18, 24], [30, 36]]) {
    for (let y = a; y <= b; y++) {
      const t = (y - 6) / (h - 15)
      const half = Math.round(2 + t * 12) - 1
      rect(p, cx - half, y, cx + half, y, ...BLANC)
    }
  }
  rect(p, cx - 3, 4, cx + 3, 7, ...DARK)
  writeFileSync(`public/signs/${name}.png`, PNG.sync.write(p))
  console.log(`  ${name}.png ${w}x${h}`)
}

console.log('signalisation temporaire → public/signs/')

// ── Panneaux de chantier (jaune fluo, sur pieds) ──
panneau('sign_travaux', ['TRAVAUX'])
panneau('sign_deviation', ['DÉVIATION'])
panneau('sign_route_barree', ['ROUTE', 'BARRÉE'])
panneau('sign_chaussee_retrecie', ['CHAUSSÉE', 'RÉTRÉCIE'])
panneau('sign_hommes_au_travail', ['HOMMES AU', 'TRAVAIL'])
panneau('sign_sortie_camions', ['SORTIE DE', 'CAMIONS'])
panneau('sign_interdit_public', ['INTERDIT', 'AU PUBLIC'])
panneau('sign_port_du_casque', ['PORT DU', 'CASQUE'])
panneau('sign_fin_chantier', ['FIN DE', 'CHANTIER'])
panneau('sign_cedez_le_passage', ['CÉDEZ LE', 'PASSAGE'])
panneau('sign_passage_pieton', ['PASSAGE', 'PIÉTON'])
panneau('sign_acces_interdit', ['ACCÈS', 'INTERDIT'])
panneau('sign_chantier_interdit', ['CHANTIER', 'INTERDIT', 'AU PUBLIC'])

// ── Variantes à plat (posées au sol, sans pieds) ──
panneau('sign_travaux_plat', ['TRAVAUX'], { stand: false })
panneau('sign_deviation_plat', ['DÉVIATION'], { stand: false })

// ── Panneaux réglementaires ronds (vitesse) ──
panneauRond('sign_vitesse_30', '30')
panneauRond('sign_vitesse_50', '50')
panneauRond('sign_vitesse_10', '10')

// ── Triangle de danger ──
panneauTriangle('sign_danger')

// ── Cône de chantier ──
cone('cone_chantier')

console.log('signalisation temporaire : OK')
