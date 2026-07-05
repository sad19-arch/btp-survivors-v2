import type Phaser from 'phaser'
import type { AppViewState } from '@/app/appState'
import type { WeaponFiredEvent, PickupCollectedEvent, BossSpawnedEvent } from '@core/events'
import { SFX, VOICE, voiceStage, musicForState, AMB, type MusicKey } from './manifest'
import { musicGain, sfxGain, duckedGain, type AudioLevels } from './settings'
import { playZzfx, createWhirLoop, type ZzfxLoop } from './zzfx'
import { weaponZzfx } from './weaponSfx'

/** Instance de son loopée (sous-ensemble commun WebAudio/HTML5, découplé de Phaser). */
interface SoundInstance {
  volume: number
  /** Vrai tant que le son joue (Phaser `BaseSound.isPlaying`) → pilote le ducking. */
  isPlaying: boolean
  play: () => boolean
  stop: () => boolean
  destroy: () => void
  /** S'abonne une fois à un événement (ex. 'complete') — Phaser `EventEmitter.once`. */
  once: (event: string, fn: () => void) => void
}

const FADE_STEP = 0.045 // montée/descente du volume musique/ambiance par frame
const AMB_LEVEL = 0.5 // l'ambiance joue à ~50 % du volume musique (nappe discrète)
const VOICE_LEVEL = 1.0 // la voix passe au volume plein du canal SFX (annonces claires)
const MUSIC_DUCK = 0.28 // pendant une voix, la musique tombe à ~28 % (annonceur au-dessus)
const AMB_DUCK = 0.15 // et l'ambiance quasi muette (~15 %) pour dégager la voix
const WEAPON_THROTTLE_MS = 55 // délai min entre deux SFX d'une MÊME arme (anti-double)
const SAW_LOOP_LEVEL = 0.28 // volume du ronronnement de scie (× gain SFX)

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
  /** Contexte WebAudio partagé (celui de Phaser) pour les SFX procéduraux zzfx ; null si HTML5. */
  private readonly audioCtx: AudioContext | null
  /** Ronronnement continu de la scie (créé à la demande, coupé hors gameplay). */
  private sawLoop: ZzfxLoop | null = null

  constructor(sound: Phaser.Sound.BaseSoundManager, events: EventTarget, getSettings: () => AudioLevels) {
    this.sound = sound
    this.getSettings = getSettings
    this.settings = getSettings()
    // Réutilise le contexte WebAudio de Phaser (unifie unlock/suspend) — pas de 2e AudioContext.
    this.audioCtx = (sound as unknown as { context?: AudioContext }).context ?? null
    events.addEventListener('audioSettings', () => { this.settings = this.getSettings() })
    this.bindEvents(events)
  }

  // --- SFX + VOIX déclenchés par les événements de l'App ---------------------

  private bindEvents(events: EventTarget): void {
    const on = (name: string, fn: (e: Event) => void): void => { events.addEventListener(name, fn) }
    on('enemyKilled', () => { this.playCue('enemyKilled') })
    on('playerHurt', () => { this.playCue('playerHurt') })
    on('levelUp', () => { this.playCue('levelUp') })
    // SFX procédural PAR ARME (zzfx) : chaque arme discrète émet weaponFired(id).
    // La scie (continue) est exclue à la source → gérée en boucle (updateSawLoop).
    on('weaponFired', (e) => { this.playWeaponSfx((e as WeaponFiredEvent).kind) })
    on('pickupCollected', (e) => {
      const kind = (e as PickupCollectedEvent).kind
      if (kind === 'xp') {
        this.playCue('collect')
      } else {
        this.playCue('bonus')
        this.playVoice(VOICE.bonus)
      }
    })
    on('bossSpawned', (e) => {
      this.playCue('bossSpawned')
      // Le boss final a une réplique dédiée (plus forte) — le mid-boss garde le pool générique.
      const role = (e as BossSpawnedEvent).role
      this.playVoice(role === 'final' ? VOICE.bossFinal : VOICE.boss)
    })
    // (Plus de SFX générique sur `auraPulse` : aura/sweep/strike/cône sonnent
    // désormais par ARME via `weaponFired`/zzfx. L'auraPulse reste pour les VFX.)
    on('prisonerFreed', () => { this.playCue('prisonerFreed'); this.playVoice(VOICE.thankyou) })
    // Fanfare d'évolution (coffre ramassé + conditions réunies) : cue existant + voix triomphante.
    on('evolved', () => { this.playCue('bonus'); this.playVoice(VOICE.bonus) })
    on('upgradePick', () => { this.playCue('upgradePick') })
    on('menuMove', () => { this.playCue('menuMove') })
    on('menuConfirm', () => { this.playCue('menuConfirm') })
    on('menuBack', () => { this.playCue('menuBack') })
  }

  /** `rateMul` : multiplicateur de hauteur additionnel (ex. varier une même cue par sorte d'arme). */
  private playCue(name: string, rateMul = 1): void {
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
    this.sound.play(key, { volume: cue.volume * sfxGain(this.settings), rate: (cue.rate ?? 1) * rateMul * (1 + jitter) })
  }

  /**
   * SFX procédural (zzfx) d'une arme, par ID, throttlé et au gain SFX courant
   * (0/mute → rien). Variation par tir intrinsèque à zzfx (`randomness`). La scie
   * est exclue (son continu géré par `updateSawLoop`).
   */
  private playWeaponSfx(id: string): void {
    if (this.audioCtx === null || this.isLocked()) {
      return
    }
    const gain = sfxGain(this.settings)
    if (gain <= 0) {
      return
    }
    const now = performance.now()
    const last = this.lastSfx.get(`w_${id}`) ?? -1e9
    if (now - last < WEAPON_THROTTLE_MS) {
      return
    }
    this.lastSfx.set(`w_${id}`, now)
    playZzfx(this.audioCtx, gain, weaponZzfx(id))
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
    this.stopVoice()
    const snd = this.sound.add(key, { volume: VOICE_LEVEL * sfxGain(this.settings) }) as unknown as SoundInstance
    // Auto-nettoyage en fin de réplique → relâche le ducking (voix devient inactive).
    snd.once('complete', () => {
      if (this.voice === snd) {
        this.voice = null
        snd.destroy()
      }
    })
    snd.play()
    this.voice = snd
  }

  /** Coupe la voix courante (met `voice` à null AVANT destroy → pas de double-destroy). */
  private stopVoice(): void {
    const v = this.voice
    if (v !== null) {
      this.voice = null
      v.stop()
      v.destroy()
    }
  }

  /** Vrai tant qu'une réplique d'annonceur joue → la musique/ambiance ducke. */
  private voiceActive(): boolean {
    return this.voice !== null && this.voice.isPlaying
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
    this.updateSawLoop(state)
  }

  /**
   * Ronronnement continu de la scie orbitale : actif tant qu'un joueur VIVANT a
   * la scie en jeu (écran gameplay). Volume rampé sur le gain SFX ; coupé hors
   * gameplay ou au mute. Un seul oscillateur, arrêté proprement (pas de fuite).
   */
  private updateSawLoop(state: AppViewState): void {
    if (this.audioCtx === null) {
      return
    }
    const wantSaw =
      GAMEPLAY_SCREENS.has(state.screen) &&
      state.players.some((p) => p.alive && p.inventory.weapons.some((w) => w.id === 'scie'))
    if (!wantSaw) {
      if (this.sawLoop !== null) {
        this.sawLoop.stop()
        this.sawLoop = null
      }
      return
    }
    if (this.sawLoop === null) {
      this.sawLoop = createWhirLoop(this.audioCtx)
    }
    this.sawLoop.setVolume(this.isLocked() ? 0 : sfxGain(this.settings) * SAW_LOOP_LEVEL)
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
    const target = duckedGain(musicGain(this.settings), this.voiceActive(), MUSIC_DUCK)
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
    const base = GAMEPLAY_SCREENS.has(screen) ? musicGain(this.settings) * AMB_LEVEL : 0
    const target = duckedGain(base, this.voiceActive(), AMB_DUCK)
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
