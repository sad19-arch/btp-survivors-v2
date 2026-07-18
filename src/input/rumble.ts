/**
 * RUMBLE manette (juice #2) — couche input, purement observationnelle.
 *
 * Émet des secousses via l'API Gamepad standard (`vibrationActuator.playEffect`),
 * feature-détectée : NO-OP silencieux si absente (Firefox/Safari, pad sans moteur,
 * headless). Jamais requis pour jouer — c'est un bonus manette. Désactivable via
 * le menu Options (`Rumbler.setEnabled`), câblé sur `app.getVibrations()`.
 *
 * Aucune dépendance Phaser/DOM-lourde : lit `navigator.getGamepads()` directement
 * (comme le HUD manettes de l'overlay). Le temps réel (`performance.now`) est injecté
 * pour le throttle → testable sans horloge réelle.
 */

/** Une secousse : magnitudes [0,1] (moteur fort/faible) + durée ms — contrat `dual-rumble`. */
export interface RumblePattern {
  strong: number
  weak: number
  ms: number
}

/** Patterns par moment de jeu — dosés : léger sur kill, fort/long sur boss·évo·super-coffre. */
export const RUMBLE = {
  kill: { strong: 0, weak: 0.32, ms: 55 },
  hurt: { strong: 0.55, weak: 0.4, ms: 140 },
  boss: { strong: 0.8, weak: 0.6, ms: 320 },
  evolve: { strong: 0.7, weak: 0.5, ms: 260 },
  chest: { strong: 0.6, weak: 0.45, ms: 220 },
  chestSuper: { strong: 0.95, weak: 0.75, ms: 520 }
} as const satisfies Record<string, RumblePattern>

/** Sous-ensemble de `GamepadHapticActuator` réellement utilisé (typage minimal, sans `any`). */
interface HapticActuator {
  playEffect?: (
    type: string,
    params: { duration: number; strongMagnitude: number; weakMagnitude: number; startDelay?: number }
  ) => Promise<unknown>
  reset?: () => Promise<unknown>
}

export interface RumblerOpts {
  /** Intervalle mini entre deux secousses NON prioritaires (throttle des kills). */
  minGapMs?: number
  /** Source de temps (injectable pour les tests). */
  now?: () => number
}

export class Rumbler {
  private enabled: boolean
  private lastAtMs = -Infinity
  private readonly minGapMs: number
  private readonly now: () => number

  constructor(enabled: boolean, opts?: RumblerOpts) {
    this.enabled = enabled
    this.minGapMs = opts?.minGapMs ?? 40
    this.now =
      opts?.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0))
  }

  /** Active/désactive (Options). À OFF, coupe aussi une éventuelle secousse en cours. */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) {
      this.stopAll()
    }
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Émet une secousse. `bypassThrottle` pour les GROS moments (boss/évo/coffre) qui
   * ne doivent jamais être avalés par le throttle des kills rapprochés.
   * Retourne `true` si la secousse a été émise (utile aux tests).
   */
  play(p: RumblePattern, bypassThrottle = false): boolean {
    if (!this.enabled) {
      return false
    }
    const t = this.now()
    if (!bypassThrottle && t - this.lastAtMs < this.minGapMs) {
      return false
    }
    this.lastAtMs = t
    for (const act of this.actuators()) {
      // playEffect renvoie une Promise ; un rejet (pad débranché en vol) est sans gravité.
      void act.playEffect?.('dual-rumble', {
        duration: p.ms,
        strongMagnitude: p.strong,
        weakMagnitude: p.weak,
        startDelay: 0
      })?.catch?.(() => {})
    }
    return true
  }

  private stopAll(): void {
    for (const act of this.actuators()) {
      void act.reset?.()?.catch?.(() => {})
    }
  }

  private actuators(): HapticActuator[] {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return []
    }
    const out: HapticActuator[] = []
    for (const gp of navigator.getGamepads()) {
      if (gp === null) {
        continue
      }
      const act = (gp as unknown as { vibrationActuator?: HapticActuator }).vibrationActuator
      if (act !== undefined && act !== null) {
        out.push(act)
      }
    }
    return out
  }
}
