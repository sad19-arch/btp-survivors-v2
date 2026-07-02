import { describe, it, expect } from 'vitest'
import { WEAPONS, weaponStatsAtLevel, buildLevels } from '@content/weapons'

describe('armes — tables de niveaux (pur)', () => {
  it('les 5 armes de base + 2 évoluées existent avec maxLevel niveaux', () => {
    for (const id of ['cloueur','scie','marteau','pied_de_biche','court_circuit','mitrailleuse_clous','haute_tension']) {
      const def = WEAPONS[id]
      expect(def, id).toBeDefined()
      expect(def?.levels.length, id).toBe(def?.maxLevel)
    }
  })
  it('les dégâts croissent avec le niveau', () => {
    const d = WEAPONS['cloueur']
    expect(d).toBeDefined()
    if (d === undefined) {return}
    expect(weaponStatsAtLevel(d, 8).damage).toBeGreaterThan(weaponStatsAtLevel(d, 1).damage)
  })
  it('weaponStatsAtLevel borne aux extrêmes (0 → niv.1, >max → max)', () => {
    const d = WEAPONS['cloueur']
    expect(d).toBeDefined()
    if (d === undefined) {return}
    expect(weaponStatsAtLevel(d, 0)).toEqual(weaponStatsAtLevel(d, 1))
    expect(weaponStatsAtLevel(d, 99)).toEqual(weaponStatsAtLevel(d, d.maxLevel))
  })
  it('buildLevels applique grow + overrides', () => {
    const base = { damage: 10, cooldownMs: 500, count: 1, area: 0, pierce: 0 }
    const lv = buildLevels(base, { damage: 2 }, 3, { 3: { count: 2 } })
    expect(lv[0]?.damage).toBe(10)
    expect(lv[2]?.damage).toBe(14) // 10 + 2*2
    expect(lv[2]?.count).toBe(2)
  })
})
