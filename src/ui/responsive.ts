/**
 * Détection d'environnement pour le responsive/tactile (couche UI, render-side).
 *
 * Deux gates DISTINCTS, volontairement séparés :
 *  - `isTouchPrimary()` : le pointeur PRIMAIRE est un doigt (téléphone/tablette).
 *    Pilote l'affichage du stick tactile — jamais sur un desktop piloté à la souris.
 *  - `isNarrow()` : viewport étroit. Pilote la mise à l'échelle du HUD (`.ui-mobile`),
 *    et marche donc aussi sur une fenêtre desktop rétrécie. Indépendant du tactile.
 */

/** Largeur (px) en-dessous de laquelle le HUD passe en mode compact. */
export const MOBILE_BREAKPOINT = 760

/** Vrai si le pointeur principal est grossier (doigt) → device tactile. */
export function isTouchPrimary(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

/** Vrai si le viewport est étroit (défaut : < MOBILE_BREAKPOINT). */
export function isNarrow(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  return typeof window !== 'undefined' && window.innerWidth < breakpoint
}
