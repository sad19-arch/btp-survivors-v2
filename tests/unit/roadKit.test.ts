import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

/**
 * Kit de routes 256 px — le RACCORD est la seule exigence dure d'un kit de
 * tuiles, et c'est exactement ce qu'aucune vérification à l'œil n'attrape : deux
 * tuiles peuvent sembler bonnes chacune et ne pas se rejoindre de 4 px.
 *
 * Ce que ce test verrouille (mesuré, pas supposé) :
 *  1. toutes les tuiles font 256×256 (le pas de grille en dépend) ;
 *  2. tout bord PORTEUR de route présente le MÊME intervalle opaque, centré sur
 *     128 — donc n'importe quelle pièce se pose contre n'importe quelle autre,
 *     y compris après rotation (l'instance porte `rotation`) ;
 *  3. à matière égale, les bords nord sont PIXEL-IDENTIQUES : près du bord,
 *     l'axe de chaque pièce est géométriquement le même (le virage est tangent
 *     vertical en (128,0)), donc le profil doit l'être aussi. C'est le test qui
 *     tomberait si quelqu'un retouchait une pièce isolément.
 *
 * Les tuiles sont COMPOSÉES (`tools/assets/make-roads.mjs`) précisément parce que
 * la génération directe ne raccorde pas : deux `create_map_object` lancés avec le
 * même prompt ont rendu des chaussées de 160 px et 90 px, l'une à accotement de
 * gravier, l'autre à accotement d'HERBE.
 */

const DIR = 'public/palette/routes'
const TILE = 256
const ROAD_HALF = 72
const SHOULDER = 20
const OUTER = ROAD_HALF + SHOULDER // 92

/** Intervalle opaque attendu sur un bord porteur : centres de pixels à d <= 92 de 128. */
const SPAN = { first: 36, last: 219 }

// Tuples non vides : le premier élément sert de RÉFÉRENCE de bord à sa famille.
const GOUDRON: readonly [string, ...string[]] = ['goudron_droite', 'goudron_virage', 'goudron_te', 'goudron_croisement', 'goudron_fin']
const PISTE: readonly [string, ...string[]] = ['piste_droite', 'piste_virage', 'piste_te', 'piste_croisement', 'piste_fin']
const ALL = [...GOUDRON, ...PISTE, 'jonction_goudron_piste']

function load(name: string): PNG {
  return PNG.sync.read(readFileSync(`${DIR}/${name}.png`))
}

type Edge = 'N' | 'S' | 'E' | 'W'

/** Les 256 pixels RGBA du bord demandé, dans l'ordre croissant de l'axe libre. */
function edgePixels(p: PNG, edge: Edge): number[][] {
  const out: number[][] = []
  for (let i = 0; i < TILE; i++) {
    const x = edge === 'N' || edge === 'S' ? i : edge === 'W' ? 0 : TILE - 1
    const y = edge === 'N' ? 0 : edge === 'S' ? TILE - 1 : i
    const o = (y * TILE + x) * 4
    out.push([p.data[o] ?? 0, p.data[o + 1] ?? 0, p.data[o + 2] ?? 0, p.data[o + 3] ?? 0])
  }
  return out
}

/** Nombre de pixels qui diffèrent entre deux bords (0 = raccord parfait). */
function diffCount(a: number[][], b: number[][]): number {
  let n = 0
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? []).join(',') !== (b[i] ?? []).join(',')) { n++ }
  }
  return n
}

function opaqueSpan(px: number[][]): { first: number; last: number } | null {
  let first = -1
  let last = -1
  for (let i = 0; i < px.length; i++) {
    if ((px[i]?.[3] ?? 0) > 8) {
      if (first < 0) { first = i }
      last = i
    }
  }
  return first < 0 ? null : { first, last }
}

describe('kit de routes 256 px', () => {
  it('les 11 tuiles font exactement 256×256', () => {
    for (const name of ALL) {
      const p = load(name)
      expect(`${name}: ${p.width}×${p.height}`).toBe(`${name}: ${TILE}×${TILE}`)
    }
  })

  it('tout bord porteur présente le même intervalle opaque, centré sur 128', () => {
    const seen: string[] = []
    for (const name of ALL) {
      const p = load(name)
      for (const edge of ['N', 'S', 'E', 'W'] as Edge[]) {
        const span = opaqueSpan(edgePixels(p, edge))
        if (span === null) { continue } // bord sans route : rien à raccorder
        seen.push(`${name}.${edge}`)
        expect(`${name}.${edge} ${span.first}..${span.last}`)
          .toBe(`${name}.${edge} ${SPAN.first}..${SPAN.last}`)
      }
    }
    // Garde-fou : si la détection de bord se cassait, la boucle passerait à vide.
    expect(seen.length).toBeGreaterThanOrEqual(20)
  })

  it('la chaussée est centrée : le milieu du bord est opaque, les coins sont vides', () => {
    for (const name of ALL) {
      const px = edgePixels(load(name), 'N')
      const mid = px[TILE / 2]?.[3] ?? 0
      const corner = px[0]?.[3] ?? 0
      expect(`${name} centre`).toBe(mid > 8 ? `${name} centre` : `${name} TROU`)
      expect(`${name} coin`).toBe(corner === 0 ? `${name} coin` : `${name} COIN OPAQUE`)
    }
  })

  it('à matière égale, les bords nord sont pixel-identiques (droite, virage, T, croisement, fin)', () => {
    for (const [head, ...rest] of [GOUDRON, PISTE]) {
      const ref = edgePixels(load(head), 'N')
      for (const name of rest) {
        const diff = diffCount(edgePixels(load(name), 'N'), ref)
        expect(`${name} vs ${head} : ${diff} px différents`).toBe(`${name} vs ${head} : 0 px différents`)
      }
    }
  })

  it('la tuile de jonction raccorde le goudron au nord et la piste au sud', () => {
    const j = load('jonction_goudron_piste')
    expect(diffCount(edgePixels(j, 'N'), edgePixels(load('goudron_droite'), 'N'))).toBe(0)
    expect(diffCount(edgePixels(j, 'S'), edgePixels(load('piste_droite'), 'S'))).toBe(0)
  })

  it('la géométrie déclarée est cohérente avec les tuiles (chaussée 144, hors-tout 184)', () => {
    expect(2 * ROAD_HALF).toBe(144)
    expect(2 * OUTER).toBe(184)
    expect(SPAN.last - SPAN.first + 1).toBe(2 * OUTER)
    expect(SHOULDER).toBe(20)
  })
})
