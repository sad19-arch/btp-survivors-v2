/**
 * Événements de simulation observables (sim → app → rendu).
 *
 * On sous-classe `Event` (et non `CustomEvent`, indisponible sous Node) pour
 * transporter des données typées ; `Event`/`EventTarget` sont globaux côté Node
 * comme navigateur.
 */

/** Données d'une pulsation d'aura (onde de choc du marteau). */
export interface AuraPulse {
  x: number
  y: number
  radius: number
}

/** Émis à chaque impulsion d'une arme d'aura (pour un VFX d'onde de choc). */
export class AuraPulseEvent extends Event {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly radius: number
  ) {
    super('auraPulse')
  }
}
