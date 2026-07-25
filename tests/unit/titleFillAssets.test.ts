import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DROP_POOL } from '@/ui/titleFillAssets'

/**
 * Le décor titre « pluie d'assets » charge ses images par `<img>`/`background-image`
 * depuis `public/`, hors préchargement Phaser : un chemin cassé donne un 404
 * silencieux (item invisible). Ce test ferme le trou — chaque `src` du pool doit
 * exister — et vérifie la cohérence des métadonnées (aspect fini > 0, grille valide).
 */

const PUBLIC_DIR = resolve(__dirname, '../../public')

describe('DROP_POOL du décor titre', () => {
  it('le pool n’est pas vide', () => {
    expect(DROP_POOL.length).toBeGreaterThan(20)
  })

  it.each(DROP_POOL.map((d) => d.src))('%s existe dans public/', (src) => {
    expect(existsSync(resolve(PUBLIC_DIR, src))).toBe(true)
  })

  it('métadonnées cohérentes (aspect > 0, frame valide, weight > 0)', () => {
    for (const d of DROP_POOL) {
      expect(Number.isFinite(d.aspect)).toBe(true)
      expect(d.aspect).toBeGreaterThan(0)
      if (d.weight !== undefined) {
        expect(d.weight).toBeGreaterThan(0)
      }
      if (d.frame !== undefined) {
        expect(d.frame.cols).toBeGreaterThanOrEqual(1)
        expect(d.frame.rows).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
