/**
 * Réglage de la TAILLE DES TEXTES DE JEU (espace-monde + carton de nom de phase),
 * persisté en localStorage. Pur/portable (garde contre l'absence de localStorage
 * → testable en Node). Cible : lisibilité sur grande TV vue du canapé, où le
 * texte-monde 11-16px devient trop petit. NE concerne PAS le HUD ni les menus DOM.
 *
 * Modèle : src/audio/settings.ts (validé champ-par-champ, clé versionnée).
 */

export type GameTextLevel = 'normal' | 'grand' | 'tres_grand'

const STORAGE_KEY = 'btp_game_text_scale_v1'
const DEFAULT_LEVEL: GameTextLevel = 'normal'

/** Facteur d'échelle par niveau (×1 / ×1.5 / ×2). */
export const GAME_TEXT_SCALES: Record<GameTextLevel, number> = {
  normal: 1,
  grand: 1.5,
  tres_grand: 2
}

/** Ordre des niveaux (pour le cyclage gauche/droite, borné). */
const ORDER: readonly GameTextLevel[] = ['normal', 'grand', 'tres_grand']

function isLevel(v: unknown): v is GameTextLevel {
  return v === 'normal' || v === 'grand' || v === 'tres_grand'
}

/** Niveau persisté ; valeur absente/corrompue/localStorage absent → 'normal'. */
export function loadGameTextLevel(): GameTextLevel {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_LEVEL
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return DEFAULT_LEVEL
    }
    const p = JSON.parse(raw) as { level?: unknown }
    return isLevel(p.level) ? p.level : DEFAULT_LEVEL
  } catch {
    return DEFAULT_LEVEL
  }
}

/** Persiste le niveau (no-op silencieux si localStorage indisponible). */
export function saveGameTextLevel(level: GameTextLevel): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ level }))
    }
  } catch {
    /* stockage indisponible : on ignore silencieusement */
  }
}

/**
 * Niveau suivant dans la direction donnée, BORNÉ (pas de bouclage) : gauche sur
 * 'normal' reste 'normal', droite sur 'tres_grand' reste 'tres_grand' — cohérent
 * avec le réglage gauche/droite des volumes.
 */
export function nextGameTextLevel(cur: GameTextLevel, dir: -1 | 1): GameTextLevel {
  const i = ORDER.indexOf(cur)
  const j = Math.max(0, Math.min(ORDER.length - 1, i + dir))
  return ORDER[j] ?? cur
}

/** Facteur d'échelle du niveau. */
export function gameTextScaleOf(level: GameTextLevel): number {
  return GAME_TEXT_SCALES[level]
}

/** Libellé FR pour l'écran Options. */
export function gameTextLabelOf(level: GameTextLevel): 'Normal' | 'Grand' | 'Très grand' {
  return level === 'normal' ? 'Normal' : level === 'grand' ? 'Grand' : 'Très grand'
}
