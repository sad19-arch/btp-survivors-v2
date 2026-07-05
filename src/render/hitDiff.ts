import type { EnemyState } from '@core/types'

export interface HitEvent {
  id: number
  amount: number
}

/**
 * Calcule les événements de dégâts depuis la frame précédente.
 * Un ennemi ABSENT de `prev` est considéré comme nouveau (spawn) → aucun événement.
 * Seules les pertes de PV produisent un événement (amount > 0).
 * Fonction pure, sans effet de bord, testable sans Phaser.
 */
export function computeHitEvents(prev: Map<number, number>, enemies: ReadonlyArray<EnemyState>): HitEvent[] {
  const events: HitEvent[] = []
  for (const en of enemies) {
    const prevHp = prev.get(en.id)
    if (prevHp === undefined) {
      // Ennemi nouveau (spawn) → pas d'événement
      continue
    }
    const amount = prevHp - en.hp
    if (amount > 0) {
      events.push({ id: en.id, amount })
    }
  }
  return events
}
