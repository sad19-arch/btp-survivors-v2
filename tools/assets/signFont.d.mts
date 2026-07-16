/**
 * Types de `signFont.mjs`. Le module est en JS pur (les outils d'authoring ne
 * passent pas par le build du jeu), mais le test Vitest, lui, est typé strict :
 * sans ces déclarations, chaque appel remonte en « unsafe call » au lint.
 */

/** Table des glyphes : caractère → 7 lignes de 5 colonnes (`#` = pixel encré). */
export declare const G: Record<string, string[]>

/** Largeur d'un glyphe en pixels de police. */
export declare const GW: number

/** Hauteur d'un glyphe en pixels de police. */
export declare const GH: number

/** Résout un glyphe. JETTE si le caractère est absent de la police. */
export declare function glyph(ch: string): string[]

/** Largeur d'un texte rendu à l'échelle `S`, gouttière `gap` comprise. */
export declare function textWidth(text: string, S: number, gap?: number): number
