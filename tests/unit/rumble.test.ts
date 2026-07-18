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
    const [type, params] = playEffect.mock.calls[0] ?? []
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
})
