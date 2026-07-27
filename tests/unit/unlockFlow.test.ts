import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app/app'

describe('flux App des déblocages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('un personnage verrouillé reste visible mais ne peut pas être validé', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    app.confirm()
    expect(app.getState().screen).toBe('characterSelect')
    for (let index = 0; index < 6; index++) {
      app.nav('right')
    }
    const charpentier = app.getState().characterSelect?.players[0]
    expect(charpentier).toMatchObject({ charId: 'charpentier', unlocked: false, ready: false })
    app.confirm()
    expect(app.getState().screen).toBe('characterSelect')
    expect(app.getState().characterSelect?.players[0]?.ready).toBe(false)
  })

  it('l’évolution réelle du Cloueur ouvre le Charpentier, le célèbre et garde Nouveau jusqu’à son usage', () => {
    const app = new App({ seed: 42, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [{ id: 'cloueur', level: 8 }],
      passives: [{ id: 'air_comprime', level: 1 }]
    })
    app.debugSpawnChestOnPlayer()
    app.advanceTime(200)
    expect(app.getState().unlockProgress.unlockedContentIds).toContain('charpentier')
    expect(app.getState().unlockProgress.newContentIds).toContain('charpentier')

    app.confirm()
    app.advanceTime(200)
    app.debugKillPlayer()
    app.advanceTime(20)
    const report = app.getState()
    expect(report.screen).toBe('gameover')
    expect(report.unlockProgress.primary).toMatchObject({
      unlockId: 'unlock_charpentier',
      completed: true,
      rewardName: 'Charpentier'
    })

    const next = new App({ seed: 42, mode: 'solo', autostart: false })
    next.confirm()
    for (let index = 0; index < 6; index++) {
      next.nav('right')
    }
    expect(next.getState().characterSelect?.players[0]).toMatchObject({
      charId: 'charpentier',
      unlocked: true,
      isNew: true
    })
    next.confirm()
    expect(next.getState().screen).toBe('game')
    expect(next.getState().unlockProgress.newContentIds).not.toContain('charpentier')
  })

  it('les prisonniers progressent malgré une défaite et se cumulent sur la partie suivante', () => {
    const first = new App({ seed: 7, mode: 'solo', autostart: true })
    first.debugEnragePrisoner()
    first.debugEnragePrisoner()
    expect(first.getState().unlockProgress.primary?.progressLabel).toContain('2/5')
    first.debugKillPlayer()
    first.advanceTime(20)
    expect(first.getState().screen).toBe('gameover')

    const second = new App({ seed: 8, mode: 'solo', autostart: true })
    second.debugEnragePrisoner()
    second.debugEnragePrisoner()
    second.debugEnragePrisoner()
    const state = second.getState().unlockProgress
    expect(state.unlockedContentIds).toContain('ouvriere')
    expect(state.newContentIds).toContain('ouvriere')
  })
})
