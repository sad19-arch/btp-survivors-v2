import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { parseLayout, serializeLayout, emptyLayout } from '@/editor/StageLayoutSchema'
import { ZONE_DEFS, ZONE_BY_TYPE, isZoneType } from '@/editor/zones'
import { composedToSiteLayout } from '@core/siteLayout'

/**
 * Outil de zonage éditeur (4 macro-zones A/B/C/D). Méthodes PURES de l'état +
 * preuve « éditeur-only » : la sim (`composedToSiteLayout`) ignore les marqueurs.
 * L'état persiste en localStorage : on le vide entre chaque test.
 */

/** Petit garde-fou de test : refuse null/undefined (l'éditeur interdit `!`). */
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) {throw new Error('valeur attendue non nulle')}
  return v
}

describe('EditorState — macro-zones de conception', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  const make = (): EditorState => new EditorState('terrain_vierge')

  it('placeZone crée une zone centrée (singleton par type)', () => {
    const s = make()
    expect(s.zoneOf('zone_main_work')).toBeNull()
    s.placeZone('zone_main_work', 500, 300)
    const z = must(s.zoneOf('zone_main_work'))
    const def = must(ZONE_BY_TYPE.get('zone_main_work'))
    // Centrée sur le clic → coin = centre - demi-taille.
    expect(z.x).toBe(500 - def.w / 2)
    expect(z.y).toBe(300 - def.h / 2)
    expect(z.w).toBe(def.w)
    expect(z.h).toBe(def.h)
  })

  it('placeZone recentre la zone existante sans en créer une seconde', () => {
    const s = make()
    s.placeZone('zone_logistics', 0, 0)
    s.placeZone('zone_logistics', 1000, 800)
    const exported = JSON.parse(s.exportGameJson()) as { markers: { type: string }[] }
    const count = exported.markers.filter((m) => m.type === 'zone_logistics').length
    expect(count).toBe(1)
    const def = must(ZONE_BY_TYPE.get('zone_logistics'))
    expect(must(s.zoneOf('zone_logistics')).x).toBe(1000 - def.w / 2)
  })

  it('scaleZone conserve le ratio (agrandir/réduire sans déformer)', () => {
    const s = make()
    s.placeZone('signature_zone', 0, 0)
    const z0 = must(s.zoneOf('signature_zone'))
    const w0 = z0.w // capture primitive (le marqueur est muté en place)
    const h0 = z0.h
    const ratio0 = w0 / h0
    s.scaleZone('signature_zone', 1.1)
    const z1 = must(s.zoneOf('signature_zone'))
    expect(z1.w).toBeCloseTo(w0 * 1.1, 5)
    expect(z1.h).toBeCloseTo(h0 * 1.1, 5)
    expect(z1.w / z1.h).toBeCloseTo(ratio0, 5)
  })

  it('scaleZone borne le facteur mais garde le ratio aux limites', () => {
    const s = make()
    s.placeZone('signature_zone', 0, 0) // 1400×1000, ratio 1.4
    const base = must(s.zoneOf('signature_zone'))
    const ratio = base.w / base.h
    s.scaleZone('signature_zone', 1000) // énorme → clampé
    const z = must(s.zoneOf('signature_zone'))
    expect(Math.max(z.w, z.h)).toBeLessThanOrEqual(20000)
    expect(z.w / z.h).toBeCloseTo(ratio, 5)
  })

  it('setZoneSize borne à la taille minimale (200)', () => {
    const s = make()
    s.placeZone('zone_atmosphere', 0, 0)
    s.setZoneSize('zone_atmosphere', 50, 10)
    const z = must(s.zoneOf('zone_atmosphere'))
    expect(z.w).toBe(200)
    expect(z.h).toBe(200)
  })

  it('resetZoneSize rétablit la taille par défaut (centre courant conservé)', () => {
    const s = make()
    s.placeZone('zone_main_work', 0, 0)
    s.setZoneSize('zone_main_work', 5000, 5000)
    // Centre AU MOMENT du reset (setZoneSize ancre le coin, pas le centre).
    const zc = must(s.zoneOf('zone_main_work'))
    const cx = zc.x + zc.w / 2
    const cy = zc.y + zc.h / 2
    s.resetZoneSize('zone_main_work')
    const def = must(ZONE_BY_TYPE.get('zone_main_work'))
    const z = must(s.zoneOf('zone_main_work'))
    expect(z.w).toBe(def.w)
    expect(z.h).toBe(def.h)
    expect(z.x + z.w / 2).toBeCloseTo(cx, 5)
    expect(z.y + z.h / 2).toBeCloseTo(cy, 5)
  })

  it('moveZone déplace la zone du delta', () => {
    const s = make()
    s.placeZone('zone_logistics', 0, 0)
    const z0 = must(s.zoneOf('zone_logistics'))
    const x0 = z0.x
    const y0 = z0.y
    s.moveZone('zone_logistics', 120, -80)
    const z1 = must(s.zoneOf('zone_logistics'))
    expect(z1.x).toBe(x0 + 120)
    expect(z1.y).toBe(y0 - 80)
  })

  it('deleteZone supprime la zone et désélectionne', () => {
    const s = make()
    s.placeZone('zone_main_work', 0, 0)
    s.selectZone('zone_main_work')
    expect(s.selectedZone).toBe('zone_main_work')
    s.deleteZone('zone_main_work')
    expect(s.zoneOf('zone_main_work')).toBeNull()
    expect(s.selectedZone).toBeNull()
  })

  it('selectZone gère la sélection indépendamment des instances', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    s.placeZone('zone_atmosphere', 0, 0)
    s.selectZone('zone_atmosphere')
    // La sélection d'instance n'est pas polluée par la zone.
    expect(s.selectedZone).toBe('zone_atmosphere')
    expect(s.selected).toBe(a.id)
    s.selectZone(null)
    expect(s.selectedZone).toBeNull()
  })

  it('le getter signature = zone A (signature_zone) — compat cartes existantes', () => {
    const s = make()
    expect(s.signature).toBeNull()
    s.placeZone('signature_zone', 0, 0)
    expect(s.signature).not.toBeNull()
    expect(s.signature).toEqual(s.zoneOf('signature_zone'))
  })

  it('warnings() signale les 4 zones manquantes puis aucune une fois toutes posées', () => {
    const s = make()
    const missing0 = s.warnings().filter((w) => w.message.startsWith('Zone manquante'))
    expect(missing0.length).toBe(ZONE_DEFS.length)
    for (const z of ZONE_DEFS) {s.placeZone(z.type, 0, 0)}
    const missing1 = s.warnings().filter((w) => w.message.startsWith('Zone manquante'))
    expect(missing1.length).toBe(0)
  })

  it('isZoneType reconnaît les 4 types de zone et rejette les autres', () => {
    for (const z of ZONE_DEFS) {expect(isZoneType(z.type)).toBe(true)}
    expect(isZoneType('spawn')).toBe(false)
    expect(isZoneType('worker_path')).toBe(false)
    expect(isZoneType('nimportequoi')).toBe(false)
  })
})

describe('parse + éditeur-only des macro-zones', () => {
  it('parseLayout conserve les 4 types de marqueur (round-trip)', () => {
    const layout = emptyLayout('terrain_vierge')
    for (const z of ZONE_DEFS) {
      layout.markers.push({ id: z.type, type: z.type, x: -z.w / 2, y: -z.h / 2, w: z.w, h: z.h })
    }
    const res = parseLayout(serializeLayout(layout), 'terrain_vierge')
    expect(res.ok).toBe(true)
    const types = must(res.layout).markers.map((m) => m.type).sort()
    expect(types).toEqual(ZONE_DEFS.map((z) => z.type).sort())
  })

  it('parseLayout rejette un type de marqueur inconnu', () => {
    const layout = emptyLayout('terrain_vierge')
    const raw = JSON.parse(serializeLayout(layout)) as Record<string, unknown>
    raw.markers = [{ id: 'x', type: 'zone_bidon', x: 0, y: 0, w: 100, h: 100 }]
    const res = parseLayout(JSON.stringify(raw), 'terrain_vierge')
    expect(res.ok).toBe(true)
    expect(must(res.layout).markers.length).toBe(0)
  })

  it('composedToSiteLayout IGNORE les marqueurs (preuve sim-inchangée)', () => {
    const base = emptyLayout('terrain_vierge')
    base.instances.push({ id: 'i1', prefab: 'unknown', x: 100, y: 50, flipX: false, variant: 0, rotation: 0, locked: false })
    const withZones = JSON.parse(serializeLayout(base)) as typeof base
    for (const z of ZONE_DEFS) {
      withZones.markers.push({ id: z.type, type: z.type, x: -z.w / 2, y: -z.h / 2, w: z.w, h: z.h })
    }
    const a = composedToSiteLayout(base)
    const b = composedToSiteLayout(withZones)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
})
