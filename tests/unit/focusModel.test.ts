import { describe, it, expect } from 'vitest'
import { FocusModel } from '@ui/focusModel'

describe('FocusModel', () => {
  it('commence sur le premier item', () => {
    const f = new FocusModel(['a', 'b', 'c'])
    expect(f.index).toBe(0)
    expect(f.current()).toBe('a')
  })

  it('avance et recule', () => {
    const f = new FocusModel(['a', 'b', 'c'])
    f.move(1)
    expect(f.current()).toBe('b')
    f.move(1)
    expect(f.current()).toBe('c')
    f.move(-1)
    expect(f.current()).toBe('b')
  })

  it('boucle aux extrémités', () => {
    const f = new FocusModel(['a', 'b', 'c'])
    f.move(-1)
    expect(f.current()).toBe('c') // depuis le 1er, recule → dernier
    f.move(1)
    expect(f.current()).toBe('a') // depuis le dernier, avance → 1er
  })

  it('gère une liste vide', () => {
    const f = new FocusModel([])
    expect(f.index).toBe(-1)
    expect(f.current()).toBeNull()
    f.move(1) // ne plante pas
    expect(f.current()).toBeNull()
  })

  it('setItems replace le curseur au début', () => {
    const f = new FocusModel(['a', 'b', 'c'], 2)
    expect(f.current()).toBe('c')
    f.setItems(['x', 'y'])
    expect(f.index).toBe(0)
    expect(f.current()).toBe('x')
  })
})
