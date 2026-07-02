import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { collisionSystem } from '@core/systems/collision'

/**
 * Vérifie que `pierce` sur un projectile fonctionne réellement à travers le
 * vrai système de collision : un projectile perforant traverse plusieurs
 * ennemis alignés sur sa trajectoire (au fil des pas), un projectile non
 * perforant s'arrête au premier.
 */

function spawnProjectile(w: World, x: number, pierce: number) {
  const e = w.spawn()
  w.add(e, 'position', { x, y: 0 })
  w.add(e, 'velocity', { x: 100, y: 0 })
  w.add(e, 'projectile', { type: 'test', damage: 10, ownerId: 1, lifeMs: 1000, radius: 6, pierce })
  return e
}

function spawnEnemy(w: World, x: number, hp = 50) {
  const e = w.spawn()
  w.add(e, 'position', { x, y: 0 })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 })
  return e
}

describe('pierce (perforation des projectiles)', () => {
  it('pierce: 0 — le projectile ne touche que le premier ennemi puis est consommé', () => {
    const w = new World()
    const proj = spawnProjectile(w, 0, 0)
    const enA = spawnEnemy(w, 0, 50) // superposé au projectile → touché immédiatement
    const enB = spawnEnemy(w, 3, 50) // à portée dès le spawn (rayon combiné 18)

    collisionSystem(w, 16)

    expect(w.get(enA, 'health')?.hp).toBe(40) // touché
    expect(w.get(enB, 'health')?.hp).toBe(50) // jamais touché : projectile consommé au 1er hit
    expect(w.alive(proj)).toBe(false) // despawné après le seul hit autorisé
  })

  it('pierce: 1 — le projectile traverse et endommage un 2e ennemi lors d’un pas suivant', () => {
    const w = new World()
    const proj = spawnProjectile(w, 0, 1)
    const enA = spawnEnemy(w, 0, 50)
    const enB = spawnEnemy(w, 20, 50) // hors de portée au 1er pas, atteint après déplacement

    // Pas 1 : touche enA, ne despawn pas (pierce encore disponible), continue sa route.
    collisionSystem(w, 16)
    expect(w.get(enA, 'health')?.hp).toBe(40)
    expect(w.alive(proj)).toBe(true)
    expect(w.get(proj, 'projectile')?.pierce).toBe(0)

    // Déplace manuellement le projectile jusqu'à portée de enB (mouvement hors périmètre du test).
    const ppos = w.get(proj, 'position')
    if (ppos !== undefined) {
      ppos.x = 20
    }

    // Pas 2 : touche enB, pierce épuisé → despawn.
    collisionSystem(w, 16)
    expect(w.get(enB, 'health')?.hp).toBe(40)
    expect(w.alive(proj)).toBe(false)

    // Bilan : DEUX ennemis endommagés au total (plus qu'un seul) grâce à pierce >= 1.
    const totalDamaged = [enA, enB].filter((e) => (w.get(e, 'health')?.hp ?? 50) < 50).length
    expect(totalDamaged).toBe(2)
  })
})
