import Phaser from 'phaser'
import type { App } from '@/app/app'
import type { GameSeam } from '@/app/seam'
import { KeyboardInput } from '@input/keyboard'
import { GamepadInput } from '@input/gamepad'
import { routeInput, type FrameInput } from '@input/intents'
import { buildPlayerInputs } from '@input/players'
import { INTRO, WORLD } from '@content/config'
import { createGround } from '@render/ground'
import { createLandmark, createStructures, phaseSalt, resolvePlacement, type ExclusionCircle } from '@render/props'
import { DecorStreamer, DEFAULT_CHUNK_SIZE } from '@render/decorStreamer'
import { dirRow, walkFrame, idleFrame } from '@render/sprites'
import { ambientOffset } from '@render/ambientNpc'
import { stageRender, type StageRender, FINAL_BOSS_SKIN } from '@render/stages'
import { SpritePool } from '@render/spritePool'
import { DamageNumberPool } from '@render/damageNumbers'
import { VfxManager } from '@render/scenes/vfxManager'
import { SpeechBubbleManager } from '@render/scenes/speechBubbleManager'
import { CameraController } from '@render/scenes/cameraController'
import { HordeRenderer, FEEDBACK_MAX_PER_FRAME } from '@render/scenes/hordeRenderer'
import { AuraPulseEvent, PrisonerFreedEvent } from '@core/events'
import type { EvolvedEvent } from '@core/events'
import type { PlayerState, PrisonerState } from '@core/types'
import { PALETTE_HEX, PALETTE } from '@ui/palette'
import { playerColor } from '@content/players'
import { characterDef } from '@content/characters'

/** Feuille PARTAGÉE (tous stages) : le joueur. Ennemis ET boss sont PAR STAGE (voir stages.ts). */
const SHARED_SHEETS: ReadonlyArray<readonly [string, string, number]> = [['player', 'player_j1.png', 192]]
/**
 * Échelles de rendu. Le joueur est partagé ; ennemis et boss prennent leur échelle
 * du stage (l'art natif PixelLab a des hauteurs variables, cf. measure-sprite-size.mjs).
 * Cibles ~hauteur affichée : joueur 83 · tank ~88 · rapide ~70 · base ~74 · boss ~144.
 */
const PLAYER_SCALE = 0.516
/** Délai d'immobilité (ms) avant que le héros ne joue son animation d'attente impatiente. */
const IDLE_EMOTE_MS = 4000
/** Décalage vertical (px monde) d'où le héros entre en marchant pendant l'intro. */
const INTRO_ENTER_OFFSET = 380

export interface GameSceneData {
  app: App
  testMode: boolean
  seam: GameSeam | null
  /** Mode allégé (e2e) : ne charge pas les feuilles de sprites lourdes → cercles. */
  lite?: boolean
}

const PLAYER_COLOR = 0x3498db
const PLAYER_RADIUS = 16
/** Clamp du delta réel pour éviter la spirale de la mort après un gel d'onglet. */
const MAX_FRAME_MS = 100

/** Sprite de personnage : feuille pixel-art si l'asset existe, sinon cercle de repli. */
type CharSprite = Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc

/**
 * Scène de jeu : couche RENDU. Elle observe `Simulation.getState()` et dessine ;
 * elle n'abrite aucune logique de gameplay. En mode test, ni le clavier ni le
 * temps réel ne pilotent la sim — seul le seam le fait (déterminisme).
 */
export class GameScene extends Phaser.Scene {
  private app!: App
  private testMode = false
  private seam: GameSeam | null = null
  private lite = false
  /** Données d'init conservées pour relancer la scène (changement de stage). */
  private sceneData!: GameSceneData
  /** stageId dont les assets sont actuellement chargés (pour détecter un changement). */
  private loadedStageId = ''
  /** runId de la partie actuellement rendue (pour détecter un restart même stage). */
  private loadedRunId = -1
  /** Vrai pendant un chargement dynamique de feuille(s) de perso (évite d'en re-lancer). */
  private loadingSheets = false
  /** Config de rendu du stage courant (sol/décalques/props/skins d'ennemis). */
  private stage!: StageRender
  private keyboardInput: KeyboardInput | null = null
  private gamepads: GamepadInput[] = []
  /** Caméra (suivi solo + groupe coop) extraite de GameScene — détient l'état `following`. */
  private readonly camera = new CameraController(this)
  /** Effets visuels transitoires (extraits de GameScene) — observer-only, sans état de sim. */
  private readonly vfx = new VfxManager(this)
  private readonly playerSprites = new Map<number, CharSprite>()
  /**
   * Anneau coloré au sol sous chaque joueur (identité co-op, T3/CO-2). Un seul
   * Graphics persistant, effacé/redessiné chaque frame — pas d'objet par joueur
   * à fuir, pas de pooling nécessaire (≤4 ellipses). Masqué en solo (aucun
   * changement visuel quand `players.length===1`).
   */
  private playerRings!: Phaser.GameObjects.Graphics
  /**
   * Barre de progrès de relève au-dessus des joueurs à terre (co-op). Un seul
   * Graphics persistant, effacé/redessiné chaque frame — même schéma que
   * `playerRings` (pas d'objet par joueur à gérer/détruire).
   */
  private reviveBars!: Phaser.GameObjects.Graphics
  /** Rendu de la horde (ennemis/hazards/projectiles/pickups/coffres) extrait de GameScene. */
  private horde!: HordeRenderer
  /**
   * Pool de chiffres de dégâts flottants (poolé — pas de new Text par hit).
   * Initialisé dans `create()`, instance fraîche par scène.
   */
  private damageNumbers!: DamageNumberPool
  /**
   * Streamer de décor par chunks (décalques + props) : génère le décor autour
   * de la caméra et détruit celui qui s'éloigne. Coût constant quelle que soit
   * la taille du monde (~16 chunks actifs à la fois). Purement visuel.
   * Initialisé dans `create()`, nettoyé dans `resetRunState()`.
   */
  private decorStreamer!: DecorStreamer
  /** Compteur de frames depuis le dernier update du DecorStreamer (throttle toutes les 4 frames). */
  private decorStreamerFrame = 0
  /** Ensemble « vus cette frame » réutilisé pour le culling des prisonniers (vidé, pas recréé). */
  private readonly seenPrisonerScratch = new Set<number>()
  /**
   * Étiquette « JN » + chevron au-dessus de chaque joueur humain, pour le repérer
   * dans une nuée d'ennemis (playtest). Un couple texte+chevron par joueur, couleur
   * = `playerColor`, depth élevé (au-dessus des ennemis). Détruits dans
   * `resetRunState` (pas de fuite). Affiché en solo comme en coop (J1..J4).
   */
  private readonly playerLabels = new Map<
    number,
    { text: Phaser.GameObjects.Text; chevron: Phaser.GameObjects.Triangle }
  >()
  /**
   * Pool de sprites pour ennemis/projectiles/pickups (horde 300-600 entités) : réutilise
   * au lieu de create/destroy. INSTANCE FRAÎCHE à chaque `create()` (scene.restart en
   * détruit une et en recrée une autre) — jamais un singleton de module.
   */
  private pool!: SpritePool
  /** Dernier niveau connu par joueur (détection de montée de niveau → VFX). */
  private readonly prevLevel = new Map<number, number>()
  /** Derniers PV connus par joueur (détection de dégât → flash rouge). */
  private readonly prevHp = new Map<number, number>()
  /** Instant (this.time.now) jusqu'auquel le sprite joueur reste teinté « touché ». */
  private readonly damageFlashUntil = new Map<number, number>()
  /** Skin doré (code Konami), rafraîchi depuis l'état à chaque frame. */
  private goldSkin = false
  /** Dernier instant de mouvement par joueur (pour l'animation d'attente impatiente). */
  private readonly lastMoveMs = new Map<number, number>()
  /** Horloge de rendu au début de l'intro (-1 = pas d'intro en cours). */
  private introStartMs = -1
  /** Intro terminée pour la run courante (ré-armée à chaque nouvelle run). */
  private introDone = false
  /** Sprites du prisonnier : cage + ouvrier barbu, par id d'entité. */
  private readonly prisonerCages = new Map<number, Phaser.GameObjects.Image | Phaser.GameObjects.Arc>()
  private readonly prisonerWorkers = new Map<number, CharSprite>()
  /** PNJ(s) d'ambiance non-hostiles du stage — tableau (B1+). */
  private ambientSprites: Array<{
    sprite: Phaser.GameObjects.Sprite
    anchor: { x: number; y: number }
    seed: number
    behavior: 'work' | 'patrol'
    framePeriodMs: number
  }> = []
  /** Bulles râleuses des PNJ d'ambiance (état + cooldowns) — extraites de GameScene. */
  private readonly bubbles = new SpeechBubbleManager(this)
  /**
   * VFX des armes à impulsion (marteau/pied-de-biche/court-circuit), déclenché
   * par l'événement d'aura de la sim. Une forme dédiée par `kind` — pas de
   * nouvel asset, juste des primitives Phaser Graphics :
   *  - aura (marteau)        → onde de choc ronde (sprite existant, pas de teinte)
   *  - sweep (pied-de-biche) → arc/croissant balayé (jaune sécurité)
   *  - strike (court-circuit)→ éclair en zigzag + flash d'impact (cyan accent)
   */
  private readonly onAuraPulse = (e: Event): void => {
    const p = e as AuraPulseEvent
    if (p.kind === 'sweep') {
      this.vfx.spawnSweepArc(p.x, p.y, p.radius)
      return
    }
    if (p.kind === 'strike') {
      // Récupère la position du joueur 1 (en vie de préférence) pour tracer
      // l'arc électrique JOUEUR → CIBLE plutôt qu'un éclair localisé sur l'ennemi.
      const st = this.app.getStateForFrame(this.app.frameId)
      const shooter = st.players.find((pl) => pl.alive) ?? st.players[0]
      const fromX = shooter?.x ?? p.x
      const fromY = shooter?.y ?? p.y
      this.vfx.spawnStrikeBolt(fromX, fromY, p.x, p.y)
      return
    }
    if (p.kind === 'cone') {
      this.vfx.spawnConeVfx(p.x, p.y, p.radius, p.dirX, p.dirY)
      return
    }
    // Marteau : onde de choc + scale-pop + léger screen-shake (coup lourd).
    const toScale = Math.max(1.5, (p.radius * 2) / 90)
    this.vfx.spawnVfx('vfx_shockwave', p.x, p.y, 0.2, toScale, 320)
    // Flash central jaune bref (pixel-pop).
    this.vfx.spawnPixelPop(p.x, p.y, PALETTE_HEX.jauneSecurite, 14, 220)
    // Screen-shake léger — coup lourd mais pas nausée.
    this.cameras.main.shake(90, 0.004)
  }
  /** Libération d'un prisonnier : étincelles + bulle « Merci ! » au-dessus de l'ouvrier. */
  private readonly onPrisonerFreed = (e: Event): void => {
    const p = e as PrisonerFreedEvent
    this.vfx.spawnVfx('vfx_sparkle', p.x, p.y, 0.5, 1.9, 450)
    this.vfx.spawnBubble(p.x, p.y)
  }
  /**
   * Évolution d'arme (coffre ramassé + conditions réunies) : grand halo au sol
   * sur le joueur qui a réellement ramassé le coffre (`EvolvedEvent.playerId`),
   * réutilise l'asset de montée de niveau (agrandi) — pas de nouvel asset. Le
   * bandeau/son sont gérés ailleurs (overlay/audio). Screen-shake légèrement plus
   * fort que le marteau (évolution = événement majeur du run).
   */
  private readonly onEvolved = (e: Event): void => {
    const playerId = (e as EvolvedEvent).playerId
    const p = this.app.getStateForFrame(this.app.frameId).players.find((pl) => pl.id === playerId)
    if (p === undefined) {
      return
    }
    this.vfx.spawnVfx('vfx_levelup', p.x, p.y, 0.2, 2.8, 650)
    // Sparkle supplémentaire en anneau (6 points) pour bien marquer l'évolution.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const delay = i * 35
      this.time.delayedCall(delay, () => {
        this.vfx.spawnVfx('vfx_sparkle', p.x + Math.cos(a) * 48, p.y + Math.sin(a) * 48, 0.3, 1.4, 420)
      })
    }
    // Screen-shake plus fort que le marteau (événement majeur du run).
    this.cameras.main.shake(160, 0.007)
  }

  constructor() {
    super('game')
  }

  init(data: GameSceneData): void {
    this.app = data.app
    this.testMode = data.testMode
    this.seam = data.seam
    this.lite = data.lite ?? false
    this.sceneData = data
    this.loadedStageId = this.app.getState().stageId
    this.loadedRunId = this.app.getState().runId
    this.stage = stageRender(this.loadedStageId)
  }

  preload(): void {
    // Assets PROPRES AU STAGE (sol, décalques, props, skins d'ennemis).
    for (const t of this.stage.ground) {
      this.load.image(t.key, t.file)
    }
    for (const d of this.stage.decals) {
      this.load.image(d.key, d.file)
    }
    for (const p of this.stage.props) {
      this.load.image(p.key, p.file)
    }
    // Landmark de bâtiment (image décor) — chargé comme les autres décors.
    if (this.stage.landmark !== undefined) {
      this.load.image(this.stage.landmark.key, this.stage.landmark.file)
    }
    // Grandes structures qui remplissent l'arène (images décor).
    if (this.stage.structures !== undefined) {
      for (const s of this.stage.structures) {
        this.load.image(s.key, s.file)
      }
    }
    // Colonne intérieure (phases 05→10) — texture de la grille streamée.
    if (this.stage.interior !== undefined) {
      this.load.image(this.stage.interior.columnKey, this.stage.interior.columnFile)
    }
    // Feuilles de personnages 4×4 (lourdes) — sautées en mode allégé (→ cercles).
    if (!this.lite) {
      const boss = this.stage.boss
      this.load.spritesheet(boss.key, boss.file, { frameWidth: boss.frame, frameHeight: boss.frame })
      for (const e of Object.values(this.stage.enemies)) {
        this.load.spritesheet(e.key, e.file, { frameWidth: e.frame, frameHeight: e.frame })
      }
      for (const [key, file, frame] of SHARED_SHEETS) {
        this.load.spritesheet(key, file, { frameWidth: frame, frameHeight: frame })
      }
      // Skin du boss FINAL (contremaître maudit) — PARTAGÉ entre tous les stages
      // (comme les feuilles ci-dessus), chargé une seule fois indépendamment du
      // stage courant. Phaser tolère un load.spritesheet répété sur une même clé
      // (no-op si déjà en cache) — pas de garde nécessaire au-delà de ce que fait
      // déjà SHARED_SHEETS ci-dessus.
      this.load.spritesheet(FINAL_BOSS_SKIN.key, FINAL_BOSS_SKIN.file, {
        frameWidth: FINAL_BOSS_SKIN.frame,
        frameHeight: FINAL_BOSS_SKIN.frame
      })
      // Feuilles dédiées des personnages (phase C) : NON préchargées ici. `preload`
      // s'exécute au boot (avant la sélection) puis seulement au changement de stage —
      // les joueurs (donc leurs persos) n'y sont pas encore connus. Et précharger tout
      // le roster (9 feuilles 768×768) sature la mémoire GPU (crash worker WebGL en test).
      // → chargées à la volée par `ensureCharacterSheets()` au démarrage de la run, pour
      // les seuls persos réellement en jeu. `player` (ouvrier/défaut) reste dans SHARED_SHEETS.
      // Feuille d'attente + variantes dorées du héros (clins d'œil ; repli si absentes).
      this.load.spritesheet('player_idle', 'player_idle.png', { frameWidth: 192, frameHeight: 192 })
      this.load.spritesheet('player_gold', 'player_j1_gold.png', { frameWidth: 192, frameHeight: 192 })
      this.load.spritesheet('player_idle_gold', 'player_idle_gold.png', { frameWidth: 192, frameHeight: 192 })
      // Ouvrier prisonnier (sosie barbu du héros) — même gabarit que le joueur (192).
      this.load.spritesheet('prisoner', 'stage01/npc/prisoner_walk.png', { frameWidth: 192, frameHeight: 192 })
      // PNJ(s) d'ambiance non-hostiles du stage (feuilles perso).
      for (const a of this.stage.ambient ?? []) {
        this.load.spritesheet(a.key, a.file, { frameWidth: a.frame, frameHeight: a.frame })
      }
    }
    this.load.image('proj_scie', 'stage01/weapons/proj_scie.png')
    this.load.image('proj_cloueur', 'stage01/weapons/proj_cloueur.png')
    // Projectiles dédiés phase A (A2 lot 2) + flaque de goudron (lot 3).
    this.load.image('proj_boulons', 'stage01/weapons/proj_boulons.png')
    this.load.image('proj_cle', 'stage01/weapons/proj_cle.png')
    this.load.image('proj_brouette', 'stage01/weapons/proj_brouette.png')
    // B3 : icône de carte brouette réutilisée comme sprite de projectile (plus lisible).
    this.load.image('icon_brouette', 'stage01/ui/icon_brouette_64.png')
    this.load.image('vfx_goudron', 'stage01/vfx/vfx_goudron.png')
    this.load.image('pickup_xp', 'stage01/pickups/xp.png')
    this.load.image('pickup_health', 'stage01/pickups/health.png')
    this.load.image('pickup_magnet', 'stage01/pickups/magnet.png')
    this.load.image('pickup_crate', 'stage01/pickups/crate.png')
    // État « entrouvert » du coffre (animation d'ouverture au spawn).
    this.load.image('pickup_crate_open', 'stage01/pickups/crate_open.png')
    this.load.image('vfx_impact', 'stage01/vfx/impact.png')
    this.load.image('vfx_sparkle', 'stage01/vfx/sparkle.png')
    this.load.image('vfx_levelup', 'stage01/vfx/levelup.png')
    this.load.image('vfx_shockwave', 'stage01/vfx/shockwave.png')
    // Clins d'œil rétro : fumée de disparition, colonne de téléportation boss, prisonnier.
    this.load.image('vfx_dust', 'stage01/vfx/dust.png')
    this.load.image('vfx_beam', 'stage01/vfx/beam.png')
    this.load.image('vfx_beam_segment', 'stage01/vfx/beam_segment.png')
    this.load.image('cage', 'stage01/props/cage.png')
    this.load.image('bubble_merci', 'stage01/ui/bubble_merci.png')
  }

  /**
   * Clé de feuille de marche du héros, par personnage (dorée si débloquée + présente,
   * uniquement sur la feuille par défaut de l'ouvrier — clin d'œil P1 Konami).
   * Aujourd'hui tous les persos partagent `sheet: 'player'` (placeholder) ; la phase C
   * ajoutera des feuilles `char_<id>.png` par perso — ce switch les servira sans y retoucher.
   */
  /**
   * Charge à la volée (loader Phaser en cours de partie) les feuilles des persos
   * réellement EN JEU dont la texture manque encore — hormis `player` (préchargée).
   * Appelé au 1er rendu d'une run : évite de précharger tout le roster au boot
   * (mémoire GPU) tout en garantissant le bon skin dès que le loader a fini.
   */
  private ensureCharacterSheets(players: readonly { characterId: string }[]): void {
    if (this.loadingSheets || this.lite) {
      return
    }
    const toLoad: string[] = []
    for (const p of players) {
      const sheet = characterDef(p.characterId).sheet
      if (sheet !== 'player' && !this.textures.exists(sheet) && !toLoad.includes(sheet)) {
        toLoad.push(sheet)
      }
    }
    if (toLoad.length === 0) {
      return
    }
    for (const sheet of toLoad) {
      this.load.spritesheet(sheet, `${sheet}.png`, { frameWidth: 192, frameHeight: 192 })
    }
    this.loadingSheets = true
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loadingSheets = false
    })
    this.load.start()
  }

  private walkTextureKey(characterId: string): string {
    const base = characterDef(characterId).sheet
    return this.goldSkin && base === 'player' && this.textures.exists('player_gold') ? 'player_gold' : base
  }

  /** Clé de feuille d'attente du héros, par personnage (dorée si débloquée + présente). */
  private idleTextureKey(characterId: string): string {
    const base = characterDef(characterId).sheet
    const idle = `${base}_idle`
    if (this.goldSkin && base === 'player' && this.textures.exists('player_idle_gold')) {
      return 'player_idle_gold'
    }
    return this.textures.exists(idle) ? idle : base
  }

  /**
   * Synchronise l'étiquette « JN » + chevron au-dessus d'un joueur (repérage en
   * nuée). Créée à la volée, suit la position, masquée si le joueur n'est pas
   * sur le terrain. Couleur = `playerColor(id)`, contour sombre pour rester
   * lisible sur fond chargé, depth 50 (au-dessus des ennemis/VFX).
   */
  private syncPlayerLabel(p: PlayerState, visible: boolean): void {
    let label = this.playerLabels.get(p.id)
    if (label === undefined) {
      const col = playerColor(p.id)
      const text = this.add
        .text(p.x, p.y - 58, `J${p.id}`, {
          fontFamily: 'monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: col.hex,
          stroke: PALETTE.contour,
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(50)
      const chevron = this.add
        .triangle(p.x, p.y - 44, 0, 0, 12, 0, 6, 8, col.num)
        .setStrokeStyle(2, PALETTE_HEX.contour)
        .setDepth(50)
      label = { text, chevron }
      this.playerLabels.set(p.id, label)
    }
    label.text.setPosition(p.x, p.y - 58)
    label.text.setVisible(visible)
    label.chevron.setPosition(p.x, p.y - 44)
    label.chevron.setVisible(visible)
  }

  /** Réinitialise l'état par-run (indispensable car `scene.restart` réutilise l'instance). */
  private resetRunState(): void {
    this.playerSprites.clear()
    this.playerLabels.forEach((l) => {
      l.text.destroy()
      l.chevron.destroy()
    })
    this.playerLabels.clear()
    this.prisonerCages.clear()
    this.prisonerWorkers.clear()
    this.prevLevel.clear()
    this.prevHp.clear()
    this.damageFlashUntil.clear()
    this.lastMoveMs.clear()
    this.camera.reset()
    this.introStartMs = -1
    this.introDone = false
    this.ambientSprites = []
    this.bubbles.reset()
    this.decorStreamerFrame = 0
    // Nettoie les chunks streamés (si le streamer est déjà initialisé — pas au 1er appel).
    if (this.decorStreamer !== undefined) {
      this.decorStreamer.clear()
    }
  }

  create(): void {
    // Les objets d'affichage sont détruits au shutdown : on repart de maps vides.
    this.resetRunState()
    // Nouvelle instance à chaque (re)création de scène — les anciens sprites poolés
    // sont détruits par Phaser au shutdown, un pool réutilisé les rendrait fantômes.
    this.pool = new SpritePool(this)
    // Pool de chiffres de dégâts : instance fraîche par scene (les Text Phaser sont
    // détruits au shutdown ; un pool réutilisé les rendrait fantômes).
    this.damageNumbers = new DamageNumberPool(this)
    // Rendu de la horde : instance fraîche par scène (détient les Maps de sprites d'entités).
    this.horde = new HordeRenderer(this, this.pool, this.vfx, this.damageNumbers)
    // Sol : base tuilée (TileSprite, O(1)) + streamer de décalques/props par chunks.
    // La seed est SALÉE par la phase → décor disposé différemment d'un stage à l'autre.
    const stageSeed = (this.app.getState().seed ^ phaseSalt(this.loadedStageId)) >>> 0
    // Base du sol (TileSprite seul — décalques gérés par le DecorStreamer).
    const groundAssets: { tileKeys: string[]; baseTileIndex?: number } = {
      tileKeys: this.stage.ground.map((g) => g.key)
    }
    if (this.stage.baseTileIndex !== undefined) {
      groundAssets.baseTileIndex = this.stage.baseTileIndex
    }
    createGround(this, WORLD.width, WORLD.height, groundAssets)
    // Streamer de décor : décalques + props streamés autour de la caméra par chunks de
    // DEFAULT_CHUNK_SIZE px. Coût constant (~16 chunks actifs) quel que soit le monde.
    const streamerOpts: import('@render/decorStreamer').DecorStreamerOpts = {
      chunkSize: DEFAULT_CHUNK_SIZE,
      seed: stageSeed,
      decals: this.stage.decals.map((d) => d.key),
      props: this.stage.props.map((p) => ({ key: p.key, scale: p.scale, count: p.count }))
    }
    if (this.stage.zones !== undefined) {
      streamerOpts.zones = this.stage.zones
    }
    if (this.stage.decalDensityMultiplier !== undefined) {
      streamerOpts.decalDensityMultiplier = this.stage.decalDensityMultiplier
    }
    // NB : les props ne sont plus cuits statiquement — ils sont streamés par le DecorStreamer.
    // Le streamer est construit PLUS BAS, une fois les structures/landmark/PNJ posés,
    // pour leur passer leurs positions comme ANCRES d'anti-chevauchement (les props
    // streamés ne se poseront plus sur les engins/héros).

    // ── Anti-chevauchement déterministe ────────────────────────────────────────
    // Ordre : centre (fixe) → prisonniers (fixes) → structures → landmark → PNJ.
    // Chaque couche évite les précédentes et accumule ses positions dans `placed`
    // pour que les suivantes les ignorent aussi.
    //
    // Rayon du centre : CENTER_CLEAR interne de props.ts (260 px) ;
    // on passe ici le rayon d'affichage large (300 px) pour conserver la marge
    // de lisibilité du spawn.
    const exclusions: ExclusionCircle[] = [
      { x: WORLD.width / 2, y: WORLD.height / 2, r: 300 }
    ]
    // Prisonniers : lus depuis l'état sim (peuplés avant create() via sim.reset()).
    // Rayon 80 px = cage (~40 px) + marge de lisibilité (40 px).
    for (const pr of this.app.getState().prisoners) {
      exclusions.push({ x: pr.x, y: pr.y, r: 80 })
    }
    // Liste mutable dans laquelle chaque fonction AJOUTE les positions posées.
    const placed: ExclusionCircle[] = []

    // Grandes structures qui remplissent l'arène (l'étape de chantier partout, hors centre).
    const stageGeometry = this.stage.geometry
    if (this.stage.structures !== undefined) {
      createStructures(
        this,
        WORLD.width,
        WORLD.height,
        this.stage.structures.map((s) => ({ key: s.key, scale: s.scale, count: s.count, band: s.band })),
        stageSeed,
        stageGeometry,
        exclusions,
        placed
      )
    }
    // Landmark HERO de la phase — grand, en périphérie, décor.
    const lm = this.stage.landmark
    if (lm !== undefined) {
      createLandmark(
        this, WORLD.width, WORLD.height,
        { key: lm.key, scale: lm.scale, count: lm.count },
        stageSeed, stageGeometry,
        exclusions, placed
      )
    }
    // PNJ(s) d'ambiance non-hostiles (geste métier) — un sprite par entrée, placement seedé
    // hors centre. Chaque PNJ reçoit un seed individuel dérivé de stageSeed + index, ce qui
    // garantit un placement déterministe et hors-chevauchement même si le tableau grandit (B5+).
    // T4 : geometry.ambientAngle cible le PREMIER PNJ (chef de file) ; les suivants tournent
    // autour d'angles dérivés (+ 40° par PNJ) pour rester dans le même secteur.
    const AMB_DIST_MIN = 420
    const AMB_DIST_MAX = 520
    for (const [npcIdx, amb] of (this.stage.ambient ?? []).entries()) {
      if (!this.textures.exists(amb.key)) { continue }
      // Rayon forfaitaire du PNJ : demi-frame compact (64 px) × scale.
      const ambRadius = Math.round(amb.scale * 64)
      // Angle : le premier PNJ suit geometry.ambientAngle (ou formule seedée),
      // les suivants sont décalés de 40° dans le même secteur.
      const baseAngleDeg =
        stageGeometry?.ambientAngle !== undefined
          ? stageGeometry.ambientAngle
          : (((stageSeed * 2654435761) >>> 0) % 1000) / 1000 * 360
      const ambAngleDeg = (baseAngleDeg + npcIdx * 40) % 360
      // Dart-throwing déterministe : sel unique par PNJ pour ne pas dépendre des
      // autres placements (structures/landmark) ni des autres PNJs.
      const npcSalt = (0xab7c1234 + npcIdx * 0x9e3779b9) >>> 0
      const ambRng = (() => {
        let t = ((stageSeed ^ npcSalt) >>> 0)
        return () => {
          t = (t + 0x6d2b79f5) >>> 0
          let r = Math.imul(t ^ (t >>> 15), 1 | t)
          r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) >>> 0
          return ((r ^ (r >>> 14)) >>> 0) / 4294967296
        }
      })()
      const pos = resolvePlacement(
        ambAngleDeg,
        AMB_DIST_MIN, AMB_DIST_MAX,
        WORLD.width / 2, WORLD.height / 2,
        WORLD.width, WORLD.height, 40,
        exclusions, placed, ambRadius, ambRng
      )
      const sprite = this.add.sprite(pos.x, pos.y, amb.key).setScale(amb.scale).setDepth(1)
      // Seed individuel dérivé de stageSeed + index → chaque PNJ a une errance et
      // une réplique DISTINCTES même si le tableau contient plusieurs entrées (B3 fix).
      const npcSeed = (stageSeed ^ (npcIdx * 0x9e3779b9)) >>> 0
      this.ambientSprites.push({
        sprite,
        anchor: { x: pos.x, y: pos.y },
        seed: npcSeed,
        behavior: amb.behavior,
        framePeriodMs: amb.framePeriodMs ?? 300
      })
      // Chaque PNJ devient une ancre (les props ne se poseront pas dessus).
      placed.push({ x: pos.x, y: pos.y, r: ambRadius })
    }

    // ── Streamer de décor (construit ici, ancres = tout ce qui a été posé) ───────
    // Les props streamés évitent désormais structures + landmark + PNJ (anti-chevauchement)
    // en plus du centre (spawn). Coût constant (~16 chunks actifs) quel que soit le monde.
    streamerOpts.structureAnchors = placed.map((p) => ({ x: p.x, y: p.y, r: p.r }))
    // Ambiance INTÉRIEURE (phases 05→10) : grille de colonnes streamée (dans le
    // streamer) + VOILE de lumière chaude sur le sol/décor. Le voile est posé à
    // depth -0.5 → il tinte le sol/props/structures/colonnes MAIS PAS les entités
    // (joueur/ennemis à depth ≥ 0) → « on est dedans » sans perdre la lisibilité.
    const interior = this.stage.interior
    if (interior !== undefined) {
      streamerOpts.interiorColumns = {
        key: interior.columnKey,
        spacing: interior.columnSpacing ?? 760,
        scale: interior.columnScale ?? 1.0
      }
      const tintAlpha = interior.tintAlpha ?? 0.12
      if (tintAlpha > 0) {
        this.add
          .rectangle(
            WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height,
            interior.tint ?? 0xffd9a0, tintAlpha
          )
          .setDepth(-0.5)
      }
    }
    this.decorStreamer = new DecorStreamer(this, WORLD.width, WORLD.height, streamerOpts)

    this.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height)
      .setStrokeStyle(4, 0xf5c542)

    // Anneaux couleur des joueurs (co-op) : au-dessus du sol/props (depth -10..1),
    // sous les sprites de personnages (depth par défaut 0... en pratique dessiné
    // avant eux dans l'ordre de création, mais on force -1 pour être sûr avec le pool).
    this.playerRings = this.add.graphics().setDepth(-1)
    // Au-dessus des sprites (depth par défaut 0) pour rester lisible pendant la relève.
    this.reviveBars = this.add.graphics().setDepth(5)

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.setZoom(1.2)

    this.syncSprites()
    this.camera.update(this.app.getStateForFrame(this.app.frameId), this.playerSprites)
    // Préchargement initial des chunks au démarrage (la caméra est positionnée,
    // le streamer peut déjà charger la vue initiale sans attendre le 1er update()).
    this.decorStreamer.update(this.cameras.main)

    // Onde de choc du marteau + libération de prisonnier + évolution d'arme : la sim émet, l'App relaie.
    this.app.events.addEventListener('auraPulse', this.onAuraPulse)
    this.app.events.addEventListener('prisonerFreed', this.onPrisonerFreed)
    this.app.events.addEventListener('evolved', this.onEvolved)
    this.events.once('shutdown', () => {
      this.app.events.removeEventListener('auraPulse', this.onAuraPulse)
      this.app.events.removeEventListener('prisonerFreed', this.onPrisonerFreed)
      this.app.events.removeEventListener('evolved', this.onEvolved)
    })

    if (this.input.keyboard !== null) {
      this.keyboardInput = new KeyboardInput(this.input.keyboard)
    }
    const gamepadPlugin = this.input.gamepad
    if (gamepadPlugin !== null) {
      this.gamepads = [0, 1, 2, 3].map((i) => new GamepadInput(gamepadPlugin, i))
    }

    if (this.seam !== null) {
      this.seam.ready = true
      // Sonde de rendu (test-only) : permet d'asserter que le bon skin est rendu.
      this.seam.debugRenderInfo = (): { id: number; texture: string | null }[] => {
        const info: { id: number; texture: string | null }[] = []
        for (const [id, sprite] of this.playerSprites) {
          info.push({ id, texture: sprite instanceof Phaser.GameObjects.Sprite ? sprite.texture.key : null })
        }
        return info.sort((a, b) => a.id - b.id)
      }
      // Sonde du feedback de coup (test-only) : compteur chiffres actifs/total + cap.
      this.seam.debugFeedbackInfo = (): { active: number; spawnedTotal: number; maxPerFrame: number } => ({
        active: this.damageNumbers.active,
        spawnedTotal: this.damageNumbers.total,
        maxPerFrame: FEEDBACK_MAX_PER_FRAME
      })
      // Sonde du streaming de décor (test-only) : permet d'asserter que le nombre
      // d'objets de décor reste borné quelle que soit la distance parcourue.
      this.seam.debugDecorInfo = (): { loadedChunks: number; decorObjects: number } => ({
        loadedChunks: this.decorStreamer.loadedChunkCount,
        decorObjects: this.decorStreamer.decorObjectCount
      })
      // B4 — Sondes PNJ d'ambiance (test-only) : positions actuelles et bulles actives.
      this.seam.debugAmbientNpcs = (): { x: number; y: number }[] =>
        this.ambientSprites.map((npc) => ({ x: npc.sprite.x, y: npc.sprite.y }))
      this.seam.debugActiveBubbles = (): number => this.bubbles.activeCount
    }
  }

  update(_time: number, delta: number): void {
    // Changement de stage OU nouvelle partie (restart même stage) : on relance la
    // scène pour repartir d'un état propre — sol/props/skins rechargés ET surtout
    // sprites/VFX/pool remis à zéro (sinon fuite : les objets des parties
    // précédentes s'accumulent, cf. `runId`).
    const st = this.app.getStateForFrame(this.app.frameId)
    if (st.screen !== 'title' && (st.stageId !== this.loadedStageId || st.runId !== this.loadedRunId)) {
      this.scene.restart(this.sceneData)
      return
    }
    if (!this.testMode) {
      routeInput(this.app, this.readPlayerInputs(st.players.length))
      this.app.advanceTime(Math.min(delta, MAX_FRAME_MS))
    }
    this.syncSprites()
    this.camera.update(st, this.playerSprites)
    // Streamer de décor : throttlé toutes les 4 frames pour éviter un scan de Map
    // à chaque tick (la caméra ne se déplace pas d'un chunk par frame).
    this.decorStreamerFrame++
    if (this.decorStreamerFrame % 4 === 0) {
      this.decorStreamer.update(this.cameras.main)
    }
  }


  /** Construit les entrées par joueur (clavier⊕pad0 pour P1, pad(k-1) pour P k≥2). */
  private readPlayerInputs(playerCount: number): Map<number, FrameInput> {
    const empty: FrameInput = { move: { x: 0, y: 0 }, pressed: [], action: false }
    const kb = this.keyboardInput !== null ? this.keyboardInput.readFrame() : empty
    const pads = this.gamepads.map((g) => g.readFrame())
    return buildPlayerInputs(kb, pads, playerCount)
  }

  /**
   * Dessine le « beacon » coloré au sol sous les pieds d'un joueur (co-op
   * uniquement) : ellipse remplie basse-opacité + liseré plus vif pour la
   * lisibilité, teinté avec la couleur du joueur (`@content/players`). Ne crée
   * aucun GameObject — dessine sur le Graphics partagé `playerRings`.
   */
  private drawPlayerRing(p: PlayerState): void {
    const color = playerColor(p.id).num
    const x = p.x
    const y = p.y + 34
    const w = 44
    const h = 16
    this.playerRings.fillStyle(color, 0.35)
    this.playerRings.fillEllipse(x, y, w, h)
    this.playerRings.lineStyle(2, color, 0.8)
    this.playerRings.strokeEllipse(x, y, w, h)
  }

  /**
   * Barre de progrès de relève au-dessus d'un joueur à terre : cadre sombre +
   * remplissage coloré (couleur du joueur) proportionnel à `reviveProgress`.
   * Dessine sur le Graphics partagé `reviveBars` — aucun GameObject créé.
   */
  private drawReviveBar(p: PlayerState): void {
    const color = playerColor(p.id).num
    const w = 40
    const h = 6
    const x = p.x - w / 2
    const y = p.y - 46
    this.reviveBars.fillStyle(0x000000, 0.6)
    this.reviveBars.fillRect(x - 1, y - 1, w + 2, h + 2)
    const fillW = Math.max(0, Math.min(1, p.reviveProgress)) * w
    if (fillW > 0) {
      this.reviveBars.fillStyle(color, 0.95)
      this.reviveBars.fillRect(x, y, fillW, h)
    }
  }

  /** Synchronise les sprites avec l'état courant de la simulation. */
  private syncSprites(): void {
    const state = this.app.getStateForFrame(this.app.frameId)
    this.goldSkin = state.goldSkin // rafraîchi chaque frame (débloqué au titre à tout moment)
    const introActive = state.introActive
    // Nouvelle run : ré-arme l'intro (start relance introActive) et rend la main plus tard.
    if (introActive && this.introDone) {
      this.introDone = false
      this.introStartMs = -1
      this.camera.reset()
    }

    // Anneaux couleur (identité co-op) : jamais en solo, un seul Graphics
    // effacé/redessiné chaque frame — aucun objet par joueur à gérer/détruire.
    this.playerRings.clear()
    const showRings = state.players.length > 1
    // Barres de relève : effacées/redessinées chaque frame (même schéma que playerRings).
    this.reviveBars.clear()
    // Partie terminée (game over) : plus de relève possible, on garde le rendu figé
    // d'aujourd'hui (sprite masqué) plutôt que le traitement « à terre » transitoire.
    const gameOver = state.screen === 'gameover'

    for (const p of state.players) {
      let sprite = this.playerSprites.get(p.id)
      if (sprite === undefined) {
        const key = this.walkTextureKey(p.characterId)
        if (this.textures.exists(key)) {
          sprite = this.add.sprite(p.x, p.y, key).setScale(characterDef(p.characterId).renderScale ?? PLAYER_SCALE)
        } else if (this.lite || characterDef(p.characterId).sheet === 'player') {
          // Feuille de référence (ouvrier, préchargée) absente → mode allégé : cercle.
          sprite = this.add.circle(p.x, p.y, PLAYER_RADIUS, PLAYER_COLOR)
        } else {
          // Feuille dédiée du perso pas encore en cache → chargement à la volée, puis
          // on ATTEND (aucun cercle mis en cache : le vrai sprite naîtra une fois chargé).
          this.ensureCharacterSheets(state.players)
          continue
        }
        this.playerSprites.set(p.id, sprite)
        this.lastMoveMs.set(p.id, this.time.now)
      }
      if (showRings && p.alive) {
        this.drawPlayerRing(p)
      }
      if (introActive && p.id === 1) {
        this.renderIntroPlayer(sprite, p)
        continue
      }
      sprite.setPosition(p.x, p.y)
      // À terre (hp<=0) mais partie en cours : reste visible (couché/grisé) en
      // attente de relève, au lieu de disparaître — seul un game over le masque.
      const downedActive = p.downed && !gameOver
      sprite.setVisible(p.alive || downedActive)
      // Étiquette « JN » + chevron : visible tant que le joueur est sur le terrain.
      this.syncPlayerLabel(p, p.alive || downedActive)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        this.animatePlayer(sprite, p)
      }
      const prev = this.prevLevel.get(p.id)
      if (prev !== undefined && p.level > prev) {
        this.vfx.spawnVfx('vfx_levelup', p.x, p.y, 0.4, 2, 500)
      }
      this.prevLevel.set(p.id, p.level)
      // Retour visuel de dégât : teinte rouge tant que les PV baissent.
      const prevHp = this.prevHp.get(p.id)
      if (prevHp !== undefined && p.hp < prevHp - 0.01 && p.alive) {
        this.damageFlashUntil.set(p.id, this.time.now + 140)
      }
      this.prevHp.set(p.id, p.hp)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        if (downedActive) {
          // À terre : la teinte grise gagne toujours face au flash de dégât.
          sprite.setTint(0x888888)
        } else if (this.time.now < (this.damageFlashUntil.get(p.id) ?? 0)) {
          sprite.setTint(0xff5a5a)
        } else {
          sprite.clearTint()
        }
      }
      if (downedActive) {
        this.drawReviveBar(p)
      }
    }

    // Fin d'intro : flourish d'étincelles une fois, puis le suivi caméra reprend.
    if (!introActive && this.introStartMs >= 0 && !this.introDone) {
      this.introDone = true
      const leader = this.playerSprites.get(1)
      if (leader !== undefined) {
        this.vfx.spawnIntroFlourish(leader.x, leader.y)
      }
    }

    this.horde.sync(state, this.stage)

    // PNJ(s) d'ambiance : errance douce (B3) + animation de geste (boucle lente).
    for (const npc of this.ambientSprites) {
      const off = ambientOffset(npc.seed, this.time.now, npc.behavior)
      npc.sprite.setPosition(npc.anchor.x + off.dx, npc.anchor.y + off.dy)
      npc.sprite.setFrame(walkFrame(0, this.time.now, npc.framePeriodMs))
    }
    // B4 — Bulles râleuses à l'approche du joueur.
    this.bubbles.update(this.ambientSprites, state.players.filter((p) => p.alive), this.time.now)

    this.syncPrisoners(state.prisoners)
  }

  /**
   * Rendu scripté de l'intro : le héros arrive en marchant par le bas de l'écran,
   * s'arrête au spawn puis « ajuste son casque ». Caméra fixée sur le spawn le temps
   * de l'entrée (le suivi reprend à la fin). Aucune logique de jeu (sim gelée).
   */
  private renderIntroPlayer(sprite: CharSprite, p: PlayerState): void {
    if (this.introStartMs < 0) {
      this.introStartMs = this.time.now
      this.cameras.main.centerOn(p.x, p.y)
    }
    const t = Math.min(1, (this.time.now - this.introStartMs) / INTRO.durationMs)
    const walkPortion = 0.65
    sprite.setVisible(true)
    if (sprite instanceof Phaser.GameObjects.Sprite) {
      const key = this.walkTextureKey(p.characterId)
      if (sprite.texture.key !== key && this.textures.exists(key)) {
        sprite.setTexture(key)
      }
    }
    if (t < walkPortion) {
      const k = t / walkPortion
      sprite.setPosition(p.x, p.y + INTRO_ENTER_OFFSET * (1 - k))
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        sprite.setFrame(walkFrame(2, this.time.now)) // ligne 2 = nord (marche vers le haut)
      }
    } else {
      // Beat « ajuste le casque » : immobile face caméra au spawn.
      sprite.setPosition(p.x, p.y)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        sprite.setFrame(idleFrame(0))
      }
    }
  }

  /** Anime le héros en jeu : marche directionnelle, ou attente impatiente après un délai. */
  private animatePlayer(sprite: Phaser.GameObjects.Sprite, p: PlayerState): void {
    const moving = p.vx !== 0 || p.vy !== 0
    if (moving) {
      this.lastMoveMs.set(p.id, this.time.now)
    }
    const idleFor = this.time.now - (this.lastMoveMs.get(p.id) ?? this.time.now)
    const idleKey = this.idleTextureKey(p.characterId)
    if (!moving && idleFor > IDLE_EMOTE_MS && this.textures.exists(idleKey)) {
      if (sprite.texture.key !== idleKey) {
        sprite.setTexture(idleKey)
      }
      sprite.setFrame(walkFrame(0, this.time.now, 220)) // boucle lente, face caméra
      return
    }
    const walkKey = this.walkTextureKey(p.characterId)
    if (sprite.texture.key !== walkKey) {
      sprite.setTexture(walkKey)
    }
    const row = dirRow(p.vx, p.vy)
    sprite.setFrame(moving ? walkFrame(row, this.time.now) : idleFrame(row))
  }

  /** Dessine l'ouvrier prisonnier (cage + sosie barbu) ; libéré → il court hors écran. */
  private syncPrisoners(prisoners: readonly PrisonerState[]): void {
    const seen = this.seenPrisonerScratch
    seen.clear()
    for (const pr of prisoners) {
      seen.add(pr.id)
      let worker = this.prisonerWorkers.get(pr.id)
      if (worker === undefined) {
        worker = this.textures.exists('prisoner')
          ? this.add.sprite(pr.x, pr.y, 'prisoner').setScale(0.5)
          : this.add.circle(pr.x, pr.y, 12, 0xcfa15a)
        worker.setDepth(2)
        this.prisonerWorkers.set(pr.id, worker)
      }

      // Cage assez grande pour enfermer l'ouvrier (~96 px), barreaux devant.
      let cage = this.prisonerCages.get(pr.id)
      if (cage === undefined) {
        cage = this.textures.exists('cage')
          ? this.add.image(pr.x, pr.y, 'cage').setScale(1.2)
          : this.add.circle(pr.x, pr.y, 30, 0x8a8a8a, 0).setStrokeStyle(3, 0x8a8a8a)
        cage.setDepth(3)
        this.prisonerCages.set(pr.id, cage)
      }
      cage.setVisible(!pr.freed)
      worker.setPosition(pr.x, pr.y)
      if (worker instanceof Phaser.GameObjects.Sprite) {
        // Libéré → animation de marche (il s'enfuit vers le bas) ; sinon immobile en cage.
        worker.setFrame(pr.freed ? walkFrame(0, this.time.now) : idleFrame(0))
      }
    }
    // Prisonnier disparu (libéré sorti du monde → despawn) : on nettoie ses sprites.
    for (const [id, worker] of this.prisonerWorkers) {
      if (!seen.has(id)) {
        worker.destroy()
        this.prisonerWorkers.delete(id)
        const cage = this.prisonerCages.get(id)
        if (cage !== undefined) {
          cage.destroy()
          this.prisonerCages.delete(id)
        }
      }
    }
  }
}
