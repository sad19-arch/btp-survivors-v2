/**
 * Police bitmap 5×7 pour la signalétique de chantier, authorée en pixel pur.
 *
 * Pourquoi une police maison : PixelLab ne rend pas de texte lisible (le prompt
 * global du manifest §3 impose « no text »). Tout panneau porteur de texte
 * (« ATTENTION TRAVAUX », « 30 », « DÉVIATION ») est donc composité ici.
 *
 * Module séparé du script pour deux raisons : les générateurs de panneaux le
 * partagent, et il s'importe sans effet de bord (le script, lui, écrit des PNG
 * au chargement — un test ne peut pas l'importer).
 */

/**
 * Alphabet COMPLET : A-Z, 0-9, accents FR de la casse haute, ponctuation utile.
 *
 * Il était limité à 17 glyphes, et `drawText` retombait silencieusement sur
 * l'espace pour tout le reste : « DANGER » ou « 50 » sortaient MUETS, sans la
 * moindre erreur. Un panneau vide livré sans bruit est pire qu'un script qui
 * plante — d'où le `throw` dans `glyph()`.
 */
export const G = {
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ####', '#    ', '#    ', '#    ', '#    ', '#    ', ' ####'],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ####', '#    ', '#    ', '#  ##', '#   #', '#   #', ' ####'],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
  J: ['   ##', '    #', '    #', '    #', '    #', '#   #', ' ### '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '#   #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '# # #', '#  ##', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': ['#### ', '    #', '    #', ' ### ', '    #', '    #', '#### '],
  '4': ['#  # ', '#  # ', '#  # ', '#####', '   # ', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': [' ### ', '#    ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '    #', ' ### '],
  // Accents français : la casse haute des panneaux routiers les garde (É, È).
  É: ['  ## ', '#####', '#    ', '#### ', '#    ', '#    ', '#####'],
  È: [' ##  ', '#####', '#    ', '#### ', '#    ', '#    ', '#####'],
  Ê: [' ### ', '#####', '#    ', '#### ', '#    ', '#    ', '#####'],
  À: [' ##  ', ' ### ', '#   #', '#####', '#   #', '#   #', '#   #'],
  Ç: [' ####', '#    ', '#    ', '#    ', '#    ', ' ####', '  ## '],
  '.': ['     ', '     ', '     ', '     ', '     ', ' ##  ', ' ##  '],
  ',': ['     ', '     ', '     ', '     ', ' ##  ', ' ##  ', '#    '],
  '!': ['  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '     ', '  #  '],
  '?': [' ### ', '#   #', '    #', '   # ', '  #  ', '     ', '  #  '],
  "'": ['  #  ', '  #  ', '     ', '     ', '     ', '     ', '     '],
  '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '],
  '/': ['    #', '   # ', '   # ', '  #  ', ' #   ', ' #   ', '#    '],
  ':': ['     ', ' ##  ', ' ##  ', '     ', ' ##  ', ' ##  ', '     '],
  '(': ['   # ', '  #  ', ' #   ', ' #   ', ' #   ', '  #  ', '   # '],
  ')': [' #   ', '  #  ', '   # ', '   # ', '   # ', '  #  ', ' #   '],
  '%': ['#   #', '   # ', '   # ', '  #  ', ' #   ', ' #   ', '#   #'],
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     ']
}

/** Dimensions d'un glyphe, en pixels de police (avant mise à l'échelle `S`). */
export const GW = 5
export const GH = 7

/**
 * Résout un glyphe. JETTE si absent : un panneau muet livré en silence est le
 * pire des deux maux (c'était le comportement précédent, via `?? G[' ']`).
 */
export function glyph(ch) {
  const g = G[ch]
  if (g === undefined) {
    throw new Error(
      `signFont: glyphe manquant « ${ch} » (U+${ch.codePointAt(0).toString(16).toUpperCase()}). ` +
        `Ajoute-le à G, ou corrige le texte du panneau.`
    )
  }
  return g
}

/** Largeur d'un texte rendu à l'échelle `S`, gouttière `gap` comprise. */
export function textWidth(text, S, gap = 1) {
  return text.length * GW * S + (text.length - 1) * gap * S
}
