import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Enrichit les tuiles de sol PLATES d'un stage en y ajoutant du détail matière
// TUILABLE (bruit multi-octave sans couture + grain + pépites/graviers/joints selon
// le preset), tout en préservant la teinte moyenne de la phase. Sort en 64×64 (upscale
// nearest si la source est 32). Chaque variante a sa seed → les 6 tuiles diffèrent.
// Déterministe, zéro quota, réversible via git.
//
// Usage: node enrich-ground.mjs <stageDir> <preset> [nTiles=6]
//   preset ∈ dirt | concrete | tile | sand
const [, , dir, preset, nArg] = process.argv
if (dir === undefined || preset === undefined) {
  console.error('usage: node enrich-ground.mjs <stageDir> <preset:dirt|concrete|tile|sand> [nTiles=6]')
  process.exit(2)
}
const N = Number(nArg ?? 6)
const SIZE = 64

function rng(seed) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) >>> 0
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// Bruit de valeur TUILABLE : lattice de période `period` (divise SIZE), interp. bilinéaire lissée, wrap.
function makeNoise(period, seed) {
  const g = rng(seed)
  const lat = []
  for (let j = 0; j < period; j++) {
    lat[j] = []
    for (let i = 0; i < period; i++) lat[j][i] = g()
  }
  return (x, y) => {
    const fx = (x / SIZE) * period
    const fy = (y / SIZE) * period
    const x0 = Math.floor(fx) % period
    const y0 = Math.floor(fy) % period
    const x1 = (x0 + 1) % period
    const y1 = (y0 + 1) % period
    const tx = fx - Math.floor(fx)
    const ty = fy - Math.floor(fy)
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const top = lat[y0][x0] + (lat[y0][x1] - lat[y0][x0]) * sx
    const bot = lat[y1][x0] + (lat[y1][x1] - lat[y1][x0]) * sx
    return top + (bot - top) * sy
  }
}

function wrapDelta(a, b) {
  const d = Math.abs(a - b)
  return Math.min(d, SIZE - d)
}

// Paramètres matière : amplitude du mottling, grain fin, et features.
const PRESETS = {
  dirt: { mottle: 0.16, grain: 0.10, grainAmp: 26, pebbles: 7, pebbleR: [2, 4.5], grit: 34 },
  sand: { mottle: 0.10, grain: 0.07, grainAmp: 16, pebbles: 3, pebbleR: [2, 3.5], grit: 20 },
  concrete: { mottle: 0.07, grain: 0.09, grainAmp: 18, pebbles: 0, pebbleR: [0, 0], grit: 40, aggregate: true },
  tile: { mottle: 0.05, grain: 0.04, grainAmp: 10, pebbles: 0, pebbleR: [0, 0], grit: 10, grout: 32 }
}
const P = PRESETS[preset]
if (P === undefined) {
  console.error(`preset inconnu: ${preset}`)
  process.exit(2)
}

function upscaleTo64(src) {
  if (src.width === SIZE && src.height === SIZE) return src
  const out = new PNG({ width: SIZE, height: SIZE })
  const s = src.width / SIZE
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x * s))
      const sy = Math.min(src.height - 1, Math.floor(y * s))
      const si = (sy * src.width + sx) * 4
      const di = (y * SIZE + x) * 4
      out.data[di] = src.data[si]
      out.data[di + 1] = src.data[si + 1]
      out.data[di + 2] = src.data[si + 2]
      out.data[di + 3] = 255
    }
  }
  return out
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v }

for (let v = 0; v < N; v++) {
  const seed = 0x51ce + v * 0x9e37 + preset.length * 131
  const base = upscaleTo64(PNG.sync.read(readFileSync(`${dir}/ground/tile_${v}.png`)))
  const nA = makeNoise(8, seed)
  const nB = makeNoise(16, seed ^ 0x1234)
  const nC = makeNoise(4, seed ^ 0x7abc)
  const grainR = rng(seed ^ 0xbeef)
  // Graviers (dirt/sand) : centres + rayons + ton, tirés une fois.
  const peb = []
  const pg = rng(seed ^ 0x2f2f)
  for (let i = 0; i < P.pebbles; i++) {
    peb.push({ x: pg() * SIZE, y: pg() * SIZE, r: P.pebbleR[0] + pg() * (P.pebbleR[1] - P.pebbleR[0]), dark: 0.68 + pg() * 0.15 })
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const di = (y * SIZE + x) * 4
      let r = base.data[di]
      let g = base.data[di + 1]
      let b = base.data[di + 2]
      // 1) Mottling multi-octave (facteur multiplicatif centré sur 1).
      const n = 0.55 * nA(x, y) + 0.3 * nB(x, y) + 0.15 * nC(x, y)
      let f = 1 + P.mottle * (n - 0.5) * 2
      // 2) Grain fin (poivre & sel matière).
      const gr = grainR()
      let add = 0
      if (gr < P.grain) add += (gr < P.grain / 2 ? -1 : 1) * P.grainAmp * (0.5 + grainR() * 0.5)
      // 3) Grit sombre épars (petits cailloux/points).
      if (grainR() < P.grit / 1000) add -= 18 + grainR() * 22
      // 4) Agrégat clair (béton).
      if (P.aggregate === true && grainR() < 0.03) add += 22 + grainR() * 20
      r = clamp(r * f + add)
      g = clamp(g * f + add)
      b = clamp(b * f + add)
      // 5) Graviers (dirt/sand) : corps assombri + liseré clair en haut.
      for (const p of peb) {
        const dx = wrapDelta(x, p.x)
        const dy = wrapDelta(y, p.y)
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= p.r) {
          const rim = dist > p.r - 1.4 && y < p.y ? 1.22 : p.dark
          r = clamp(r * rim); g = clamp(g * rim); b = clamp(b * rim)
          break
        }
      }
      // 6) Joints de carrelage (tile) : lignes sombres tous les `grout` px.
      if (P.grout !== undefined) {
        const onGrout = x % P.grout === 0 || y % P.grout === 0 || x % P.grout === P.grout - 1 || y % P.grout === P.grout - 1
        if (onGrout) { r = clamp(r * 0.9); g = clamp(g * 0.9); b = clamp(b * 0.9) }
      }
      base.data[di] = r; base.data[di + 1] = g; base.data[di + 2] = b; base.data[di + 3] = 255
    }
  }
  writeFileSync(`${dir}/ground/tile_${v}.png`, PNG.sync.write(base))
}
console.log(`enrichi ${dir}/ground (×${N}) preset=${preset} → 64×64 détaillé tuilable`)
