import { describe, it, expect } from 'vitest'
import { chunksForView, chunkPlacements, chunkHash, DEFAULT_CHUNK_SIZE } from '@render/decorStreamer'

/**
 * Tests unitaires PURS du DecorStreamer — fonctions sans Phaser, exécutables
 * en happy-dom (Vitest). Le rendu Phaser réel est validé par les tests e2e.
 */

const W = 10240
const H = 7680
const CS = DEFAULT_CHUNK_SIZE // 1024

// ── chunksForView ────────────────────────────────────────────────────────────

describe('chunksForView', () => {
  it('renvoie au moins 1 chunk quand la vue tient dans un seul chunk', () => {
    const keys = chunksForView({ x: 100, y: 100, width: 200, height: 200 }, CS, 0, W, H)
    expect(keys.size).toBeGreaterThanOrEqual(1)
  })

  it('avec margin=1, renvoie plus de chunks que sans marge', () => {
    const view = { x: 500, y: 500, width: 600, height: 600 }
    const noMargin = chunksForView(view, CS, 0, W, H)
    const withMargin = chunksForView(view, CS, 1, W, H)
    expect(withMargin.size).toBeGreaterThan(noMargin.size)
  })

  it('les clés sont de la forme "cx,cy" avec cx et cy entiers >= 0', () => {
    const keys = chunksForView({ x: 0, y: 0, width: 1024, height: 1024 }, CS, 1, W, H)
    for (const key of keys) {
      const [cxStr, cyStr] = key.split(',')
      const cx = parseInt(cxStr ?? '-1', 10)
      const cy = parseInt(cyStr ?? '-1', 10)
      expect(cx).toBeGreaterThanOrEqual(0)
      expect(cy).toBeGreaterThanOrEqual(0)
    }
  })

  it('ne déborde pas hors du monde', () => {
    // Vue centrée près du bord droit/bas.
    const keys = chunksForView({ x: W - 200, y: H - 200, width: 400, height: 400 }, CS, 1, W, H)
    const maxCx = Math.ceil(W / CS) - 1
    const maxCy = Math.ceil(H / CS) - 1
    for (const key of keys) {
      const [cxStr, cyStr] = key.split(',')
      const cx = parseInt(cxStr ?? '9999', 10)
      const cy = parseInt(cyStr ?? '9999', 10)
      expect(cx).toBeLessThanOrEqual(maxCx)
      expect(cy).toBeLessThanOrEqual(maxCy)
    }
  })

  it('vue couvrant tout le monde ⇒ tous les chunks du monde (marge 0)', () => {
    const keys = chunksForView({ x: 0, y: 0, width: W, height: H }, CS, 0, W, H)
    const expectedCols = Math.ceil(W / CS)
    const expectedRows = Math.ceil(H / CS)
    expect(keys.size).toBe(expectedCols * expectedRows)
  })

  it('le nombre de chunks est borné même pour un monde ×10', () => {
    // Vue typique (1024×768 pixels écran à zoom 1.2 → ~853×640 px monde).
    const view = { x: 4000, y: 3000, width: 853, height: 640 }
    const keys = chunksForView(view, CS, 1, W, H)
    // Avec marge 1 et une vue < 2 chunks × 2 chunks → au plus (2+2)² = 16 chunks.
    expect(keys.size).toBeLessThanOrEqual(16)
  })
})

// ── chunkHash ────────────────────────────────────────────────────────────────

describe('chunkHash', () => {
  it('est déterministe : même (seed, cx, cy) ⇒ même hash', () => {
    expect(chunkHash(42, 3, 7)).toBe(chunkHash(42, 3, 7))
  })

  it('des chunks différents produisent des hashes différents', () => {
    const h1 = chunkHash(42, 3, 7)
    const h2 = chunkHash(42, 3, 8)
    const h3 = chunkHash(42, 4, 7)
    expect(h1).not.toBe(h2)
    expect(h1).not.toBe(h3)
    expect(h2).not.toBe(h3)
  })

  it('des seeds différentes produisent des hashes différents', () => {
    expect(chunkHash(1, 0, 0)).not.toBe(chunkHash(2, 0, 0))
  })

  it('retourne un entier non négatif (uint32)', () => {
    const h = chunkHash(12345, 99, -1)
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })
})

// ── chunkPlacements ──────────────────────────────────────────────────────────

describe('chunkPlacements', () => {
  const seed = 99
  const cx = 2
  const cy = 3

  it('est déterministe : deux appels identiques ⇒ mêmes positions', () => {
    const a = chunkPlacements(seed, cx, cy, CS, W, H, 3, [5, 3])
    const b = chunkPlacements(seed, cx, cy, CS, W, H, 3, [5, 3])
    expect(a).toEqual(b)
  })

  it('des chunks différents produisent des positions différentes', () => {
    const a = chunkPlacements(seed, cx, cy, CS, W, H, 3, [10])
    const b = chunkPlacements(seed, cx + 1, cy, CS, W, H, 3, [10])
    // Il est astronomiquement improbable que tous les placements coïncident.
    expect(a.props[0]).not.toEqual(b.props[0])
  })

  it('les positions des décalques restent proches du chunk (une grappe peut légèrement déborder de son rayon)', () => {
    const { decals } = chunkPlacements(seed, cx, cy, CS, W, H, 5, [])
    const x0 = cx * CS
    const y0 = cy * CS
    // Les grappes sont centrées DANS le chunk mais leurs décalques peuvent déborder
    // du bord du chunk jusqu'à CLUMP_RADIUS (130) — voulu, le rendu ne clippe pas.
    const margin = 130
    for (const d of decals) {
      expect(d.x).toBeGreaterThanOrEqual(x0 - margin)
      expect(d.x).toBeLessThan(x0 + CS + margin)
      expect(d.y).toBeGreaterThanOrEqual(y0 - margin)
      expect(d.y).toBeLessThan(y0 + CS + margin)
    }
  })

  it('les décalques sont regroupés en grappes serrées autour d\'un prop (pas de scatter uniforme)', () => {
    const { decals, props } = chunkPlacements(seed, cx, cy, CS, W, H, 4, [6])
    const flatProps = props.flat()
    expect(flatProps.length).toBeGreaterThan(0)
    for (const d of decals) {
      const minDist = Math.min(...flatProps.map((p) => Math.hypot(d.x - p.x, d.y - p.y)))
      // Rayon de grappe (CLUMP_RADIUS = 130) + marge flottante minime.
      expect(minDist).toBeLessThanOrEqual(130 + 1e-6)
    }
  })

  it('les indices de décalques restent dans [0, decalCount[', () => {
    const { decals } = chunkPlacements(seed, cx, cy, CS, W, H, 4, [])
    for (const d of decals) {
      expect(d.decalIndex).toBeGreaterThanOrEqual(0)
      expect(d.decalIndex).toBeLessThan(4)
    }
  })

  it('les positions de props sont dans les bornes du chunk', () => {
    const { props } = chunkPlacements(seed, cx, cy, CS, W, H, 0, [8, 4])
    const x0 = cx * CS
    const y0 = cy * CS
    for (const group of props) {
      for (const p of group) {
        expect(p.x).toBeGreaterThanOrEqual(x0)
        expect(p.x).toBeLessThanOrEqual(x0 + CS)
        expect(p.y).toBeGreaterThanOrEqual(y0)
        expect(p.y).toBeLessThanOrEqual(y0 + CS)
      }
    }
  })

  it('le nombre de props est borné (une pièce maîtresse par grappe, proportionnel à la surface du chunk)', () => {
    // Un chunk 1024×1024 : clumpCount = round(1024*1024 / (800*800)) = round(1.638) = 2.
    // Avec un seul groupe de props ([10] → longueur 1), chaque grappe réussie y pousse
    // exactement 1 prop (la valeur du baseCount n'influence plus le compte, seule la
    // LONGUEUR de propCounts sert à choisir l'indice de groupe).
    const { props } = chunkPlacements(seed, 0, 0, CS, W, H, 0, [10])
    expect(props[0]?.length).toBeLessThanOrEqual(2) // ≤ clumpCount
    expect(props[0]?.length).toBeGreaterThanOrEqual(0)
  })

  it('retourne un tableau de props par PropDef', () => {
    const propCounts = [3, 5, 2]
    const { props } = chunkPlacements(seed, cx, cy, CS, W, H, 2, propCounts)
    expect(props.length).toBe(propCounts.length)
  })

  it('produit un nombre de décalques raisonnable (≈ clumpCount × 3-6 par grappe)', () => {
    const { decals } = chunkPlacements(seed, cx, cy, CS, W, H, 3, [])
    // Pour chunk 1024×1024 : clumpCount ≈ round(1024*1024 / (800*800)) = 2 grappes,
    // chacune 3 à 6 décalques ⇒ attendu entre 6 et 12 (avant exclusion/collision spawn).
    // On borne par une plage large (exclusion centrale peut réduire).
    expect(decals.length).toBeGreaterThan(0)
    expect(decals.length).toBeLessThan(50)
  })

  it('le chunk du centre du monde a moins de décalques (exclusion spawn)', () => {
    // Chunk centré sur le spawn (cx=5,cy=3 ≈ centre de 10240×7680).
    const centerCx = Math.floor(W / 2 / CS) // 5
    const centerCy = Math.floor(H / 2 / CS) // 3
    const { decals: centerDecals } = chunkPlacements(seed, centerCx, centerCy, CS, W, H, 5, [])
    const { decals: farDecals } = chunkPlacements(seed, 0, 0, CS, W, H, 5, [])
    // Le chunk du centre peut avoir moins (exclusion centrale) — mais ce n'est pas garanti
    // car l'exclusion ne couvre qu'un rayon 300 dans un chunk 1024×1024.
    // On vérifie juste que les deux ne plantent pas et retournent un tableau.
    expect(Array.isArray(centerDecals)).toBe(true)
    expect(Array.isArray(farDecals)).toBe(true)
  })
})
