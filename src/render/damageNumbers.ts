import Phaser from 'phaser'
import { PALETTE } from '@ui/palette'

// ── Fonctions pures (testables sans Phaser) ────────────────────────────────

/**
 * Calcule l'instant jusqu'auquel le sprite d'un ennemi doit rester en flash blanc.
 * Retourne `now + durationMs` si `amount > 0`, sinon `undefined`.
 * Fonction pure : pas d'effet de bord, pas de référence Phaser.
 */
export function hitFlashUntil(now: number, amount: number, durationMs: number): number | undefined {
  if (amount > 0) {
    return now + durationMs
  }
  return undefined
}

export interface DamageNumberStyle {
  text: string
  color: string
}

/**
 * Détermine le texte et la couleur d'un chiffre de dégâts.
 * Elite ou boss → orangeDanger ; ennemi normal → jauneSecurite.
 * Fonction pure : pas d'effet de bord, pas de référence Phaser.
 */
export function damageNumberStyle(isElite: boolean, isBoss: boolean, amount: number): DamageNumberStyle {
  const color = isElite || isBoss ? PALETTE.orangeDanger : PALETTE.jauneSecurite
  return { text: String(Math.round(amount)), color }
}

// ── Pool de chiffres de dégâts ─────────────────────────────────────────────

const FONT_FAMILY = 'monospace'
const FONT_SIZE = '16px'
const FONT_STYLE = 'bold'
/** Montée en px pendant l'animation. */
const RISE_PX = 20
/** Durée totale de l'animation (ms). */
const DURATION_MS = 450
/** Épaisseur du contour pixel (px). */
const STROKE_THICKNESS = 4
/** Profondeur Phaser des chiffres (au-dessus des entités). */
const DEPTH = 8

/**
 * Pool de `Phaser.GameObjects.Text` pour les chiffres de dégâts flottants.
 * Free-list : les textes sont recyclés via `onComplete` du tween → `release`.
 * Jamais de `new Text` par hit hors recyclage une fois le pool initialisé.
 *
 * Instance FRAÎCHE à chaque `create()` (GameScene) — jamais un singleton de module.
 */
export class DamageNumberPool {
  private readonly scene: Phaser.Scene
  private readonly free: Phaser.GameObjects.Text[] = []
  /** Compteur du nombre de textes actuellement actifs. */
  private activeCount = 0
  /** Compteur cumulé du nombre total de textes ayant été spawned. */
  private spawnedTotal = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /** Nombre de chiffres actuellement visibles (actifs). */
  get active(): number {
    return this.activeCount
  }

  /** Nombre total de chiffres ayant été spawned depuis la création du pool. */
  get total(): number {
    return this.spawnedTotal
  }

  /**
   * Spawn un chiffre de dégâts flottant à (x, y).
   * Réutilise un texte libre s'il y en a un, sinon en crée un.
   * Le texte monte de `RISE_PX` et s'efface sur `DURATION_MS`, puis est recyclé.
   */
  spawn(x: number, y: number, amount: number, isElite: boolean, isBoss: boolean): void {
    const { text: label, color } = damageNumberStyle(isElite, isBoss, amount)
    const t = this.acquire(x, y, label, color)

    this.activeCount++
    this.spawnedTotal++

    this.scene.tweens.add({
      targets: t,
      y: y - RISE_PX,
      alpha: 0,
      duration: DURATION_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.release(t)
      }
    })
  }

  private acquire(x: number, y: number, label: string, color: string): Phaser.GameObjects.Text {
    const recycled = this.free.pop()
    if (recycled !== undefined) {
      recycled.setText(label)
      recycled.setColor(color)
      recycled.setPosition(x, y - 40)
      recycled.setAlpha(1)
      recycled.setActive(true)
      recycled.setVisible(true)
      return recycled
    }
    const t = this.scene.add.text(x, y - 40, label, {
      fontFamily: FONT_FAMILY,
      fontSize: FONT_SIZE,
      fontStyle: FONT_STYLE,
      color,
      stroke: PALETTE.contour,
      strokeThickness: STROKE_THICKNESS
    })
    t.setOrigin(0.5)
    t.setDepth(DEPTH)
    return t
  }

  private release(t: Phaser.GameObjects.Text): void {
    t.setActive(false)
    t.setVisible(false)
    this.activeCount = Math.max(0, this.activeCount - 1)
    this.free.push(t)
  }
}

