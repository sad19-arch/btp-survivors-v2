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

/**
 * Retourne la profondeur d'affichage pour un élément de cluster selon son
 * assetKey et son collide. Règle :
 *   - assetKey contenant 'road' ou 'decal' → DEPTH_DECAL (-9)
 *   - collide !== 'none'                   → DEPTH_STRUCT (-5)
 *   - sinon                                → DEPTH_PROP   (-6)
 */
function depthFor(elem: ClusterElement): number {
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
  private sprites: Phaser.GameObjects.Image[] = []

  /** Objets du plan masse (clôtures/pistes/terre excavée) — même cycle de vie. */
  private planObjects: Phaser.GameObjects.GameObject[] = []

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

    // Plan masse (stages programmés) : terre excavée + pistes + panneaux de clôture.
    // MÊME source déterministe que la sim (les obstacles viennent des mêmes segments).
    const plan = buildSitePlan(seed, worldW, worldH, stageId)
    if (plan !== null) {
      this.drawPlan(plan)
    }

    // Calcule le même layout que la sim (déterministe).
    const layout = buildSiteLayout(seed, worldW, worldH, stageId)

    if (layout.clusters.length === 0) {
      // Pas de clusters pour ce stage → rien à dessiner.
      return
    }

    for (const placed of layout.clusters) {
      const def = CLUSTERS[placed.defId]
      if (def === undefined) {
        continue
      }

      for (const elem of def.elements) {
        // Vérifier que la texture est chargée (repli silencieux si absente).
        if (!this.scene.textures.exists(elem.assetKey)) {
          continue
        }

        const ax = placed.x + elem.dx
        const ay = placed.y + elem.dy

        const shape = elem.shape

        // Segments (clôtures) : positionner au milieu et orienter selon le segment.
        if (shape !== undefined && shape.kind === 'segment') {
          // Centre du segment (les coordonnées de shape sont locales à dx/dy).
          const mx = ax + shape.x2 / 2
          const my = ay + shape.y2 / 2
          const angle = Math.atan2(shape.y2, shape.x2)

          const sp = this.scene.add
            .image(mx, my, elem.assetKey)
            .setScale(elem.scale)
            .setDepth(depthFor(elem))
            .setRotation(angle)

          this.sprites.push(sp)
        } else {
          // Cercle ou décoration sans collision : placement direct à (ax, ay).
          const sp = this.scene.add
            .image(ax, ay, elem.assetKey)
            .setScale(elem.scale)
            .setDepth(depthFor(elem))

          this.sprites.push(sp)
        }
      }
    }
  }

  /**
   * Dessine le plan masse : terre excavée sous les fouilles, pistes de
   * roulage le long des chemins, panneaux de clôture le long des anneaux
   * (les ouvertures restent vides — les poteaux les encadrent).
   */
  private drawPlan(plan: NonNullable<ReturnType<typeof buildSitePlan>>): void {
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
    // 2. Pistes : bandes de roulage continues le long des chemins.
    if (this.scene.textures.exists('road_strip')) {
      for (const p of plan.paths) {
        this.tileAlong(p, 'road_strip', 0.8, 104, -9.1)
      }
    }
    // 3. Clôtures : panneaux tuilés le long des segments, poteaux aux extrémités
    //    (ils encadrent naturellement les ouvertures).
    const hasPanel = this.scene.textures.exists('fence_panel')
    const hasPost = this.scene.textures.exists('fence_post')
    for (const f of plan.fences) {
      if (hasPanel) {
        this.tileAlong(f, 'fence_panel', 1.0, 78, -5)
      }
      if (hasPost) {
        for (const end of [
          { x: f.x1, y: f.y1 },
          { x: f.x2, y: f.y2 },
        ]) {
          const post = this.scene.add.image(end.x, end.y, 'fence_post').setScale(0.85).setDepth(-5)
          this.planObjects.push(post)
        }
      }
    }
  }

  /** Tuile un asset le long d'un segment (orienté selon le segment). */
  private tileAlong(seg: PlanSeg, key: string, scale: number, step: number, depth: number): void {
    const dx = seg.x2 - seg.x1
    const dy = seg.y2 - seg.y1
    const len = Math.hypot(dx, dy)
    const ang = Math.atan2(dy, dx)
    const n = Math.max(1, Math.round(len / step))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const img = this.scene.add
        .image(seg.x1 + dx * t, seg.y1 + dy * t, key)
        .setScale(scale)
        .setDepth(depth)
      if (ang !== 0) {
        img.setRotation(ang)
      }
      this.planObjects.push(img)
    }
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
