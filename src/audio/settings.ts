/**
 * Réglages audio (volumes + mute), persistés en localStorage. Pur/portable
 * (garde contre l'absence de localStorage → testable en Node).
 */

export interface AudioLevels {
  master: number
  music: number
  sfx: number
  muted: boolean
}

const STORAGE_KEY = 'btp_audio_settings_v1'
const DEFAULTS: AudioLevels = { master: 0.8, music: 0.55, sfx: 0.8, muted: false }

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function loadAudioSettings(): AudioLevels {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULTS }
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return { ...DEFAULTS }
    }
    const p = JSON.parse(raw) as Partial<AudioLevels>
    return {
      master: clamp01(typeof p.master === 'number' ? p.master : DEFAULTS.master),
      music: clamp01(typeof p.music === 'number' ? p.music : DEFAULTS.music),
      sfx: clamp01(typeof p.sfx === 'number' ? p.sfx : DEFAULTS.sfx),
      muted: p.muted === true
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAudioSettings(s: AudioLevels): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    }
  } catch {
    /* stockage indisponible : on ignore silencieusement */
  }
}

/** Gain effectif de la musique (0 si muet). */
export function musicGain(s: AudioLevels): number {
  return s.muted ? 0 : s.master * s.music
}

/** Gain effectif des SFX (0 si muet). */
export function sfxGain(s: AudioLevels): number {
  return s.muted ? 0 : s.master * s.sfx
}
