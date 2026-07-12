/**
 * Profileur de temps de frame — COUCHE RENDU uniquement. Accumule des durées par
 * section nommée sur une fenêtre glissante et expose des moyennes. `performance.now()`
 * autorisé ici (jamais dans src/core). Aucun effet sur la simulation.
 */
export interface PerfSnapshot {
  /** ms moyens par section (sim, hordeSync, phaserRender…). */
  sections: Record<string, number>
  /** Compteurs instantanés (enemies, objets, drawCalls…). */
  counts: Record<string, number>
}

const WINDOW = 60 // frames de moyenne glissante

export class PerfProbe {
  private readonly ring = new Map<string, number[]>()
  private readonly counts = new Map<string, number>()
  private readonly now: () => number

  constructor(now: () => number = () => performance.now()) {
    this.now = now
  }

  /** Chronomètre `fn` sous le nom `name` et renvoie son résultat. */
  measure<T>(name: string, fn: () => T): T {
    const start = this.now()
    const r = fn()
    this.record(name, this.now() - start)
    return r
  }

  /** Enregistre un compteur instantané (dernier écrasant). */
  count(name: string, value: number): void {
    this.counts.set(name, value)
  }

  private record(name: string, ms: number): void {
    let arr = this.ring.get(name)
    if (arr === undefined) {
      arr = []
      this.ring.set(name, arr)
    }
    arr.push(ms)
    if (arr.length > WINDOW) {
      arr.shift()
    }
  }

  snapshot(): PerfSnapshot {
    const sections: Record<string, number> = {}
    for (const [k, arr] of this.ring) {
      let sum = 0
      for (const x of arr) {
        sum += x
      }
      sections[k] = arr.length > 0 ? Math.round((sum / arr.length) * 100) / 100 : 0
    }
    const counts: Record<string, number> = {}
    for (const [k, v] of this.counts) {
      counts[k] = v
    }
    return { sections, counts }
  }
}
