import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { enemyAiSystem } from '@core/systems/enemyAi'
import { ENEMIES } from '@content/enemies'
import { spawnEnemy } from '@core/systems/spawn'
import type { EnemyBehavior, EntityId } from '@core/types'

function withPlayerAndEnemy(behavior: EnemyBehavior, ex = 100, ey = 0): { w: World; e: EntityId } {
  const w = new World()
  const p = w.spawn()
  w.add(p, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  w.add(p, 'position', { x: 0, y: 0 })
  w.add(p, 'health', { hp: 100, maxHp: 100 })
  const e = w.spawn()
  w.add(e, 'position', { x: ex, y: ey })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'enemy', {
    type: 't',
    speed: 150,
    isElite: false,
    isBoss: false,
    contactDamage: 6,
    xpValue: 5,
    behavior
  })
  return { w, e }
}

describe('enemyAiSystem — dispatch', () => {
  it('chase: vélocité vers le joueur (inchangé)', () => {
    const { w, e } = withPlayerAndEnemy('chase', 100, 0)
    enemyAiSystem(w, 0, 16)
    const v = w.get(e, 'velocity')
    expect(v).toBeDefined()
    expect(v?.x ?? 0).toBeCloseTo(-150, 5)
    expect(v?.y ?? 0).toBeCloseTo(0, 5)
  })

  it('zigzag: oscillation perpendiculaire bornée + déterministe', () => {
    const { w, e } = withPlayerAndEnemy('zigzag', 100, 0)
    const enemy = w.get(e, 'enemy')
    expect(enemy).toBeDefined()
    if (enemy === undefined) { return }
    enemy.bPhase = 0
    enemyAiSystem(w, 250, 16) // t=0.25s
    const v = w.get(e, 'velocity')
    expect(v).toBeDefined()
    if (v === undefined) { return }
    const speed = Math.hypot(v.x, v.y)
    expect(speed).toBeGreaterThan(0)
    expect(Math.abs(v.y)).toBeGreaterThan(1)          // composante perpendiculaire réelle
    expect(speed).toBeLessThanOrEqual(150 * 1.8)      // borné
    // déterministe : même elapsedMs → même résultat
    const v2x = v.x, v2y = v.y
    v.x = 0; v.y = 0
    enemyAiSystem(w, 250, 16)
    const v3 = w.get(e, 'velocity')
    expect(v3).toBeDefined()
    if (v3 === undefined) { return }
    expect(v3.x).toBeCloseTo(v2x, 6)
    expect(v3.y).toBeCloseTo(v2y, 6)
  })

  it('stub circler: délègue à chase (tâche 3 non implémentée)', () => {
    const { w, e } = withPlayerAndEnemy('circler', 100, 0)
    enemyAiSystem(w, 0, 16)
    const v = w.get(e, 'velocity')
    expect(v?.x ?? 0).toBeCloseTo(-150, 5)
    expect(v?.y ?? 0).toBeCloseTo(0, 5)
  })

  it('stub sweep: délègue à chase (tâche 4 non implémentée)', () => {
    const { w, e } = withPlayerAndEnemy('sweep', 100, 0)
    enemyAiSystem(w, 0, 16)
    const v = w.get(e, 'velocity')
    expect(v?.x ?? 0).toBeCloseTo(-150, 5)
    expect(v?.y ?? 0).toBeCloseTo(0, 5)
  })

  it('stub charger: délègue à chase (tâche 5 non implémentée)', () => {
    const { w, e } = withPlayerAndEnemy('charger', 100, 0)
    enemyAiSystem(w, 0, 16)
    const v = w.get(e, 'velocity')
    expect(v?.x ?? 0).toBeCloseTo(-150, 5)
    expect(v?.y ?? 0).toBeCloseTo(0, 5)
  })
})

describe('spawnEnemy — behavior par défaut', () => {
  it('pose behavior: chase si EnemyDef.behavior absent', () => {
    const w = new World()
    const def = ENEMIES['paperasse']
    expect(def).toBeDefined()
    if (def === undefined) {
      return
    }
    spawnEnemy(w, def, { x: 0, y: 0 })
    let found: ReturnType<typeof w.get<'enemy'>> | undefined
    for (const eid of w.query('enemy')) {
      found = w.get(eid, 'enemy')
    }
    expect(found).toBeDefined()
    expect(found?.behavior).toBe('chase')
  })

  it('init.behavior surcharge def.behavior', () => {
    const w = new World()
    const def = ENEMIES['paperasse']
    expect(def).toBeDefined()
    if (def === undefined) {
      return
    }
    spawnEnemy(w, def, { x: 0, y: 0 }, false, undefined, undefined, { behavior: 'zigzag', bPhase: 0.5 })
    let found: ReturnType<typeof w.get<'enemy'>> | undefined
    for (const eid of w.query('enemy')) {
      found = w.get(eid, 'enemy')
    }
    expect(found).toBeDefined()
    expect(found?.behavior).toBe('zigzag')
    expect(found?.bPhase).toBe(0.5)
  })
})
