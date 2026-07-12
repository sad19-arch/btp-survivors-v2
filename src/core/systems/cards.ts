/**
 * Cartes de level-up (tirage garanti + mélange).
 *
 * Système de sélection d'upgrades : pour chaque niveau gagné, le joueur choisit
 * parmi `PROGRESSION.choices` cartes tirées sans remise parmi les éligibles.
 *
 * Éligibilité :
 * - `weapon-up` : chaque arme possédée avec level < maxLevel
 * - `weapon-new` : si inv.weapons.length < INVENTORY.weapons, une par arme de base non possédée (BASE_WEAPON_IDS = 11 armes, dérivé de WEAPONS maxLevel>1)
 * - `passive-up` : chaque passif possédé avec level < maxLevel
 * - `passive-new` : si inv.passives.length < INVENTORY.passives, une par passif non possédé
 *
 * Algorithme rollCards :
 * - Si all.length ≤ count → renvoyer tout mélangé (Fisher-Yates seedé).
 * - Sinon : GARANTIE qu'au moins un `weapon-up` figure dans le résultat (si éligible),
 *   à une position ALÉATOIRE (mélange final Fisher-Yates). Le reste tiré uniformément.
 *
 * Déterminisme : même seed + mêmes inputs ⇒ mêmes cartes ET même ordre.
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
 * Mélange en place un tableau par Fisher-Yates avec le Rng fourni (déterministe).
 * Conforme à `noUncheckedIndexedAccess` : chaque accès est gardé.
 */
function fisherYates<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    const a = arr[i]
    const b = arr[j]
    if (a !== undefined && b !== undefined) {
      arr[i] = b
      arr[j] = a
    }
  }
}

/**
 * Tire jusqu'à `count` cartes distinctes sans remise depuis les cartes éligibles.
 *
 * Algorithme GARANTIE + MÉLANGE (remplace l'ancien tirage pondéré) :
 *
 * 1. `all = eligibleCards(inv)`
 * 2. Si `all.length ≤ count` → renvoyer `all` mélangé (Fisher-Yates seedé).
 * 3. Sinon :
 *    a. GARANTIE : si des `weapon-up` sont éligibles, en choisir un aléatoirement
 *       (via `rng.int`) et le placer dans `result` ; le retirer du pool.
 *    b. REMPLISSAGE : tant que `result.length < count && pool.length > 0`,
 *       tirer un index aléatoire uniforme dans le pool (splice → sans remise).
 *    c. MÉLANGE FINAL : Fisher-Yates seedé sur `result` → le weapon-up garanti
 *       n'est PAS toujours en slot 0.
 *
 * Déterministe : même seed + même inventaire ⇒ mêmes cartes ET même ordre.
 */
export function rollCards(rng: Rng, inv: Inventory, count: number): Card[] {
  const all = eligibleCards(inv)

  // Cas court : moins d'éligibles que demandés → tout renvoyer mélangé
  if (all.length <= count) {
    fisherYates(all, rng)
    return all
  }

  const result: Card[] = []
  const pool: Card[] = [...all]

  // ── Garantie weapon-up ───────────────────────────────────────────────────
  const weaponUps = all.filter(c => c.kind === 'weapon-up')
  if (weaponUps.length > 0) {
    const pickedWu = weaponUps[rng.int(0, weaponUps.length - 1)]
    if (pickedWu !== undefined) {
      result.push(pickedWu)
      // Retirer du pool (par référence d'objet)
      const poolIdx = pool.indexOf(pickedWu)
      if (poolIdx !== -1) {
        pool.splice(poolIdx, 1)
      }
    }
  }

  // ── Remplissage uniforme sans remise ─────────────────────────────────────
  while (result.length < count && pool.length > 0) {
    const idx = rng.int(0, pool.length - 1)
    const card = pool[idx]
    if (card !== undefined) {
      result.push(card)
      pool.splice(idx, 1)
    }
  }

  // ── Mélange final (weapon-up garanti à position aléatoire) ────────────────
  fisherYates(result, rng)

  return result
}
