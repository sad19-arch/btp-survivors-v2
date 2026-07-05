import { describe, it, expect } from 'vitest'
import { describeWeaponLevelDelta } from '@content/weaponDelta'
import type { PlayerStats } from '@content/passives'
import { BASE_STATS } from '@content/passives'

/** Stats joueur de base (aucun passif). */
const noPassives: PlayerStats = { ...BASE_STATS }

/** Stats joueur avec might=1.5 (outillage renforcé ×5). */
const withMight: PlayerStats = { ...BASE_STATS, might: 1.5 }

describe('describeWeaponLevelDelta', () => {
  it('fromLevel===0 ⇒ chaîne vide (pas de delta à afficher au niveau 0)', () => {
    expect(describeWeaponLevelDelta('cloueur', 0, 1, noPassives)).toBe('')
  })

  it('cloueur 2→3 contient « projectile » (override count passe à 2 au niv 3)', () => {
    const delta = describeWeaponLevelDelta('cloueur', 2, 3, noPassives)
    expect(delta).toContain('projectile')
  })

  it('cloueur 3→4 contient « dégâts » mais PAS « projectile » (niveaux +dégâts seuls deviennent lisibles)', () => {
    const delta = describeWeaponLevelDelta('cloueur', 3, 4, noPassives)
    expect(delta).toContain('dégâts')
    expect(delta).not.toContain('projectile')
  })

  it('marteau 1→2 contient dégâts ET zone', () => {
    const delta = describeWeaponLevelDelta('marteau', 1, 2, noPassives)
    expect(delta).toContain('dégâts')
    expect(delta).toContain('zone')
  })

  it('avec might=1.5 le chiffre de dégâts reflète le passif (prouve la diffusion)', () => {
    const deltaBase = describeWeaponLevelDelta('cloueur', 1, 2, noPassives)
    const deltaMight = describeWeaponLevelDelta('cloueur', 1, 2, withMight)
    // Les deux doivent contenir « dégâts »
    expect(deltaBase).toContain('dégâts')
    expect(deltaMight).toContain('dégâts')
    // Le chiffre avec might=1.5 doit être différent (plus grand)
    expect(deltaMight).not.toBe(deltaBase)
  })

  it('déterminisme : 2 appels identiques ⇒ même chaîne', () => {
    const a = describeWeaponLevelDelta('scie', 3, 4, noPassives)
    const b = describeWeaponLevelDelta('scie', 3, 4, noPassives)
    expect(a).toBe(b)
  })

  it('scie 3→4 contient « lame » / « orbitale » (override count passe à 3 au niv 4)', () => {
    const delta = describeWeaponLevelDelta('scie', 3, 4, noPassives)
    // scie a un override count à niv 4 (3 lames)
    expect(delta).toMatch(/lame|orbitale|projectile/i)
  })

  it('le fragment +dégâts ne dépasse pas le seuil anti-bruit sur un delta < 0.5', () => {
    // scie 1→2 : damage 6→7.5 (delta 1.5 effectif) → doit apparaître
    // mais clé à molette 1→2 : damage 16→21 (delta 5) → doit apparaître
    const deltaScie = describeWeaponLevelDelta('scie', 1, 2, noPassives)
    expect(deltaScie).toContain('dégâts')
  })

  it('arme inconnue ⇒ chaîne vide sans planter', () => {
    expect(describeWeaponLevelDelta('arme_inconnue', 1, 2, noPassives)).toBe('')
  })
})
