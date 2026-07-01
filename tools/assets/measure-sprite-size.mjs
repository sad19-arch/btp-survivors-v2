import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'

// Mesure la taille AFFICHÉE de chaque perso : bbox non-transparente de la frame
// (0,0) × l'échelle de rendu. Sert à vérifier que les ennemis sont du même ordre
// de grandeur que le joueur, et que le boss est plus gros.
// Échelles = CHAR_SCALE de GameScene (garder synchronisé).
const sheets = [
  ['player', 'public/player_j1.png', 192, 0.516],
  ['brute (huissier/tank)', 'public/stage01/enemies/brute_walk.png', 192, 1.0],
  ['imp (inspecteur/rapide)', 'public/stage01/enemies/imp_walk.png', 192, 0.9],
  ['mudling (paperasse/base)', 'public/stage01/enemies/mudling_walk.png', 192, 1.25],
  ['boss (ground_keeper)', 'public/stage01/boss/ground_keeper_walk.png', 256, 1.35],
  ['s2 boueux (base)', 'public/stage02/enemies/boueux_walk.png', 256, 0.74],
  ['s2 foreur (fast)', 'public/stage02/enemies/foreur_walk.png', 256, 0.64],
  ['s2 rocheux (tank)', 'public/stage02/enemies/rocheux_walk.png', 256, 0.8]
]

for (const [name, path, cell, scale] of sheets) {
  const png = PNG.sync.read(readFileSync(path))
  let minX = cell,
    minY = cell,
    maxX = -1,
    maxY = -1
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  console.log(
    `${name.padEnd(26)} art natif ${String(w).padStart(3)}×${String(h).padStart(3)} → affiché ~${Math.round(w * scale)}×${Math.round(h * scale)}px`
  )
}
