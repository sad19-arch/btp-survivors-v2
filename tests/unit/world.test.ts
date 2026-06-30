import { describe, it, expect } from 'vitest'
import { World } from '@core/world'

describe('World (ECS-lite)', () => {
  it('spawns entities with unique ids', () => {
    const w = new World()
    const a = w.spawn()
    const b = w.spawn()
    expect(a).not.toBe(b)
    expect(w.alive(a)).toBe(true)
    expect(w.alive(b)).toBe(true)
  })

  it('adds and reads components', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 3, y: 4 })
    expect(w.get(e, 'position')).toEqual({ x: 3, y: 4 })
    expect(w.has(e, 'position')).toBe(true)
    expect(w.has(e, 'velocity')).toBe(false)
  })

  it('removes a single component', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 0, y: 0 })
    w.remove(e, 'position')
    expect(w.has(e, 'position')).toBe(false)
    expect(w.get(e, 'position')).toBeUndefined()
  })

  it('despawn removes the entity and all its components', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 0, y: 0 })
    w.add(e, 'health', { hp: 10, maxHp: 10 })
    w.despawn(e)
    expect(w.alive(e)).toBe(false)
    expect(w.get(e, 'position')).toBeUndefined()
    expect(w.get(e, 'health')).toBeUndefined()
  })

  it('query returns only entities having ALL given components', () => {
    const w = new World()
    const a = w.spawn()
    w.add(a, 'position', { x: 0, y: 0 })
    w.add(a, 'velocity', { x: 1, y: 1 })
    const b = w.spawn()
    w.add(b, 'position', { x: 0, y: 0 })
    const ids = [...w.query('position', 'velocity')]
    expect(ids).toContain(a)
    expect(ids).not.toContain(b)
  })

  it('count reflects living entities', () => {
    const w = new World()
    expect(w.count).toBe(0)
    const a = w.spawn()
    w.spawn()
    expect(w.count).toBe(2)
    w.despawn(a)
    expect(w.count).toBe(1)
  })
})
