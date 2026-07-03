import Phaser from 'phaser'
import type { FrameInput, NavAction } from './intents'

const K = Phaser.Input.Keyboard.KeyCodes

/**
 * Adaptateur clavier (couche rendu). Lit l'état des touches et produit un
 * `FrameInput` : déplacement continu (WASD / ZQSD / flèches) + actions
 * ponctuelles (front montant) pour naviguer les menus.
 *
 * Clavier obligatoire (PRD) : équivalent complet de la manette.
 */
export class KeyboardInput {
  private readonly key: (code: number) => Phaser.Input.Keyboard.Key

  constructor(kb: Phaser.Input.Keyboard.KeyboardPlugin) {
    const cache = new Map<number, Phaser.Input.Keyboard.Key>()
    this.key = (code): Phaser.Input.Keyboard.Key => {
      let k = cache.get(code)
      if (k === undefined) {
        k = kb.addKey(code, true, true)
        cache.set(code, k)
      }
      return k
    }
  }

  readFrame(): FrameInput {
    const held = (codes: number[]): boolean => codes.some((c) => this.key(c).isDown)
    let x = 0
    let y = 0
    if (held([K.LEFT, K.A, K.Q])) {
      x -= 1
    }
    if (held([K.RIGHT, K.D])) {
      x += 1
    }
    if (held([K.UP, K.W, K.Z])) {
      y -= 1
    }
    if (held([K.DOWN, K.S])) {
      y += 1
    }

    const pressed: NavAction[] = []
    const edge = (codes: number[]): boolean => codes.some((c) => Phaser.Input.Keyboard.JustDown(this.key(c)))
    if (edge([K.UP, K.W, K.Z])) {
      pressed.push('up')
    }
    if (edge([K.DOWN, K.S])) {
      pressed.push('down')
    }
    if (edge([K.LEFT, K.A, K.Q])) {
      pressed.push('left')
    }
    if (edge([K.RIGHT, K.D])) {
      pressed.push('right')
    }
    if (edge([K.ENTER, K.SPACE])) {
      pressed.push('confirm')
    }
    if (edge([K.ESC, K.BACKSPACE])) {
      pressed.push('back')
    }
    if (edge([K.P])) {
      pressed.push('pause')
    }

    // Bouton d'action MAINTENU (pas un front) — ex. relever un coéquipier à terre.
    const action = held([K.E])

    return { move: { x, y }, pressed, action }
  }
}
