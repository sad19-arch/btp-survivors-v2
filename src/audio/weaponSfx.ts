import type { ZzfxParams } from './zzfx'

/**
 * SFX procéduraux (ZzFX) PAR ARME. Un vecteur de paramètres par ID d'arme,
 * taillé au caractère de l'arme. 1re passe indicative — l'oracle de qualité est
 * l'oreille (via l'audition `debugPlayWeaponSfx`), à affiner au playtest.
 *
 * Ordre des paramètres (cf. `zzfx.ts`) :
 *   [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
 *    slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation,
 *    bitCrush, delay, sustainVolume, decay, tremolo]
 *   shape : 0 sin · 1 triangle · 2 saw · 3 tan · 4 bruit.
 *
 * NB `scie` (orbitale, continue) a une entrée pour la complétude mais son one-shot
 * n'est PAS déclenché : la scie est silencieuse (la boucle de ronronnement a été retirée).
 */

/** Repli pour tout ID d'arme sans entrée explicite (évite le silence). */
export const DEFAULT_WEAPON_ZZFX: ZzfxParams = [0.35, 0.08, 300, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 0, 0.05]

export const WEAPON_ZZFX: Record<string, ZzfxParams> = {
  // --- Armes de base ---
  cloueur: [0.42, 0.08, 520, 0, 0, 0.07, 2, 1, -0.15, 0, 0, 0, 0, 0.08], // pop sec de cloueur
  boulons: [0.4, 0.1, 680, 0, 0, 0.1, 1, 1, 0, 0, 300, 0.03, 0, 0.06], // ping + ricochet (pitchJump)
  cle_molette: [0.4, 0.1, 300, 0, 0.02, 0.14, 2, 1, -0.25, 0, 0, 0, 0, 0.05], // whoosh boomerang
  brouette: [0.5, 0.05, 120, 0.01, 0.03, 0.18, 0, 1, -0.05, 0, 0, 0, 0, 0.04], // impact lourd/roulant
  court_circuit: [0.38, 0.2, 820, 0, 0.02, 0.12, 4, 1, 0.3, 0, 0, 0, 0, 0.6, 4], // zap électrique
  // rat-tat-tat de marteau-piqueur : percussif court, répété 3 coups (repeatTime ~0.04s), bruit de métal
  marteau: [0.55, 0.06, 180, 0, 0, 0.04, 0, 1, -0.2, 0, 0, 0, 0.04, 0.3], // rat-tat-tat
  pied_de_biche: [0.42, 0.12, 260, 0, 0, 0.1, 2, 1, -0.3, 0, 0, 0, 0, 0.15], // whoosh tranchant
  extincteur: [0.34, 0.15, 200, 0.02, 0.06, 0.12, 4, 1, 0, 0, 0, 0, 0, 0.9, 2], // souffle de mousse (bruit)
  goudron: [0.42, 0.1, 110, 0.01, 0.02, 0.16, 1, 1, -0.1, 0, 0, 0, 0, 0.2], // splat mou grave
  scie: [0.3, 0.05, 150, 0.02, 0.05, 0.08, 2, 1, 0, 0, 0, 0, 0, 0.1], // (loop géré à part)
  // --- Évoluées (variantes plus « grosses ») ---
  mitrailleuse_clous: [0.4, 0.1, 640, 0, 0, 0.05, 2, 1, -0.1, 0, 0, 0, 0, 0.1], // rafale de clous
  haute_tension: [0.46, 0.2, 620, 0, 0.03, 0.16, 4, 1, 0.2, 0, 0, 0, 0, 0.7, 5], // arc électrique ample
  coulee_bitume: [0.5, 0.1, 85, 0.01, 0.03, 0.22, 1, 1, -0.12, 0, 0, 0, 0, 0.25], // splat profond
  tempete_boulons: [0.42, 0.15, 700, 0, 0.02, 0.12, 1, 1, 0, 0, 400, 0.02, 0.02, 0.08], // grêle
  cle_choc: [0.44, 0.1, 280, 0, 0.03, 0.16, 2, 1, -0.28, 0, 0, 0, 0, 0.06], // double whoosh
  canon_mousse: [0.4, 0.15, 180, 0.02, 0.1, 0.16, 4, 1, 0, 0, 0, 0, 0, 0.95, 2], // souffle puissant
  transpalette: [0.55, 0.05, 70, 0.01, 0.05, 0.26, 0, 1, -0.05, 0, 0, 0, 0, 0.06] // impact énorme
}

/** SFX d'une arme par ID (repli sur le défaut si absent — jamais de silence). */
export function weaponZzfx(id: string): ZzfxParams {
  return WEAPON_ZZFX[id] ?? DEFAULT_WEAPON_ZZFX
}
