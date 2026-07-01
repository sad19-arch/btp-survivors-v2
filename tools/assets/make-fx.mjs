import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'

// Génère les petits VFX abstraits des clins d'œil rétro (poussière de béton, colonne
// de téléportation boss, segment de colonne). Ce sont des effets abstraits (pas des
// personnages) : on les AUTHORE en pixel pur (palette limitée, alpha) plutôt que via
// PixelLab — zéro quota, contrôle DA total, reproductible. Reprend le langage visuel
// des VFX existants (impact/sparkle/levelup ~26-60px).
//
// Usage: node make-fx.mjs

function png(w, h) {
  return new PNG({ width: w, height: h }) // data à zéro = transparent
}
function put(p, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height || a <= 0) return
  const i = (y * p.width + x) * 4
  const na = a / 255
  const oa = p.data[i + 3] / 255
  const out = na + oa * (1 - na)
  if (out <= 0) return
  p.data[i] = Math.round((r * na + p.data[i] * oa * (1 - na)) / out)
  p.data[i + 1] = Math.round((g * na + p.data[i + 1] * oa * (1 - na)) / out)
  p.data[i + 2] = Math.round((b * na + p.data[i + 2] * oa * (1 - na)) / out)
  p.data[i + 3] = Math.round(out * 255)
}
function disc(p, cx, cy, rad, col, aMax) {
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const d = Math.hypot(x - cx, y - cy) / rad
      if (d > 1) continue
      const a = Math.round(aMax * (1 - d) * (1 - d))
      put(p, x, y, col[0], col[1], col[2], a)
    }
  }
}

// --- Poussière de béton : amas de bouffées grises/beiges. ---
{
  const w = 52
  const h = 44
  const p = png(w, h)
  const cx = w / 2
  const cy = h / 2 + 3
  const blobs = [
    [cx, cy, 15, [176, 168, 152], 210],
    [cx - 12, cy + 2, 10, [150, 142, 128], 190],
    [cx + 13, cy - 1, 11, [198, 190, 176], 200],
    [cx - 4, cy - 9, 9, [210, 202, 188], 180],
    [cx + 6, cy + 8, 8, [138, 130, 118], 170]
  ]
  for (const [x, y, r, c, a] of blobs) disc(p, x, y, r, c, a)
  // quelques éclats plus clairs
  disc(p, cx + 2, cy - 3, 4, [230, 224, 210], 200)
  writeFileSync('public/stage01/vfx/dust.png', PNG.sync.write(p))
  console.log('wrote public/stage01/vfx/dust.png 52x44')
}

// --- Colonne de téléportation : bande verticale claire (cyan → blanc). ---
{
  const w = 40
  const h = 168
  const p = png(w, h)
  const cx = (w - 1) / 2
  for (let y = 0; y < h; y++) {
    // léger fuseau : plus large au milieu
    const vy = y / (h - 1)
    const widen = 1 - Math.abs(vy - 0.5) * 0.5
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - cx) / (cx * widen)
      if (dx > 1) continue
      const core = 1 - dx
      // centre quasi-blanc, bords cyan
      const r = Math.round(40 + (255 - 40) * core * core)
      const g = Math.round(185 + (255 - 185) * core)
      const b = Math.round(214 + (255 - 214) * core)
      const a = Math.round(235 * core)
      put(p, x, y, r, g, b, a)
    }
  }
  writeFileSync('public/stage01/vfx/beam.png', PNG.sync.write(p))
  console.log('wrote public/stage01/vfx/beam.png 40x168')
}

// --- Segment de colonne : petite barre brillante horizontale. ---
{
  const w = 44
  const h = 16
  const p = png(w, h)
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - cx) / cx
      const dy = Math.abs(y - cy) / cy
      const d = Math.max(dx, dy * 0.9)
      if (d > 1) continue
      const core = 1 - d
      const r = Math.round(70 + (255 - 70) * core * core)
      const g = Math.round(200 + (255 - 200) * core)
      const b = Math.round(220 + (255 - 220) * core)
      const a = Math.round(240 * core)
      put(p, x, y, r, g, b, a)
    }
  }
  writeFileSync('public/stage01/vfx/beam_segment.png', PNG.sync.write(p))
  console.log('wrote public/stage01/vfx/beam_segment.png 44x16')
}
