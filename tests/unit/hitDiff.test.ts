import { describe, it, expect } from 'vitest'
import { computeHitEvents } from '../../src/render/hitDiff'
import type { EnemyState } from '../../src/core/types'

function enemy(id: number, hp: number, extra: Partial<EnemyState> = {}): EnemyState {
  return { id, hp, maxHp: 20, type: 'fast', x: 0, y: 0, isElite: false, isBoss: false, ...extra }
}

describe('computeHitEvents', () => {
  it('détecte une perte de PV (20→14 = amount 6)', () => {
    const prev = new Map([[1, 20]])
    const events = computeHitEvents(prev, [enemy(1, 14)])
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ id: 1, amount: 6 })
  })

  it('ennemi nouveau (absent de prev) ⇒ aucun événement', () => {
    const prev = new Map<number, number>()
    const events = computeHitEvents(prev, [enemy(42, 10)])
    expect(events).toHaveLength(0)
  })

  it('ennemi inchangé (même hp) ⇒ aucun événement', () => {
    const prev = new Map([[7, 15]])
    const events = computeHitEvents(prev, [enemy(7, 15)])
    expect(events).toHaveLength(0)
  })

  it('hp qui monte (regen) ⇒ aucun événement', () => {
    const prev = new Map([[3, 10]])
    const events = computeHitEvents(prev, [enemy(3, 12)])
    expect(events).toHaveLength(0)
  })

  it('plusieurs ennemis mélangés : seul celui touché produit un événement', () => {
    const prev = new Map([[1, 20], [2, 20], [3, 20]])
    const events = computeHitEvents(prev, [
      enemy(1, 20),  // inchangé
      enemy(2, 14),  // touché → 6
      enemy(3, 20),  // inchangé
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ id: 2, amount: 6 })
  })
})
