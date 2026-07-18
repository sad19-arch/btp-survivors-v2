/**
 * Persistance du réglage « Vibrations » (juice #2) — miroir de `@/audio/settings`.
 * Un simple booléen (activé par défaut), stocké en localStorage. Vit dans `src/app`
 * (l'App possède le réglage d'UI ; la couche `input` ne fait que LIRE l'état via
 * `app.getVibrations()`, jamais l'inverse — on préserve le sens des dépendances).
 */
const KEY = 'btp.haptics.v1'

/** Lit le réglage ; défaut = activé. Tolérant (localStorage indisponible → activé). */
export function loadHaptics(): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? true : raw === '1'
  } catch {
    return true
  }
}

/** Persiste le réglage (no-op silencieux si localStorage indisponible). */
export function saveHaptics(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* stockage indisponible (mode privé strict) — le réglage reste en mémoire */
  }
}
