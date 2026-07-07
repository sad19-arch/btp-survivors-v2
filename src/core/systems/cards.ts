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
import { INVENTORY, CARD_WEIGHT } from '@content/config'
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
 * Retourne le poids de tirage d'une carte selon son kind.
 * Les cartes d'amélioration d'une arme/passif possédé ont un poids élevé
 * pour qu'elles soient fortement favorisées dans le tirage pondéré.
 */
function cardWeight(kind: Card['kind']): number {
  if (kind === 'weapon-up' || kind === 'passive-up') {
    return CARD_WEIGHT.ownedUp
  }
  return CARD_WEIGHT.new
}

/**
 * Tire jusqu'à `count` cartes distinctes sans remise depuis les cartes éligibles,
 * via un tirage pondéré déterministe (par poids de `kind`).
 *
 * Algorithme :
 * 1. Construire un tableau de travail (copie mutable des éligibles).
 * 2. Répéter `count` fois (ou jusqu'à épuisement) :
 *    - Sommer les poids des cartes restantes.
 *    - Si total === 0, s'arrêter.
 *    - Tirer `roll = rng.float(0, total)`.
 *    - Parcourir les poids cumulatifs pour trouver la carte sélectionnée.
 *    - Retirer la carte choisie (splice) → pas de remise.
 *    - Ajouter au résultat.
 *
 * Déterministe : même seed + même inventaire ⇒ même ordre.
 */
export function rollCards(rng: Rng, inv: Inventory, count: number): Card[] {
  const working = [...eligibleCards(inv)]
  const result: Card[] = []

  const limit = Math.min(count, working.length)

  for (let drawn = 0; drawn < limit; drawn++) {
    // Somme des poids des cartes restantes
    let total = 0
    for (const card of working) {
      total += cardWeight(card.kind)
    }

    if (total === 0) {
      break
    }

    // Tirage pondéré
    const roll = rng.float(0, total)
    let cumulative = 0
    let selectedIndex = -1

    for (let i = 0; i < working.length; i++) {
      const card = working[i]
      if (card === undefined) {
        throw new Error(`rollCards: working[${i}] undefined (inattendu)`)
      }
      cumulative += cardWeight(card.kind)
      if (roll < cumulative) {
        selectedIndex = i
        break
      }
    }

    // Garde : si aucun index trouvé (flottant exactement égal au total),
    // prendre le dernier élément
    if (selectedIndex === -1) {
      selectedIndex = working.length - 1
    }

    const selected = working[selectedIndex]
    if (selected === undefined) {
      throw new Error(`rollCards: working[${selectedIndex}] undefined après sélection`)
    }

    result.push(selected)
    working.splice(selectedIndex, 1)
  }

  return result
}
