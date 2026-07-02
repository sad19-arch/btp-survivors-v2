import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { tryEvolve } from '@core/systems/evolution'

function setup(weapons: { id: string; level: number }[], passives: { id: string; level: number }[]) {
  const w = new World()
  const e = w.spawn()
  w.add(e, 'weapons', { slots: weapons.map(x => ({ ...x, cooldownLeftMs: 0 })) })
  w.add(e, 'passives', { list: passives })
  return { w, e }
}

describe('tryEvolve', () => {
  it('cloueur max + air comprimé → mitrailleuse_clous', () => {
    const { w, e } = setup([{ id: 'cloueur', level: 8 }], [{ id: 'air_comprime', level: 2 }])
    expect(tryEvolve(w, e)).toBe('mitrailleuse_clous')
    const weapons = w.get(e, 'weapons')
    expect(weapons).toBeDefined()
    const slot0 = weapons?.slots[0]
    expect(slot0?.id).toBe('mitrailleuse_clous')
  })
  it('cloueur pas au max → pas d\'évolution', () => {
    const { w, e } = setup([{ id: 'cloueur', level: 7 }], [{ id: 'air_comprime', level: 1 }])
    expect(tryEvolve(w, e)).toBeNull()
  })
})
