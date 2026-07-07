import type Phaser from 'phaser'
import type { AppViewState } from '@/app/appState'
import type { WeaponFiredEvent, PickupCollectedEvent, BossSpawnedEvent } from '@core/events'
import { SFX, VOICE, voiceRunStart, musicForState, MUSIC, AMB, type MusicKey } from './manifest'
import { musicGain, sfxGain, duckedGain, type AudioLevels } from './settings'
import { playZzfx } from './zzfx'
import { weaponZzfx } from './weaponSfx'

/**
 * Retourne la clé de voix à jouer au Nième level-up (compteur 0-based).
 * Alterne entre les deux clips du pool `VOICE.upgrade` selon la parité.
 * Fonction PURE — pas de `Math.random`, testable en Vitest.
 */
export function pickUpgradeVoice(count: number): string {
  const pool = VOICE.upgrade
  return pool[count % pool.length] ?? pool[0] ?? 'voice_choose_your_destiny'
}

/**
 * B4 — Décision de throttle pour le ding de gemme XP.
 * Fonction PURE exportée pour les tests Vitest.
 * Retourne `true` si le ding peut être joué (délai écoulé depuis le dernier).
 * @param lastMs  Horodatage du dernier ding joué (-Infinity si jamais joué).
 * @param nowMs   Horodatage courant.
 * @param throttleMs  Délai minimal entre deux dings (ms).
 */
export function canPlayXpDing(lastMs: number, nowMs: number, throttleMs: number): boolean {
  return nowMs - lastMs >= throttleMs
}

/**
 * B5 — Fanfare de coffre/évolution (ZzFX procédural).
 * Accord majeur ascendant court : 3 notes courtes + sustain grave → son de victoire arcade 16-bit.
 * Paramètres : [volume, randomness, freq, attack, sustain, release, shape, shapeCurve, slide, ...].
 * Jouée en rafale (3 notes décalées) depuis `playChestFanfare`.
 * Exportée pour tests Vitest si nécessaire.
 */
export const CHEST_FANFARE_NOTES: readonly (readonly number[])[] = [
  // Note 1 : do5 court (262 Hz × 2 = 523 Hz), triangle vif
  [0.55, 0.01, 523, 0.005, 0, 0.07, 1, 1.2, 0.05],
  // Note 2 : mi5 (659 Hz), légère slide montante
  [0.55, 0.01, 659, 0.005, 0, 0.08, 1, 1.2, 0.08],
  // Note 3 : sol5 (784 Hz) + sustain → fanfare
  [0.65, 0.01, 784, 0.005, 0.04, 0.18, 1, 1.3, 0.03]
] as const

/** Clés de musique qui ne doivent PAS boucler (lecture unique, ex. jingle court). */
const NON_LOOPING_MUSIC = new Set<MusicKey>([MUSIC.gameover])

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
/** Délai min entre deux dings de gemme XP (anti-saturation horde). */
const GEM_DING_THROTTLE_MS = 50
/**
 * Vecteur ZzFX du "ding" de ramassage de gemme XP.
 * Sinus court, haute fréquence, slide montant → son cristallin et distinct.
 * Paramètres : [volume, randomness, freq, attack, sustain, release, shape, shapeCurve, slide].
 */
const GEM_DING_ZZFX: readonly number[] = [0.28, 0.01, 1400, 0, 0, 0.1, 0, 1.6, 0.12]

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
  /** Compteur de level-ups, pour l'alternance des voix (pair/impair). */
  private upgradeVoiceCount = 0
  /** « Finish him » dit une seule fois par boss (remis à zéro quand le boss disparaît). */
  private bossFinishSaid = false
  /** Appel à l'aide dit une fois par passage en PV bas (hystérésis pour re-déclencher). */
  private playerLowSaid = false
  /** Dernier « enemy down » (throttle : voix de kill occasionnelle, pas à chaque mort). */
  private lastEnemyDownMs = -Infinity
  /** Contexte WebAudio partagé (celui de Phaser) pour les SFX procéduraux zzfx ; null si HTML5. */
  private readonly audioCtx: AudioContext | null
  /**
   * Garde anti-chevauchement : priorité de la voix déjà lancée dans ce tick.
   * Remis à 0 au début de chaque observe(). Toute nouvelle voix de priorité ≤ cette valeur
   * est droppée silencieusement. Les événements injectés HORS observe() (ex. bossSpawned
   * depuis le bus) obtiennent un tick propre dès que observe() tourne.
   */
  private voicePriorityThisTick = 0

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
    on('enemyKilled', () => {
      this.playCue('enemyKilled')
      // Voix « enemy down » OCCASIONNELLE (throttle ~18s) et seulement si aucune
      // annonce n'est en cours (ne coupe pas une réplique d'écran/boss).
      const now = performance.now()
      if (now - this.lastEnemyDownMs > 18000 && !this.voiceActive()) {
        this.lastEnemyDownMs = now
        this.playVoice(VOICE.enemyDown, 1)
      }
    })
    on('playerHurt', () => { this.playCue('playerHurt') })
    on('levelUp', () => { this.playCue('levelUp') })
    // SFX procédural PAR ARME (zzfx) : chaque arme discrète émet weaponFired(id).
    // La scie reste silencieuse (pas de boucle de ronronnement — trop insupportable).
    on('weaponFired', (e) => { this.playWeaponSfx((e as WeaponFiredEvent).kind) })
    on('pickupCollected', (e) => {
      const kind = (e as PickupCollectedEvent).kind
      if (kind === 'xp') {
        // B4 : ding zzfx cristallin throttlé 50ms (remplace le cue collect générique).
        this.playXpDing()
      } else if (kind === 'coffre') {
        // Le coffre déclenche sa propre fanfare + voix via l'événement `evolved` —
        // ne pas doubler avec VOICE.bonus ici.
        this.playCue('bonus')
      } else {
        this.playCue('bonus')
        this.playVoice(VOICE.bonus, 3)
      }
    })
    on('bossSpawned', (e) => {
      this.playCue('bossSpawned')
      // Le boss final a une réplique dédiée (plus forte) — le mid-boss garde le pool générique.
      const role = (e as BossSpawnedEvent).role
      this.playVoice(role === 'final' ? VOICE.bossFinal : VOICE.boss, 2)
    })
    // (Plus de SFX générique sur `auraPulse` : aura/sweep/strike/cône sonnent
    // désormais par ARME via `weaponFired`/zzfx. L'auraPulse reste pour les VFX.)
    on('prisonerFreed', () => { this.playCue('prisonerFreed'); this.playVoice(VOICE.thankyou, 2) })
    // B5 — Fanfare d'évolution (coffre ramassé + conditions réunies) : fanfare zzfx en accord
    // majeur + voix triomphante. Remplace le cue 'bonus' générique par une fanfare dédiée.
    on('evolved', () => { this.playChestFanfare(); this.playVoice(VOICE.evolved, 4) })
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
   * (0/mute → rien). Variation par tir intrinsèque à zzfx (`randomness`).
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

  /**
   * B5 — Fanfare de coffre/évolution (zzfx procédural).
   * Joue 3 notes en accord majeur ascendant décalées dans le temps (~40ms entre chaque).
   * Inaudible si audio verrouillé, contexte nul, ou gain nul.
   */
  private playChestFanfare(): void {
    if (this.audioCtx === null || this.isLocked()) {
      return
    }
    const ctx = this.audioCtx
    const gain = sfxGain(this.settings)
    if (gain <= 0) {
      return
    }
    CHEST_FANFARE_NOTES.forEach((note, i) => {
      const delayMs = i * 90
      if (delayMs === 0) {
        playZzfx(ctx, gain, note)
      } else {
        window.setTimeout(() => {
          playZzfx(ctx, gain, note)
        }, delayMs)
      }
    })
  }

  /**
   * B4 — Ding de ramassage de gemme XP (zzfx procédural, throttlé à 50ms).
   * Son cristallin distinct du pool `collect` — inaudible si audio verrouillé ou muet.
   */
  private playXpDing(): void {
    if (this.audioCtx === null || this.isLocked()) {
      return
    }
    const gain = sfxGain(this.settings)
    if (gain <= 0) {
      return
    }
    const now = performance.now()
    const last = this.lastSfx.get('xp_ding') ?? -Infinity
    if (!canPlayXpDing(last, now, GEM_DING_THROTTLE_MS)) {
      return
    }
    this.lastSfx.set('xp_ding', now)
    playZzfx(this.audioCtx, gain * 0.7, GEM_DING_ZZFX)
  }

  /**
   * Joue une réplique de voix (canal unique : coupe la précédente, pas de chevauchement).
   *
   * @param pool     Pool de clés parmi lequel piocher.
   * @param priority Priorité de la voix (évolution=4, bonus=3, défaut=2, enemyDown=1).
   *                 Si une voix de priorité ≥ priority a déjà joué dans ce tick (observe()),
   *                 la nouvelle est droppée silencieusement — jamais deux voix simultanées.
   *                 La garde est un booléen par tick (PAS Date.now / Math.random) :
   *                 `voicePriorityThisTick` est remis à 0 au début de chaque observe().
   */
  private playVoice(pool: readonly string[], priority: number): void {
    if (this.isLocked()) {
      return
    }
    // Garde anti-chevauchement : drop si une voix de priorité ≥ déjà planifiée ce tick.
    if (priority <= this.voicePriorityThisTick) {
      return
    }
    const key = pick(pool)
    if (key === undefined || !this.hasAudio(key)) {
      return
    }
    this.voicePriorityThisTick = priority
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
    // Réinitialise la garde anti-chevauchement de voix au début de chaque frame.
    this.voicePriorityThisTick = 0
    // Jingle « AIL Entertainment presents » au premier affichage du titre.
    if (state.screen === 'title' && !this.presentsPlayed) {
      this.presentsPlayed = true
      this.playVoice(VOICE.intro, 2)
    }
    // Voix + stingers au CHANGEMENT d'écran.
    if (state.screen !== this.prevScreen) {
      this.onScreenEnter(state)
      this.prevScreen = state.screen
    }
    // Un seul scan O(N) du boss par frame (partagé entre voix dérivées et musique)
    // au lieu d'un `.some` + un `.find` séparés (N jusqu'à 500+ ennemis en horde).
    const boss = state.enemies.find((e) => e.isBoss)
    // Voix DÉRIVÉES de l'état pendant le jeu (boss faible, PV joueur bas).
    if (state.screen === 'game') {
      this.checkDerivedVoices(state, boss)
    }
    // Musique de fond (boss prioritaire, rotation par phase).
    const bossPresent = boss !== undefined
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
        this.playVoice(VOICE.gameover, 2)
        break
      case 'victory': {
        this.playCue('stageClear')
        const p = state.players[0]
        const flawless = p !== undefined && p.hp >= p.maxHp - 0.5
        this.playVoice(flawless ? VOICE.flawless : VOICE.victory, 2)
        break
      }
      case 'upgrade': {
        // Joue systématiquement une voix à chaque level-up, en alternant les deux clips.
        const key = pickUpgradeVoice(this.upgradeVoiceCount++)
        this.playVoice([key], 2)
        break
      }
      case 'game':
        if (RUN_START_FROM.has(this.prevScreen)) {
          this.playVoice(voiceRunStart(state.stageOrder), 2)
        }
        break
      default:
        break
    }
  }

  /**
   * Voix dérivées de l'état en jeu (observer-only, sim intacte) :
   *  - boss à ≤ 20 % PV → « finish him » (une fois par boss) ;
   *  - PV du joueur ≤ 25 % → appel à l'aide (une fois par passage, hystérésis à 40 %).
   */
  private checkDerivedVoices(state: AppViewState, boss: AppViewState['enemies'][number] | undefined): void {
    if (boss !== undefined) {
      if (!this.bossFinishSaid && boss.maxHp > 0 && boss.hp / boss.maxHp <= 0.20) {
        this.bossFinishSaid = true
        this.playVoice(VOICE.bossLowHp, 2)
      }
    } else {
      this.bossFinishSaid = false
    }
    const p = state.players.find((pl) => pl.alive) ?? state.players[0]
    if (p !== undefined && p.maxHp > 0) {
      const frac = p.hp / p.maxHp
      if (!this.playerLowSaid && frac > 0 && frac <= 0.25) {
        this.playerLowSaid = true
        this.playVoice(VOICE.playerLow, 2)
      } else if (frac > 0.4) {
        this.playerLowSaid = false
      }
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
      // La musique de game-over est un jingle court : une seule lecture (pas de boucle).
      const loop = !NON_LOOPING_MUSIC.has(next)
      const snd = this.sound.add(next, { loop, volume: 0 }) as unknown as SoundInstance
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
