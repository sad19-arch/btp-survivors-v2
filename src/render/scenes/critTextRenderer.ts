import Phaser from 'phaser'
import { PALETTE } from '@ui/palette'
import { selectCriticalText } from '@content/carnage'

/**
 * TEXTE DE COUP CRITIQUE — accent arcade sur une mort marquante.
 *
 * Rallume une feature dormante : le pool `CRITICAL_TEXTS` + le sélecteur pur
 * `selectCriticalText` ([content/carnage.ts]) existaient sans AUCUN consommateur
 * (seul `CarnageRenderer.criticalText()` les appelait, et lui-même n'était jamais
 * lu). Ici on les affiche en jeu NORMAL — pas seulement en Mode Carnage — quand une
 * mort mérite d'être soulignée : boss, élite, ou un kill « chanceux » de la horde.
 *
 * Vit hors de `GameScene` (règle d'archi : une responsabilité de rendu = un module
 * dédié). N'observe qu'un événement (`enemyDied`) : ne touche jamais la simulation.
 * DA 16-bit : police pixel (monospace gras + contour épais, comme les chiffres de
 * dégâts), couleurs de la palette, aucun emoji/gradient/glow.
 */

/** Probabilité qu'un kill NORMAL fasse gicler un texte (boss/élite : toujours). */
export const CRIT_TEXT_NORMAL_CHANCE = 0.03
/** Textes NORMAUX au plus par frame — une vague tue en paquet, on ne spamme pas l'écran. */
const MAX_NORMAL_PER_FRAME = 2

/** Ce que le renderer a besoin de savoir d'une mort pour décider (mappé depuis `EnemyDiedEvent`). */
export interface CritKill {
  isElite: boolean
  bossRole: 'mid' | 'final' | undefined
}

/**
 * Décide PUREMENT si une mort mérite un texte arcade (testable sans Phaser).
 * Boss et élites : toujours (rares et notables). Ennemi normal : tirage `roll`.
 */
export function shouldCritText(kill: CritKill, roll: number): boolean {
  if (kill.bossRole !== undefined || kill.isElite) {
    return true
  }
  return roll < CRIT_TEXT_NORMAL_CHANCE
}

const FONT_FAMILY = 'monospace'
const FONT_STYLE = 'bold'
/** Un « gros » coup (boss/élite) est plus grand et alerte-rouge ; un normal, jaune arcade. */
const FONT_SIZE_BIG = '26px'
const FONT_SIZE_NORMAL = '18px'
const STROKE_BIG = 6
const STROKE_NORMAL = 4
/** Montée en px pendant l'animation. */
const RISE_PX = 26
/** Durée totale (ms) : un peu plus longue que les chiffres, c'est une phrase à lire. */
const DURATION_MS = 820
/** Durée du « pop » d'apparition (scale). */
const POP_MS = 150
/** Profondeur Phaser : au-dessus des chiffres de dégâts (8), sous le HUD. */
const DEPTH = 9

/**
 * Pool de `Phaser.GameObjects.Text` pour les textes de coup critique flottants.
 * Free-list (recyclage via `onComplete`), même patron que `DamageNumberPool` :
 * instance FRAÎCHE par scène, jamais un singleton de module.
 */
export class CritTextRenderer {
  private readonly free: Phaser.GameObjects.Text[] = []
  private activeCount = 0
  private spawnedTotal = 0
  /** Budget par frame (patron `tickFrameBudget` du CarnageRenderer). */
  private normalsThisFrame = 0
  private frameMark = -1

  constructor(private readonly scene: Phaser.Scene) {}

  /** Textes actuellement visibles (pour d'éventuels tests/perf). */
  get active(): number {
    return this.activeCount
  }

  /** Cumul de textes émis depuis la création. */
  get total(): number {
    return this.spawnedTotal
  }

  /**
   * Fait gicler un texte pour une mort, SI elle le mérite. `big` = boss/élite.
   * Les normaux sont plafonnés par frame ; les gros passent toujours (rares).
   */
  spawn(x: number, y: number, kill: CritKill, roll: number): void {
    if (!shouldCritText(kill, roll)) {
      return
    }
    const big = kill.bossRole !== undefined || kill.isElite
    this.tickFrameBudget()
    if (!big) {
      if (this.normalsThisFrame >= MAX_NORMAL_PER_FRAME) {
        return
      }
      this.normalsThisFrame++
    }

    const label = selectCriticalText({ roll })
    const t = this.acquire(x, y, label, big)
    this.activeCount++
    this.spawnedTotal++

    // Pop d'apparition (scale) — accent d'impact, indépendant de la montée/fondu.
    this.scene.tweens.add({
      targets: t,
      scale: big ? 1 : 0.82,
      duration: POP_MS,
      ease: 'Back.easeOut'
    })
    // Montée + fondu : c'est CE tween qui recycle le texte (le plus long).
    this.scene.tweens.add({
      targets: t,
      y: y - RISE_PX,
      alpha: 0,
      duration: DURATION_MS,
      delay: 60,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.release(t)
      }
    })
  }

  private tickFrameBudget(): void {
    const frame = this.scene.game.getFrame()
    if (frame !== this.frameMark) {
      this.frameMark = frame
      this.normalsThisFrame = 0
    }
  }

  private acquire(x: number, y: number, label: string, big: boolean): Phaser.GameObjects.Text {
    const color = big ? PALETTE.rougeAlerte : PALETTE.jauneSecurite
    const fontSize = big ? FONT_SIZE_BIG : FONT_SIZE_NORMAL
    const strokeThickness = big ? STROKE_BIG : STROKE_NORMAL
    const startY = y - 30
    const startScale = big ? 0.5 : 0.4

    const recycled = this.free.pop()
    if (recycled !== undefined) {
      recycled.setText(label)
      recycled.setColor(color)
      recycled.setFontSize(fontSize)
      recycled.setStroke(PALETTE.contour, strokeThickness)
      recycled.setPosition(x, startY)
      recycled.setScale(startScale)
      recycled.setAlpha(1)
      recycled.setActive(true)
      recycled.setVisible(true)
      return recycled
    }
    const t = this.scene.add.text(x, startY, label, {
      fontFamily: FONT_FAMILY,
      fontSize,
      fontStyle: FONT_STYLE,
      color,
      stroke: PALETTE.contour,
      strokeThickness
    })
    t.setOrigin(0.5)
    t.setDepth(DEPTH)
    t.setScale(startScale)
    return t
  }

  private release(t: Phaser.GameObjects.Text): void {
    t.setActive(false)
    t.setVisible(false)
    this.activeCount = Math.max(0, this.activeCount - 1)
    this.free.push(t)
  }
}
