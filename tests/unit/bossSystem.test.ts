import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { bossSystem } from '@core/systems/bossSystem'
import { BEHAVIOR_TUNING } from '@content/enemies'
import { PHASES, ConstructionPhaseId } from '@content/phases'
import type { ConstructionPhase } from '@content/phases'
import type { EntityId } from '@core/types'

function terrainVierge(): ConstructionPhase {
  const phase = PHASES[ConstructionPhaseId.TERRAIN_VIERGE]
  if (phase === undefined) {
    throw new Error('phase terrain_vierge manquante')
  }
  return phase
}

function addBoss(w: World, hp: number, maxHp = 1800): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x: 800, y: 600 })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp })
  w.add(e, 'enemy', {
    type: 'contremaitre', speed: 170, isElite: true, isBoss: true,
    contactDamage: 22, xpValue: 80, behavior: 'boss'
  })
  return e
}

function countAdds(w: World): number {
  // Tous les ennemis SAUF le boss (behavior 'boss').
  let n = 0
  for (const e of w.query('enemy')) {
    if (w.get(e, 'enemy')?.behavior !== 'boss') { n++ }
  }
  return n
}

describe('bossSystem (enrage + invocations)', () => {
  const T = BEHAVIOR_TUNING.boss

  it("n'invoque rien tant qu'aucun seuil de PV n'est franchi", () => {
    const w = new World()
    const boss = addBoss(w, 1800) // 100 %
    bossSystem(w, new Rng(1), terrainVierge())
    expect(countAdds(w)).toBe(0)
    expect(w.get(boss, 'enemy')?.bSummonIdx).toBe(0)
  })

  it('invoque summonCount add au premier seuil (75 %) franchi, une seule fois', () => {
    const w = new World()
    const boss = addBoss(w, Math.floor(1800 * 0.74)) // sous 75 %, au-dessus de 50 %
    bossSystem(w, new Rng(1), terrainVierge())
    expect(countAdds(w)).toBe(T.summonCount)
    expect(w.get(boss, 'enemy')?.bSummonIdx).toBe(1)
    // Rappel au même palier → pas de nouvelle invocation.
    bossSystem(w, new Rng(1), terrainVierge())
    expect(countAdds(w)).toBe(T.summonCount)
  })

  it('franchit plusieurs seuils en une frame (gros coup) → invocations cumulées', () => {
    const w = new World()
    addBoss(w, Math.floor(1800 * 0.2)) // sous 75/50/25 % d'un coup
    bossSystem(w, new Rng(1), terrainVierge())
    expect(countAdds(w)).toBe(T.summonCount * T.summonAtHpPct.length)
  })

  it('pose bEnraged quand les PV passent sous enrageHpPct', () => {
    const w = new World()
    const boss = addBoss(w, Math.floor(1800 * (T.enrageHpPct - 0.05)))
    bossSystem(w, new Rng(1), terrainVierge())
    expect(w.get(boss, 'enemy')?.bEnraged).toBe(true)
  })

  it('bEnraged reste faux au-dessus du seuil', () => {
    const w = new World()
    const boss = addBoss(w, Math.floor(1800 * (T.enrageHpPct + 0.2)))
    bossSystem(w, new Rng(1), terrainVierge())
    expect(w.get(boss, 'enemy')?.bEnraged).toBe(false)
  })

  it('ignore les ennemis non-boss (aucun effet)', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 0, y: 0 })
    w.add(e, 'velocity', { x: 0, y: 0 })
    w.add(e, 'health', { hp: 5, maxHp: 18 }) // 28 % mais behavior chase
    w.add(e, 'enemy', { type: 'paperasse', speed: 150, isElite: false, isBoss: false, contactDamage: 6, xpValue: 5, behavior: 'chase' })
    bossSystem(w, new Rng(1), terrainVierge())
    expect(countAdds(w)).toBe(1) // le chase lui-même, aucun add
    expect(w.get(e, 'enemy')?.bEnraged).toBeUndefined()
  })

  it('est déterministe : même seed → mêmes add (types + positions)', () => {
    const snap = (): string[] => {
      const w = new World()
      addBoss(w, Math.floor(1800 * 0.2))
      bossSystem(w, new Rng(7), terrainVierge())
      return [...w.query('enemy', 'position')]
        .filter((e) => w.get(e, 'enemy')?.behavior !== 'boss')
        .map((e) => {
          const en = w.get(e, 'enemy')
          const p = w.get(e, 'position')
          return `${en?.type}@${Math.round(p?.x ?? 0)},${Math.round(p?.y ?? 0)}`
        })
    }
    expect(snap()).toEqual(snap())
  })
})
