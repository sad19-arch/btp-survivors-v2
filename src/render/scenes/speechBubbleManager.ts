import Phaser from 'phaser'
import { PALETTE, PALETTE_HEX } from '@ui/palette'
import { shouldBubble, pickPhrase } from '@render/ambientNpc'

/** Délai (ms) entre deux bulles pour le MÊME PNJ d'ambiance. */
const AMBIENT_BUBBLE_COOLDOWN_MS = 4000
/** Nombre maximum de bulles d'ambiance simultanées (pool borné). */
const MAX_AMBIENT_BUBBLES = 2

/** Source d'une bulle : position ACTUELLE du sprite PNJ + seed (choix de phrase). */
export interface BubbleSource {
  readonly sprite: { readonly x: number; readonly y: number }
  readonly seed: number
}
/** Cible de proximité : un joueur vivant. */
export interface BubbleTarget {
  readonly x: number
  readonly y: number
}

/**
 * Bulles râleuses des PNJ d'ambiance (« vie du chantier »), extraites de GameScene.
 * Détient son propre état (bulles actives + cooldown par PNJ) ; observer-only,
 * aucun effet sur la simulation. Chaque bulle est un panneau DA 16-bit (coins
 * carrés, bord sombre, ergot bas, texte monospace, sans emoji) qui se détruit en
 * fin de tween. Pool borné à MAX_AMBIENT_BUBBLES.
 */
export class SpeechBubbleManager {
  private readonly bubbles = new Set<Phaser.GameObjects.Container>()
  /** Index de PNJ → dernier timestamp (ms) de bulle (anti-spam par PNJ). */
  private readonly cooldowns = new Map<number, number>()

  constructor(private readonly scene: Phaser.Scene) {}

  /** Nombre de bulles actives (exposé au seam de test). */
  get activeCount(): number {
    return this.bubbles.size
  }

  /**
   * Détruit toutes les bulles actives et remet les cooldowns à zéro
   * (resetRunState / changement de stage — pas de fuite entre runs).
   */
  reset(): void {
    for (const bub of this.bubbles) {
      bub.destroy()
    }
    this.bubbles.clear()
    this.cooldowns.clear()
  }

  /**
   * Vérifie, pour chaque PNJ d'ambiance, si un joueur vivant est à portée
   * (`shouldBubble`) et si le cooldown est écoulé ; si oui, affiche une bulle DA.
   * `nowMs` = horloge de scène (`scene.time.now`).
   */
  update(npcs: readonly BubbleSource[], alivePlayers: readonly BubbleTarget[], nowMs: number): void {
    if (alivePlayers.length === 0) {
      return
    }
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i]
      if (npc === undefined) {
        continue
      }
      // Cooldown par PNJ.
      const lastMs = this.cooldowns.get(i) ?? -Infinity
      if (nowMs - lastMs < AMBIENT_BUBBLE_COOLDOWN_MS) {
        continue
      }
      // Pool borné.
      if (this.bubbles.size >= MAX_AMBIENT_BUBBLES) {
        continue
      }
      // Distance au joueur le plus proche de la position ACTUELLE du sprite.
      const sx = npc.sprite.x
      const sy = npc.sprite.y
      let minDist = Infinity
      for (const p of alivePlayers) {
        const d = Math.hypot(p.x - sx, p.y - sy)
        if (d < minDist) {
          minDist = d
        }
      }
      if (!shouldBubble(minDist)) {
        continue
      }
      // Déclenche la bulle.
      this.cooldowns.set(i, nowMs)
      this.spawn(sx, sy, pickPhrase(npc.seed))
    }
  }

  /**
   * Affiche un panneau bulle DA au-dessus d'un PNJ avec le texte indiqué.
   * Style 16-bit strict : coins carrés, bord sombre, ergot bas, pas d'emoji.
   * Fade court (1 200 ms) ; le conteneur se détruit automatiquement à la fin.
   */
  private spawn(x: number, y: number, text: string): void {
    const pad = 8
    const txt = this.scene.add.text(0, 0, text, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: PALETTE.contour,
      wordWrap: { width: 140 }
    }).setOrigin(0.5, 0.5)

    const bw = txt.width + pad * 2
    const bh = txt.height + pad * 2

    // Corps du panneau (fond blanc, bord sombre).
    const bg = this.scene.add.graphics()
    bg.fillStyle(PALETTE_HEX.blanc, 1)
    bg.fillRect(-bw / 2, -bh / 2, bw, bh)
    bg.lineStyle(2, PALETTE_HEX.contour, 1)
    bg.strokeRect(-bw / 2, -bh / 2, bw, bh)

    // Ergot triangulaire pointant vers le bas.
    const ergotSize = 6
    bg.fillStyle(PALETTE_HEX.blanc, 1)
    bg.fillTriangle(
      -ergotSize, bh / 2,
      ergotSize, bh / 2,
      0, bh / 2 + ergotSize
    )
    bg.lineStyle(2, PALETTE_HEX.contour, 1)
    bg.strokeTriangle(
      -ergotSize, bh / 2,
      ergotSize, bh / 2,
      0, bh / 2 + ergotSize
    )

    // Conteneur : positionné au-dessus du sprite.
    const offsetY = -(bh / 2 + ergotSize + 44)
    const container = this.scene.add.container(x, y + offsetY, [bg, txt])
    container.setDepth(9)
    this.bubbles.add(container)

    // Fade + montée légère, puis destruction propre.
    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      y: y + offsetY - 12,
      duration: 1200,
      delay: 1800,
      ease: 'Quad.easeIn',
      onComplete: () => {
        // Garde anti double-destroy : si la scène a été réinitialisée (resetRun,
        // changement de stage) pendant le tween, le container a déjà été détruit
        // et retiré du Set — ne rien faire pour éviter double-destroy + crash.
        if (!this.bubbles.has(container)) {
          return
        }
        container.destroy()
        this.bubbles.delete(container)
      }
    })
  }
}
