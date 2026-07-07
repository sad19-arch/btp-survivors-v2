/**
 * Tests Task 7 : placeEvent (formations de horde) + EVENT_POOL_DEFAULT.
 *
 * Garanties :
 *  - 0 Math.random (le rng passé en arg est la seule source d'aléa)
 *  - Déterminisme strict : même rng(seed) → même résultat, testé en miroir
 *  - noUncheckedIndexedAccess : tous les accès à des tableaux par index passent par
 *    une vérification d'existence (throw si absent)
 */
import { describe, it, expect } from 'vitest'
import { Rng } from '@core/rng'
import { placeEvent, EVENT_POOL_DEFAULT, eventPoolForPhase } from '@content/waveEvents'
import { ConstructionPhaseId } from '@content/phases'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crée deux Rng avec la même seed → flux identique. */
function mirrorRng(seed: number): [Rng, Rng] {
  return [new Rng(seed), new Rng(seed)]
}

const TWO_PI = 2 * Math.PI

// ---------------------------------------------------------------------------
// placeEvent — encircle
// ---------------------------------------------------------------------------

describe('placeEvent("encircle")', () => {
  it('renvoie exactement count placements', () => {
    const rng = new Rng(1)
    const result = placeEvent('encircle', 8, 400, rng)
    expect(result).toHaveLength(8)
  })

  it('tous les placements ont behavior "circler"', () => {
    const rng = new Rng(2)
    const result = placeEvent('encircle', 8, 400, rng)
    for (const p of result) {
      expect(p.behavior).toBe('circler')
    }
  })

  it('bAngle est défini sur chaque placement', () => {
    const rng = new Rng(3)
    const result = placeEvent('encircle', 8, 400, rng)
    for (const p of result) {
      expect(p.bAngle).toBeDefined()
    }
  })

  it('bAngle équirépartis : Δ ≈ 2π/8 entre chaque consécutif', () => {
    const rng = new Rng(4)
    const result = placeEvent('encircle', 8, 400, rng)
    const delta = TWO_PI / 8
    // Les bAngles doivent être équirépartis (pas nécessairement triés — on
    // vérifie que la variance des écarts est faible).
    const angles = result.map((p) => {
      if (p.bAngle === undefined) {
        throw new Error('bAngle manquant sur un placement encircle')
      }
      return p.bAngle
    })
    // Tri croissant pour mesurer les écarts consécutifs
    const sorted = [...angles].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]
      if (curr === undefined || next === undefined) {
        throw new Error(`angle manquant à l'index ${i}`)
      }
      expect(next - curr).toBeCloseTo(delta, 3)
    }
  })

  it('radius = ringRadius × 0.7 (resserré)', () => {
    const ringRadius = 400
    const rng = new Rng(5)
    const result = placeEvent('encircle', 8, ringRadius, rng)
    for (const p of result) {
      expect(p.radius).toBeCloseTo(ringRadius * 0.7, 5)
    }
  })

  it('est déterministe (même seed → même sortie)', () => {
    const [r1, r2] = mirrorRng(42)
    const a = placeEvent('encircle', 8, 400, r1)
    const b = placeEvent('encircle', 8, 400, r2)
    expect(a).toHaveLength(b.length)
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]
      const bi = b[i]
      if (ai === undefined || bi === undefined) {
        throw new Error(`placement manquant à l'index ${i}`)
      }
      expect(ai.angle).toBeCloseTo(bi.angle, 10)
      expect(ai.radius).toBeCloseTo(bi.radius, 10)
      expect(ai.behavior).toBe(bi.behavior)
      expect(ai.bAngle).toBeCloseTo(bi.bAngle ?? 0, 10)
    }
  })
})

// ---------------------------------------------------------------------------
// placeEvent — sweep
// ---------------------------------------------------------------------------

describe('placeEvent("sweep")', () => {
  it('renvoie exactement count placements', () => {
    const rng = new Rng(10)
    const result = placeEvent('sweep', 5, 400, rng)
    expect(result).toHaveLength(5)
  })

  it('tous les placements ont behavior "sweep"', () => {
    const rng = new Rng(11)
    const result = placeEvent('sweep', 5, 400, rng)
    for (const p of result) {
      expect(p.behavior).toBe('sweep')
    }
  })

  it('tous les placements partagent le MÊME bAngle (direction de traversée)', () => {
    const rng = new Rng(12)
    const result = placeEvent('sweep', 5, 400, rng)
    const first = result[0]
    if (first === undefined) {
      throw new Error('aucun placement retourné pour sweep')
    }
    expect(first.bAngle).toBeDefined()
    const sharedAngle = first.bAngle as number
    for (const p of result) {
      expect(p.bAngle).toBeCloseTo(sharedAngle, 10)
    }
  })

  it('est déterministe (même seed → même sortie)', () => {
    const [r1, r2] = mirrorRng(77)
    const a = placeEvent('sweep', 5, 400, r1)
    const b = placeEvent('sweep', 5, 400, r2)
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]
      const bi = b[i]
      if (ai === undefined || bi === undefined) {
        throw new Error(`placement manquant à l'index ${i}`)
      }
      expect(ai.angle).toBeCloseTo(bi.angle, 10)
      expect(ai.bAngle).toBeCloseTo(bi.bAngle ?? 0, 10)
    }
  })
})

// ---------------------------------------------------------------------------
// placeEvent — pincer
// ---------------------------------------------------------------------------

describe('placeEvent("pincer")', () => {
  it('renvoie exactement count placements', () => {
    const rng = new Rng(20)
    const result = placeEvent('pincer', 6, 400, rng)
    expect(result).toHaveLength(6)
  })

  it('tous les placements ont behavior "chase"', () => {
    const rng = new Rng(21)
    const result = placeEvent('pincer', 6, 400, rng)
    for (const p of result) {
      expect(p.behavior).toBe('chase')
    }
  })

  it("2 clusters à ~π d'écart (angle moyen des sous-groupes)", () => {
    const rng = new Rng(22)
    const result = placeEvent('pincer', 6, 400, rng)
    // Divise en 2 sous-groupes de taille ≈ count/2
    const half = Math.floor(6 / 2)
    const g1 = result.slice(0, half)
    const g2 = result.slice(half)
    // Angles moyens des deux groupes
    const mean1 = g1.reduce((s, p) => s + p.angle, 0) / g1.length
    const mean2 = g2.reduce((s, p) => s + p.angle, 0) / g2.length
    // Écart normalisé dans [0, π]
    let diff = Math.abs(mean2 - mean1)
    if (diff > Math.PI) {
      diff = TWO_PI - diff
    }
    // Les deux groupes doivent être à ~π d'écart (±0.5 rad de tolérance)
    expect(diff).toBeGreaterThan(Math.PI - 0.5)
    expect(diff).toBeLessThan(Math.PI + 0.5)
  })

  it('est déterministe', () => {
    const [r1, r2] = mirrorRng(99)
    const a = placeEvent('pincer', 6, 400, r1)
    const b = placeEvent('pincer', 6, 400, r2)
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]
      const bi = b[i]
      if (ai === undefined || bi === undefined) {
        throw new Error(`placement manquant à l'index ${i}`)
      }
      expect(ai.angle).toBeCloseTo(bi.angle, 10)
    }
  })
})

// ---------------------------------------------------------------------------
// placeEvent — converge
// ---------------------------------------------------------------------------

describe('placeEvent("converge")', () => {
  it('renvoie exactement count placements', () => {
    const rng = new Rng(30)
    const result = placeEvent('converge', 5, 400, rng)
    expect(result).toHaveLength(5)
  })

  it('tous les placements ont behavior "chase"', () => {
    const rng = new Rng(31)
    const result = placeEvent('converge', 5, 400, rng)
    for (const p of result) {
      expect(p.behavior).toBe('chase')
    }
  })

  it('tous dans un arc étroit (écart max entre angles < π/2)', () => {
    const rng = new Rng(32)
    const result = placeEvent('converge', 5, 400, rng)
    const angles = result.map((p) => p.angle)
    // Max écart entre deux angles consécutifs (sur le cercle) doit rester étroit
    for (let i = 0; i < angles.length; i++) {
      for (let j = i + 1; j < angles.length; j++) {
        const ai = angles[i]
        const aj = angles[j]
        if (ai === undefined || aj === undefined) {
          throw new Error(`angle manquant à l'index ${i} ou ${j}`)
        }
        let diff = Math.abs(aj - ai)
        if (diff > Math.PI) {
          diff = TWO_PI - diff
        }
        // Arc étroit = chaque paire d'ennemis à < π/2 (spec : jitter ±0.25 rad → max 0.5)
        expect(diff).toBeLessThan(Math.PI / 2)
      }
    }
  })

  it('radius = ringRadius sur chaque placement', () => {
    const ringRadius = 350
    const rng = new Rng(33)
    const result = placeEvent('converge', 5, ringRadius, rng)
    for (const p of result) {
      expect(p.radius).toBeCloseTo(ringRadius, 5)
    }
  })

  it('est déterministe', () => {
    const [r1, r2] = mirrorRng(55)
    const a = placeEvent('converge', 5, 400, r1)
    const b = placeEvent('converge', 5, 400, r2)
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]
      const bi = b[i]
      if (ai === undefined || bi === undefined) {
        throw new Error(`placement manquant à l'index ${i}`)
      }
      expect(ai.angle).toBeCloseTo(bi.angle, 10)
    }
  })
})

// ---------------------------------------------------------------------------
// placeEvent — burst
// ---------------------------------------------------------------------------

describe('placeEvent("burst")', () => {
  it('renvoie exactement count placements', () => {
    const rng = new Rng(40)
    const result = placeEvent('burst', 6, 400, rng)
    expect(result).toHaveLength(6)
  })

  it('tous les placements ont behavior "chase"', () => {
    const rng = new Rng(41)
    const result = placeEvent('burst', 6, 400, rng)
    for (const p of result) {
      expect(p.behavior).toBe('chase')
    }
  })

  it('est déterministe', () => {
    const [r1, r2] = mirrorRng(66)
    const a = placeEvent('burst', 6, 400, r1)
    const b = placeEvent('burst', 6, 400, r2)
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]
      const bi = b[i]
      if (ai === undefined || bi === undefined) {
        throw new Error(`placement manquant à l'index ${i}`)
      }
      expect(ai.angle).toBeCloseTo(bi.angle, 10)
    }
  })
})

// ---------------------------------------------------------------------------
// placeEvent — miniBoss
// ---------------------------------------------------------------------------

describe('placeEvent("miniBoss")', () => {
  it('renvoie [] (géré par le directeur en T10)', () => {
    const rng = new Rng(50)
    const result = placeEvent('miniBoss', 1, 400, rng)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// placeEvent — behaviorOverride optionnel
// ---------------------------------------------------------------------------

describe('placeEvent — behaviorOverride', () => {
  it('surcharge le behavior par défaut du kind', () => {
    const rng = new Rng(60)
    const result = placeEvent('converge', 3, 300, rng, 'zigzag')
    for (const p of result) {
      expect(p.behavior).toBe('zigzag')
    }
  })

  it('encircle avec override "chase" → tous chase', () => {
    const rng = new Rng(61)
    const result = placeEvent('encircle', 4, 300, rng, 'chase')
    for (const p of result) {
      expect(p.behavior).toBe('chase')
    }
  })
})

// ---------------------------------------------------------------------------
// EVENT_POOL_DEFAULT
// ---------------------------------------------------------------------------

describe('EVENT_POOL_DEFAULT', () => {
  it("n'est pas vide", () => {
    expect(EVENT_POOL_DEFAULT.length).toBeGreaterThan(0)
  })

  it('tous les kinds sont valides', () => {
    const validKinds = new Set(['converge', 'pincer', 'burst', 'encircle', 'sweep', 'miniBoss'])
    for (const def of EVENT_POOL_DEFAULT) {
      expect(validKinds.has(def.kind)).toBe(true)
    }
  })

  it('poids ≥ 1 pour chaque définition', () => {
    for (const def of EVENT_POOL_DEFAULT) {
      expect(def.weight).toBeGreaterThanOrEqual(1)
    }
  })

  it('countMin ≤ countMax pour chaque définition', () => {
    for (const def of EVENT_POOL_DEFAULT) {
      expect(def.countMin).toBeLessThanOrEqual(def.countMax)
    }
  })

  it('allowedFromSec ≥ 0 pour chaque définition', () => {
    for (const def of EVENT_POOL_DEFAULT) {
      expect(def.allowedFromSec).toBeGreaterThanOrEqual(0)
    }
  })

  it('converge/pincer/burst ont allowedFromSec = 0 (dispo dès le début)', () => {
    const earlyKinds = EVENT_POOL_DEFAULT.filter(
      (d) => d.kind === 'converge' || d.kind === 'pincer' || d.kind === 'burst'
    )
    expect(earlyKinds.length).toBeGreaterThan(0)
    for (const def of earlyKinds) {
      expect(def.allowedFromSec).toBe(0)
    }
  })

  it('encircle et sweep ont allowedFromSec ≥ 120 (tardifs)', () => {
    const lateKinds = EVENT_POOL_DEFAULT.filter(
      (d) => d.kind === 'encircle' || d.kind === 'sweep'
    )
    expect(lateKinds.length).toBeGreaterThan(0)
    for (const def of lateKinds) {
      expect(def.allowedFromSec).toBeGreaterThanOrEqual(120)
    }
  })
})

// ---------------------------------------------------------------------------
// eventPoolForPhase — Task 12
// ---------------------------------------------------------------------------

const VALID_KINDS = new Set(['converge', 'pincer', 'burst', 'encircle', 'sweep', 'miniBoss'])

describe('eventPoolForPhase', () => {
  const allPhases = Object.values(ConstructionPhaseId)

  it('renvoie un pool non vide pour chaque phase', () => {
    for (const phaseId of allPhases) {
      const pool = eventPoolForPhase(phaseId)
      expect(pool.length).toBeGreaterThan(0)
    }
  })

  it('tous les kinds sont valides pour chaque phase', () => {
    for (const phaseId of allPhases) {
      const pool = eventPoolForPhase(phaseId)
      for (const def of pool) {
        expect(VALID_KINDS.has(def.kind)).toBe(true)
      }
    }
  })

  it('weight ≥ 1 pour toutes les définitions de chaque phase', () => {
    for (const phaseId of allPhases) {
      const pool = eventPoolForPhase(phaseId)
      for (const def of pool) {
        expect(def.weight).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('countMin ≤ countMax pour toutes les définitions de chaque phase', () => {
    for (const phaseId of allPhases) {
      const pool = eventPoolForPhase(phaseId)
      for (const def of pool) {
        expect(def.countMin).toBeLessThanOrEqual(def.countMax)
      }
    }
  })

  it('allowedFromSec ≥ 0 pour toutes les définitions de chaque phase', () => {
    for (const phaseId of allPhases) {
      const pool = eventPoolForPhase(phaseId)
      for (const def of pool) {
        expect(def.allowedFromSec).toBeGreaterThanOrEqual(0)
      }
    }
  })

  // ---------------------------------------------------------------------------
  // Lock d'équilibrage (garde-fou sim:check)
  // ---------------------------------------------------------------------------

  it('TERRAIN_VIERGE est content-identique à EVENT_POOL_DEFAULT (garde-fou sim)', () => {
    const pool = eventPoolForPhase(ConstructionPhaseId.TERRAIN_VIERGE)
    expect(pool).toHaveLength(EVENT_POOL_DEFAULT.length)
    for (let i = 0; i < EVENT_POOL_DEFAULT.length; i++) {
      const expected = EVENT_POOL_DEFAULT[i]
      const actual = pool[i]
      if (expected === undefined || actual === undefined) {
        throw new Error(`entrée manquante à l'index ${i}`)
      }
      expect(actual.kind).toBe(expected.kind)
      expect(actual.weight).toBe(expected.weight)
      expect(actual.countMin).toBe(expected.countMin)
      expect(actual.countMax).toBe(expected.countMax)
      expect(actual.allowedFromSec).toBe(expected.allowedFromSec)
    }
  })

  // ---------------------------------------------------------------------------
  // Identité des phases : encircle + sweep plus présents sur les phases tardives
  // ---------------------------------------------------------------------------

  function totalEncircleSweepWeight(phaseId: ConstructionPhaseId): number {
    const pool = eventPoolForPhase(phaseId)
    let total = 0
    for (const def of pool) {
      if (def.kind === 'encircle' || def.kind === 'sweep') {
        total += def.weight
      }
    }
    return total
  }

  it('poids encircle+sweep est STRICTEMENT supérieur sur ECHAFAUDAGES vs TERRAIN_VIERGE', () => {
    const early = totalEncircleSweepWeight(ConstructionPhaseId.TERRAIN_VIERGE)
    const late = totalEncircleSweepWeight(ConstructionPhaseId.ECHAFAUDAGES)
    expect(late).toBeGreaterThan(early)
  })

  it('poids encircle+sweep est STRICTEMENT supérieur sur LIVRAISON_AUDIT vs TERRAIN_VIERGE', () => {
    const early = totalEncircleSweepWeight(ConstructionPhaseId.TERRAIN_VIERGE)
    const late = totalEncircleSweepWeight(ConstructionPhaseId.LIVRAISON_AUDIT)
    expect(late).toBeGreaterThan(early)
  })

  it('poids encircle+sweep est STRICTEMENT supérieur sur SECOND_OEUVRE vs TERRASSEMENT', () => {
    const early = totalEncircleSweepWeight(ConstructionPhaseId.TERRASSEMENT)
    const late = totalEncircleSweepWeight(ConstructionPhaseId.SECOND_OEUVRE)
    expect(late).toBeGreaterThan(early)
  })

  // ---------------------------------------------------------------------------
  // Hygiène : pas de phase sans pool défini silencieusement
  // ---------------------------------------------------------------------------

  it('toutes les phases connues renvoient un tableau (pas undefined)', () => {
    for (const phaseId of allPhases) {
      const pool = eventPoolForPhase(phaseId)
      expect(pool).toBeDefined()
      if (pool === undefined) {
        throw new Error(`pool undefined pour la phase ${phaseId}`)
      }
    }
  })
})
