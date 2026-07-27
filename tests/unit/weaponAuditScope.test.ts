import { describe, expect, it } from 'vitest'
import { classifyWeaponAuditScope } from '../../tools/weapon-audit/scope'

describe('périmètre isolé de la tranche armes', () => {
  it('sépare explicitement les changements protégés du travail sur les armes', () => {
    const result = classifyWeaponAuditScope([
      'src/core/systems/weapon.ts',
      'src/content/layouts/terrain_vierge.json',
      'src/content/passives.ts',
      'tests/e2e/weaponAuditMatrix.spec.ts'
    ])

    expect(result.weaponFiles).toEqual([
      'src/core/systems/weapon.ts',
      'tests/e2e/weaponAuditMatrix.spec.ts'
    ])
    expect(result.protectedUnrelatedFiles).toEqual([
      'src/content/layouts/terrain_vierge.json',
      'src/content/passives.ts'
    ])
    expect(result.unclassifiedFiles).toEqual([])
  })

  it('signale tout fichier inconnu au lieu de l’embarquer silencieusement', () => {
    const result = classifyWeaponAuditScope(['notes/inconnues.md'])

    expect(result.weaponFiles).toEqual([])
    expect(result.unclassifiedFiles).toEqual(['notes/inconnues.md'])
  })
})
