import { describe, it, expect } from 'vitest'
import { PASSIVES, aggregatePassives } from '@content/passives'
import { eligibleCards } from '@core/systems/cards'
import { World } from '@core/world'
import { pickupSystem } from '@core/systems/pickup'
import { HITBOX, PICKUP } from '@content/config'
import type { PlayerStats } from '@content/passives'

// ---------------------------------------------------------------------------
// Passifs phase A — aimant_chantier / batterie_18v / prime_rendement
// ---------------------------------------------------------------------------

describe('Passifs phase A', () => {
  it('aimant/batterie/prime existent avec les bonnes stats', () => {
    expect(PASSIVES['aimant_chantier']?.perLevel.magnet).toBeCloseTo(0.07)
    expect(PASSIVES['batterie_18v']?.perLevel.duration).toBeCloseTo(0.12)
    expect(PASSIVES['prime_rendement']?.perLevel.growth).toBeCloseTo(0.05)
  })

  it('aimant/batterie/prime ont maxLevel 5', () => {
    expect(PASSIVES['aimant_chantier']?.maxLevel).toBe(5)
    expect(PASSIVES['batterie_18v']?.maxLevel).toBe(5)
    expect(PASSIVES['prime_rendement']?.maxLevel).toBe(5)
  })

  it('aggregatePassives applique magnet (aimant niv.2 → 1 + 2×0.07 = 1.14)', () => {
    expect(aggregatePassives([{ id: 'aimant_chantier', level: 2 }]).magnet).toBeCloseTo(1.14)
  })

  it('aggregatePassives sans passif → growth = 1 (défaut inchangé)', () => {
    expect(aggregatePassives([]).growth).toBe(1)
  })

  it('aggregatePassives applique growth (prime niv.3 → 1 + 3×0.05 = 1.15)', () => {
    expect(aggregatePassives([{ id: 'prime_rendement', level: 3 }]).growth).toBeCloseTo(1.15)
  })

  it('les 3 nouveaux passifs sont proposables comme passive-new (cardDiscoverable)', () => {
    // inventaire vide → tous les passifs doivent apparaître comme passive-new
    const cards = eligibleCards({ weapons: [], passives: [] })
    const passiveNewIds = cards
      .filter(c => c.kind === 'passive-new')
      .map(c => c.id)
    expect(passiveNewIds).toContain('aimant_chantier')
    expect(passiveNewIds).toContain('batterie_18v')
    expect(passiveNewIds).toContain('prime_rendement')
  })
})

// ---------------------------------------------------------------------------
// Câblage growth → gain d'XP au ramassage
// ---------------------------------------------------------------------------

const COLLECT_X = HITBOX.player + PICKUP.collectRadius - 1

/** Crée un joueur avec un stats.growth donné. */
function makePlayerWithGrowth(world: World, growth: number): number {
  const e = world.spawn()
  world.add(e, 'position', { x: 0, y: 0 })
  world.add(e, 'velocity', { x: 0, y: 0 })
  world.add(e, 'health', { hp: 100, maxHp: 100 })
  world.add(e, 'player', {
    playerId: 1,
    speed: 200,
    vigilance: 100,
    damageMult: 1,
    cooldownMult: 1,
    pickupRadius: 200,
  })
  world.add(e, 'progress', { xp: 0, level: 1, nextThreshold: 25 })
  // Injecte les stats avec le growth désiré (simulant recomputePlayerStats)
  const stats: PlayerStats = {
    might: 1, area: 1, amount: 0, cooldown: 1, duration: 1,
    projectileSpeed: 1, moveSpeed: 1, maxHp: 1, recovery: 0, magnet: 1,
    growth,
  }
  world.add(e, 'stats', stats)
  return e
}

describe('pickupSystem — câblage growth (XP)', () => {
  it('growth = 1 → XP créditée = valeur exacte (run par défaut inchangé)', () => {
    const world = new World()
    const player = makePlayerWithGrowth(world, 1)
    const gem = world.spawn()
    world.add(gem, 'position', { x: COLLECT_X, y: 0 })
    world.add(gem, 'pickup', { type: 'xp', value: 10 })
    pickupSystem(world, 16)
    expect(world.get(player, 'progress')?.xp).toBe(10)
  })

  it('growth = 1.5 → XP créditée = round(valeur × 1.5)', () => {
    const world = new World()
    const player = makePlayerWithGrowth(world, 1.5)
    const gem = world.spawn()
    world.add(gem, 'position', { x: COLLECT_X, y: 0 })
    world.add(gem, 'pickup', { type: 'xp', value: 10 })
    pickupSystem(world, 16)
    expect(world.get(player, 'progress')?.xp).toBe(15) // Math.round(10 * 1.5)
  })

  it('growth = 1.3 → XP créditée = round(valeur × 1.3)', () => {
    const world = new World()
    const player = makePlayerWithGrowth(world, 1.3)
    const gem = world.spawn()
    world.add(gem, 'position', { x: COLLECT_X, y: 0 })
    world.add(gem, 'pickup', { type: 'xp', value: 7 })
    pickupSystem(world, 16)
    expect(world.get(player, 'progress')?.xp).toBe(Math.round(7 * 1.3))
  })

  it('sans composant stats → XP créditée = valeur brute (défaut × 1)', () => {
    // Joueur sans stats (cas des vieux tests — régression)
    const world = new World()
    const e = world.spawn()
    world.add(e, 'position', { x: 0, y: 0 })
    world.add(e, 'velocity', { x: 0, y: 0 })
    world.add(e, 'health', { hp: 100, maxHp: 100 })
    world.add(e, 'player', {
      playerId: 1, speed: 200, vigilance: 100,
      damageMult: 1, cooldownMult: 1, pickupRadius: 200,
    })
    world.add(e, 'progress', { xp: 0, level: 1, nextThreshold: 25 })
    // Pas de world.add(e, 'stats', ...) → fallback growth = 1
    const gem = world.spawn()
    world.add(gem, 'position', { x: COLLECT_X, y: 0 })
    world.add(gem, 'pickup', { type: 'xp', value: 5 })
    pickupSystem(world, 16)
    expect(world.get(e, 'progress')?.xp).toBe(5)
  })
})
