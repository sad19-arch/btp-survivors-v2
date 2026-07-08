/**
 * Tests pour la fonction pure `evolutionStatuses`.
 * Utilise de vraies valeurs de EVOLUTIONS/WEAPONS (cloueur + air_comprime → mitrailleuse_clous).
 */

import { describe, it, expect } from 'vitest'
import { evolutionStatuses } from '@core/systems/evolution'
import { EVOLUTIONS } from '@content/evolutions'
import { WEAPONS } from '@content/weapons'

// La première évolution : cloueur (reqBaseLevel = maxLevel) + air_comprime (reqPassiveLevel = 1) → mitrailleuse_clous
const EVO = EVOLUTIONS[0]
if (EVO === undefined) {
  throw new Error('EVOLUTIONS[0] introuvable — données manquantes')
}
const CLOUEUR_MAX = WEAPONS['cloueur']?.maxLevel
if (CLOUEUR_MAX === undefined) {
  throw new Error('WEAPONS.cloueur introuvable')
}

describe('evolutionStatuses', () => {
  it('arme au max + passif requis → ready:true, hasPassive:true', () => {
    const inv = {
      weapons: [{ id: 'cloueur', level: CLOUEUR_MAX }],
      passives: [{ id: 'air_comprime', level: 1 }]
    }
    const statuses = evolutionStatuses(inv)
    expect(statuses).toHaveLength(1)
    const s = statuses[0]
    if (s === undefined) {
      throw new Error('Aucun statut retourné')
    }
    expect(s.base).toBe('cloueur')
    expect(s.evolved).toBe('mitrailleuse_clous')
    expect(s.passive).toBe('air_comprime')
    expect(s.baseLevel).toBe(CLOUEUR_MAX)
    expect(s.reqBaseLevel).toBe(EVO.reqBaseLevel)
    expect(s.hasPassive).toBe(true)
    expect(s.ready).toBe(true)
  })

  it('arme au max SANS le passif → ready:false, hasPassive:false', () => {
    const inv = {
      weapons: [{ id: 'cloueur', level: CLOUEUR_MAX }],
      passives: []
    }
    const statuses = evolutionStatuses(inv)
    expect(statuses).toHaveLength(1)
    const s = statuses[0]
    if (s === undefined) {
      throw new Error('Aucun statut retourné')
    }
    expect(s.hasPassive).toBe(false)
    expect(s.ready).toBe(false)
  })

  it('arme SOUS le max + passif présent → ready:false, hasPassive:true, baseLevel reflété', () => {
    const levelUnderMax = CLOUEUR_MAX - 1
    const inv = {
      weapons: [{ id: 'cloueur', level: levelUnderMax }],
      passives: [{ id: 'air_comprime', level: 1 }]
    }
    const statuses = evolutionStatuses(inv)
    expect(statuses).toHaveLength(1)
    const s = statuses[0]
    if (s === undefined) {
      throw new Error('Aucun statut retourné')
    }
    expect(s.hasPassive).toBe(true)
    expect(s.ready).toBe(false)
    expect(s.baseLevel).toBe(levelUnderMax)
  })

  it('arme de base non possédée → aucune entrée pour cette def', () => {
    // Joueur sans cloueur
    const inv = {
      weapons: [{ id: 'scie', level: 8 }],
      passives: [{ id: 'air_comprime', level: 1 }]
    }
    const statuses = evolutionStatuses(inv)
    // Aucun statut pour cloueur (non possédé)
    const cloueurStatus = statuses.find((s) => s.base === 'cloueur')
    expect(cloueurStatus).toBeUndefined()
  })

  it('déterminisme : deux appels sur le même inv → tableaux égaux dans l\'ordre de EVOLUTIONS', () => {
    const inv = {
      weapons: [
        { id: 'cloueur', level: CLOUEUR_MAX },
        { id: 'court_circuit', level: 8 }
      ],
      passives: [
        { id: 'air_comprime', level: 1 },
        { id: 'groupe_electrogene', level: 1 }
      ]
    }
    const first = evolutionStatuses(inv)
    const second = evolutionStatuses(inv)
    expect(first).toEqual(second)
    // Vérifier que l'ordre suit EVOLUTIONS : cloueur avant court_circuit
    const cloueurIdx = first.findIndex((s) => s.base === 'cloueur')
    const courtCircuitIdx = first.findIndex((s) => s.base === 'court_circuit')
    expect(cloueurIdx).toBeGreaterThanOrEqual(0)
    expect(courtCircuitIdx).toBeGreaterThanOrEqual(0)
    expect(cloueurIdx).toBeLessThan(courtCircuitIdx)
  })
})
