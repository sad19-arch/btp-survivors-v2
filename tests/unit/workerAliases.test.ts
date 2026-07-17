import { describe, it, expect } from 'vitest'
import { SHARED_WORKER_NPCS, WORKER_SKIN_ALIASES, resolveWorkerSkin } from '@render/stages'
import { planNpcJobs, planPathWalkers } from '@render/workerBehavior'
import { emptyLayout } from '@content/stageLayout'

/**
 * Les ouvriers génériques passent de « A/B/C » (illisible dans la palette) à des
 * PRÉNOMS. Les sprites ne changent PAS : ils étaient déjà distincts.
 *
 * Une compo de l'utilisateur pose 19 ouvriers sous les ANCIENNES clés. Sans
 * alias, elles ne résolvent plus et les 19 PNJ disparaissent SANS ERREUR (le
 * rendu teste `textures.exists(skin)` puis `continue` en silence).
 */
describe('Ouvriers nommés', () => {
  it('les 3 ouvriers portent des prénoms', () => {
    const keys = SHARED_WORKER_NPCS.map((n) => n.key)
    expect(keys).toEqual(['npc_ouvrier_zinedine', 'npc_ouvrier_marius', 'npc_ouvrier_erling'])
  })

  it('ALIAS : les anciennes clés résolvent toujours (19 PNJ posés en dépendent)', () => {
    expect(resolveWorkerSkin('npc_ouvrier_a')).toBe('npc_ouvrier_zinedine')
    expect(resolveWorkerSkin('npc_ouvrier_b')).toBe('npc_ouvrier_marius')
    expect(resolveWorkerSkin('npc_ouvrier_c')).toBe('npc_ouvrier_erling')
  })

  it('une clé déjà à jour passe telle quelle', () => {
    expect(resolveWorkerSkin('npc_ouvrier_zinedine')).toBe('npc_ouvrier_zinedine')
  })

  it('une clé inconnue passe telle quelle (pas de perte silencieuse)', () => {
    expect(resolveWorkerSkin('npc_stage01')).toBe('npc_stage01')
  })

  it('chaque alias pointe vers une clé qui EXISTE vraiment', () => {
    const keys = new Set(SHARED_WORKER_NPCS.map((n) => n.key))
    for (const [old, now] of Object.entries(WORKER_SKIN_ALIASES)) {
      expect(keys.has(now), `${old} → ${now} : cible inexistante`).toBe(true)
    }
  })

  it('chaque ouvrier pointe un FICHIER au nouveau nom (pas de renommage à moitié)', () => {
    for (const n of SHARED_WORKER_NPCS) {
      expect(n.file, `${n.key} garde un fichier _a/_b/_c`).not.toMatch(/ouvrier_[abc]_walk/)
    }
  })
})

describe('Alias APPLIQUÉ aux entités rendues', () => {
  it('un PNJ posé sous l’ancienne clé est rendu avec la NOUVELLE', () => {
    // C'est le cas réel : la compo de l'utilisateur pose `npc_ouvrier_c`.
    const l = emptyLayout('terrain_vierge')
    l.npcs = [{ id: 'n1', skin: 'npc_ouvrier_c', kind: 'worker', x: 0, y: 0 }]
    expect(planNpcJobs(l, 100, 100)[0]?.skin).toBe('npc_ouvrier_erling')
  })

  it('un chemin dont le skin est une ancienne clé résout aussi', () => {
    const l = emptyLayout('terrain_vierge')
    l.paths = [{
      id: 'p1', type: 'worker_path',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      skin: 'npc_ouvrier_a'
    }]
    expect(planPathWalkers(l, 100, 100)[0]?.skin).toBe('npc_ouvrier_zinedine')
  })
})
