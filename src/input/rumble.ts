/**
 * RUMBLE (juice #2) — couche input, purement observationnelle.
 *
 * DEUX canaux, feature-détectés indépendamment (NO-OP silencieux si absents) :
 *  - `vibrationActuator.playEffect` d'une manette physique connectée (API Gamepad) ;
 *  - `navigator.vibrate()` (Web Vibration API), le vibreur du TÉLÉPHONE lui-même —
 *    retour playtest : sans manette physique branchée (le user teste au téléphone en
 *    tactile), `navigator.getGamepads()` est TOUJOURS vide, donc le canal manette seul
 *    ne peut jamais être ressenti. C'est ce second canal qui rend le rumble perceptible
 *    hors manette. Les deux coexistent (desktop+manette continue de vibrer normalement ;
 *    `navigator.vibrate` est un no-op silencieux sur desktop sans matériel).
 *
 * Jamais requis pour jouer — c'est un bonus. Désactivable via le menu Options
 * (`Rumbler.setEnabled`), câblé sur `app.getVibrations()`.
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
  chestSuper: { strong: 0.95, weak: 0.75, ms: 520 },
  milestone: { strong: 0.5, weak: 0.55, ms: 200 }
} as const satisfies Record<string, RumblePattern>

/** Sous-ensemble de `GamepadHapticActuator` réellement utilisé (typage minimal, sans `any`). */
interface HapticActuator {
  playEffect?: (
    type: string,
    params: { duration: number; strongMagnitude: number; weakMagnitude: number; startDelay?: number }
  ) => Promise<unknown>
  pulse?: (value: number, duration: number) => Promise<unknown>
  reset?: () => Promise<unknown>
}

interface HapticGamepad {
  index: number
  vibrationActuator?: HapticActuator | null
  hapticActuators?: readonly HapticActuator[]
}

export interface RumblerOpts {
  /** Intervalle mini entre deux secousses NON prioritaires (throttle des kills). */
  minGapMs?: number
  /** Source de temps (injectable pour les tests). */
  now?: () => number
}

export class Rumbler {
  private enabled: boolean
  /** Throttle indépendant par canal (`all`, `player:1`…`player:4`). */
  private readonly lastAtMs = new Map<string, number>()
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
    return this.playOn('all', this.actuators(), p, bypassThrottle, true)
  }

  /**
   * Vibre uniquement la manette affectée au joueur (`P1 → pad 0`, …, `P4 → pad 3`).
   * Le throttle est propre à ce joueur : un kill de P1 ne peut pas avaler celui de P2.
   */
  playForPlayer(playerId: number, p: RumblePattern, bypassThrottle = false): boolean {
    const actuator = this.actuatorForPlayer(playerId)
    return this.playOn(
      `player:${playerId}`,
      actuator === null ? [] : [actuator],
      p,
      bypassThrottle,
      this.actuators().length === 0
    )
  }

  private playOn(
    channel: string,
    actuators: readonly HapticActuator[],
    p: RumblePattern,
    bypassThrottle: boolean,
    vibratePhone: boolean
  ): boolean {
    if (!this.enabled) {
      return false
    }
    const t = this.now()
    const lastAt = this.lastAtMs.get(channel) ?? -Infinity
    if (!bypassThrottle && t - lastAt < this.minGapMs) {
      return false
    }
    this.lastAtMs.set(channel, t)
    for (const act of actuators) {
      this.playActuator(act, p)
    }
    // Vibreur du téléphone (Web Vibration API) — seul canal ressenti sans manette physique.
    if (vibratePhone && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(Math.round(p.ms))
    }
    return true
  }

  private playActuator(act: HapticActuator, p: RumblePattern): void {
    if (act.playEffect !== undefined) {
      void act.playEffect('dual-rumble', {
        duration: p.ms,
        strongMagnitude: p.strong,
        weakMagnitude: p.weak,
        startDelay: 0
      }).catch(() => {})
      return
    }
    void act.pulse?.(Math.max(p.strong, p.weak), p.ms)?.catch?.(() => {})
  }

  private stopAll(): void {
    for (const act of this.actuators()) {
      void act.reset?.()?.catch?.(() => {})
    }
    // `vibrate(0)` (ou un tableau vide) annule toute vibration du téléphone en cours.
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0)
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
      const act = this.actuator(gp as unknown as HapticGamepad)
      if (act !== undefined && act !== null) {
        out.push(act)
      }
    }
    return out
  }

  private actuatorForPlayer(playerId: number): HapticActuator | null {
    if (
      playerId < 1 ||
      playerId > 4 ||
      typeof navigator === 'undefined' ||
      typeof navigator.getGamepads !== 'function'
    ) {
      return null
    }
    const slot = playerId - 1
    const pads = Array.from(navigator.getGamepads())
    // Même identité que Phaser `getPad(index)`. Ne jamais compacter les trous :
    // sinon une reconnexion pourrait faire vibrer la manette voisine.
    const pad = pads.find((candidate) => candidate?.index === slot) ?? pads[slot]
    return pad === null || pad === undefined
      ? null
      : this.actuator(pad as unknown as HapticGamepad)
  }

  private actuator(pad: HapticGamepad): HapticActuator | null {
    return pad.vibrationActuator ?? pad.hapticActuators?.[0] ?? null
  }
}
