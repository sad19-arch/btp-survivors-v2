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

export type WeaponKind = 'projectile' | 'orbital' | 'aura' | 'sweep' | 'strike'

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
}

export interface WeaponDef {
  id: string
  name: string
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
    kind: 'strike',
    maxLevel: 8,
    levels: buildLevels(
      { damage: 12, cooldownMs: 950, count: 1, area: 60, pierce: 0 },
      { damage: 3 },
      8,
      { 3: { count: 2 }, 6: { count: 3 } }
    )
  },
  // Évoluées (niveau unique puissant ; montent via les passifs globaux)
  mitrailleuse_clous: {
    id: 'mitrailleuse_clous',
    name: 'Mitrailleuse à clous',
    kind: 'projectile',
    maxLevel: 1,
    levels: [{ damage: 30, cooldownMs: 140, count: 4, area: 0, pierce: 2, projectileSpeed: 640, projectileLifeMs: 1600 }]
  },
  haute_tension: {
    id: 'haute_tension',
    name: 'Haute tension',
    kind: 'strike',
    maxLevel: 1,
    levels: [{ damage: 45, cooldownMs: 380, count: 6, area: 80, pierce: 0 }]
  }
}

const FALLBACK_LEVEL: WeaponLevel = { damage: 0, cooldownMs: 1000, count: 1, area: 0, pierce: 0 }

export function weaponStatsAtLevel(def: WeaponDef, level: number): WeaponLevel {
  const i = Math.max(0, Math.min(level, def.maxLevel) - 1)
  return def.levels[i] ?? def.levels[0] ?? FALLBACK_LEVEL
}
