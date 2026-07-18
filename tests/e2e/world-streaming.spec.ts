import { test, expect } from '@playwright/test'

/**
 * Validation du streaming de décor par chunks (feat/world-streaming).
 *
 * Le monde est ×10 plus grand (10240×7680 px). Sans streaming, le nombre
 * d'objets de décor serait proportionnel à la surface (×10), avec un pic de
 * milliers d'images au boot. Avec le DecorStreamer, seuls ~16 chunks sont
 * chargés simultanément — le nombre d'objets reste BORNÉ quelle que soit la
 * distance parcourue par le joueur.
 *
 * Assertions :
 *   (a) le nombre de chunks chargés reste BORNÉ (≤ 25) quelle que soit la
 *       distance parcourue par le joueur.
 *   (b) du décor est effectivement streamé (streamer actif, pas de régression silence).
 *
 * MODE : `&lite=1` pour éviter de charger les lourdes feuilles de sprites.
 * Le décor (décalques/props) s'appuie sur des images légères qui chargent même
 * en mode lite (elles ne sont pas conditionnées par `!this.lite`).
 *
 * `&level=terrassement` (PAS le stage par défaut `terrain_vierge`) : GameScene
 * suspend tout le DecorStreamer générique (`decorSuppressed`) dès qu'un stage a
 * une composition committée (`src/content/composedLayouts.ts` — la compo apporte
 * son propre décor authoré, le streamer générique ferait doublon/conflit).
 * `terrain_vierge` EN A une depuis le passage du Stage Composer Editor ; ce test
 * cible donc un stage qui n'en a PAS pour exercer réellement le streaming —
 * sur `terrain_vierge`, `loadedChunks` resterait bloqué à 0 indéfiniment (pas un
 * problème de timing/RAF lent : la condition n'est simplement jamais vraie).
 */

test('world-streaming: le décor est borné et présent pendant le déplacement', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1&level=terrassement')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  // Attendre que le streamer ait eu au moins 1 frame réelle pour charger les chunks
  // initiaux (worldView de la caméra est valide après le premier rendu Phaser).
  // On utilise waitForFunction au lieu de advanceTime (le rendu tourne en RAF réel).
  await page.waitForFunction(
    () => (window.__GAME__?.debugDecorInfo?.()?.loadedChunks ?? 0) > 0,
    { timeout: 5000 }
  )

  // Mesure initiale : nombre d'objets de décor au spawn (centre du monde).
  const initial = await page.evaluate(() => window.__GAME__?.debugDecorInfo?.())
  expect(initial).toBeDefined()
  const initialObjects = initial?.decorObjects ?? 0
  const initialChunks = initial?.loadedChunks ?? 0

  console.log(`[world-streaming] initial: chunks=${initialChunks} objects=${initialObjects}`)

  // Le streamer doit avoir chargé des chunks (décor présent).
  expect(initialChunks).toBeGreaterThan(0)

  // Déplacer le joueur loin (vers le bas-droite) sur plusieurs secondes simulées.
  // On avance via advanceTime (sim) + des rounds d'évaluation séparés pour laisser
  // le RAF Phaser executer update() (qui appelle decorStreamer.update() tous les 4 frames).
  const measurements: number[] = [initialChunks]

  for (let step = 0; step < 20; step++) {
    await page.evaluate(() => {
      window.__GAME__?.setInput(1, { move: { x: 0.707, y: 0.707 }, attack: false, action: false })
      // ~500 ms simulées par étape (10 s total → ≈ 2000 px à 200 px/s).
      for (let i = 0; i < 31; i++) {
        window.__GAME__?.advanceTime(16)
      }
    })
    const snap = await page.evaluate(() => window.__GAME__?.debugDecorInfo?.())
    const objs = snap?.decorObjects ?? 0
    const chunks = snap?.loadedChunks ?? 0
    measurements.push(chunks)
    console.log(`[world-streaming] step=${step + 1} chunks=${chunks} objects=${objs}`)
  }

  const maxChunks = Math.max(...measurements)
  const minChunks = Math.min(...measurements)

  console.log(`[world-streaming] maxChunks=${maxChunks} minChunks=${minChunks} initial=${initialChunks}`)

  // (a) Borné : le nb de chunks ne dépasse pas 25 (vue + 1 marge de chaque côté = ≤16,
  //     on tolère 25 pour les cas de zoom/viewport variables). Sans streaming, le nombre
  //     d'objets serait de l'ordre de milliers (toute la surface du monde ×10).
  expect(maxChunks).toBeLessThanOrEqual(25)

  // (b) Le streamer est toujours actif à la fin (pas de clear() intempestif).
  const finalInfo = await page.evaluate(() => window.__GAME__?.debugDecorInfo?.())
  expect(finalInfo?.loadedChunks ?? 0).toBeGreaterThan(0)
})

test('world-streaming: le nombre de chunks chargés reste borné (≤ 25)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=42&test=1&lite=1&level=terrassement')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  // Attendre le premier chargement réel de chunks (cf. commentaire d'en-tête —
  // `terrassement`, pas `terrain_vierge`, pour ne pas retomber sur un stage composé).
  await page.waitForFunction(
    () => (window.__GAME__?.debugDecorInfo?.()?.loadedChunks ?? 0) > 0,
    { timeout: 5000 }
  )

  // Déplacer le joueur en diagonale pendant une longue distance.
  for (let step = 0; step < 30; step++) {
    await page.evaluate(() => {
      window.__GAME__?.setInput(1, { move: { x: 1, y: 0 }, attack: false, action: false })
      for (let i = 0; i < 16; i++) {
        window.__GAME__?.advanceTime(16)
      }
    })
  }

  const info = await page.evaluate(() => window.__GAME__?.debugDecorInfo?.())
  console.log(`[world-streaming] chunks chargés après déplacement: ${info?.loadedChunks ?? 'N/A'}`)

  // Le streaming garantit au plus (2+marge)² = 16 chunks (vue + 1 marge de chaque côté).
  // On tolère 25 pour les cas où le zoom réduit la taille visible à 2 chunks × 2.
  expect(info?.loadedChunks ?? 999).toBeLessThanOrEqual(25)
  expect(info?.loadedChunks ?? 0).toBeGreaterThan(0)
})
