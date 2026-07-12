/**
 * Armes (data-driven). Thème : outils de chantier.
 *
 * MVP (PRD) : 3 armes aux silhouettes distinctes —
 *  - `cloueur` (projectile) : tir auto vers l'ennemi le plus proche.
 *  - `scie`    (orbital)    : lames qui tournent autour du joueur.
 *  - `marteau` (aura)       : onde de choc circulaire périodique.
 *
 * Système de niveaux : buildLevels produit un tableau EXPLICITE (niveaux 1..maxLevel)
 * à partir d'une base + incrément par niveau + overrides de JALON.
 *
 * Les `overrides` sont CUMULATIFS : `{ 3: { count: 2 }, 6: { count: 3 } }` signifie
 * « 2 projectiles à partir du niveau 3, 3 à partir du niveau 6 ». Chaque jalon
 * atteint (niveau ≤ n) reste appliqué ; pour une même clé, le jalon le plus récent
 * gagne. (Sans ce cumul, un palier s'évaporait au niveau suivant.)
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
  // Niveaux de jalon, triés croissant : on applique TOUS les jalons atteints
  // (≤ n) dans l'ordre, donc le dernier jalon de chaque clé persiste.
  const milestoneLevels = Object.keys(overrides)
    .map(Number)
    .sort((a, b) => a - b)
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
    for (const lvl of milestoneLevels) {
      if (lvl > n) {break}
      const ov = overrides[lvl]
      if (ov !== undefined) {Object.assign(row, ov)}
    }
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
      { damage: 8, cooldownMs: 560, count: 1, area: 0, pierce: 0, projectileSpeed: 520, projectileLifeMs: 1500 },
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
    description: 'Décharge électrique qui frappe à portée.',
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
    id: 'goudron', name: 'Goudron chaud', description: 'Pose une flaque de goudron qui brûle les ennemis.', kind: 'hazard', maxLevel: 8,
    levels: buildLevels(
      { damage: 5, cooldownMs: 1800, count: 1, area: 60, pierce: 99, tickMs: 400, projectileLifeMs: 3000 },
      { damage: 2.2, area: 4 }, 8, { 5: { count: 2 } }
    )
  },
  boulons: {
    id: 'boulons', name: 'Boulons ricochets', description: 'Lance des boulons qui ricochent entre les ennemis.', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 12, cooldownMs: 820, count: 1, area: 0, pierce: 0, bounces: 3, projectileSpeed: 470, projectileLifeMs: 1700 },
      { damage: 2.5 }, 8, { 3: { bounces: 4 }, 5: { bounces: 5 }, 7: { count: 2 } }
    )
  },
  cle_molette: {
    id: 'cle_molette', name: 'Clé à molette', description: 'Lance une clé boomerang qui transperce.', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 16, cooldownMs: 980, count: 1, area: 0, pierce: 4, projectileSpeed: 380, boomerangOutMs: 430, projectileLifeMs: 2400 },
      { damage: 5 }, 8, { 6: { count: 2 } }
    )
  },
  extincteur: {
    id: 'extincteur', name: 'Extincteur', description: 'Cône de mousse qui ralentit les ennemis.', kind: 'cone', maxLevel: 8,
    levels: buildLevels(
      { damage: 8, cooldownMs: 1050, count: 1, area: 110, pierce: 99, slowMult: 0.5, slowMs: 700 },
      { damage: 3, area: 7 }, 8
    )
  },
  brouette: {
    id: 'brouette', name: 'Brouette', description: 'Propulse une brouette lourde qui traverse tout.', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 26, cooldownMs: 1400, count: 1, area: 0, pierce: 99, projectileSpeed: 240, projectileRadius: 26, projectileLifeMs: 2600 },
      { damage: 7, projectileRadius: 2 }, 8
    )
  },
  chalumeau: {
    id: 'chalumeau', name: 'Chalumeau', description: 'Jet de flammes qui brûle devant toi.', kind: 'cone', maxLevel: 8,
    // Feel lance-flammes, opposé de l'extincteur : portée COURTE, cadence RAPIDE,
    // gros dégâts, pas de slow. Jalons de cadence (niv 4/7) = progression ressentie.
    levels: buildLevels(
      { damage: 7, cooldownMs: 520, count: 1, area: 85, pierce: 99 },
      { damage: 2.5, area: 5 }, 8,
      { 4: { cooldownMs: 430 }, 7: { cooldownMs: 350 } }
    )
  },
  // Évoluées (niveau unique puissant ; montent via les passifs globaux)
  mitrailleuse_clous: {
    id: 'mitrailleuse_clous',
    name: 'Mitrailleuse à clous',
    description: 'Rafale de clous à cadence élevée qui perce les rangs.',
    kind: 'projectile',
    maxLevel: 1,
    levels: [{ damage: 30, cooldownMs: 140, count: 4, area: 0, pierce: 2, projectileSpeed: 640, projectileLifeMs: 1600 }]
  },
  haute_tension: {
    id: 'haute_tension',
    name: 'Haute tension',
    description: 'Arc électrique massif qui frappe plusieurs ennemis à la fois.',
    kind: 'strike',
    maxLevel: 1,
    levels: [{ damage: 45, cooldownMs: 380, count: 6, area: 80, pierce: 0 }]
  },
  coulee_bitume: { id: 'coulee_bitume', name: 'Coulée de bitume', description: 'Grandes flaques de bitume brûlant qui durent longtemps.', kind: 'hazard', maxLevel: 1,
    levels: [{ damage: 28, cooldownMs: 1500, count: 2, area: 96, pierce: 99, tickMs: 300, projectileLifeMs: 4200 }] },
  tempete_boulons: { id: 'tempete_boulons', name: 'Tempête de boulons', description: 'Grêle de boulons ricochant dans tous les sens.', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 40, cooldownMs: 360, count: 3, area: 0, pierce: 0, bounces: 6, projectileSpeed: 560, projectileLifeMs: 1900 }] },
  cle_choc: { id: 'cle_choc', name: 'Clé à choc', description: 'Double boomerang de clés à choc qui transperce les ennemis.', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 68, cooldownMs: 650, count: 2, area: 0, pierce: 5, projectileSpeed: 440, boomerangOutMs: 520, projectileLifeMs: 3000 }] },
  canon_mousse: { id: 'canon_mousse', name: 'Canon à mousse', description: 'Jet de mousse puissant qui immobilise les ennemis.', kind: 'cone', maxLevel: 1,
    levels: [{ damage: 40, cooldownMs: 620, count: 1, area: 190, pierce: 99, slowMult: 0.35, slowMs: 2200 }] },
  transpalette: { id: 'transpalette', name: 'Transpallette automatisée', description: 'Transpalette géant qui écrase tout sur son passage.', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 110, cooldownMs: 1100, count: 1, area: 0, pierce: 99, projectileSpeed: 300, projectileRadius: 40, projectileLifeMs: 3200 }] },
  lance_thermique: { id: 'lance_thermique', name: 'Lance thermique', description: 'Lance de découpe industrielle qui fait fondre les rangs.', kind: 'cone', maxLevel: 1,
    levels: [{ damage: 42, cooldownMs: 300, count: 1, area: 150, pierce: 99 }] }
}

const FALLBACK_LEVEL: WeaponLevel = { damage: 0, cooldownMs: 1000, count: 1, area: 0, pierce: 0 }

export function weaponStatsAtLevel(def: WeaponDef, level: number): WeaponLevel {
  const i = Math.max(0, Math.min(level, def.maxLevel) - 1)
  return def.levels[i] ?? def.levels[0] ?? FALLBACK_LEVEL
}
