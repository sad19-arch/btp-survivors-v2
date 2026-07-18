import type { IntroCommand } from '@render/scenes/introSequencer'
import { INTRO } from '@content/config'

/**
 * Scripts d'intro par stageId.
 *
 * T6 : script « terrassement » (montage muet — le gag de la pelle).
 * T7 : rollout des autres stages.
 *
 * Assets stage 02 attendus en non-lite :
 *   - npc_stage02    (feuille ouvrier)           repli → player_j1
 *   - mudling        (homme-boue ennemi)          repli → 1er enemy de TERRASSEMENT_RENDER
 *   - struct_stage02_pit   (fosse)
 *   - prop_s2_excavator    (engin)
 *
 * NOTE REPLIS : si `npc_stage02` ou `mudling` sont absents au chargement
 * non-lite, la façade Phaser doit utiliser les replis décrits dans le brief T6.
 * Le script lui-même conserve les clés canoniques — c'est la façade qui gère
 * le fallback `this.textures.exists`.
 */
export const INTRO_SCRIPTS: Record<string, IntroCommand[]> = {
  terrassement: [
    // 1) plan large, la caméra respire
    { kind: 'zoomTo', cx: 5120, cy: 3900, zoom: 0.55, ms: 600, ease: 'easeOut' },
    { kind: 'actor', id: 'exc', key: 'prop_s2_excavator', x: 5290, y: 3820, scale: 1.1 },
    { kind: 'actor', id: 'pit', key: 'struct_stage02_pit', x: 5160, y: 3980, scale: 0.9 },
    { kind: 'actor', id: 'w', key: 'npc_stage02', x: 5060, y: 3890, scale: 0.9 },
    { kind: 'wait', ms: 500 },
    // 2) coupe gros plan sur la pelle/fosse — le "Clonk"
    { kind: 'cut', cx: 5200, cy: 3930, zoom: 1.5 },
    { kind: 'shake', intensity: 0.3 },
    { kind: 'sfx', key: 'clonk' },
    { kind: 'wait', ms: 250 },
    // 3) UN seul homme-boue remonte, zoom lent sur la fosse
    { kind: 'zoomTo', cx: 5160, cy: 3970, zoom: 1.4, ms: 700, ease: 'easeOut' },
    { kind: 'preview', key: 'mudling', x: 5160, y: 3965, count: 1 },
    { kind: 'wait', ms: 450 },
    // 4) PUNCH-IN sur l'ouvrier (le coucou gêné) + LE temps comique
    { kind: 'punchIn', cx: 5060, cy: 3870, zoom: 2.3, ms: 130 },
    { kind: 'wait', ms: 600 },
    // 5) FILÉ + RALENTI vers la fosse : les QUARANTE jaillissent
    { kind: 'whipPan', cx: 5160, cy: 3970, ms: 150 },
    { kind: 'slowmo', scale: 0.4, ms: 450 },
    { kind: 'preview', key: 'mudling', x: 5160, y: 3965, count: 40 },
    { kind: 'flash' },
    { kind: 'shake', intensity: 0.9 },
    { kind: 'wait', ms: 500 },
    // 6) coupe plan large, l'ouvrier détale, carton titre
    { kind: 'cut', cx: 5120, cy: 3900, zoom: 0.55 },
    { kind: 'move', id: 'w', x: 4700, y: 3890, ms: 350 },
    { kind: 'banner', text: 'TERRASSEMENT' },
    { kind: 'wait', ms: 350 },
  ],
}

/**
 * Durée du gel d'intro pour un stage, en ms.
 *
 * Un stage AVEC script de montage (aujourd'hui : terrassement) tient le gel plus
 * long (`stageCinematicMs`, ~6.5 s) le temps que la cinématique se déroule ; un
 * stage SANS script retombe sur le micro-préambule héros historique
 * (`durationMs`, ~2 s) — sans quoi les 9 stages sans montage resteraient figés
 * plusieurs secondes sur un écran inerte. PURE (pas de random/Date) → testable.
 */
export function introDurationFor(stageId: string): number {
  return stageId in INTRO_SCRIPTS ? INTRO.stageCinematicMs : INTRO.durationMs
}
