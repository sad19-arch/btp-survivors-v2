import { describe, it, expect } from 'vitest'
import { WEAPONS } from '@content/weapons'

const BASE = ['goudron', 'boulons', 'cle_molette', 'extincteur', 'brouette']
const EVO = ['coulee_bitume', 'tempete_boulons', 'cle_choc', 'canon_mousse', 'transpalette']

describe('Armes phase A — data', () => {
  it('les 5 armes de base existent, maxLevel 8, kind valide', () => {
    const kinds = new Set(['projectile', 'orbital', 'aura', 'sweep', 'strike', 'hazard', 'cone'])
    for (const id of BASE) {
      const w = WEAPONS[id]
      expect(w, id).toBeDefined()
      expect(w?.maxLevel).toBe(8)
      expect(kinds.has(w?.kind ?? '')).toBe(true)
      expect(w?.levels.length).toBe(8)
      for (const lvl of w?.levels ?? []) {
        expect(lvl.damage).toBeGreaterThan(0)
        expect(lvl.cooldownMs).toBeGreaterThan(0)
      }
    }
  })
  it('les 5 évoluées existent, maxLevel 1', () => {
    for (const id of EVO) {
      expect(WEAPONS[id]?.maxLevel, id).toBe(1)
      expect(WEAPONS[id]?.levels.length).toBe(1)
    }
  })
  it('goudron=hazard, extincteur=cone, boulons/cle/brouette=projectile', () => {
    expect(WEAPONS['goudron']?.kind).toBe('hazard')
    expect(WEAPONS['extincteur']?.kind).toBe('cone')
    expect(WEAPONS['boulons']?.kind).toBe('projectile')
    expect(WEAPONS['cle_molette']?.kind).toBe('projectile')
    expect(WEAPONS['brouette']?.kind).toBe('projectile')
  })
})
