/**
 * Déclaration de types minimale pour `pngjs` (pas de types fournis par le paquet).
 * Suffisant pour l'outil de QA d'assets (`qa.ts` — lecture des pixels).
 */
declare module 'pngjs' {
  export class PNG {
    width: number
    height: number
    data: Uint8Array
    static sync: {
      read(buffer: Buffer): PNG
      write(png: PNG): Buffer
    }
  }
}
