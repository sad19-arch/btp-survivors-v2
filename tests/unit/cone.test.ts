/**
 * Tests TDD — cône + ralentissement (extincteur, 1er effet de contrôle).
 *
 * Contrats :
 *   - tickCone : ennemi dans le cône (rayon + angle) → touché + slow posé.
 *   - tickCone : ennemi hors de l'angle → non touché.
 *   - slowSystem : décrémente remainingMs, retire le composant quand ≤ 0.
 *   - enemyAiSystem : vélocité × slow.mult quand slow présent ; pleine sinon.
 */
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { weaponSystem } from '@core/systems/weapon'
import { slowSystem } from '@core/systems/slow'
import { enemyAiSystem } from '@core/systems/enemyAi'
import type { EntityId } from '@core/types'
import { BASE_STATS } from '@content/passives'

// --- Helpers -----------------------------------------------------------------

function addPlayerWithExtincteur(w: World, px = 0, py = 0, cooldownLeftMs = 0): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x: px, y: py })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', {
    playerId: 1,
    speed: 200,
    vigilance: 100,
    damageMult: 1,
    cooldownMult: 1,
    pickupRadius: 90
  })
  w.add(e, 'weapons', { slots: [{ id: 'extincteur', level: 1, cooldownLeftMs }] })
  w.add(e, 'stats', { ...BASE_STATS })
  return e
}

/**
 * Ajoute un ennemi et retourne son EntityId.
 * `speed` utilisé pour tester enemyAiSystem.
 */
function addEnemy(w: World, x: number, y: number, hp = 50, speed = 80): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', {
    type: 'paperasse',
    speed,
    isElite: false,
    isBoss: false,
    contactDamage: 5,
    xpValue: 5
  })
  return e
}

// --- Tests tickCone ----------------------------------------------------------

describe('weaponSystem kind cone (extincteur)', () => {
  it('ennemi dans le cône → touché et slow posé', () => {
    const w = new World()
    // Joueur à l'origine, ennemi devant (à droite, +x).
    // Direction du cône = vers l'ennemi le plus proche = +x.
    // L'ennemi est dans le rayon (area=130) et dans l'angle (déviation 0 rad).
    addPlayerWithExtincteur(w, 0, 0, 0)
    const enemy = addEnemy(w, 80, 0) // droite devant, distance 80 < area 130

    weaponSystem(w, 16)

    const hp = w.get(enemy, 'health')?.hp ?? 50
    expect(hp).toBeLessThan(50) // touché

    const slow = w.get(enemy, 'slow')
    expect(slow).toBeDefined()
    expect(slow?.mult).toBeCloseTo(0.5, 5)
    // slowMs = 700 (valeur extincteur niveau 1 après tuning d'équilibrage).
    expect(slow?.remainingMs).toBeCloseTo(700, 0)
  })

  it('ennemi hors de l\'angle (derrière le joueur) → non touché', () => {
    const w = new World()
    // Joueur à l'origine.
    // inCone : à 60 px devant (+x, distance 60 < 80 donc plus proche).
    // behind : à 80 px derrière (−x). Direction du cône = +x.
    // L'angle entre (+x) et (−x) = π rad >> CONE_HALF_ANGLE ≈ 0.5 rad → hors cône.
    addPlayerWithExtincteur(w, 0, 0, 0)
    const inCone = addEnemy(w, 60, 0)   // plus proche → cible du cône
    const behind = addEnemy(w, -80, 0)  // derrière → hors angle

    weaponSystem(w, 16)

    // L'ennemi en face est touché.
    expect(w.get(inCone, 'health')?.hp ?? 50).toBeLessThan(50)
    // L'ennemi derrière n'est PAS touché.
    expect(w.get(behind, 'health')?.hp ?? 50).toBe(50)
    expect(w.get(behind, 'slow')).toBeUndefined()
  })

  it('ennemi hors du rayon (trop loin) → non touché', () => {
    const w = new World()
    addPlayerWithExtincteur(w, 0, 0, 0)
    const far = addEnemy(w, 300, 0) // distance 300 > area 130

    weaponSystem(w, 16)

    // Pas de cible proche → cone ne tire pas ; ou cible absente si c'est le seul ennemi.
    // Aucun ennemi dans le rayon (area+HITBOX.enemy = 130+12 = 142) → pas touché.
    expect(w.get(far, 'health')?.hp).toBe(50)
    expect(w.get(far, 'slow')).toBeUndefined()
  })

  it('rafraîchit le slow : garde le plus fort si l\'ennemi a déjà un slow plus faible', () => {
    const w = new World()
    addPlayerWithExtincteur(w, 0, 0, 0)
    const enemy = addEnemy(w, 80, 0)
    // Pose un slow initial moins puissant (mult 0.8 > 0.5).
    w.add(enemy, 'slow', { mult: 0.8, remainingMs: 500 })

    weaponSystem(w, 16)

    const slow = w.get(enemy, 'slow')
    // Le nouveau slow (mult 0.5) est plus fort → remplace.
    expect(slow?.mult).toBeCloseTo(0.5, 5)
    // remainingMs doit être le plus long (700 > 500).
    expect(slow?.remainingMs).toBeCloseTo(700, 0)
  })

  it('rafraîchit le slow : conserve le plus fort si l\'existant est plus puissant', () => {
    const w = new World()
    addPlayerWithExtincteur(w, 0, 0, 0)
    const enemy = addEnemy(w, 80, 0)
    // Pose un slow initial plus puissant (mult 0.2 < 0.5) et plus long.
    w.add(enemy, 'slow', { mult: 0.2, remainingMs: 3000 })

    weaponSystem(w, 16)

    const slow = w.get(enemy, 'slow')
    // Garde le plus fort (mult 0.2) et le plus long (3000).
    expect(slow?.mult).toBeCloseTo(0.2, 5)
    expect(slow?.remainingMs).toBe(3000)
  })

  it('ne tire pas si le cooldown n\'est pas écoulé', () => {
    const w = new World()
    addPlayerWithExtincteur(w, 0, 0, 2000)
    const enemy = addEnemy(w, 80, 0)

    weaponSystem(w, 16)

    expect(w.get(enemy, 'health')?.hp).toBe(50)
    expect(w.get(enemy, 'slow')).toBeUndefined()
  })

  it('remet le cooldown après un tir', () => {
    const w = new World()
    const p = addPlayerWithExtincteur(w, 0, 0, 0)
    addEnemy(w, 80, 0)

    weaponSystem(w, 16)

    const slot = w.get(p, 'weapons')?.slots[0]
    expect(slot?.cooldownLeftMs ?? 0).toBeGreaterThan(0)
  })

  it('émet un AuraPulse de kind cone', () => {
    const w = new World()
    addPlayerWithExtincteur(w, 0, 0, 0)
    addEnemy(w, 80, 0)

    const pulses: { x: number; y: number; radius: number; kind: string }[] = []
    weaponSystem(w, 16, pulses)

    expect(pulses.some((p) => p.kind === 'cone')).toBe(true)
  })
})

// --- Tests slowSystem --------------------------------------------------------

describe('slowSystem', () => {
  it('décrémente remainingMs à chaque pas', () => {
    const w = new World()
    const enemy = addEnemy(w, 0, 0)
    w.add(enemy, 'slow', { mult: 0.5, remainingMs: 1500 })

    slowSystem(w, 100)

    const slow = w.get(enemy, 'slow')
    expect(slow?.remainingMs).toBeCloseTo(1400, 0)
  })

  it('retire le composant slow quand remainingMs ≤ 0', () => {
    const w = new World()
    const enemy = addEnemy(w, 0, 0)
    w.add(enemy, 'slow', { mult: 0.5, remainingMs: 50 })

    slowSystem(w, 100) // 50 - 100 = -50 ≤ 0 → retire

    expect(w.get(enemy, 'slow')).toBeUndefined()
  })

  it('no-op si aucun ennemi n\'a de slow (stable)', () => {
    const w = new World()
    addEnemy(w, 0, 0) // sans slow

    // Ne doit pas lever d'erreur.
    expect(() => slowSystem(w, 100)).not.toThrow()
  })

  it('retire le slow exactement à remainingMs = 0 (borne basse)', () => {
    const w = new World()
    const enemy = addEnemy(w, 0, 0)
    w.add(enemy, 'slow', { mult: 0.5, remainingMs: 100 })

    slowSystem(w, 100) // 100 - 100 = 0 ≤ 0 → retire

    expect(w.get(enemy, 'slow')).toBeUndefined()
  })
})

// --- Tests enemyAiSystem + slow ----------------------------------------------

describe('enemyAiSystem avec slow', () => {
  it('ennemi sans slow → vitesse pleine', () => {
    const w = new World()
    // Joueur à (500, 0), ennemi à l'origine → direction +x.
    const player = w.spawn()
    w.add(player, 'position', { x: 500, y: 0 })
    w.add(player, 'velocity', { x: 0, y: 0 })
    w.add(player, 'health', { hp: 100, maxHp: 100 })
    w.add(player, 'player', {
      playerId: 1, speed: 200, vigilance: 100,
      damageMult: 1, cooldownMult: 1, pickupRadius: 90
    })

    const enemy = addEnemy(w, 0, 0, 50, 80)

    enemyAiSystem(w)

    const vel = w.get(enemy, 'velocity')
    // vel.x doit être ≈ +80 (vitesse pleine vers +x).
    expect(vel?.x ?? 0).toBeCloseTo(80, 1)
    expect(vel?.y ?? 0).toBeCloseTo(0, 1)
  })

  it('ennemi avec slow mult=0.5 → vitesse divisée par 2', () => {
    const w = new World()
    const player = w.spawn()
    w.add(player, 'position', { x: 500, y: 0 })
    w.add(player, 'velocity', { x: 0, y: 0 })
    w.add(player, 'health', { hp: 100, maxHp: 100 })
    w.add(player, 'player', {
      playerId: 1, speed: 200, vigilance: 100,
      damageMult: 1, cooldownMult: 1, pickupRadius: 90
    })

    const enemy = addEnemy(w, 0, 0, 50, 80)
    w.add(enemy, 'slow', { mult: 0.5, remainingMs: 1000 })

    enemyAiSystem(w)

    const vel = w.get(enemy, 'velocity')
    // vel.x doit être ≈ 80 × 0.5 = 40.
    expect(vel?.x ?? 0).toBeCloseTo(40, 1)
    expect(vel?.y ?? 0).toBeCloseTo(0, 1)
  })

  it('slowSystem avant enemyAiSystem : le slow expiré n\'affecte pas la vélocité', () => {
    const w = new World()
    const player = w.spawn()
    w.add(player, 'position', { x: 500, y: 0 })
    w.add(player, 'velocity', { x: 0, y: 0 })
    w.add(player, 'health', { hp: 100, maxHp: 100 })
    w.add(player, 'player', {
      playerId: 1, speed: 200, vigilance: 100,
      damageMult: 1, cooldownMult: 1, pickupRadius: 90
    })

    const enemy = addEnemy(w, 0, 0, 50, 80)
    w.add(enemy, 'slow', { mult: 0.5, remainingMs: 10 })

    // slowSystem retire le slow (10 - 100 ≤ 0).
    slowSystem(w, 100)
    // enemyAiSystem ne voit plus de slow → vitesse pleine.
    enemyAiSystem(w)

    const vel = w.get(enemy, 'velocity')
    expect(vel?.x ?? 0).toBeCloseTo(80, 1)
  })
})
