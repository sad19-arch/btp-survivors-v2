/**
 * Cartes de level-up (tirage pur).
 *
 * Système de sélection d'upgrades : pour chaque niveau gagné, le joueur choisit
 * parmi `PROGRESSION.choices` cartes (défaut : 4) tirées sans remise (Fisher-Yates
 * seedé) parmi les éligibles.
 *
 * Éligibilité :
 * - `weapon-up` : chaque arme possédée avec level < maxLevel
 * - `weapon-new` : si inv.weapons.length < INVENTORY.weapons, une par arme de base non possédée (BASE_WEAPON_IDS = 10 armes, dérivé de WEAPONS maxLevel>1)
 * - `passive-up` : chaque passif possédé avec level < maxLevel
 * - `passive-new` : si inv.passives.length < INVENTORY.passives, une par passif non possédé
 *
 * Déterminisme : même seed + mêmes inputs ⇒ mêmes cartes.
 */

import { WEAPONS } from '@content/weapons'
import { PASSIVES } from '@content/passives'
import { INVENTORY } from '@content/config'
import { Rng } from '../rng'

export type CardKind = 'weapon-new' | 'passive-new' | 'weapon-up' | 'passive-up'

export interface Card {
  kind: CardKind
  id: string
  name: string
  hint: string
  description: string
  currentLevel: number
  maxLevel: number
}

export interface Inventory {
  weapons: ReadonlyArray<{ id: string; level: number }>
  passives: ReadonlyArray<{ id: string; level: number }>
}

/**
 * IDs des armes de base (non-évoluées) offrant des cartes de découverte.
 * Dérivé de WEAPONS (maxLevel > 1) plutôt que codé en dur : les armes évoluées
 * ont `maxLevel === 1` (non progressives), donc ce filtre les exclut naturellement
 * sans risquer d'oublier une nouvelle arme de base.
 */
const BASE_WEAPON_IDS = Object.values(WEAPONS)
  .filter((w) => w.maxLevel > 1)
  .map((w) => w.id)

/**
 * Énumère les cartes éligibles pour un joueur donné.
 * - Exclut les armes/passifs maxés (level === maxLevel)
 * - Supprime les cartes `weapon-new` si l'inventaire est plein
 * - Ignore gracieusement les IDs inconnus
 */
export function eligibleCards(inv: Inventory): Card[] {
  const cards: Card[] = []

  // Cartes de level-up d'armes (weapon-up)
  for (const { id, level } of inv.weapons) {
    const def = WEAPONS[id]
    if (!def) {continue} // ID inconnu, ignorer
    if (level < def.maxLevel) {
      cards.push({
        kind: 'weapon-up',
        id,
        name: def.name,
        hint: `Niv. ${level} → ${level + 1}`,
        description: def.description,
        currentLevel: level,
        maxLevel: def.maxLevel
      })
    }
  }

  // Cartes de découverte d'armes (weapon-new)
  if (inv.weapons.length < INVENTORY.weapons) {
    const ownedIds = new Set(inv.weapons.map(w => w.id))
    for (const baseId of BASE_WEAPON_IDS) {
      if (!ownedIds.has(baseId)) {
        const def = WEAPONS[baseId]
        if (def) {
          cards.push({
            kind: 'weapon-new',
            id: baseId,
            name: def.name,
            hint: 'Nouveau',
            description: def.description,
            currentLevel: 0,
            maxLevel: def.maxLevel
          })
        }
      }
    }
  }

  // Cartes de level-up de passifs (passive-up)
  for (const { id, level } of inv.passives) {
    const def = PASSIVES[id]
    if (!def) {continue} // ID inconnu, ignorer
    if (level < def.maxLevel) {
      cards.push({
        kind: 'passive-up',
        id,
        name: def.name,
        hint: `Niv. ${level} → ${level + 1}`,
        description: def.description,
        currentLevel: level,
        maxLevel: def.maxLevel
      })
    }
  }

  // Cartes de découverte de passifs (passive-new)
  if (inv.passives.length < INVENTORY.passives) {
    const ownedIds = new Set(inv.passives.map(p => p.id))
    for (const passiveId of Object.keys(PASSIVES)) {
      if (!ownedIds.has(passiveId)) {
        const def = PASSIVES[passiveId]
        if (def) {
          cards.push({
            kind: 'passive-new',
            id: passiveId,
            name: def.name,
            hint: 'Nouveau',
            description: def.description,
            currentLevel: 0,
            maxLevel: def.maxLevel
          })
        }
      }
    }
  }

  return cards
}

/**
 * Tire jusqu'à `count` cartes distinctes sans remise depuis les cartes éligibles,
 * via un mélange Fisher-Yates seedé.
 *
 * Déterministe : même seed + même inventaire ⇒ même ordre.
 */
export function rollCards(rng: Rng, inv: Inventory, count: number): Card[] {
  const all = eligibleCards(inv)

  // Mélange Fisher-Yates in-place (destructif, donc copie d'abord)
  const shuffled = [...all]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    const tmp = shuffled[i] as Card
    shuffled[i] = shuffled[j] as Card
    shuffled[j] = tmp
  }

  // Prendre jusqu'à `count`
  return shuffled.slice(0, count)
}
