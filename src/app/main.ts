import Phaser from 'phaser'
import { App } from './app'
import { GameScene, type GameSceneData } from '@render/scenes/GameScene'
import { Overlay } from '@ui/overlay'
import { parseBootOptions } from './bootOptions'
import { phaseIdFromLevel } from '@content/phases'
import { createSeam, installSeam } from './seam'

/**
 * Point d'entrée (couche rendu). Lit les options de boot, instancie l'App (qui
 * orchestre la simulation et les écrans), publie le seam en dev/test, puis
 * démarre la scène. Le cœur (`src/core`) ignore tout de ce fichier.
 */
const opts = parseBootOptions(window.location.search)
const mode = opts.autostart ?? 'solo'
const app = new App({
  seed: opts.seed,
  mode,
  autostart: opts.autostart !== null,
  phaseId: phaseIdFromLevel(opts.level)
})
const seam = createSeam(app)

// Gating: jamais en prod (sauf ?test=1). Pas de process.env (undefined sous Vite).
if (import.meta.env.DEV || opts.test) {
  installSeam(seam)
}

const data: GameSceneData = { app, testMode: opts.test, seam, lite: opts.lite }

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
  input: {
    gamepad: true // manette Xbox (PRD : 100 % jouable manette)
  },
  scene: []
})

game.scene.add('game', GameScene, true, data)

// Overlay DOM des écrans (HUD, menus) — observe l'état de l'App à chaque frame.
const uiRoot = document.getElementById('ui-root')
if (uiRoot !== null) {
  const overlay = new Overlay(uiRoot)
  const tick = (): void => {
    overlay.sync(app.getState())
    window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}
