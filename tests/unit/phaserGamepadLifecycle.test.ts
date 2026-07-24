import { describe, expect, it, vi } from 'vitest'
import { guardSparseGamepadShutdown } from '@input/phaserGamepadLifecycle'

describe('cycle de vie manette Phaser', () => {
  it('nettoie un tableau de pads creux puis restaure leurs index natifs', () => {
    const removeAllListeners = vi.fn()
    interface FakePad {
      removeAllListeners(): void
    }
    interface FakePlugin {
      gamepads: Array<FakePad | undefined>
      stopListeners(): void
    }
    const indexedPads = [
      undefined,
      { removeAllListeners }
    ] as Array<FakePad | undefined>
    const plugin: FakePlugin = {
      gamepads: indexedPads,
      stopListeners(): void {
        for (const pad of this.gamepads) {
          if (pad === undefined) {
            throw new TypeError('sparse gamepad slot')
          }
          pad.removeAllListeners()
        }
      }
    }

    guardSparseGamepadShutdown(plugin as unknown as Parameters<typeof guardSparseGamepadShutdown>[0])
    expect(() => plugin.stopListeners()).not.toThrow()
    expect(removeAllListeners).toHaveBeenCalledOnce()
    expect(plugin.gamepads).toBe(indexedPads)
  })
})
