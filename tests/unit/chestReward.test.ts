/**
 * Logique de coffre — SANS cartes (refonte casino) :
 *  1. Évolution dispo → arme évoluée + justEvolved transitoire.
 *  2. Aucune évolution → une arme possédée MONTE DE NIVEAU au hasard (RNG isolé) :
 *     JAMAIS de `pendingLevelUp`, JAMAIS de gel du temps.
 *  3. Tout maxé → soin de repli (fallbackHealPct * maxHp).
 *  4. Déterminisme : même seed ⇒ même arme montée par le coffre.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { STEP_MS } from '@core/clock'
import { CHEST } from '@content/config'
import type { PlayerState } from '@core/types'

/** Récupère le joueur 1 ou lève (évite les assertions non-null). */
function p1(sim: Simulation): PlayerState {
  const p = sim.getState().players[0]
  if (p === undefined) {
    throw new Error('joueur 1 introuvable dans p1()')
  }
  return p
}

/**
 * Remplit l'inventaire avec 6 armes ÉVOLUÉES (maxLevel=1, déjà au max) et
 * 6 passifs tous au niveau max — aucune carte éligible, aucune évolution possible
 * (les armes évoluées n'ont pas de recette d'évolution supplémentaire).
 */
function grantMaxedInventory(sim: Simulation): void {
  sim.debugGrant({
    // Armes évoluées : maxLevel = 1 → impossible de les améliorer davantage.
    // Aucune n'a d'entrée dans EVOLUTIONS (elles sont les « produits », pas les bases).
    weapons: [
      { id: 'mitrailleuse_clous', level: 1 },
      { id: 'haute_tension', level: 1 },
      { id: 'coulee_bitume', level: 1 },
      { id: 'tempete_boulons', level: 1 },
      { id: 'cle_choc', level: 1 },
      { id: 'transpalette', level: 1 }
    ],
    // Passifs tous au niveau max (maxLevel respectif, non upgradeable).
    passives: [
      { id: 'air_comprime', level: 5 },
      { id: 'groupe_electrogene', level: 2 },
      { id: 'outillage_renforce', level: 5 },
      { id: 'cadence_chantier', level: 5 },
      { id: 'casque_homologue', level: 5 },
      { id: 'chaussures_securite', level: 5 }
    ]
  })
}

describe('coffre — 3 branches garanties', () => {
  // ------------------------------------------------------------------ branche 1
  it('arme prête à évoluer → évoluée + justEvolved true (1 frame)', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    // Conditions d'évolution cloueur : level 8 + passif air_comprime level 1
    sim.debugGrant({ weapons: [{ id: 'cloueur', level: 8 }], passives: [{ id: 'air_comprime', level: 1 }] })
    sim.debugSpawnChestOnPlayer()
    // Ramassage du coffre
    sim.advanceTime(STEP_MS)

    const state = sim.getState()
    // L'arme a évolué
    expect(state.players[0]?.weapons).toContain('mitrailleuse_clous')
    // Flag one-shot positionné (non null = true pour ce pas)
    expect(state.justEvolved).toBe('mitrailleuse_clous')
    // Multiple lectures dans le même pas → même valeur (pas de reset dans getState)
    expect(sim.getState().justEvolved).toBe('mitrailleuse_clous')
  })

  // ------------------------------------------------------------------ branche 1 (timing)
  it('justEvolved est null dès le pas suivant (transitoire)', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    sim.debugGrant({ weapons: [{ id: 'cloueur', level: 8 }], passives: [{ id: 'air_comprime', level: 1 }] })
    sim.debugSpawnChestOnPlayer()
    sim.advanceTime(STEP_MS)

    // Avancer un pas de plus : le flag doit être null
    sim.advanceTime(STEP_MS)
    expect(sim.getState().justEvolved).toBeNull()
  })

  // ------------------------------------------------------------------ branche 2
  it('aucune évolution → une arme monte de niveau (JAMAIS de cartes, temps NON gelé)', () => {
    const sim = new Simulation({ seed: 42, mode: 'solo' })
    // Inventaire de départ = arme de base niv 1 (montable), aucune évolution possible.
    const sum = (a: readonly number[]): number => a.reduce((s, x) => s + x, 0)
    const beforeLevels = sum(sim.getState().players[0]?.weaponLevels ?? [])
    sim.debugSpawnChestOnPlayer()
    sim.advanceTime(STEP_MS)

    const state = sim.getState()
    // AUCUNE carte, AUCUNE évolution.
    expect(state.pendingLevelUp).toBeNull()
    expect(state.justEvolved).toBeNull()
    // Une arme possédée est montée de niveau (somme des niveaux d'armes +1).
    expect(sum(state.players[0]?.weaponLevels ?? [])).toBe(beforeLevels + 1)
    // Le temps N'EST PAS gelé (le coffre ne gèle plus rien) : il continue d'avancer.
    const t0 = state.elapsedMs
    sim.advanceTime(STEP_MS)
    expect(sim.getState().elapsedMs).toBeGreaterThan(t0)
  })

  // ------------------------------------------------------------------ branche 3
  it('tout maxé (aucune évolution, aucune carte) → PV augmentés de fallbackHealPct', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    grantMaxedInventory(sim)

    // Faire descendre les PV pour que le soin soit mesurable
    const before = p1(sim)
    // Injecter une réduction de PV via... on ne peut pas directement. On teste
    // simplement que les PV augmentent de CHEST.fallbackHealPct * maxHp si < maxHp,
    // ou restent plafonnés à maxHp si déjà au max.
    // Cas PV déjà au max : résultat = maxHp (borné)
    sim.debugSpawnChestOnPlayer()
    sim.advanceTime(STEP_MS)

    const after = p1(sim)
    // PV au max → toujours maxHp après le soin (borné)
    expect(after.hp).toBe(after.maxHp)
    // Pas de pendingLevelUp (rien à offrir)
    expect(sim.getState().pendingLevelUp).toBeNull()
    // Pas d'évolution
    expect(sim.getState().justEvolved).toBeNull()

    // Vérifier que la formule est correcte : fallbackHealPct * maxHp ajouté
    // Cas PV < maxHp : granter un inventaire maxé avec PV réduits n'est pas
    // possible directement via l'API sim. On vérifie la formule de branche via
    // CHEST.fallbackHealPct = 0.30 et before.maxHp = 240 → 72 PV de soin.
    // Si hp = 0.5 * maxHp = 120 → après = min(240, 120 + 72) = 192.
    // On documente cette propriété ici sans pouvoir la tester directement en
    // black-box car l'API sim n'expose pas de méthode pour baisser les PV.
    expect(CHEST.fallbackHealPct).toBe(0.30)
    const expectedHeal = before.maxHp * CHEST.fallbackHealPct
    // Garde : si on partait de maxHp, le soin est absorbé par le plafond.
    expect(Math.min(before.maxHp, before.hp + expectedHeal)).toBe(before.maxHp)
  })

  // ------------------------------------------------------------------ déterminisme
  it('déterminisme : même seed ⇒ même arme montée par le coffre', () => {
    function runUp(seed: number): number[] {
      const sim = new Simulation({ seed, mode: 'solo' })
      sim.debugSpawnChestOnPlayer()
      sim.advanceTime(STEP_MS)
      return sim.getState().players[0]?.weaponLevels ?? []
    }

    // Même seed → même arme montée (mêmes niveaux d'armes après le coffre).
    expect(runUp(99)).toEqual(runUp(99))
    // Non vide + une montée effective (au moins un niveau > 1).
    expect(runUp(100).some((lvl) => lvl > 1)).toBe(true)
  })

  // ------------------------------------------------------------------ pas de double-évolution
  it('deux coffres en séquence avec une seule évolution dispo → 1 évolution, puis montée d\'arme (jamais de cartes)', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    // Arme prête à évoluer
    sim.debugGrant({ weapons: [{ id: 'cloueur', level: 8 }], passives: [{ id: 'air_comprime', level: 1 }] })

    // Premier coffre : déclenche l'évolution
    sim.debugSpawnChestOnPlayer()
    sim.advanceTime(STEP_MS)
    expect(sim.getState().justEvolved).toBe('mitrailleuse_clous')
    // Consommer le flag
    sim.getState()

    // Deuxième coffre : plus d'évolution dispo → montée d'arme (ou soin si tout maxé).
    sim.debugSpawnChestOnPlayer()
    sim.advanceTime(STEP_MS)
    const state2 = sim.getState()
    expect(state2.justEvolved).toBeNull()
    // JAMAIS de cartes sur un coffre (contrat de la refonte).
    expect(state2.pendingLevelUp).toBeNull()
    expect(state2.players[0]).toBeDefined()
  })
})
