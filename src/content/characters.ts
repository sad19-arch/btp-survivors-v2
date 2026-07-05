import { PLAYER_BASE } from './config'

/**
 * Personnages jouables (contenu pur, data-driven). Thème chantier : chaque
 * perso a une feuille de sprite dédiée (skin) et une arme de départ.
 *
 * `sheet` = clé de feuille (= nom de fichier sans extension : `player_soudeur`
 * → `public/player_soudeur.png`, feuille 192 4×4 `down/right/up/left`). L'ouvrier
 * réutilise la feuille de référence `player` (`player_j1.png`).
 *
 * `renderScale` (render-only) ajuste l'échelle du sprite pour matcher la hauteur
 * affichée du héros de référence (~83px) : chaque skin PixelLab a une figure de
 * hauteur native légèrement différente dans la case 192. Lu par `GameScene`
 * (repli `PLAYER_SCALE`) ; JAMAIS par le core (déterminisme préservé).
 *
 * `stats` est une divergence de stats future (ignorée pour l'instant = swap pur).
 */
export interface CharacterDef {
  id: string
  name: string
  /** Clé de feuille de sprite (= nom de fichier PNG sans extension). */
  sheet: string
  /** Arme de base au démarrage (id ∈ WEAPONS). */
  startingWeapon: string
  /** Échelle de rendu du sprite (render-only ; défaut = PLAYER_SCALE côté scène). */
  renderScale?: number
  /** Divergence de stats future (ignorée pour l'instant = swap pur). */
  stats?: Partial<typeof PLAYER_BASE>
}

export const DEFAULT_CHARACTER_ID = 'ouvrier'

/**
 * Fallback garanti non-`undefined`, défini AVANT le typage large en
 * `Record<string, CharacterDef>` pour satisfaire `noUncheckedIndexedAccess`
 * (un accès `.ouvrier` sur un `Record<string, T>` renverrait `T | undefined`).
 */
const FALLBACK_CHARACTER: CharacterDef = {
  id: 'ouvrier',
  name: 'Ouvrier',
  sheet: 'player',
  startingWeapon: 'cloueur'
}

export const CHARACTERS: Readonly<Record<string, CharacterDef>> = {
  ouvrier: FALLBACK_CHARACTER,
  soudeur: { id: 'soudeur', name: 'Soudeur', sheet: 'player_soudeur', startingWeapon: 'scie', renderScale: 0.572 },
  macon: { id: 'macon', name: 'Maçon', sheet: 'player_macon', startingWeapon: 'marteau', renderScale: 0.615 },
  terrassier: { id: 'terrassier', name: 'Terrassier', sheet: 'player_terrassier', startingWeapon: 'pied_de_biche', renderScale: 0.576 },
  electricien: { id: 'electricien', name: 'Électricien', sheet: 'player_electricien', startingWeapon: 'court_circuit', renderScale: 0.576 },
  ouvriere: { id: 'ouvriere', name: 'Ouvrière', sheet: 'player_ouvriere', startingWeapon: 'brouette', renderScale: 0.589 },
  charpentier: { id: 'charpentier', name: 'Charpentier', sheet: 'player_charpentier', startingWeapon: 'boulons', renderScale: 0.557 },
  grutier: { id: 'grutier', name: 'Grutier', sheet: 'player_grutier', startingWeapon: 'goudron', renderScale: 0.576 },
  plombier: { id: 'plombier', name: 'Plombier', sheet: 'player_plombier', startingWeapon: 'cle_molette', renderScale: 0.55 },
  samoyede: { id: 'samoyede', name: 'Samoyède', sheet: 'player_samoyede', startingWeapon: 'extincteur', renderScale: 0.95 }
}

/** Ordre stable du roster (sélecteur) — array explicite plutôt que `Object.keys`. */
export const CHARACTER_IDS: readonly string[] = [
  'ouvrier',
  'soudeur',
  'macon',
  'terrassier',
  'electricien',
  'ouvriere',
  'charpentier',
  'grutier',
  'plombier',
  'samoyede'
]

/** Renvoie le CharacterDef (fallback DEFAULT si id inconnu). */
export function characterDef(id: string): CharacterDef {
  const found = CHARACTERS[id]
  return found ?? FALLBACK_CHARACTER
}
