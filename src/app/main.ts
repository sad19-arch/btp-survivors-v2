import Phaser from 'phaser'
import { BootScene } from '@render/scenes/BootScene'

/**
 * Point d'entrée du jeu (couche rendu).
 *
 * Le cœur de simulation (`src/core`) reste indépendant de ce fichier : ici on ne
 * fait que câbler Phaser, qui observera plus tard l'état du World.
 */
function createGame(): Phaser.Game {
  return new Phaser.Game({
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
    scene: [BootScene]
  })
}

createGame()
