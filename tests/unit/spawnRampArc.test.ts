import { describe, it, expect } from 'vitest'
import { SPAWN_RAMP, spawnParamsAt, difficultyScaleAt } from '@content/spawnRamp'

describe('arc de spawn — 22 min', () => {
  it('la rampe couvre la finale (≥ 21:30 / 1290 s)', () => {
    const last = SPAWN_RAMP.at(-1)
    expect(last).toBeDefined()
    expect(last?.fromSec).toBeGreaterThanOrEqual(1290)
  })

  it('la rampe couvre toujours 10:30 (600 s)', () => {
    const last = SPAWN_RAMP.at(-1)
    expect(last).toBeDefined()
    expect(last?.fromSec).toBeGreaterThanOrEqual(600)
  })

  it('densité forte en phase de puissance (6:00) : au moins 3/vague', () => {
    const p = spawnParamsAt(SPAWN_RAMP, 360_000)
    expect(p.countPerWave).toBeGreaterThanOrEqual(3)
  })

  it('densité croissante en milieu de run (15:00) : au moins 10/vague', () => {
    const p = spawnParamsAt(SPAWN_RAMP, 900_000)
    expect(p.countPerWave).toBeGreaterThanOrEqual(10)
  })

  it('densité forte à 19:00 : au moins 16/vague', () => {
    const p = spawnParamsAt(SPAWN_RAMP, 1140_000)
    expect(p.countPerWave).toBeGreaterThanOrEqual(16)
  })

  it('FINALE 20:00→22:00 : afflux EXTRÊME (bien plus dense qu\'à 19:00)', () => {
    const at19 = spawnParamsAt(SPAWN_RAMP, 1140_000)
    const at20 = spawnParamsAt(SPAWN_RAMP, 1_200_000) // 20:00
    const at21h30 = spawnParamsAt(SPAWN_RAMP, 1290_000) // 21:30
    // Plus d'ennemis par vague ET intervalle plus court → afflux qui sature.
    expect(at20.countPerWave).toBeGreaterThan(at19.countPerWave)
    expect(at20.intervalMs).toBeLessThan(at19.intervalMs)
    expect(at21h30.countPerWave).toBeGreaterThanOrEqual(at20.countPerWave)
    expect(at21h30.intervalMs).toBeLessThanOrEqual(at20.intervalMs)
    expect(at21h30.countPerWave).toBeGreaterThanOrEqual(30) // mur d'ennemis
  })

  it('PV : doux en puissance, montée soutenue, finale MOWABLE (pas de mur poisseux)', () => {
    const at6min  = difficultyScaleAt(360_000).hp
    const at12min = difficultyScaleAt(720_000).hp
    const at20min = difficultyScaleAt(1_200_000).hp
    const at22min = difficultyScaleAt(1_320_000).hp
    expect(at6min).toBeLessThan(2.0)          // les ennemis fondent encore
    expect(at12min).toBeGreaterThan(at6min)   // montée soutenue
    expect(at20min).toBeGreaterThan(at12min)  // monotone
    expect(at22min).toBeGreaterThan(at20min)  // monotone jusqu'au boss
    // Spectacle « power fantasy » : PV de finale restent modérés (mowables).
    expect(at22min).toBeLessThan(3.5)
  })

  it('contact plafonné à 20:00 (pas d\'insta-mort dans la horde de 700)', () => {
    const at20 = difficultyScaleAt(1_200_000).contactDamage
    const at22 = difficultyScaleAt(1_320_000).contactDamage
    expect(at22).toBe(at20) // plateau après 20:00
  })

  it('difficultyScaleAt(1_320_000) > difficultyScaleAt(600_000)', () => {
    expect(difficultyScaleAt(1_320_000).hp).toBeGreaterThan(difficultyScaleAt(600_000).hp)
  })
})
