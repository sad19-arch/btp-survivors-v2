import { ConstructionPhaseId } from './phases'

/** Pulsation macro de la run : pression, respiration d'exploration, combat de boss. */
export type RunBeat = 'pressure' | 'breather' | 'boss'

export interface RunPacingState {
  beat: RunBeat
  /** Multiplicateur d'alimentation du budget de spawn. Zéro = aucune dette différée. */
  spawnRate: number
}

/**
 * Fenêtres de respiration placées avant/après les grands pics de la run de 20 min.
 * Elles durent assez pour parcourir ~2 400–3 600 px à vitesse de base, donc atteindre
 * un cluster, un destructible ou un prisonnier sans rendre la carte inoffensive.
 */
export const BREATHER_WINDOWS: readonly (readonly [startMs: number, endMs: number])[] = [
  [75_000, 87_000],
  [150_000, 164_000],
  [270_000, 288_000],
  [330_000, 344_000],
  [450_000, 466_000],
  [570_000, 588_000],
  [630_000, 646_000],
  [750_000, 766_000],
  [870_000, 888_000],
  [930_000, 946_000],
  [1_050_000, 1_066_000],
  [1_170_000, 1_188_000]
] as const

/**
 * Terrassement : cycles un peu plus longs et respirations plus franches. Le joueur
 * dispose de 14–18 s pour rejoindre une fouille, un engin ou un prisonnier avant
 * que les déblais suivants n'arrivent.
 */
export const TERRASSEMENT_BREATHER_WINDOWS: readonly (readonly [startMs: number, endMs: number])[] = [
  [70_000, 84_000],
  [155_000, 171_000],
  [255_000, 273_000],
  [340_000, 356_000],
  [460_000, 478_000],
  [580_000, 598_000],
  [700_000, 718_000],
  [820_000, 838_000],
  [940_000, 958_000],
  [1_060_000, 1_078_000],
  [1_180_000, 1_198_000]
] as const

export function breatherWindowsForPhase(
  phaseId: ConstructionPhaseId
): readonly (readonly [startMs: number, endMs: number])[] {
  return phaseId === ConstructionPhaseId.TERRASSEMENT
    ? TERRASSEMENT_BREATHER_WINDOWS
    : BREATHER_WINDOWS
}

export function runPacingAt(
  elapsedMs: number,
  bossActive: boolean,
  phaseId: ConstructionPhaseId = ConstructionPhaseId.TERRAIN_VIERGE
): RunPacingState {
  if (bossActive) {
    return { beat: 'boss', spawnRate: 0.35 }
  }
  for (const [startMs, endMs] of breatherWindowsForPhase(phaseId)) {
    if (elapsedMs >= startMs && elapsedMs < endMs) {
      return { beat: 'breather', spawnRate: 0 }
    }
  }
  return { beat: 'pressure', spawnRate: 1 }
}
