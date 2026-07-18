/**
 * Sélecteur de lettres arcade (saisie du prénom en fin de run, top 20 des
 * high scores — cf. [[hiscores]]). Module PUR : aucune fonction n'exige la
 * souris (règle CLAUDE.md #8), et le vocabulaire d'entrée manette/clavier
 * (`NavAction`, cf. `src/input/intents.ts`) ne connaît que up/down/left/right
 * — c'est ce module qui leur donne un sens dans cet écran :
 *  - haut/bas → `cycleChar` (fait défiler la lettre de la case focalisée) ;
 *  - gauche/droite → `moveCursor` (change de case).
 *
 * Toutes les fonctions sont pures : elles renvoient un NOUVEL état sans
 * jamais muter celui reçu en argument — c'est ce qui les rend testables
 * sans navigateur (aucun DOM, aucun `window`, aucun `localStorage` ici).
 */

/** Nombre de cases de saisie (borne dure, jamais dépassée). */
export const NAME_ENTRY_LENGTH = 8

/**
 * Alphabet du sélecteur : espace (case « vide »), puis A-Z, puis 0-9.
 * L'espace en tête donne l'état neutre (index 0 = case vide) utilisé par
 * `emptyNameEntry`/`clearChar`.
 */
export const NAME_ENTRY_ALPHABET: readonly string[] = [
  ' ',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'0123456789'.split('')
]

/**
 * État du sélecteur : `chars` = 8 index dans `NAME_ENTRY_ALPHABET` (une
 * entrée par case), `cursor` = case actuellement focalisée (0..7).
 */
export interface NameEntryState {
  chars: number[]
  cursor: number
}

/** État initial : 8 cases vides (espace), curseur sur la première case. */
export function emptyNameEntry(): NameEntryState {
  return { chars: new Array<number>(NAME_ENTRY_LENGTH).fill(0), cursor: 0 }
}

/**
 * Déplace le curseur de `d` case(s). BORNÉ à [0, 7] — ne boucle PAS.
 *
 * Asymétrie délibérée avec `cycleChar` : si le curseur bouclait, un joueur
 * qui pousse à droite depuis la dernière case reviendrait à la première
 * sans s'en rendre compte, et raterait la validation de son nom.
 */
export function moveCursor(s: NameEntryState, d: -1 | 1): NameEntryState {
  const next = Math.min(NAME_ENTRY_LENGTH - 1, Math.max(0, s.cursor + d))
  return { chars: [...s.chars], cursor: next }
}

/**
 * Fait défiler la lettre de la case focalisée. BOUCLE aux deux bouts
 * (après le dernier caractère de l'alphabet on revient au premier, et
 * inversement) — c'est le geste arcade attendu.
 */
export function cycleChar(s: NameEntryState, d: -1 | 1): NameEntryState {
  const n = NAME_ENTRY_ALPHABET.length
  const chars = [...s.chars]
  const current = chars[s.cursor] ?? 0
  chars[s.cursor] = ((current + d) % n + n) % n
  return { chars, cursor: s.cursor }
}

/** Remet la case focalisée à vide (espace), sans déplacer le curseur. */
export function clearChar(s: NameEntryState): NameEntryState {
  const chars = [...s.chars]
  chars[s.cursor] = 0
  return { chars, cursor: s.cursor }
}

/** Nom saisi, résolu en chaîne : trimé, jamais plus long que 8 caractères. */
export function nameOf(s: NameEntryState): string {
  const raw = s.chars.map((i) => NAME_ENTRY_ALPHABET[i] ?? ' ').join('')
  return raw.trim().slice(0, NAME_ENTRY_LENGTH)
}
