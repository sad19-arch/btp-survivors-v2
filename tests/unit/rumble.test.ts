import { describe, it, expect, vi, afterEach } from 'vitest'
import { Rumbler, RUMBLE } from '@input/rumble'

/**
 * Rumbler manette (juice #2) — on teste la LOGIQUE de portillon (activé / throttle /
 * bypass) avec une horloge injectée, et l'ÉMISSION réelle via une manette simulée
 * (`navigator.getGamepads`). L'actionneur haptique n'existe pas en happy-dom : on le
 * simule pour prouver que `play` appelle bien `playEffect('dual-rumble', …)`.
 */

let t = 0
const now = (): number => t

afterEach(() => {
  vi.unstubAllGlobals()
  t = 0
})

function stubPad(): { playEffect: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> } {
  const playEffect = vi.fn(() => Promise.resolve())
  const reset = vi.fn(() => Promise.resolve())
  vi.stubGlobal('navigator', { getGamepads: () => [{ vibrationActuator: { playEffect, reset } }] })
  return { playEffect, reset }
}

function stubFourPads(): Array<{ playEffect: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }> {
  const actuators = Array.from({ length: 4 }, () => ({
    playEffect: vi.fn(() => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
  }))
  vi.stubGlobal('navigator', {
    getGamepads: () => actuators.map((vibrationActuator, index) => ({ index, vibrationActuator })),
  })
  return actuators
}

describe('Rumbler — portillon (activé / throttle / bypass)', () => {
  it('désactivé : play() ne fait rien et renvoie false', () => {
    const r = new Rumbler(false, { now })
    expect(r.play(RUMBLE.kill)).toBe(false)
  })

  it('activé : émet, puis throttle une seconde secousse rapprochée', () => {
    const r = new Rumbler(true, { now, minGapMs: 40 })
    expect(r.play(RUMBLE.kill)).toBe(true) // t=0, 1re passe
    expect(r.play(RUMBLE.kill)).toBe(false) // t=0, throttlée
    t = 41
    expect(r.play(RUMBLE.kill)).toBe(true) // hors fenêtre
  })

  it('bypassThrottle : les gros moments passent même dans la fenêtre de throttle', () => {
    const r = new Rumbler(true, { now, minGapMs: 40 })
    expect(r.play(RUMBLE.kill)).toBe(true)
    expect(r.play(RUMBLE.boss, true)).toBe(true) // même instant, mais prioritaire
  })

  it('setEnabled(false) coupe les secousses suivantes', () => {
    const r = new Rumbler(true, { now })
    r.setEnabled(false)
    expect(r.isEnabled).toBe(false)
    expect(r.play(RUMBLE.boss, true)).toBe(false)
  })
})

describe('Rumbler — émission sur la manette', () => {
  it('play() appelle playEffect(dual-rumble) avec les magnitudes du pattern', () => {
    const { playEffect } = stubPad()
    const r = new Rumbler(true, { now })
    r.play(RUMBLE.hurt, true)
    expect(playEffect).toHaveBeenCalledTimes(1)
    const call: unknown[] = playEffect.mock.calls[0] ?? []
    const [type, params] = call
    expect(type).toBe('dual-rumble')
    expect(params).toMatchObject({ strongMagnitude: RUMBLE.hurt.strong, weakMagnitude: RUMBLE.hurt.weak, duration: RUMBLE.hurt.ms })
  })

  it('désactivé : n\'appelle jamais playEffect', () => {
    const { playEffect } = stubPad()
    const r = new Rumbler(false, { now })
    r.play(RUMBLE.boss, true)
    expect(playEffect).not.toHaveBeenCalled()
  })

  it('setEnabled(false) tente un reset() de l\'actionneur (coupe une secousse en vol)', () => {
    const { reset } = stubPad()
    const r = new Rumbler(true, { now })
    r.setEnabled(false)
    expect(reset).toHaveBeenCalled()
  })

  it('sans API Gamepad (navigator.getGamepads absent) : play() ne jette pas', () => {
    vi.stubGlobal('navigator', {})
    const r = new Rumbler(true, { now })
    expect(() => r.play(RUMBLE.kill, true)).not.toThrow()
  })

  it('playForPlayer cible uniquement la manette associée au playerId', () => {
    const pads = stubFourPads()
    const r = new Rumbler(true, { now })

    r.playForPlayer(2, RUMBLE.hurt, true)

    expect(pads[0]?.playEffect).not.toHaveBeenCalled()
    expect(pads[1]?.playEffect).toHaveBeenCalledOnce()
    expect(pads[2]?.playEffect).not.toHaveBeenCalled()
    expect(pads[3]?.playEffect).not.toHaveBeenCalled()
  })

  it('les throttles sont indépendants pour P1 à P4', () => {
    const pads = stubFourPads()
    const r = new Rumbler(true, { now, minGapMs: 40 })

    for (let playerId = 1; playerId <= 4; playerId++) {
      expect(r.playForPlayer(playerId, RUMBLE.kill)).toBe(true)
    }

    for (const pad of pads) {
      expect(pad.playEffect).toHaveBeenCalledOnce()
    }
    expect(r.playForPlayer(1, RUMBLE.kill)).toBe(false)
    expect(r.playForPlayer(2, RUMBLE.kill)).toBe(false)
  })

  it('supporte l’actionneur legacy hapticActuators/pulse sur la deuxième manette', () => {
    const pulse = vi.fn(() => Promise.resolve(true))
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        { index: 0, vibrationActuator: null },
        { index: 1, hapticActuators: [{ pulse }] },
      ],
    })
    const r = new Rumbler(true, { now })

    r.playForPlayer(2, RUMBLE.hurt, true)

    expect(pulse).toHaveBeenCalledWith(Math.max(RUMBLE.hurt.strong, RUMBLE.hurt.weak), RUMBLE.hurt.ms)
  })
})

/**
 * Fallback vibreur téléphone (retour playtest) : SEUL canal ressenti sans manette
 * physique connectée (`navigator.getGamepads()` est alors toujours vide). Coexiste
 * avec le canal manette (les deux tirent sur le même `play()`).
 */
describe('Rumbler — fallback navigator.vibrate (téléphone, sans manette)', () => {
  function stubVibrate(): { vibrate: ReturnType<typeof vi.fn> } {
    const vibrate = vi.fn()
    // Pas de vibrationActuator (aucune manette) — reproduit le cas « test au téléphone ».
    vi.stubGlobal('navigator', { getGamepads: () => [], vibrate })
    return { vibrate }
  }

  it('play() appelle navigator.vibrate(ms) même sans manette connectée', () => {
    const { vibrate } = stubVibrate()
    const r = new Rumbler(true, { now })
    expect(r.play(RUMBLE.hurt, true)).toBe(true)
    expect(vibrate).toHaveBeenCalledWith(RUMBLE.hurt.ms)
  })

  it('désactivé : n\'appelle jamais navigator.vibrate', () => {
    const { vibrate } = stubVibrate()
    const r = new Rumbler(false, { now })
    r.play(RUMBLE.boss, true)
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('setEnabled(false) annule une vibration en cours via vibrate(0)', () => {
    const { vibrate } = stubVibrate()
    const r = new Rumbler(true, { now })
    r.setEnabled(false)
    expect(vibrate).toHaveBeenCalledWith(0)
  })

  it('sans API Vibration (navigator.vibrate absent) : play() ne jette pas', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [] })
    const r = new Rumbler(true, { now })
    expect(() => r.play(RUMBLE.kill, true)).not.toThrow()
  })
})
