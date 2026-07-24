import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { EditorOverlay, stageHasSitePlan } from '@/editor/EditorOverlay'
import type { EditorScene } from '@/editor/EditorScene'
import { STAGE_LIST } from '@/editor/PrefabCatalog'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { saveUserLayout, deleteUserLayout } from '@ui/userLayouts'
import type { StageLayout } from '@content/stageLayout'

/**
 * Deux garanties de l'éditeur autour du niveau d'origine :
 *  - « Restaurer le niveau d'origine » (deleteUserLayout) rend RÉELLEMENT la main
 *    au niveau génératif au boot suivant, SANS toucher au brouillon ;
 *  - `keepSitePlan` survit à l'export jouable ET au cycle de brouillon, et sa case
 *    n'apparaît que là où un plan de chantier procédural existe vraiment.
 */

/** Scène minimale : l'overlay ne lit que ces membres au montage/refresh. */
function makeScene(stage: string, state: EditorState): EditorScene {
  return {
    stage,
    state,
    active: { prefab: null, marker: null },
    clearActive: () => {},
    fitGameZoom: () => {},
    fitOverview: () => {},
    toggleWalk: () => {}
  } as unknown as EditorScene
}

function mountToolbar(stage: string, state: EditorState): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  new EditorOverlay(root, makeScene(stage, state), () => {})
  return root
}

const CHECK_LABEL = 'Garder le plan de chantier de base'

function checkboxLabels(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.sce-check')).map((e) => e.textContent ?? '')
}

describe('éditeur — restaurer le niveau d\'origine (A4)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  /**
   * Simule un BOOT du jeu : `vi.resetModules()` rend au registre runtime son état
   * vierge de page fraîche, puis `applyUserLayouts` rejoue la vraie réinjection.
   * Indispensable ici : `deleteUserLayout` n'écrit que dans localStorage — c'est
   * le boot suivant qui matérialise le retour au génératif.
   */
  async function bootGame(): Promise<StageLayout | null> {
    vi.resetModules()
    const { resolveComposedLayout } = await import('@content/runtimeLayouts')
    const { applyUserLayouts } = await import('@/app/userLayoutBoot')
    applyUserLayouts()
    return resolveComposedLayout('terrassement')
  }

  it('save → boot : le stage joue la compo du joueur', async () => {
    const custom = new EditorState('terrassement')
    custom.setSpawn(123, -45)
    saveUserLayout('terrassement', custom.exportGameJson())
    const resolved = await bootGame()
    expect(resolved).not.toBeNull()
    expect(resolved?.spawn).toEqual({ x: 123, y: -45 })
  })

  it('save puis delete → boot : retour à la composition committée', async () => {
    const custom = new EditorState('terrassement')
    custom.setSpawn(123, -45)
    saveUserLayout('terrassement', custom.exportGameJson())
    expect(await bootGame()).not.toBeNull()

    deleteUserLayout('terrassement')
    // La suppression retire seulement l'override joueur : la composition
    // committée redevient la source de vérité.
    const { getComposedLayout } = await import('@content/composedLayouts')
    expect(await bootGame()).toStrictEqual(getComposedLayout('terrassement'))
    expect(await bootGame()).not.toBeNull()
  })

  it('delete NE TOUCHE PAS au brouillon de l\'éditeur (stores distincts)', () => {
    const draft = new EditorState('terrassement')
    draft.setSpawn(77, 88)
    saveUserLayout('terrassement', draft.exportGameJson())

    deleteUserLayout('terrassement')

    // Le brouillon `stageComposer:terrassement` survit : l'éditeur rouvre le
    // travail en cours et l'utilisateur peut re-sauver derrière.
    expect(localStorage.getItem('stageComposer:terrassement')).not.toBeNull()
    expect(new EditorState('terrassement').exportJson()).toContain('"x": 77')
  })
})

describe('éditeur — keepSitePlan (A3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('par défaut : coché (champ absent du layout = plan conservé)', () => {
    const s = new EditorState('terrassement')
    expect(s.keepSitePlan).toBe(true)
    expect(JSON.parse(s.exportGameJson()) as Record<string, unknown>).not.toHaveProperty('keepSitePlan')
  })

  it('décoché : keepSitePlan:false survit à exportGameJson (relu par parseLayout)', () => {
    const s = new EditorState('terrassement')
    s.setKeepSitePlan(false)
    const json = s.exportGameJson()
    expect((JSON.parse(json) as StageLayout).keepSitePlan).toBe(false)
    // Le vrai chemin de relecture du jeu (applyUserLayouts → parseLayout).
    const res = parseLayout(json, 'terrassement')
    expect(res.ok).toBe(true)
    expect(res.layout?.keepSitePlan).toBe(false)
  })

  it('décoché : survit au cycle BROUILLON (sauvegarde auto → rechargement)', () => {
    const s = new EditorState('terrassement')
    s.setKeepSitePlan(false)
    // Nouvel EditorState = relit `stageComposer:terrassement` (le brouillon).
    expect(new EditorState('terrassement').keepSitePlan).toBe(false)
  })

  it('recoché : revient au défaut (champ retiré, aucune divergence d\'export)', () => {
    const s = new EditorState('terrassement')
    s.setKeepSitePlan(false)
    s.setKeepSitePlan(true)
    expect(s.keepSitePlan).toBe(true)
    expect(JSON.parse(s.exportGameJson()) as Record<string, unknown>).not.toHaveProperty('keepSitePlan')
    expect(new EditorState('terrassement').keepSitePlan).toBe(true)
  })

  it('annuler rétablit keepSitePlan (c\'est bien une mutation de layout)', () => {
    const s = new EditorState('terrassement')
    s.setKeepSitePlan(false)
    s.undo()
    expect(s.keepSitePlan).toBe(true)
  })
})

describe('éditeur — import du niveau généré', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it.each(STAGE_LIST.slice(1))('$label masque le bootstrap généré et explique le chargement manuel', ({ id }) => {
    const root = mountToolbar(id, new EditorState(id))
    const labels = Array.from(root.querySelectorAll('button')).map((button) => button.textContent ?? '')

    expect(labels).not.toContain('🏗 Partir du niveau existant')
    expect(root.textContent).toContain('Stage manuel : utiliser Charger un fichier')
    expect(labels).toContain('⬆ Charger un fichier')
  })

  it('terrain vierge conserve le bootstrap du niveau généré', () => {
    const root = mountToolbar('terrain_vierge', new EditorState('terrain_vierge'))
    const labels = Array.from(root.querySelectorAll('button')).map((button) => button.textContent ?? '')

    expect(labels).toContain('🏗 Partir du niveau existant')
    expect(root.textContent).not.toContain('Stage manuel : utiliser Charger un fichier')
  })
})

describe('éditeur — la case n\'existe que sur les stages à plan de chantier', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('stageHasSitePlan : vrai pour les 8 stages à programme, faux pour les 2 abstentions', () => {
    const withPlan = STAGE_LIST.map((s) => s.id).filter((id) => stageHasSitePlan(id))
    expect(withPlan.sort()).toEqual([
      'charpente_toiture',
      'echafaudages',
      'finitions',
      'fondations',
      'gros_oeuvre',
      'livraison_audit',
      'second_oeuvre',
      'terrassement'
    ])
    // Ces deux-là n'ont PAS de programme, et c'est une DÉCISION documentée dans
    // `SITE_PROGRAMS` (terrain_vierge = stage de sim:check + témoin du test
    // keepSitePlan ; reseaux_enterres = déjà servi par siteStructures). Le test
    // les épingle pour qu'un ajout distrait se voie.
    expect(stageHasSitePlan('terrain_vierge')).toBe(false)
    expect(stageHasSitePlan('reseaux_enterres')).toBe(false)
  })

  /**
   * ⚠️ CONTRAT ANTI-RÉGRESSION (bug rapporté : « le niveau de base ne doit plus
   * s'afficher quelles que soient les conditions »). Un stage à programme SANS sa
   * case, c'est le plan procédural qui écrase la compo du joueur SANS AUCUN
   * RECOURS dans l'éditeur. La boucle est DÉRIVÉE du registre — pas une liste
   * recopiée — pour qu'un 9ᵉ programme soit couvert le jour où il arrive.
   */
  it('TOUT stage à programme monte la case (aucun plan sans interrupteur)', () => {
    const withPlan = STAGE_LIST.map((s) => s.id).filter((id) => stageHasSitePlan(id))
    expect(withPlan.length).toBeGreaterThanOrEqual(8)
    for (const stage of withPlan) {
      const root = mountToolbar(stage, new EditorState(stage))
      expect(checkboxLabels(root), `stage "${stage}" : plan de chantier SANS case`).toContain(CHECK_LABEL)
    }
  })

  it('les autres stages : aucune case (l\'interrupteur y serait mort)', () => {
    const others = STAGE_LIST.map((s) => s.id).filter((id) => !stageHasSitePlan(id))
    expect(others.length).toBeGreaterThan(0)
    for (const stage of others) {
      const root = mountToolbar(stage, new EditorState(stage))
      expect(checkboxLabels(root)).not.toContain(CHECK_LABEL)
    }
  })

  it('la case reflète l\'état et le pilote (clic → setKeepSitePlan)', () => {
    const state = new EditorState('terrassement')
    const root = mountToolbar('terrassement', state)
    const input = root.querySelector<HTMLInputElement>('.sce-check input')
    expect(input?.checked).toBe(true)
    input?.click()
    expect(state.keepSitePlan).toBe(false)
  })

  it('la case se resynchronise sur annuler (refresh ne la laisse pas mentir)', () => {
    const state = new EditorState('terrassement')
    const root = mountToolbar('terrassement', state)
    const overlay = new EditorOverlay(root, makeScene('terrassement', state), () => {})
    state.setKeepSitePlan(false)
    overlay.refresh()
    const inputs = root.querySelectorAll<HTMLInputElement>('.sce-check input')
    expect(inputs[inputs.length - 1]?.checked).toBe(false)
    state.undo()
    overlay.refresh()
    expect(inputs[inputs.length - 1]?.checked).toBe(true)
  })
})
