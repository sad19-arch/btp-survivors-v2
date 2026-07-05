import Phaser from 'phaser'

/**
 * Pool de sprites Phaser (rendu). Réutilise les `Sprite` au lieu de `create`/`destroy`
 * à chaque apparition/disparition d'entité (ennemis/projectiles/pickups) — une horde de
 * 300-600 entités qui recrée ses sprites chaque frame de mort/spawn fait chuter le FPS et
 * fragmente le GC. Une free-list par `textureKey` : un sprite libéré ne peut être rendu
 * qu'à un autre occupant de la MÊME texture (pas de mélange de feuilles de sprites).
 *
 * Ne gère QUE `Phaser.GameObjects.Sprite` — le repli `Arc` (cercle, texture manquante)
 * n'est pas poolé : il reste créé/détruit directement par l'appelant.
 */
export class SpritePool {
  private readonly scene: Phaser.Scene
  private readonly free = new Map<string, Phaser.GameObjects.Sprite[]>()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Fournit un sprite prêt à l'emploi pour `textureKey`, positionné à (x, y).
   * Réutilise un sprite libre de la même texture s'il y en a un (réinitialisé
   * intégralement pour ne rien hériter de l'occupant précédent), sinon en crée un.
   * L'appelant DOIT réappliquer l'échelle propre à l'entité juste après (le pool
   * ne connaît pas l'échelle voulue, elle est remise à 1 ici).
   */
  acquire(textureKey: string, x: number, y: number): Phaser.GameObjects.Sprite {
    const list = this.free.get(textureKey)
    const recycled = list?.pop()
    if (recycled !== undefined) {
      recycled.setActive(true)
      recycled.setVisible(true)
      recycled.clearTint()
      recycled.setAlpha(1)
      recycled.setRotation(0)
      recycled.setScale(1)
      recycled.setFrame(0)
      recycled.setTexture(textureKey)
      recycled.setPosition(x, y)
      return recycled
    }
    return this.scene.add.sprite(x, y, textureKey)
  }

  /** Rend un sprite au pool : masqué/désactivé, rangé dans la free-list de sa texture. */
  release(sprite: Phaser.GameObjects.Sprite): void {
    sprite.setActive(false)
    sprite.setVisible(false)
    const key = sprite.texture.key
    const list = this.free.get(key)
    if (list !== undefined) {
      list.push(sprite)
    } else {
      this.free.set(key, [sprite])
    }
  }
}
