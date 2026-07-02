import { describe, it, expect } from 'vitest'
import { musicForState, MUSIC, SFX, SFX_FILES, MUSIC_FILES } from '@/audio/manifest'
import { clamp01, musicGain, sfxGain, type AudioLevels } from '@/audio/settings'
import { Simulation } from '@core/simulation'

describe('audio — musique par état (pure)', () => {
  const g = (screen: string, stageId: string, bossPresent = false): string | null =>
    musicForState({ screen, stageId, bossPresent })

  it('titre → piste titre ; gameover → silence', () => {
    expect(g('title', 'terrain_vierge')).toBe(MUSIC.title)
    expect(g('gameover', 'terrain_vierge')).toBeNull()
    expect(g('victory', 'terrain_vierge')).toBe(MUSIC.victory)
    expect(g('paused', 'terrain_vierge')).toBe(MUSIC.menu)
  })

  it('boss présent → musique boss (prioritaire)', () => {
    expect(g('game', 'finitions', true)).toBe(MUSIC.boss)
  })

  it('rotation des 3 pistes par phase', () => {
    expect(g('game', 'terrain_vierge')).toBe(MUSIC.stage_a)
    expect(g('game', 'livraison_audit')).toBe(MUSIC.stage_a)
    expect(g('game', 'fondations')).toBe(MUSIC.stage_b)
    expect(g('game', 'echafaudages')).toBe(MUSIC.stage_b)
    expect(g('game', 'charpente_toiture')).toBe(MUSIC.stage_c)
    expect(g('game', 'finitions')).toBe(MUSIC.stage_c)
  })

  it("l'upgrade garde la musique de jeu (pas de switch à chaque niveau)", () => {
    expect(g('upgrade', 'terrain_vierge')).toBe(MUSIC.stage_a)
  })
})

describe('audio — cohérence manifeste ↔ préchargement', () => {
  it('chaque cue SFX ne référence que des clés préchargées', () => {
    const loaded = new Set(SFX_FILES.map(([k]) => k))
    for (const [name, cue] of Object.entries(SFX)) {
      expect(cue.keys.length, name).toBeGreaterThan(0)
      for (const key of cue.keys) {
        expect(loaded.has(key), `${name} → ${key} non préchargé`).toBe(true)
      }
    }
  })

  it('chaque musique référencée est préchargée', () => {
    const loaded = new Set(MUSIC_FILES.map(([k]) => k))
    for (const key of Object.values(MUSIC)) {
      expect(loaded.has(key), `${key} non préchargé`).toBe(true)
    }
  })
})

describe('audio — réglages (gains)', () => {
  const base: AudioLevels = { master: 0.5, music: 0.8, sfx: 0.6, muted: false }
  it('gain = master × canal ; muet → 0', () => {
    expect(musicGain(base)).toBeCloseTo(0.4)
    expect(sfxGain(base)).toBeCloseTo(0.3)
    expect(musicGain({ ...base, muted: true })).toBe(0)
    expect(sfxGain({ ...base, muted: true })).toBe(0)
  })
  it('clamp01 borne 0..1', () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(0.3)).toBe(0.3)
  })
})

describe('audio — la sim émet les événements sémantiques', () => {
  it('enemyKilled et weaponFired sont émis en jeu réel', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    let killed = 0
    let fired = 0
    sim.events.addEventListener('enemyKilled', () => { killed += 1 })
    sim.events.addEventListener('weaponFired', () => { fired += 1 })
    for (let t = 0; t < 60000 && killed < 1; t += 100) {
      sim.advanceTime(100)
    }
    expect(fired).toBeGreaterThan(0) // le cloueur tire automatiquement
    expect(killed).toBeGreaterThan(0) // des ennemis meurent → SFX
  })
})
