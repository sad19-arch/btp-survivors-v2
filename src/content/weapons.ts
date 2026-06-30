/**
 * Armes (data-driven). Thème : outils de chantier.
 *
 * MVP (PRD) : 3 armes aux silhouettes distinctes —
 *  - `cloueur` (projectile) : tir auto vers l'ennemi le plus proche.
 *  - `scie`    (orbital)    : lames qui tournent autour du joueur.
 *  - `marteau` (aura)       : onde de choc circulaire périodique.
 */
export type WeaponKind = 'projectile' | 'orbital' | 'aura'

export interface WeaponDef {
  id: string
  name: string
  kind: WeaponKind
  /** Délai entre deux « tirs » / impulsions de dégâts, en ms. */
  cooldownMs: number
  damage: number
  /** Portée d'acquisition (projectile) ou rayon d'effet (aura), en px. */
  range: number
  // --- projectile uniquement ---
  /** Vitesse du projectile, en px/seconde. */
  projectileSpeed?: number
  /** Durée de vie du projectile, en ms. */
  projectileLifeMs?: number
  // --- orbital uniquement ---
  /** Nombre de lames en orbite. */
  orbitCount?: number
  /** Rayon de l'orbite, en px. */
  orbitRadius?: number
  /** Vitesse angulaire, en radians/seconde. */
  orbitSpeed?: number
  /** Rayon de touche d'une lame, en px. */
  orbitHitRadius?: number
}

export const WEAPONS: Record<string, WeaponDef> = {
  cloueur: {
    id: 'cloueur',
    name: 'Cloueur',
    kind: 'projectile',
    cooldownMs: 500,
    damage: 4,
    range: 600,
    projectileSpeed: 520,
    projectileLifeMs: 1500
  },
  scie: {
    id: 'scie',
    name: 'Scie orbitale',
    kind: 'orbital',
    cooldownMs: 250, // cadence des dégâts
    damage: 4,
    range: 0,
    orbitCount: 2,
    orbitRadius: 72,
    orbitSpeed: 3.2,
    orbitHitRadius: 18
  },
  marteau: {
    id: 'marteau',
    name: 'Marteau de zone',
    kind: 'aura',
    cooldownMs: 900,
    damage: 10,
    range: 120 // rayon de l'onde
  }
}
