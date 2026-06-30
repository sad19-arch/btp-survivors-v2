/**
 * Parseur d'en-tête PNG minimal (sans dépendance) : largeur, hauteur, type de
 * couleur et présence d'un canal/clé de transparence. Suffisant pour la QA
 * d'assets (dimensions + transparence) sans décoder l'image.
 */
export interface PngInfo {
  width: number
  height: number
  /** Type de couleur PNG (0,2,3,4,6). */
  colorType: number
  /** Vrai si l'image porte de la transparence (alpha ou chunk tRNS). */
  hasAlpha: boolean
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Lit un entier big-endian 32 bits. */
function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0
}

/** Analyse l'en-tête d'un PNG. Lève une erreur si la signature est invalide. */
export function parsePng(bytes: Uint8Array): PngInfo {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) {
      throw new Error('Signature PNG invalide')
    }
  }
  // Le chunk IHDR suit immédiatement la signature : longueur(4) + "IHDR"(4) + data(13).
  const width = readU32(bytes, 16)
  const height = readU32(bytes, 20)
  const colorType = bytes[25] ?? 0

  // Alpha intrinsèque pour les types 4 (gris+alpha) et 6 (RGBA).
  let hasAlpha = colorType === 4 || colorType === 6
  // Sinon, transparence possible via un chunk tRNS (palette/clé couleur).
  if (!hasAlpha && hasChunk(bytes, 'tRNS')) {
    hasAlpha = true
  }

  return { width, height, colorType, hasAlpha }
}

/** Cherche la présence d'un chunk nommé en parcourant les chunks PNG. */
function hasChunk(bytes: Uint8Array, name: string): boolean {
  let offset = 8 // après la signature
  const target = [name.charCodeAt(0), name.charCodeAt(1), name.charCodeAt(2), name.charCodeAt(3)]
  while (offset + 8 <= bytes.length) {
    const len = readU32(bytes, offset)
    const t0 = bytes[offset + 4]
    const t1 = bytes[offset + 5]
    const t2 = bytes[offset + 6]
    const t3 = bytes[offset + 7]
    if (t0 === target[0] && t1 === target[1] && t2 === target[2] && t3 === target[3]) {
      return true
    }
    if (t0 === 0x49 && t1 === 0x45 && t2 === 0x4e && t3 === 0x44) {
      return false // IEND : fin
    }
    offset += 12 + len // longueur(4) + type(4) + data(len) + crc(4)
  }
  return false
}
