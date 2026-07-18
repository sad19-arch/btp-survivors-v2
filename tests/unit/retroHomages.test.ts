import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { Simulation } from '@core/simulation'
import { World } from '@core/world'
import { rescueSystem, type EnragedFreed } from '@core/systems/rescue'
import { RESCUE, INTRO, PLAYER_BASE } from '@content/config'
import { ConstructionPhaseId } from '@content/phases'
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

/**
 * Le code Konami active désormais le MODE CARNAGE, plus le casque doré (brief §17).
 * Le casque n'est pas supprimé pour autant : sa machinerie de rendu est intacte et
 * attend un nouveau déclencheur (`debugUnlockGold` l'exerce en attendant).
 */
describe('Clin d’œil — code Konami (Mode Carnage)', () => {
  it('active le Mode Carnage au titre sans lancer la partie', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    expect(app.getState().carnage).toBe(false)
    playKonami(app)
    const s = app.getState()
    expect(s.carnage).toBe(true)
    expect(s.screen).toBe('title') // la touche « valider » finale est consommée par le code
  })

  it('rejouer le code DÉSACTIVE le mode (c’est une bascule)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    playKonami(app)
    expect(app.getState().carnage).toBe(true)
    playKonami(app)
    expect(app.getState().carnage).toBe(false)
  })

  it('ne déclenche rien avec une mauvaise séquence', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    for (let i = 0; i < 10; i++) {
      app.nav('up')
    }
    expect(app.getState().carnage).toBe(false)
  })

  it('ne donne PLUS le casque doré (l’ancien effet est débranché)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    playKonami(app)
    expect(app.getState().goldSkin).toBe(false)
  })

  it('le mode persiste une fois la partie lancée', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    playKonami(app)
    app.confirm() // « Jouer » → ouvre la sélection de personnage
    expect(app.getState().screen).toBe('characterSelect')
    app.confirm() // valide le perso par défaut (solo) → lance la partie
    expect(app.getState().screen).toBe('game')
    expect(app.getState().carnage).toBe(true)
  })
})

describe('Casque doré — en attente d’un déclencheur', () => {
  it('reste verrouillé par défaut, et son déblocage traverse la partie', () => {
    // Garde la chaîne de rendu du skin doré vivante et testable tant qu'aucun
    // déclencheur de jeu ne la rallume — sinon ce serait du code mort.
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    expect(app.getState().goldSkin).toBe(false)
    app.debugUnlockGold()
    expect(app.getState().goldSkin).toBe(true)
    app.confirm()
    app.confirm()
    expect(app.getState().screen).toBe('game')
    expect(app.getState().goldSkin).toBe(true)
  })
})

describe('Clin d’œil — ouvrier prisonnier', () => {
  it('expose des prisonniers non libérés à distance du centre', () => {
    // Stage SANS compo → placement procédural (terrain_vierge est désormais
    // compo-contrôlé, cf. siteLayoutPrisoners.test.ts).
    const sim = new Simulation({ seed: 7, mode: 'solo', phaseId: ConstructionPhaseId.TERRASSEMENT })
    const prisoners = sim.getState().prisoners
    expect(prisoners.length).toBe(5)
    // tous non libérés au départ
    for (const p of prisoners) {
      expect(p.freed).toBe(false)
    }
    // pas au centre (spawn joueur) → pas d'auto-libération au départ
    const cx = 5120, cy = 3840
    for (const p of prisoners) {
      expect(Math.hypot((p.x) - cx, (p.y) - cy)).toBeGreaterThan(RESCUE.radius)
    }
  })

  it('placement déterministe (même seed → même positions)', () => {
    const a = new Simulation({ seed: 42, mode: 'solo', phaseId: ConstructionPhaseId.TERRASSEMENT }).getState().prisoners
    const b = new Simulation({ seed: 42, mode: 'solo', phaseId: ConstructionPhaseId.TERRASSEMENT }).getState().prisoners
    expect(a.length).toBe(5)
    expect(a).toEqual(b)
  })

  it('rescueSystem : proximité → libéré + soin borné + devient allié enragé', () => {
    const world = new World()
    const player = world.spawn()
    world.add(player, 'position', { x: 100, y: 100 })
    world.add(player, 'health', { hp: 50, maxHp: PLAYER_BASE.hp })
    world.add(player, 'player', PLAYER_COMP)
    const prisoner = world.spawn()
    world.add(prisoner, 'position', { x: 110, y: 100 }) // à portée
    world.add(prisoner, 'prisoner', { freed: false })

    const enraged: EnragedFreed[] = []
    const thanked: Vec2[] = []
    rescueSystem(world, enraged, thanked)

    expect(world.get(prisoner, 'prisoner')?.freed).toBe(true)
    expect(world.get(player, 'health')?.hp).toBe(50 + Math.round(PLAYER_BASE.hp * RESCUE.healFraction))
    // Le libéré devient un allié enragé (owner = le sauveteur), signalé dans `enraged`.
    expect(enraged).toEqual([{ x: 110, y: 100, playerId: PLAYER_COMP.playerId }])
    expect(thanked.length).toBe(0)
    expect(world.get(prisoner, 'ally')).toBeDefined()
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

    rescueSystem(world, [], [])
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

    const enraged: EnragedFreed[] = []
    rescueSystem(world, enraged, [])
    expect(world.get(prisoner, 'prisoner')?.freed).toBe(false)
    expect(world.get(player, 'health')?.hp).toBe(100)
    expect(enraged.length).toBe(0)
  })
})

describe('Clin d’œil — intro de run', () => {
  it('gèle la sim pendant l’intro puis la libère', () => {
    // Stage AVEC script de montage (terrassement) → gel long `stageCinematicMs` ;
    // un stage sans script retomberait sur le préambule court `durationMs`
    // (cf. `introDurationFor`) et cette durée-ci ne s'appliquerait pas.
    const app = new App({ seed: 1, mode: 'solo', autostart: true, intro: true, phaseId: ConstructionPhaseId.TERRASSEMENT })
    expect(app.getState().introActive).toBe(true)

    app.advanceTime(INTRO.stageCinematicMs - 200)
    expect(app.getState().introActive).toBe(true)
    expect(app.getState().elapsedMs).toBe(0) // sim gelée

    app.advanceTime(300) // dépasse la durée d'intro (stageCinematicMs)
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
