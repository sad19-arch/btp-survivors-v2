import { describe, it, expect } from 'vitest'
import { WEAPONS } from '@content/weapons'

describe('WEAPONS — champ description (garde-fou)', () => {
  it('toutes les armes ont une description non vide', () => {
    for (const [id, def] of Object.entries(WEAPONS)) {
      expect(def.description, `description manquante pour ${id}`).toBeDefined()
      expect(def.description.trim(), `description vide pour ${id}`).not.toBe('')
    }
  })
})

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
  it('les 5 évoluées existent, maxLevel 1, kind = celui de leur base, stats valides', () => {
    // Chaque évoluée garde le kind de son arme de base (régression silencieuse sinon).
    const EVO_KIND: Record<string, string> = {
      coulee_bitume: 'hazard',
      tempete_boulons: 'projectile',
      cle_choc: 'projectile',
      canon_mousse: 'cone',
      transpalette: 'projectile'
    }
    for (const id of EVO) {
      const w = WEAPONS[id]
      expect(w, id).toBeDefined()
      expect(w?.maxLevel, id).toBe(1)
      expect(w?.levels.length, id).toBe(1)
      expect(w?.kind, id).toBe(EVO_KIND[id])
      const lvl = w?.levels[0]
      expect(lvl?.damage, id).toBeGreaterThan(0)
      expect(lvl?.cooldownMs, id).toBeGreaterThan(0)
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
