import { describe, expect, it } from 'vitest'
import { activeMove, BOT_NAMES, greedyMove } from '../../tools/sim/bots'

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

  it('se recentre vers le vrai centre du monde, pas vers l’ancienne arène 1600×1200', () => {
    const move = activeMove({ x: 5120, y: 100 }, [], [])
    expect(Math.abs(move.x)).toBeLessThan(0.001)
    expect(move.y).toBeGreaterThan(0)
  })
})

describe('bot greedy mobile', () => {
  it('court vers une ressource quand la voie est libre', () => {
    const move = greedyMove({ x: 100, y: 100 }, [], [{ x: 200, y: 100 }])
    expect(move.x).toBeGreaterThan(0)
  })

  it('évite un contact immédiat au lieu de traverser volontairement un ennemi', () => {
    const move = greedyMove(
      { x: 100, y: 100 },
      [{ x: 130, y: 100 }],
      [{ x: 200, y: 100 }]
    )
    expect(move.x).toBeLessThan(0)
  })
})
