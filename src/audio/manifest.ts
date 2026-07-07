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
  stage_01: 'music_stage_01',
  stage_02: 'music_stage_02',
  stage_03: 'music_stage_03',
  stage_04: 'music_stage_04',
  stage_05: 'music_stage_05',
  stage_06: 'music_stage_06',
  stage_07: 'music_stage_07',
  stage_08: 'music_stage_08',
  stage_09: 'music_stage_09',
  stage_10: 'music_stage_10'
} as const

export type MusicKey = (typeof MUSIC)[keyof typeof MUSIC]

/** Clé de l'ambiance de chantier (nappe loopée sous la musique de jeu). */
export const AMB = 'amb_chantier'

/**
 * Fichiers audio PARTAGÉS à précharger au boot (titre/menus/boss/victoire/gameover/ambiance).
 * Ne contient AUCUNE piste de stage (chargement lazy à la demande).
 */
export const MUSIC_FILES_SHARED: ReadonlyArray<readonly [string, string]> = [
  [MUSIC.title, 'audio/music/title.mp3'],
  [MUSIC.menu, 'audio/music/menu.mp3'],
  [MUSIC.boss, 'audio/music/boss.mp3'],
  [MUSIC.victory, 'audio/music/victory.mp3'],
  [MUSIC.gameover, 'audio/music/gameover.ogg'],
  [AMB, 'audio/amb/chantier.ogg']
]

/**
 * Pistes de stage (lazy-load : chargées à la demande, pas au boot).
 * Clé Phaser → chemin sous public/.
 */
export const MUSIC_FILES_STAGE: ReadonlyArray<readonly [string, string]> = [
  [MUSIC.stage_01, 'audio/music/stage_01.mp3'],
  [MUSIC.stage_02, 'audio/music/stage_02.mp3'],
  [MUSIC.stage_03, 'audio/music/stage_03.mp3'],
  [MUSIC.stage_04, 'audio/music/stage_04.mp3'],
  [MUSIC.stage_05, 'audio/music/stage_05.mp3'],
  [MUSIC.stage_06, 'audio/music/stage_06.mp3'],
  [MUSIC.stage_07, 'audio/music/stage_07.mp3'],
  [MUSIC.stage_08, 'audio/music/stage_08.mp3'],
  [MUSIC.stage_09, 'audio/music/stage_09.mp3'],
  [MUSIC.stage_10, 'audio/music/stage_10.mp3']
]

/**
 * @deprecated Utiliser `MUSIC_FILES_SHARED` pour le boot et `MUSIC_FILES_STAGE` pour le lazy-load.
 * Conservé pour rétrocompatibilité des imports existants (tests, etc.).
 */
export const MUSIC_FILES: ReadonlyArray<readonly [string, string]> = [
  ...MUSIC_FILES_SHARED,
  ...MUSIC_FILES_STAGE
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

/**
 * Voix .mp3 ajoutées par l'utilisateur (clé Phaser PROPRE → chemin exact ;
 * gère les extensions .mp3, les majuscules et l'espace du fichier « worker »).
 */
const VOICE_MP3: ReadonlyArray<readonly [string, string]> = [
  ['voice_i_need_assistance', 'audio/voice/voice_I_need_assistance.mp3'],
  ['voice_checkpoint', 'audio/voice/voice_chekpoint.mp3'],
  ['voice_clou_douken', 'audio/voice/voice_clou-douken.mp3'],
  ['voice_enemy_down', 'audio/voice/voice_enemy_down.mp3'],
  ['voice_final_round_fight', 'audio/voice/voice_final_round_fight.mp3'],
  ['voice_finish_him', 'audio/voice/voice_finish_him.mp3'],
  ['voice_go_go_go', 'audio/voice/voice_go_go_go.mp3'],
  ['voice_incoming', 'audio/voice/voice_incoming.mp3'],
  ['voice_mission_complete', 'audio/voice/voice_mission_complete.mp3'],
  ['voice_perfect', 'audio/voice/voice_perfect.mp3'],
  ['voice_power_up', 'audio/voice/voice_power_up.mp3'],
  ['voice_rise_from_your_grave', 'audio/voice/voice_rise_from_your_grave.mp3'],
  ['voice_see_you_in_hell', 'audio/voice/voice_see_you_in_hell.mp3'],
  ['voice_we_have_to_get_out_of_here', 'audio/voice/voice_we_have_to_get_out_of_here.mp3'],
  ['voice_welcome_to_your_doom', 'audio/voice/voice_welcome_to_your_doom.mp3'],
  ['voice_worker', 'audio/voice/voice_worker_metal_gear_solid.mp3'],
  ['voice_yeah', 'audio/voice/voice_yeah.mp3'],
  ...Array.from({ length: 10 }, (_, i) =>
    [`voice_round_${i + 1}_fight`, `audio/voice/voice_round_${i + 1}_fight.mp3`] as const
  )
]

/** Fichiers voix à précharger (clé `voice_<nom>` → chemin). Mix .ogg (existants) + .mp3 (nouveaux). */
export const VOICE_FILES: ReadonlyArray<readonly [string, string]> = [
  ...VOICE_NAMES.map((n) => [`voice_${n}`, `audio/voice/voice_${n}.ogg`] as const),
  ...VOICE_MP3
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

/** Pools de VOIX arcade (annonceur) par moment de jeu. `playVoice` pioche → alternance. */
export const VOICE = {
  intro: ['voice_presents'],
  runStart: ['voice_ready', 'voice_fight', 'voice_go_go_go'],
  /** Apparition mini-boss : annonce + taunts (dont « incoming » pour la vague). */
  boss: [
    'voice_boss', 'voice_prepare_yourself_for_an_epic_battle', 'voice_final_wave',
    'voice_rise_from_your_grave', 'voice_welcome_to_your_doom', 'voice_see_you_in_hell',
    'voice_incoming'
  ],
  /** Réplique dédiée au boss FINAL (distincte du mid-boss). */
  bossFinal: ['voice_welcome_to_your_doom', 'voice_final_wave', 'voice_prepare_yourself_for_an_epic_battle'],
  /** Boss à faible PV → « finish him ». */
  bossLowHp: ['voice_finish_him'],
  /** Ennemi abattu (occasionnel, throttlé). */
  enemyDown: ['voice_enemy_down'],
  /** PV joueur bas → appel à l'aide (alterne). */
  playerLow: ['voice_i_need_assistance', 'voice_we_have_to_get_out_of_here'],
  bonus: ['voice_bonus'],
  /** Évolution d'arme (coffre) : fanfare + voix (dont le clin d'œil « clou-douken »). */
  evolved: ['voice_bonus', 'voice_clou_douken'],
  thankyou: ['voice_thankyou'],
  upgrade: ['voice_choose_your_destiny', 'voice_keep_going', 'voice_power_up', 'voice_perfect', 'voice_yeah'],
  victory: ['voice_victory', 'voice_stage_clear', 'voice_you_are_incredible', 'voice_mission_complete'],
  flawless: ['voice_flowless_victory'],
  /** Nouveau stage atteint (checkpoint). */
  checkpoint: ['voice_checkpoint'],
  gameover: ['voice_gameover', 'voice_that_was_terrible', 'voice_you_are_such_a_looser', 'voice_worker']
} as const

/** Annonce de stage : la phase 10 dit « FINAL STAGE », sinon « STAGE N ». */
export function voiceStage(order: number): string {
  return order >= 10 ? 'voice_final_stage' : `voice_stage_${order}`
}

/**
 * Pool de voix au DÉBUT d'un stage (run-start) : annonce de stage + « ROUND N FIGHT »
 * + cris de départ, « FINAL ROUND » au stage 10, « checkpoint » dès le 2e stage.
 * PURE → testable. `playVoice` en pioche une (variété d'annonceur).
 */
export function voiceRunStart(order: number): string[] {
  const round = `voice_round_${Math.min(Math.max(order, 1), 10)}_fight`
  const pool = [voiceStage(order), round, ...VOICE.runStart]
  // Au stage 10 : « FINAL ROUND » + on garde aussi « STAGE 10 » comme variante d'annonce.
  if (order >= 10) { pool.push('voice_final_round_fight', 'voice_stage_10') }
  if (order >= 2) { pool.push('voice_checkpoint') }
  return pool
}

/** Musique dédiée par phase (une piste unique par stage, en ordre de phase). */
const STAGE_MUSIC: Readonly<Record<string, MusicKey>> = {
  terrain_vierge: MUSIC.stage_01,
  terrassement: MUSIC.stage_02,
  fondations: MUSIC.stage_03,
  reseaux_enterres: MUSIC.stage_04,
  gros_oeuvre: MUSIC.stage_05,
  echafaudages: MUSIC.stage_06,
  charpente_toiture: MUSIC.stage_07,
  second_oeuvre: MUSIC.stage_08,
  finitions: MUSIC.stage_09,
  livraison_audit: MUSIC.stage_10
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
      return STAGE_MUSIC[ctx.stageId] ?? MUSIC.stage_01
  }
}
