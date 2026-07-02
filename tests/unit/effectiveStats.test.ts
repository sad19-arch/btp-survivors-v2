import { describe, it, expect } from 'vitest'
import { effectiveWeaponStats } from '@content/effectiveStats'
import { BASE_STATS } from '@content/passives'
import { WEAPONS, weaponStatsAtLevel } from '@content/weapons'

describe('stats effectives (arme × passifs)', () => {
  const cloueur = WEAPONS['cloueur']
  if (cloueur === undefined) {
    throw new Error('contenu invalide: arme « cloueur » manquante')
  }
  const lvl = weaponStatsAtLevel(cloueur, 1)
  it('stats de base → dégâts inchangés', () => {
    expect(effectiveWeaponStats(lvl, BASE_STATS).damage).toBe(lvl.damage)
  })
  it('might 1.5 → +50 % dégâts', () => {
    expect(effectiveWeaponStats(lvl, { ...BASE_STATS, might: 1.5 }).damage).toBeCloseTo(lvl.damage * 1.5)
  })
  it('amount +2 → count += 2', () => {
    expect(effectiveWeaponStats(lvl, { ...BASE_STATS, amount: 2 }).count).toBe(lvl.count + 2)
  })
  it('cooldown borné à 60 ms minimum', () => {
    expect(effectiveWeaponStats(lvl, { ...BASE_STATS, cooldown: 0.001 }).cooldownMs).toBe(60)
  })
})
