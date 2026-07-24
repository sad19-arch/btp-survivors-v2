import { describe, expect, it } from 'vitest'
import { activeMove, BOT_NAMES } from '../../tools/sim/bots'

describe('bot active', () => {
  it('est la référence affichée avant les scénarios limites', () => {
    expect(BOT_NAMES[0]).toBe('active')
  })

  it('va vers une ressource sûre', () => {
    const move = activeMove({ x: 800, y: 600 }, [], [{ x: 900, y: 600 }])
    expect(move.x).toBeGreaterThan(0)
    expect(Math.abs(move.y)).toBeLessThan(0.001)
  })

  it('fuit un ennemi proche même si une ressource se trouve derrière lui', () => {
    const move = activeMove({ x: 800, y: 600 }, [{ x: 850, y: 600 }], [{ x: 900, y: 600 }])
    expect(move.x).toBeLessThan(0)
  })

  it('ignore une ressource encerclée', () => {
    const move = activeMove({ x: 800, y: 600 }, [{ x: 950, y: 600 }], [{ x: 940, y: 600 }])
    expect(move.x).toBeLessThanOrEqual(0)
  })
})
