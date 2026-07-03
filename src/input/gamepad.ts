import Phaser from 'phaser'
import type { FrameInput, NavAction } from './intents'

const DEADZONE = 0.35
/** Mapping standard Xbox : A=0, B=1, LB=4, RB=5, Start=9, D-pad 12..15. */
const BTN = { A: 0, B: 1, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const

/**
 * Deadzone avec re-scale (pure) : sous le seuil → 0 ; au-delà, la plage
 * restante [deadzone, 1] est ré-étirée en [0, 1] pour que l'inclinaison
 * maximale du stick atteigne bien la magnitude 1 (un clamp brut laisse une
 * bande morte en haut de la plage).
 */
export function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) < deadzone) {
    return 0
  }
  return (Math.sign(value) * (Math.abs(value) - deadzone)) / (1 - deadzone)
}

/**
 * Adaptateur manette (couche rendu) — Xbox One prioritaire (PRD : 100 % du jeu
 * jouable à la manette). Stick gauche / D-pad pour le déplacement et la
 * navigation ; A=valider, B=retour, Start=pause. Fronts montants pour les menus.
 */
export class GamepadInput {
  private readonly plugin: Phaser.Input.Gamepad.GamepadPlugin
  private readonly padIndex: number
  private prev = new Set<NavAction>()

  constructor(plugin: Phaser.Input.Gamepad.GamepadPlugin, padIndex: number = 0) {
    this.plugin = plugin
    this.padIndex = padIndex
  }

  readFrame(): FrameInput {
    const pad = this.plugin.getPad(this.padIndex)
    if (pad === undefined) {
      this.prev = new Set()
      return { move: { x: 0, y: 0 }, pressed: [], action: false }
    }

    const ax = pad.axes.length > 0 ? pad.axes[0]?.getValue() ?? 0 : 0
    const ay = pad.axes.length > 1 ? pad.axes[1]?.getValue() ?? 0 : 0
    const down = (i: number): boolean => pad.buttons[i]?.pressed === true

    // Déplacement : stick gauche (avec deadzone) ou D-pad.
    let mx = applyDeadzone(ax, DEADZONE)
    let my = applyDeadzone(ay, DEADZONE)
    if (down(BTN.LEFT)) {
      mx -= 1
    }
    if (down(BTN.RIGHT)) {
      mx += 1
    }
    if (down(BTN.UP)) {
      my -= 1
    }
    if (down(BTN.DOWN)) {
      my += 1
    }

    // Actions « tenues » de cette frame (stick + D-pad + boutons).
    const now = new Set<NavAction>()
    if (my < -DEADZONE || down(BTN.UP)) {
      now.add('up')
    }
    if (my > DEADZONE || down(BTN.DOWN)) {
      now.add('down')
    }
    if (mx < -DEADZONE || down(BTN.LEFT)) {
      now.add('left')
    }
    if (mx > DEADZONE || down(BTN.RIGHT)) {
      now.add('right')
    }
    if (down(BTN.A)) {
      now.add('confirm')
    }
    if (down(BTN.B)) {
      now.add('back')
    }
    if (down(BTN.START)) {
      now.add('pause')
    }

    // Fronts montants seulement (évite la répétition continue dans les menus).
    const pressed: NavAction[] = []
    for (const a of now) {
      if (!this.prev.has(a)) {
        pressed.push(a)
      }
    }
    this.prev = now

    // Bouton d'action MAINTENU (pas un front) — ex. relever un coéquipier à terre.
    const action = down(BTN.A)

    return { move: { x: mx, y: my }, pressed, action }
  }
}
