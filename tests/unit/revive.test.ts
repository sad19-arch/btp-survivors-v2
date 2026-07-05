import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { reviveSystem } from '@core/systems/revive'
import { REVIVE } from '@content/config'
import type { PlayerComp, PlayerInput } from '@core/types'

const PLAYER: PlayerComp = {
  playerId: 1,
  speed: 200,
  vigilance: 100,
  damageMult: 1,
  cooldownMult: 1,
  pickupRadius: 90
}

function makePlayer(w: World, id: number, x: number, y: number, hp: number, maxHp = 100): number {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp })
  w.add(e, 'player', { ...PLAYER, playerId: id })
  return e
}

const STEP_MS = 100

function inputs(entries: [number, PlayerInput][]): Map<number, PlayerInput> {
  return new Map(entries)
}

const HOLD: PlayerInput = { move: { x: 0, y: 0 }, attack: false, action: true }
const IDLE: PlayerInput = { move: { x: 0, y: 0 }, attack: false, action: false }

describe('reviveSystem (fonction pure)', () => {
  it('releveur vivant à portée tenant action → le progrès monte au fil des pas', () => {
    const w = new World()
    const downed = makePlayer(w, 1, 0, 0, 0, 100)
    makePlayer(w, 2, 40, 0, 100, 100) // à portée (<80)

    reviveSystem(w, inputs([[2, HOLD]]), STEP_MS)
    const rev1 = w.get(downed, 'revive')
    expect(rev1?.progress).toBeGreaterThan(0)

    for (let i = 0; i < 30; i++) {
      reviveSystem(w, inputs([[2, HOLD]]), STEP_MS)
    }

    const health = w.get(downed, 'health')
    expect(health?.hp).toBeCloseTo(100 * REVIVE.hpFraction)
    // Relève complétée → composant retiré.
    expect(w.has(downed, 'revive')).toBe(false)
  })

  it('hors de portée : le composant revive existe mais ne progresse jamais, décroît vers 0', () => {
    const w = new World()
    const downed = makePlayer(w, 1, 0, 0, 0, 100)
    makePlayer(w, 2, 1000, 0, 100, 100) // hors portée (>80)

    reviveSystem(w, inputs([[2, HOLD]]), STEP_MS)
    expect(w.get(downed, 'revive')?.progress).toBe(0)

    const health = w.get(downed, 'health')
    expect(health?.hp).toBe(0)
    expect(w.has(downed, 'revive')).toBe(true)
  })

  it('à portée mais action relâchée : le progrès décroît vers 0 sans repasser sous 0', () => {
    const w = new World()
    const downed = makePlayer(w, 1, 0, 0, 0, 100)
    makePlayer(w, 2, 40, 0, 100, 100)

    // Monte un peu le progrès en tenant l'action.
    reviveSystem(w, inputs([[2, HOLD]]), STEP_MS)
    reviveSystem(w, inputs([[2, HOLD]]), STEP_MS)
    const before = w.get(downed, 'revive')?.progress ?? 0
    expect(before).toBeGreaterThan(0)

    // Relâche l'action : décroît.
    for (let i = 0; i < 50; i++) {
      reviveSystem(w, inputs([[2, IDLE]]), STEP_MS)
    }
    expect(w.get(downed, 'revive')?.progress).toBe(0)
    expect(w.get(downed, 'health')?.hp).toBe(0) // toujours à terre
  })

  it('solo (aucun coéquipier) : jamais relevé, le joueur reste à terre indéfiniment', () => {
    const w = new World()
    const downed = makePlayer(w, 1, 0, 0, 0, 100)

    for (let i = 0; i < 100; i++) {
      reviveSystem(w, inputs([]), STEP_MS)
    }

    expect(w.get(downed, 'health')?.hp).toBe(0)
    // Un composant revive à progrès 0 est créé (suivi), mais jamais complété.
    expect(w.get(downed, 'revive')?.progress ?? 0).toBe(0)
  })

  it('un joueur vivant ne porte jamais de composant revive', () => {
    const w = new World()
    const alive = makePlayer(w, 1, 0, 0, 100, 100)
    makePlayer(w, 2, 40, 0, 100, 100)

    reviveSystem(w, inputs([[2, HOLD]]), STEP_MS)

    expect(w.has(alive, 'revive')).toBe(false)
  })

  it('un joueur vivant qui portait un revive résiduel (relevé au pas précédent) le perd', () => {
    const w = new World()
    const e = makePlayer(w, 1, 0, 0, 100, 100)
    w.add(e, 'revive', { progress: 0.5 }) // résidu artificiel (ne devrait pas arriver en pratique)

    reviveSystem(w, inputs([]), STEP_MS)

    expect(w.has(e, 'revive')).toBe(false)
  })

  it('un releveur À TERRE lui-même ne compte pas, même s’il "tient action" à portée', () => {
    const w = new World()
    const downed = makePlayer(w, 1, 0, 0, 0, 100)
    makePlayer(w, 2, 40, 0, 0, 100) // aussi à terre !

    reviveSystem(w, inputs([[2, HOLD]]), STEP_MS)

    expect(w.get(downed, 'revive')?.progress).toBe(0)
  })

  it('gate par le BON releveur : un 3e joueur hors-portée qui tient action n’aide pas un autre binôme', () => {
    const w = new World()
    const downed = makePlayer(w, 1, 0, 0, 0, 100)
    makePlayer(w, 2, 1000, 0, 100, 100) // hors portée, tient action
    makePlayer(w, 3, 40, 0, 100, 100) // à portée, ne tient PAS action

    reviveSystem(w, inputs([[2, HOLD], [3, IDLE]]), STEP_MS)

    expect(w.get(downed, 'revive')?.progress).toBe(0)
  })
})
