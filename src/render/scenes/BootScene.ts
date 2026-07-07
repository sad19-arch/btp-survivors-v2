import Phaser from 'phaser'
import { MUSIC_FILES_SHARED, SFX_FILES, VOICE_FILES } from '@/audio/manifest'
import type { GameSceneData } from './GameScene'

/**
 * Scène de démarrage : précharge l'AUDIO (musique + SFX) une seule fois dans le
 * cache global (persiste malgré le `scene.restart` de GameScene à chaque stage),
 * puis lance le jeu. Sautée en mode test (headless/e2e) où l'audio est coupé.
 */
export class BootScene extends Phaser.Scene {
  private bootData!: GameSceneData

  constructor() {
    super('boot')
  }

  init(data: GameSceneData): void {
    this.bootData = data
  }

  preload(): void {
    if (this.bootData.testMode) {
      return // pas d'audio en test/headless (déterminisme + perf)
    }
    const base = import.meta.env.BASE_URL
    for (const [key, file] of [...MUSIC_FILES_SHARED, ...SFX_FILES, ...VOICE_FILES]) {
      this.load.audio(key, base + file)
    }
  }

  create(): void {
    this.scene.start('game', this.bootData)
  }
}
