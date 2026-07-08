import type { IntroCommand } from '@render/scenes/introSequencer'

/**
 * Scripts d'intro par stageId (T6/T7 ajouteront les vrais scripts).
 * VIDE ici : T5 pose la plomberie, les scripts seront câblés en T6/T7.
 */
export const INTRO_SCRIPTS: Record<string, IntroCommand[]> = {}
