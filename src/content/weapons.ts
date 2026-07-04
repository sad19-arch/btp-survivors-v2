/**
 * Armes (data-driven). Thème : outils de chantier.
 *
 * MVP (PRD) : 3 armes aux silhouettes distinctes —
 *  - `cloueur` (projectile) : tir auto vers l'ennemi le plus proche.
 *  - `scie`    (orbital)    : lames qui tournent autour du joueur.
 *  - `marteau` (aura)       : onde de choc circulaire périodique.
 *
 * Système de niveaux : buildLevels produit un tableau EXPLICITE (niveaux 1..maxLevel)
 * à partir d'une base + incrément par niveau + overrides ponctuels.
 */

export type WeaponKind = 'projectile' | 'orbital' | 'aura' | 'sweep' | 'strike' | 'hazard' | 'cone'

export interface WeaponLevel {
  damage: number
  cooldownMs: number
  count: number
  area: number
  pierce: number
  projectileSpeed?: number
  projectileLifeMs?: number
  orbitRadius?: number
  orbitSpeed?: number
  orbitHitRadius?: number
  bounces?: number
  boomerangOutMs?: number
  projectileRadius?: number
  slowMult?: number
  slowMs?: number
  tickMs?: number
}

export interface WeaponDef {
  id: string
  name: string
  description: string
  kind: WeaponKind
  maxLevel: number
  levels: WeaponLevel[]
}

export function buildLevels(
  base: WeaponLevel,
  grow: Partial<WeaponLevel>,
  maxLevel: number,
  overrides: Record<number, Partial<WeaponLevel>> = {}
): WeaponLevel[] {
  const out: WeaponLevel[] = []
  for (let n = 1; n <= maxLevel; n++) {
    const row: WeaponLevel = { ...base }
    const rowRecord = row as unknown as Record<string, number>
    const baseRecord = base as unknown as Record<string, number>
    for (const [k, v] of Object.entries(grow)) {
      if (typeof v === 'number') {
        rowRecord[k] = (baseRecord[k] ?? 0) + v * (n - 1)
      }
    }
    const ov = overrides[n]
    if (ov !== undefined) {Object.assign(row, ov)}
    out.push(row)
  }
  return out
}

export const STARTING_WEAPON_ID = 'cloueur'

export const WEAPONS: Record<string, WeaponDef> = {
  cloueur: {
    id: 'cloueur',
    name: 'Cloueur',
    description: 'Tire des clous vers l\'ennemi le plus proche.',
    kind: 'projectile',
    maxLevel: 8,
    levels: buildLevels(
      { damage: 8, cooldownMs: 500, count: 1, area: 0, pierce: 0, projectileSpeed: 520, projectileLifeMs: 1500 },
      { damage: 2 },
      8,
      { 3: { count: 2 }, 6: { count: 3 } }
    )
  },
  scie: {
    id: 'scie',
    name: 'Scie orbitale',
    description: 'Des lames tournent autour de toi.',
    kind: 'orbital',
    maxLevel: 8,
    levels: buildLevels(
      { damage: 6, cooldownMs: 250, count: 2, area: 0, pierce: 99, orbitRadius: 104, orbitSpeed: 3.6, orbitHitRadius: 22 },
      { damage: 1.5 },
      8,
      { 4: { count: 3 }, 7: { count: 4 } }
    )
  },
  marteau: {
    id: 'marteau',
    name: 'Marteau-piqueur',
    description: 'Onde de choc qui frappe tout autour.',
    kind: 'aura',
    maxLevel: 8,
    levels: buildLevels(
      { damage: 10, cooldownMs: 900, count: 1, area: 175, pierce: 99 },
      { damage: 3, area: 8 },
      8
    )
  },
  pied_de_biche: {
    id: 'pied_de_biche',
    name: 'Pied-de-biche',
    description: 'Frappe en arc large devant toi.',
    kind: 'sweep',
    maxLevel: 8,
    levels: buildLevels(
      { damage: 14, cooldownMs: 700, count: 1, area: 120, pierce: 99 },
      { damage: 4, area: 6 },
      8,
      { 5: { count: 2 } }
    )
  },
  court_circuit: {
    id: 'court_circuit',
    name: 'Court-circuit',
    description: 'Decharge electrique qui frappe a portee.',
    kind: 'strike',
    maxLevel: 8,
    levels: buildLevels(
      { damage: 12, cooldownMs: 950, count: 1, area: 60, pierce: 0 },
      { damage: 3 },
      8,
      { 3: { count: 2 }, 6: { count: 3 } }
    )
  },
  goudron: {
    id: 'goudron', name: 'Goudron chaud', description: 'Pose une flaque de goudron qui brule les ennemis.', kind: 'hazard', maxLevel: 8,
    levels: buildLevels(
      { damage: 4, cooldownMs: 2200, count: 1, area: 60, pierce: 99, tickMs: 400, projectileLifeMs: 3000 },
      { damage: 1.2, area: 4 }, 8, { 5: { count: 2 } }
    )
  },
  boulons: {
    id: 'boulons', name: 'Boulons ricochets', description: 'Lance des boulons qui ricochent entre les ennemis.', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 10, cooldownMs: 820, count: 1, area: 0, pierce: 0, bounces: 3, projectileSpeed: 470, projectileLifeMs: 1700 },
      { damage: 2 }, 8, { 5: { bounces: 4 }, 7: { count: 2 } }
    )
  },
  cle_molette: {
    id: 'cle_molette', name: 'Clé à molette', description: 'Lance une clé boomerang qui transperce.', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 16, cooldownMs: 1150, count: 1, area: 0, pierce: 4, projectileSpeed: 380, boomerangOutMs: 430, projectileLifeMs: 2400 },
      { damage: 4 }, 8, { 6: { count: 2 } }
    )
  },
  extincteur: {
    id: 'extincteur', name: 'Extincteur', description: 'Cone de mousse qui ralentit les ennemis.', kind: 'cone', maxLevel: 8,
    levels: buildLevels(
      { damage: 6, cooldownMs: 1300, count: 1, area: 110, pierce: 99, slowMult: 0.5, slowMs: 700 },
      { damage: 2, area: 7 }, 8
    )
  },
  brouette: {
    id: 'brouette', name: 'Brouette', description: 'Propulse une brouette lourde qui traverse tout.', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 26, cooldownMs: 1650, count: 1, area: 0, pierce: 99, projectileSpeed: 240, projectileRadius: 26, projectileLifeMs: 2600 },
      { damage: 6, projectileRadius: 2 }, 8
    )
  },
  // Évoluées (niveau unique puissant ; montent via les passifs globaux)
  mitrailleuse_clous: {
    id: 'mitrailleuse_clous',
    name: 'Mitrailleuse à clous',
    description: 'Rafale de clous a cadence elevee qui percent les rangs.',
    kind: 'projectile',
    maxLevel: 1,
    levels: [{ damage: 30, cooldownMs: 140, count: 4, area: 0, pierce: 2, projectileSpeed: 640, projectileLifeMs: 1600 }]
  },
  haute_tension: {
    id: 'haute_tension',
    name: 'Haute tension',
    description: 'Arc electrique massif qui frappe plusieurs ennemis a la fois.',
    kind: 'strike',
    maxLevel: 1,
    levels: [{ damage: 45, cooldownMs: 380, count: 6, area: 80, pierce: 0 }]
  },
  coulee_bitume: { id: 'coulee_bitume', name: 'Coulée de bitume', description: 'Grandes flaques de bitume brulant qui durent longtemps.', kind: 'hazard', maxLevel: 1,
    levels: [{ damage: 14, cooldownMs: 1500, count: 2, area: 96, pierce: 99, tickMs: 300, projectileLifeMs: 4200 }] },
  tempete_boulons: { id: 'tempete_boulons', name: 'Tempête de boulons', description: 'Grele de boulons ricochants dans tous les sens.', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 26, cooldownMs: 360, count: 3, area: 0, pierce: 0, bounces: 6, projectileSpeed: 560, projectileLifeMs: 1900 }] },
  cle_choc: { id: 'cle_choc', name: 'Clé à choc', description: 'Double boomerang de cles a choc qui transperce les ennemis.', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 40, cooldownMs: 650, count: 2, area: 0, pierce: 5, projectileSpeed: 440, boomerangOutMs: 520, projectileLifeMs: 3000 }] },
  canon_mousse: { id: 'canon_mousse', name: 'Canon à mousse', description: 'Jet de mousse puissant qui immobilise les ennemis.', kind: 'cone', maxLevel: 1,
    levels: [{ damage: 18, cooldownMs: 620, count: 1, area: 190, pierce: 99, slowMult: 0.35, slowMs: 2200 }] },
  transpalette: { id: 'transpalette', name: 'Transpallette automatisée', description: 'Transpalette geant qui ecrase tout sur son passage.', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 60, cooldownMs: 1100, count: 1, area: 0, pierce: 99, projectileSpeed: 300, projectileRadius: 40, projectileLifeMs: 3200 }] }
}

const FALLBACK_LEVEL: WeaponLevel = { damage: 0, cooldownMs: 1000, count: 1, area: 0, pierce: 0 }

export function weaponStatsAtLevel(def: WeaponDef, level: number): WeaponLevel {
  const i = Math.max(0, Math.min(level, def.maxLevel) - 1)
  return def.levels[i] ?? def.levels[0] ?? FALLBACK_LEVEL
}
