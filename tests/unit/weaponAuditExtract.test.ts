import { describe, expect, it } from 'vitest'
import { buildWeaponAuditData } from '../../tools/weapon-audit/model'

interface AuditData {
  baseWeaponCount: number
  scenarioCount: number
  weapons: {
    id: string
    evolution: string
    levels: object[]
    evolvedLevel: object
  }[]
  assets: {
    key: string
    nativeWidth: number
    nativeHeight: number
    opaque: { width: number; height: number }
  }[]
}

describe('extracteur reproductible de l’audit des armes', () => {
  it('dérive les 12 armes et les 36 scénarios depuis les données de production', () => {
    const audit = buildWeaponAuditData() as AuditData

    expect(audit.baseWeaponCount).toBe(12)
    expect(audit.scenarioCount).toBe(36)
    expect(new Set(audit.weapons.map((weapon) => weapon.id)).size).toBe(12)
    expect(audit.weapons.every((weapon) => weapon.levels.length === 8)).toBe(true)
    expect(audit.weapons.every((weapon) => weapon.evolution.length > 0)).toBe(true)
  })

  it('mesure les vrais PNG et leurs pixels opaques', () => {
    const audit = buildWeaponAuditData() as AuditData
    const wrench = audit.assets.find((asset) => asset.key === 'proj_cle')

    expect(wrench).toEqual(expect.objectContaining({
      nativeWidth: 128,
      nativeHeight: 128,
      opaque: { width: 45, height: 78 }
    }))
    expect(audit.assets.every((asset) =>
      asset.opaque.width > 0
      && asset.opaque.height > 0
      && asset.opaque.width <= asset.nativeWidth
      && asset.opaque.height <= asset.nativeHeight
    )).toBe(true)
  })
})
