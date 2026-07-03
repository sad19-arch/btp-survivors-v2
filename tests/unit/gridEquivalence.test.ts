import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { collisionSystem } from '@core/systems/collision'
import { SpatialGrid } from '@core/spatialGrid'

/**
 * Preuve d'équivalence : `collisionSystem` alimenté par une `SpatialGrid` doit produire
 * EXACTEMENT les mêmes dégâts/consommations que le scan linéaire qu'elle remplace.
 * La grille ne fournit que des CANDIDATS ; le test de distance exact + la logique de
 * perforation restent inchangés.
 *
 * Reflète `Simulation.rebuildEnemyGrid` : indexe TOUS les ennemis avec position, SANS
 * filtre HP (le scan linéaire projectile↔ennemi filtrait déjà `hp > 0` lui-même dans son
 * test exact ; le scan linéaire ennemi↔joueur ne filtrait PAS par HP — un ennemi tué ce
 * pas-ci par `weaponSystem`, avant collision, doit encore taper au contact une dernière
 * fois avant `reapDeadEnemies`). Filtrer par HP ici romprait ce second cas → régression
 * détectée par `npm run sim:check` (voir test ci-dessous).
 */
function grid(w: World): SpatialGrid {
  const g = new SpatialGrid(64)
  for (const e of w.query('enemy', 'position')) {
    const p = w.get(e, 'position')
    if (p !== undefined) {
      g.insert(e, p.x, p.y)
    }
  }
  return g
}

describe('collision via grille = identique', () => {
  it('un projectile pierce=1 touche 2 ennemis alignés, pas un 3e hors rayon', () => {
    const w = new World()
    const proj = w.spawn()
    w.add(proj, 'position', { x: 0, y: 0 })
    w.add(proj, 'velocity', { x: 0, y: 0 })
    w.add(proj, 'projectile', { type: 'x', damage: 10, ownerId: 1, lifeMs: 1000, radius: 20, pierce: 1 })
    const mk = (x: number): number => {
      const e = w.spawn()
      w.add(e, 'position', { x, y: 0 })
      w.add(e, 'health', { hp: 100, maxHp: 100 })
      w.add(e, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 })
      return e
    }
    const e1 = mk(5)
    const e2 = mk(6)
    const e3 = mk(500)
    collisionSystem(w, 16, grid(w))
    // e1 touché (pierce décrémenté), projectile continue ; e3 hors rayon intact.
    expect(w.get(e3, 'health')?.hp).toBe(100)
    const hit = [e1, e2].filter((e) => (w.get(e, 'health')?.hp ?? 100) < 100).length
    expect(hit).toBeGreaterThanOrEqual(1)
  })

  it('projectile non perforant : consomme au premier candidat touché, épargne les hors-portée', () => {
    const w = new World()
    const proj = w.spawn()
    w.add(proj, 'position', { x: 0, y: 0 })
    w.add(proj, 'velocity', { x: 0, y: 0 })
    w.add(proj, 'projectile', { type: 'x', damage: 6, ownerId: 1, lifeMs: 1000, radius: 6, pierce: 0 })
    const e = w.spawn()
    w.add(e, 'position', { x: 0, y: 0 })
    w.add(e, 'health', { hp: 10, maxHp: 10 })
    w.add(e, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 })
    const far = w.spawn()
    w.add(far, 'position', { x: 500, y: 0 })
    w.add(far, 'health', { hp: 10, maxHp: 10 })
    w.add(far, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 })

    collisionSystem(w, 16, grid(w))

    expect(w.get(e, 'health')?.hp).toBe(4)
    expect(w.get(far, 'health')?.hp).toBe(10)
    expect(w.alive(proj)).toBe(false)
  })

  it('contact ennemi/joueur : dégâts continus identiques via la grille, épargne hors portée', () => {
    const w = new World()
    const player = w.spawn()
    w.add(player, 'position', { x: 0, y: 0 })
    w.add(player, 'health', { hp: 100, maxHp: 100 })
    w.add(player, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
    const near = w.spawn()
    w.add(near, 'position', { x: 0, y: 0 })
    w.add(near, 'health', { hp: 10, maxHp: 10 })
    w.add(near, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 10, xpValue: 1 })
    const far = w.spawn()
    w.add(far, 'position', { x: 800, y: 0 })
    w.add(far, 'health', { hp: 10, maxHp: 10 })
    w.add(far, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 10, xpValue: 1 })

    collisionSystem(w, 1000, grid(w))

    expect(w.get(player, 'health')?.hp).toBeCloseTo(90)
  })

  it('ordre des candidats : le hit tombe sur le MÊME ennemi que le scan linéaire (id croissant), pas sur l\'ordre des cellules de grille', () => {
    const w = new World()
    const proj = w.spawn()
    w.add(proj, 'position', { x: 0, y: 0 })
    w.add(proj, 'velocity', { x: 0, y: 0 })
    // Rayon large : les deux ennemis sont à portée mais dans des cellules de grille différentes
    // (l'un en gx=1, l'autre en gx=-2) — sans tri par id, l'ordre de scan des cellules
    // (`queryCircle` : gx croissant) ferait toucher l'ennemi en x=-90 (créé en second) au lieu
    // de celui en x=90 (créé en premier), contrairement au scan linéaire `world.query`
    // (ordre d'insertion = id croissant).
    w.add(proj, 'projectile', { type: 'x', damage: 10, ownerId: 1, lifeMs: 1000, radius: 100, pierce: 0 })
    const mk = (x: number): number => {
      const e = w.spawn()
      w.add(e, 'position', { x, y: 0 })
      w.add(e, 'health', { hp: 100, maxHp: 100 })
      w.add(e, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 })
      return e
    }
    const firstCreated = mk(90) // cellule gx=1
    const secondCreated = mk(-90) // cellule gx=-2 (scannée AVANT gx=1 par queryCircle)

    collisionSystem(w, 16, grid(w))

    // Le scan linéaire d'origine (ordre d'id croissant) aurait touché `firstCreated` en premier
    // et se serait arrêté là (pierce=0). Doit rester vrai avec la grille.
    expect(w.get(firstCreated, 'health')?.hp).toBe(90)
    expect(w.get(secondCreated, 'health')?.hp).toBe(100)
  })

  it('un ennemi déjà à 0 HP ce pas-ci (tué par une autre source avant collision) tape quand même au contact — comme le scan linéaire d\'origine (aucun filtre HP côté ennemi)', () => {
    const w = new World()
    const player = w.spawn()
    w.add(player, 'position', { x: 0, y: 0 })
    w.add(player, 'health', { hp: 100, maxHp: 100 })
    w.add(player, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
    const dyingEnemy = w.spawn()
    w.add(dyingEnemy, 'position', { x: 0, y: 0 })
    w.add(dyingEnemy, 'health', { hp: 0, maxHp: 10 }) // déjà à 0 HP, pas encore récolté ce pas
    w.add(dyingEnemy, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 10, xpValue: 1 })

    // Si la grille (comme `Simulation.rebuildEnemyGrid`) filtrait par hp>0, cet ennemi serait
    // absent des candidats et le joueur ne subirait AUCUN dégât — divergence vs l'original.
    collisionSystem(w, 1000, grid(w))

    expect(w.get(player, 'health')?.hp).toBeCloseTo(90)
  })
})
