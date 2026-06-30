/**
 * Armes (data-driven). Thème : outils de chantier.
 *
 * Slice 1 : une seule arme auto-tir vers l'ennemi le plus proche.
 */
export interface WeaponDef {
  id: string
  name: string
  /** Délai entre deux tirs, en ms. */
  cooldownMs: number
  damage: number
  /** Vitesse du projectile, en px/seconde. */
  projectileSpeed: number
  /** Durée de vie du projectile, en ms. */
  projectileLifeMs: number
  /** Portée d'acquisition de cible, en px. */
  range: number
}

export const WEAPONS: Record<string, WeaponDef> = {
  cloueur: {
    id: 'cloueur',
    name: 'Cloueur',
    cooldownMs: 500,
    damage: 6,
    projectileSpeed: 520,
    projectileLifeMs: 1500,
    range: 600
  }
}
