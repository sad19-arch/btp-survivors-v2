import Phaser from 'phaser'
import type { AppViewState } from '@/app/appState'
import { INTRO, REVIVE } from '@content/config'
import { dirRow, walkFrame, idleFrame } from '@render/sprites'
import type { PlayerState, PrisonerState } from '@core/types'
import { PALETTE_HEX, PALETTE } from '@ui/palette'
import { playerColor } from '@content/players'
import { characterDef } from '@content/characters'
import { VfxManager } from '@render/scenes/vfxManager'
import { CameraController } from '@render/scenes/cameraController'

/** Sprite de personnage : feuille pixel-art si l'asset existe, sinon cercle de repli. */
type CharSprite = Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc

/**
 * Échelle par défaut d'un personnage sans échelle de skin dédiée.
 * Cibles ~hauteur affichée : joueur 83 · tank ~88 · rapide ~70 · base ~74 · boss ~144.
 */
const PLAYER_SCALE = 0.516
/** Délai d'immobilité (ms) avant que le héros ne joue son animation d'attente impatiente. */
const IDLE_EMOTE_MS = 4000
/** Décalage vertical (px monde) d'où le héros entre en marchant pendant l'intro. */
const INTRO_ENTER_OFFSET = 380

const PLAYER_COLOR = 0x3498db
const PLAYER_RADIUS = 16

/**
 * Rendu du JOUEUR + PRISONNIERS + INTRO, extrait de GameScene pour l'alléger.
 * Détient toutes les Maps de sprites/état joueur (rings, labels, flash de dégât,
 * anim, prisonniers) + l'état d'intro par-run. Observer-only : lit l'état exposé,
 * ne touche jamais la simulation. Une instance FRAÎCHE est créée à chaque
 * `create()` de la scène (les GameObjects sont détruits au shutdown Phaser ;
 * réutiliser une instance rendrait les sprites fantômes) — d'où l'absence de `reset()`.
 */
export class PlayerRenderer {
  private readonly playerSprites = new Map<number, CharSprite>()
  /**
   * Anneau coloré au sol sous chaque joueur (identité co-op). Un seul Graphics
   * persistant, effacé/redessiné chaque frame — pas d'objet par joueur à fuir.
   * Masqué en solo (aucun changement visuel quand `players.length===1`). Créé
   * lazily à la 1re frame de sync (comme hordeRenderer pour hazardGraphics) —
   * garanti non-nul dès l'entrée de la boucle joueur.
   */
  private playerRings!: Phaser.GameObjects.Graphics
  /**
   * Invite « appuie ici » au-dessus d'un joueur à terre quand un coéquipier vivant
   * est À PORTÉE (sinon l'invite mentirait). Une image poolée par joueur, jamais
   * détruite — juste masquée. Sans elle, la relève était invisible : rien ne disait
   * au coéquipier qu'il y avait un bouton à maintenir.
   */
  private readonly revivePrompts = new Map<number, Phaser.GameObjects.Image>()

  /** Vrai une fois playerRings/reviveBars créés (garde de création lazy). */
  private graphicsReady = false
  /**
   * Barre de progrès de relève au-dessus des joueurs à terre (co-op). Un seul
   * Graphics persistant, effacé/redessiné chaque frame — même schéma que `playerRings`.
   */
  private reviveBars!: Phaser.GameObjects.Graphics
  /**
   * Étiquette « JN » + chevron au-dessus de chaque joueur humain, pour le repérer
   * dans une nuée d'ennemis. Un couple texte+chevron par joueur, couleur =
   * `playerColor`, depth élevé (au-dessus des ennemis). Affiché en solo comme en coop.
   */
  private readonly playerLabels = new Map<
    number,
    { text: Phaser.GameObjects.Text; chevron: Phaser.GameObjects.Triangle }
  >()
  /** Dernier niveau connu par joueur (détection de montée de niveau → VFX). */
  private readonly prevLevel = new Map<number, number>()
  /** Derniers PV connus par joueur (détection de dégât → flash rouge). */
  private readonly prevHp = new Map<number, number>()
  /** Instant (scene.time.now) jusqu'auquel le sprite joueur reste teinté « touché ». */
  private readonly damageFlashUntil = new Map<number, number>()
  /** Dernier instant de mouvement par joueur (pour l'animation d'attente impatiente). */
  private readonly lastMoveMs = new Map<number, number>()
  /** Skin doré (code Konami), rafraîchi depuis l'état à chaque frame. */
  private goldSkin = false
  /** Horloge de rendu au début de l'intro (-1 = pas d'intro en cours). */
  private introStartMs = -1
  /** Intro terminée pour la run courante (ré-armée à chaque nouvelle run). */
  private introDone = false
  /** Vrai pendant un chargement dynamique de feuille(s) de perso (évite d'en re-lancer). */
  private loadingSheets = false
  /** Sprites du prisonnier : cage + ouvrier barbu, par id d'entité. */
  private readonly prisonerCages = new Map<number, Phaser.GameObjects.Image | Phaser.GameObjects.Arc>()
  private readonly prisonerWorkers = new Map<number, CharSprite>()
  /** Ensemble « vus cette frame » réutilisé pour le culling des prisonniers (vidé, pas recréé). */
  private readonly seenPrisonerScratch = new Set<number>()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly vfx: VfxManager,
    private readonly camera: CameraController,
    private readonly lite: boolean
  ) {}

  /**
   * Vue en lecture seule des sprites joueur, pour la caméra (suivi du leader) et
   * les sondes de test. La Map appartient à PlayerRenderer.
   */
  get sprites(): ReadonlyMap<number, CharSprite> {
    return this.playerSprites
  }

  /**
   * Synchronise le rendu joueur/prisonniers/intro avec l'état de la frame.
   * Reproduit l'ordre historique de `GameScene.syncSprites` (bloc joueur) :
   * (1) goldSkin, (2) intro re-arm, (3) boucle joueur, (4) fin-d'intro flourish,
   * (5) prisonniers.
   */
  sync(state: AppViewState): void {
    // Graphics lazy (créés à la 1re frame de sync, comme hordeRenderer pour hazardGraphics).
    if (!this.graphicsReady) {
      // Anneaux couleur des joueurs (co-op) : au-dessus du sol/props, sous les sprites.
      this.playerRings = this.scene.add.graphics().setDepth(-1)
      // Au-dessus des sprites (depth par défaut 0) pour rester lisible pendant la relève.
      this.reviveBars = this.scene.add.graphics().setDepth(5)
      this.graphicsReady = true
    }

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
        if (this.scene.textures.exists(key)) {
          sprite = this.scene.add.sprite(p.x, p.y, key).setScale(characterDef(p.characterId).renderScale ?? PLAYER_SCALE)
        } else if (this.lite || characterDef(p.characterId).sheet === 'player') {
          // Feuille de référence (ouvrier, préchargée) absente → mode allégé : cercle.
          sprite = this.scene.add.circle(p.x, p.y, PLAYER_RADIUS, PLAYER_COLOR)
        } else {
          // Feuille dédiée du perso pas encore en cache → chargement à la volée, puis
          // on ATTEND (aucun cercle mis en cache : le vrai sprite naîtra une fois chargé).
          this.ensureCharacterSheets(state.players)
          continue
        }
        this.playerSprites.set(p.id, sprite)
        this.lastMoveMs.set(p.id, this.scene.time.now)
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
        this.damageFlashUntil.set(p.id, this.scene.time.now + 140)
      }
      this.prevHp.set(p.id, p.hp)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        if (downedActive) {
          // À terre : la teinte grise gagne toujours face au flash de dégât.
          sprite.setTint(0x888888)
        } else if (this.scene.time.now < (this.damageFlashUntil.get(p.id) ?? 0)) {
          sprite.setTint(0xff5a5a)
        } else {
          sprite.clearTint()
        }
      }
      if (downedActive) {
        this.drawReviveBar(p)
      }
      // Invite bouton : seulement si un coéquipier VIVANT est à portée de relève.
      this.syncRevivePrompt(p, state.players, downedActive)
    }

    // Fin d'intro : flourish d'étincelles une fois, puis le suivi caméra reprend.
    if (!introActive && this.introStartMs >= 0 && !this.introDone) {
      this.introDone = true
      const leader = this.playerSprites.get(1)
      if (leader !== undefined) {
        this.vfx.spawnIntroFlourish(leader.x, leader.y)
      }
    }

    this.syncPrisoners(state.prisoners)
  }

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
      if (sheet !== 'player' && !this.scene.textures.exists(sheet) && !toLoad.includes(sheet)) {
        toLoad.push(sheet)
      }
    }
    if (toLoad.length === 0) {
      return
    }
    for (const sheet of toLoad) {
      this.scene.load.spritesheet(sheet, `${sheet}.png`, { frameWidth: 192, frameHeight: 192 })
    }
    this.loadingSheets = true
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loadingSheets = false
    })
    this.scene.load.start()
  }

  /**
   * Clé de feuille de marche du héros, par personnage (dorée si débloquée + présente,
   * uniquement sur la feuille par défaut de l'ouvrier — clin d'œil P1 Konami).
   */
  private walkTextureKey(characterId: string): string {
    const base = characterDef(characterId).sheet
    return this.goldSkin && base === 'player' && this.scene.textures.exists('player_gold') ? 'player_gold' : base
  }

  /** Clé de feuille d'attente du héros, par personnage (dorée si débloquée + présente). */
  private idleTextureKey(characterId: string): string {
    const base = characterDef(characterId).sheet
    const idle = `${base}_idle`
    if (this.goldSkin && base === 'player' && this.scene.textures.exists('player_idle_gold')) {
      return 'player_idle_gold'
    }
    return this.scene.textures.exists(idle) ? idle : base
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
      const text = this.scene.add
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
      const chevron = this.scene.add
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
   * Invite d'action au-dessus d'un joueur à terre : le GLYPHE DU BOUTON à maintenir
   * (manette A / touche E), pulsé pour attirer l'œil. Affichée seulement quand un
   * coéquipier vivant est dans `REVIVE.radius` — donc quand l'action est réellement
   * possible : l'invite apparaît pile au moment où l'on peut agir.
   *
   * Lecture seule sur l'état (aucune règle de jeu ici) : le rayon vient de la même
   * constante de contenu que `reviveSystem`, donc affichage et règle ne peuvent pas diverger.
   */
  private syncRevivePrompt(p: PlayerState, players: readonly PlayerState[], downedActive: boolean): void {
    const existing = this.revivePrompts.get(p.id)
    const inRange =
      downedActive &&
      players.some(
        (o) => o.id !== p.id && o.alive && Math.hypot(o.x - p.x, o.y - p.y) <= REVIVE.radius
      )
    if (!inRange) {
      existing?.setVisible(false)
      return
    }
    // Manette branchée → bouton A ; sinon clavier → touche E.
    const key = (this.scene.input.gamepad?.total ?? 0) > 0 ? 'ui_btn_a' : 'ui_key_e'
    let img = existing
    if (img === undefined) {
      if (!this.scene.textures.exists(key)) {
        return
      }
      img = this.scene.add.image(p.x, p.y, key).setDepth(6)
      this.revivePrompts.set(p.id, img)
    }
    img.setTexture(key)
    img.setPosition(p.x, p.y - 112)
    img.setVisible(true)
    // Pulsation lente : ça bouge, donc ça se voit, sans clignoter agressivement.
    const phase = (this.scene.time.now % 900) / 900
    img.setScale(0.62 + Math.sin(phase * Math.PI * 2) * 0.07)
  }

  /**
   * Barre de progrès de relève au-dessus d'un joueur à terre.
   *
   * Volontairement BLANCHE et cadrée d'or — surtout PAS la couleur du joueur :
   * en 40×6 px à sa propre couleur, elle était prise pour une barre de vie, et on
   * pouvait relever un coéquipier sans comprendre que c'était ça qui se passait.
   * Dessine sur le Graphics partagé `reviveBars` — aucun GameObject créé.
   */
  private drawReviveBar(p: PlayerState): void {
    const w = 72
    const h = 12
    const x = p.x - w / 2
    // Empilement au-dessus du joueur : chevron (-44) · étiquette JN (-58) · barre
    // (-78) · glyphe du bouton (-112). Sinon la barre écrase l'étiquette.
    const y = p.y - 78
    // Cadre : contour noir + liseré doré (lisible sur n'importe quel sol).
    this.reviveBars.fillStyle(0x101014, 0.85)
    this.reviveBars.fillRect(x - 3, y - 3, w + 6, h + 6)
    this.reviveBars.fillStyle(0xffd24a, 1)
    this.reviveBars.fillRect(x - 2, y - 2, w + 4, h + 4)
    this.reviveBars.fillStyle(0x120e0a, 1)
    this.reviveBars.fillRect(x, y, w, h)
    const fillW = Math.max(0, Math.min(1, p.reviveProgress)) * w
    if (fillW > 0) {
      this.reviveBars.fillStyle(0xffffff, 1)
      this.reviveBars.fillRect(x, y, fillW, h)
    }
  }

  /**
   * Rendu scripté de l'intro : le héros arrive en marchant par le bas de l'écran,
   * s'arrête au spawn puis « ajuste son casque ». Caméra fixée sur le spawn le temps
   * de l'entrée (le suivi reprend à la fin). Aucune logique de jeu (sim gelée).
   */
  private renderIntroPlayer(sprite: CharSprite, p: PlayerState): void {
    if (this.introStartMs < 0) {
      this.introStartMs = this.scene.time.now
      this.scene.cameras.main.centerOn(p.x, p.y)
    }
    const t = Math.min(1, (this.scene.time.now - this.introStartMs) / INTRO.durationMs)
    const walkPortion = 0.65
    sprite.setVisible(true)
    if (sprite instanceof Phaser.GameObjects.Sprite) {
      const key = this.walkTextureKey(p.characterId)
      if (sprite.texture.key !== key && this.scene.textures.exists(key)) {
        sprite.setTexture(key)
      }
    }
    if (t < walkPortion) {
      const k = t / walkPortion
      sprite.setPosition(p.x, p.y + INTRO_ENTER_OFFSET * (1 - k))
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        sprite.setFrame(walkFrame(2, this.scene.time.now)) // ligne 2 = nord (marche vers le haut)
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
      this.lastMoveMs.set(p.id, this.scene.time.now)
    }
    const idleFor = this.scene.time.now - (this.lastMoveMs.get(p.id) ?? this.scene.time.now)
    const idleKey = this.idleTextureKey(p.characterId)
    if (!moving && idleFor > IDLE_EMOTE_MS && this.scene.textures.exists(idleKey)) {
      if (sprite.texture.key !== idleKey) {
        sprite.setTexture(idleKey)
      }
      sprite.setFrame(walkFrame(0, this.scene.time.now, 220)) // boucle lente, face caméra
      return
    }
    const walkKey = this.walkTextureKey(p.characterId)
    if (sprite.texture.key !== walkKey) {
      sprite.setTexture(walkKey)
    }
    const row = dirRow(p.vx, p.vy)
    sprite.setFrame(moving ? walkFrame(row, this.scene.time.now) : idleFrame(row))
  }

  /** Dessine l'ouvrier prisonnier (cage + sosie barbu) ; libéré → il court hors écran. */
  private syncPrisoners(prisoners: readonly PrisonerState[]): void {
    const seen = this.seenPrisonerScratch
    seen.clear()
    for (const pr of prisoners) {
      seen.add(pr.id)
      let worker = this.prisonerWorkers.get(pr.id)
      if (worker === undefined) {
        worker = this.scene.textures.exists('prisoner')
          ? this.scene.add.sprite(pr.x, pr.y, 'prisoner').setScale(0.62)
          : this.scene.add.circle(pr.x, pr.y, 16, 0xcfa15a)
        worker.setDepth(2)
        this.prisonerWorkers.set(pr.id, worker)
      }

      // Cage assez grande pour enfermer l'ouvrier (~96 px), barreaux devant.
      // Alpha 0.6 : les barreaux restent lisibles mais l'ouvrier transparaît à travers.
      let cage = this.prisonerCages.get(pr.id)
      if (cage === undefined) {
        cage = this.scene.textures.exists('cage')
          ? this.scene.add.image(pr.x, pr.y, 'cage').setScale(1.2).setAlpha(0.6)
          : this.scene.add.circle(pr.x, pr.y, 30, 0x8a8a8a, 0).setStrokeStyle(3, 0x8a8a8a)
        cage.setDepth(3)
        this.prisonerCages.set(pr.id, cage)
      }
      cage.setVisible(!pr.freed)
      // Repositionner worker ET cage à chaque frame (le prisonnier peut bouger/fuir).
      worker.setPosition(pr.x, pr.y)
      cage.setPosition(pr.x, pr.y)
      if (worker instanceof Phaser.GameObjects.Sprite) {
        // Libéré → animation de marche (il s'enfuit vers le bas) ; sinon immobile en cage.
        worker.setFrame(pr.freed ? walkFrame(0, this.scene.time.now) : idleFrame(0))
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
