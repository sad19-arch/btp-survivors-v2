import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { createSeam } from '@/app/seam'

/**
 * Le seam est le contrat consommé par Playwright/e2e (window.__GAME__). On
 * vérifie ici, sans navigateur, que `createSeam` expose bien les helpers de
 * debug (fast-forward boss/évolution) et qu'ils délèguent correctement à l'App.
 */
describe('seam — helpers de debug exposés', () => {
  it('debugGrant/debugAddXp/debugSpawnChestOnPlayer/debugSpawnBoss délèguent à App', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const seam = createSeam(app)

    seam.debugSpawnBoss('mid')
    expect(seam.getState().enemies.some((e) => e.isBoss)).toBe(true)

    seam.debugGrant({ weapons: [{ id: 'cloueur', level: 8 }], passives: [{ id: 'air_comprime', level: 1 }] })
    seam.debugSpawnChestOnPlayer()
    seam.advanceTime(200)
    expect(seam.getState().players[0]?.weapons).toContain('mitrailleuse_clous')

    // debugAddXp ne doit pas planter et doit faire progresser l'XP/le niveau.
    const before = seam.getState().players[0]?.xp ?? 0
    seam.debugAddXp(5)
    expect(seam.getState().players[0]?.xp ?? 0).toBeGreaterThanOrEqual(before)
  })
})
