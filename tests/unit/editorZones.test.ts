import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { parseLayout, serializeLayout, emptyLayout } from '@/editor/StageLayoutSchema'
import { ZONE_DEFS, ZONE_BY_TYPE, isZoneType } from '@/editor/zones'
import { composedToSiteLayout } from '@core/siteLayout'

/**
 * Outil de zonage éditeur (5 macro-zones A/B/C/D/E). Méthodes PURES de l'état +
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
    expect(s.zoneOf('zone_access')).toBeNull()
    s.placeZone('zone_access', 500, 300)
    const z = must(s.zoneOf('zone_access'))
    const def = must(ZONE_BY_TYPE.get('zone_access'))
    // Centrée sur le clic → coin = centre - demi-taille.
    expect(z.x).toBe(500 - def.w / 2)
    expect(z.y).toBe(300 - def.h / 2)
    expect(z.w).toBe(def.w)
    expect(z.h).toBe(def.h)
  })

  it('placeZone recentre la zone existante sans en créer une seconde', () => {
    const s = make()
    s.placeZone('zone_storage', 0, 0)
    s.placeZone('zone_storage', 1000, 800)
    const exported = JSON.parse(s.exportGameJson()) as { markers: { type: string }[] }
    const count = exported.markers.filter((m) => m.type === 'zone_storage').length
    expect(count).toBe(1)
    const def = must(ZONE_BY_TYPE.get('zone_storage'))
    expect(must(s.zoneOf('zone_storage')).x).toBe(1000 - def.w / 2)
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
    s.placeZone('zone_access', 0, 0)
    s.setZoneSize('zone_access', 5000, 5000)
    // Centre AU MOMENT du reset (setZoneSize ancre le coin, pas le centre).
    const zc = must(s.zoneOf('zone_access'))
    const cx = zc.x + zc.w / 2
    const cy = zc.y + zc.h / 2
    s.resetZoneSize('zone_access')
    const def = must(ZONE_BY_TYPE.get('zone_access'))
    const z = must(s.zoneOf('zone_access'))
    expect(z.w).toBe(def.w)
    expect(z.h).toBe(def.h)
    expect(z.x + z.w / 2).toBeCloseTo(cx, 5)
    expect(z.y + z.h / 2).toBeCloseTo(cy, 5)
  })

  it('moveZone déplace la zone du delta', () => {
    const s = make()
    s.placeZone('zone_storage', 0, 0)
    const z0 = must(s.zoneOf('zone_storage'))
    const x0 = z0.x
    const y0 = z0.y
    s.moveZone('zone_storage', 120, -80)
    const z1 = must(s.zoneOf('zone_storage'))
    expect(z1.x).toBe(x0 + 120)
    expect(z1.y).toBe(y0 - 80)
  })

  it('déplacer D secondaire ne modifie pas B accès', () => {
    const s = make()
    s.placeZone('zone_access', 100, 200)
    s.placeZone('zone_secondary', 800, 900)
    const before = { ...must(s.zoneOf('zone_access')) }
    s.moveZone('zone_secondary', 120, -80)
    expect(s.zoneOf('zone_access')).toEqual(before)
    expect(must(s.zoneOf('zone_secondary'))).toMatchObject({ x: -80, y: 120 })
  })

  it('deleteZone supprime la zone et désélectionne', () => {
    const s = make()
    s.placeZone('zone_access', 0, 0)
    s.selectZone('zone_access')
    expect(s.selectedZone).toBe('zone_access')
    s.deleteZone('zone_access')
    expect(s.zoneOf('zone_access')).toBeNull()
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

  it('warnings() signale les 5 zones manquantes puis aucune une fois toutes posées', () => {
    const s = make()
    const missing0 = s.warnings().filter((w) => w.message.startsWith('Zone manquante'))
    expect(missing0.length).toBe(ZONE_DEFS.length)
    for (const z of ZONE_DEFS) {s.placeZone(z.type, 0, 0)}
    const missing1 = s.warnings().filter((w) => w.message.startsWith('Zone manquante'))
    expect(missing1.length).toBe(0)
  })

  it('isZoneType reconnaît les 5 types de zone et rejette les autres', () => {
    for (const z of ZONE_DEFS) {expect(isZoneType(z.type)).toBe(true)}
    expect(isZoneType('spawn')).toBe(false)
    expect(isZoneType('worker_path')).toBe(false)
    expect(isZoneType('nimportequoi')).toBe(false)
  })
})

describe('parse + éditeur-only des macro-zones', () => {
  it('parseLayout conserve les 5 types de marqueur sans perdre leur géométrie (round-trip)', () => {
    const layout = emptyLayout('terrain_vierge')
    for (const z of ZONE_DEFS) {
      layout.markers.push({ id: z.type, type: z.type, x: -z.w / 2, y: -z.h / 2, w: z.w, h: z.h })
    }
    const res = parseLayout(serializeLayout(layout), 'terrain_vierge')
    expect(res.ok).toBe(true)
    const parsed = must(res.layout)
    const types = parsed.markers.map((m) => m.type).sort()
    expect(types).toEqual(ZONE_DEFS.map((z) => z.type).sort())
    expect(parsed.markers).toEqual(layout.markers)
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

describe('contrat canonique des cinq macro-zones', () => {
  it('déclare exactement les zones A à E avec leurs tailles et libellés', () => {
    expect(ZONE_DEFS.map((z) => ({ type: z.type, label: z.label, w: z.w, h: z.h }))).toEqual([
      { type: 'signature_zone', label: 'A · Signature / spawn (1er écran)', w: 1400, h: 1000 },
      { type: 'zone_access', label: 'B · Accès / logistique', w: 2000, h: 1400 },
      { type: 'zone_storage', label: 'C · Stockage', w: 2000, h: 1400 },
      { type: 'zone_secondary', label: 'D · Secondaire / déjà fait', w: 2000, h: 1400 },
      { type: 'zone_atmosphere', label: 'E · Ambiance / périphérie', w: 3600, h: 2600 },
    ])
    expect(new Set(ZONE_DEFS.map((z) => z.type)).size).toBe(5)
  })

  it('normalise indépendamment les anciennes zones B et D en préservant leur géométrie', () => {
    const markers = [
      { id: 'terrassement_zone_b', type: 'zone_main_work', x: -720, y: 160, w: 903, h: 761 },
      { id: 'terrassement_zone_d', type: 'zone_main_work', x: 840, y: -340, w: 822, h: 703 },
    ]
    const res = parseLayout(JSON.stringify({ stage: 'terrassement', markers }), 'terrain_vierge')
    expect(res).toMatchObject({ ok: true })
    expect(must(res.layout).markers).toEqual([
      { id: 'terrassement_zone_b', type: 'zone_access', x: -720, y: 160, w: 903, h: 761 },
      { id: 'terrassement_zone_d', type: 'zone_secondary', x: 840, y: -340, w: 822, h: 703 },
    ])
  })

  it('normalise les anciens marqueurs non suffixés du stage 01', () => {
    const res = parseLayout(JSON.stringify({ markers: [
      { id: 'work', type: 'zone_main_work', x: 1, y: 2, w: 3, h: 4 },
      { id: 'logistics', type: 'zone_logistics', x: 5, y: 6, w: 7, h: 8 },
    ] }), 'terrain_vierge')
    expect(res).toMatchObject({ ok: true })
    expect(must(res.layout).markers).toEqual([
      { id: 'work', type: 'zone_access', x: 1, y: 2, w: 3, h: 4 },
      { id: 'logistics', type: 'zone_storage', x: 5, y: 6, w: 7, h: 8 },
    ])
  })

  it('rejette les doublons après normalisation avec un message précis', () => {
    const res = parseLayout(JSON.stringify({ markers: [
      { id: 'stage_zone_b', type: 'zone_main_work', x: 1, y: 2, w: 3, h: 4 },
      { id: 'already_access', type: 'zone_access', x: 5, y: 6, w: 7, h: 8 },
    ] }), 'terrain_vierge')
    expect(res).toEqual({ ok: false, error: 'Zone dupliquée : zone_access.' })
  })
})
