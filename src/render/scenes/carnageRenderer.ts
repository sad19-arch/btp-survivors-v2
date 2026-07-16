import Phaser from 'phaser'
import {
  CARNAGE,
  poolKey,
  splatterKey,
  splatterFor,
  dropClusterKey,
  selectCriticalText,
  paintedSurfaceM2,
  type CarnageSize
} from '@content/carnage'
/**
 * Échelle d'un personnage sans skin dédié — même valeur que `hordeRenderer`.
 * Sert de référence pour trancher « petit » vs « standard » à la mort.
 */
export const CARNAGE_REF_SCALE = 0.516

/** Ce que le renderer a besoin de savoir d'une mort (mappé depuis `EnemyDiedEvent`). */
export interface CarnageDeath {
  x: number
  y: number
  /** Gabarit déjà résolu par l'appelant (la sim n'a pas de notion de taille). */
  size: CarnageSize
  weapon: string | undefined
  dirX: number | undefined
  dirY: number | undefined
}

/** Compteurs exposés au rapport de fin (brief §12). */
export interface CarnageStats {
  pools: number
  criticals: number
  bySize: Record<CarnageSize, number>
  surfaceM2: number
  biggest: CarnageSize | null
}

/** Profondeur des flaques : au-dessus du sol (−10) et des décalques (−9), SOUS
 *  les débris de destructibles (−8), et très loin sous les ennemis (≈ 0). */
const POOL_DEPTH = -7.9
/** Profondeur d'une projection : c'est un accent d'impact, il passe au-dessus. */
const SPLATTER_DEPTH = 5

/**
 * MODE CARNAGE — rendu du sang.
 *
 * Vit hors de `GameScene` (qui ne fait qu'instancier et déléguer) et n'observe que
 * des événements : il ne touche jamais la simulation.
 *
 * Deux garde-fous structurent tout le module :
 *
 * 1. **Asset absent → no-op silencieux.** Jamais de forme de remplacement : le
 *    brief l'interdit explicitement (§2/§15). Un sprite improvisé serait pire que
 *    rien — il mentirait sur la DA.
 * 2. **Deux plafonds distincts.** Un débit par frame (une vague tue en paquet) ET
 *    un plafond de flaques VIVANTES en FIFO — celui-ci n'existait nulle part dans
 *    le projet, les caps existants ne bornaient que le débit. Sans lui, une longue
 *    run accumulerait les décalques sans fin.
 */
export class CarnageRenderer {
  private active = false
  /** File des flaques vivantes, de la plus ANCIENNE à la plus récente. */
  private readonly pools: Phaser.GameObjects.Image[] = []
  /** Flaques de boss : repères de la carte, évincées en dernier (brief §13). */
  private readonly bossPools = new Set<Phaser.GameObjects.Image>()
  private readonly maxPools: number
  private poolsThisFrame = 0
  private splattersThisFrame = 0
  private frameMark = -1
  private stats: CarnageStats = emptyStats()
  /** Assets manquants déjà signalés — un avertissement par clé, pas par mort. */
  private readonly warned = new Set<string>()

  constructor(
    private readonly scene: Phaser.Scene,
    isTouch: boolean
  ) {
    this.maxPools = isTouch ? CARNAGE.maxPoolsMobile : CARNAGE.maxPoolsDesktop
  }

  /** Active/désactive le mode. À OFF, `spawn` ne fait plus rien (brief §3.3) : les
   *  flaques déjà posées restent jusqu'à leur éviction normale. */
  setActive(on: boolean): void {
    this.active = on
  }

  get isActive(): boolean {
    return this.active
  }

  /**
   * Flaques actuellement VIVANTES (≠ `stats.pools`, qui est le cumul de la run).
   * C'est ce nombre que le plafond borne, et donc celui que les tests de perf
   * doivent surveiller.
   */
  get aliveCount(): number {
    return this.pools.length
  }

  /** Plafond effectif (dépend de la plateforme) — lu par les tests. */
  get cap(): number {
    return this.maxPools
  }

  /** Compteurs du rapport de fin (copie : l'appelant ne doit pas muter l'état). */
  getStats(): CarnageStats {
    return {
      ...this.stats,
      bySize: { ...this.stats.bySize },
      surfaceM2: paintedSurfaceM2(this.stats.bySize)
    }
  }

  /** Purge tout (changement de stage / restart). */
  reset(): void {
    for (const p of this.pools) {
      p.destroy()
    }
    this.pools.length = 0
    this.bossPools.clear()
    this.stats = emptyStats()
  }

  /** Une mort : projection immédiate puis flaque (brief §4). */
  spawn(death: CarnageDeath): void {
    if (!this.active) {
      return
    }
    this.tickFrameBudget()

    // Une mort critique est rare et plus spectaculaire (brief §8). `Math.random`
    // est autorisé côté rendu : rien ici n'entre dans la simulation.
    const critical = Math.random() < CARNAGE.criticalChance

    this.spawnSplatter(death, critical)
    this.spawnPool(death, critical)

    if (death.size === 'large' || death.size === 'boss') {
      this.spawnDropClusters(death)
    }
    if (critical) {
      this.stats.criticals++
      this.scene.cameras.main.shake(120, 0.006)
    }
  }

  /** Texte arcade d'une mort critique — l'appelant décide de l'afficher ou non. */
  criticalText(): string {
    return selectCriticalText({ roll: Math.random() })
  }

  /** Remet les budgets à zéro au changement de frame (patron `breakFxCount`). */
  private tickFrameBudget(): void {
    const frame = this.scene.game.getFrame()
    if (frame !== this.frameMark) {
      this.frameMark = frame
      this.poolsThisFrame = 0
      this.splattersThisFrame = 0
    }
  }

  private spawnSplatter(death: CarnageDeath, critical: boolean): void {
    // Au-delà du budget, on sacrifie la GERBE et on garde la flaque : la flaque
    // est la promesse du mode (le chantier se couvre), la gerbe n'est qu'un accent.
    if (this.splattersThisFrame >= CARNAGE.maxSplattersPerFrame) {
      return
    }
    const kind = splatterFor(death.weapon, death.size, critical)
    const key = splatterKey(kind, Math.random())
    if (!this.has(key)) {
      return
    }
    this.splattersThisFrame++

    const img = this.scene.add.image(death.x, death.y, key).setDepth(SPLATTER_DEPTH)
    // Une gerbe longue suit le coup ; les autres sont orientées au hasard —
    // sinon toutes les morts pointeraient dans la même direction.
    const aimed = kind === 'long' && death.dirX !== undefined && death.dirY !== undefined
    img.setRotation(aimed ? Math.atan2(death.dirY ?? 0, death.dirX ?? 0) : Math.random() * Math.PI * 2)
    img.setScale(CARNAGE.scaleBySize[death.size] * (critical ? 1.4 : 1))
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      duration: CARNAGE.splatterMs,
      ease: 'Quad.easeOut',
      onComplete: () => img.destroy()
    })
  }

  private spawnPool(death: CarnageDeath, critical: boolean): void {
    if (this.poolsThisFrame >= CARNAGE.maxPoolsPerFrame) {
      return
    }
    const key = poolKey(death.size, Math.random())
    if (!this.has(key)) {
      return
    }
    this.poolsThisFrame++

    const jitter = 1 + (Math.random() * 2 - 1) * CARNAGE.scaleJitter
    const scale = CARNAGE.scaleBySize[death.size] * jitter * (critical ? CARNAGE.criticalScale : 1)
    const img = this.scene.add
      .image(death.x, death.y, key)
      .setDepth(POOL_DEPTH)
      // Rotation + jitter d'échelle/opacité : sans ça, la carte finirait en
      // accumulation de jetons rouges identiques (brief §6).
      .setRotation(Math.random() * Math.PI * 2)
      .setScale(scale)
      .setAlpha(CARNAGE.poolAlpha + (Math.random() * 2 - 1) * CARNAGE.alphaJitter)

    this.pools.push(img)
    if (death.size === 'boss') {
      this.bossPools.add(img)
    }
    this.stats.pools++
    this.stats.bySize[death.size]++
    this.stats.biggest = biggestOf(this.stats.biggest, death.size)

    this.evictIfNeeded()
  }

  /** Gouttes secondaires autour des gros gabarits (brief §9.1). */
  private spawnDropClusters(death: CarnageDeath): void {
    const count = death.size === 'boss' ? CARNAGE.dropClusterCount.boss : CARNAGE.dropClusterCount.large
    for (let i = 0; i < count; i++) {
      const key = dropClusterKey(Math.random())
      if (!this.has(key)) {
        return
      }
      const a = Math.random() * Math.PI * 2
      const d = 30 + Math.random() * 60 * CARNAGE.scaleBySize[death.size]
      const img = this.scene.add
        .image(death.x + Math.cos(a) * d, death.y + Math.sin(a) * d, key)
        .setDepth(POOL_DEPTH)
        .setRotation(Math.random() * Math.PI * 2)
        .setScale(0.6 + Math.random() * 0.5)
        .setAlpha(0.85)
      // Les gouttes entrent dans la MÊME file que les flaques : sinon elles
      // échapperaient au plafond et le videraient de son sens.
      this.pools.push(img)
      this.evictIfNeeded()
    }
  }

  /**
   * Fait respecter le plafond global : au-delà, la plus ANCIENNE flaque s'efface
   * en fondu puis meurt. Jamais de purge en masse — le brief l'interdit (§13), et
   * voir la moitié du chantier se nettoyer d'un coup casserait l'illusion.
   */
  private evictIfNeeded(): void {
    while (this.pools.length > this.maxPools) {
      const idx = this.pools.findIndex((p) => !this.bossPools.has(p))
      // Que des flaques de boss (cas absurde mais possible) : on évince quand même
      // la plus ancienne, sinon la file grossirait sans fin.
      const victim = this.pools.splice(idx === -1 ? 0 : idx, 1)[0]
      if (victim === undefined) {
        return
      }
      this.bossPools.delete(victim)
      this.scene.tweens.add({
        targets: victim,
        alpha: 0,
        duration: CARNAGE.evictFadeMs,
        ease: 'Quad.easeIn',
        onComplete: () => victim.destroy()
      })
    }
  }

  /** Vrai si la texture existe. Sinon : no-op + un seul avertissement en dev. */
  private has(key: string): boolean {
    if (this.scene.textures.exists(key)) {
      return true
    }
    if (import.meta.env.DEV && !this.warned.has(key)) {
      this.warned.add(key)
      console.warn(`[carnage] asset absent, effet ignoré : ${key}`)
    }
    return false
  }
}

function emptyStats(): CarnageStats {
  return {
    pools: 0,
    criticals: 0,
    bySize: { small: 0, medium: 0, large: 0, boss: 0 },
    surfaceM2: 0,
    biggest: null
  }
}

const SIZE_ORDER: readonly CarnageSize[] = ['small', 'medium', 'large', 'boss']

function biggestOf(a: CarnageSize | null, b: CarnageSize): CarnageSize {
  return a === null || SIZE_ORDER.indexOf(b) > SIZE_ORDER.indexOf(a) ? b : a
}
