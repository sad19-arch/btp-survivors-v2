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

  it('circler: vise un point sur l\'anneau autour du joueur', () => {
    const { w, e } = withPlayerAndEnemy('circler', 400, 400)
    const enemy = w.get(e, 'enemy')
    expect(enemy).toBeDefined()
    if (enemy === undefined) { throw new Error('enemy component manquant') }
    enemy.bAngle = 0
    enemyAiSystem(w, 0, 16)
    const v = w.get(e, 'velocity')
    expect(v).toBeDefined()
    if (v === undefined) { throw new Error('velocity component manquant') }
    // cible ≈ (90,0) depuis (400,400) → direction majoritairement -x et -y
    expect(v.x).toBeLessThan(0)
    expect(v.y).toBeLessThan(0)
    const enemyAfter = w.get(e, 'enemy')
    expect(enemyAfter).toBeDefined()
    if (enemyAfter === undefined) { throw new Error('enemy component manquant après tick') }
    expect(enemyAfter.bAngle).not.toBe(0) // a dérivé
  })

  it('sweep: va tout droit dans bAngle, ignore le joueur', () => {
    const { w, e } = withPlayerAndEnemy('sweep', 100, 0)
    const enemy = w.get(e, 'enemy')
    expect(enemy).toBeDefined()
    if (enemy === undefined) { throw new Error('enemy component manquant') }
    enemy.bAngle = 0
    enemyAiSystem(w, 0, 16)
    const v = w.get(e, 'velocity')
    expect(v).toBeDefined()
    if (v === undefined) { throw new Error('velocity component manquant') }
    expect(v.x).toBeCloseTo(150, 5)
    expect(v.y).toBeCloseTo(0, 5)
  })

  it('sweep: ignorer le joueur — déplacer le joueur ne change pas la vel', () => {
    // Ennemi à droite du joueur (100,0), joueur à (0,0), bAngle=Math.PI/4
    const { w, e } = withPlayerAndEnemy('sweep', 100, 0)
    const enemy = w.get(e, 'enemy')
    expect(enemy).toBeDefined()
    if (enemy === undefined) { throw new Error('enemy component manquant') }
    enemy.bAngle = Math.PI / 4
    enemyAiSystem(w, 0, 16)
    const v1 = w.get(e, 'velocity')
    expect(v1).toBeDefined()
    if (v1 === undefined) { throw new Error('velocity component manquant') }
    const snap1x = v1.x
    const snap1y = v1.y
    // Déplacer le joueur très loin
    const playerPos = (() => {
      for (const pid of w.query('player', 'position')) {
        const pos = w.get(pid, 'position')
        if (pos !== undefined) { return pos }
      }
      return undefined
    })()
    expect(playerPos).toBeDefined()
    if (playerPos === undefined) { throw new Error('position joueur manquante') }
    playerPos.x = 9999
    playerPos.y = 9999
    // Reset velocity pour bien observer le recalcul
    v1.x = 0
    v1.y = 0
    enemyAiSystem(w, 0, 16)
    const v2 = w.get(e, 'velocity')
    expect(v2).toBeDefined()
    if (v2 === undefined) { throw new Error('velocity component manquant (2e tick)') }
    expect(v2.x).toBeCloseTo(snap1x, 5)
    expect(v2.y).toBeCloseTo(snap1y, 5)
  })

  it('charger: approche → télégraphe → dash → récup', () => {
    const { w, e } = withPlayerAndEnemy('charger', 200, 0)
    const en = w.get(e, 'enemy')
    expect(en).toBeDefined()
    if (en === undefined) { throw new Error('enemy component manquant') }
    // approche initiale : bMode doit valoir 0 (ou undefined → init 0)
    enemyAiSystem(w, 0, 16)
    expect(en.bMode ?? 0).toBe(0)
    // avance jusqu'au télégraphe (approachMs = 1400 ms → après 1500 ms cumulés)
    for (let t = 16; t <= 1500; t += 16) { enemyAiSystem(w, t, 16) }
    expect(en.bMode).toBe(1)
    const v = w.get(e, 'velocity')
    expect(v).toBeDefined()
    if (v === undefined) { throw new Error('velocity component manquant') }
    const vTele = Math.hypot(v.x, v.y)
    expect(vTele).toBeLessThan(150 * 0.2) // quasi-arrêt (×0.05)
    // avance jusqu'au dash (telegraphMs = 300 ms)
    for (let t = 1516; t <= 1900; t += 16) { enemyAiSystem(w, t, 16) }
    expect(en.bMode).toBe(2)
    const vDash = w.get(e, 'velocity')
    expect(vDash).toBeDefined()
    if (vDash === undefined) { throw new Error('velocity component manquant (dash)') }
    const dashSpeed = Math.hypot(vDash.x, vDash.y)
    // dashMult = 2.6 → |vel| ≈ speed * dashMult = 150 * 2.6 = 390
    expect(dashSpeed).toBeGreaterThan(150 * 2.0)
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
