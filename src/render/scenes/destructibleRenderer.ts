import Phaser from 'phaser'
import type { DestructibleState } from '@core/types'
import { destructibleDef } from '@content/destructibles'
import { PALETTE_HEX } from '@ui/palette'

/**
 * Rendu des objets DESTRUCTIBLES (observateur pur). Dessine un sprite par objet
 * (résolu depuis `DestructibleDef.assetKey`), le fait clignoter blanc quand il
 * encaisse des dégâts (baisse de PV), et retire le sprite quand l'objet disparaît
 * de l'état (cassé). La casse JOUISSIVE (boom + pièces + débris) est déclenchée
 * par l'événement `destructibleBroken` côté GameScene (position/type exacts).
 *
 * Instance fraîche par scène (détient la Map des sprites) — pas de `reset()`.
 */
export class DestructibleRenderer {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>()
  private readonly prevHp = new Map<number, number>()
  private readonly flashUntil = new Map<number, number>()
  private readonly seen = new Set<number>()

  constructor(private readonly scene: Phaser.Scene) {}

  sync(destructibles: readonly DestructibleState[]): void {
    const now = this.scene.time.now
    const seen = this.seen
    seen.clear()

    for (const d of destructibles) {
      seen.add(d.id)
      const def = destructibleDef(d.typeId)
      let sprite = this.sprites.get(d.id)
      if (sprite === undefined) {
        // Texture absente → Phaser affiche un placeholder (pas de crash) ; en pratique
        // l'asset est préchargé par GameScene.
        sprite = this.scene.add.image(d.x, d.y, def?.assetKey ?? 'pickup_coin').setScale(def?.scale ?? 0.7)
        sprite.setDepth(-2) // au-dessus du sol/décalques, sous les entités
        this.sprites.set(d.id, sprite)
        this.prevHp.set(d.id, d.hp)
      }
      sprite.setPosition(d.x, d.y)

      // Flash blanc bref à chaque baisse de PV (feedback de coup).
      const prev = this.prevHp.get(d.id) ?? d.hp
      if (d.hp < prev - 0.001) {
        this.flashUntil.set(d.id, now + 70)
      }
      this.prevHp.set(d.id, d.hp)
      const until = this.flashUntil.get(d.id)
      if (until !== undefined && now < until) {
        sprite.setTintFill(PALETTE_HEX.blanc)
      } else {
        sprite.clearTint()
      }
    }

    // Objets disparus de l'état (cassés) → retire le sprite. Le VFX de casse est
    // émis par l'événement `destructibleBroken` (GameScene), pas ici.
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.destroy()
        this.sprites.delete(id)
        this.prevHp.delete(id)
        this.flashUntil.delete(id)
      }
    }
  }
}
