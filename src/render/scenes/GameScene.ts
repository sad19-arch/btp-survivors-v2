import Phaser from 'phaser'
import type { App } from '@/app/app'
import type { GameSeam } from '@/app/seam'
import { KeyboardInput } from '@input/keyboard'
import { GamepadInput } from '@input/gamepad'
import { routeInput, type FrameInput } from '@input/intents'
import { buildPlayerInputs } from '@input/players'
import { WORLD } from '@content/config'
import { SITE_PROGRAMS } from '@content/sitePrograms'
import { createGround } from '@render/ground'
import { createLandmark, createStructures, phaseSalt, resolvePlacement, type ExclusionCircle } from '@render/props'
import { DecorStreamer, DEFAULT_CHUNK_SIZE } from '@render/decorStreamer'
import { getComposedLayout } from '@content/composedLayouts'
import { walkFrame } from '@render/sprites'
import { ambientOffset } from '@render/ambientNpc'
import { stageRender, type StageRender, FINAL_BOSS_SKIN, SHARED_WORKER_NPCS } from '@render/stages'
import { SpritePool } from '@render/spritePool'
import { DamageNumberPool } from '@render/damageNumbers'
import { VfxManager } from '@render/scenes/vfxManager'
import { SpeechBubbleManager } from '@render/scenes/speechBubbleManager'
import { CameraController } from '@render/scenes/cameraController'
import { HordeRenderer, FEEDBACK_MAX_PER_FRAME } from '@render/scenes/hordeRenderer'
import { PlayerRenderer } from '@render/scenes/playerRenderer'
import { TelegraphRenderer } from '@render/scenes/telegraphRenderer'
import { SiteRenderer } from '@render/scenes/siteRenderer'
import { SiteStructures, hasStructurePlan } from '@render/scenes/siteStructures'
import { SiteWorkers } from '@render/scenes/siteWorkers'
import { buildSiteLayout } from '@core/siteLayout'
import { AuraPulseEvent, PrisonerFreedEvent } from '@core/events'
import type { EvolvedEvent } from '@core/events'
import { PALETTE_HEX } from '@ui/palette'
import { PerfProbe, type PerfSnapshot } from '@render/perf/perfProbe'

/** Feuille PARTAGÉE (tous stages) : le joueur. Ennemis ET boss sont PAR STAGE (voir stages.ts). */
const SHARED_SHEETS: ReadonlyArray<readonly [string, string, number]> = [['player', 'player_j1.png', 192]]

export interface GameSceneData {
  app: App
  testMode: boolean
  seam: GameSeam | null
  /** Mode allégé (e2e) : ne charge pas les feuilles de sprites lourdes → cercles. */
  lite?: boolean
}

/** Clamp du delta réel pour éviter la spirale de la mort après un gel d'onglet. */
const MAX_FRAME_MS = 100

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
  /** Config de rendu du stage courant (sol/décalques/props/skins d'ennemis). */
  private stage!: StageRender
  private keyboardInput: KeyboardInput | null = null
  private gamepads: GamepadInput[] = []
  /** Caméra (suivi solo + groupe coop) extraite de GameScene — détient l'état `following`. */
  private readonly camera = new CameraController(this)
  /** Effets visuels transitoires (extraits de GameScene) — observer-only, sans état de sim. */
  private readonly vfx = new VfxManager(this)
  /** Profileur de temps de frame render-side (perf mobile) — test/overlay only. */
  private readonly perf = new PerfProbe()
  /** Rendu du joueur/prisonniers/intro extrait de GameScene (détient les Maps/état joueur). */
  private players!: PlayerRenderer
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
  /** true si une compo existe pour ce stage → décor ambiant coupé (la compo est la vérité). */
  private decorSuppressed = false
  /**
   * Pool de sprites pour ennemis/projectiles/pickups (horde 300-600 entités) : réutilise
   * au lieu de create/destroy. INSTANCE FRAÎCHE à chaque `create()` (scene.restart en
   * détruit une et en recrée une autre) — jamais un singleton de module.
   */
  private pool!: SpritePool
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
  /** Rendu du télégraphe des formations (marqueur au sol + flèche de bord) — Task 10. */
  private telegraph!: TelegraphRenderer
  /** Rendu des clusters de terrain tactique (T5) — module dédié, GameScene délègue. */
  private siteRenderer!: SiteRenderer
  /** Structures bâties (tranchées/grilles/façades) — module dédié, GameScene délègue. */
  private siteStructures!: SiteStructures
  /** Ouvriers navetteurs (T6) — module dédié, GameScene délègue. */
  private siteWorkers!: SiteWorkers
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
    // Assets réservés éditeur : préchargés pour que les compos sauvées soient
    // jouables (le rendu des clusters composés retrouve la texture). Non scatterés.
    for (const e of this.stage.editorExtras ?? []) {
      this.load.image(e.key, e.file)
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
      // Ouvriers GÉNÉRIQUES partagés : dispo dans les compos de TOUS les stages.
      for (const w of SHARED_WORKER_NPCS) {
        this.load.spritesheet(w.key, w.file, { frameWidth: w.frame, frameHeight: w.frame })
      }
    }
    this.load.image('proj_scie', 'stage01/weapons/proj_scie.png')
    this.load.image('proj_cloueur', 'stage01/weapons/proj_cloueur.png')
    // Projectiles dédiés phase A (A2 lot 2) + flaque de goudron (lot 3).
    this.load.image('proj_boulons', 'stage01/weapons/proj_boulons.png')
    this.load.image('proj_cle', 'stage01/weapons/proj_cle.png')
    this.load.image('proj_brouette', 'stage01/weapons/proj_brouette.png')
    // Piste C : nuage de mousse de l'extincteur (sprite PixelLab, rendu orienté).
    this.load.image('vfx_foam_cone', 'stage01/weapons/vfx_foam_cone.png')
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
    // Kit terrain tactique (T5) — clôtures, route, portail.
    // Chargés ici (partagés, pas par stage) car les clusters les référencent
    // indépendamment du stage. No-op si déjà en cache.
    this.load.image('fence_panel', 'terrain/fence_panel.png')
    this.load.image('road_strip', 'terrain/road_strip.png')
    this.load.image('site_gate', 'terrain/site_gate.png')
    this.load.image('fence_post', 'terrain/fence_post.png')
    // Kit « plan de chantier » : base vie + piquets topo + piste en terre,
    // partagés entre stages (les prefabs/pistes les référencent partout).
    this.load.image('bungalow_shared', 'stage01/props/site_cabin.png')
    this.load.image('piquets_shared', 'stage01/props/survey_stakes.png')
    this.load.image('piste_strip', 'terrain/piste_strip.png')
  }

  /** Réinitialise l'état par-run (indispensable car `scene.restart` réutilise l'instance). */
  private resetRunState(): void {
    // Le rendu joueur/prisonniers/intro (playerSprites, labels, prevLevel/prevHp,
    // damageFlash, lastMove, prisonniers, introStartMs/introDone) est porté par une
    // instance FRAÎCHE de PlayerRenderer recréée dans create() — rien à nettoyer ici.
    this.camera.reset()
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
    // Rendu du joueur/prisonniers/intro : instance fraîche par scène (détient les Maps/état joueur).
    this.players = new PlayerRenderer(this, this.vfx, this.camera, this.lite)
    // Rendu du télégraphe des formations (Task 10) : instance fraîche par scène.
    this.telegraph = new TelegraphRenderer(this)
    // Rendu des clusters de terrain (T5) : instance fraîche par scène.
    this.siteRenderer = new SiteRenderer(this)
    // Structures bâties (refonte cohérence) : instance fraîche par scène.
    this.siteStructures = new SiteStructures(this)
    // Ouvriers navetteurs (T6) : instance fraîche par scène.
    this.siteWorkers = new SiteWorkers(this)
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
    // Là où une STRUCTURE prend le relais, on atténue/éteint le scatter aléatoire
    // pour que la structure se lise. Render-only.
    if (SITE_PROGRAMS[this.loadedStageId] !== undefined) {
      // Stage au PLAN DE CHANTIER : ZÉRO élément aléatoire streamé — tout ce qui
      // est au sol vient du plan (zones/prefabs/pistes). Le bruit ne remplacera
      // jamais du contenu (retour playtest : décalques épars = « drapeaux »).
      streamerOpts.props = []
      streamerOpts.decalDensityMultiplier = 0
    } else if (hasStructurePlan(this.loadedStageId)) {
      streamerOpts.decalDensityMultiplier = (streamerOpts.decalDensityMultiplier ?? 1) * 0.35
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

    // ── Anti-doublon clusters / ancien semis ─────────────────────────────────
    // Si le stage A des clusters (ex. terrassement), le SiteRenderer dessine les
    // engins/fosses aux positions de la sim → on saute l'ancien semis de structures
    // (createStructures / createLandmark) pour CE stage pour éviter les doublons.
    // Les stages sans clusters conservent l'ancien rendu.
    const siteLayout = buildSiteLayout(this.app.getState().seed, WORLD.width, WORLD.height, this.loadedStageId)
    const hasClusters = siteLayout.clusters.length > 0

    // Grandes structures qui remplissent l'arène (l'étape de chantier partout, hors centre).
    const stageGeometry = this.stage.geometry
    if (!hasClusters && this.stage.structures !== undefined) {
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
    if (!hasClusters && lm !== undefined) {
      createLandmark(
        this, WORLD.width, WORLD.height,
        { key: lm.key, scale: lm.scale, count: lm.count },
        stageSeed, stageGeometry,
        exclusions, placed
      )
    }

    // Clusters de terrain (T5) : dessinés après le sol, avant les PNJ/streamer.
    // Utilise la MÊME seed brute que la sim (buildSiteLayout dérive son propre sel).
    // En mode lite (e2e sim-only), ni les feuilles PNJ ni les skins ne sont chargés,
    // donc siteWorkers ne peut pas dessiner (setFrame sur une texture absente → throw
    // qui bloquerait create() → `ready` jamais émis). On saute le rendu des clusters/
    // ouvriers (purement cosmétique) ; la COLLISION reste gérée par la sim.
    if (!this.lite) {
      this.siteRenderer.reset(this.app.getState().seed, WORLD.width, WORLD.height, this.loadedStageId)
      // Réseau bâti (tranchées/tuyaux/regards) — streamé par chunks autour de la caméra.
      this.siteStructures.setPlan(WORLD.width, WORLD.height, this.loadedStageId)
      // Ouvriers navetteurs (T6) : construits depuis le même layout que le siteRenderer.
      // On passe les clés PNJ RÉELLEMENT chargées du stage (numérotées par stage) pour
      // que _resolveKey matche une texture existante partout, pas seulement au stage 02.
      const npcKeys = (this.stage.ambient ?? []).map((a) => a.key)
      this.siteWorkers.reset(this.app.getState().seed, WORLD.width, WORLD.height, this.loadedStageId, npcKeys)
    }
    // PNJ(s) d'ambiance non-hostiles (geste métier) — un sprite par entrée, placement seedé
    // hors centre. Chaque PNJ reçoit un seed individuel dérivé de stageSeed + index, ce qui
    // garantit un placement déterministe et hors-chevauchement même si le tableau grandit (B5+).
    // T4 : geometry.ambientAngle cible le PREMIER PNJ (chef de file) ; les suivants tournent
    // autour d'angles dérivés (+ 40° par PNJ) pour rester dans le même secteur.
    const AMB_DIST_MIN = 420
    const AMB_DIST_MAX = 520
    // Les stages pilotés par le PLAN de chantier (sitePrograms) tirent leur vie
    // des ouvriers navetteurs (SiteWorkers, purposeful) : on N'AJOUTE PAS en plus
    // les PNJ errants Lissajous — c'était la double-population incohérente
    // (tailles disparates + errance « dans tous les sens »). Les feuilles PNJ
    // restent chargées (preload) car SiteWorkers les réutilise.
    // NORMALISATION PNJ : le vieux système d'errance (ambientSprites Lissajous,
    // tailles disparates) est DÉSACTIVÉ sur TOUS les stages — plus aucun « petit
    // PNJ ». La vie du chantier vient exclusivement des SiteWorkers (échelle
    // unique, déplacements utiles). Les feuilles `stage.ambient` restent
    // préchargées (skins réutilisés par SiteWorkers). Liste forcée vide.
    const ambientList = (this.stage.ambient ?? []).slice(0, 0)
    for (const [npcIdx, amb] of ambientList.entries()) {
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
    // Compo sauvée = vérité totale du décor : on coupe le streaming ambiant
    // (traces/cailloux/herbes auto). Sans compo → décor procédural conservé.
    this.decorSuppressed = getComposedLayout(this.loadedStageId) !== null

    this.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height)
      .setStrokeStyle(4, 0xf5c542)

    // NB : anneaux couleur des joueurs + barres de relève (playerRings/reviveBars)
    // sont créés lazily par PlayerRenderer à sa 1re frame de sync (juste ci-dessous),
    // avec leurs depths explicites (-1 / 5) → même z-ordering qu'auparavant.

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.setZoom(1.2)

    this.syncSprites()
    this.camera.update(this.app.getStateForFrame(this.app.frameId), this.players.sprites)
    // Préchargement initial des chunks au démarrage (la caméra est positionnée,
    // le streamer peut déjà charger la vue initiale sans attendre le 1er update()).
    if (!this.decorSuppressed) {
      this.decorStreamer.update(this.cameras.main)
    }
    // Préchargement initial du réseau structurel (même vue initiale que le décor).
    if (!this.lite) {
      this.siteStructures.update(this.cameras.main)
    }

    // Onde de choc du marteau + libération de prisonnier + évolution d'arme : la sim émet, l'App relaie.
    this.app.events.addEventListener('auraPulse', this.onAuraPulse)
    this.app.events.addEventListener('prisonerFreed', this.onPrisonerFreed)
    this.app.events.addEventListener('evolved', this.onEvolved)
    this.events.once('shutdown', () => {
      this.app.events.removeEventListener('auraPulse', this.onAuraPulse)
      this.app.events.removeEventListener('prisonerFreed', this.onPrisonerFreed)
      this.app.events.removeEventListener('evolved', this.onEvolved)
      this.telegraph.dispose()
      this.siteRenderer.dispose()
      this.siteStructures.dispose()
      this.siteWorkers.dispose()
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
        for (const [id, sprite] of this.players.sprites) {
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
      // T5 — Sonde clusters de terrain (test-only) : nombre de sprites actifs.
      this.seam.debugSiteInfo = (): { spriteCount: number } => ({
        spriteCount: this.siteRenderer.spriteCount
      })
      // T6 — Sonde ouvriers navetteurs (test-only) : nombre de workers affichés.
      this.seam.debugWorkers = (): {
        count: number
        workers: { role: string; texture: string; x: number; y: number }[]
      } => this.siteWorkers.workerDebugInfo
      this.seam.debugCameraOverview = (zoom: number, cx: number, cy: number): void => {
        this.camera.setOverview({ zoom, cx, cy })
      }
      // Sonde perf (test/overlay only) : snapshot du profileur de temps de frame.
      this.seam.debugPerfProfile = (): PerfSnapshot => this.perfSnapshot()
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
      this.perf.measure('sim', () => this.app.advanceTime(Math.min(delta, MAX_FRAME_MS)))
    }
    this.syncSprites()
    this.camera.update(st, this.players.sprites)
    // Streamer de décor : throttlé toutes les 4 frames pour éviter un scan de Map
    // à chaque tick (la caméra ne se déplace pas d'un chunk par frame).
    this.decorStreamerFrame++
    if (this.decorStreamerFrame % 4 === 0) {
      if (!this.decorSuppressed) {
        this.decorStreamer.update(this.cameras.main)
      }
      this.siteStructures.update(this.cameras.main)
    }
    // Sonde perf (test/overlay only) : compteurs instantanés publiés en fin de frame.
    this.perf.count('enemies', st.enemies.length)
    this.perf.count('objects', this.children.list.length)
  }

  /** Snapshot du profileur de frame (test/overlay only). */
  perfSnapshot(): PerfSnapshot {
    return this.perf.snapshot()
  }


  /** Construit les entrées par joueur (clavier⊕pad0 pour P1, pad(k-1) pour P k≥2). */
  private readPlayerInputs(playerCount: number): Map<number, FrameInput> {
    const empty: FrameInput = { move: { x: 0, y: 0 }, pressed: [], action: false }
    const kb = this.keyboardInput !== null ? this.keyboardInput.readFrame() : empty
    const pads = this.gamepads.map((g) => g.readFrame())
    return buildPlayerInputs(kb, pads, playerCount)
  }

  /** Synchronise les sprites avec l'état courant de la simulation. */
  private syncSprites(): void {
    const state = this.app.getStateForFrame(this.app.frameId)
    // Rendu joueur/prisonniers/intro (délégué) : goldSkin, ré-arme d'intro, boucle
    // joueur (rings/label/downed/anim/level-up/flash), fin-d'intro flourish, prisonniers.
    this.perf.measure('playersSync', () => this.players.sync(state))

    this.perf.measure('hordeSync', () => this.horde.sync(state, this.stage))

    // Télégraphe des formations (Task 10) : marqueur au sol + flèche de bord d'écran.
    this.telegraph.sync(state, this.cameras.main)

    // Clusters de terrain (T5) + ouvriers (T6) : rendu cosmétique, sauté en lite (cf. reset).
    if (!this.lite) {
      this.siteRenderer.sync()
      this.siteWorkers.sync(state)
    }

    // PNJ(s) d'ambiance : errance douce (B3) + animation de geste (boucle lente).
    for (const npc of this.ambientSprites) {
      const off = ambientOffset(npc.seed, this.time.now, npc.behavior)
      npc.sprite.setPosition(npc.anchor.x + off.dx, npc.anchor.y + off.dy)
      npc.sprite.setFrame(walkFrame(0, this.time.now, npc.framePeriodMs))
    }
    // Bulles de dialogue (humour râleur rétro) sur les PNJ du chantier : métier
    // posé → 'job' (blasé, moqueur), ouvrier mobile → 'civilian' (panique). Un
    // ennemi à portée déclenche les répliques « monstre proche ». Priorité stage
    // + anti-répétition gérées par le sélecteur pur (npcDialogues).
    const enemies = state.enemies
    const monsterR2 = 260 * 260
    const bubbleSources = this.siteWorkers.getActiveNpcs().map((n) => ({
      sprite: { x: n.x, y: n.y },
      seed: n.seed,
      npcType: n.role === 'npc_trade' ? ('job' as const) : ('civilian' as const),
      monsterNear: enemies.some((e) => {
        const dx = e.x - n.x
        const dy = e.y - n.y
        return dx * dx + dy * dy < monsterR2
      })
    }))
    this.bubbles.update(bubbleSources, state.players.filter((p) => p.alive), this.time.now, this.loadedStageId)
  }
}
