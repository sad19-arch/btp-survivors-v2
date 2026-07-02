import type Phaser from 'phaser'
import type { AppViewState } from '@/app/appState'
import type { WeaponFiredEvent, PickupCollectedEvent } from '@core/events'
import { SFX, VOICE, voiceStage, musicForState, AMB, type MusicKey } from './manifest'
import { musicGain, sfxGain, type AudioLevels } from './settings'

/** Instance de son loopée (sous-ensemble commun WebAudio/HTML5, découplé de Phaser). */
interface SoundInstance {
  volume: number
  play: () => boolean
  stop: () => boolean
  destroy: () => void
}

const FADE_STEP = 0.045 // montée/descente du volume musique/ambiance par frame
const AMB_LEVEL = 0.5 // l'ambiance joue à ~50 % du volume musique (nappe discrète)
const VOICE_LEVEL = 1.0 // la voix passe au volume plein du canal SFX (annonces claires)

/** Écrans où l'ambiance de chantier tourne (nappe de fond). */
const GAMEPLAY_SCREENS = new Set(['game', 'upgrade', 'paused'])
/** Écrans depuis lesquels passer à 'game' = DÉBUT de run (pas une reprise / fermeture d'upgrade). */
const RUN_START_FROM = new Set(['title', 'victory', 'gameover', ''])

/**
 * Chef d'orchestre audio (couche rendu — jamais dans `src/core`). Persistant sur
 * la durée du jeu. SFX + VOIX réagissent aux événements/écrans ; la musique et
 * l'ambiance sont choisies par observation de l'état (crossfade). Le cœur n'est
 * qu'observé → déterminisme intact.
 */
export class AudioDirector {
  private readonly sound: Phaser.Sound.BaseSoundManager
  private settings: AudioLevels
  private readonly getSettings: () => AudioLevels
  private currentKey: MusicKey | null = null
  private current: SoundInstance | null = null
  private fading: SoundInstance | null = null
  private amb: SoundInstance | null = null
  private voice: SoundInstance | null = null
  private readonly lastSfx = new Map<string, number>()
  private prevScreen = ''
  private presentsPlayed = false

  constructor(sound: Phaser.Sound.BaseSoundManager, events: EventTarget, getSettings: () => AudioLevels) {
    this.sound = sound
    this.getSettings = getSettings
    this.settings = getSettings()
    events.addEventListener('audioSettings', () => { this.settings = this.getSettings() })
    this.bindEvents(events)
  }

  // --- SFX + VOIX déclenchés par les événements de l'App ---------------------

  private bindEvents(events: EventTarget): void {
    const on = (name: string, fn: (e: Event) => void): void => { events.addEventListener(name, fn) }
    on('enemyKilled', () => { this.playCue('enemyKilled') })
    on('playerHurt', () => { this.playCue('playerHurt') })
    on('levelUp', () => { this.playCue('levelUp') })
    on('weaponFired', (e) => {
      if ((e as WeaponFiredEvent).kind === 'cloueur') {
        this.playCue('weapon_cloueur')
      }
    })
    on('pickupCollected', (e) => {
      const kind = (e as PickupCollectedEvent).kind
      if (kind === 'xp') {
        this.playCue('collect')
      } else {
        this.playCue('bonus')
        this.playVoice(VOICE.bonus)
      }
    })
    on('bossSpawned', () => { this.playCue('bossSpawned'); this.playVoice(VOICE.boss) })
    on('auraPulse', () => { this.playCue('auraPulse') })
    on('prisonerFreed', () => { this.playCue('prisonerFreed'); this.playVoice(VOICE.thankyou) })
    on('upgradePick', () => { this.playCue('upgradePick') })
    on('menuMove', () => { this.playCue('menuMove') })
    on('menuConfirm', () => { this.playCue('menuConfirm') })
    on('menuBack', () => { this.playCue('menuBack') })
  }

  private playCue(name: string): void {
    if (this.isLocked()) {
      return
    }
    const cue = SFX[name]
    if (cue === undefined) {
      return
    }
    const now = performance.now()
    if (cue.throttleMs !== undefined) {
      const last = this.lastSfx.get(name) ?? -1e9
      if (now - last < cue.throttleMs) {
        return
      }
      this.lastSfx.set(name, now)
    }
    const key = pick(cue.keys)
    if (key === undefined || !this.hasAudio(key)) {
      return
    }
    const jitter = cue.rateJitter !== undefined ? (Math.random() * 2 - 1) * cue.rateJitter : 0
    this.sound.play(key, { volume: cue.volume * sfxGain(this.settings), rate: (cue.rate ?? 1) * (1 + jitter) })
  }

  /** Joue une réplique de voix (canal unique : coupe la précédente, pas de chevauchement). */
  private playVoice(pool: readonly string[]): void {
    if (this.isLocked()) {
      return
    }
    const key = pick(pool)
    if (key === undefined || !this.hasAudio(key)) {
      return
    }
    if (this.voice !== null) {
      this.voice.stop()
      this.voice.destroy()
      this.voice = null
    }
    const snd = this.sound.add(key, { volume: VOICE_LEVEL * sfxGain(this.settings) }) as unknown as SoundInstance
    snd.play()
    this.voice = snd
  }

  // --- Musique + ambiance + voix d'écran (observation de l'état, chaque frame) -

  observe(state: AppViewState): void {
    if (this.isLocked()) {
      return // attend le déverrouillage WebAudio (1er geste utilisateur)
    }
    // Jingle « AIL Entertainment presents » au premier affichage du titre.
    if (state.screen === 'title' && !this.presentsPlayed) {
      this.presentsPlayed = true
      this.playVoice(VOICE.intro)
    }
    // Voix + stingers au CHANGEMENT d'écran.
    if (state.screen !== this.prevScreen) {
      this.onScreenEnter(state)
      this.prevScreen = state.screen
    }
    // Musique de fond (boss prioritaire, rotation par phase).
    const bossPresent = state.enemies.some((e) => e.isBoss)
    const desired = musicForState({ screen: state.screen, stageId: state.stageId, bossPresent })
    if (desired !== this.currentKey) {
      this.switchMusic(desired)
    }
    this.rampMusic()
    this.rampAmbience(state.screen)
  }

  private onScreenEnter(state: AppViewState): void {
    switch (state.screen) {
      case 'gameover':
        this.playCue('gameOver')
        this.playVoice(VOICE.gameover)
        break
      case 'victory': {
        this.playCue('stageClear')
        const p = state.players[0]
        const flawless = p !== undefined && p.hp >= p.maxHp - 0.5
        this.playVoice(flawless ? VOICE.flawless : VOICE.victory)
        break
      }
      case 'upgrade':
        if (Math.random() < 0.5) {
          this.playVoice(VOICE.upgrade) // « Choose your destiny » / « Keep going », par intermittence
        }
        break
      case 'game':
        if (RUN_START_FROM.has(this.prevScreen)) {
          this.playVoice([voiceStage(state.stageOrder), ...VOICE.runStart])
        }
        break
      default:
        break
    }
  }

  private switchMusic(next: MusicKey | null): void {
    if (this.current !== null) {
      if (this.fading !== null) {
        this.fading.stop()
        this.fading.destroy()
      }
      this.fading = this.current
      this.current = null
    }
    this.currentKey = next
    if (next !== null && this.hasAudio(next)) {
      const snd = this.sound.add(next, { loop: true, volume: 0 }) as unknown as SoundInstance
      snd.play()
      this.current = snd
    }
  }

  private rampMusic(): void {
    const target = musicGain(this.settings)
    if (this.current !== null) {
      this.current.volume = approach(this.current.volume, target, FADE_STEP)
    }
    if (this.fading !== null) {
      const v = approach(this.fading.volume, 0, FADE_STEP)
      this.fading.volume = v
      if (v <= 0.001) {
        this.fading.stop()
        this.fading.destroy()
        this.fading = null
      }
    }
  }

  private rampAmbience(screen: string): void {
    const target = GAMEPLAY_SCREENS.has(screen) ? musicGain(this.settings) * AMB_LEVEL : 0
    if (this.amb === null) {
      if (target <= 0 || !this.hasAudio(AMB)) {
        return
      }
      const snd = this.sound.add(AMB, { loop: true, volume: 0 }) as unknown as SoundInstance
      snd.play()
      this.amb = snd
    }
    this.amb.volume = approach(this.amb.volume, target, FADE_STEP)
  }

  // --- utilitaires -----------------------------------------------------------

  private isLocked(): boolean {
    return (this.sound as unknown as { locked?: boolean }).locked === true
  }

  private hasAudio(key: string): boolean {
    return this.sound.game.cache.audio.exists(key)
  }
}

function pick(pool: readonly string[]): string | undefined {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]
}

function approach(v: number, target: number, step: number): number {
  if (v < target) {
    return Math.min(target, v + step)
  }
  if (v > target) {
    return Math.max(target, v - step)
  }
  return v
}
