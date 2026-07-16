import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Les images de l'overlay DOM sont chargées par `<img src="...">` depuis `public/`,
 * SANS passer par le préchargement Phaser. Rien ne les valide donc au boot : un
 * fichier renommé ou absent donne un 404 silencieux et une image cassée à l'écran,
 * qu'aucun test unitaire ni e2e ne capte (les e2e n'assertent que le DOM, et le
 * screenshot n'est comparé à aucune golden).
 *
 * Ce test ferme ce trou : chaque `src` référencé par l'overlay doit exister.
 */

const PUBLIC_DIR = resolve(__dirname, '../../public')

/** Fichiers référencés en dur par `reviveRenderer`/`reportPanel`/`starRow` de l'overlay. */
const REFERENCED_ASSETS = [
  // Barre de progression du rapport de fin
  'ui_death_start.png',
  'ui_death_marker.png',
  'ui_death_flag.png',
  // Podium co-op
  'ui_trophy.png',
  'ui_cross_red.png',
  // Étoiles de fin de stage
  'ui_star_on.png',
  'ui_star_off.png',
  // Invite de relève co-op (rendue par Phaser, mais même exigence de présence)
  'ui_btn_a.png',
  'ui_key_e.png',
]

describe('assets UI référencés par l’overlay', () => {
  it.each(REFERENCED_ASSETS)('%s existe dans public/', (file) => {
    expect(existsSync(resolve(PUBLIC_DIR, file))).toBe(true)
  })
})
