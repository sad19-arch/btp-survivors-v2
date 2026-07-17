/**
 * Pont « succès débloqué → trophée à l'écran ».
 *
 * Pourquoi un ÉVÉNEMENT, et pas un champ de plus dans `AppViewState` : le
 * déblocage est un ONE-SHOT, et `getState()` a deux appelants (le seam de test,
 * qui appelle la version FRAÎCHE, et la boucle de rendu, qui passe par
 * `getStateForFrame`). Un one-shot porté par l'état serait consommé par le
 * premier appelant venu — un `getState()` du seam suffirait à faire disparaître
 * le trophée avant que l'overlay ne le voie. Un événement est diffusé à tous les
 * abonnés et ne dépend d'aucun ordre d'appel.
 *
 * Le pont est extrait de `main.ts` pour être TESTABLE : il ne connaît pas
 * l'`Overlay`, seulement un puits structurel (`AchievementToastSink`).
 */

import { ACHIEVEMENTS } from '@content/achievements'
import type { AchievementToast } from '@ui/overlay'

/** Un succès vient d'être débloqué (émis par l'App, une fois par id et par run). */
export class AchievementUnlockedEvent extends Event {
  constructor(readonly id: string) {
    super('achievementUnlocked')
  }
}

/** Ce que le pont exige de l'overlay — rien de plus (cf. `Overlay.showAchievement`). */
export interface AchievementToastSink {
  showAchievement(def: AchievementToast): void
}

/**
 * Abonne `sink` aux déblocages émis par `events` (l'`EventTarget` de l'App).
 *
 * Un id absent du catalogue est IGNORÉ silencieusement plutôt que fatal : un
 * profil écrit par une version ultérieure du jeu ne doit pas casser le titre
 * (même politique que `parseUnlocked`, cf. `src/ui/achievements.ts`).
 */
export function wireAchievementToasts(events: EventTarget, sink: AchievementToastSink): void {
  events.addEventListener('achievementUnlocked', (e) => {
    const { id } = e as AchievementUnlockedEvent
    const def = ACHIEVEMENTS.find((a) => a.id === id)
    if (def !== undefined) {
      sink.showAchievement(def)
    }
  })
}
