import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { reapDeadEnemies, countActivePickupsOfKind } from '@core/systems/reap'
import { PICKUP } from '@content/config'

/**
 * Plafond du pickup de soin (retour playtest, surnommé « sandwich » par le user :
 * sprite 64px de casse-croûte, cf. `hordeRenderer.ts`). Sans `lifeMs`, un soin non
 * ramassé reste au sol indéfiniment — sans plafond, il s'accumule sans borne.
 * Même patron de garde-fou que `CHEST.maxActive` ([chestDirector.test.ts]).
 */

/** Force `Rng.chance(p)` à toujours réussir (`next()` fixé à 0), pour forcer le tirage 'heal'. */
class AlwaysRng extends Rng {
  next(): number {
    return 0
  }
}

function addDeadEnemy(w: World, x: number): void {
  const e = w.spawn()
  w.add(e, 'position', { x, y: 0 })
  w.add(e, 'health', { hp: 0, maxHp: 18 })
  w.add(e, 'enemy', {
    type: 'paperasse',
    speed: 50,
    isElite: false,
    isBoss: false,
    contactDamage: 1,
    xpValue: 5
  })
}

describe('plafond pickup de soin (« sandwich ») — countActivePickupsOfKind', () => {
  it('compte exactement les pickups du kind demandé', () => {
    const world = new World()
    const e1 = world.spawn()
    world.add(e1, 'position', { x: 0, y: 0 })
    world.add(e1, 'pickup', { type: 'heal', value: 18 })
    const e2 = world.spawn()
    world.add(e2, 'position', { x: 0, y: 0 })
    world.add(e2, 'pickup', { type: 'xp', value: 5, lifeMs: 10000 })
    expect(countActivePickupsOfKind(world, 'heal')).toBe(1)
    expect(countActivePickupsOfKind(world, 'xp')).toBe(1)
    expect(countActivePickupsOfKind(world, 'magnet')).toBe(0)
  })
})

describe('plafond pickup de soin (« sandwich ») — reapDeadEnemies', () => {
  it('ne dépasse JAMAIS PICKUP.healMaxActive, même avec un tirage 100% favorable', () => {
    const world = new World()
    // Tue 3× plus d'ennemis que le plafond, tirage 'heal' TOUJOURS gagnant.
    const n = PICKUP.healMaxActive * 3
    for (let i = 0; i < n; i++) {
      addDeadEnemy(world, i * 20)
    }
    const rng = new AlwaysRng(1)
    reapDeadEnemies(world, rng)
    expect(countActivePickupsOfKind(world, 'heal')).toBe(PICKUP.healMaxActive)
  })

  it('sous le plafond, chaque tirage gagnant dépose bien un soin', () => {
    const world = new World()
    const n = PICKUP.healMaxActive - 1
    for (let i = 0; i < n; i++) {
      addDeadEnemy(world, i * 20)
    }
    const rng = new AlwaysRng(1)
    reapDeadEnemies(world, rng)
    expect(countActivePickupsOfKind(world, 'heal')).toBe(n)
  })
})
