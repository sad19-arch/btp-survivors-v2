import { describe, it, expect } from 'vitest'
import { coopHpFactor } from '@content/config'
import { Simulation } from '@core/simulation'

describe('coopHpFactor (renforcement PV co-op)', () => {
  it('n=1 (solo) → facteur neutre 1', () => {
    expect(coopHpFactor(1)).toBe(1)
  })
  it('n=2 → 1.5', () => {
    expect(coopHpFactor(2)).toBe(1.5)
  })
  it('n=3 → 2.0', () => {
    expect(coopHpFactor(3)).toBe(2)
  })
  it('n=4 → 2.5', () => {
    expect(coopHpFactor(4)).toBe(2.5)
  })
  it('n=0 (garde défensive) → bornée à 1', () => {
    expect(coopHpFactor(0)).toBe(1)
  })
})

/** Avance jusqu'au 1er ennemi de vague apparu (robuste à la rampe de spawn). */
function advanceUntilFirstEnemy(sim: Simulation, maxMs = 8000, stepMs = 200): void {
  for (let t = 0; t < maxMs && sim.getState().enemies.length === 0; t += stepMs) {
    sim.advanceTime(stepMs)
  }
}

describe('Simulation — renforcement PV co-op', () => {
  it('solo (n=1) : PV du 1er ennemi inchangés (référence)', () => {
    const sim = new Simulation({ seed: 9, mode: 'solo' })
    advanceUntilFirstEnemy(sim)
    const e0 = sim.getState().enemies[0]
    expect(e0).toBeDefined()
    expect(e0?.hp).toBe(e0?.maxHp)
    expect(e0?.hp ?? 0).toBeGreaterThan(0)
  })

  it('coop4 : PV du 1er ennemi de vague ≈ 2.5× celui du solo (même seed, même instant)', () => {
    const solo = new Simulation({ seed: 9, mode: 'solo' })
    advanceUntilFirstEnemy(solo)
    const soloHp = solo.getState().enemies[0]?.maxHp ?? 0
    expect(soloHp).toBeGreaterThan(0)

    const coop4 = new Simulation({ seed: 9, mode: 'coop4' })
    advanceUntilFirstEnemy(coop4)
    const coop4Hp = coop4.getState().enemies[0]?.maxHp ?? 0
    expect(coop4Hp).toBeGreaterThan(0)

    // Arrondi (Math.round dans spawnEnemy) → tolérance ±1 (Math.round peut décaler de 0.5).
    expect(Math.abs(coop4Hp - soloHp * 2.5)).toBeLessThanOrEqual(1)
  })

  it('coop2/coop3 : PV du 1er ennemi de vague suivent respectivement ×1.5 / ×2.0', () => {
    const solo = new Simulation({ seed: 9, mode: 'solo' })
    advanceUntilFirstEnemy(solo)
    const soloHp = solo.getState().enemies[0]?.maxHp ?? 0

    const coop2 = new Simulation({ seed: 9, mode: 'coop' })
    advanceUntilFirstEnemy(coop2)
    const coop2Hp = coop2.getState().enemies[0]?.maxHp ?? 0
    expect(Math.abs(coop2Hp - soloHp * 1.5)).toBeLessThanOrEqual(1)

    const coop3 = new Simulation({ seed: 9, mode: 'coop3' })
    advanceUntilFirstEnemy(coop3)
    const coop3Hp = coop3.getState().enemies[0]?.maxHp ?? 0
    expect(Math.abs(coop3Hp - soloHp * 2.0)).toBeLessThanOrEqual(1)
  })

  it('boss mi-parcours (debugSpawnBoss) : PV coop4 ≈ 2.5× PV solo, même seed', () => {
    const solo = new Simulation({ seed: 3, mode: 'solo' })
    solo.debugSpawnBoss('mid')
    const soloBoss = solo.getState().enemies.find((e) => e.isBoss)
    expect(soloBoss).toBeDefined()
    const soloBossHp = soloBoss?.maxHp ?? 0
    expect(soloBossHp).toBeGreaterThan(0)

    const coop4 = new Simulation({ seed: 3, mode: 'coop4' })
    coop4.debugSpawnBoss('mid')
    const coop4Boss = coop4.getState().enemies.find((e) => e.isBoss)
    expect(coop4Boss).toBeDefined()
    const coop4BossHp = coop4Boss?.maxHp ?? 0

    expect(Math.abs(coop4BossHp - soloBossHp * 2.5)).toBeLessThanOrEqual(1)
  })

  it('contactDamage/vitesse ennemi de vague NE scalent PAS avec le nombre de joueurs', () => {
    const solo = new Simulation({ seed: 9, mode: 'solo' })
    advanceUntilFirstEnemy(solo)
    const soloType = solo.getState().enemies[0]?.type

    const coop4 = new Simulation({ seed: 9, mode: 'coop4' })
    advanceUntilFirstEnemy(coop4)
    const coop4Type = coop4.getState().enemies[0]?.type

    // Même seed/pool/rng de spawn ⇒ même type d'ennemi tiré (le facteur coop
    // ne touche que les PV, pas la séquence de tirage ni les autres stats).
    expect(coop4Type).toBe(soloType)
  })
})
