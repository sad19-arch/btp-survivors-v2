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
    // 2. Pistes de roulage (R-G) : BANDE LARGE de terre compactée (un camion doit
    //    passer) — un aplat sobre + traces de roues, PAS de ruban rayé orange.
    for (const p of plan.paths) {
      this.drawRoad(p)
    }
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
  private drawRoad(seg: PlanSeg): void {
    const dx = seg.x2 - seg.x1
    const dy = seg.y2 - seg.y1
    const len = Math.hypot(dx, dy)
    if (len < 1) {
      return
    }
    const ROAD_W = 300
    const ang = Math.atan2(dy, dx)
    const midX = (seg.x1 + seg.x2) / 2
    const midY = (seg.y1 + seg.y2) / 2
    // Aplat de terre roulée (un peu plus foncé/tassé que le sol), coins arrondis.
    const band = this.scene.add
      .rectangle(midX, midY, len + ROAD_W, ROAD_W, 0x6b4f33, 0.5)
      .setDepth(-9.3)
    if (ang !== 0) {
      band.setRotation(ang)
    }
    this.planObjects.push(band)
    // Traces de roues TRÈS discrètes sur l'axe (sinon, tuilées, elles lisent
    // comme des blocs bruns — R-D). Une seule file, faible alpha, clairsemées.
    if (this.scene.textures.exists('decal_s2_tracks')) {
      const step = 300
      const n = Math.max(1, Math.round(len / step))
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const x = seg.x1 + dx * t
        const y = seg.y1 + dy * t
        const img = this.scene.add.image(x, y, 'decal_s2_tracks').setScale(0.85).setAlpha(0.22).setDepth(-9.2)
        if (ang !== 0) {
          img.setRotation(ang)
        }
        this.planObjects.push(img)
      }
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
