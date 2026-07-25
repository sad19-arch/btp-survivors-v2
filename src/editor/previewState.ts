/**
 * État synthétique minimal pour la PRÉVISUALISATION « vie du chantier » de
 * l'éditeur. `SiteWorkers.sync()` ne lit que deux choses de l'`AppViewState` :
 *   - `players[0].x/y` : centre autour duquel il sélectionne les ~10 ouvriers
 *     à afficher (en preview : le centre de la caméra) ;
 *   - `enemies` : les ouvriers/engins fuient les ennemis (en preview : aucun,
 *     donc vie calme sans combat).
 *
 * On ne reconstruit donc PAS un AppViewState complet — on projette le strict
 * nécessaire et on caste. Pur et testable ; aucun Phaser, aucun DOM.
 */
import type { AppViewState } from '@/app/appState'

/**
 * Construit l'état de preview autour d'un point (centre caméra, coords MONDE).
 * `enemies` vide ⇒ pas de fuite ⇒ ouvriers en navette + engins qui roulent.
 */
export function buildPreviewViewState(centerX: number, centerY: number): AppViewState {
  const projection = {
    players: [{ x: centerX, y: centerY }],
    enemies: []
  }
  // Projection partielle assumée : SiteWorkers.sync ne touche que ces champs.
  return projection as unknown as AppViewState
}
