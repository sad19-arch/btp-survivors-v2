import { describe, it, expect } from 'vitest'
import {
  pickNpcLine,
  npcJobDialogues,
  npcCivilianDialogues
} from '@content/npcDialogues'

describe('npcDialogues — pools', () => {
  it('deux pools non vides, types cohérents, textes < 95 caractères', () => {
    expect(npcJobDialogues.length).toBeGreaterThan(50)
    expect(npcCivilianDialogues.length).toBeGreaterThan(50)
    for (const l of npcJobDialogues) {
      expect(l.npcType).toBe('job')
    }
    for (const l of npcCivilianDialogues) {
      expect(l.npcType).toBe('civilian')
    }
    for (const l of [...npcJobDialogues, ...npcCivilianDialogues]) {
      expect(l.text.length).toBeLessThan(95)
    }
  })

  it('ids uniques dans chaque pool', () => {
    const jobIds = new Set(npcJobDialogues.map((l) => l.id))
    expect(jobIds.size).toBe(npcJobDialogues.length)
    const civIds = new Set(npcCivilianDialogues.map((l) => l.id))
    expect(civIds.size).toBe(npcCivilianDialogues.length)
  })
})

describe('pickNpcLine — sélection', () => {
  it('renvoie une réplique du bon pool', () => {
    const line = pickNpcLine({ npcType: 'job' }, 0)
    expect(line).not.toBeNull()
    expect(line?.npcType).toBe('job')
  })

  it('priorise les répliques du stage courant', () => {
    for (let seed = 0; seed < 40; seed++) {
      const line = pickNpcLine({ npcType: 'job', stage: 'terrassement' }, seed)
      expect(line?.stages).toContain('terrassement')
    }
  })

  it('les répliques « monstre proche » n’apparaissent PAS sans ce trigger', () => {
    for (let seed = 0; seed < 200; seed++) {
      const line = pickNpcLine({ npcType: 'civilian', trigger: 'near_player' }, seed)
      expect(line?.trigger).not.toBe('monster_near')
    }
  })

  it('respecte l’anti-répétition (id récent exclu)', () => {
    const first = pickNpcLine({ npcType: 'job', stage: 'fondations' }, 3)
    expect(first).not.toBeNull()
    if (first === null) {
      return
    }
    const second = pickNpcLine(
      { npcType: 'job', stage: 'fondations', recentIds: new Set([first.id]) },
      3
    )
    expect(second?.id).not.toBe(first.id)
  })

  it('est déterministe (même requête + seed ⇒ même réplique)', () => {
    const a = pickNpcLine({ npcType: 'civilian', stage: 'finitions' }, 12345)
    const b = pickNpcLine({ npcType: 'civilian', stage: 'finitions' }, 12345)
    expect(a?.id).toBe(b?.id)
  })
})
