import type { ComponentKey, Components, EntityId } from './types'

/**
 * World ECS-lite : stockage des entités et de leurs composants.
 *
 * - Entité = identifiant numérique (pas d'objet lourd).
 * - Composant = donnée pure rangée dans un store par type (`Map<EntityId, T>`).
 * - Les systèmes interrogent le World via `query(...keys)` puis lisent/écrivent.
 *
 * Aucune logique de jeu ici : seulement du stockage et des requêtes.
 */
export class World {
  private nextId: EntityId = 1
  private readonly living = new Set<EntityId>()
  private readonly stores = new Map<ComponentKey, Map<EntityId, unknown>>()

  /** Crée une entité vivante et renvoie son id unique. */
  spawn(): EntityId {
    const id = this.nextId
    this.nextId += 1
    this.living.add(id)
    return id
  }

  /** Vrai si l'entité est vivante (non despawn). */
  alive(e: EntityId): boolean {
    return this.living.has(e)
  }

  /** Nombre d'entités vivantes. */
  get count(): number {
    return this.living.size
  }

  /** Attache (ou remplace) un composant typé sur une entité. */
  add<K extends ComponentKey>(e: EntityId, key: K, value: Components[K]): void {
    let store = this.stores.get(key)
    if (store === undefined) {
      store = new Map<EntityId, unknown>()
      this.stores.set(key, store)
    }
    store.set(e, value)
  }

  /** Lit un composant, ou `undefined` si absent. */
  get<K extends ComponentKey>(e: EntityId, key: K): Components[K] | undefined {
    const store = this.stores.get(key)
    if (store === undefined) {
      return undefined
    }
    return store.get(e) as Components[K] | undefined
  }

  /** Vrai si l'entité porte ce composant. */
  has(e: EntityId, key: ComponentKey): boolean {
    return this.stores.get(key)?.has(e) ?? false
  }

  /** Détache un composant d'une entité. */
  remove(e: EntityId, key: ComponentKey): void {
    this.stores.get(key)?.delete(e)
  }

  /** Supprime l'entité et tous ses composants. */
  despawn(e: EntityId): void {
    this.living.delete(e)
    for (const store of this.stores.values()) {
      store.delete(e)
    }
  }

  /** Itère les entités possédant TOUS les composants demandés. */
  *query(...keys: ComponentKey[]): IterableIterator<EntityId> {
    if (keys.length === 0) {
      yield* this.living
      return
    }

    const stores: Map<EntityId, unknown>[] = []
    for (const key of keys) {
      const store = this.stores.get(key)
      if (store === undefined) {
        return // aucune entité ne porte ce composant
      }
      stores.push(store)
    }

    // Itère le plus petit store pour limiter le travail.
    let smallest = stores[0]
    if (smallest === undefined) {
      return
    }
    for (const store of stores) {
      if (store.size < smallest.size) {
        smallest = store
      }
    }

    for (const e of smallest.keys()) {
      let hasAll = true
      for (const store of stores) {
        if (!store.has(e)) {
          hasAll = false
          break
        }
      }
      if (hasAll) {
        yield e
      }
    }
  }
}
