/**
 * Réinjection au boot des stages édités par le JOUEUR (localStorage `btp:userLayouts`)
 * dans le jeu : chaque layout sauvé est parsé puis poussé dans l'override runtime
 * (`setRuntimeLayout`) que `resolveComposedLayout` consulte côté sim ET rendu. Le
 * stage joué depuis le menu devient alors la version sauvée par le joueur.
 *
 * Couche APP (impure) : lit le store, appelle le setter avec des DONNÉES parsées.
 * Ne tourne qu'au boot du VRAI jeu (`main.ts` bootGame) ; jamais dans le harness
 * sim ni l'e2e (store vide) → déterminisme/sim:check préservés.
 */
import { parseLayout } from '../editor/StageLayoutSchema'
import { setRuntimeLayout } from '@content/runtimeLayouts'
import { listUserLayouts, getUserLayout } from '@ui/userLayouts'

export function applyUserLayouts(): void {
  for (const stage of listUserLayouts()) {
    const raw = getUserLayout(stage)
    if (raw === null) {
      continue
    }
    const res = parseLayout(raw, stage)
    if (res.ok && res.layout !== undefined) {
      setRuntimeLayout(stage, res.layout)
    }
  }
}
