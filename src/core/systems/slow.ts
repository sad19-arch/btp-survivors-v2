import type { World } from '../world'

/**
 * Système de ralentissement (1er effet de contrôle du jeu).
 *
 * Décrémente `remainingMs` de chaque ennemi portant le composant `slow`.
 * Retire le composant quand `remainingMs ≤ 0`.
 *
 * Doit être appelé AVANT `enemyAiSystem` dans la boucle de simulation pour
 * que le slow expiré ce pas-ci n'affecte plus la vélocité du même pas.
 */
export function slowSystem(world: World, dtMs: number): void {
  const expired: number[] = []
  for (const e of world.query('slow')) {
    const slow = world.get(e, 'slow')
    if (slow === undefined) {
      continue
    }
    slow.remainingMs -= dtMs
    if (slow.remainingMs <= 0) {
      expired.push(e)
    }
  }
  for (const e of expired) {
    world.remove(e, 'slow')
  }
}
