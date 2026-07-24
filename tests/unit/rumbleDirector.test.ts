import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ChestOpenedEvent,
  EnemyKilledEvent,
  EvolvedEvent,
  PlayerHurtEvent,
} from '@core/events'
import { Rumbler } from '@input/rumble'
import { RumbleDirector } from '@input/rumbleDirector'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fourPads(): ReturnType<typeof vi.fn>[] {
  const effects = Array.from({ length: 4 }, () => vi.fn(() => Promise.resolve()))
  vi.stubGlobal('navigator', {
    getGamepads: () => effects.map((playEffect, index) => ({
      index,
      vibrationActuator: { playEffect },
    })),
  })
  return effects
}

describe('RumbleDirector — routage multijoueur', () => {
  it('route dégâts, kills, évolution et coffre vers leur joueur uniquement', () => {
    const effects = fourPads()
    const events = new EventTarget()
    new RumbleDirector(new Rumbler(true, { now: () => 100 }), events)

    events.dispatchEvent(new PlayerHurtEvent([2]))
    expect(effects.map((effect) => effect.mock.calls.length)).toEqual([0, 1, 0, 0])

    events.dispatchEvent(new EnemyKilledEvent(3, [{ playerId: 4, count: 3 }]))
    expect(effects.map((effect) => effect.mock.calls.length)).toEqual([0, 1, 0, 1])

    events.dispatchEvent(new EvolvedEvent('mitrailleuse_clous', 3))
    expect(effects.map((effect) => effect.mock.calls.length)).toEqual([0, 1, 1, 1])

    events.dispatchEvent(new ChestOpenedEvent('heal', 1, false))
    expect(effects.map((effect) => effect.mock.calls.length)).toEqual([1, 1, 1, 1])
  })

  it('un événement global de boss vibre volontairement les quatre manettes', () => {
    const effects = fourPads()
    const events = new EventTarget()
    new RumbleDirector(new Rumbler(true), events)

    events.dispatchEvent(new Event('bossSpawned'))

    expect(effects.map((effect) => effect.mock.calls.length)).toEqual([1, 1, 1, 1])
  })
})
