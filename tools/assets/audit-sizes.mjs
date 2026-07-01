import { PNG } from 'pngjs'
import { readFileSync, existsSync } from 'node:fs'

// Audit de cohérence d'échelle : taille AFFICHÉE (bbox non-transparente × échelle
// de rendu) de chaque élément, comparée au joueur (référence). Sert à vérifier
// que l'univers est cohérent : ennemis < joueur, boss > joueur, engins gros, etc.

function bbox(path, region) {
  const png = PNG.sync.read(readFileSync(path))
  const W = png.width
  const x0 = region ? 0 : 0
  const y0 = region ? 0 : 0
  const x1 = region ? region.cell : W
  const y1 = region ? region.cell : png.height
  let minX = x1,
    minY = y1,
    maxX = -1,
    maxY = -1
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (png.data[(y * W + x) * 4 + 3] > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 }
}
const disp = (path, scale, cell) => {
  if (!existsSync(path)) return null
  const b = bbox(path, cell ? { cell } : null)
  return { w: Math.round(b.w * scale), h: Math.round(b.h * scale) }
}

// Joueur : référence (cell 192, scale 0.516).
const player = disp('public/player_j1.png', 0.516, 192)
console.log(`JOUEUR (référence) : ${player.w}×${player.h}px\n`)

// Ennemis (cell 256) + boss (cell 256) par stage, avec les échelles de stages.ts.
const STAGES = {
  stage03: { e: [1.18, 0.62, 0.94], b: 1.33, props: { mixer_truck: 0.85, concrete_pump: 0.8, concrete_mixer: 0.6, rebar: 0.7, formwork: 0.8 } },
  stage04: { e: [0.75, 0.65, 0.77], b: 1.22, props: { mini_excavator: 0.78, trencher: 0.8, pipes: 0.8, cable_reel: 0.7 } },
  stage05: { e: [0.71, 0.63, 0.8], b: 1.3, props: { tower_crane: 0.8, mobile_crane: 0.9, block_pallet: 0.8, telehandler: 0.8 } },
  stage06: { e: [0.71, 0.65, 0.77], b: 1.41, props: { scaffold: 1.0, boom_lift: 0.85, tubes: 0.7 } },
  stage07: { e: [0.5, 0.66, 0.78], b: 1.23, props: { crane_truck: 0.9, trusses: 0.85, tiles: 0.7 } },
  stage08: { e: [0.72, 0.63, 0.8], b: 1.37, props: { forklift: 0.8, drywall: 0.8, insulation: 0.7 } },
  stage09: { e: [0.68, 0.63, 0.8], b: 1.09, props: { van: 0.8, paint: 0.7, tile_pallet: 0.75 } },
  stage10: { e: [0.65, 0.65, 0.88], b: 1.25, props: { inspection_van: 0.8, sign_ok: 0.9, cones: 0.6 } }
}
const ROLES = ['base', 'fast', 'tank']
const flags = []
for (const [st, cfg] of Object.entries(STAGES)) {
  console.log(`=== ${st} ===`)
  ROLES.forEach((role, i) => {
    const d = disp(`public/${st}/enemies/${role}_walk.png`, cfg.e[i], 256)
    if (d) {
      const rel = (d.h / player.h).toFixed(2)
      console.log(`  ${role.padEnd(5)} ${d.w}×${d.h}px  (${rel}× joueur)`)
      if (d.h > player.h) flags.push(`${st}/${role} plus GRAND que le joueur (${d.h}px)`)
    }
  })
  const bd = disp(`public/${st}/boss/boss_walk.png`, cfg.b, 256)
  if (bd) {
    const rel = (bd.h / player.h).toFixed(2)
    console.log(`  boss  ${bd.w}×${bd.h}px  (${rel}× joueur)`)
    if (bd.h < player.h * 1.2) flags.push(`${st}/boss pas assez grand (${bd.h}px, <1.2× joueur)`)
  }
  for (const [name, scale] of Object.entries(cfg.props)) {
    const d = disp(`public/${st}/props/${name}.png`, scale, null)
    if (d) console.log(`    prop ${name.padEnd(16)} ${d.w}×${d.h}px  (${(d.h / player.h).toFixed(2)}× joueur h)`)
  }
}
console.log('\n=== ALERTES ===')
console.log(flags.length ? flags.map((f) => '  ⚠ ' + f).join('\n') : '  aucune (ennemis < joueur, boss > joueur)')
