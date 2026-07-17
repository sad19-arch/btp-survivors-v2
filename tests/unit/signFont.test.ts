import { describe, it, expect } from 'vitest'
// Outil d'authoring en .mjs pur (hors du build du jeu) ; typé par signFont.d.ts.
import { G, glyph, GW, GH, textWidth } from '../../tools/assets/signFont.mjs'

/**
 * La signalétique de chantier est composée en pixel pur (PixelLab ne rend pas de
 * texte lisible). Le piège que ce test ferme : la police retombait silencieusement
 * sur l'espace pour tout glyphe absent (`G[ch] ?? G[' ']`), et elle n'avait que
 * 17 glyphes. « DANGER » ou « 50 » sortaient donc MUETS — un panneau vierge livré
 * sans la moindre erreur. C'est le pire mode de défaillance possible pour un
 * générateur d'assets : invisible en CI, visible seulement en jeu.
 */
describe('signFont — police 5×7 des panneaux', () => {
  it('JETTE sur un glyphe absent, au lieu de rendre un blanc silencieux', () => {
    expect(() => glyph('€')).toThrow(/glyphe manquant/)
    // Le message doit nommer le caractère ET son point de code : sans ça, un
    // glyphe invisible (espace insécable…) serait indébogable.
    expect(() => glyph('€')).toThrow(/U\+20AC/)
  })

  it('couvre tout le texte que les panneaux de chantier réclament', () => {
    const panneaux = [
      'TRAVAUX', 'DÉVIATION', 'ROUTE BARRÉE', 'CHAUSSÉE RÉTRÉCIE', 'DANGER',
      'PASSAGE PIÉTON', 'HOMMES AU TRAVAIL', 'SORTIE DE CAMIONS',
      'INTERDIT AU PUBLIC', 'PORT DU CASQUE', 'FIN DE CHANTIER',
      'CÉDEZ LE PASSAGE', 'PERMIS DE CONSTRUIRE', 'ATTENTION', '30', '50'
    ]
    for (const texte of panneaux) {
      expect(() => [...texte].forEach((ch) => glyph(ch)), `panneau « ${texte} »`).not.toThrow()
    }
  })

  it('rend chaque glyphe à la grille 5×7 exacte', () => {
    // Une ligne trop courte décalerait tout le texte à sa droite sans rien casser
    // d'autre — d'où la vérification exhaustive.
    for (const [ch, rows] of Object.entries(G)) {
      expect(rows.length, `hauteur de « ${ch} »`).toBe(GH)
      for (const row of rows) {
        expect(row.length, `largeur d’une ligne de « ${ch} »`).toBe(GW)
        expect(row, `« ${ch} » n’utilise que « # » et l’espace`).toMatch(/^[# ]+$/)
      }
    }
  })

  it('mesure la largeur en tenant compte de la gouttière', () => {
    // 1 glyphe : pas de gouttière. 3 glyphes à l'échelle 2 : 3×5×2 + 2×1×2 = 34.
    expect(textWidth('A', 1)).toBe(GW)
    expect(textWidth('ABC', 2)).toBe(34)
  })
})
