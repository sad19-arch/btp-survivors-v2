import { Rumbler, RUMBLE } from '@input/rumble'
import type { ChestOpenedEvent } from '@core/events'

/**
 * Chef d'orchestre du rumble (juice #2) — miroir de l'AudioDirector : abonné au bus
 * `app.events`, il traduit les événements sémantiques en secousses. Observationnel :
 * n'altère jamais la simulation. Créé une fois (main.ts), inerte en test/headless
 * (le Rumbler est null → jamais instancié).
 *
 *  - `enemyKilled`  → tic léger (throttlé par le Rumbler : une vague ne mitraille pas).
 *  - `playerHurt`   → secousse moyenne (prioritaire).
 *  - `bossSpawned`  → forte (l'arrivée du contremaître se sent).
 *  - `evolved`      → forte (gros moment de puissance).
 *  - `chestOpened`  → forte, plus longue si super-coffre (pic dopamine casino).
 */
export class RumbleDirector {
  constructor(
    private readonly rumbler: Rumbler,
    events: EventTarget
  ) {
    events.addEventListener('enemyKilled', () => this.rumbler.play(RUMBLE.kill))
    events.addEventListener('playerHurt', () => this.rumbler.play(RUMBLE.hurt, true))
    events.addEventListener('bossSpawned', () => this.rumbler.play(RUMBLE.boss, true))
    events.addEventListener('evolved', () => this.rumbler.play(RUMBLE.evolve, true))
    events.addEventListener('chestOpened', (e) => {
      const isSuper = (e as ChestOpenedEvent).isSuper
      this.rumbler.play(isSuper ? RUMBLE.chestSuper : RUMBLE.chest, true)
    })
    // Palier de 100 kills (juice #8) : petite secousse de récompense.
    events.addEventListener('milestone', () => this.rumbler.play(RUMBLE.milestone, true))
  }
}
