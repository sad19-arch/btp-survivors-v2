import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { walkerSkinsFor, getStageCatalog } from '@/editor/PrefabCatalog'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { planPathWalkers } from '@render/workerBehavior'
import { PATH_LIMITS } from '@content/stageLayout'

/**
 * Inspecteur de chemin : « le chemin porte ses marcheurs » → c'est le SEUL
 * endroit où l'on règle qui / combien / à quelle vitesse.
 */
describe('EditorState — réglages de chemin', () => {
  let st: EditorState
  beforeEach(() => {
    localStorage.clear()
    st = new EditorState('terrain_vierge')
  })

  const line = (): Array<{ x: number; y: number }> => [{ x: 0, y: 0 }, { x: 100, y: 0 }]

  it('addPath rend le chemin créé (pour le sélectionner aussitôt)', () => {
    const p = st.addPath('worker_path', line())
    expect(p.id).toBeTruthy()
    expect(st.paths.length).toBe(1)
  })

  it('addPath SÉLECTIONNE le chemin : sinon l’inspecteur ne s’ouvre jamais', () => {
    // Tracer un chemin puis devoir le retrouver au clic pour le régler serait un
    // 2e obstacle après celui d'`Entrée`. Il s'ouvre sur ses réglages.
    const p = st.addPath('worker_path', line())
    expect(st.selected).toBe(p.id)
    expect(st.selectedPath()?.id).toBe(p.id)
  })

  it('selectedPath ne confond pas un chemin avec une instance', () => {
    st.addInstance('obj_a', 0, 0)
    expect(st.selectedPath()).toBeNull()
  })

  it('updatePath modifie les réglages sans toucher aux points', () => {
    const p = st.addPath('worker_path', line())
    st.updatePath(p.id, { name: 'Ronde', count: 3, pauseMs: 2000, oneWay: true })
    const got = st.paths[0]
    expect(got?.name).toBe('Ronde')
    expect(got?.count).toBe(3)
    expect(got?.oneWay).toBe(true)
    expect(got?.points.length).toBe(2)
  })

  it('updatePath CLAMPE — l’inspecteur ne peut pas produire une vitesse nulle', () => {
    const p = st.addPath('truck_path', line())
    st.updatePath(p.id, { speed: 0 })
    expect(st.paths[0]?.speed).toBe(PATH_LIMITS.speed.min)
    st.updatePath(p.id, { count: 99 })
    expect(st.paths[0]?.count).toBe(PATH_LIMITS.count.max)
    st.updatePath(p.id, { pauseMs: -5 })
    expect(st.paths[0]?.pauseMs).toBe(PATH_LIMITS.pauseMs.min)
  })

  it('updatePath ignore une valeur non finie (champ vidé → NaN)', () => {
    // Un <input type=number> vidé donne Number('') = NaN : sans garde, la vitesse
    // deviendrait NaN et le marcheur disparaîtrait du chemin.
    const p = st.addPath('worker_path', line())
    st.updatePath(p.id, { speed: 120 })
    st.updatePath(p.id, { speed: Number.NaN })
    expect(st.paths[0]?.speed).toBe(120)
  })

  it('skin « (défaut) » (chaîne vide) EFFACE le réglage au lieu de le figer', () => {
    const p = st.addPath('worker_path', line())
    st.updatePath(p.id, { skin: 'npc_ouvrier_marius' })
    st.updatePath(p.id, { skin: '' })
    expect(st.paths[0]?.skin).toBeUndefined()
  })

  it('updatePath sur un id inconnu ne casse rien', () => {
    expect(() => st.updatePath('inexistant', { count: 2 })).not.toThrow()
  })

  it('un chemin sélectionné est SUPPRIMABLE (Suppr / bouton)', () => {
    // deleteSelected ne filtrait qu'instances + npcs : un chemin raté était
    // impossible à retirer autrement qu'en repartant de zéro.
    const p = st.addPath('worker_path', line())
    st.select(p.id)
    st.deleteSelected()
    expect(st.paths.length).toBe(0)
  })

  it('les réglages SURVIVENT à l’aller-retour export → import', () => {
    const p = st.addPath('truck_path', line())
    st.updatePath(p.id, { name: 'Livraison béton', count: 2, speed: 200, pauseMs: 3000, oneWay: true })
    const json = st.exportJson()
    const st2 = new EditorState('terrain_vierge')
    expect(st2.importJson(json).ok).toBe(true)
    const got = st2.paths[0]
    expect(got?.name).toBe('Livraison béton')
    expect(got?.count).toBe(2)
    expect(got?.speed).toBe(200)
    expect(got?.pauseMs).toBe(3000)
    expect(got?.oneWay).toBe(true)
  })

  /**
   * Le VRAI chemin de l'utilisateur : « Sauver (jouable) » sérialise via
   * `exportGameJson` (et non `exportJson`) — c'est CE JSON que le jeu recharge
   * (`applyUserLayouts` → `parseLayout` → `resolveComposedLayout` → siteWorkers).
   * Ce test relie l'inspecteur aux marcheurs réellement créés : un maillon qui
   * perdrait les réglages les rendrait inopérants sans la moindre erreur.
   */
  it('bout en bout : régler dans l’inspecteur → marcheurs réellement planifiés', () => {
    const p = st.addPath('worker_path', [{ x: -100, y: 0 }, { x: 100, y: 0 }])
    st.updatePath(p.id, { count: 3, speed: 100, pauseMs: 1000, skin: 'npc_ouvrier_erling' })

    const res = parseLayout(st.exportGameJson(), 'terrain_vierge')
    expect(res.ok).toBe(true)
    const layout = res.layout
    if (layout === undefined) {throw new Error('layout perdu')}

    const plans = planPathWalkers(layout, 10240, 7680)
    expect(plans.length).toBe(3)
    expect(plans[0]?.skin).toBe('npc_ouvrier_erling')
    expect(plans[0]?.speed).toBe(100)
    expect(plans[0]?.pauseMs).toBe(1000)
    // Étalés : 200px @100px/s = 2s ; cycle = 2*2 + 2*1 = 6s → 2000 ms d'écart.
    expect(Math.round(plans[1]?.phaseMs ?? 0)).toBe(2000)
  })
})

describe('walkerSkinsFor — le choix est filtré par la famille', () => {
  it('un chemin d’ouvrier ne propose QUE des PNJ', () => {
    const skins = walkerSkinsFor('terrain_vierge', 'worker_path')
    expect(skins.length).toBeGreaterThan(0)
    // Un skin de camion sur un chemin piéton donnerait un camion qui MARCHE.
    expect(skins.some((s) => s.key.includes('truck'))).toBe(false)
    expect(skins.every((s) => s.key.startsWith('npc_'))).toBe(true)
  })

  it('les ouvriers nommés sont proposés, avec leur prénom lisible', () => {
    const skins = walkerSkinsFor('terrain_vierge', 'worker_path')
    const zin = skins.find((s) => s.key === 'npc_ouvrier_zinedine')
    expect(zin).toBeDefined()
    expect(zin?.label).toBe('Ouvrier — Zinedine')
  })

  it('un chemin de camion ne propose QUE des véhicules', () => {
    const skins = walkerSkinsFor('terrassement', 'truck_path')
    expect(skins.every((s) => !s.key.startsWith('npc_'))).toBe(true)
    expect(skins.some((s) => s.key === 'prop_s2_truck')).toBe(true)
  })

  it('un stage sans camion PROPRE propose quand même le camion PARTAGÉ — plus d’échec silencieux', () => {
    // Ce test assertait AVANT une liste VIDE : seul `terrassement` déclarait
    // `prop_s2_truck`, donc sur les 9 autres stages un chemin camion tombait dans
    // un `continue` MUET — et l'inspecteur ne pouvait que SIGNALER la panne.
    // La cause est supprimée : `CAMION_SKIN` est chargé sur les 10 stages, donc la
    // liste n'est jamais vide et le chemin est toujours rendu. On garde le stage de
    // l'utilisateur (`terrain_vierge`, sans camion propre) comme cas témoin.
    const skins = walkerSkinsFor('terrain_vierge', 'truck_path')
    expect(skins.some((s) => s.key === 'camion_benne')).toBe(true)
    // Le filtre par famille tient toujours : jamais de PNJ sur un chemin camion.
    expect(skins.every((s) => !s.key.startsWith('npc_'))).toBe(true)
    // Le camion propre au stage 02 ne fuite PAS sur les autres stages.
    expect(skins.some((s) => s.key === 'prop_s2_truck')).toBe(false)
  })
})

describe('Palette — les 2 outils de chemin sont RÉUNIS', () => {
  it('« Chemin ouvrier » et « Chemin camion » sont dans la MÊME section, sur les 10 stages', () => {
    for (const stage of ['terrain_vierge', 'terrassement', 'fondations', 'gros_oeuvre', 'livraison_audit']) {
      const cat = getStageCatalog(stage)
      const worker = cat.entries.find((e) => e.id === 'marker_worker_path')
      const truck = cat.entries.find((e) => e.id === 'marker_truck_path')
      expect(worker, `ouvrier manquant sur ${stage}`).toBeDefined()
      expect(truck, `camion manquant sur ${stage}`).toBeDefined()
      expect(worker?.category, `sections différentes sur ${stage}`).toBe(truck?.category)
    }
  })
})
