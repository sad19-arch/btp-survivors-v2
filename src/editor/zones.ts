import type { MarkerType } from '@content/stageLayout'

/**
 * Macro-zone de CONCEPTION (outil de zonage éditeur PUR). Les zones sont des
 * marqueurs (`LayoutMarker`) : dessinées en overlay dans l'éditeur, persistées
 * dans la compo éditable, mais JAMAIS exportées au jeu ni lues par la sim
 * (`composedToSiteLayout` n'itère que `layout.instances`). Ce ne sont pas des
 * éléments de décor : elles ne remplissent rien.
 */
export interface ZoneDef {
  /** Type de marqueur = clé d'outil palette (identiques pour une zone). */
  type: MarkerType
  /** Nom explicite affiché (palette + inspecteur + libellé sur le canvas). */
  label: string
  /** Couleur du rectangle (hex Phaser) — 4 couleurs distinctes issues de la DA. */
  color: number
  /** Taille par défaut à la pose (composition space). */
  w: number
  h: number
}

/**
 * Les 4 macro-zones OBLIGATOIRES d'un stage. Source de vérité unique (palette,
 * rendu, tailles). Zone A RÉUTILISE le type `signature_zone` existant (compat
 * totale avec les cartes actuelles — leur zone signature devient A, aucune
 * migration) ; B/C/D sont de nouveaux types de marqueur. Tailles par défaut
 * selon le brief : B ≈ 4× l'aire de A, C ≈ 2× A, D remplit la périphérie.
 */
export const ZONE_DEFS: readonly ZoneDef[] = [
  { type: 'signature_zone', label: 'A · Signature / spawn (1er écran)', color: 0x2f8f6f, w: 1400, h: 1000 },
  { type: 'zone_main_work', label: 'B · Cœur du chantier (travaux)', color: 0xe86f1f, w: 2800, h: 2000 },
  { type: 'zone_logistics', label: 'C · Logistique / stockage / accès', color: 0x28b9d6, w: 2000, h: 1400 },
  { type: 'zone_atmosphere', label: 'D · Ambiance / périphérie', color: 0x3ddc84, w: 3600, h: 2600 }
]

/** Résolution O(1) d'une zone par son type de marqueur. */
export const ZONE_BY_TYPE: ReadonlyMap<MarkerType, ZoneDef> = new Map(
  ZONE_DEFS.map((z) => [z.type, z] as const)
)

/** true si ce type de marqueur est une macro-zone de conception. */
export function isZoneType(type: string): type is MarkerType {
  return ZONE_BY_TYPE.has(type as MarkerType)
}
