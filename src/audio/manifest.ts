/**
 * Manifeste audio (data-driven, PUR — aucun Phaser/DOM ici, testable en Vitest).
 *
 * Déclare : fichiers à précharger, cues SFX (pool + volume + variation + throttle),
 * pistes de musique + logique de choix selon l'état, VOIX arcade (pools par moment),
 * ambiance de chantier. Niveaux modestes, à peaufiner à l'oreille (voir `settings`).
 */

/** Un cue SFX : pool de clés (tiré aléatoirement), volume, pitch + jitter, throttle. */
export interface SfxCue {
  keys: readonly string[]
  volume: number
  rate?: number
  /** Variation de hauteur ± (0.12 = ±12 %) pour casser la répétition. */
  rateJitter?: number
  /** Intervalle minimal entre deux jeux du même cue, en ms (anti-mitraillette). */
  throttleMs?: number
}

/** Clés de musique (une par contexte). */
export const MUSIC = {
  title: 'music_title',
  menu: 'music_menu',
  boss: 'music_boss',
  victory: 'music_victory',
  gameover: 'music_gameover',
  stage_a: 'music_stage_a',
  stage_b: 'music_stage_b',
  stage_c: 'music_stage_c',
  stage_alt: 'music_stage_alt'
} as const

export type MusicKey = (typeof MUSIC)[keyof typeof MUSIC]

/** Clé de l'ambiance de chantier (nappe loopée sous la musique de jeu). */
export const AMB = 'amb_chantier'

/** Fichiers musique + ambiance à précharger (clé Phaser → chemin sous public/). */
export const MUSIC_FILES: ReadonlyArray<readonly [string, string]> = [
  [MUSIC.title, 'audio/music/title.ogg'],
  [MUSIC.menu, 'audio/music/menu.ogg'],
  [MUSIC.stage_a, 'audio/music/stage_a.ogg'],
  [MUSIC.stage_b, 'audio/music/stage_b.ogg'],
  [MUSIC.stage_c, 'audio/music/stage_c.ogg'],
  [MUSIC.stage_alt, 'audio/music/stage_alt.ogg'],
  [MUSIC.boss, 'audio/music/boss.ogg'],
  [MUSIC.victory, 'audio/music/victory.ogg'],
  [MUSIC.gameover, 'audio/music/gameover.ogg'],
  [AMB, 'audio/amb/chantier.ogg']
]

const SFX_NAMES: readonly string[] = [
  'hurt_1', 'hurt_2', 'hurt_3', 'hurt_4',
  'explosion_1', 'explosion_2', 'explosion_3', 'explosion_4',
  'soft_destruction', 'harsh_destruction', 'lose_1', 'level_up',
  'collect_1', 'collect_2', 'collect_3', 'collect_4',
  'powerup_1', 'powerup_2', 'equip_1',
  'select_1', 'confirm_1', 'cancel_1',
  'siren', 'chime', 'fire_1', 'boost', 'teleport', 'computer_1'
]

/** Fichiers SFX à précharger (clé `sfx_<nom>` → chemin). */
export const SFX_FILES: ReadonlyArray<readonly [string, string]> = [
  ...SFX_NAMES.map((n) => [`sfx_${n}`, `audio/sfx/${n}.wav`] as const),
  ['sfx_stage_clear', 'audio/sfx/stage_clear.ogg']
]

const VOICE_NAMES: readonly string[] = [
  'presents', 'ready', 'fight',
  'stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5',
  'stage_6', 'stage_7', 'stage_8', 'stage_9', 'stage_10', 'final_stage',
  'boss', 'prepare_yourself_for_an_epic_battle', 'final_wave',
  'bonus', 'thankyou', 'choose_your_destiny', 'keep_going',
  'victory', 'stage_clear', 'you_are_incredible', 'flowless_victory',
  'gameover', 'that_was_terrible', 'you_are_such_a_looser'
]

/** Fichiers voix à précharger (clé `voice_<nom>` → chemin). */
export const VOICE_FILES: ReadonlyArray<readonly [string, string]> = VOICE_NAMES.map(
  (n) => [`voice_${n}`, `audio/voice/voice_${n}.ogg`] as const
)

/**
 * Cues SFX logiques → pool + paramètres. Les placeholders (`weapon_cloueur`,
 * `auraPulse`) seront remplacés par les sons d'outils dédiés (swap 1 ligne).
 */
export const SFX: Readonly<Record<string, SfxCue>> = {
  enemyKilled: { keys: ['sfx_explosion_1', 'sfx_explosion_2', 'sfx_explosion_3', 'sfx_explosion_4', 'sfx_soft_destruction'], volume: 0.42, rateJitter: 0.12, throttleMs: 45 },
  playerHurt: { keys: ['sfx_hurt_1', 'sfx_hurt_2', 'sfx_hurt_3', 'sfx_hurt_4'], volume: 0.6, rateJitter: 0.1, throttleMs: 120 },
  levelUp: { keys: ['sfx_level_up'], volume: 0.9 },
  weapon_cloueur: { keys: ['sfx_fire_1'], volume: 0.26, rateJitter: 0.16, throttleMs: 70 },
  auraPulse: { keys: ['sfx_soft_destruction'], volume: 0.5, rateJitter: 0.08, throttleMs: 110 },
  collect: { keys: ['sfx_collect_1', 'sfx_collect_2', 'sfx_collect_3', 'sfx_collect_4'], volume: 0.24, rateJitter: 0.18, throttleMs: 70 },
  bonus: { keys: ['sfx_powerup_1', 'sfx_powerup_2'], volume: 0.6 },
  bossSpawned: { keys: ['sfx_siren'], volume: 0.7 },
  prisonerFreed: { keys: ['sfx_chime'], volume: 0.7 },
  upgradePick: { keys: ['sfx_powerup_1', 'sfx_equip_1'], volume: 0.7 },
  menuMove: { keys: ['sfx_select_1'], volume: 0.3, rateJitter: 0.05, throttleMs: 45 },
  menuConfirm: { keys: ['sfx_confirm_1'], volume: 0.5 },
  menuBack: { keys: ['sfx_cancel_1'], volume: 0.5 },
  gameOver: { keys: ['sfx_lose_1'], volume: 0.7 },
  stageClear: { keys: ['sfx_stage_clear'], volume: 0.7 }
}

/** Pools de VOIX arcade (annonceur) par moment de jeu. */
export const VOICE = {
  intro: ['voice_presents'],
  runStart: ['voice_ready', 'voice_fight'],
  boss: ['voice_boss', 'voice_prepare_yourself_for_an_epic_battle', 'voice_final_wave'],
  /** Réplique dédiée au boss FINAL (distincte du mid-boss) — clé existante, déjà préchargée. */
  bossFinal: ['voice_final_wave'],
  bonus: ['voice_bonus'],
  thankyou: ['voice_thankyou'],
  upgrade: ['voice_choose_your_destiny', 'voice_keep_going'],
  victory: ['voice_victory', 'voice_stage_clear', 'voice_you_are_incredible'],
  flawless: ['voice_flowless_victory'],
  gameover: ['voice_gameover', 'voice_that_was_terrible', 'voice_you_are_such_a_looser']
} as const

/** Annonce de stage : la phase 10 dit « FINAL STAGE », sinon « STAGE N ». */
export function voiceStage(order: number): string {
  return order >= 10 ? 'voice_final_stage' : `voice_stage_${order}`
}

/** Rotation des 4 pistes gameplay par phase (clé = id de phase). */
const STAGE_MUSIC: Readonly<Record<string, MusicKey>> = {
  terrain_vierge: MUSIC.stage_a,
  terrassement: MUSIC.stage_a,
  fondations: MUSIC.stage_b,
  reseaux_enterres: MUSIC.stage_b,
  echafaudages: MUSIC.stage_b,
  gros_oeuvre: MUSIC.stage_alt,
  livraison_audit: MUSIC.stage_alt,
  charpente_toiture: MUSIC.stage_c,
  second_oeuvre: MUSIC.stage_c,
  finitions: MUSIC.stage_c
}

export interface MusicContext {
  screen: string
  stageId: string
  bossPresent: boolean
}

/** Musique désirée pour un état (null = silence). PURE → testable. */
export function musicForState(ctx: MusicContext): MusicKey | null {
  switch (ctx.screen) {
    case 'title':
      return MUSIC.title
    case 'paused':
      return MUSIC.menu
    case 'victory':
      return MUSIC.victory
    case 'gameover':
      return MUSIC.gameover
    default: // game / upgrade : la musique de jeu continue (boss prioritaire)
      if (ctx.bossPresent) {
        return MUSIC.boss
      }
      return STAGE_MUSIC[ctx.stageId] ?? MUSIC.stage_a
  }
}
