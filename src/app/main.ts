import Phaser from 'phaser'
import { Simulation } from '@core/simulation'
import { GameScene, type GameSceneData } from '@render/scenes/GameScene'
import { parseBootOptions } from './bootOptions'
import { createSeam, installSeam } from './seam'

/**
 * Point d'entrée (couche rendu). Lit les options de boot, instancie la
 * simulation (le cœur), publie le seam en dev/test, puis démarre la scène.
 *
 * Le cœur (`src/core`) ignore tout de ce fichier : Phaser n'observe que l'état.
 */
const opts = parseBootOptions(window.location.search)
const mode = opts.autostart ?? 'solo'
const sim = new Simulation({ seed: opts.seed, mode })
const seam = createSeam(sim)

// Gating: jamais en prod (sauf ?test=1). Pas de process.env (undefined sous Vite).
if (import.meta.env.DEV || opts.test) {
  installSeam(seam)
}

const data: GameSceneData = { sim, testMode: opts.test, seam }

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#1a1a1a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%'
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: []
})

game.scene.add('game', GameScene, true, data)
