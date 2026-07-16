/**
 * SiteRenderer — module observateur du terrain tactique (T5).
 *
 * Dessine les clusters (fosses, clôtures, engins, route, portail…) aux MÊMES
 * positions que la sim, en appelant `buildSiteLayout` avec le même triplet
 * (seed, worldW, worldH, stageId). Rendu pur : ne touche jamais src/core.
 *
 * CONTRAINTE ARCHITECTURE (règle 🔴) :
 *   Ce module ne contient QUE du rendu observateur.
 *   `GameScene` instancie et délègue via `this.siteRenderer.reset(seed, stageId)`.
 *   La logique de placement est 100 % dans `buildSiteLayout` (src/core).
 *
 * Profondeurs DA :
 *   -9   décalques / route / traces au sol
 *   -6   props « none » (tas de terre, engins décoratifs)
 *   -5   structures collidables (fosse, clôture, portail)
 *
 * Clôtures (segments) : le sprite est positionné au milieu du segment
 * et orienté avec `setRotation(atan2(y2, x2))` pour couvrir la ligne de collision.
 * Le panneau de clôture est horizontal par défaut — la rotation l'aligne.
 */

import Phaser from 'phaser'
import { buildSiteLayout } from '@core/siteLayout'
import { buildSitePlan } from '@core/sitePlan'
import type { PlanSeg } from '@core/sitePlan'
import { CLUSTERS } from '@content/clusters'
import type { ClusterElement } from '@content/clusters'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de profondeur DA 16-bit
// ─────────────────────────────────────────────────────────────────────────────

/** Décalques au sol (route, traces) — sous les props. */
const DEPTH_DECAL = -9

/** Props décoratifs sans collision (tas de terre, engins). */
const DEPTH_PROP = -6

/** Structures collidables (fosse, clôture, portail). */
const DEPTH_STRUCT = -5

interface RoadStyle {
  width: number
  alpha: number
}

function roadStyleFor(stageId: string): RoadStyle {
  if (stageId === 'fondations') {
    return { width: 36, alpha: 0.1 }
  }
  return { width: 300, alpha: 0.5 }
}

/**
 * Retourne la profondeur d'affichage d'un élément de cluster.
 *
 * `elem.layer` fait foi quand il est présent. Sinon on retombe sur l'ancienne
 * déduction par PRÉFIXE DE CLÉ, conservée pour le contenu hérité — mais c'est
 * elle le bug d'origine : `piste_strip` est un décal qui ne commence ni par
 * `road_` ni par `decal_`, et s'affichait donc à hauteur de prop. Tout nouvel
 * asset plat DOIT porter `layer: 'decal'` plutôt que d'espérer le bon préfixe.
 */
function depthFor(elem: ClusterElement): number {
  switch (elem.layer) {
    case 'decal': return DEPTH_DECAL
    case 'struct': return DEPTH_STRUCT
    case 'prop': return DEPTH_PROP
    default: break
  }
  const k = elem.assetKey
  if (k.startsWith('road_') || k.startsWith('decal_')) {
    return DEPTH_DECAL
  }
  if (elem.collide !== 'none') {
    return DEPTH_STRUCT
  }
  return DEPTH_PROP
}

// ─────────────────────────────────────────────────────────────────────────────
// SiteRenderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classe de rendu observateur des clusters de chantier.
 * Instanciée par `GameScene.create()` ; réinitialisée par `reset()` à chaque
 * nouvelle partie (même instance de scène réutilisée via `scene.restart`).
 */
export class SiteRenderer {
  /** Sprites des clusters posés — détruits et recréés à chaque `reset()`. */
  private sprites: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Sprite> = []

  /** Objets du plan masse (clôtures/pistes/terre excavée) — même cycle de vie. */
  private planObjects: Phaser.GameObjects.GameObject[] = []

  private siteOverlays: Phaser.GameObjects.GameObject[] = []

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * (Re)construit le rendu des clusters pour le stage courant.
   * Doit être appelé depuis `GameScene.create()` (ou équivalent).
   *
   * @param seed    Seed de la partie (MÊME que celui passé à la sim).
   * @param worldW  Largeur du monde (px).
   * @param worldH  Hauteur du monde (px).
   * @param stageId Identifiant de la phase (ex. 'terrassement').
   */
  reset(seed: number, worldW: number, worldH: number, stageId: string): void {
    // Nettoyage sans fuite : on détruit tous les sprites posés lors de la run précédente.
    for (const sp of this.sprites) {
      sp.destroy()
    }
    this.sprites = []
    for (const o of this.planObjects) {
      o.destroy()
    }
    this.planObjects = []
    for (const o of this.siteOverlays) {
      o.destroy()
    }
    this.siteOverlays = []

    // Plan masse (stages programmés) : terre excavée + pistes + panneaux de clôture.
    // MÊME source déterministe que la sim (les obstacles viennent des mêmes segments).
    const plan = buildSitePlan(seed, worldW, worldH, stageId)
    if (plan !== null) {
      this.drawPlan(plan, stageId)
    }

    // Calcule le même layout que la sim (déterministe).
    const layout = buildSiteLayout(seed, worldW, worldH, stageId)

    if (layout.clusters.length === 0) {
      // Pas de clusters pour ce stage → rien à dessiner.
      return
    }

    for (const placed of layout.clusters) {
      // Éléments : inline (compo éditeur) sinon le ClusterDef. Rien à dessiner sinon.
      const def = CLUSTERS[placed.defId]
      const elements = placed.elements ?? def?.elements
      if (elements === undefined) {
        continue
      }

      // Transform de la scène ENTIÈRE (compos éditeur) : miroir puis rotation.
      // Identité (flip=false, rot=0) → placement bit-à-bit comme avant.
      const flip = placed.flipX === true
      const rot = ((placed.rotationDeg ?? 0) * Math.PI) / 180
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      const tx = (vx: number, vy: number): number => (flip ? -vx : vx) * cos - vy * sin
      const ty = (vx: number, vy: number): number => (flip ? -vx : vx) * sin + vy * cos

      for (const elem of elements) {
        // Vérifier que la texture est chargée (repli silencieux si absente).
        if (!this.scene.textures.exists(elem.assetKey)) {
          continue
        }

        const ax = placed.x + tx(elem.dx, elem.dy)
        const ay = placed.y + ty(elem.dx, elem.dy)

        const shape = elem.shape

        // Segments (clôtures) : positionner au milieu et orienter selon le segment.
        if (shape !== undefined && shape.kind === 'segment') {
          const vx2 = tx(shape.x2, shape.y2)
          const vy2 = ty(shape.x2, shape.y2)
          const mx = ax + vx2 / 2
          const my = ay + vy2 / 2
          const angle = Math.atan2(vy2, vx2)

          const sp = this.scene.add
            .image(mx, my, elem.assetKey)
            .setScale(elem.scale)
            .setDepth(depthFor(elem))
            .setRotation(angle)

          this.sprites.push(sp)
        } else if (elem.animation !== undefined) {
          const animationKey = `site_${elem.assetKey}`
          if (!this.scene.anims.exists(animationKey)) {
            this.scene.anims.create({
              key: animationKey,
              frames: this.scene.anims.generateFrameNumbers(elem.assetKey),
              frameRate: elem.animation.frameRate,
              repeat: -1,
            })
          }
          const sp = this.scene.add
            .sprite(ax, ay, elem.assetKey, 0)
            .setScale(elem.scale)
            .setDepth(depthFor(elem))
            .setFlipX(flip !== (elem.flipX === true))
            .setRotation(rot + (elem.rotation ?? 0))
          sp.play(animationKey)
          this.sprites.push(sp)
        } else {
          // Cercle ou décoration sans collision : placement direct à (ax, ay).
          const sp = this.scene.add
            .image(ax, ay, elem.assetKey)
            .setScale(elem.scale)
            .setDepth(depthFor(elem))
            .setFlipX(flip !== (elem.flipX === true))
            .setRotation(rot + (elem.rotation ?? 0))

          this.sprites.push(sp)
        }
      }

      if (stageId === 'fondations' && placed.defId === 'scene_foundation_pour_spawn') {
        this.drawFoundationPumpFlow(placed.x, placed.y)
      }
    }
  }

  private drawFoundationPumpFlow(cx: number, cy: number): void {
    const g = this.scene.add.graphics()
    g.setDepth(DEPTH_PROP + 0.55)

    const drawPolyline = (
      points: Array<{ x: number; y: number }>,
      outlineWidth: number,
      innerWidth: number,
      innerColor: number
    ): void => {
      if (points.length < 2) {
        return
      }
      const [first, ...rest] = points
      if (first === undefined) {
        return
      }
      g.lineStyle(outlineWidth, 0x141018, 0.96)
      g.beginPath()
      g.moveTo(first.x, first.y)
      for (const point of rest) {
        g.lineTo(point.x, point.y)
      }
      g.strokePath()

      g.lineStyle(innerWidth, innerColor, 1)
      g.beginPath()
      g.moveTo(first.x, first.y)
      for (const point of rest) {
        g.lineTo(point.x, point.y)
      }
      g.strokePath()
    }

    drawPolyline(
      [
        { x: cx + 128, y: cy + 58 },
        { x: cx + 104, y: cy - 12 },
        { x: cx + 40, y: cy - 28 },
        { x: cx + 4, y: cy + 48 },
      ],
      13,
      8,
      0xf2b43d
    )
    drawPolyline(
      [
        { x: cx + 4, y: cy + 48 },
        { x: cx - 8, y: cy + 72 },
      ],
      9,
      5,
      0x4a4b52
    )

    drawPolyline(
      [
        { x: cx + 286, y: cy + 122 },
        { x: cx + 230, y: cy + 118 },
        { x: cx + 185, y: cy + 122 },
      ],
      12,
      7,
      0xb8b4aa
    )

    g.fillStyle(0x3b3834, 0.98)
    g.fillRect(cx + 170, cy + 111, 26, 22)
    g.lineStyle(4, 0x000000, 1)
    g.strokeRect(cx + 170, cy + 111, 26, 22)

    g.fillStyle(0x9c9a93, 0.9)
    g.fillCircle(cx - 8, cy + 77, 12)
    g.fillStyle(0xd2d0ca, 0.72)
    g.fillCircle(cx - 10, cy + 74, 5)

    this.siteOverlays.push(g)
  }

  /**
   * Dessine le plan masse : terre excavée sous les fouilles, pistes de
   * roulage le long des chemins, panneaux de clôture le long des anneaux
   * (les ouvertures restent vides — les poteaux les encadrent).
   */
  private drawPlan(plan: NonNullable<ReturnType<typeof buildSitePlan>>, stageId: string): void {
    // 1. Terre excavée : patch sombre sous chaque zone d'excavation.
    for (const z of plan.zones) {
      if (z.role !== 'excavation') {
        continue
      }
      const rect = this.scene.add
        .rectangle(z.cx, z.cy, z.halfW * 2 - 60, z.halfH * 2 - 60, 0x5b3f28, 0.42)
        .setDepth(-9.4)
      this.planObjects.push(rect)
    }
    // 2. Pistes de roulage (R-G) : BANDE LARGE de terre compactée (un camion doit
    //    passer) — un aplat sobre, PAS de ruban rayé orange.
    const roadStyle = roadStyleFor(stageId)
    for (const p of plan.paths) {
      this.drawRoad(p, roadStyle)
    }
    // 2b. Panneau d'interdiction au portail.
    this.drawGateSign(plan.gate)
    // 3. Clôtures : panneaux TOUJOURS DEBOUT (R-H : jamais de rotation → sinon
    //    ils se couchent au sol). Le panneau porte déjà ses plots béton → PAS de
    //    poteau ajouté. On les stepe le long du segment ; sur un run vertical ils
    //    se chevauchent en profondeur et lisent comme une ligne de clôture.
    if (this.scene.textures.exists('fence_panel')) {
      for (const f of plan.fences) {
        this.tileUpright(f, 'fence_panel', 1.0, 96, -5)
      }
    }
  }

  /**
   * Tuile un asset DEBOUT le long d'un segment, sans jamais le faire pivoter
   * (préserve le point de vue 3/4). Depth = base − y/1e6 pour un tri correct
   * (les panneaux du bas passent devant ceux du haut).
   */
  private tileUpright(seg: PlanSeg, key: string, scale: number, step: number, depth: number): void {
    const dx = seg.x2 - seg.x1
    const dy = seg.y2 - seg.y1
    const len = Math.hypot(dx, dy)
    const n = Math.max(1, Math.round(len / step))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const x = seg.x1 + dx * t
      const y = seg.y1 + dy * t
      const img = this.scene.add
        .image(x, y, key)
        .setScale(scale)
        .setDepth(depth + y / 1_000_000)
      this.planObjects.push(img)
    }
  }

  /**
   * Piste de roulage : aplat de terre compactée LARGE (~300 px) le long du
   * segment + traces de roues clairsemées. Sobre (pas de ruban rayé) mais
   * assez large pour qu'un camion passe (R-G).
   */
  private drawRoad(seg: PlanSeg, style: RoadStyle): void {
    const dx = seg.x2 - seg.x1
    const dy = seg.y2 - seg.y1
    const len = Math.hypot(dx, dy)
    if (len < 1) {
      return
    }
    const roadW = style.width
    const ang = Math.atan2(dy, dx)
    const midX = (seg.x1 + seg.x2) / 2
    const midY = (seg.y1 + seg.y2) / 2
    // Aplat de terre roulée (un peu plus foncé/tassé que le sol), coins arrondis.
    const band = this.scene.add
      .rectangle(midX, midY, len + roadW, roadW, 0x6b4f33, style.alpha)
      .setDepth(-9.3)
    if (ang !== 0) {
      band.setRotation(ang)
    }
    this.planObjects.push(band)
    // NB : pas de décalque de traces sur la piste (tuilé il lisait comme des
    // blocs bruns au mauvais sens — R-I). La VIE de la piste vient des camions
    // bennes MOBILES (SiteWorkers), pas d'un décalque statique.
  }

  /**
   * Panneau « CHANTIER INTERDIT AU PUBLIC » planté à côté du portail (world-space,
   * DA 16-bit : panneau sombre, bordure noire, texte jaune). Face au joueur qui
   * arrive par la route sud.
   */
  private drawGateSign(gate: { x: number; y: number }): void {
    const sx = gate.x + 260
    const sy = gate.y - 40
    const w = 300
    const h = 78
    const panel = this.scene.add
      .rectangle(sx, sy, w, h, 0x241a10, 0.96)
      .setStrokeStyle(5, 0x000000, 1)
      .setDepth(1.5)
    const txt = this.scene.add
      .text(sx, sy, 'CHANTIER INTERDIT\nAU PUBLIC', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffb424',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(1.6)
    // Pied de panneau (petit poteau sombre sous le panneau).
    const post = this.scene.add.rectangle(sx, sy + h / 2 + 22, 12, 44, 0x1a130b, 1).setDepth(1.4)
    this.planObjects.push(panel, txt, post)
  }

  /**
   * Sync de frame — les clusters sont STATIQUES (dessinés au reset, pas
   * reconstruits chaque frame). Méthode vide maintenue pour l'uniformité
   * des modules de rendu (pattern constructor/reset/sync/dispose).
   */
  sync(): void {
    // Statique — rien à faire par frame.
  }

  /**
   * Libère tous les sprites (Phaser les détruit aussi au shutdown, mais on
   * nettoie explicitement pour éviter la fuite entre restarts dans la même scène).
   */
  dispose(): void {
    for (const sp of this.sprites) {
      sp.destroy()
    }
    this.sprites = []
    for (const o of this.planObjects) {
      o.destroy()
    }
    this.planObjects = []
    for (const o of this.siteOverlays) {
      o.destroy()
    }
    this.siteOverlays = []
  }

  /** Nombre de sprites actuellement actifs (sonde de test). */
  get spriteCount(): number {
    return this.sprites.length
  }

  /** Nombre d'objets du plan masse (clôtures/pistes/terre) — sonde de test. */
  get planObjectCount(): number {
    return this.planObjects.length
  }
}
