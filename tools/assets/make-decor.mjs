import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'node:fs'

// Décor/UI authorés en pixel pur (palette limitée, contour sombre) — zéro quota :
//   - cage.png          : barreaux métalliques (devant l'ouvrier prisonnier)
//   - dig_tunnels.png    : réseau de galeries faible contraste (décalque stage 04, clin Dig Dug)
//   - bubble_merci.png   : bulle « MERCI ! » (police pixel maison)
//
// Usage: node make-decor.mjs
mkdirSync('public/stage01/props', { recursive: true })
mkdirSync('public/stage01/ui', { recursive: true })
mkdirSync('public/stage04/decals', { recursive: true })

function png(w, h) {
  return new PNG({ width: w, height: h })
}
function set(p, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return
  const i = (y * p.width + x) * 4
  p.data[i] = r
  p.data[i + 1] = g
  p.data[i + 2] = b
  p.data[i + 3] = a
}
function rect(p, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(p, x, y, r, g, b, a)
}

// --- Cage : rails haut/bas + barreaux verticaux, métal sombre + reflet. ---
{
  const w = 100
  const h = 100
  const p = png(w, h)
  const DARK = [58, 60, 70]
  const LITE = [126, 130, 142]
  rect(p, 8, 8, w - 9, 16, ...DARK) // rail haut
  rect(p, 8, 8, w - 9, 9, ...LITE)
  rect(p, 8, h - 17, w - 9, h - 9, ...DARK) // rail bas
  rect(p, 8, h - 17, w - 9, h - 16, ...LITE)
  for (const bx of [12, 32, 52, 72, 88]) {
    rect(p, bx, 8, bx + 4, h - 9, ...DARK)
    rect(p, bx, 8, bx, h - 9, ...LITE) // reflet gauche
  }
  // montants latéraux
  rect(p, 8, 8, 11, h - 9, ...DARK)
  rect(p, w - 12, 8, w - 9, h - 9, ...DARK)
  writeFileSync('public/stage01/props/cage.png', PNG.sync.write(p))
  console.log('wrote public/stage01/props/cage.png 100x100')
}

// --- Réseau de galeries (décalque discret, faible alpha). ---
{
  const w = 256
  const h = 256
  const p = png(w, h)
  const A = 60
  const EARTH = [42, 30, 18]
  const CORE = [70, 52, 32]
  function tunnelH(y, x0, x1, thick) {
    for (let x = x0; x <= x1; x++) {
      for (let d = -thick; d <= thick; d++) {
        const edge = Math.abs(d) >= thick - 1
        const c = edge ? EARTH : CORE
        set(p, x, y + d, c[0], c[1], c[2], A)
      }
    }
  }
  function tunnelV(x, y0, y1, thick) {
    for (let y = y0; y <= y1; y++) {
      for (let d = -thick; d <= thick; d++) {
        const edge = Math.abs(d) >= thick - 1
        const c = edge ? EARTH : CORE
        set(p, x + d, y, c[0], c[1], c[2], A)
      }
    }
  }
  tunnelH(60, 20, 210, 6)
  tunnelH(150, 40, 236, 7)
  tunnelH(205, 30, 170, 5)
  tunnelV(70, 60, 205, 6)
  tunnelV(180, 30, 150, 6)
  tunnelV(130, 90, 230, 5)
  writeFileSync('public/stage04/decals/dig_tunnels.png', PNG.sync.write(p))
  console.log('wrote public/stage04/decals/dig_tunnels.png 256x256')
}

// --- Bulle « MERCI ! » (police pixel 5×7 maison). ---
{
  const GLYPHS = {
    M: ['#   #', '## ##', '# # #', '#   #', '#   #', '#   #', '#   #'],
    E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
    R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
    C: [' ####', '#    ', '#    ', '#    ', '#    ', '#    ', ' ####'],
    I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
    '!': ['  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '     ', '  #  '],
    ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     ']
  }
  const text = 'MERCI !'
  const S = 2 // échelle du pixel
  const GW = 5
  const GH = 7
  const GAP = 1
  const padX = 12
  const padY = 12
  const textW = text.length * GW * S + (text.length - 1) * GAP * S
  const w = textW + padX * 2
  const bodyH = GH * S + padY * 2
  const tailH = 8
  const h = bodyH + tailH
  const p = png(w, h)
  const BORDER = [24, 20, 24]
  const FILL = [244, 232, 206]
  const INK = [40, 32, 26]
  // corps + bordure
  rect(p, 0, 0, w - 1, bodyH - 1, ...FILL)
  rect(p, 0, 0, w - 1, 2, ...BORDER)
  rect(p, 0, bodyH - 3, w - 1, bodyH - 1, ...BORDER)
  rect(p, 0, 0, 2, bodyH - 1, ...BORDER)
  rect(p, w - 3, 0, w - 1, bodyH - 1, ...BORDER)
  // petite queue de bulle (vers le bas-gauche)
  for (let k = 0; k < tailH; k++) {
    rect(p, 14 + k, bodyH + k, 14 + k + Math.max(1, tailH - k), bodyH + k, ...FILL)
    set(p, 14 + k, bodyH + k, ...BORDER)
  }
  // texte
  let gx = padX
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']
    for (let ry = 0; ry < GH; ry++) {
      for (let rx = 0; rx < GW; rx++) {
        if (g[ry][rx] !== '#') continue
        rect(p, gx + rx * S, padY + ry * S, gx + rx * S + S - 1, padY + ry * S + S - 1, ...INK)
      }
    }
    gx += (GW + GAP) * S
  }
  writeFileSync('public/stage01/ui/bubble_merci.png', PNG.sync.write(p))
  console.log(`wrote public/stage01/ui/bubble_merci.png ${w}x${h}`)
}
