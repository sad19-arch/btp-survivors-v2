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
      tank: ['huissier'],
      swarm: ['motton'],
      charger: ['enracineur']
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
  },
  [ConstructionPhaseId.FONDATIONS]: {
    id: ConstructionPhaseId.FONDATIONS,
    order: 3,
    title: 'Fondations',
    subtitle: 'Ferraillage et coulage',
    accentColor: 0x9a9a9a,
    enemyPools: { base: ['gachee'], fast: ['ferrailleur'], tank: ['massif'] }
  },
  [ConstructionPhaseId.RESEAUX_ENTERRES]: {
    id: ConstructionPhaseId.RESEAUX_ENTERRES,
    order: 4,
    title: 'Réseaux enterrés',
    subtitle: 'Tranchées et canalisations',
    accentColor: 0x5a7a8a,
    enemyPools: { base: ['gaine'], fast: ['fileur'], tank: ['collecteur'] }
  },
  [ConstructionPhaseId.GROS_OEUVRE]: {
    id: ConstructionPhaseId.GROS_OEUVRE,
    order: 5,
    title: 'Gros œuvre',
    subtitle: 'Murs et planchers',
    accentColor: 0xc2a878,
    enemyPools: { base: ['parpaing'], fast: ['truelle'], tank: ['banche'] }
  },
  [ConstructionPhaseId.ECHAFAUDAGES]: {
    id: ConstructionPhaseId.ECHAFAUDAGES,
    order: 6,
    title: 'Échafaudages',
    subtitle: 'Montage des façades',
    accentColor: 0x8a9aa8,
    enemyPools: { base: ['boulon'], fast: ['grimpeur'], tank: ['pylone'] }
  },
  [ConstructionPhaseId.CHARPENTE_TOITURE]: {
    id: ConstructionPhaseId.CHARPENTE_TOITURE,
    order: 7,
    title: 'Charpente & toiture',
    subtitle: 'Fermes et couverture',
    accentColor: 0x8a5a34,
    enemyPools: { base: ['copeau'], fast: ['chevron'], tank: ['poutre'] }
  },
  [ConstructionPhaseId.SECOND_OEUVRE]: {
    id: ConstructionPhaseId.SECOND_OEUVRE,
    order: 8,
    title: 'Second œuvre',
    subtitle: 'Cloisons et gaines',
    accentColor: 0xd8d0c0,
    enemyPools: { base: ['platras'], fast: ['gainard'], tank: ['cloison'] }
  },
  [ConstructionPhaseId.FINITIONS]: {
    id: ConstructionPhaseId.FINITIONS,
    order: 9,
    title: 'Finitions',
    subtitle: 'Peinture et carrelage',
    accentColor: 0x4aa89a,
    enemyPools: { base: ['goutte'], fast: ['pinceau'], tank: ['pot'] }
  },
  [ConstructionPhaseId.LIVRAISON_AUDIT]: {
    id: ConstructionPhaseId.LIVRAISON_AUDIT,
    order: 10,
    title: 'Livraison & audit',
    subtitle: 'Réception et conformité',
    accentColor: 0xe0c020,
    enemyPools: { base: ['formulaire'], fast: ['auditeur'], tank: ['commission'] }
  }
}

/** Phases ordonnées (par `order` croissant) — source pour l'UI de sélection. */
export const ORDERED_PHASES: ConstructionPhase[] = Object.values(PHASES)
  .filter((p): p is ConstructionPhase => p !== undefined)
  .sort((a, b) => a.order - b.order)

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
