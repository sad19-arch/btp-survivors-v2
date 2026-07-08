/**
 * SiteWorkers — module de rendu des ouvriers navetteurs (T6).
 *
 * Des ouvriers d'ambiance font la navette entre deux zones du chantier (issues
 * des clusters), portent une charge visible à l'aller, et paniquent quand la
 * horde s'approche. Rendu pur/cosmétique : sim:check diff 0 garanti.
 *
 * CONTRAINTE ARCHITECTURE :
 *   Ce module ne contient QUE du rendu observateur.
 *   `GameScene` instancie et délègue via reset/sync/dispose (pattern uniforme).
 *   La logique de comportement (navette, charge, panique) vit dans
 *   `src/render/workerBehavior.ts` (fonctions pures testées).
 *
 * Profondeurs DA :
 *   1   ouvriers navetteurs (même plan que les PNJ d'ambiance)
 *   2   charge portée (au-dessus de l'ouvrier)
 *   8   indicateur de panique (panneau « ! » — distinct des bulles prisonnier)
 *
 * Lisibilité :
 *   - Sprites PNJ existants (porteur/signaleur) → silhouette non-menaçante.
 *   - Indicateur de panique = panneau orange pixel « ! » (DA-safe, ≠ bulle « Merci »).
 *   - Charge = sprite prop_s2_dirt en miniature (scale 0.4), visible sur le worker.
 */

import Phaser from 'phaser'
import { buildSiteLayout } from '@core/siteLayout'
import { commutePos, loadVisible, panicDecision, PANIC_R } from '@render/workerBehavior'
import { dirRow, walkFrame } from '@render/sprites'
import type { AppViewState } from '@/app/appState'
import { PALETTE_HEX } from '@ui/palette'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre maximum d'ouvriers simultanément affichés (centrés sur le joueur). */
const WORKER_COUNT = 10

/** Vitesse de navette des porteurs (px/s). */
const PORTEUR_SPEED = 65

/** Vitesse de navette des signaleurs (px/s). */
const SIGNALEUR_SPEED = 80

/** Vitesse de fuite en panique (px/s — multiplicateur sur le vecteur de fuite). */
const FLEE_SPEED_PX_PER_MS = 0.12

/** Throttle de re-sélection des workers actifs (frames entre deux scans). */
const RESELECT_THROTTLE = 30

/** Depth des sprites d'ouvriers. */
const DEPTH_WORKER = 1

/** Depth de la charge portée. */
const DEPTH_LOAD = 2

/** Depth de l'indicateur de panique. */
const DEPTH_PANIC = 8

/** Phase de départ déterministe : décalage en ms par index de job. */
const PHASE_OFFSET_MS = 3700

// ─────────────────────────────────────────────────────────────────────────────
// Types internes
// ─────────────────────────────────────────────────────────────────────────────

interface WorkerJob {
  /** Clé de texture PNJ à utiliser pour ce job. */
  textureKey: string
  /** Rôle du job ('porteur' | 'signaleur'). */
  role: 'porteur' | 'signaleur'
  /** Point de départ A (monde). */
  ax: number
  ay: number
  /** Point d'arrivée B (monde). */
  bx: number
  by: number
  /** Vitesse de navette (px/s). */
  speed: number
  /** Milieu du trajet (pour tri par proximité au joueur). */
  midX: number
  midY: number
  /** Phase de départ en ms (déterministe). */
  phaseOffsetMs: number
}

interface ActiveWorker {
  job: WorkerJob
  sprite: Phaser.GameObjects.Sprite
  loadSprite: Phaser.GameObjects.Image | null
  panicIndicator: Phaser.GameObjects.Container | null
  /** Position de fuite accumulée (en panique, s'éloigne de l'ennemi). */
  fleeX: number
  fleeY: number
  inPanic: boolean
  /**
   * `true` si le sprite est un vrai Sprite texturé (setFrame valide).
   * `false` pour le repli Graphics (pas de setFrame → ne jamais l'animer,
   * sinon `setFrame is not a function` casse `create()` → `ready` jamais émis).
   */
  animatable: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// SiteWorkers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classe de rendu des ouvriers navetteurs (T6).
 * Instanciée par `GameScene.create()` ; réinitialisée à chaque run (reset/sync/dispose).
 */
export class SiteWorkers {
  /** Tous les jobs construits depuis le siteLayout (liste complète). */
  private jobs: WorkerJob[] = []
  /** Workers actuellement affichés (~10 les plus proches du joueur). */
  private active: ActiveWorker[] = []
  /** Compteur de frames pour le throttle de re-sélection. */
  private reselectFrame = 0
  /** Monde courant (pour le clamp de fuite). */
  private worldW = 0
  private worldH = 0

  constructor(private readonly scene: Phaser.Scene) {}

  // ─────────────────────────────────────────────────────────────────────────
  // reset
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reconstruit les jobs depuis le siteLayout du stage courant.
   * Doit être appelé depuis `GameScene.create()` après `siteRenderer.reset()`.
   */
  reset(seed: number, worldW: number, worldH: number, stageId: string, npcKeys: readonly string[] = []): void {
    this._destroyAll()
    this.jobs = []
    this.worldW = worldW
    this.worldH = worldH
    this.reselectFrame = 0

    const layout = buildSiteLayout(seed, worldW, worldH, stageId)
    if (layout.clusters.length === 0) {
      // Stage sans clusters → aucun ouvrier.
      return
    }

    // Indices des clusters par rôle (defId).
    // Les prefabs « plan de chantier » sont inclus : le front de creusement joue
    // le rôle d'excavation, la rangée de déblais celui de spoil.
    const excavations = layout.clusters.filter(
      (c) => c.defId === 'cluster_excavation' || c.defId === 'cluster_front_terr'
    )
    const spoils = layout.clusters.filter(
      (c) => c.defId === 'cluster_spoil' || c.defId === 'cluster_spoil_row'
    )
    const routeClusters = layout.clusters.filter((c) => c.defId === 'cluster_route')

    let jobIdx = 0

    // Jobs « porteur » : evacuation excavation → spoil le plus proche.
    for (const exc of excavations) {
      // Trouve le spoil le plus proche de cette excavation.
      let nearestSpoil = spoils[0]
      let nearestDist = Infinity
      for (const sp of spoils) {
        const d = Math.hypot(sp.x - exc.x, sp.y - exc.y)
        if (d < nearestDist) {
          nearestDist = d
          nearestSpoil = sp
        }
      }
      if (nearestSpoil === undefined) {
        continue
      }
      const key = this._resolveKey('porteur', npcKeys)
      if (key === null) {
        continue
      }
      const midX = (exc.x + nearestSpoil.x) / 2
      const midY = (exc.y + nearestSpoil.y) / 2
      this.jobs.push({
        textureKey: key,
        role: 'porteur',
        ax: exc.x,
        ay: exc.y,
        bx: nearestSpoil.x,
        by: nearestSpoil.y,
        speed: PORTEUR_SPEED,
        midX,
        midY,
        phaseOffsetMs: jobIdx * PHASE_OFFSET_MS
      })
      jobIdx++
    }

    // Jobs « signaleur » : patrouille entre 2 clusters de route voisins.
    // On apparie les tuiles de route par paires consécutives (step 2).
    for (let i = 0; i + 1 < routeClusters.length; i += 2) {
      const ra = routeClusters[i]
      const rb = routeClusters[i + 1]
      if (ra === undefined || rb === undefined) {
        continue
      }
      const key = this._resolveKey('signaleur', npcKeys)
      if (key === null) {
        continue
      }
      const midX = (ra.x + rb.x) / 2
      const midY = (ra.y + rb.y) / 2
      this.jobs.push({
        textureKey: key,
        role: 'signaleur',
        ax: ra.x,
        ay: ra.y,
        bx: rb.x,
        by: rb.y,
        speed: SIGNALEUR_SPEED,
        midX,
        midY,
        phaseOffsetMs: jobIdx * PHASE_OFFSET_MS
      })
      jobIdx++
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // sync
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Synchronise les sprites des ouvriers avec l'état courant.
   * Appelé chaque frame depuis `GameScene.syncSprites()`.
   */
  sync(state: AppViewState): void {
    if (this.jobs.length === 0) {
      return
    }

    const nowMs = this.scene.time.now

    // Joueur de référence pour la sélection de proximité.
    const p1 = state.players[0]
    const playerX = p1?.x ?? this.worldW / 2
    const playerY = p1?.y ?? this.worldH / 2

    // Re-sélection throttlée (~30 frames).
    this.reselectFrame++
    if (this.reselectFrame % RESELECT_THROTTLE === 1 || this.active.length === 0) {
      this._reselect(playerX, playerY, nowMs)
    }

    // Ennemi le plus proche de chaque worker (calculé une fois pour tous).
    const enemies = state.enemies

    for (const aw of this.active) {
      const { job } = aw

      // 1. Navette normale.
      const tMs = nowMs + job.phaseOffsetMs
      const pos = commutePos(job.ax, job.ay, job.bx, job.by, tMs, job.speed)

      // 2. Ennemi le plus proche du worker (position navette courante).
      let nearestDist = Infinity
      let nearestX: number | null = null
      let nearestY: number | null = null
      for (const e of enemies) {
        const d = Math.hypot(e.x - pos.x, e.y - pos.y)
        if (d < nearestDist) {
          nearestDist = d
          nearestX = e.x
          nearestY = e.y
        }
      }

      // 3. Décision de panique.
      const pd = panicDecision(pos.x, pos.y, nearestX, nearestY, PANIC_R)

      if (pd.flee) {
        // Mode panique : accumuler la fuite.
        if (!aw.inPanic) {
          aw.inPanic = true
          aw.fleeX = pos.x
          aw.fleeY = pos.y
        }
        const frameMs = Math.min(this.scene.game.loop.delta, 100)
        aw.fleeX = Phaser.Math.Clamp(
          aw.fleeX + pd.fx * FLEE_SPEED_PX_PER_MS * frameMs,
          0, this.worldW
        )
        aw.fleeY = Phaser.Math.Clamp(
          aw.fleeY + pd.fy * FLEE_SPEED_PX_PER_MS * frameMs,
          0, this.worldH
        )
        aw.sprite.setPosition(aw.fleeX, aw.fleeY)

        // Direction de fuite pour l'animation (repli Graphics : pas de setFrame).
        if (aw.animatable) {
          const row = dirRow(pd.fx, pd.fy)
          aw.sprite.setFrame(walkFrame(row, nowMs, 200))
        }

        // Cache la charge.
        if (aw.loadSprite !== null) {
          aw.loadSprite.setVisible(false)
        }

        // Indicateur de panique (panneau « ! » orange).
        this._showPanicIndicator(aw)
      } else {
        // Mode navette normal.
        aw.inPanic = false
        aw.sprite.setPosition(pos.x, pos.y)

        // Direction de marche (repli Graphics : pas de setFrame).
        const dx = job.bx - job.ax
        const dy = job.by - job.ay
        const dirX = pos.leg === 'ab' ? dx : -dx
        const dirY = pos.leg === 'ab' ? dy : -dy
        if (aw.animatable) {
          const row = dirRow(dirX, dirY)
          aw.sprite.setFrame(walkFrame(row, nowMs, 250))
        }

        // Charge : visible à l'aller (A→B) seulement.
        const carrying = loadVisible(pos.leg)
        if (aw.loadSprite !== null) {
          aw.loadSprite.setVisible(carrying)
          if (carrying) {
            // Positionne la charge légèrement au-dessus et devant l'ouvrier.
            aw.loadSprite.setPosition(
              aw.sprite.x + dirX * 0.15,
              aw.sprite.y - 20
            )
          }
        }

        // Cache l'indicateur de panique.
        this._hidePanicIndicator(aw)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // dispose
  // ─────────────────────────────────────────────────────────────────────────

  /** Détruit tous les sprites (workers + charges + indicateurs). Zéro fuite. */
  dispose(): void {
    this._destroyAll()
    this.jobs = []
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sonde de test
  // ─────────────────────────────────────────────────────────────────────────

  /** Nombre d'ouvriers actifs actuellement affichés (sonde pour le seam). */
  get workerCount(): number {
    return this.active.length
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers privés
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sélectionne les WORKER_COUNT jobs dont le milieu est le plus proche du joueur.
   * Crée/détruit les sprites en conséquence.
   */
  private _reselect(playerX: number, playerY: number, nowMs: number): void {
    // Tri par distance du milieu au joueur.
    const sorted = this.jobs.slice().sort((a, b) => {
      const da = Math.hypot(a.midX - playerX, a.midY - playerY)
      const db = Math.hypot(b.midX - playerX, b.midY - playerY)
      return da - db
    })
    const selected = sorted.slice(0, WORKER_COUNT)

    // Identifie les jobs entrants et sortants.
    const currentJobs = new Set(this.active.map((aw) => aw.job))
    const newJobs = new Set(selected)

    // Détruit les workers qui ne sont plus sélectionnés.
    const toDestroy = this.active.filter((aw) => !newJobs.has(aw.job))
    for (const aw of toDestroy) {
      this._destroyWorker(aw)
    }
    this.active = this.active.filter((aw) => newJobs.has(aw.job))

    // Crée les nouveaux workers.
    for (const job of selected) {
      if (!currentJobs.has(job)) {
        const tMs = nowMs + job.phaseOffsetMs
        const pos = commutePos(job.ax, job.ay, job.bx, job.by, tMs, job.speed)
        const aw = this._createWorker(job, pos.x, pos.y)
        this.active.push(aw)
      }
    }
  }

  /**
   * Crée un sprite de worker (+ charge si porteur) à la position initiale.
   */
  private _createWorker(job: WorkerJob, x: number, y: number): ActiveWorker {
    const hasTexture = this.scene.textures.exists(job.textureKey)
    let sprite: Phaser.GameObjects.Sprite
    if (hasTexture) {
      sprite = this.scene.add
        .sprite(x, y, job.textureKey)
        .setScale(0.55)
        .setDepth(DEPTH_WORKER)
    } else {
      // Repli : cercle vert clair (non-menaçant, distinct des ennemis rouges).
      const g = this.scene.add.graphics()
      g.fillStyle(0x88dd66, 1)
      g.fillCircle(0, 0, 12)
      g.lineStyle(2, 0x004400, 1)
      g.strokeCircle(0, 0, 12)
      // Enveloppe dans un sprite de repli (Graphics n'a pas setFrame → utiliser directement).
      // On pose le Graphics comme objet temporaire et on crée un sprite fantôme.
      g.setPosition(x, y).setDepth(DEPTH_WORKER)
      // Pour le type on trompe : on crée un sprite invisible et on stocke le graphics.
      // Simplification : on coerce le Graphics en Sprite (ne sera jamais animé).
      sprite = g as unknown as Phaser.GameObjects.Sprite
    }

    // Charge (prop_s2_dirt miniature) — visible uniquement pour les porteurs.
    let loadSprite: Phaser.GameObjects.Image | null = null
    if (job.role === 'porteur' && this.scene.textures.exists('prop_s2_dirt')) {
      loadSprite = this.scene.add
        .image(x, y - 20, 'prop_s2_dirt')
        .setScale(0.35)
        .setDepth(DEPTH_LOAD)
        .setVisible(false) // sera rendu visible au sync si loadVisible(leg)
    }

    return {
      job,
      sprite,
      loadSprite,
      panicIndicator: null,
      fleeX: x,
      fleeY: y,
      inPanic: false,
      // Seul un vrai Sprite texturé accepte setFrame ; le repli Graphics non.
      animatable: hasTexture
    }
  }

  /** Crée et affiche l'indicateur de panique (panneau « ! » orange pixel) au-dessus du worker. */
  private _showPanicIndicator(aw: ActiveWorker): void {
    if (aw.panicIndicator !== null) {
      // Déjà visible : met juste à jour la position.
      aw.panicIndicator.setPosition(aw.sprite.x, aw.sprite.y - 40)
      return
    }
    // Panneau DA 16-bit orange : fond orange foncé, bordure sombre, « ! » blanc.
    const g = this.scene.add.graphics()
    const w = 16
    const h = 18
    g.fillStyle(PALETTE_HEX.orangeDanger, 1)
    g.fillRect(-w / 2, -h / 2, w, h)
    g.lineStyle(2, PALETTE_HEX.contour, 1)
    g.strokeRect(-w / 2, -h / 2, w, h)

    const txt = this.scene.add.text(0, 0, '!', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5, 0.5)

    const container = this.scene.add.container(
      aw.sprite.x,
      aw.sprite.y - 40,
      [g, txt]
    ).setDepth(DEPTH_PANIC)

    aw.panicIndicator = container
  }

  /** Cache et détruit l'indicateur de panique. */
  private _hidePanicIndicator(aw: ActiveWorker): void {
    if (aw.panicIndicator === null) {
      return
    }
    aw.panicIndicator.destroy()
    aw.panicIndicator = null
  }

  /** Détruit un worker et ses objets graphiques associés. */
  private _destroyWorker(aw: ActiveWorker): void {
    aw.sprite.destroy()
    if (aw.loadSprite !== null) {
      aw.loadSprite.destroy()
    }
    if (aw.panicIndicator !== null) {
      aw.panicIndicator.destroy()
    }
  }

  /** Détruit tous les workers actifs et remet à zéro. */
  private _destroyAll(): void {
    for (const aw of this.active) {
      this._destroyWorker(aw)
    }
    this.active = []
  }

  /**
   * Résout la clé de texture PNJ à utiliser selon le rôle, parmi les feuilles
   * d'ambiance RÉELLEMENT chargées du stage courant (`npcKeys`, fournies par
   * `GameScene` depuis `stage.ambient`). Les clés PNJ sont NUMÉROTÉES par stage
   * (`npc_stage03_*`, `npc_stage04_*`…), pas nommées par phase — d'où l'ancien
   * bug : on cherchait `npc_<phase>_porteur` + un repli `npc_stage02_*` codé en
   * dur, qui ne matchait QUE le stage 02. Ici on matche par indice de rôle dans
   * la clé, avec repli déterministe sur une feuille chargée quelconque.
   *
   * Retourne `null` si AUCUNE feuille chargée (stage sans PNJ / mode lite) →
   * aucun ouvrier créé (jamais de texture manquante → jamais de repli Graphics
   * non animable → jamais de crash `setFrame`).
   */
  private _resolveKey(role: 'porteur' | 'signaleur', npcKeys: readonly string[]): string | null {
    const loaded = npcKeys.filter((k) => this.scene.textures.exists(k))
    if (loaded.length === 0) {
      return null
    }
    // Préfère une feuille dont le nom porte le rôle (le stage 02 nomme
    // explicitement `npc_stage02_porteur`/`_signaleur` ; d'autres nomment
    // `porteur_blocs`, `poseur_cable`…). `patrol` = équivalent signaleur.
    const hints = role === 'porteur' ? ['porteur'] : ['signaleur', 'patrol']
    const match = loaded.find((k) => hints.some((h) => k.includes(h)))
    if (match !== undefined) {
      return match
    }
    // Repli déterministe : porteur → 1re feuille, signaleur → 2e (variété
    // visuelle) — toutes garanties chargées, donc de vrais Sprite animables.
    const idx = role === 'porteur' ? 0 : Math.min(1, loaded.length - 1)
    return loaded[idx] ?? loaded[0] ?? null
  }
}
