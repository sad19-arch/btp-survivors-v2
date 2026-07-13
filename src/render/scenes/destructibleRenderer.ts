import Phaser from 'phaser'
import type { DestructibleState } from '@core/types'
import { destructibleDef } from '@content/destructibles'
import { PALETTE_HEX } from '@ui/palette'
import type { VfxManager } from './vfxManager'

/**
 * Rendu des objets DESTRUCTIBLES (observateur pur). Dessine un sprite par objet,
 * et rend la casse RÉACTIVE : à chaque coup (baisse de PV) → flash blanc + squash
 * (« ça bronche ») + éclats matériau ; à la disparition (cassé) → burst-apart
 * (le sprite se disloque : scale-up + spin + fondu). Le gros VFX de casse (boom +
 * fragments + pièces + son) est déclenché par l'événement `destructibleBroken`
 * côté GameScene.
 *
 * Le squash est FRAME-DRIVEN (pas de tween sur scale/rotation) → aucun conflit
 * avec le `setPosition` par frame, et pas d'empilement de tweens en martelage.
 * Instance fraîche par scène (détient la Map des sprites) — pas de `reset()`.
 */
const FLASH_MS = 90
const PUNCH_MS = 150
const CHIP_MAX_PER_FRAME = 6 // borne les éclats par frame (AoE qui martèle un cluster)

export class DestructibleRenderer {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>()
  private readonly prevHp = new Map<number, number>()
  private readonly flashUntil = new Map<number, number>()
  private readonly punchUntil = new Map<number, number>()
  private readonly baseScale = new Map<number, number>()
  private readonly seen = new Set<number>()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly vfx: VfxManager
  ) {}

  sync(destructibles: readonly DestructibleState[]): void {
    const now = this.scene.time.now
    const seen = this.seen
    seen.clear()
    let chips = 0

    for (const d of destructibles) {
      seen.add(d.id)
      const def = destructibleDef(d.typeId)
      const base = def?.scale ?? 0.7
      let sprite = this.sprites.get(d.id)
      if (sprite === undefined) {
        // Texture absente → Phaser affiche un placeholder (pas de crash) ; en pratique
        // l'asset est préchargé par GameScene.
        sprite = this.scene.add.image(d.x, d.y, def?.assetKey ?? 'pickup_coin').setScale(base)
        sprite.setDepth(-2) // au-dessus du sol/décalques, sous les entités
        this.sprites.set(d.id, sprite)
        this.prevHp.set(d.id, d.hp)
        this.baseScale.set(d.id, base)
      }
      sprite.setPosition(d.x, d.y)

      // Coup encaissé (baisse de PV) : arme le flash + le squash + des éclats matériau.
      const prev = this.prevHp.get(d.id) ?? d.hp
      if (d.hp < prev - 0.001) {
        this.flashUntil.set(d.id, now + FLASH_MS)
        this.punchUntil.set(d.id, now + PUNCH_MS)
        if (chips < CHIP_MAX_PER_FRAME && def !== undefined) {
          this.vfx.spawnDestructibleChip(d.x, d.y, def.material)
          chips++
        }
      }
      this.prevHp.set(d.id, d.hp)

      // Squash frame-driven : large + court juste après le coup, retour à la normale.
      const pu = this.punchUntil.get(d.id)
      if (pu !== undefined && now < pu) {
        const t = (pu - now) / PUNCH_MS // 1 → 0
        const s = 1 + 0.2 * t
        sprite.setScale(base * s, base * (2 - s))
        sprite.setRotation(0.12 * t * (d.id % 2 === 0 ? 1 : -1))
      } else {
        sprite.setScale(base)
        sprite.setRotation(0)
      }

      // Flash blanc bref.
      const fu = this.flashUntil.get(d.id)
      if (fu !== undefined && now < fu) {
        sprite.setTintFill(PALETTE_HEX.blanc)
      } else {
        sprite.clearTint()
      }
    }

    // Objets disparus de l'état (cassés) → BURST-APART : le sprite se disloque
    // (scale-up + spin + fondu) au lieu de disparaître sec, PUIS se détruit.
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.clearTint()
        this.scene.tweens.add({
          targets: sprite,
          scale: (this.baseScale.get(id) ?? 0.7) * 1.5,
          angle: 180,
          alpha: 0,
          duration: 180,
          ease: 'Quad.easeOut',
          onComplete: () => sprite.destroy()
        })
        this.sprites.delete(id)
        this.prevHp.delete(id)
        this.flashUntil.delete(id)
        this.punchUntil.delete(id)
        this.baseScale.delete(id)
      }
    }
  }
}
