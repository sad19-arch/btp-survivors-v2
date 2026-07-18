import { describe, it, expect } from 'vitest'
import { PALETTE_ASSETS } from '@content/paletteAssets'
import { editorAsset, assetMeta } from '@/editor/PrefabCatalog'

/**
 * Retour playtest : routes/bancs posés à l'éditeur restaient INVISIBLES en jeu
 * normal — `GameScene.preload()` ne chargeait JAMAIS le catalogue palette (seul
 * l'éditeur le préchargeait) ; `siteRenderer` ignore silencieusement toute
 * texture absente. Fix : `PALETTE_ASSETS` (ici) est la source UNIQUE, importée
 * par `PrefabCatalog.ts` (éditeur) ET `GameScene.preload()` (jeu). Ces tests
 * verrouillent l'intégrité de la table et sa consommation côté éditeur — la
 * consommation côté `GameScene.preload()` est structurelle (tsc) : la boucle
 * `for (const a of PALETTE_ASSETS) { this.load.image(a.key, a.file) }` ne
 * compile QUE si `PALETTE_ASSETS` reste exportée avec cette forme.
 */
describe('PALETTE_ASSETS — source unique éditeur+jeu (retour playtest)', () => {
  it('table non vide, clés uniques', () => {
    expect(PALETTE_ASSETS.length).toBeGreaterThan(50)
    const keys = PALETTE_ASSETS.map((a) => a.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('tous les fichiers vivent sous palette/ (public/palette/**)', () => {
    for (const a of PALETTE_ASSETS) {
      expect(a.file, a.key).toMatch(/^palette\//)
    }
  })

  it('les tuiles de route sont bien role=decal (bug historique piste_strip)', () => {
    const routes = PALETTE_ASSETS.filter((a) => a.category === 'routes')
    expect(routes.length).toBeGreaterThan(0)
    for (const r of routes) {
      expect(r.role, r.key).toBe('decal')
      expect(r.snap, r.key).toBe(256)
    }
  })

  it('le banc public ("pal_bench", surnom user des routes/bancs invisibles) est présent', () => {
    const bench = PALETTE_ASSETS.find((a) => a.key === 'pal_bench')
    expect(bench).toBeDefined()
    expect(bench?.file).toBe('palette/props/bench.png')
  })

  it("l'éditeur résout bien ces assets (source unique intacte, pas de divergence)", () => {
    expect(editorAsset('pal_bench')?.file).toBe('palette/props/bench.png')
    expect(editorAsset('pal_route_goudron_droite')?.file).toBe('palette/routes/goudron_droite.png')
    expect(assetMeta('pal_bench')?.category).toBe('mobilier')
  })
})
