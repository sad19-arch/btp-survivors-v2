import Phaser from 'phaser'
import { App } from './app'
import { GameScene, type GameSceneData } from '@render/scenes/GameScene'
import { BootScene } from '@render/scenes/BootScene'
import { Overlay } from '@ui/overlay'
import { AudioDirector } from '@/audio/audioDirector'
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
  phaseId: phaseIdFromLevel(opts.level),
  // Intro cosmétique pour le vrai joueur ; jamais en test/e2e/capture (seam).
  intro: !opts.test
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

// BootScene précharge l'audio puis lance 'game' (GameScene n'auto-démarre plus).
game.scene.add('game', GameScene, false, data)
game.scene.add('boot', BootScene, true, data)

// AudioDirector : créé une fois, coupé en test/headless. Lit les niveaux via l'App.
const audio = opts.test ? null : new AudioDirector(game.sound, app.events, () => app.getAudioLevels())

// Overlay DOM des écrans (HUD, menus) — observe l'état de l'App à chaque frame.
const uiRoot = document.getElementById('ui-root')
if (uiRoot !== null) {
  // Clic souris sur un item de menu → sélection+validation via l'App.
  const overlay = new Overlay(uiRoot, (i) => app.clickItem(i))
  const tick = (): void => {
    const state = app.getStateForFrame(app.frameId)
    overlay.sync(state)
    audio?.observe(state) // musique par écran/phase/boss (crossfade)
    window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}
