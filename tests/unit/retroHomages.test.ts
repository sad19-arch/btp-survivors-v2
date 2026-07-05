import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { Simulation } from '@core/simulation'
import { World } from '@core/world'
import { rescueSystem } from '@core/systems/rescue'
import { RESCUE, INTRO, PLAYER_BASE } from '@content/config'
import type { PlayerComp, Vec2 } from '@core/types'

/** Composant joueur minimal pour les tests de systèmes. */
const PLAYER_COMP: PlayerComp = {
  playerId: 1,
  speed: PLAYER_BASE.speed,
  vigilance: PLAYER_BASE.vigilance,
  damageMult: 1,
  cooldownMult: 1,
  pickupRadius: PLAYER_BASE.pickupRadius
}

/** Joue la séquence Konami (↑↑↓↓←→←→ B A) sur une App au titre. */
function playKonami(app: App): void {
  app.nav('up')
  app.nav('up')
  app.nav('down')
  app.nav('down')
  app.nav('left')
  app.nav('right')
  app.nav('left')
  app.nav('right')
  app.back()
  app.confirm()
}

describe('Clin d’œil — code Konami (casque doré)', () => {
  it('débloque le skin doré au titre sans lancer la partie', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    expect(app.getState().goldSkin).toBe(false)
    playKonami(app)
    const s = app.getState()
    expect(s.goldSkin).toBe(true)
    expect(s.screen).toBe('title') // la touche « valider » finale est consommée par le code
  })

  it('ne débloque rien avec une mauvaise séquence', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    for (let i = 0; i < 10; i++) {
      app.nav('up')
    }
    expect(app.getState().goldSkin).toBe(false)
  })

  it('le skin doré persiste une fois la partie lancée', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    playKonami(app)
    app.confirm() // « Jouer » → ouvre la sélection de personnage
    expect(app.getState().screen).toBe('characterSelect')
    app.confirm() // valide le perso par défaut (solo) → lance la partie
    expect(app.getState().screen).toBe('game')
    expect(app.getState().goldSkin).toBe(true)
  })
})

describe('Clin d’œil — ouvrier prisonnier', () => {
  it('expose un prisonnier non libéré à distance du centre', () => {
    const sim = new Simulation({ seed: 7, mode: 'solo' })
    const prisoners = sim.getState().prisoners
    expect(prisoners.length).toBe(1)
    expect(prisoners[0]?.freed).toBe(false)
    // pas au centre (spawn joueur) → pas d'auto-libération au départ
    const dx = (prisoners[0]?.x ?? 0) - 800
    const dy = (prisoners[0]?.y ?? 0) - 600
    expect(Math.hypot(dx, dy)).toBeGreaterThan(RESCUE.radius)
  })

  it('placement déterministe (même seed → même position)', () => {
    const a = new Simulation({ seed: 42, mode: 'solo' }).getState().prisoners[0]
    const b = new Simulation({ seed: 42, mode: 'solo' }).getState().prisoners[0]
    expect(a?.x).toBe(b?.x)
    expect(a?.y).toBe(b?.y)
  })

  it('rescueSystem : proximité → libéré + soin borné, signale la libération', () => {
    const world = new World()
    const player = world.spawn()
    world.add(player, 'position', { x: 100, y: 100 })
    world.add(player, 'health', { hp: 50, maxHp: PLAYER_BASE.hp })
    world.add(player, 'player', PLAYER_COMP)
    const prisoner = world.spawn()
    world.add(prisoner, 'position', { x: 110, y: 100 }) // à portée
    world.add(prisoner, 'prisoner', { freed: false })

    const freed: Vec2[] = []
    rescueSystem(world, freed)

    expect(world.get(prisoner, 'prisoner')?.freed).toBe(true)
    expect(world.get(player, 'health')?.hp).toBe(50 + RESCUE.heal)
    expect(freed.length).toBe(1)
    expect(freed[0]).toEqual({ x: 110, y: 100 })
  })

  it('rescueSystem : soin plafonné à maxHp', () => {
    const world = new World()
    const player = world.spawn()
    world.add(player, 'position', { x: 0, y: 0 })
    world.add(player, 'health', { hp: PLAYER_BASE.hp - 5, maxHp: PLAYER_BASE.hp })
    world.add(player, 'player', PLAYER_COMP)
    const prisoner = world.spawn()
    world.add(prisoner, 'position', { x: 0, y: 0 })
    world.add(prisoner, 'prisoner', { freed: false })

    rescueSystem(world, [])
    expect(world.get(player, 'health')?.hp).toBe(PLAYER_BASE.hp)
  })

  it('rescueSystem : hors de portée → rien', () => {
    const world = new World()
    const player = world.spawn()
    world.add(player, 'position', { x: 0, y: 0 })
    world.add(player, 'health', { hp: 100, maxHp: PLAYER_BASE.hp })
    const prisoner = world.spawn()
    world.add(prisoner, 'position', { x: RESCUE.radius + 50, y: 0 })
    world.add(prisoner, 'prisoner', { freed: false })

    const freed: Vec2[] = []
    rescueSystem(world, freed)
    expect(world.get(prisoner, 'prisoner')?.freed).toBe(false)
    expect(world.get(player, 'health')?.hp).toBe(100)
    expect(freed.length).toBe(0)
  })
})

describe('Clin d’œil — intro de run', () => {
  it('gèle la sim pendant l’intro puis la libère', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true, intro: true })
    expect(app.getState().introActive).toBe(true)

    app.advanceTime(INTRO.durationMs - 200)
    expect(app.getState().introActive).toBe(true)
    expect(app.getState().elapsedMs).toBe(0) // sim gelée

    app.advanceTime(300) // dépasse la durée d'intro
    expect(app.getState().introActive).toBe(false)

    app.advanceTime(1000)
    expect(app.getState().elapsedMs).toBeGreaterThan(0) // la sim tourne désormais
  })

  it('sans l’option intro, la sim démarre immédiatement', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    expect(app.getState().introActive).toBe(false)
    app.advanceTime(200)
    expect(app.getState().elapsedMs).toBeGreaterThan(0)
  })
})
