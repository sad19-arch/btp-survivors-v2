/**
 * RNG déterministe à seed (mulberry32).
 *
 * Déterminisme: aucun appel à `Math.random()` dans le cœur. Toute source d'aléa
 * passe par une instance de `Rng`, ce qui rend chaque partie reproductible à la
 * seed près (rejouabilité, tests, harness de simulation).
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    // Force un entier 32 bits non nul.
    this.state = (seed | 0) || 0x9e3779b9
  }

  /** Prochain flottant dans [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Flottant dans [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Vrai avec une probabilité `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** Élément aléatoire d'un tableau non vide. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Rng.pick: tableau vide')
    }
    const item = items[this.int(0, items.length - 1)]
    // noUncheckedIndexedAccess: l'index est borné, donc défini.
    return item as T
  }

  /** Sérialise l'état interne (pour snapshot/restore déterministe). */
  snapshot(): number {
    return this.state
  }

  /** Restaure un état précédemment capturé. */
  restore(state: number): void {
    this.state = state | 0
  }
}
