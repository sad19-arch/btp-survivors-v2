import { describe, it, expect } from 'vitest'
import { applyDeadzone } from '@input/gamepad'

describe('applyDeadzone', () => {
  it('retourne 0 sous le seuil', () => {
    expect(applyDeadzone(0.2, 0.35)).toBe(0)
  })

  it('retourne 0 exactement au seuil', () => {
    expect(applyDeadzone(0.35, 0.35)).toBe(0)
  })

  it('inclinaison max → magnitude 1 (re-scale)', () => {
    expect(applyDeadzone(1, 0.35)).toBeCloseTo(1)
  })

  it('conserve le signe (négatif)', () => {
    expect(applyDeadzone(-1, 0.35)).toBeCloseTo(-1)
  })

  it('re-scale une valeur médiane (discriminant vs clamp brut)', () => {
    // (0.675 - 0.35) / (1 - 0.35) = 0.325 / 0.65 = 0.5
    // Un clamp brut (Math.abs(v) > deadzone ? v : 0) renverrait 0.675, pas 0.5.
    expect(applyDeadzone(0.675, 0.35)).toBeCloseTo(0.5)
  })
})
