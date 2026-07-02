/**
 * Modèle de focus pur (sans DOM) : une liste d'items sélectionnables et un
 * curseur piloté par la navigation manette/clavier. Testable en isolation.
 *
 * La navigation « boucle » (du dernier item au premier et inversement), ce qui
 * est attendu pour un menu arcade.
 */
export class FocusModel {
  private items: string[]
  private idx: number

  constructor(items: readonly string[] = [], index = 0) {
    this.items = [...items]
    this.idx = this.clamp(index)
  }

  /** Remplace la liste d'items et replace le curseur au début. */
  setItems(items: readonly string[]): void {
    this.items = [...items]
    this.idx = 0
  }

  get count(): number {
    return this.items.length
  }

  get index(): number {
    return this.items.length === 0 ? -1 : this.idx
  }

  /** Id de l'item focalisé, ou null si la liste est vide. */
  current(): string | null {
    if (this.items.length === 0) {
      return null
    }
    return this.items[this.idx] ?? null
  }

  /** Place le curseur sur un index précis (clic souris), borné à la liste. */
  setIndex(index: number): void {
    this.idx = this.clamp(index)
  }

  /** Déplace le curseur de `delta` crans (avec bouclage). */
  move(delta: number): void {
    if (this.items.length === 0) {
      return
    }
    const n = this.items.length
    this.idx = (((this.idx + delta) % n) + n) % n
  }

  private clamp(index: number): number {
    if (this.items.length === 0) {
      return 0
    }
    if (index < 0) {
      return 0
    }
    if (index >= this.items.length) {
      return this.items.length - 1
    }
    return index
  }
}
