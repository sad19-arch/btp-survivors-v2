/**
 * ZzFX — micro-synthé procédural de SFX (domaine public / MIT, d'après Frank
 * Force — https://github.com/KilledByAPixel/ZzFX). Adapté ici en TypeScript
 * strict et SANS globals : le contexte WebAudio (celui de Phaser) et le volume
 * maître (branché sur le gain SFX du jeu) sont passés en paramètres — pas de
 * second AudioContext, pas de variable module mutable.
 *
 * Couche AUDIO (observateur only, jamais dans `src/core`) : `Math.random` est
 * autorisé ici (variation par tir, comme le pool/rateJitter des SFX fichiers).
 */

/** Fréquence d'échantillonnage ZzFX (fixe). */
const ZZFX_RATE = 44100

/**
 * Vecteur de paramètres ZzFX — mêmes positions/sémantique que la lib d'origine :
 * [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
 *  slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation,
 *  bitCrush, delay, sustainVolume, decay, tremolo]. Positions absentes = défaut.
 */
export type ZzfxParams = readonly number[]

/** Génère les échantillons mono d'un son ZzFX (algorithme d'origine, fidèle). */
function generateSamples(p: ZzfxParams): number[] {
  const volume = p[0] ?? 1
  const randomness = p[1] ?? 0.05
  let frequency = p[2] ?? 220
  let attack = p[3] ?? 0
  let sustain = p[4] ?? 0
  let release = p[5] ?? 0.1
  const shape = Math.floor(p[6] ?? 0)
  const shapeCurve = p[7] ?? 1
  let slide = p[8] ?? 0
  let deltaSlide = p[9] ?? 0
  const pitchJump = (p[10] ?? 0) * (Math.PI * 2) / ZZFX_RATE
  const pitchJumpTime = (p[11] ?? 0) * ZZFX_RATE
  const noise = p[13] ?? 0
  const modulation = (p[14] ?? 0) * (Math.PI * 2) / ZZFX_RATE
  const bitCrush = p[15] ?? 0
  let delay = p[16] ?? 0
  const sustainVolume = p[17] ?? 1
  let decay = p[18] ?? 0
  const tremolo = p[19] ?? 0

  const PI2 = Math.PI * 2
  const sign = (v: number): number => (v > 0 ? 1 : -1)

  slide *= 500 * PI2 / ZZFX_RATE / ZZFX_RATE
  const startSlide = slide
  frequency *= (1 + randomness * 2 * Math.random() - randomness) * PI2 / ZZFX_RATE
  let startFrequency = frequency

  attack = attack * ZZFX_RATE + 9 // +9 : attaque minimale anti-pop
  decay *= ZZFX_RATE
  sustain *= ZZFX_RATE
  release *= ZZFX_RATE
  delay *= ZZFX_RATE
  deltaSlide *= 500 * PI2 / (ZZFX_RATE ** 3)
  const repeatTime = ((p[12] ?? 0) * ZZFX_RATE) | 0

  const b: number[] = []
  let t = 0
  let tm = 0
  let i = 0
  let j = 1
  let r = 0
  let c = 0
  let s = 0
  const length = (attack + decay + sustain + release + delay) | 0

  for (; i < length; b[i++] = s) {
    if (!(++c % (((bitCrush * 100) | 0) || 1))) {
      // Forme d'onde (0 sin · 1 triangle · 2 saw · 3 tan · 4 noise).
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? Math.sin((t % PI2) ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - (((2 * t) / PI2) % 2 + 2) % 2
          : 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t)

      // Courbe de forme + enveloppe ADSR + trémolo.
      s =
        (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        sign(s) *
        Math.abs(s) ** shapeCurve *
        volume *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0)

      // Écho court (delay).
      s = delay
        ? s / 2 +
          (delay > i
            ? 0
            : ((i < length - delay ? 1 : (length - i) / delay) * (b[(i - delay) | 0] ?? 0)) / 2)
        : s
    }

    const f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++)
    t += f - f * noise * (1 - (((Math.sin(i) + 1) * 1e9) % 2))

    if (j && ++j > pitchJumpTime) {
      frequency += pitchJump
      startFrequency += pitchJump
      j = 0
    }
    if (repeatTime && !(++r % repeatTime)) {
      frequency = startFrequency
      slide = startSlide
      j = j || 1
    }
  }
  return b
}

/**
 * Synthétise et joue un son ZzFX one-shot via `ctx`, à `masterVolume` (0..1,
 * branché sur le gain SFX du jeu — 0 = muet, rien joué). Retourne sans effet si
 * `masterVolume <= 0` ou son vide.
 */
export function playZzfx(ctx: AudioContext, masterVolume: number, params: ZzfxParams): void {
  if (masterVolume <= 0) {
    return
  }
  const samples = generateSamples(params)
  if (samples.length === 0) {
    return
  }
  const buffer = ctx.createBuffer(1, samples.length, ZZFX_RATE)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) {
    channel[i] = samples[i] ?? 0
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.value = masterVolume
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start()
}

/** Boucle sonore continue contrôlable (pour la scie orbitale). */
export interface ZzfxLoop {
  /** Règle le volume (0..1) — 0 = silencieux mais la boucle continue. */
  setVolume: (v: number) => void
  /** Arrête et déconnecte définitivement la boucle. */
  stop: () => void
}

/**
 * Ronronnement continu type scie circulaire : sawtooth filtré passe-bas + léger
 * LFO d'amplitude (whir). Démarré immédiatement à volume 0 ; piloté par
 * `setVolume`. À `stop()`, tout est arrêté/déconnecté (pas de fuite).
 */
export function createWhirLoop(ctx: AudioContext): ZzfxLoop {
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = 145
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 950
  const gain = ctx.createGain()
  gain.gain.value = 0
  // LFO d'amplitude léger → « whir » de lame.
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 24
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.05
  lfo.connect(lfoGain)
  lfoGain.connect(gain.gain)
  osc.connect(lp)
  lp.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  lfo.start()

  let stopped = false
  return {
    setVolume: (v: number): void => {
      if (!stopped) {
        gain.gain.value = Math.max(0, v)
      }
    },
    stop: (): void => {
      if (stopped) {
        return
      }
      stopped = true
      osc.stop()
      lfo.stop()
      osc.disconnect()
      lp.disconnect()
      gain.disconnect()
      lfo.disconnect()
      lfoGain.disconnect()
    }
  }
}
