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
import { buildSiteLayout, type PlacedCluster } from '@core/siteLayout'
import { buildSitePlan } from '@core/sitePlan'
import { SITE_PROGRAMS } from '@content/sitePrograms'
import { commutePos, loadVisible, panicDecision, pathFollow, fleeVelocity, planNpcJobs, planPathWalkers, PANIC_R } from '@render/workerBehavior'
import { resolveComposedLayout } from '@content/runtimeLayouts'
import type { StageLayout } from '@content/stageLayout'
import { dirRow, idleFrame, walkFrame } from '@render/sprites'
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

/** Vitesse d'un navetteur qui va d'une fouille à l'autre (px/s — marche franche). */
const NAVETTEUR_SPEED = 74

/** Vitesse d'un camion benne sur la piste (px/s — rapide). */
const CAMION_SPEED = 150

/**
 * Échelle UNIQUE de tous les ouvriers à pied (feuilles PNJ 256²).
 * Les feuilles d'ambiance avaient des échelles disparates (0.71 → 1.61) → PNJ
 * « certains minuscules, certains géants ». Ici : une seule taille humaine,
 * cohérente avec le joueur (~99 px).
 */
const WORKER_SCALE = 0.62

/** PNJ posés (compo) : rayon de fuite d'un ouvrier mobile + vitesse (px/s) + retour à l'ancre. */
const NPC_FLEE_R = 240
const NPC_WORKER_SPEED = 90
const NPC_RETURN_SPEED = 40
/**
 * Cadence d'animation du geste d'un PNJ métier (ms/frame). Le NOMBRE de frames
 * est lu directement sur la feuille (les feuilles générées vont de 5 à 12 frames
 * selon le métier), pas codé en dur.
 */
const NPC_GESTURE_PERIOD_MS = 110

/** Amplitude du rebond vertical d'un camion en roulant (px, suspension). */
const CAMION_BOB_PX = 4

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
  /**
   * Rôle du job :
   *  - porteur    : évacue la terre fouille → déblais (charge visible à l'aller)
   *  - signaleur  : flagman à l'entrée (patrouille route)
   *  - navetteur  : va D'UNE FOUILLE À L'AUTRE (marche franche, trajet visible)
   *  - camion     : benne qui roule sur la piste (évacuation) — gros sprite, rapide,
   *                 orienté par flipX, ne panique pas.
   */
  role: 'porteur' | 'signaleur' | 'navetteur' | 'stationnaire' | 'camion' | 'path' | 'path_camion' | 'npc_trade' | 'npc_worker'
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
  /** Polyligne à suivre (rôles 'path'/'path_camion'), en coordonnées MONDE. */
  points?: Array<{ x: number; y: number }>
  /** Pause aux extrémités (rôles 'path'/'path_camion'). */
  pauseMs?: number
  /** Sens unique (rôles 'path'/'path_camion'). */
  oneWay?: boolean
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

  /**
   * Sources de bulles : PNJ actuellement affichés (métier posé ET ouvrier
   * mobile) avec position courante + rôle. Utilisé par la couche « bulles de
   * dialogue » (observer-only) ; `seed` varie par PNJ pour diversifier la pioche.
   */
  getActiveNpcs(): Array<{ x: number; y: number; role: WorkerJob['role']; seed: number }> {
    const out: Array<{ x: number; y: number; role: WorkerJob['role']; seed: number }> = []
    for (let i = 0; i < this.active.length; i++) {
      const aw = this.active[i]
      if (aw === undefined) {
        continue
      }
      out.push({ x: aw.sprite.x, y: aw.sprite.y, role: aw.job.role, seed: (i * 0x9e3779b9) >>> 0 })
    }
    return out
  }

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
      (c) =>
        c.defId === 'cluster_excavation' ||
        c.defId === 'scene_dig_active' ||
        c.defId === 'scene_dig_active_spawn' ||
        c.defId === 'scene_dig_done' ||
        c.defId === 'scene_foundation_pour_spawn' ||
        c.defId === 'scene_formwork_bay_active' ||
        c.defId === 'scene_rebar_ready' ||
        c.defId === 'scene_small_mixer_patch'
    )
    const spoils = layout.clusters.filter(
      (c) =>
        c.defId === 'cluster_spoil' ||
        c.defId === 'scene_spoil' ||
        c.defId === 'scene_stock' ||
        c.defId === 'scene_rebar_stock' ||
        c.defId === 'scene_mixer_waiting'
    )
    const routeClusters = layout.clusters.filter((c) => c.defId === 'cluster_route')

    let jobIdx = 0

    // Un stage AVEC compo sauvée est la VÉRITÉ TOTALE : pas d'auto-peuplement
    // d'ouvriers (porteurs/navetteurs/baseline) ; seuls les PNJ POSÉS + les
    // chemins tracés sont rendus. Sans compo → auto-peuplement (fallback).
    const composed = resolveComposedLayout(stageId)
    if (composed !== null) {
      this._addComposedNpcsAndPaths(composed, worldW, worldH, npcKeys)
      return
    }

    if (stageId === 'fondations') {
      jobIdx = this._addFoundationTradeWorkers(layout.clusters, npcKeys, jobIdx)
    }

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

    // Jobs « navetteur » : un ouvrier va D'UNE FOUILLE À LA SUIVANTE (marche
    // franche, trajet lisible) — remplace l'ancien terrassier qui oscillait sur
    // place (« grand mais bouge à peine »). On apparie chaque fouille à la
    // fouille la PLUS PROCHE (autre qu'elle-même) → va-et-vient entre chantiers.
    for (let i = 0; i < excavations.length; i++) {
      const from = excavations[i]
      if (from === undefined) {
        continue
      }
      // Fouille cible = la plus proche différente de `from`.
      let to = undefined as (typeof excavations)[number] | undefined
      let best = Infinity
      for (let k = 0; k < excavations.length; k++) {
        if (k === i) {
          continue
        }
        const cand = excavations[k]
        if (cand === undefined) {
          continue
        }
        const d = Math.hypot(cand.x - from.x, cand.y - from.y)
        if (d < best) {
          best = d
          to = cand
        }
      }
      if (to === undefined) {
        continue
      }
      const key = this._resolveKey('porteur', npcKeys)
      if (key === null) {
        break
      }
      this.jobs.push({
        textureKey: key,
        role: 'navetteur',
        ax: from.x,
        ay: from.y + 120,
        bx: to.x,
        by: to.y + 120,
        speed: NAVETTEUR_SPEED,
        midX: (from.x + to.x) / 2,
        midY: (from.y + to.y) / 2 + 120,
        phaseOffsetMs: jobIdx * PHASE_OFFSET_MS
      })
      jobIdx++
    }

    // Jobs « camion » : bennes qui roulent sur la PISTE le long du bord SUD de la
    // zone de travail (au niveau de la clôture, pas relégués tout en bas du monde).
    // On lit le rect de la zone signature dans le plan pour caler la voie.
    if (this.scene.textures.exists('prop_s2_truck')) {
      const plan = buildSitePlan(seed, worldW, worldH, stageId)
      const sigId = SITE_PROGRAMS[stageId]?.zones.find((z) => z.signature === true)?.id
      const sigZone = plan?.zones.find((z) => z.id === sigId)
      let laneY: number
      let leftX: number
      let rightX: number
      if (sigZone !== undefined) {
        // Juste au sud de la clôture sud de la fouille (piste de roulage interne).
        laneY = sigZone.cy + sigZone.halfH + 150
        leftX = sigZone.cx - sigZone.halfW + 120
        rightX = sigZone.cx + sigZone.halfW - 120
      } else {
        // Repli (stage sans zone signature) : bande sud du monde.
        const routeY = routeClusters[0]?.y ?? worldH - 350
        laneY = routeY - 40
        leftX = worldW * 0.18
        rightX = worldW * 0.82
      }
      for (let t = 0; t < 3; t++) {
        // 3 camions décalés en phase → un flux continu le long de la piste.
        this.jobs.push({
          textureKey: 'prop_s2_truck',
          role: 'camion',
          ax: leftX,
          ay: laneY,
          bx: rightX,
          by: laneY,
          speed: CAMION_SPEED,
          midX: (leftX + rightX) / 2,
          midY: laneY,
          phaseOffsetMs: t * 5200
        })
        jobIdx++
      }
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

    // Jobs « navetteur BASELINE » : si AUCUNE fouille reconnue (stages legacy
    // 04-10 / terrain_vierge), faire naviguer des ouvriers entre clusters
    // quelconques → une population cohérente PARTOUT (fini les stages sans vie
    // après suppression des vieux PNJ errants).
    if (excavations.length === 0) {
      const anchors = layout.clusters.filter((c) => c.defId !== 'cluster_route')
      const count = Math.min(anchors.length, 8)
      for (let i = 0; i < count; i++) {
        const from = anchors[i]
        const to = anchors[(i + 1) % anchors.length]
        if (from === undefined || to === undefined || from === to) {
          continue
        }
        const key = this._resolveKey('porteur', npcKeys)
        if (key === null) {
          break
        }
        this.jobs.push({
          textureKey: key,
          role: 'navetteur',
          ax: from.x,
          ay: from.y,
          bx: to.x,
          by: to.y,
          speed: NAVETTEUR_SPEED,
          midX: (from.x + to.x) / 2,
          midY: (from.y + to.y) / 2,
          phaseOffsetMs: jobIdx * PHASE_OFFSET_MS
        })
        jobIdx++
      }
    }

  }

  /**
   * Stage COMPOSÉ : ajoute les PNJ posés (métier fixe / ouvrier mobile) puis les
   * suiveurs de chemin (worker_path / truck_path). AUCUN auto-peuplement.
   */
  private _addComposedNpcsAndPaths(composed: StageLayout, worldW: number, worldH: number, npcKeys: readonly string[]): void {
    let jobIdx = 0
    const offX = worldW / 2
    const offY = worldH / 2

    for (const nj of planNpcJobs(composed, worldW, worldH)) {
      if (!this.scene.textures.exists(nj.skin)) {
        continue
      }
      this.jobs.push({
        textureKey: nj.skin, role: nj.role,
        ax: nj.x, ay: nj.y, bx: nj.x, by: nj.y, speed: 0,
        midX: nj.x, midY: nj.y, phaseOffsetMs: jobIdx * PHASE_OFFSET_MS
      })
      jobIdx++
    }

    // Un chemin porte N marcheurs ÉTALÉS : le calcul (pur) vit dans
    // `planPathWalkers` ; ici on ne fait que créer un sprite par plan.
    //
    // DEUX décalages se composent, et ils ne font pas le même travail :
    //  - `plan.phaseMs` étale les marcheurs D'UN MÊME chemin (cycle/count) ;
    //  - `pathBase` désynchronise les chemins ENTRE EUX — sans lui, tous les
    //    chemins à 1 marcheur démarreraient à la phase 0 et deux pistes
    //    parallèles avanceraient au pas cadencé (l'ancien `jobIdx * PHASE_OFFSET_MS`
    //    le faisait déjà ; le perdre serait une régression de variété).
    const pathBases = new Map<string, number>()
    for (const plan of planPathWalkers(composed, worldW, worldH)) {
      if (!pathBases.has(plan.pathId)) {
        pathBases.set(plan.pathId, pathBases.size * PHASE_OFFSET_MS)
      }
      const pathBase = pathBases.get(plan.pathId) ?? 0
      const isTruck = plan.type === 'truck_path'
      // Skin explicite > défaut de la famille. Un skin absent des textures
      // chargées retombe sur le défaut : jamais d'écran vide, jamais de crash.
      const wanted = plan.skin !== null && this.scene.textures.exists(plan.skin)
        ? plan.skin
        : (isTruck ? 'prop_s2_truck' : this._resolveKey('porteur', npcKeys))
      if (wanted === null || !this.scene.textures.exists(wanted)) {
        // Rien à afficher (stage sans sprite camion). L'inspecteur de l'éditeur
        // AVERTIT en amont — ici on ne peut que ne rien créer.
        continue
      }
      const first = plan.points[0] ?? { x: offX, y: offY }
      const mid = plan.points[Math.floor(plan.points.length / 2)] ?? first
      this.jobs.push({
        textureKey: wanted, role: isTruck ? 'path_camion' : 'path',
        ax: first.x, ay: first.y, bx: first.x, by: first.y,
        speed: plan.speed,
        midX: mid.x, midY: mid.y,
        phaseOffsetMs: pathBase + plan.phaseMs,
        points: plan.points,
        pauseMs: plan.pauseMs,
        oneWay: plan.oneWay
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

      // Camion : roule sur la piste, ne panique pas, orienté par flipX
      // (asset de profil — R-I : on respecte le sens de circulation). Un léger
      // rebond vertical (suspension) donne le sentiment qu'il ROULE.
      if (job.role === 'camion') {
        const bob = Math.sin(tMs / 150) * CAMION_BOB_PX
        aw.sprite.setPosition(pos.x, pos.y + bob)
        const goingRight = pos.leg === 'ab'
        aw.sprite.setFlipX(!goingRight)
        continue
      }

      // Suivi de CHEMIN composé (éditeur) : polyligne A→B→C, sans panique
      // (route assignée). Camion = bob + flip ; ouvrier = anim de marche.
      if (job.role === 'path' || job.role === 'path_camion') {
        const pf = pathFollow(job.points ?? [], tMs, job.speed, {
          pauseMs: job.pauseMs ?? 0,
          oneWay: job.oneWay === true
        })
        // Sens unique : le marcheur est SORTI — on le cache au lieu de le
        // téléporter à vue du bout au départ.
        aw.sprite.setVisible(pf.visible)
        if (!pf.visible) {
          continue
        }
        if (job.role === 'path_camion') {
          const bob = Math.sin(tMs / 150) * CAMION_BOB_PX
          aw.sprite.setPosition(pf.x, pf.y + bob)
          aw.sprite.setFlipX(pf.dirX < 0)
        } else {
          aw.sprite.setPosition(pf.x, pf.y)
          if (aw.animatable) {
            aw.sprite.setFrame(walkFrame(dirRow(pf.dirX, pf.dirY), nowMs, 250))
          }
        }
        continue
      }

      // PNJ posés (compo) — métier FIXE animé / ouvrier MOBILE qui fuit.
      if (job.role === 'npc_trade') {
        aw.sprite.setPosition(job.ax, job.ay)
        if (aw.animatable) {
          // Nombre de frames RÉEL de la feuille (Phaser compte le frame `__BASE`
          // en plus → -1). Défile tout le geste, quel que soit le métier.
          const total = Math.max(1, aw.sprite.texture.frameTotal - 1)
          aw.sprite.setFrame(Math.floor(nowMs / NPC_GESTURE_PERIOD_MS) % total)
        }
        continue
      }
      if (job.role === 'npc_worker') {
        const flee = fleeVelocity({ x: aw.fleeX, y: aw.fleeY }, enemies, NPC_FLEE_R, NPC_WORKER_SPEED)
        const frameMs = Math.min(this.scene.game.loop.delta, 100) / 1000
        let dirX = flee.vx
        let dirY = flee.vy
        if (flee.vx !== 0 || flee.vy !== 0) {
          aw.fleeX = Phaser.Math.Clamp(aw.fleeX + flee.vx * frameMs, 0, this.worldW)
          aw.fleeY = Phaser.Math.Clamp(aw.fleeY + flee.vy * frameMs, 0, this.worldH)
        } else {
          // Aucun ennemi proche : retour lent vers l'ancre (pas d'errance infinie).
          const rx = job.ax - aw.fleeX
          const ry = job.ay - aw.fleeY
          const rd = Math.hypot(rx, ry)
          if (rd > 8) {
            const step = Math.min(NPC_RETURN_SPEED * frameMs, rd)
            aw.fleeX += (rx / rd) * step
            aw.fleeY += (ry / rd) * step
            dirX = rx
            dirY = ry
          }
        }
        aw.sprite.setPosition(aw.fleeX, aw.fleeY)
        if (aw.animatable) {
          aw.sprite.setFrame(dirX !== 0 || dirY !== 0 ? walkFrame(dirRow(dirX, dirY), nowMs, 200) : idleFrame(dirRow(0, 1)))
        }
        continue
      }

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

  get workerDebugInfo(): {
    count: number
    workers: { role: string; texture: string; x: number; y: number }[]
  } {
    return {
      count: this.active.length,
      workers: this.active.map((aw) => ({
        role: aw.job.role,
        texture: aw.job.textureKey,
        x: Math.round(aw.sprite.x),
        y: Math.round(aw.sprite.y)
      }))
    }
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
    // Camion = gros engin (image mono-frame) ; ouvrier = petite silhouette.
    const isCamion = job.role === 'camion' || job.role === 'path_camion'
    let sprite: Phaser.GameObjects.Sprite
    if (hasTexture) {
      sprite = this.scene.add
        .sprite(x, y, job.textureKey)
        .setScale(isCamion ? 1.0 : WORKER_SCALE)
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

    // Charge miniature — visible uniquement pour les porteurs.
    let loadSprite: Phaser.GameObjects.Image | null = null
    const loadKey = this.scene.textures.exists('prop_s2_dirt')
      ? 'prop_s2_dirt'
      : (this.scene.textures.exists('prop_stage03_rebar') ? 'prop_stage03_rebar' : null)
    if (job.role === 'porteur' && loadKey !== null) {
      loadSprite = this.scene.add
        .image(x, y - 20, loadKey)
        .setScale(loadKey === 'prop_stage03_rebar' ? 0.28 : 0.35)
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
      // Seul un vrai Sprite texturé de type feuille de marche accepte setFrame.
      // Le camion (image mono-frame) et le repli Graphics ne sont PAS animables.
      animatable: hasTexture && !isCamion
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

  private _addFoundationTradeWorkers(
    clusters: readonly PlacedCluster[],
    npcKeys: readonly string[],
    startIdx: number
  ): number {
    const sig = clusters.find((c) => c.defId === 'scene_foundation_pour_spawn')
    if (sig === undefined) {
      return startIdx
    }

    const posts = [
      { textureKey: 'npc_stage03_betonnier', dx: 245, dy: 110 },
      { textureKey: 'npc_stage03_coffreur', dx: -210, dy: 140 },
      { textureKey: 'npc_stage03', dx: -92, dy: 88 },
    ] as const

    let jobIdx = startIdx
    for (const post of posts) {
      const key = this._resolveExactKey(post.textureKey, npcKeys)
      if (key === null) {
        continue
      }
      const x = sig.x + post.dx
      const y = sig.y + post.dy
      this.jobs.push({
        textureKey: key,
        role: 'stationnaire',
        ax: x,
        ay: y,
        bx: x,
        by: y,
        speed: 1,
        midX: x,
        midY: y,
        phaseOffsetMs: jobIdx * PHASE_OFFSET_MS
      })
      jobIdx++
    }
    return jobIdx
  }

  private _resolveExactKey(textureKey: string, npcKeys: readonly string[]): string | null {
    if (npcKeys.includes(textureKey) && this.scene.textures.exists(textureKey)) {
      return textureKey
    }
    return null
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
