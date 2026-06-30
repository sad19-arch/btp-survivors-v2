/**
 * Types fondamentaux du cœur de simulation.
 *
 * Repère de coordonnées (documenté pour le seam de test) :
 *   origine en haut-gauche, +x vers la droite, +y vers le bas.
 */

export type EntityId = number

export interface Vec2 {
  x: number
  y: number
}

export interface Health {
  hp: number
  maxHp: number
}

/**
 * Registre des composants ECS : nom → forme des données.
 * Ajouter un composant = ajouter une entrée ici (typage propagé partout).
 */
export interface Components {
  position: Vec2
  velocity: Vec2
  health: Health
}

export type ComponentKey = keyof Components
