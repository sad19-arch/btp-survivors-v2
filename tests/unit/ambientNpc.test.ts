import { describe, it, expect } from 'vitest'
import { shouldBubble } from '@render/ambientNpc'

describe('ambientNpc (pur)', () => {
  it('shouldBubble sous 150px', () => {
    expect(shouldBubble(120)).toBe(true)
    expect(shouldBubble(200)).toBe(false)
  })
})
