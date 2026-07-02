/**
 * Manifeste audio (data-driven, PUR — aucun Phaser/DOM ici, testable en Vitest).
 *
 * Déclare : les fichiers à précharger, les « cues » SFX (pool + volume + variation
 * + throttle) et la logique de choix de musique selon l'état. Les niveaux sont
 * volontairement modestes et se peaufinent à l'oreille (voir `settings`).
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
  stage_a: 'music_stage_a',
  stage_b: 'music_stage_b',
  stage_c: 'music_stage_c'
} as const

export type MusicKey = (typeof MUSIC)[keyof typeof MUSIC]

/** Fichiers musique à précharger (clé Phaser → chemin sous public/). */
export const MUSIC_FILES: ReadonlyArray<readonly [string, string]> = [
  [MUSIC.title, 'audio/music/title.ogg'],
  [MUSIC.menu, 'audio/music/menu.ogg'],
  [MUSIC.stage_a, 'audio/music/stage_a.ogg'],
  [MUSIC.stage_b, 'audio/music/stage_b.ogg'],
  [MUSIC.stage_c, 'audio/music/stage_c.ogg'],
  [MUSIC.boss, 'audio/music/boss.ogg'],
  [MUSIC.victory, 'audio/music/victory.ogg']
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

/** Rotation des 3 pistes gameplay par phase (clé = id de phase). */
const STAGE_MUSIC: Readonly<Record<string, MusicKey>> = {
  terrain_vierge: MUSIC.stage_a,
  terrassement: MUSIC.stage_a,
  gros_oeuvre: MUSIC.stage_a,
  livraison_audit: MUSIC.stage_a,
  fondations: MUSIC.stage_b,
  reseaux_enterres: MUSIC.stage_b,
  echafaudages: MUSIC.stage_b,
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
      return null
    default: // game / upgrade : la musique de jeu continue (boss prioritaire)
      if (ctx.bossPresent) {
        return MUSIC.boss
      }
      return STAGE_MUSIC[ctx.stageId] ?? MUSIC.stage_a
  }
}
