import { describe, it, expect } from 'vitest'
import { Rng } from '@core/rng'
import { CLUSTERS } from '@content/clusters'
import { SITE_PROGRAMS } from '@content/sitePrograms'
import {
  buildSiteLayout,
  ROUTE_BAND,
  ROUTE_TILE,
  MIN_GAP,
  SPAWN_SAFE_R,
  type PlacedCluster
} from '@core/siteLayout'

const WORLD_W = 10240
const WORLD_H = 7680
const SEED = 42

/**
 * Poche jouable garantie autour du spawn (px) : AUCUN élément collidable (both)
 * n'y pénètre, même la scène signature ancrée au spawn par conception (R-F).
 * Le joueur démarre au bord d'un trou (le trou = élément collidable le plus proche,
 * ~270 px au nord ; le côté joueur de la scène est décoratif) mais a toujours de
 * quoi bouger — il ne naît jamais coincé dans la fosse.
 */
const SPAWN_POCKET_R = 200

// ─────────────────────────────────────────────────────────────────────────────
// 1. Determinisme
// ─────────────────────────────────────────────────────────────────────────────
describe('siteLayout — determinisme', () => {
  it('1. meme (seed, worldW, worldH, stageId) produit le meme SiteLayout', () => {
    const a = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    const b = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    expect(a).toEqual(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. terrain_vierge a désormais des clusters (rollout complet, phase 8) ;
//    la garde « layout vide » ne concerne plus que les stages INCONNUS.
// ─────────────────────────────────────────────────────────────────────────────
describe('siteLayout — terrain_vierge', () => {
  it('2. terrain_vierge produit des clusters ET des obstacles (compo installation de chantier)', () => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrain_vierge')
    expect(layout.clusters.length).toBeGreaterThan(0)
    expect(layout.obstacles.length).toBeGreaterThan(0)
  })

  it('2b. stage inconnu retourne clusters:[]/obstacles:[]/destructibles:[] (garde générique)', () => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'stage_inexistant')
    expect(layout).toEqual({ clusters: [], obstacles: [], destructibles: [] })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Securite spawn
// ─────────────────────────────────────────────────────────────────────────────
describe('siteLayout — securite spawn', () => {
  // Couvre terrassement ET terrain_vierge : ce dernier est désormais le stage de
  // sim:check ET a des clusters collidables (workCluster) → la sécurité du spawn
  // doit tenir là aussi (sinon le joueur naîtrait coincé dans une clôture).
  const SAFE_STAGES = ['terrassement', 'terrain_vierge', 'fondations'] as const

  it.each(SAFE_STAGES)('3. [%s] poche de spawn libre : aucun ÉLÉMENT collidable (both) dans SPAWN_POCKET_R', (stageId) => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, stageId)
    const spawnX = WORLD_W / 2
    const spawnY = WORLD_H / 2

    // Garantie HONNÊTE (au niveau de l'élément, pas de l'ancre) : le joueur ne
    // naît jamais DANS un collidable. On mesure la distance spawn→CHAQUE élément
    // collidable, pas seulement l'ancre du cluster (une scène ancrée au spawn a
    // son ancre proche mais ses collidables restent hors de la poche).
    for (const pc of layout.clusters) {
      const def = CLUSTERS[pc.defId]
      if (def === undefined) {
        continue
      }
      for (const el of def.elements) {
        if (el.collide !== 'both') {
          continue
        }
        const ex = pc.x + (el.dx ?? 0)
        const ey = pc.y + (el.dy ?? 0)
        const d = Math.hypot(ex - spawnX, ey - spawnY)
        expect(
          d,
          `[${stageId}] élément collidable de "${pc.defId}" a ${d.toFixed(0)}px < poche SPAWN_POCKET_R=${SPAWN_POCKET_R} du spawn`
        ).toBeGreaterThanOrEqual(SPAWN_POCKET_R)
      }
    }
  })

  it.each(SAFE_STAGES)('3-bis. [%s] hors scène signature, aucune ancre collidable (both) sous SPAWN_SAFE_R', (stageId) => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, stageId)
    const spawnX = WORLD_W / 2
    const spawnY = WORLD_H / 2
    // Un stage AVEC zone signature ancre volontairement UNE scène (pelleteuse+
    // trou) près du spawn (R-F) → la garde du grand rayon ne s'applique qu'aux
    // stages SANS signature (ex. terrain_vierge legacy : grande clairière).
    const hasSignature = (SITE_PROGRAMS[stageId]?.zones ?? []).some(
      (z) => z.signature === true
    )
    if (hasSignature) {
      return
    }

    for (const pc of layout.clusters) {
      const def = CLUSTERS[pc.defId]
      if (def === undefined) {
        continue
      }
      const hasCollidable = def.elements.some((el) => el.collide === 'both')
      if (!hasCollidable) {
        continue
      }
      const d = Math.sqrt((pc.x - spawnX) ** 2 + (pc.y - spawnY) ** 2)
      expect(
        d,
        `[${stageId}] cluster collidable "${pc.defId}" a distance ${d.toFixed(1)} < SPAWN_SAFE_R=${SPAWN_SAFE_R} du spawn`
      ).toBeGreaterThanOrEqual(SPAWN_SAFE_R)
    }
  })

  it.each(SAFE_STAGES)('3b. [%s] aucun obstacle blocks="both" pile sur le spawn (origine != centre)', (stageId) => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, stageId)
    const spawnX = WORLD_W / 2
    const spawnY = WORLD_H / 2

    for (const obs of layout.obstacles) {
      if (obs.blocks !== 'both') {
        continue
      }
      // NB : l'origine d'un obstacle est DÉCALÉE de l'ancre (clôture dy-110…),
      // donc elle peut être < SPAWN_SAFE_R alors que l'ancre est sûre (test 3).
      // On vérifie seulement qu'aucun obstacle n'est PILE sur le spawn.
      const d = Math.sqrt((obs.x - spawnX) ** 2 + (obs.y - spawnY) ** 2)
      expect(
        d,
        `[${stageId}] obstacle blocks="both" origine a dist=${d.toFixed(1)} du spawn (pile dessus)`
      ).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Espacement : toute paire d'ancres NON-route a distance >= MIN_GAP
// (les tuiles route sont intentionnellement adjacentes a ~ROUTE_TILE px)
// ─────────────────────────────────────────────────────────────────────────────
describe('siteLayout — espacement', () => {
  it("4. toute paire de clusters non-route est distante d'au moins MIN_GAP", () => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    // Exclure les clusters de route : ils sont volontairement adjacents (~ROUTE_TILE px)
    const clusters: PlacedCluster[] = layout.clusters.filter(
      (c) => c.defId !== 'cluster_route'
    )

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i]
        const b = clusters[j]
        if (a === undefined || b === undefined) {
          continue
        }
        const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
        expect(
          d,
          `Clusters[${i}]="${a.defId}" et [${j}]="${b.defId}" trop proches : dist=${d.toFixed(1)} < MIN_GAP=${MIN_GAP}`
        ).toBeGreaterThanOrEqual(MIN_GAP)
      }
    }
  })

  it('4b. ROUTE_TILE exporte correctement depuis siteLayout', () => {
    // Simple sanite check — la constante est bien exportee et > 0
    expect(ROUTE_TILE).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Isolation RNG : buildSiteLayout n'altere pas une sequence RNG externe
// ─────────────────────────────────────────────────────────────────────────────
describe('siteLayout — isolation RNG', () => {
  it('5. une sequence Rng(42) externe est identique avant et apres buildSiteLayout', () => {
    const extRng = new Rng(SEED)
    // Consomme 5 valeurs pour avancer le state
    for (let i = 0; i < 5; i++) {
      extRng.next()
    }
    const snapBefore = extRng.snapshot()

    // Appel de buildSiteLayout — ne doit pas toucher extRng
    buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')

    // L'etat externe doit etre inchange
    expect(extRng.snapshot()).toBe(snapBefore)
  })

  it('5b. les valeurs tirees apres appel sont identiques a une ref sans appel', () => {
    const rngA = new Rng(SEED)
    for (let i = 0; i < 5; i++) {
      rngA.next()
    }
    buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    const valuesA = [rngA.next(), rngA.next(), rngA.next()]

    const rngB = new Rng(SEED)
    for (let i = 0; i < 5; i++) {
      rngB.next()
    }
    // pas d'appel a buildSiteLayout
    const valuesB = [rngB.next(), rngB.next(), rngB.next()]

    expect(valuesA).toEqual(valuesB)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Obstacles bien formes
// ─────────────────────────────────────────────────────────────────────────────
describe('siteLayout — obstacles bien formes', () => {
  it('6a. chaque circle a r>0', () => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    const circles = layout.obstacles.filter((o) => o.kind === 'circle')
    for (const obs of circles) {
      expect(obs.r).toBeDefined()
      expect(obs.r).toBeGreaterThan(0)
    }
  })

  it('6b. chaque segment a thickness>0 et un 2e point distinct', () => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    const segs = layout.obstacles.filter((o) => o.kind === 'segment')
    for (const obs of segs) {
      expect(obs.thickness).toBeDefined()
      expect(obs.thickness).toBeGreaterThan(0)
      expect(obs.x2).toBeDefined()
      expect(obs.y2).toBeDefined()
      const samePt = obs.x2 === obs.x && obs.y2 === obs.y
      expect(samePt, 'segment avec 2e point identique au 1er (longueur nulle)').toBe(false)
    }
  })

  it("6c. blocks in {'both', 'enemies'} — jamais 'none'", () => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    for (const obs of layout.obstacles) {
      expect(['both', 'enemies']).toContain(obs.blocks)
    }
  })

  it('6d. terrassement produit au moins 1 cluster et 1 obstacle', () => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    expect(layout.clusters.length).toBeGreaterThan(0)
    expect(layout.obstacles.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Route au sud
// ─────────────────────────────────────────────────────────────────────────────
describe('siteLayout — route au sud', () => {
  it('7. les clusters de type cluster_route ont y dans la bande sud', () => {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, 'terrassement')
    const routeClusters = layout.clusters.filter((pc) => pc.defId === 'cluster_route')
    expect(routeClusters.length).toBeGreaterThan(0)
    for (const rc of routeClusters) {
      expect(rc.y).toBeGreaterThanOrEqual(WORLD_H - ROUTE_BAND)
      expect(rc.y).toBeLessThanOrEqual(WORLD_H)
    }
  })
})
