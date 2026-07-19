/**
 * Hook de résolution de modules Node : redirige le specifier nu `phaser` vers le
 * stub local (`phaserStub.ts`). Enregistré depuis `reachability.ts` AVANT tout
 * import qui tire `@render/*`, pour que le module `siteWorkers` reçoive le stub
 * au lieu du vrai moteur Phaser (inchargeable hors navigateur).
 *
 * On n'intercepte QUE `phaser` exactement — les sous-chemins (`phaser/...`) et
 * tout le reste passent au résolveur suivant intact.
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const STUB_URL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'phaserStub.ts')).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'phaser') {
    return { url: STUB_URL, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
