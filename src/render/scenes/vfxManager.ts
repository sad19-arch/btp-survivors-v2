import Phaser from 'phaser'
import { CONE_HALF_ANGLE } from '@content/config'
import { PALETTE_HEX } from '@ui/palette'

/** Un sprite de héros/ennemi rendu (Sprite animé ou Arc de repli en mode « lite »). */
type CharSprite = Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc

/**
 * Effets visuels transitoires (VFX) de la scène de jeu, extraits de `GameScene`
 * pour l'alléger. Chaque effet crée des GameObjects Phaser qui s'auto-détruisent
 * en fin de tween (aucune fuite) — purement cosmétique, observer-only, aucun
 * état de simulation. Le jitter/particules utilisent `Math.random()` : rendu
 * uniquement, sans effet sur le déterminisme de la sim.
 *
 * Ne détient AUCUN état propre : simplement une référence à la scène pour
 * accéder aux fabriques (`add`/`tweens`/`time`/`textures`).
 */
export class VfxManager {
  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Joue un effet transitoire (scale + fondu) à une position, puis se détruit. Rendu pur.
   * Retourne le sprite (ou `null` si la texture est absente) pour un habillage ponctuel (ex. teinte).
   */
  spawnVfx(
    key: string,
    x: number,
    y: number,
    from: number,
    to: number,
    durationMs: number
  ): Phaser.GameObjects.Sprite | null {
    if (!this.scene.textures.exists(key)) {
      return null
    }
    const fx = this.scene.add.sprite(x, y, key).setScale(from).setDepth(5)
    this.scene.tweens.add({
      targets: fx,
      scale: to,
      alpha: 0,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => fx.destroy()
    })
    return fx
  }

  /** Éclair blanc bref (primitive, sans asset) — accompagne la fumée à la mort d'un ennemi. */
  spawnFlash(x: number, y: number): void {
    const flash = this.scene.add.circle(x, y, 9, 0xffffff).setDepth(6)
    this.scene.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 130,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy()
    })
  }

  /**
   * Pop pixel carré coloré (scale-pop DA-safe) : naît petit, grossit,
   * disparaît — pur hit-feel arcade 16-bit. Utilisé par sweep, strike, marteau.
   */
  spawnPixelPop(x: number, y: number, color: number, size: number, durationMs: number): void {
    const sq = this.scene.add.rectangle(x, y, size, size, color).setDepth(6).setScale(0.2)
    this.scene.tweens.add({
      targets: sq,
      scale: 1,
      alpha: 0,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => sq.destroy()
    })
  }

  /**
   * Balayage du pied-de-biche : arc épais (croissant, pas un cercle complet)
   * qui pivote sur ~40° en s'estompant — lecture "coup de balayage", distincte
   * de l'onde ronde du marteau. Double-tracé (cœur blanc + contour jaune) +
   * scale-pop (naît petit → pleine taille) + particules éjectées le long de l'arc.
   * Primitive Graphics, aucune texture chargée.
   */
  spawnSweepArc(x: number, y: number, radius: number): void {
    const arcRadius = radius * 0.6
    const span = Phaser.Math.DegToRad(120)
    const startAngle = -Phaser.Math.DegToRad(90) - span / 2

    // Cœur blanc (plus fin, éclatant) — dessous.
    const gInner = this.scene.add.graphics().setPosition(x, y).setDepth(5).setScale(0.3)
    gInner.lineStyle(12, PALETTE_HEX.blanc, 0.85)
    gInner.beginPath()
    gInner.arc(0, 0, arcRadius, startAngle, startAngle + span)
    gInner.strokePath()
    this.scene.tweens.add({
      targets: gInner,
      rotation: Phaser.Math.DegToRad(40),
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => gInner.destroy()
    })

    // Contour jaune (épais) — dessus, légèrement décalé en temps (scale-pop décalé).
    const gOuter = this.scene.add.graphics().setPosition(x, y).setDepth(5).setScale(0.3)
    gOuter.lineStyle(7, PALETTE_HEX.jauneSecurite, 1)
    gOuter.beginPath()
    gOuter.arc(0, 0, arcRadius, startAngle, startAngle + span)
    gOuter.strokePath()
    this.scene.tweens.add({
      targets: gOuter,
      rotation: Phaser.Math.DegToRad(40),
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 240,
      ease: 'Quad.easeOut',
      onComplete: () => gOuter.destroy()
    })

    // Flash central (scale-pop) — marque le point d'impact.
    this.spawnPixelPop(x, y, PALETTE_HEX.jauneSecurite, 10, 180)

    // Particules éjectées en éventail le long de l'arc.
    const particleCount = 5
    for (let i = 0; i < particleCount; i++) {
      const angle = startAngle + (span / (particleCount - 1)) * i
      const dist = arcRadius * (0.7 + Math.random() * 0.4)
      const px = x + Math.cos(angle) * dist
      const py = y + Math.sin(angle) * dist
      const speedX = Math.cos(angle) * (28 + Math.random() * 22)
      const speedY = Math.sin(angle) * (28 + Math.random() * 22)
      const par = this.scene.add.rectangle(px, py, 4, 4, PALETTE_HEX.jauneSecurite).setDepth(6)
      this.scene.tweens.add({
        targets: par,
        x: px + speedX,
        y: py + speedY,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 220 + Math.random() * 80,
        ease: 'Quad.easeOut',
        onComplete: () => par.destroy()
      })
    }
  }

  /**
   * VFX du cône d'extincteur : 2 secteurs superposés qui s'élargissent en fondu
   * (densité et dynamisme) + petites particules « mousse » (carrés blancs) projetées
   * vers la cible. DA-safe : palette blanc/vert léger, pas de glow.
   * Les Graphics sont positionnés à l'origine (pas de setPosition) donc toutes les
   * coordonnées passées aux primitives sont absolues (monde), pas relatives.
   */
  spawnConeVfx(x: number, y: number, radius: number, dirX?: number, dirY?: number): void {
    const dx = dirX ?? 0
    const dy = dirY ?? -1
    const centerAngle = Math.atan2(dy, dx)
    const startAngle = centerAngle - CONE_HALF_ANGLE
    const endAngle = centerAngle + CONE_HALF_ANGLE

    // Couche 1 : secteur vert-mousse large — naît petit (scale-pop), s'élargit.
    const g1 = this.scene.add.graphics().setDepth(5).setPosition(x, y).setScale(0.3)
    g1.fillStyle(0xe8f4e8, 0.65)
    g1.beginPath()
    g1.moveTo(0, 0)
    g1.arc(0, 0, radius, startAngle, endAngle, false)
    g1.closePath()
    g1.fillPath()
    this.scene.tweens.add({
      targets: g1,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 280,
      ease: 'Quad.easeOut',
      onComplete: () => g1.destroy()
    })

    // Couche 2 : secteur blanc légèrement plus étroit — cœur lumineux, disparaît vite.
    const innerSpan = CONE_HALF_ANGLE * 0.7
    const g2 = this.scene.add.graphics().setDepth(6).setPosition(x, y).setScale(0.4)
    g2.fillStyle(PALETTE_HEX.blanc, 0.42)
    g2.beginPath()
    g2.moveTo(0, 0)
    g2.arc(0, 0, radius, centerAngle - innerSpan, centerAngle + innerSpan, false)
    g2.closePath()
    g2.fillPath()
    this.scene.tweens.add({
      targets: g2,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => g2.destroy()
    })

    // Particules « mousse » : petits carrés blancs projetés dans le cône.
    const particleCount = 7
    for (let i = 0; i < particleCount; i++) {
      const spread = (Math.random() * 2 - 1) * CONE_HALF_ANGLE
      const angle = centerAngle + spread
      const dist = radius * (0.3 + Math.random() * 0.7)
      const px = x + Math.cos(angle) * dist
      const py = y + Math.sin(angle) * dist
      const speed = 25 + Math.random() * 30
      const par = this.scene.add.rectangle(px, py, 3, 3, PALETTE_HEX.blanc).setDepth(7).setAlpha(0.85)
      this.scene.tweens.add({
        targets: par,
        x: px + Math.cos(angle) * speed,
        y: py + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: 230 + Math.random() * 100,
        ease: 'Quad.easeOut',
        onComplete: () => par.destroy()
      })
    }
  }

  /**
   * Arc électrique (court-circuit) : tracé en zigzag brisé du JOUEUR (`fromX/fromY`)
   * jusqu'à la CIBLE (`toX/toY`) + 2 fourches secondaires + flash d'impact.
   * Tracé double (halo cyan épais + cœur blanc fin) — rendu « foudre » pixel-art.
   * Durée ~140 ms. Le jitter latéral utilise Math.random() — cosmétique pur, rendu
   * uniquement, sans effet sur l'état de sim (déterminisme préservé).
   *
   * Remplace l'ancien éclair localisé sur l'ennemi : l'arc JOUEUR → ENNEMI rend
   * la décharge lisible d'un coup d'œil (on voit clairement qui est frappé et par quoi).
   */
  spawnStrikeBolt(fromX: number, fromY: number, toX: number, toY: number): void {
    const segments = 7
    const dx = toX - fromX
    const dy = toY - fromY
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // Vecteur perpendiculaire normalisé (pour le jitter latéral).
    const perpX = -dy / len
    const perpY = dx / len
    // Amplitude du jitter latéral : ~12 % de la longueur de l'arc, plafonné à 60px.
    const jitterAmp = Math.min(len * 0.12, 60)

    // Génère les points du zigzag principal (interpolation linéaire + jitter perp).
    const buildZigzag = (scale: number): { x: number; y: number }[] => {
      const pts: { x: number; y: number }[] = [{ x: fromX, y: fromY }]
      for (let i = 1; i < segments; i++) {
        const t = i / segments
        const jitter = (Math.random() * 2 - 1) * jitterAmp * scale
        pts.push({
          x: fromX + dx * t + perpX * jitter,
          y: fromY + dy * t + perpY * jitter
        })
      }
      pts.push({ x: toX, y: toY })
      return pts
    }

    const drawPath = (g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]): void => {
      if (pts.length === 0) {
        return
      }
      g.beginPath()
      g.moveTo(pts[0]?.x ?? fromX, pts[0]?.y ?? fromY)
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i]?.x ?? toX, pts[i]?.y ?? toY)
      }
      g.strokePath()
    }

    const mainPts = buildZigzag(1)

    // Éclair principal : halo cyan épais + cœur blanc fin.
    const gMain = this.scene.add.graphics().setDepth(5)
    gMain.lineStyle(5, PALETTE_HEX.cyanAccent, 0.92)
    drawPath(gMain, mainPts)
    gMain.lineStyle(2, PALETTE_HEX.blanc, 1)
    drawPath(gMain, mainPts)
    this.scene.tweens.add({
      targets: gMain,
      alpha: 0,
      duration: 140,
      ease: 'Quad.easeOut',
      onComplete: () => gMain.destroy()
    })

    // 2 fourches secondaires courtes depuis un point aléatoire du zigzag.
    const forkCount = 2
    for (let f = 0; f < forkCount; f++) {
      const forkIdx = 1 + Math.floor(Math.random() * (segments - 2))
      const forkPt = mainPts[forkIdx]
      if (forkPt === undefined) {
        continue
      }
      const forkAngle = Math.atan2(dy, dx) + Math.PI * (0.25 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1)
      const forkLen = len * (0.12 + Math.random() * 0.12)
      const gFork = this.scene.add.graphics().setDepth(5)
      gFork.lineStyle(3, PALETTE_HEX.cyanAccent, 0.7)
      gFork.beginPath()
      gFork.moveTo(forkPt.x, forkPt.y)
      gFork.lineTo(forkPt.x + Math.cos(forkAngle) * forkLen, forkPt.y + Math.sin(forkAngle) * forkLen)
      gFork.strokePath()
      gFork.lineStyle(1, PALETTE_HEX.blanc, 0.65)
      gFork.beginPath()
      gFork.moveTo(forkPt.x, forkPt.y)
      gFork.lineTo(forkPt.x + Math.cos(forkAngle) * forkLen, forkPt.y + Math.sin(forkAngle) * forkLen)
      gFork.strokePath()
      this.scene.tweens.add({
        targets: gFork,
        alpha: 0,
        duration: 110,
        ease: 'Quad.easeOut',
        onComplete: () => gFork.destroy()
      })
    }

    // Flash d'impact à la cible (scale-pop cyan + flash blanc).
    this.spawnPixelPop(toX, toY, PALETTE_HEX.cyanAccent, 16, 200)
    this.spawnFlash(toX, toY)
  }

  /**
   * Bulles de goudron : petits carrés sombres qui montent et disparaissent,
   * donnant vie à l'apparition d'une flaque de goudron. Cosmétique pur.
   */
  spawnTarBubbles(x: number, y: number, radius: number): void {
    const count = 5
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * radius * 0.7
      const bx = x + Math.cos(angle) * dist
      const by = y + Math.sin(angle) * dist
      const size = 2 + Math.floor(Math.random() * 3)
      const bubble = this.scene.add.rectangle(bx, by, size, size, PALETTE_HEX.brunSombre).setDepth(0).setAlpha(0.9)
      this.scene.tweens.add({
        targets: bubble,
        y: by - 12 - Math.random() * 10,
        alpha: 0,
        duration: 350 + Math.random() * 200,
        delay: Math.random() * 150,
        ease: 'Quad.easeOut',
        onComplete: () => bubble.destroy()
      })
    }
  }

  /** Bulle « Merci ! » (sprite pré-cuit) montant au-dessus d'un ouvrier libéré. */
  spawnBubble(x: number, y: number): void {
    if (!this.scene.textures.exists('bubble_merci')) {
      return
    }
    const bubble = this.scene.add.image(x, y - 44, 'bubble_merci').setScale(0.5).setDepth(7)
    this.scene.tweens.add({
      targets: bubble,
      y: y - 64,
      alpha: 0,
      duration: 2500,
      delay: 300,
      ease: 'Quad.easeOut',
      onComplete: () => bubble.destroy()
    })
  }

  /**
   * Arrivée de boss façon « téléporteur » : colonne de lumière verticale qui grandit,
   * 3-4 segments qui s'assemblent, puis fondu d'apparition du boss. Purement visuel.
   */
  playBossTeleport(boss: CharSprite, x: number, y: number): void {
    if (this.scene.textures.exists('vfx_beam')) {
      const beam = this.scene.add.sprite(x, y, 'vfx_beam').setDepth(5).setAlpha(0.9).setScale(1, 0)
      this.scene.tweens.add({
        targets: beam,
        scaleY: 1,
        duration: 350,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.scene.tweens.add({ targets: beam, alpha: 0, duration: 500, onComplete: () => beam.destroy() })
        }
      })
    }
    if (this.scene.textures.exists('vfx_beam_segment')) {
      for (let i = 0; i < 4; i++) {
        this.scene.time.delayedCall(i * 120, () => {
          const seg = this.scene.add
            .sprite(x, y - 70 + i * 18, 'vfx_beam_segment')
            .setDepth(6)
            .setAlpha(0.9)
          this.scene.tweens.add({ targets: seg, y, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => seg.destroy() })
        })
      }
    }
    if (boss instanceof Phaser.GameObjects.Sprite) {
      boss.setAlpha(0)
      this.scene.tweens.add({ targets: boss, alpha: 1, duration: 700, delay: 200 })
    }
  }

  /** Petit anneau d'étincelles autour du héros à la fin de l'intro (« les outils apparaissent »). */
  spawnIntroFlourish(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      this.spawnVfx('vfx_sparkle', x + Math.cos(a) * 34, y + Math.sin(a) * 34, 0.3, 1.2, 420)
    }
  }
}
