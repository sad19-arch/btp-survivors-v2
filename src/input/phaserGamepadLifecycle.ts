import type Phaser from 'phaser'

interface SparseGamepadPlugin {
  gamepads: Array<Phaser.Input.Gamepad.Gamepad | undefined>
  stopListeners: (this: SparseGamepadPlugin) => void
}

const guardedPlugins = new WeakSet<object>()

/**
 * Phaser 3.90 conserve les manettes à leur index navigateur dans un tableau
 * potentiellement creux, puis déréférence chaque case sans garde au shutdown.
 * Le wrapper densifie uniquement le temps du nettoyage et restaure aussitôt les
 * index natifs : la lecture des pads reste inchangée au redémarrage de la scène.
 */
export function guardSparseGamepadShutdown(plugin: Phaser.Input.Gamepad.GamepadPlugin): void {
  if (guardedPlugins.has(plugin)) {
    return
  }

  const internals = plugin as unknown as SparseGamepadPlugin
  const originalStopListeners = internals.stopListeners
  internals.stopListeners = function (this: SparseGamepadPlugin): void {
    const indexedPads = this.gamepads
    this.gamepads = indexedPads.filter(
      (pad): pad is Phaser.Input.Gamepad.Gamepad => pad !== undefined
    )
    try {
      originalStopListeners.call(this)
    } finally {
      this.gamepads = indexedPads
    }
  }
  guardedPlugins.add(plugin)
}

/** Installe le garde avant la création de toute scène, BootScene comprise. */
export function installPhaserGamepadLifecycleGuard(
  prototype: Phaser.Input.Gamepad.GamepadPlugin
): void {
  guardSparseGamepadShutdown(prototype)
}
