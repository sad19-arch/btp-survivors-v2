import { describe, it, expect } from 'vitest'
import { WEAPONS } from '@content/weapons'
import { WEAPON_ZZFX, DEFAULT_WEAPON_ZZFX, weaponZzfx } from '@/audio/weaponSfx'

describe('weaponSfx — couverture SFX par arme', () => {
  it('CHAQUE arme de WEAPONS a un son procédural explicite', () => {
    const missing = Object.keys(WEAPONS).filter((id) => !(id in WEAPON_ZZFX))
    expect(missing, `armes sans SFX: ${missing.join(', ')}`).toEqual([])
  })

  it('chaque vecteur de params est un tableau de nombres non vide', () => {
    for (const [id, params] of Object.entries(WEAPON_ZZFX)) {
      expect(Array.isArray(params), id).toBe(true)
      expect(params.length, id).toBeGreaterThan(0)
      expect(params.every((n) => typeof n === 'number' && Number.isFinite(n)), id).toBe(true)
    }
  })

  it('weaponZzfx replie sur le défaut pour un id inconnu (jamais de silence)', () => {
    expect(weaponZzfx('arme_inexistante')).toBe(DEFAULT_WEAPON_ZZFX)
    expect(weaponZzfx('cloueur')).toBe(WEAPON_ZZFX['cloueur'])
  })
})
