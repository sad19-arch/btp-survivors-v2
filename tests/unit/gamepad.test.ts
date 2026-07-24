import { describe, it, expect } from 'vitest'
import { applyDeadzone, GamepadInput } from '@input/gamepad'

describe('applyDeadzone', () => {
  it('retourne 0 sous le seuil', () => {
    expect(applyDeadzone(0.2, 0.35)).toBe(0)
  })

  it('retourne 0 exactement au seuil', () => {
    expect(applyDeadzone(0.35, 0.35)).toBe(0)
  })

  it('inclinaison max → magnitude 1 (re-scale)', () => {
    expect(applyDeadzone(1, 0.35)).toBeCloseTo(1)
  })

  it('conserve le signe (négatif)', () => {
    expect(applyDeadzone(-1, 0.35)).toBeCloseTo(-1)
  })

  it('re-scale une valeur médiane (discriminant vs clamp brut)', () => {
    // (0.675 - 0.35) / (1 - 0.35) = 0.325 / 0.65 = 0.5
    // Un clamp brut (Math.abs(v) > deadzone ? v : 0) renverrait 0.675, pas 0.5.
    expect(applyDeadzone(0.675, 0.35)).toBeCloseTo(0.5)
  })
})

interface FakeButton {
  pressed: boolean
}

function fakeGamepadRig() {
  const pads = Array.from({ length: 4 }, () => ({
    axes: [{ getValue: () => 0 }, { getValue: () => 0 }],
    buttons: Array.from({ length: 16 }, (): FakeButton => ({ pressed: false })),
  }))
  const plugin = {
    getPad: (index: number) => pads[index],
  }
  return { pads, plugin }
}

describe('GamepadInput — mapping Xbox et isolation J1–J4', () => {
  it('pad absent → frame neutre sans erreur', () => {
    const input = new GamepadInput(
      { getPad: () => undefined } as unknown as ConstructorParameters<typeof GamepadInput>[0],
      3
    )
    expect(input.readFrame()).toEqual({
      move: { x: 0, y: 0 },
      pressed: [],
      action: false,
    })
  })

  it.each([
    [0, 'confirm'],
    [1, 'back'],
    [8, 'minimap'],
    [9, 'pause'],
    [12, 'up'],
    [13, 'down'],
    [14, 'left'],
    [15, 'right'],
  ] as const)('bouton %d → %s', (buttonIndex, expected) => {
    const { pads, plugin } = fakeGamepadRig()
    const pad = pads[0]
    if (pad === undefined) {
      throw new Error('pad 0 absent')
    }
    const button = pad.buttons[buttonIndex]
    if (button === undefined) {
      throw new Error(`bouton ${buttonIndex} absent`)
    }
    button.pressed = true
    const input = new GamepadInput(plugin as unknown as ConstructorParameters<typeof GamepadInput>[0], 0)
    const frame = input.readFrame()
    expect(frame.pressed).toContain(expected)
    expect(frame.action).toBe(buttonIndex === 0)
  })

  it('un bouton tenu ne produit qu’un front, puis se réarme après relâchement', () => {
    const { pads, plugin } = fakeGamepadRig()
    const button = pads[0]?.buttons[13]
    if (button === undefined) {
      throw new Error('bouton Down absent')
    }
    const input = new GamepadInput(plugin as unknown as ConstructorParameters<typeof GamepadInput>[0], 0)
    button.pressed = true
    expect(input.readFrame().pressed).toEqual(['down'])
    expect(input.readFrame().pressed).toEqual([])
    button.pressed = false
    expect(input.readFrame().pressed).toEqual([])
    button.pressed = true
    expect(input.readFrame().pressed).toEqual(['down'])
  })

  it('chaque adaptateur lit uniquement son slot de manette', () => {
    const { pads, plugin } = fakeGamepadRig()
    const expected = ['up', 'down', 'left', 'right'] as const
    for (let padIndex = 0; padIndex < 4; padIndex++) {
      const button = pads[padIndex]?.buttons[12 + padIndex]
      if (button === undefined) {
        throw new Error(`pad ${padIndex} absent`)
      }
      button.pressed = true
    }
    for (let padIndex = 0; padIndex < 4; padIndex++) {
      const input = new GamepadInput(
        plugin as unknown as ConstructorParameters<typeof GamepadInput>[0],
        padIndex
      )
      expect(input.readFrame().pressed).toEqual([expected[padIndex]])
    }
  })
})
