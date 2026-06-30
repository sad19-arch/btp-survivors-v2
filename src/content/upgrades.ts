import type { World } from '@core/world'
import type { EntityId, UpgradeChoice } from '@core/types'
import type { Rng } from '@core/rng'

/**
 * Upgrades (cartes de niveau), data-driven. Chaque carte décrit son effet en une
 * phrase (UI) et `apply` mute les composants du joueur. Pur (pas d'aléa/temps).
 *
 * MVP (PRD) : 6 upgrades simples.
 */
export interface UpgradeDef {
  id: string
  name: string
  /** Effet en une phrase, pour la carte d'upgrade. */
  description: string
  apply(world: World, player: EntityId): void
}

export const UPGRADES: Record<string, UpgradeDef> = {
  degats: {
    id: 'degats',
    name: 'Outillage renforcé',
    description: '+25 % de dégâts pour toutes les armes.',
    apply(world, player) {
      const p = world.get(player, 'player')
      if (p !== undefined) {
        p.damageMult *= 1.25
      }
    }
  },
  cadence: {
    id: 'cadence',
    name: 'Cadence de chantier',
    description: '+15 % de cadence de tir.',
    apply(world, player) {
      const p = world.get(player, 'player')
      if (p !== undefined) {
        p.cooldownMult *= 0.85
      }
    }
  },
  vitesse: {
    id: 'vitesse',
    name: 'Chaussures de sécurité',
    description: '+10 % de vitesse de déplacement.',
    apply(world, player) {
      const p = world.get(player, 'player')
      if (p !== undefined) {
        p.speed *= 1.1
      }
    }
  },
  vie_max: {
    id: 'vie_max',
    name: 'Casque homologué',
    description: '+20 % de points de vie maximum.',
    apply(world, player) {
      const h = world.get(player, 'health')
      if (h !== undefined) {
        const added = h.maxHp * 0.2
        h.maxHp += added
        h.hp = Math.min(h.maxHp, h.hp + added)
      }
    }
  },
  aimant: {
    id: 'aimant',
    name: 'Aimant à primes',
    description: '+40 % de rayon de ramassage.',
    apply(world, player) {
      const p = world.get(player, 'player')
      if (p !== undefined) {
        p.pickupRadius *= 1.4
      }
    }
  },
  marteau: {
    id: 'marteau',
    name: 'Marteau de zone',
    description: 'Ajoute (ou renforce) une onde de choc autour de vous.',
    apply(world, player) {
      const loadout = world.get(player, 'weapons')
      if (loadout === undefined) {
        return
      }
      const owned = loadout.slots.find((s) => s.id === 'marteau')
      if (owned === undefined) {
        loadout.slots.push({ id: 'marteau', cooldownLeftMs: 0 })
      } else {
        // Déjà équipé : renforce via le multiplicateur de dégâts du joueur.
        const p = world.get(player, 'player')
        if (p !== undefined) {
          p.damageMult *= 1.15
        }
      }
    }
  }
}

/** Ids des upgrades connus. */
export const UPGRADE_IDS: readonly string[] = Object.keys(UPGRADES)

/**
 * Tire `count` cartes distinctes au hasard (déterministe via `rng`), résolues en
 * `UpgradeChoice` (id + nom + description) pour l'affichage.
 */
export function rollUpgradeChoices(rng: Rng, count: number): UpgradeChoice[] {
  const pool = [...UPGRADE_IDS]
  // Fisher-Yates partiel : mélange les `n` premiers éléments.
  const n = Math.min(count, pool.length)
  for (let i = 0; i < n; i++) {
    const j = rng.int(i, pool.length - 1)
    const tmp = pool[i] as string
    pool[i] = pool[j] as string
    pool[j] = tmp
  }
  const choices: UpgradeChoice[] = []
  for (let i = 0; i < n; i++) {
    const id = pool[i] as string
    const def = UPGRADES[id]
    if (def !== undefined) {
      choices.push({ id: def.id, name: def.name, description: def.description })
    }
  }
  return choices
}
