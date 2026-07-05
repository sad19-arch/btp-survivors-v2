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
  it('les overrides sont CUMULATIFS (le jalon persiste aux niveaux suivants)', () => {
    // Bug historique : un override ne s'appliquait qu'au niveau exact → le palier
    // s'évaporait au niveau suivant (cloueur repassait de 2 à 1 projectile).
    const base = { damage: 10, cooldownMs: 500, count: 1, area: 0, pierce: 0 }
    const lv = buildLevels(base, {}, 8, { 3: { count: 2 }, 6: { count: 3 } })
    expect(lv.map((l) => l.count)).toEqual([1, 1, 2, 2, 2, 3, 3, 3])
  })
  it('overrides cumulatifs multi-clés : le dernier jalon de CHAQUE clé gagne', () => {
    // Cas boulons : bounces montent par paliers, count s'ajoute plus tard, sans
    // que le count « efface » les bounces déjà acquis.
    const base = { damage: 10, cooldownMs: 500, count: 1, area: 0, pierce: 0, bounces: 3 }
    const lv = buildLevels(base, {}, 8, { 3: { bounces: 4 }, 5: { bounces: 5 }, 7: { count: 2 } })
    expect(lv.map((l) => l.bounces)).toEqual([3, 3, 4, 4, 5, 5, 5, 5])
    expect(lv.map((l) => l.count)).toEqual([1, 1, 1, 1, 1, 1, 2, 2])
  })
  it('armes réelles : les paliers de projectiles/lames persistent', () => {
    const cloueur = WEAPONS['cloueur']
    const scie = WEAPONS['scie']
    expect(cloueur?.levels.map((l) => l.count)).toEqual([1, 1, 2, 2, 2, 3, 3, 3])
    expect(scie?.levels.map((l) => l.count)).toEqual([2, 2, 2, 3, 3, 3, 4, 4])
  })
})
