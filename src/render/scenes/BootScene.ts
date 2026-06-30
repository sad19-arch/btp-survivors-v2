import Phaser from 'phaser'

/**
 * Scène de démarrage (placeholder du scaffold).
 *
 * Milestone 0: prouve seulement que le pipeline Vite → Phaser → canvas tourne.
 * Le vrai chargement d'assets et la scène de jeu arrivent au slice 1.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create(): void {
    const { width, height } = this.scale
    this.add
      .text(width / 2, height / 2, 'BTP SURVIVORS\nreconstruction — scaffold OK', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#f5c542',
        align: 'center'
      })
      .setOrigin(0.5)
  }
}
