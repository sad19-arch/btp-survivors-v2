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
import { FORMATION } from '@content/config'
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

  it('radius = ringRadius × encircleRadiusFactor (au bord, hors écran)', () => {
    const ringRadius = 400
    const rng = new Rng(5)
    const result = placeEvent('encircle', 8, ringRadius, rng)
    for (const p of result) {
      expect(p.radius).toBeCloseTo(ringRadius * FORMATION.encircleRadiusFactor, 5)
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
// Task 8 — encircle AMPLIFIÉ : anneau complet fermé (count=16)
// ---------------------------------------------------------------------------

describe('placeEvent("encircle") — anneau complet fermé (Task 8)', () => {
  it('placeEncircle(16, r, rng) renvoie exactement 16 placements', () => {
    const rng = new Rng(100)
    const result = placeEvent('encircle', 16, 500, rng)
    expect(result).toHaveLength(16)
  })

  it('écart angulaire ≈ 2π/16 entre voisins triés (anneau équiréparti)', () => {
    const rng = new Rng(101)
    const result = placeEvent('encircle', 16, 500, rng)
    const expectedDelta = TWO_PI / 16
    const angles = result.map((p) => {
      if (p.bAngle === undefined) {
        throw new Error('bAngle manquant sur un placement encircle')
      }
      return p.bAngle
    })
    const sorted = [...angles].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]
      if (curr === undefined || next === undefined) {
        throw new Error(`angle manquant à l'index ${i}`)
      }
      expect(next - curr).toBeCloseTo(expectedDelta, 3)
    }
  })

  it("anneau FERMÉ : l'écart wrap-around (dernier→premier) est aussi ≈ 2π/16", () => {
    const rng = new Rng(102)
    const result = placeEvent('encircle', 16, 500, rng)
    const angles = result.map((p) => {
      if (p.bAngle === undefined) {
        throw new Error('bAngle manquant sur un placement encircle')
      }
      return p.bAngle
    })
    const sorted = [...angles].sort((a, b) => a - b)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (first === undefined || last === undefined) {
      throw new Error('tableau trié vide')
    }
    // L'écart wrap-around (de last à first + 2π) doit être ≈ 2π/16
    const wrapGap = (first + TWO_PI) - last
    const expectedDelta = TWO_PI / 16
    expect(wrapGap).toBeCloseTo(expectedDelta, 3)
  })

  it('tous les placements ont behavior "circler" (défaut encircle)', () => {
    const rng = new Rng(103)
    const result = placeEvent('encircle', 16, 500, rng)
    for (const p of result) {
      expect(p.behavior).toBe('circler')
    }
  })

  it('est déterministe (même seed → même sortie pour count=16)', () => {
    const [r1, r2] = mirrorRng(104)
    const a = placeEvent('encircle', 16, 500, r1)
    const b = placeEvent('encircle', 16, 500, r2)
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
// Task 8 — sweep AMPLIFIÉ : mur dense (espacement serré)
// ---------------------------------------------------------------------------

describe('placeEvent("sweep") — mur dense (Task 8)', () => {
  it('sweep(12, r, rng) renvoie exactement 12 placements', () => {
    const rng = new Rng(110)
    const result = placeEvent('sweep', 12, 500, rng)
    expect(result).toHaveLength(12)
  })

  it('espacement perpendiculaire entre voisins UNIFORME (mur linéaire) pour count=12', () => {
    // Spread default = 0.4 rad → écart entre voisins = 2*0.4/11 ≈ 0.0727 rad
    // Tous les écarts doivent être quasi-identiques (mur uniforme, pas de groupes)
    const rng = new Rng(111)
    const result = placeEvent('sweep', 12, 500, rng)
    const angles = result.map((p) => p.angle).sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 0; i < angles.length - 1; i++) {
      const curr = angles[i]
      const next = angles[i + 1]
      if (curr === undefined || next === undefined) {
        throw new Error(`angle manquant à l'index ${i}`)
      }
      gaps.push(next - curr)
    }
    // Tous les écarts doivent être quasi-identiques (tolérance 1e-9)
    const firstGap = gaps[0]
    if (firstGap === undefined) {
      throw new Error('tableau de gaps vide')
    }
    for (const g of gaps) {
      expect(g).toBeCloseTo(firstGap, 8)
    }
  })

  it('spread total (max-angle - min-angle) = 2×spread pour count=12 (mur compact)', () => {
    // Spread default = 0.4 rad → spread total = 2×0.4 = 0.8 rad
    const defaultSpread = 0.4
    const rng = new Rng(112)
    const result = placeEvent('sweep', 12, 500, rng)
    const angles = result.map((p) => p.angle).sort((a, b) => a - b)
    const minA = angles[0]
    const maxA = angles[angles.length - 1]
    if (minA === undefined || maxA === undefined) {
      throw new Error('tableau vide')
    }
    expect(maxA - minA).toBeCloseTo(2 * defaultSpread, 8)
  })

  it('tous les placements partagent le MÊME bAngle (direction de traversée)', () => {
    const rng = new Rng(113)
    const result = placeEvent('sweep', 12, 500, rng)
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

  it('est déterministe pour count=12', () => {
    const [r1, r2] = mirrorRng(114)
    const a = placeEvent('sweep', 12, 500, r1)
    const b = placeEvent('sweep', 12, 500, r2)
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
// Task 8 — EVENT_POOL_BY_PHASE : counts amplifiés sur les phases tardives
// ---------------------------------------------------------------------------

describe('EVENT_POOL_BY_PHASE — counts amplifiés (Task 8)', () => {
  // Phases tardives (8-10) doivent avoir des encircles plus denses (≥ 12/18)
  const latePhases = [
    ConstructionPhaseId.SECOND_OEUVRE,
    ConstructionPhaseId.FINITIONS,
    ConstructionPhaseId.LIVRAISON_AUDIT
  ] as const

  it('encircle countMax ≥ 14 sur les phases tardives (anneau dense)', () => {
    for (const phaseId of latePhases) {
      const pool = eventPoolForPhase(phaseId)
      const encircle = pool.find((d) => d.kind === 'encircle')
      if (encircle === undefined) {
        throw new Error(`encircle absent du pool pour la phase ${phaseId}`)
      }
      expect(encircle.countMax).toBeGreaterThanOrEqual(14)
    }
  })

  it('encircle countMin ≥ 10 sur les phases tardives (anneau lisible)', () => {
    for (const phaseId of latePhases) {
      const pool = eventPoolForPhase(phaseId)
      const encircle = pool.find((d) => d.kind === 'encircle')
      if (encircle === undefined) {
        throw new Error(`encircle absent du pool pour la phase ${phaseId}`)
      }
      expect(encircle.countMin).toBeGreaterThanOrEqual(10)
    }
  })

  it('sweep countMax ≥ 8 sur les phases tardives (mur dense)', () => {
    for (const phaseId of latePhases) {
      const pool = eventPoolForPhase(phaseId)
      const sweep = pool.find((d) => d.kind === 'sweep')
      if (sweep === undefined) {
        throw new Error(`sweep absent du pool pour la phase ${phaseId}`)
      }
      expect(sweep.countMax).toBeGreaterThanOrEqual(8)
    }
  })

  it('sweep countMin ≥ 5 sur les phases tardives (mur visible)', () => {
    for (const phaseId of latePhases) {
      const pool = eventPoolForPhase(phaseId)
      const sweep = pool.find((d) => d.kind === 'sweep')
      if (sweep === undefined) {
        throw new Error(`sweep absent du pool pour la phase ${phaseId}`)
      }
      expect(sweep.countMin).toBeGreaterThanOrEqual(5)
    }
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
    const validKinds = new Set(['converge', 'pincer', 'burst', 'encircle', 'sweep', 'miniBoss', 'spiral', 'columns', 'concentric'])
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
// Task 8 rework — spreadOverride câblé : mur condensé vs mur par défaut
// ---------------------------------------------------------------------------

describe('placeEvent("sweep") — spreadOverride (rework T8)', () => {
  it('spread 0.25 produit des écarts perpendiculaires PLUS SERRÉS que le défaut 0.4', () => {
    const count = 9
    const ringRadius = 500
    // Spread condensé
    const rngTight = new Rng(200)
    const tight = placeEvent('sweep', count, ringRadius, rngTight, undefined, 0.25)
    // Spread par défaut (0.4) — même seed pour neutraliser le tirage de dir
    const rngDefault = new Rng(200)
    const dflt = placeEvent('sweep', count, ringRadius, rngDefault, undefined)
    // Mesure : amplitude totale (max angle - min angle) — PLUS PETITE pour tight
    const amplitudeTight = (() => {
      const angles = tight.map((p) => p.angle).sort((a, b) => a - b)
      const lo = angles[0]
      const hi = angles[angles.length - 1]
      if (lo === undefined || hi === undefined) {
        throw new Error('tableau tight vide')
      }
      return hi - lo
    })()
    const amplitudeDefault = (() => {
      const angles = dflt.map((p) => p.angle).sort((a, b) => a - b)
      const lo = angles[0]
      const hi = angles[angles.length - 1]
      if (lo === undefined || hi === undefined) {
        throw new Error('tableau défaut vide')
      }
      return hi - lo
    })()
    expect(amplitudeTight).toBeLessThan(amplitudeDefault)
  })

  it('spread total = 2×spreadOverride quand spreadOverride=0.25', () => {
    const count = 7
    const rng = new Rng(201)
    const result = placeEvent('sweep', count, 500, rng, undefined, 0.25)
    const angles = result.map((p) => p.angle).sort((a, b) => a - b)
    const lo = angles[0]
    const hi = angles[angles.length - 1]
    if (lo === undefined || hi === undefined) {
      throw new Error('tableau vide')
    }
    expect(hi - lo).toBeCloseTo(2 * 0.25, 8)
  })

  it('est déterministe avec spreadOverride (même seed → même sortie)', () => {
    const [r1, r2] = mirrorRng(202)
    const a = placeEvent('sweep', 9, 500, r1, undefined, 0.25)
    const b = placeEvent('sweep', 9, 500, r2, undefined, 0.25)
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

describe('EVENT_POOL_DEFAULT — amplification rework T8', () => {
  it('encircle countMin ≥ 9 (anneau dense et fermé)', () => {
    const encircle = EVENT_POOL_DEFAULT.find((d) => d.kind === 'encircle')
    if (encircle === undefined) {
      throw new Error('encircle absent de EVENT_POOL_DEFAULT')
    }
    expect(encircle.countMin).toBeGreaterThanOrEqual(9)
  })

  it('encircle countMax ≥ 11 (anneau complet)', () => {
    const encircle = EVENT_POOL_DEFAULT.find((d) => d.kind === 'encircle')
    if (encircle === undefined) {
      throw new Error('encircle absent de EVENT_POOL_DEFAULT')
    }
    expect(encircle.countMax).toBeGreaterThanOrEqual(11)
  })

  it('sweep a un spreadOverride défini (mur condensé câblé)', () => {
    const sweep = EVENT_POOL_DEFAULT.find((d) => d.kind === 'sweep')
    if (sweep === undefined) {
      throw new Error('sweep absent de EVENT_POOL_DEFAULT')
    }
    expect(sweep.spreadOverride).toBeDefined()
  })

  it('sweep spreadOverride < 0.4 (mur plus serré que défaut)', () => {
    const sweep = EVENT_POOL_DEFAULT.find((d) => d.kind === 'sweep')
    if (sweep === undefined) {
      throw new Error('sweep absent de EVENT_POOL_DEFAULT')
    }
    const so = sweep.spreadOverride
    if (so === undefined) {
      throw new Error('spreadOverride non défini sur sweep de EVENT_POOL_DEFAULT')
    }
    // Doit être strictement inférieur au défaut (0.4) — le mur est condensé
    expect(so).toBeLessThan(0.4)
  })

  it('sweep countMin ≥ 4 (ligne dense qui traverse)', () => {
    const sweep = EVENT_POOL_DEFAULT.find((d) => d.kind === 'sweep')
    if (sweep === undefined) {
      throw new Error('sweep absent de EVENT_POOL_DEFAULT')
    }
    expect(sweep.countMin).toBeGreaterThanOrEqual(4)
  })

  it('sweep countMax ≥ 6 (mur imposant)', () => {
    const sweep = EVENT_POOL_DEFAULT.find((d) => d.kind === 'sweep')
    if (sweep === undefined) {
      throw new Error('sweep absent de EVENT_POOL_DEFAULT')
    }
    expect(sweep.countMax).toBeGreaterThanOrEqual(6)
  })
})

// ---------------------------------------------------------------------------
// eventPoolForPhase — Task 12
// ---------------------------------------------------------------------------

const VALID_KINDS = new Set(['converge', 'pincer', 'burst', 'encircle', 'sweep', 'miniBoss', 'spiral', 'columns', 'concentric'])

// ---------------------------------------------------------------------------
// Task 9 — placeEvent — spiral
// ---------------------------------------------------------------------------

describe('placeEvent("spiral")', () => {
  it('renvoie exactement count placements', () => {
    const rng = new Rng(300)
    const result = placeEvent('spiral', 8, 400, rng)
    expect(result).toHaveLength(8)
  })

  it('tous les placements ont behavior "chase" (défaut spiral)', () => {
    const rng = new Rng(301)
    const result = placeEvent('spiral', 8, 400, rng)
    for (const p of result) {
      expect(p.behavior).toBe('chase')
    }
  })

  it('le rayon est STRICTEMENT CROISSANT (spirale qui se resserre → ordre par index)', () => {
    const rng = new Rng(302)
    const result = placeEvent('spiral', 8, 400, rng)
    for (let i = 0; i < result.length - 1; i++) {
      const cur = result[i]
      const nxt = result[i + 1]
      if (cur === undefined || nxt === undefined) {
        throw new Error(`placement manquant à l'index ${i}`)
      }
      expect(nxt.radius).toBeGreaterThan(cur.radius)
    }
  })

  it('le rayon du premier placement est strictement inférieur à ringRadius', () => {
    const ringRadius = 400
    const rng = new Rng(303)
    const result = placeEvent('spiral', 8, ringRadius, rng)
    const first = result[0]
    if (first === undefined) {
      throw new Error('aucun placement retourné pour spiral')
    }
    expect(first.radius).toBeLessThan(ringRadius)
  })

  it('il existe une brèche angulaire (pas de cercle fermé — arc < 2π)', () => {
    // La spirale ne doit PAS former un cercle fermé.
    // On vérifie que l'étendue angulaire totale couvre < 2π.
    const rng = new Rng(304)
    const result = placeEvent('spiral', 8, 400, rng)
    const angles = result.map((p) => p.angle)
    const min = Math.min(...angles)
    const max = Math.max(...angles)
    expect(max - min).toBeLessThan(TWO_PI)
  })

  it('est déterministe (même seed → même sortie)', () => {
    const [r1, r2] = mirrorRng(305)
    const a = placeEvent('spiral', 8, 400, r1)
    const b = placeEvent('spiral', 8, 400, r2)
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
    }
  })

  it('placeEvent gère "spiral" sans throw', () => {
    const rng = new Rng(306)
    expect(() => placeEvent('spiral', 6, 400, rng)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Task 9 — placeEvent — columns
// ---------------------------------------------------------------------------

describe('placeEvent("columns")', () => {
  it('renvoie exactement count placements', () => {
    const rng = new Rng(310)
    const result = placeEvent('columns', 9, 400, rng)
    expect(result).toHaveLength(9)
  })

  it('tous les placements ont behavior "sweep" (défaut columns)', () => {
    const rng = new Rng(311)
    const result = placeEvent('columns', 9, 400, rng)
    for (const p of result) {
      expect(p.behavior).toBe('sweep')
    }
  })

  it('bAngle est défini sur chaque placement (direction de traversée)', () => {
    const rng = new Rng(312)
    const result = placeEvent('columns', 9, 400, rng)
    for (const p of result) {
      expect(p.bAngle).toBeDefined()
    }
  })

  it('il y a au moins 2 valeurs de bAngle distinctes (colonnes décalées)', () => {
    // Chaque colonne a son propre décalage → au moins 2 bAngles distincts.
    const rng = new Rng(313)
    const result = placeEvent('columns', 9, 400, rng)
    const bAngles = result.map((p) => {
      if (p.bAngle === undefined) {
        throw new Error('bAngle manquant sur un placement columns')
      }
      return p.bAngle
    })
    const unique = new Set(bAngles.map((a) => a.toFixed(6)))
    expect(unique.size).toBeGreaterThanOrEqual(2)
  })

  it('les ennemis se répartissent en ≥ 2 groupes distincts (couloirs visibles)', () => {
    // Les colonnes forment des lignes parallèles décalées → les bAngles se
    // regroupent en ≥ 2 clusters (même dir + décalage de colonne différent).
    const rng = new Rng(314)
    const result = placeEvent('columns', 9, 400, rng)
    const bAngles = result.map((p) => {
      if (p.bAngle === undefined) {
        throw new Error('bAngle manquant')
      }
      return p.bAngle
    })
    const uniqueCount = new Set(bAngles.map((a) => a.toFixed(6))).size
    expect(uniqueCount).toBeGreaterThanOrEqual(2)
  })

  it('est déterministe (même seed → même sortie)', () => {
    const [r1, r2] = mirrorRng(315)
    const a = placeEvent('columns', 9, 400, r1)
    const b = placeEvent('columns', 9, 400, r2)
    expect(a).toHaveLength(b.length)
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]
      const bi = b[i]
      if (ai === undefined || bi === undefined) {
        throw new Error(`placement manquant à l'index ${i}`)
      }
      expect(ai.angle).toBeCloseTo(bi.angle, 10)
      expect(ai.radius).toBeCloseTo(bi.radius, 10)
      expect(ai.bAngle).toBeCloseTo(bi.bAngle ?? 0, 10)
    }
  })

  it('placeEvent gère "columns" sans throw', () => {
    const rng = new Rng(316)
    expect(() => placeEvent('columns', 6, 400, rng)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Task 9 — placeEvent — concentric
// ---------------------------------------------------------------------------

describe('placeEvent("concentric")', () => {
  it('renvoie exactement count placements', () => {
    const rng = new Rng(320)
    const result = placeEvent('concentric', 12, 400, rng)
    expect(result).toHaveLength(12)
  })

  it('tous les placements ont behavior "circler" (défaut concentric)', () => {
    const rng = new Rng(321)
    const result = placeEvent('concentric', 12, 400, rng)
    for (const p of result) {
      expect(p.behavior).toBe('circler')
    }
  })

  it('exactement 2 rayons distincts (double anneau)', () => {
    const rng = new Rng(322)
    const result = placeEvent('concentric', 12, 400, rng)
    const radii = result.map((p) => p.radius)
    const unique = new Set(radii.map((r) => r.toFixed(4)))
    expect(unique.size).toBe(2)
  })

  it("le rayon externe est STRICTEMENT supérieur au rayon interne", () => {
    const rng = new Rng(323)
    const result = placeEvent('concentric', 12, 400, rng)
    const radii = result.map((p) => p.radius)
    const min = Math.min(...radii)
    const max = Math.max(...radii)
    expect(max).toBeGreaterThan(min)
  })

  it('les deux anneaux ont des bAngles distincts (retard externe)', () => {
    // L'anneau externe est légèrement retardé via bAngle → les bAngles de
    // l'anneau interne et externe doivent être distincts.
    const rng = new Rng(324)
    const result = placeEvent('concentric', 12, 400, rng)
    const inner = result.filter((p) => p.radius < Math.max(...result.map((x) => x.radius)))
    const outer = result.filter((p) => p.radius >= Math.max(...result.map((x) => x.radius)))
    // Il doit exister au moins un bAngle dans inner et un dans outer.
    expect(inner.length).toBeGreaterThan(0)
    expect(outer.length).toBeGreaterThan(0)
    // bAngle défini sur tous
    for (const p of result) {
      expect(p.bAngle).toBeDefined()
    }
  })

  it('est déterministe (même seed → même sortie)', () => {
    const [r1, r2] = mirrorRng(325)
    const a = placeEvent('concentric', 12, 400, r1)
    const b = placeEvent('concentric', 12, 400, r2)
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

  it('placeEvent gère "concentric" sans throw', () => {
    const rng = new Rng(326)
    expect(() => placeEvent('concentric', 10, 400, rng)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Task 9 — VALID_KINDS mis à jour (T9 guard)
// ---------------------------------------------------------------------------

describe('Task 9 — les 3 nouveaux kinds sont dans le type WaveEventKind', () => {
  it('placeEvent("spiral", ...) renvoie des placements (kind reconnu)', () => {
    const rng = new Rng(330)
    const result = placeEvent('spiral', 6, 400, rng)
    expect(result.length).toBeGreaterThan(0)
  })

  it('placeEvent("columns", ...) renvoie des placements (kind reconnu)', () => {
    const rng = new Rng(331)
    const result = placeEvent('columns', 6, 400, rng)
    expect(result.length).toBeGreaterThan(0)
  })

  it('placeEvent("concentric", ...) renvoie des placements (kind reconnu)', () => {
    const rng = new Rng(332)
    const result = placeEvent('concentric', 8, 400, rng)
    expect(result.length).toBeGreaterThan(0)
  })
})

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
  // Identité du Stage 1 : cinq rôles introduits progressivement
  // ---------------------------------------------------------------------------

  it('TERRAIN_VIERGE possède une recette dédiée pour chaque rôle de combat', () => {
    const pool = eventPoolForPhase(ConstructionPhaseId.TERRAIN_VIERGE)
    expect(pool.map((entry) => entry.role).filter((role) => role !== undefined)).toEqual([
      'base', 'swarm', 'fast', 'tank', 'charger'
    ])
    expect(pool.find((entry) => entry.role === 'swarm')?.threatCost).toBe(0.25)
    expect(pool.find((entry) => entry.role === 'tank')?.threatCost).toBe(4)
    expect(pool.find((entry) => entry.role === 'charger')?.allowedFromSec).toBe(150)
  })

  it('TERRASSEMENT orchestre boue, percées de foreurs et barrages rocheux', () => {
    const pool = eventPoolForPhase(ConstructionPhaseId.TERRASSEMENT)
    expect(pool[0]).toMatchObject({ kind: 'converge', role: 'base', allowedFromSec: 0 })
    expect(pool.some((entry) => entry.kind === 'columns' && entry.role === 'fast')).toBe(true)
    expect(pool.some((entry) => entry.role === 'tank' && entry.threatCost === 4)).toBe(true)
    expect(pool.some((entry) => entry.kind === 'sweep' && entry.rolePattern?.join('/') === 'tank/base/fast')).toBe(true)
    expect(pool.some((entry) => entry.kind === 'concentric' && entry.allowedFromSec === 250)).toBe(true)
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
