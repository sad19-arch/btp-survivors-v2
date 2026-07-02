import type Phaser from 'phaser'
import type { AppViewState } from '@/app/appState'
import type { WeaponFiredEvent, PickupCollectedEvent } from '@core/events'
import { SFX, musicForState, type MusicKey } from './manifest'
import { musicGain, sfxGain, type AudioLevels } from './settings'

/** Instance de musique (sous-ensemble commun WebAudio/HTML5, découplé du type Phaser). */
interface MusicInstance {
  volume: number
  play: () => boolean
  stop: () => boolean
  destroy: () => void
}

const FADE_STEP = 0.045 // ~ montée/descente du volume musique par frame (crossfade)

/**
 * Chef d'orchestre audio (couche rendu — jamais dans `src/core`). Persistant sur
 * la durée du jeu (créé une fois dans `main`). Les SFX réagissent aux événements
 * de l'App ; la musique est choisie par observation de l'état (crossfade entre
 * pistes). Déterminisme du cœur intact : ce module ne fait qu'observer.
 */
export class AudioDirector {
  private readonly sound: Phaser.Sound.BaseSoundManager
  /** Niveaux courants, rafraîchis depuis l'App (qui possède l'écran Options). */
  private settings: AudioLevels
  private readonly getSettings: () => AudioLevels
  private currentKey: MusicKey | null = null
  private current: MusicInstance | null = null
  private fading: MusicInstance | null = null
  private readonly lastSfx = new Map<string, number>()
  private prevScreen = ''

  constructor(sound: Phaser.Sound.BaseSoundManager, events: EventTarget, getSettings: () => AudioLevels) {
    this.sound = sound
    this.getSettings = getSettings
    this.settings = getSettings()
    events.addEventListener('audioSettings', () => { this.settings = this.getSettings() })
    this.bindSfx(events)
  }

  // --- SFX (déclenchés par les événements de l'App) -------------------------

  private bindSfx(events: EventTarget): void {
    const on = (name: string, fn: (e: Event) => void): void => { events.addEventListener(name, fn) }
    on('enemyKilled', () => { this.playCue('enemyKilled') })
    on('playerHurt', () => { this.playCue('playerHurt') })
    on('levelUp', () => { this.playCue('levelUp') })
    on('weaponFired', (e) => {
      const kind = (e as WeaponFiredEvent).kind
      if (kind === 'cloueur') {
        this.playCue('weapon_cloueur')
      }
    })
    on('pickupCollected', (e) => {
      const kind = (e as PickupCollectedEvent).kind
      this.playCue(kind === 'xp' ? 'collect' : 'bonus')
    })
    on('bossSpawned', () => { this.playCue('bossSpawned') })
    on('auraPulse', () => { this.playCue('auraPulse') })
    on('prisonerFreed', () => { this.playCue('prisonerFreed') })
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
    const key = cue.keys[Math.floor(Math.random() * cue.keys.length)] ?? cue.keys[0]
    if (key === undefined || !this.hasAudio(key)) {
      return
    }
    const jitter = cue.rateJitter !== undefined ? (Math.random() * 2 - 1) * cue.rateJitter : 0
    const rate = (cue.rate ?? 1) * (1 + jitter)
    this.sound.play(key, { volume: cue.volume * sfxGain(this.settings), rate })
  }

  // --- Musique (choisie par observation de l'état, appelée chaque frame) -----

  /** À appeler chaque frame avec la vue de l'App. */
  observe(state: AppViewState): void {
    if (this.isLocked()) {
      return // attend le déverrouillage WebAudio (1er geste utilisateur)
    }
    // Stingers one-shot au changement d'écran.
    if (state.screen !== this.prevScreen) {
      if (state.screen === 'gameover') {
        this.playCue('gameOver')
      } else if (state.screen === 'victory') {
        this.playCue('stageClear')
      }
      this.prevScreen = state.screen
    }
    const bossPresent = state.enemies.some((e) => e.isBoss)
    const desired = musicForState({ screen: state.screen, stageId: state.stageId, bossPresent })
    if (desired !== this.currentKey) {
      this.switchMusic(desired)
    }
    this.rampMusic()
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
      const snd = this.sound.add(next, { loop: true, volume: 0 }) as unknown as MusicInstance
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

  // --- utilitaires -----------------------------------------------------------

  private isLocked(): boolean {
    return (this.sound as unknown as { locked?: boolean }).locked === true
  }

  private hasAudio(key: string): boolean {
    return this.sound.game.cache.audio.exists(key)
  }
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
