import Phaser from 'phaser'
import type { AppViewState } from '@/app/appState'
import type { PickupKind } from '@core/types'
import { PALETTE_HEX } from '@ui/palette'
import { dirRow, walkFrame } from '@render/sprites'
import { FINAL_BOSS_SKIN, type StageRender } from '@render/stages'
import { computeHitEvents } from '@render/hitDiff'
import { hitFlashUntil, DamageNumberPool } from '@render/damageNumbers'
import { SpritePool } from '@render/spritePool'
import { VfxManager } from '@render/scenes/vfxManager'

/** Sprite de personnage : feuille pixel-art si l'asset existe, sinon cercle de repli. */
type CharSprite = Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc

/** Échelle par défaut d'un personnage sans échelle de skin dédiée. */
const DEFAULT_CHAR_SCALE = 0.516

/** Sprites de projectiles par type d'arme (spin = rotation continue ; faceVel = orienté vers la vitesse). */
const PROJ_SPRITE: Record<string, { key: string; scale: number; spin: boolean; faceVel: boolean }> = {
  scie: { key: 'proj_scie', scale: 0.8, spin: true, faceVel: false },
  cloueur: { key: 'proj_cloueur', scale: 0.8, spin: false, faceVel: true },
  // Armes Phase A (Persos) — sprites dédiés PixelLab (A2 lot 2).
  boulons: { key: 'proj_boulons', scale: 0.55, spin: false, faceVel: true },
  tempete_boulons: { key: 'proj_boulons', scale: 0.55, spin: false, faceVel: true },
  cle_molette: { key: 'proj_cle', scale: 0.7, spin: true, faceVel: false },
  cle_choc: { key: 'proj_cle', scale: 0.7, spin: true, faceVel: false },
  // B3 : réutilise l'icône de carte brouette (plus reconnaissable qu'un bloc de granit).
  brouette: { key: 'icon_brouette', scale: 0.45, spin: false, faceVel: true },
  transpalette: { key: 'icon_brouette', scale: 0.55, spin: false, faceVel: true },
}
/**
 * Sprites de pickups par type. Typé `Record<PickupKind, …>` : le compilateur
 * EXIGE une entrée pour chaque type de pickup du cœur — ajouter un `PickupKind`
 * sans sprite ici devient une erreur `tsc` (garde-fou : c'est l'oubli de
 * `coffre` qui rendait le coffre d'évolution invisible, cf. playtest).
 */
const PICKUP_SPRITE: Record<PickupKind, { key: string; scale: number }> = {
  // B4 : gemmes plus grosses (visuel seul, hitbox core inchangée).
  xp: { key: 'pickup_xp', scale: 0.8 },
  heal: { key: 'pickup_health', scale: 0.55 },
  magnet: { key: 'pickup_magnet', scale: 0.55 },
  chest: { key: 'pickup_crate', scale: 0.6 },
  // Coffre d'évolution (boss mi-parcours) : réutilise la caisse, un cran plus
  // gros que `chest` pour marquer le moment d'évolution.
  coffre: { key: 'pickup_crate', scale: 0.72 },
}

const ENEMY_COLOR = 0xe74c3c
const ENEMY_RADIUS = 12
const PROJECTILE_COLOR = 0xf5c542
const PROJECTILE_RADIUS = 5
const PICKUP_COLOR = 0x3ddc84
const PICKUP_RADIUS = 5
/**
 * Nombre maximum de chiffres de dégâts + pops d'impact ALLOUANTS émis par frame.
 * Au-delà de ce plafond, les émissions sont silencieusement ignorées (le hit-flash
 * tint, lui, n'est PAS capé — il n'alloue rien).
 */
export const FEEDBACK_MAX_PER_FRAME = 16

/**
 * Rendu de la HORDE (ennemis, hazards/goudron, projectiles, pickups/coffres/gemmes),
 * extrait de GameScene pour l'alléger. Détient toutes les Maps de sprites d'entités
 * + leur culling + le feedback de coup (flash/chiffres/pop). Observer-only : lit
 * l'état exposé, ne touche jamais la simulation. Une instance FRAÎCHE est créée à
 * chaque `create()` de la scène (les GameObjects sont détruits au shutdown Phaser ;
 * réutiliser une instance rendrait les sprites fantômes) — d'où l'absence de `reset()`.
 */
export class HordeRenderer {
  private hazardGraphics?: Phaser.GameObjects.Graphics
  private readonly hazardSprites = new Map<number, Phaser.GameObjects.Image>()
  private readonly enemySprites = new Map<number, CharSprite>()
  private readonly projectileSprites = new Map<number, CharSprite>()
  private readonly pickupSprites = new Map<number, CharSprite>()
  /** B5 — Anim d'apparition du coffre (pop-in + entrouverture) par id. */
  private readonly chestAnim = new Map<number, { spawnedAt: number; opened: boolean }>()
  /** B5 — Aura dorée pulsée derrière le coffre par id. */
  private readonly chestAura = new Map<number, Phaser.GameObjects.Arc>()
  private readonly chestSparkleEpoch = new Map<number, number>()
  private readonly xpSparkleEpoch = new Map<number, number>()
  /** HP de l'ennemi à la frame précédente (diff → feedback de coup). */
  private readonly prevEnemyHp = new Map<number, number>()
  /** Fin de la fenêtre de flash blanc par ennemi touché. */
  private readonly enemyFlashUntil = new Map<number, number>()
  // Ensembles « vus cette frame » réutilisés (culling), vidés au lieu d'être recréés.
  private readonly seenHaz = new Set<number>()
  private readonly seenEnemy = new Set<number>()
  private readonly seenProj = new Set<number>()
  private readonly seenPickup = new Set<number>()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly pool: SpritePool,
    private readonly vfx: VfxManager,
    private readonly damageNumbers: DamageNumberPool
  ) {}

  /**
   * Synchronise tous les sprites de la horde avec l'état de la frame. `stage`
   * fournit les skins d'ennemis/boss ; `state.players[0]` oriente les ennemis.
   */
  sync(state: AppViewState, stage: StageRender): void {
    if (this.hazardGraphics === undefined) {
      this.hazardGraphics = this.scene.add.graphics().setDepth(-2)
    }

    // ── Flaques de goudron (hazards) : sprite dédié par flaque, repli Graphics ──
    this.hazardGraphics.clear()
    const useTarSprite = this.scene.textures.exists('vfx_goudron')
    const seenHaz = this.seenHaz
    seenHaz.clear()
    for (const h of state.hazards) {
      if (useTarSprite) {
        seenHaz.add(h.id)
        let hs = this.hazardSprites.get(h.id)
        if (hs === undefined) {
          hs = this.scene.add.image(h.x, h.y, 'vfx_goudron').setDepth(-2).setAlpha(0)
          this.hazardSprites.set(h.id, hs)
          // Apparition : fondu d'entrée + quelques bulles sombres montantes.
          this.scene.tweens.add({ targets: hs, alpha: 0.85, duration: 250, ease: 'Quad.easeOut' })
          this.vfx.spawnTarBubbles(h.x, h.y, h.radius)
        }
        hs.setPosition(h.x, h.y).setScale((h.radius * 2) / hs.width)
      } else {
        this.hazardGraphics.fillStyle(0x1a1a20, 0.35)
        this.hazardGraphics.fillCircle(h.x, h.y, h.radius)
      }
    }
    for (const [id, hs] of this.hazardSprites) {
      if (!seenHaz.has(id)) {
        hs.destroy()
        this.hazardSprites.delete(id)
      }
    }

    // ── Ennemis (spawn poolé + skin, orientation vers le leader, feedback de coup) ──
    const leader = state.players[0]
    const seen = this.seenEnemy
    seen.clear()
    // Diff HP pour le feedback de coup — calculé AVANT de mettre à jour prevEnemyHp.
    const hitEvents = computeHitEvents(this.prevEnemyHp, state.enemies)
    const hitById = new Map(hitEvents.map((e) => [e.id, e.amount]))
    // Compteur d'allocations de feedback (chiffres + pops) — borne le pic par frame.
    let feedbackEmittedThisFrame = 0
    for (const en of state.enemies) {
      seen.add(en.id)
      let sprite = this.enemySprites.get(en.id)
      if (sprite === undefined) {
        const skin = en.isBoss ? (en.bossRole === 'final' ? FINAL_BOSS_SKIN : stage.boss) : stage.enemies[en.type]
        const key = skin?.key
        const scale = skin?.scale ?? DEFAULT_CHAR_SCALE
        if (key !== undefined && this.scene.textures.exists(key)) {
          sprite = this.pool.acquire(key, en.x, en.y)
          sprite.setScale(scale)
        } else {
          sprite = this.scene.add.circle(en.x, en.y, ENEMY_RADIUS, ENEMY_COLOR)
        }
        this.enemySprites.set(en.id, sprite)
        // Arrivée de boss : téléporteur façon Mega Man (rendu seul, boss actif).
        if (en.isBoss) {
          this.vfx.playBossTeleport(sprite, en.x, en.y)
        }
      }
      sprite.setPosition(en.x, en.y)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        // L'ennemi poursuit le joueur → il regarde vers lui (pas de vx/vy exposé).
        const row = leader !== undefined ? dirRow(leader.x - en.x, leader.y - en.y) : 0
        sprite.setFrame(walkFrame(row, this.scene.time.now))
      }
      // ── Feedback de coup (hit-feel) ──
      const hitAmount = hitById.get(en.id)
      if (hitAmount !== undefined) {
        // Hit-flash blanc ~60ms — NON capé : setTintFill n'alloue rien.
        const until = hitFlashUntil(this.scene.time.now, hitAmount, 60)
        if (until !== undefined) {
          this.enemyFlashUntil.set(en.id, until)
        }
        // Chiffre + pop : CAPÉS à FEEDBACK_MAX_PER_FRAME (bruit + pic d'alloc en horde).
        if (feedbackEmittedThisFrame < FEEDBACK_MAX_PER_FRAME) {
          this.damageNumbers.spawn(en.x, en.y, hitAmount, en.isElite, en.isBoss)
          this.vfx.spawnPixelPop(en.x, en.y, PALETTE_HEX.orangeDanger, 6, 120)
          feedbackEmittedThisFrame++
        }
      }
      // Applique la teinte flash blanc si dans la fenêtre, sinon efface.
      const flashUntil = this.enemyFlashUntil.get(en.id)
      if (flashUntil !== undefined) {
        if (this.scene.time.now < flashUntil) {
          if (sprite instanceof Phaser.GameObjects.Sprite) {
            sprite.setTintFill(PALETTE_HEX.blanc)
          }
        } else {
          if (sprite instanceof Phaser.GameObjects.Sprite) {
            sprite.clearTint()
          }
          this.enemyFlashUntil.delete(en.id)
        }
      }
      // Mémorise les HP courants pour la comparaison de la prochaine frame.
      this.prevEnemyHp.set(en.id, en.hp)
    }
    // Retire les sprites des ennemis disparus (mort → poussière + éclair + scale-pop).
    for (const [id, sprite] of this.enemySprites) {
      if (!seen.has(id)) {
        this.vfx.spawnVfx('vfx_dust', sprite.x, sprite.y, 0.2, 1.8, 380)
        this.vfx.spawnFlash(sprite.x, sprite.y)
        // Pixel-pop orange (impact satisfaction) — DA-safe.
        this.vfx.spawnPixelPop(sprite.x, sprite.y, PALETTE_HEX.orangeDanger, 8, 160)
        if (sprite instanceof Phaser.GameObjects.Sprite) {
          this.pool.release(sprite)
        } else {
          sprite.destroy()
        }
        this.enemySprites.delete(id)
        // Nettoie les ids disparus pour éviter les fuites mémoire.
        this.prevEnemyHp.delete(id)
        this.enemyFlashUntil.delete(id)
      }
    }

    // ── Projectiles (spin ou orienté vitesse selon la config) ──
    const seenProj = this.seenProj
    seenProj.clear()
    for (const pr of state.projectiles) {
      seenProj.add(pr.id)
      let sprite = this.projectileSprites.get(pr.id)
      const cfg = PROJ_SPRITE[pr.type]
      if (sprite === undefined) {
        if (cfg !== undefined && this.scene.textures.exists(cfg.key)) {
          sprite = this.pool.acquire(cfg.key, pr.x, pr.y)
          sprite.setScale(cfg.scale)
        } else {
          sprite = this.scene.add.circle(pr.x, pr.y, PROJECTILE_RADIUS, PROJECTILE_COLOR)
        }
        this.projectileSprites.set(pr.id, sprite)
      }
      sprite.setPosition(pr.x, pr.y)
      if (sprite instanceof Phaser.GameObjects.Sprite && cfg !== undefined) {
        if (cfg.spin) {
          sprite.setRotation(this.scene.time.now / 120)
        } else if (cfg.faceVel && (pr.vx !== 0 || pr.vy !== 0)) {
          // L'art du clou pointe vers le bas (+y) → aligne la pointe sur la vitesse.
          sprite.setRotation(Math.atan2(pr.vy, pr.vx) - Math.PI / 2)
        }
      }
    }
    for (const [id, sprite] of this.projectileSprites) {
      if (!seenProj.has(id)) {
        if (sprite instanceof Phaser.GameObjects.Sprite) {
          this.pool.release(sprite)
        } else {
          sprite.destroy()
        }
        this.projectileSprites.delete(id)
      }
    }

    // ── Pickups / coffres / gemmes XP ──
    const seenPickup = this.seenPickup
    seenPickup.clear()
    for (const pk of state.pickups) {
      seenPickup.add(pk.id)
      let sprite = this.pickupSprites.get(pk.id)
      const cfg = PICKUP_SPRITE[pk.type]
      if (sprite === undefined) {
        if (this.scene.textures.exists(cfg.key)) {
          sprite = this.pool.acquire(cfg.key, pk.x, pk.y)
          sprite.setScale(cfg.scale)
        } else {
          sprite = this.scene.add.circle(pk.x, pk.y, PICKUP_RADIUS, PICKUP_COLOR)
        }
        this.pickupSprites.set(pk.id, sprite)
      }
      sprite.setPosition(pk.x, pk.y)
      // B5 — Coffre d'évolution : pop-in avec rebond + entrouverture + aura dorée + scintillement.
      if ((pk.type === 'coffre' || pk.type === 'chest') && sprite instanceof Phaser.GameObjects.Sprite) {
        // Animation d'apparition : pop-in avec REBOND (ease-out-back) puis balancement.
        let anim = this.chestAnim.get(pk.id)
        if (anim === undefined) {
          anim = { spawnedAt: this.scene.time.now, opened: false }
          this.chestAnim.set(pk.id, anim)
        }
        const age = this.scene.time.now - anim.spawnedAt
        const POP_MS = 320
        let scaleMul: number
        if (age < POP_MS) {
          // easeOutBack : dépasse (~×1.1) puis revient → rebond franc à l'apparition.
          const t = age / POP_MS
          const c1 = 1.70158
          const u = t - 1
          scaleMul = 1 + (c1 + 1) * u * u * u + c1 * u * u
        } else {
          // Balancement idle léger.
          scaleMul = 1 + 0.09 * Math.abs(Math.sin(this.scene.time.now / 260))
        }
        sprite.setScale(cfg.scale * scaleMul)

        // Le coffre s'ENTROUVRE une fois posé (swap vers l'état entrouvert + étincelle).
        if (!anim.opened && age > POP_MS * 0.85 && this.scene.textures.exists('pickup_crate_open')) {
          anim.opened = true
          sprite.setTexture('pickup_crate_open')
          this.vfx.spawnVfx('vfx_sparkle', pk.x, pk.y, 0.5, 1.6, 260)
        }

        // AURA DORÉE pulsée derrière le coffre (disque palette or, alpha modéré → repérable).
        let aura = this.chestAura.get(pk.id)
        if (aura === undefined) {
          aura = this.scene.add.circle(pk.x, pk.y, 42, PALETTE_HEX.jauneSecurite, 0.24).setDepth(-0.3)
          this.chestAura.set(pk.id, aura)
        }
        const wave = 0.5 + 0.5 * Math.sin(this.scene.time.now / 300)
        aura.setPosition(pk.x, pk.y)
        aura.setScale(1 + 0.16 * wave)
        aura.setAlpha(0.18 + 0.16 * wave)

        // Scintillement pixel or périodique (décalé par id).
        const chestPeriod = 700
        const chestOffset = (pk.id * 211) % chestPeriod
        const chestEpoch = Math.floor((this.scene.time.now + chestOffset) / chestPeriod)
        if (this.chestSparkleEpoch.get(pk.id) !== chestEpoch) {
          this.chestSparkleEpoch.set(pk.id, chestEpoch)
          this.vfx.spawnPixelPop(pk.x, pk.y, PALETTE_HEX.jauneSecurite, 10, 240)
        }
      }
      // B4 — Gemme XP : pulse d'échelle (shiny) + scintillement pixel discret.
      if (pk.type === 'xp' && sprite instanceof Phaser.GameObjects.Sprite) {
        // Pulse sinusoïdal léger (±10 %) : chaque gemme a une phase décalée par son id.
        const phase = (pk.id * 1.3) % (Math.PI * 2)
        sprite.setScale(cfg.scale * (1 + 0.1 * Math.sin(this.scene.time.now / 220 + phase)))
        // Scintillement pixel : un carré vert-bonus UNE FOIS par période (~900ms, staggeré par id).
        const sparkPeriod = 900
        const sparkOffset = (pk.id * 337) % sparkPeriod
        const epoch = Math.floor((this.scene.time.now + sparkOffset) / sparkPeriod)
        if (this.xpSparkleEpoch.get(pk.id) !== epoch) {
          this.xpSparkleEpoch.set(pk.id, epoch)
          this.vfx.spawnPixelPop(pk.x, pk.y, PALETTE_HEX.vertBonus, 5, 180)
        }
      }
    }
    for (const [id, sprite] of this.pickupSprites) {
      if (!seenPickup.has(id)) {
        this.vfx.spawnVfx('vfx_sparkle', sprite.x, sprite.y, 0.6, 1.6, 300)
        if (sprite instanceof Phaser.GameObjects.Sprite) {
          this.pool.release(sprite)
        } else {
          sprite.destroy()
        }
        this.pickupSprites.delete(id)
        // Nettoyage des epochs de scintillement (évite une fuite sur les pickups collectés).
        this.xpSparkleEpoch.delete(id)
        this.chestSparkleEpoch.delete(id)
        // Nettoyage de l'anim + de l'aura du coffre (évite une fuite / aura fantôme).
        this.chestAnim.delete(id)
        const aura = this.chestAura.get(id)
        if (aura !== undefined) {
          aura.destroy()
          this.chestAura.delete(id)
        }
      }
    }
  }
}
