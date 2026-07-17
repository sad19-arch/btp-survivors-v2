import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSiteLayout, resolveSitePlan } from '@core/siteLayout'
import { buildSitePlan } from '@core/sitePlan'
import { setRuntimeLayout } from '@content/runtimeLayouts'
import { emptyLayout, type StageLayout } from '@content/stageLayout'

/**
 * `StageLayout.keepSitePlan` — l'interrupteur « le plan de chantier procédural ne
 * se superpose PAS à ma composition ».
 *
 * Le défaut corrigé : sur les stages À PROGRAMME (`terrassement`, `fondations`),
 * un plan procédural se ré-injectait PAR-DESSUS la compo du joueur, sur les DEUX
 * chemins — obstacles côté sim, décor côté rendu.
 *
 * Les compos sont injectées via `setRuntimeLayout` (le vrai levier de l'app au
 * boot) → on teste le VRAI code de prod, pas une recopie de la condition.
 */

const SEED = 42
const W = 10240
const H = 7680

/** Compo VIDE (aucune instance) : tout obstacle observé vient donc du PLAN. */
function composition(stage: string, keepSitePlan?: boolean): StageLayout {
  const l = emptyLayout(stage)
  if (keepSitePlan !== undefined) {
    l.keepSitePlan = keepSitePlan
  }
  return l
}

afterEach(() => {
  setRuntimeLayout('terrassement', null)
  setRuntimeLayout('fondations', null)
  setRuntimeLayout('terrain_vierge', null)
})

describe('keepSitePlan — chemin SIM (obstacles)', () => {
  it('keepSitePlan:false sur terrassement ⇒ AUCUN obstacle du plan', () => {
    setRuntimeLayout('terrassement', composition('terrassement', false))
    const layout = buildSiteLayout(SEED, W, H, 'terrassement')
    expect(layout.obstacles).toEqual([])
  })

  it('keepSitePlan absent ⇒ plan CONSERVÉ (non-régression des compos existantes)', () => {
    setRuntimeLayout('terrassement', composition('terrassement'))
    const layout = buildSiteLayout(SEED, W, H, 'terrassement')
    // La compo est vide : ces obstacles ne peuvent venir que du plan.
    expect(layout.obstacles.length).toBeGreaterThan(0)
  })

  it('keepSitePlan:true ⇒ plan conservé (explicite = défaut)', () => {
    setRuntimeLayout('terrassement', composition('terrassement', true))
    expect(buildSiteLayout(SEED, W, H, 'terrassement').obstacles.length).toBeGreaterThan(0)
  })

  it('fondations : plan SANS clôture ⇒ 0 obstacle dans les deux cas (c\'est le DÉCOR qui était en trop)', () => {
    // Constat mesuré : le plan de `fondations` a des zones mais AUCUNE clôture
    // (`fences: []`). Le chemin sim n'y injectait donc déjà rien — seul le RENDU
    // (terre excavée, pistes) se superposait à la compo. Le drapeau agit bien sur
    // ce stage, mais via `resolveSitePlan` (cf. « PARITÉ »), pas via les obstacles.
    setRuntimeLayout('fondations', composition('fondations'))
    expect(buildSiteLayout(SEED, W, H, 'fondations').obstacles).toEqual([])
    expect(resolveSitePlan(SEED, W, H, 'fondations')?.fences).toEqual([])
  })

  it('fondations : keepSitePlan:false ⇒ plan supprimé (donc décor supprimé au rendu)', () => {
    setRuntimeLayout('fondations', composition('fondations'))
    expect(resolveSitePlan(SEED, W, H, 'fondations')).not.toBeNull()
    setRuntimeLayout('fondations', composition('fondations', false))
    expect(resolveSitePlan(SEED, W, H, 'fondations')).toBeNull()
  })

  it('aucune compo ⇒ plan présent (jeu génératif inchangé)', () => {
    expect(buildSiteLayout(SEED, W, H, 'terrassement').obstacles.length).toBeGreaterThan(0)
  })
})

describe('keepSitePlan — PARITÉ sim ⇄ rendu', () => {
  /**
   * La sim et le rendu doivent prendre EXACTEMENT la même décision : une divergence
   * donne soit un obstacle invisible (on bute sur du vide), soit du décor
   * traversable. `resolveSitePlan` est le point de décision UNIQUE des deux.
   */
  it('resolveSitePlan ⇒ null quand keepSitePlan:false (donc ni obstacle, ni décor)', () => {
    setRuntimeLayout('terrassement', composition('terrassement', false))
    expect(resolveSitePlan(SEED, W, H, 'terrassement')).toBeNull()
  })

  it('resolveSitePlan ⇒ le plan quand le drapeau est absent', () => {
    setRuntimeLayout('terrassement', composition('terrassement'))
    expect(resolveSitePlan(SEED, W, H, 'terrassement')?.fences.length).toBeGreaterThan(0)
  })

  it('les obstacles de la sim dérivent des clôtures de CE plan (même source)', () => {
    setRuntimeLayout('terrassement', composition('terrassement'))
    const plan = resolveSitePlan(SEED, W, H, 'terrassement')
    const layout = buildSiteLayout(SEED, W, H, 'terrassement')
    expect(layout.obstacles).toHaveLength(plan?.fences.length ?? -1)
  })

  it('sans suppression, resolveSitePlan est le plan brut (aucun effet de bord)', () => {
    expect(resolveSitePlan(SEED, W, H, 'terrassement')).toEqual(buildSitePlan(SEED, W, H, 'terrassement'))
  })

  it('le rendu passe par resolveSitePlan et JAMAIS par buildSitePlan (garde anti-dérive)', () => {
    // Garde STRUCTURELLE : si un jour siteRenderer rappelle `buildSitePlan` en
    // direct, il recommence à dessiner un plan que la sim a supprimé — le bug
    // exact que ce lot corrige. Le test échoue AVANT que ça n'arrive en jeu.
    const src = readFileSync(resolve(process.cwd(), 'src/render/scenes/siteRenderer.ts'), 'utf8')
    expect(src).toContain('resolveSitePlan(seed, worldW, worldH, stageId)')
    expect(src).not.toContain('buildSitePlan(')
  })
})

describe('keepSitePlan — stage SANS programme', () => {
  it('terrain_vierge : aucun plan, quel que soit le drapeau', () => {
    for (const flag of [undefined, true, false]) {
      setRuntimeLayout('terrain_vierge', composition('terrain_vierge', flag))
      expect(resolveSitePlan(SEED, W, H, 'terrain_vierge')).toBeNull()
      expect(buildSiteLayout(SEED, W, H, 'terrain_vierge').obstacles).toEqual([])
    }
  })
})
