/**
 * Stub minimal de Phaser pour l'audit d'atteignabilité (hors navigateur).
 *
 * Le vrai module Phaser tire tout le moteur WebGL/canvas à l'import — impossible
 * à charger sous `tsx`/Node. Or `SiteWorkers.reset()` (le SEUL code de prod que
 * cet outil exécute côté rendu) n'utilise de Phaser que `Phaser.Math.Clamp`, et
 * seulement dans `sync()` — jamais dans `reset()`. On substitue donc un stub qui
 * expose exactement cette surface. C'est la MÊME parade que le test de prod
 * (`tests/unit/ambientReachability.test.ts`, `vi.mock('phaser', …)`) : on ne
 * ré-implémente pas la logique auditée, on neutralise juste sa dépendance moteur.
 */
const Phaser = {
  Math: {
    Clamp: (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
  }
}

export default Phaser
