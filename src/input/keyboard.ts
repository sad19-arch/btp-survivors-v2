import type Phaser from 'phaser'
import type { FrameInput, NavAction } from './intents'

/** Codes DOM stables des touches utilisées — évite une dépendance runtime à Phaser. */
const K = {
  BACKSPACE: 8,
  ENTER: 13,
  ESC: 27,
  SPACE: 32,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  A: 65,
  D: 68,
  E: 69,
  M: 77,
  P: 80,
  Q: 81,
  S: 83,
  W: 87,
  Z: 90,
} as const

/**
 * Adaptateur clavier (couche rendu). Lit l'état des touches et produit un
 * `FrameInput` : déplacement continu (WASD / ZQSD / flèches) + actions
 * ponctuelles (front montant) pour naviguer les menus.
 *
 * Clavier obligatoire (PRD) : équivalent complet de la manette.
 */
export class KeyboardInput {
  private readonly key: (code: number) => Phaser.Input.Keyboard.Key
  /** Fronts capturés par événement : un appui très bref entre deux frames n'est jamais perdu. */
  private readonly pendingCodes = new Set<number>()

  constructor(kb: Phaser.Input.Keyboard.KeyboardPlugin) {
    const cache = new Map<number, Phaser.Input.Keyboard.Key>()
    this.key = (code): Phaser.Input.Keyboard.Key => {
      let k = cache.get(code)
      if (k === undefined) {
        k = kb.addKey(code, true, true)
        k.on('down', () => this.pendingCodes.add(code))
        cache.set(code, k)
      }
      return k
    }
    // Arme immédiatement les listeners : même une touche pressée avant la
    // première frame de lecture doit être mémorisée.
    for (const code of Object.values(K)) {
      this.key(code)
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
    const edge = (codes: number[]): boolean => codes.some((code) => this.pendingCodes.has(code))
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
    if (edge([K.M])) {
      pressed.push('minimap')
    }
    this.pendingCodes.clear()

    // Bouton d'action MAINTENU (pas un front) — ex. relever un coéquipier à terre.
    const action = held([K.E])

    return { move: { x, y }, pressed, action }
  }
}
