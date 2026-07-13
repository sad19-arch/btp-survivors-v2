import type { World } from '../world'
import { HITBOX } from '@content/config'
import { destructibleDef } from '@content/destructibles'
import { dropPickup } from './reap'

/** Un destructible cassé ce pas (position + type) — pour le VFX/débris côté rendu. */
export interface BrokenDestructible {
  x: number
  y: number
  typeId: string
}

/**
 * Casse au CONTACT : tout destructible qu'un joueur vivant chevauche est détruit
 * instantanément (`health.hp = 0`), récolté ensuite par `reapDestructibles`.
 * Pur/déterministe. Complète la casse par les armes (grille de dégât).
 */
export function destructibleContactSystem(world: World): void {
  const players: Array<{ x: number; y: number }> = []
  for (const p of world.query('player', 'position', 'health')) {
    const pos = world.get(p, 'position')
    const h = world.get(p, 'health')
    if (pos !== undefined && h !== undefined && h.hp > 0) {
      players.push({ x: pos.x, y: pos.y })
    }
  }
  if (players.length === 0) {
    return
  }
  for (const e of world.query('destructible', 'position', 'health')) {
    const health = world.get(e, 'health')
    const pos = world.get(e, 'position')
    const comp = world.get(e, 'destructible')
    if (health === undefined || pos === undefined || comp === undefined || health.hp <= 0) {
      continue
    }
    const r = HITBOX.player + (destructibleDef(comp.typeId)?.radius ?? 32)
    const r2 = r * r
    for (const pl of players) {
      if ((pl.x - pos.x) ** 2 + (pl.y - pos.y) ** 2 <= r2) {
        health.hp = 0
        break
      }
    }
  }
}

/**
 * Récolte les destructibles détruits (hp ≤ 0) : lâche leur contenu en pièces
 * (`coinDrop` PRÉ-TIRÉ au spawn → déterministe, pas de RNG ici), collecte
 * `{x,y,typeId}` pour le VFX/débris, puis despawn. Ce ne sont PAS des ennemis :
 * aucun XP, aucun kill, aucun score.
 */
export function reapDestructibles(world: World, broken: BrokenDestructible[]): void {
  const dead: number[] = []
  for (const e of world.query('destructible', 'health')) {
    const h = world.get(e, 'health')
    if (h !== undefined && h.hp <= 0) {
      dead.push(e)
    }
  }
  for (const e of dead) {
    const pos = world.get(e, 'position')
    const comp = world.get(e, 'destructible')
    if (pos !== undefined && comp !== undefined) {
      broken.push({ x: pos.x, y: pos.y, typeId: comp.typeId })
      // Gerbe de pièces en anneau (décalages DÉTERMINISTES par index, aucun RNG).
      const n = comp.coinDrop
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * Math.PI * 2
        const rr = 10 + (i % 3) * 8
        dropPickup(world, { x: pos.x + Math.cos(a) * rr, y: pos.y + Math.sin(a) * rr }, 'coin', 1)
      }
    }
    world.despawn(e)
  }
}
