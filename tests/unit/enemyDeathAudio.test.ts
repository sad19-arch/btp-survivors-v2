import { describe, expect, it } from 'vitest'
import { enemyDeathCue, SFX } from '@/audio/manifest'
import { AudioDirector } from '@/audio/audioDirector'
import { EnemyDiedEvent } from '@core/events'
import type { AudioLevels } from '@/audio/settings'

describe('signature sonore des morts du stage 1', () => {
  it.each([
    ['paperasse', 'deathStage01Small'],
    ['inspecteur', 'deathStage01Fast'],
    ['huissier', 'deathStage01Brute']
  ])('mappe %s vers %s', (type, cue) => {
    expect(enemyDeathCue(type)).toBe(cue)
  })

  it('conserve le fallback générique pour un type non traité', () => {
    expect(enemyDeathCue('enemy_stage02')).toBe('enemyKilled')
  })

  it('applique un throttle indépendant adapté à chaque gabarit', () => {
    expect(SFX.deathStage01Small?.throttleMs).toBe(70)
    expect(SFX.deathStage01Fast?.throttleMs).toBe(90)
    expect(SFX.deathStage01Brute?.throttleMs).toBe(180)
  })
})

describe('routage AudioDirector', () => {
  const settings: AudioLevels = { master: 1, music: 1, sfx: 1, muted: false }
  const death = (type: string): EnemyDiedEvent => new EnemyDiedEvent(0, 0, type, false, undefined, undefined, undefined, undefined)

  function fixture(): { events: EventTarget; played: string[] } {
    const events = new EventTarget()
    const played: string[] = []
    const manager = {
      locked: false,
      play: (key: string) => { played.push(key); return true },
      add: () => ({ play: () => true, stop: () => true, destroy: () => undefined, once: () => undefined, volume: 0, isPlaying: false }),
      game: { cache: { audio: { exists: () => true } } }
    } as unknown as Phaser.Sound.BaseSoundManager
    new AudioDirector(manager, events, () => settings)
    return { events, played }
  }

  it('une mort spécialisée ne joue jamais aussi le cue générique agrégé', () => {
    const { events, played } = fixture()
    events.dispatchEvent(new Event('enemyKilled'))
    events.dispatchEvent(death('paperasse'))
    expect(played).toHaveLength(1)
    expect(played[0]).toMatch(/^sfx_death_stage01_small_/)
  })

  it('une mort non traitée joue le fallback générique', () => {
    const { events, played } = fixture()
    events.dispatchEvent(death('enemy_stage02'))
    expect(played[0]).toMatch(/^sfx_(explosion_[1-4]|soft_destruction)$/)
  })

  it('borne une rafale de morts de la même famille', () => {
    const { events, played } = fixture()
    for (let i = 0; i < 50; i += 1) {
      events.dispatchEvent(death('huissier'))
    }
    expect(played).toHaveLength(1)
  })
})
