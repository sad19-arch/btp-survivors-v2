import { PLAYER_BASE } from './config'

/**
 * Personnages jouables (contenu pur, data-driven). Thème chantier : chaque
 * perso est associé à une arme de départ distincte.
 *
 * Fondation (cette tranche) : TOUS les persos réutilisent la feuille de
 * sprite partagée `'player'` (placeholder = `player_j1.png`). Les feuilles
 * dédiées par personnage (ex. `char_soudeur.png`) arrivent en phase C —
 * `sheet` existe déjà pour ne pas re-toucher ce module à ce moment-là.
 *
 * `stats` est une divergence de stats future (ignorée pour l'instant = swap
 * pur d'arme de départ). Non branché dans la sim tant que les tâches 2-4 du
 * plan Persos-B ne l'ont pas câblé.
 */
export interface CharacterDef {
  id: string
  name: string
  /** Clé de feuille de sprite (placeholder 'player' pour tous jusqu'à la phase C). */
  sheet: string
  /** Arme de base au démarrage (id ∈ WEAPONS). */
  startingWeapon: string
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
  soudeur: { id: 'soudeur', name: 'Soudeur', sheet: 'player', startingWeapon: 'scie' },
  macon: { id: 'macon', name: 'Maçon', sheet: 'player', startingWeapon: 'marteau' },
  terrassier: { id: 'terrassier', name: 'Terrassier', sheet: 'player', startingWeapon: 'pied_de_biche' },
  electricien: { id: 'electricien', name: 'Électricien', sheet: 'player', startingWeapon: 'court_circuit' }
}

/** Renvoie le CharacterDef (fallback DEFAULT si id inconnu). */
export function characterDef(id: string): CharacterDef {
  const found = CHARACTERS[id]
  return found ?? FALLBACK_CHARACTER
}
