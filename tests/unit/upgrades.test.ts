import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { UPGRADES, UPGRADE_IDS, rollUpgradeChoices } from '@content/upgrades'

function makePlayer(world: World): number {
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
    pickupRadius: 90
  })
  world.add(e, 'weapons', { slots: [{ id: 'cloueur', cooldownLeftMs: 0 }] })
  return e
}

describe('UPGRADES (contenu)', () => {
  it('définit exactement 6 upgrades MVP', () => {
    expect(UPGRADE_IDS.length).toBe(6)
  })

  it('chaque upgrade a un nom et une description non vides', () => {
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id]
      expect(def).toBeDefined()
      expect((def?.name ?? '').length).toBeGreaterThan(0)
      expect((def?.description ?? '').length).toBeGreaterThan(0)
    }
  })

  it('+dégâts augmente le multiplicateur de dégâts du joueur', () => {
    const world = new World()
    const p = makePlayer(world)
    UPGRADES['degats']?.apply(world, p)
    expect(world.get(p, 'player')?.damageMult).toBeGreaterThan(1)
  })

  it('+vie augmente le HP max et soigne d’autant', () => {
    const world = new World()
    const p = makePlayer(world)
    const before = world.get(p, 'health')
    if (before !== undefined) {
      before.hp = 50
    }
    UPGRADES['vie_max']?.apply(world, p)
    const after = world.get(p, 'health')
    expect(after?.maxHp ?? 0).toBeGreaterThan(100)
    expect(after?.hp ?? 0).toBeGreaterThan(50)
  })

  it('le marteau ajoute une arme au loadout si absente', () => {
    const world = new World()
    const p = makePlayer(world)
    UPGRADES['marteau']?.apply(world, p)
    const ids = world.get(p, 'weapons')?.slots.map((s) => s.id) ?? []
    expect(ids).toContain('marteau')
  })
})

describe('rollUpgradeChoices', () => {
  it('tire le nombre demandé de choix distincts', () => {
    const rng = new Rng(42)
    const choices = rollUpgradeChoices(rng, 3)
    expect(choices.length).toBe(3)
    const ids = choices.map((c) => c.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('est déterministe à seed égale', () => {
    const a = rollUpgradeChoices(new Rng(7), 3).map((c) => c.id)
    const b = rollUpgradeChoices(new Rng(7), 3).map((c) => c.id)
    expect(a).toEqual(b)
  })

  it('renvoie des choix résolus (id+nom+description)', () => {
    const choice = rollUpgradeChoices(new Rng(1), 1)[0]
    expect(choice).toBeDefined()
    expect(choice?.name.length).toBeGreaterThan(0)
    expect(choice?.description.length).toBeGreaterThan(0)
  })
})
