/**
 * Horloge logique à pas de temps fixe, découplée du rendu.
 *
 * Le rendu fournit un delta réel variable ; l'accumulateur le découpe en pas
 * fixes (`STEP_MS`) pour que la simulation avance toujours de quantités
 * identiques. C'est la clé du déterminisme : la logique ne voit jamais un dt
 * variable dépendant du framerate de la machine.
 */
export const STEP_MS = 1000 / 60 // 60 Hz logique

export class FixedClock {
  /** Temps logique écoulé, en millisecondes (entier de pas accumulés). */
  private elapsedMs = 0
  private accumulatorMs = 0
  private readonly stepMs: number
  /** Garde-fou anti spirale-de-la-mort si l'onglet a gelé. */
  private readonly maxStepsPerFrame: number

  constructor(stepMs: number = STEP_MS, maxStepsPerFrame = 5) {
    this.stepMs = stepMs
    this.maxStepsPerFrame = maxStepsPerFrame
  }

  /**
   * Absorbe un delta réel (ms) et retourne le nombre de pas fixes à exécuter.
   * Appeler `step()` une fois par pas retourné.
   */
  accumulate(realDeltaMs: number): number {
    this.accumulatorMs += realDeltaMs
    let steps = 0
    while (this.accumulatorMs >= this.stepMs && steps < this.maxStepsPerFrame) {
      this.accumulatorMs -= this.stepMs
      this.elapsedMs += this.stepMs
      steps++
    }
    // Si on a atteint le plafond, on jette le retard pour éviter la spirale.
    if (this.accumulatorMs > this.stepMs * this.maxStepsPerFrame) {
      this.accumulatorMs = 0
    }
    return steps
  }

  /** Durée d'un pas fixe, en ms. */
  get dt(): number {
    return this.stepMs
  }

  /** Temps logique total écoulé, en ms. */
  get elapsed(): number {
    return this.elapsedMs
  }

  /** Temps logique total écoulé, en secondes. */
  get elapsedSeconds(): number {
    return this.elapsedMs / 1000
  }
}
