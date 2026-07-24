import { describe, expect, it } from 'vitest'
import { KeyboardInput } from '@input/keyboard'

interface FakeKey {
  isDown: boolean
  on(event: string, callback: () => void): void
  downListeners: (() => void)[]
}

function keyboardRig() {
  const keys = new Map<number, FakeKey>()
  const plugin = {
    addKey: (code: number) => {
      const key =
        keys.get(code) ??
        {
          isDown: false,
          downListeners: [],
          on(event: string, callback: () => void) {
            if (event === 'down') {
              this.downListeners.push(callback)
            }
          },
        }
      keys.set(code, key)
      return key
    },
  }
  const input = new KeyboardInput(
    plugin as unknown as ConstructorParameters<typeof KeyboardInput>[0]
  )
  const press = (code: number) => {
    const key = plugin.addKey(code)
    const wasDown = key.isDown
    key.isDown = true
    if (!wasDown) {
      for (const listener of key.downListeners) {
        listener()
      }
    }
  }
  const release = (code: number) => {
    const key = plugin.addKey(code)
    key.isDown = false
  }
  return { input, press, release }
}

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

describe('KeyboardInput — mapping complet', () => {
  it.each([
    [K.LEFT, 'left', -1, 0],
    [K.A, 'left', -1, 0],
    [K.Q, 'left', -1, 0],
    [K.RIGHT, 'right', 1, 0],
    [K.D, 'right', 1, 0],
    [K.UP, 'up', 0, -1],
    [K.W, 'up', 0, -1],
    [K.Z, 'up', 0, -1],
    [K.DOWN, 'down', 0, 1],
    [K.S, 'down', 0, 1],
  ] as const)('touche %d → %s et déplacement (%d,%d)', (code, action, x, y) => {
    const { input, press } = keyboardRig()
    press(code)
    const frame = input.readFrame()
    expect(frame.move).toEqual({ x, y })
    expect(frame.pressed).toContain(action)
  })

  it.each([
    [K.ENTER, 'confirm'],
    [K.SPACE, 'confirm'],
    [K.ESC, 'back'],
    [K.BACKSPACE, 'back'],
    [K.P, 'pause'],
    [K.M, 'minimap'],
  ] as const)('touche %d → %s', (code, action) => {
    const { input, press } = keyboardRig()
    press(code)
    expect(input.readFrame().pressed).toContain(action)
  })

  it('E est une action maintenue sans devenir une action de menu', () => {
    const { input, press, release } = keyboardRig()
    press(K.E)
    expect(input.readFrame()).toMatchObject({ pressed: [], action: true })
    expect(input.readFrame()).toMatchObject({ pressed: [], action: true })
    release(K.E)
    expect(input.readFrame().action).toBe(false)
  })

  it('les fronts montants sont consommés une seule fois', () => {
    const { input, press } = keyboardRig()
    press(K.ENTER)
    expect(input.readFrame().pressed).toEqual(['confirm'])
    expect(input.readFrame().pressed).toEqual([])
  })
})
