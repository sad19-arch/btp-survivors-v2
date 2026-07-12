import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { enemyAiSystem } from '@core/systems/enemyAi'
import { BEHAVIOR_TUNING } from '@content/enemies'
import type { EntityId } from '@core/types'

const BOSS_SPEED = 170

function addPlayer(w: World, x: number, y: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  return e
}

function addBoss(w: World, x: number, y: number, enraged = false): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 1800, maxHp: 1800 })
  w.add(e, 'enemy', {
    type: 'contremaitre', speed: BOSS_SPEED, isElite: true, isBoss: true,
    contactDamage: 22, xpValue: 80, behavior: 'boss', ...(enraged ? { bEnraged: true } : {})
  })
  return e
}

/** Fait avancer l'IA de `steps` pas de `dtMs` ms et renvoie la vitesse finale. */
function run(w: World, boss: EntityId, steps: number, dtMs: number): number {
  for (let i = 0; i < steps; i++) {
    enemyAiSystem(w, i * dtMs, dtMs, null)
  }
  const v = w.get(boss, 'velocity')
  return Math.hypot(v?.x ?? 0, v?.y ?? 0)
}

describe('steerBoss (machine à états chase→télégraphe→charge)', () => {
  it('démarre en chase : homing vers le joueur à sa vitesse de base', () => {
    const w = new World()
    addPlayer(w, 0, 0)
    const boss = addBoss(w, 300, 0)
    const speed = run(w, boss, 1, 16)
    const v = w.get(boss, 'velocity')
    expect(v?.x ?? 0).toBeLessThan(0) // vers le joueur (à gauche)
    expect(speed).toBeCloseTo(BOSS_SPEED, 0)
  })

  it('télégraphe (quasi-arrêt) après le cooldown de charge', () => {
    const w = new World()
    addPlayer(w, 0, 0)
    const boss = addBoss(w, 300, 0)
    const T = BEHAVIOR_TUNING.boss
    // Juste après l'expiration du cooldown → passe en mode 1 (télégraphe).
    const stepsToTelegraph = Math.ceil(T.chargeCooldownMs / 16) + 1
    const speed = run(w, boss, stepsToTelegraph, 16)
    expect(speed).toBeLessThan(BOSS_SPEED * 0.2) // quasi immobile
  })

  it('charge à chargeMult×speed après le télégraphe', () => {
    const w = new World()
    addPlayer(w, 0, 0)
    const boss = addBoss(w, 300, 0)
    const T = BEHAVIOR_TUNING.boss
    const stepsToCharge = Math.ceil((T.chargeCooldownMs + T.chargeTelegraphMs) / 16) + 1
    const speed = run(w, boss, stepsToCharge, 16)
    expect(speed).toBeCloseTo(BOSS_SPEED * T.chargeMult, 0)
  })

  it('enragé : poursuit plus vite (enrageSpeedMult) en phase chase', () => {
    const w = new World()
    addPlayer(w, 0, 0)
    const boss = addBoss(w, 300, 0, true)
    const speed = run(w, boss, 1, 16)
    expect(speed).toBeCloseTo(BOSS_SPEED * BEHAVIOR_TUNING.boss.enrageSpeedMult, 0)
  })

  it('est déterministe : deux runs identiques donnent la même trajectoire', () => {
    const trace = (): string => {
      const w = new World()
      addPlayer(w, 0, 0)
      const boss = addBoss(w, 300, 40)
      const pts: string[] = []
      for (let i = 0; i < 400; i++) {
        enemyAiSystem(w, i * 16, 16, null)
        const v = w.get(boss, 'velocity')
        pts.push(`${Math.round((v?.x ?? 0) * 100)},${Math.round((v?.y ?? 0) * 100)}`)
      }
      return pts.join('|')
    }
    expect(trace()).toEqual(trace())
  })
})
