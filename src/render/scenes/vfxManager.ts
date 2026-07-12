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

  /**
   * Flourish de montée d'arme (Piste C) : anneau cyan qui s'étend + éclats jaunes
   * radiaux au niveau du joueur, pour signaler « ton arme monte de niveau » — le
   * feedback qui manquait (« je vois pas de changement »). Rendu pur, auto-détruit.
   */
  spawnLevelUpFlourish(x: number, y: number): void {
    const ring = this.scene.add.circle(x, y, 80, 0x000000, 0)
      .setStrokeStyle(4, PALETTE_HEX.cyanAccent, 1)
      .setDepth(7)
      .setScale(0.15)
    this.scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const spark = this.scene.add.rectangle(x, y, 5, 5, PALETTE_HEX.jauneSecurite).setDepth(8)
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(a) * 70,
        y: y + Math.sin(a) * 70,
        alpha: 0,
        scale: 0.3,
        duration: 560,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy()
      })
    }
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
   * Balayage du pied-de-biche : coup de barre à mine qui SE VOIT monter en
   * puissance avec le niveau. Effet PixelLab premium — un arc « swoosh »
   * (`vfx_slash`, A) tourné/agrandi comme un vrai coup balayé + un éclat
   * d'impact (`vfx_slash_burst`, B) au point de contact. L'échelle et
   * l'amplitude du balayage croissent avec `level` ; au niveau 5 (count 2 dans
   * la sim) → DOUBLE coup croisé (X), miroir → la montée de palier se lit d'un
   * coup d'œil. Quelques éclats de béton procéduraux COMPLÈTENT le sprite
   * (jamais en remplacement). Render-only ; Math.random cosmétique OK.
   */
  spawnSweepArc(x: number, y: number, radius: number, level = 1): void {
    const lf = Math.max(0, Math.min(1, (level - 1) / 7)) // 0 au niv 1 → 1 au niv 8
    const swings = level >= 5 ? 2 : 1 // double coup croisé quand l'arme atteint 2 passes
    const scale = (radius / 100) * (0.72 + lf * 0.38) // le sprite couvre l'aire et grossit au niveau
    const sweep = Phaser.Math.DegToRad(38 + lf * 22) // amplitude de rotation du coup

    if (this.scene.textures.exists('vfx_slash')) {
      for (let s = 0; s < swings; s++) {
        const dir = s === 0 ? 1 : -1
        // Orienté vers le haut (devant) ; les 2 coups partent en biais opposé (X).
        const base = -Math.PI / 2 + (swings === 2 ? dir * Phaser.Math.DegToRad(22) : 0)
        const img = this.scene.add.image(x, y, 'vfx_slash')
          .setDepth(5)
          .setScale(scale * 0.72)
          .setRotation(base - (dir * sweep) / 2)
          .setFlipX(s === 1)
          .setAlpha(0.96)
        this.scene.tweens.add({
          targets: img,
          rotation: base + (dir * sweep) / 2,
          scale,
          alpha: 0,
          duration: 240,
          ease: 'Quad.easeOut',
          onComplete: () => img.destroy()
        })
      }
    } else {
      // Repli sans asset (tests/lite sans preload) : flash pour ne jamais planter.
      this.spawnPixelPop(x, y, PALETTE_HEX.jauneSecurite, 12, 200)
    }

    // Éclat d'impact (B) au centre — grossit avec le niveau.
    this.spawnVfx('vfx_slash_burst', x, y, scale * 0.25, scale * 0.62, 230)

    // Complément procédural léger : éclats de béton éjectés PAR-DESSUS le sprite.
    const pcount = 4 + Math.round(lf * 5)
    const fanSpan = Phaser.Math.DegToRad(150)
    const fanStart = -Phaser.Math.DegToRad(90) - fanSpan / 2
    for (let i = 0; i < pcount; i++) {
      const a = fanStart + (fanSpan / Math.max(1, pcount - 1)) * i
      const dist = radius * (0.5 + Math.random() * 0.4)
      const px = x + Math.cos(a) * dist
      const py = y + Math.sin(a) * dist
      const sp = 26 + lf * 30 + Math.random() * 22
      const isChunk = lf > 0.4 && i % 3 === 0 // béton cassé au niveau élevé
      const sz = isChunk ? 5 : 4
      const par = this.scene.add
        .rectangle(px, py, sz, sz, isChunk ? PALETTE_HEX.contour : PALETTE_HEX.jauneSecurite)
        .setDepth(6)
      this.scene.tweens.add({
        targets: par, x: px + Math.cos(a) * sp, y: py + Math.sin(a) * sp,
        alpha: 0, scaleX: 0.2, scaleY: 0.2, angle: isChunk ? 200 : 0,
        duration: 220 + Math.random() * 110, ease: 'Quad.easeOut', onComplete: () => par.destroy()
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

    // Piste C : nuage de mousse (sprite PixelLab) posé au joueur, ORIENTÉ vers la
    // cible et ÉTIRÉ (plus long que large → lit comme un jet), avec quelques bulles.
    // Repli sur le dessin de secteurs ci-dessous si la texture est absente (tests/lite).
    const FOAM_KEY = 'vfx_foam_cone'
    if (this.scene.textures.exists(FOAM_KEY)) {
      const foam = this.scene.add.sprite(x, y, FOAM_KEY).setDepth(6).setOrigin(0.5, 0.82)
      foam.setRotation(centerAngle + Math.PI / 2) // le sprite s'évase vers le haut (-y)
      const sy = radius / 110 // longueur ≈ portée
      const sx = radius / 170 // plus étroit
      foam.setScale(sx * 0.55, sy * 0.5).setAlpha(0.95)
      this.scene.tweens.add({
        targets: foam,
        scaleX: sx,
        scaleY: sy,
        alpha: 0,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => foam.destroy()
      })
      for (let i = 0; i < 8; i++) {
        const spread = (Math.random() * 2 - 1) * CONE_HALF_ANGLE
        const a = centerAngle + spread
        const dist = radius * (0.35 + Math.random() * 0.55)
        const bx = x + Math.cos(a) * dist
        const by = y + Math.sin(a) * dist
        const b = this.scene.add.circle(bx, by, 2 + Math.random() * 2, PALETTE_HEX.blanc).setDepth(7).setAlpha(0.8)
        this.scene.tweens.add({
          targets: b,
          x: bx + Math.cos(a) * 28,
          y: by + Math.sin(a) * 28,
          alpha: 0,
          scale: 0.2,
          duration: 260,
          ease: 'Quad.easeOut',
          onComplete: () => b.destroy()
        })
      }
      return
    }

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
   * Jet de flammes (chalumeau / lance thermique) : sprite PixelLab posé au joueur,
   * ORIENTÉ vers la cible et étiré sur la portée — même géométrie que la mousse de
   * l'extincteur. Scalé par NIVEAU (recette golden pied-de-biche : plus grand/plus
   * dense à haut niveau) ; braises procédurales en COMPLÉMENT du sprite. L'évoluée
   * (lance thermique) utilise son propre sprite (jet de découpe) + gouttes de métal
   * en fusion (pops blancs). Render-only ; Math.random cosmétique OK.
   *
   * Orientation des arts : `vfx_flame_cone` s'évase vers le HAUT (-y) comme la
   * mousse → rotation = angle + π/2 ; `vfx_flame_lance` jaillit en diagonale
   * bas-droite (≈ +π/4) → rotation = angle − π/4, pivot à la naissance du jet.
   */
  spawnFlameCone(x: number, y: number, radius: number, dirX?: number, dirY?: number, level = 1, evolved = false): void {
    const dx = dirX ?? 0
    const dy = dirY ?? -1
    const centerAngle = Math.atan2(dy, dx)
    const lf = Math.max(0, Math.min(1, (level - 1) / 7)) // 0 au niv 1 → 1 au niv 8

    const key = evolved ? 'vfx_flame_lance' : 'vfx_flame_cone'
    if (this.scene.textures.exists(key)) {
      const flame = this.scene.add.sprite(x, y, key).setDepth(6)
      if (evolved) {
        flame.setOrigin(0.25, 0.25).setRotation(centerAngle - Math.PI / 4)
      } else {
        flame.setOrigin(0.5, 0.85).setRotation(centerAngle + Math.PI / 2)
      }
      // Longueur ≈ portée ; grossit avec le niveau (progression visible).
      const grow = 0.8 + lf * 0.35
      const sy = (radius / 130) * grow
      const sx = (radius / 175) * grow
      flame.setScale(sx * 0.5, sy * 0.45).setAlpha(0.98)
      this.scene.tweens.add({
        targets: flame,
        scaleX: sx,
        scaleY: sy,
        alpha: 0,
        duration: evolved ? 260 : 300,
        ease: 'Quad.easeOut',
        onComplete: () => flame.destroy()
      })
    } else {
      // Repli sans asset (tests/lite sans preload) : flash chaud, jamais de plantage.
      this.spawnPixelPop(x, y, PALETTE_HEX.orangeDanger, 12, 200)
    }

    // Braises éjectées dans le cône — nombre croissant avec le niveau.
    const embers = 5 + Math.round(lf * 6) + (evolved ? 4 : 0)
    for (let i = 0; i < embers; i++) {
      const a = centerAngle + (Math.random() * 2 - 1) * CONE_HALF_ANGLE
      const dist = radius * (0.3 + Math.random() * 0.6)
      const px = x + Math.cos(a) * dist
      const py = y + Math.sin(a) * dist
      const sp = 34 + lf * 30 + Math.random() * 26
      // Lance thermique : gouttes de métal en fusion (blanc) parmi les braises.
      const molten = evolved && i % 3 === 0
      const col = molten ? PALETTE_HEX.blanc : (i % 2 === 0 ? PALETTE_HEX.orangeDanger : PALETTE_HEX.jauneSecurite)
      const ember = this.scene.add.rectangle(px, py, molten ? 4 : 3, molten ? 4 : 3, col).setDepth(7).setAlpha(0.95)
      this.scene.tweens.add({
        targets: ember,
        x: px + Math.cos(a) * sp,
        y: py + Math.sin(a) * sp,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 240 + Math.random() * 120,
        ease: 'Quad.easeOut',
        onComplete: () => ember.destroy()
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

  /**
   * Explosion pixel à la mort d'un ennemi (poussière + flash + burst de pops),
   * échelle `scale` (1 = début de partie, jusqu'à ~1.8 en fin de partie).
   * Bornée à ≤ 5 primitives Phaser : rendu pur, DA-safe (palette), pas de glow.
   * Les offsets des petits pops sont déterministes (cos/sin tiers de cercle).
   */
  spawnDeathBoom(x: number, y: number, scale: number): void {
    // Poussière (asset vfx_dust) — agrandie selon l'échelle.
    this.spawnVfx('vfx_dust', x, y, 0.2, 1.8 * scale, 380)
    // Flash blanc bref.
    this.spawnFlash(x, y)
    // Gros pop central orange.
    this.spawnPixelPop(x, y, PALETTE_HEX.orangeDanger, Math.round(10 * scale), 200)
    // 3 petits pops décalés radialement (offsets déterministes : tiers de cercle).
    const popCount = 3
    const popRadius = 18 * scale
    for (let i = 0; i < popCount; i++) {
      const angle = (i * Math.PI * 2) / popCount
      const px = x + Math.cos(angle) * popRadius
      const py = y + Math.sin(angle) * popRadius
      this.spawnPixelPop(px, py, PALETTE_HEX.orangeDanger, Math.round(6 * scale), 160)
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
