import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parsePng } from '../../tools/assets/png'

/** PNG 1×1 transparent (RGBA, type 6). */
const ONE_PX_RGBA =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('parsePng', () => {
  it('lit les dimensions et la transparence de player_j1 (référence DA)', () => {
    const bytes = new Uint8Array(readFileSync('public/player_j1.png'))
    const info = parsePng(bytes)
    // Planche 4×4 de frames 192×192 → 768×768, RGBA (transparent).
    expect(info.width).toBe(768)
    expect(info.height).toBe(768)
    expect(info.hasAlpha).toBe(true)
  })

  it('détecte un PNG RGBA 1×1 transparent', () => {
    const bytes = Uint8Array.from(atob(ONE_PX_RGBA), (c) => c.charCodeAt(0))
    const info = parsePng(bytes)
    expect(info.width).toBe(1)
    expect(info.height).toBe(1)
    expect(info.colorType).toBe(6)
    expect(info.hasAlpha).toBe(true)
  })

  it('rejette un fichier non-PNG', () => {
    expect(() => parsePng(new Uint8Array([1, 2, 3, 4]))).toThrow()
  })
})
