import type { EnemyArchetype } from './enemies'

/**
 * COLONNE VERTÉBRALE — le cycle de chantier.
 *
 * Les 10 phases ordonnées sont le squelette commun au mode survie (timeline) et
 * au futur mode Stage (1 phase = 1 mission). La phase est la SOURCE DE VÉRITÉ :
 * thème, couleur d'accent, pools d'ennemis par archétype.
 *
 * Slice 1 : seule `terrain_vierge` est définie ; les autres viendront du backlog.
 */
export enum ConstructionPhaseId {
  TERRAIN_VIERGE = 'terrain_vierge',
  TERRASSEMENT = 'terrassement',
  FONDATIONS = 'fondations',
  RESEAUX_ENTERRES = 'reseaux_enterres',
  GROS_OEUVRE = 'gros_oeuvre',
  ECHAFAUDAGES = 'echafaudages',
  CHARPENTE_TOITURE = 'charpente_toiture',
  SECOND_OEUVRE = 'second_oeuvre',
  FINITIONS = 'finitions',
  LIVRAISON_AUDIT = 'livraison_audit'
}

export type PhaseEnemyPools = Partial<Record<EnemyArchetype, string[]>>

export interface ConstructionPhase {
  id: ConstructionPhaseId
  order: number
  title: string
  subtitle: string
  accentColor: number
  /** Ids d'ennemis (de `ENEMIES`) par archétype. Validés au boot. */
  enemyPools: PhaseEnemyPools
}

export const PHASES: Partial<Record<ConstructionPhaseId, ConstructionPhase>> = {
  [ConstructionPhaseId.TERRAIN_VIERGE]: {
    id: ConstructionPhaseId.TERRAIN_VIERGE,
    order: 1,
    title: 'Terrain vierge',
    subtitle: 'Implantation du chantier',
    accentColor: 0xd9b35f,
    enemyPools: {
      base: ['paperasse'],
      fast: ['inspecteur'],
      tank: ['huissier']
    }
  },
  [ConstructionPhaseId.TERRASSEMENT]: {
    id: ConstructionPhaseId.TERRASSEMENT,
    order: 2,
    title: 'Terrassement',
    subtitle: 'On remue la terre',
    accentColor: 0x8a6a3b,
    enemyPools: {
      base: ['boueux'],
      fast: ['foreur'],
      tank: ['rocheux']
    }
  }
}

/** Mappe le param d'URL `level` (id de phase, ou numéro d'ordre) vers une phase définie. */
export function phaseIdFromLevel(level: string | null): ConstructionPhaseId {
  if (level === null) {
    return ConstructionPhaseId.TERRAIN_VIERGE
  }
  if ((Object.values(ConstructionPhaseId) as string[]).includes(level)) {
    return level as ConstructionPhaseId
  }
  const order = Number(level)
  if (Number.isFinite(order)) {
    for (const phase of Object.values(PHASES)) {
      if (phase !== undefined && phase.order === order) {
        return phase.id
      }
    }
  }
  return ConstructionPhaseId.TERRAIN_VIERGE
}

/** Aplatit tous les ids d'ennemis d'une phase en une seule liste. */
export function phasePoolIds(phase: ConstructionPhase): string[] {
  const ids: string[] = []
  for (const list of Object.values(phase.enemyPools)) {
    if (list !== undefined) {
      ids.push(...list)
    }
  }
  return ids
}
