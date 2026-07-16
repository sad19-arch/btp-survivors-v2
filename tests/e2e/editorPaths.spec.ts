import { test, expect } from '@playwright/test'

/**
 * Découvrabilité du tracé de chemin (Stage Composer).
 *
 * Le symptôme rapporté — « je pose des points et il ne se passe rien » — n'était
 * PAS un bug de tracé : le chemin n'est validé que par `Entrée`, et `Entrée`
 * n'était écrit NULLE PART. L'indice disait seulement « clique sur la map ».
 * Ces tests verrouillent le mot qui manquait.
 */

/**
 * Le Stage Composer est un outil INTERNE de bureau (souris assumée, cf. règle 8 :
 * seul le JEU doit être 100 % manette+clavier). Sur un viewport de téléphone, ses
 * panneaux couvrent la carte et un clic « canvas » atterrit sur la palette : ce
 * n'est pas une régression, c'est une surface qu'il ne vise pas.
 */
test.beforeEach(() => {
  test.skip(test.info().project.name === 'mobile', 'éditeur = outil de bureau')
})

/** Ouvre l'éditeur sur un stage propre (le brouillon vit en localStorage). */
async function openEditor(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?editor=true')
  // Les cartes portent leur id en `title` → sélecteur stable, insensible au libellé.
  await page.waitForSelector('.sce-card[title="marker_worker_path"]', { timeout: 30_000 })
}

test('l’outil de chemin annonce la touche Entrée AVANT de valider', async ({ page }) => {
  await openEditor(page)
  await page.locator('.sce-card[title="marker_worker_path"]').click()
  const hint = page.locator('.sce-tool')
  // C'est CE texte qui manquait, et c'est toute la cause du problème rapporté.
  await expect(hint).toContainText('Entrée')
  await expect(hint).toContainText('0 point posé')
})

test('les 2 outils de chemin sont dans la MÊME section de la palette', async ({ page }) => {
  await openEditor(page)
  // Ils étaient dans « Marqueurs » et « Ouvriers & chemins » : rien ne disait
  // qu'ils allaient ensemble, ni même que le second existait.
  const worker = page.locator('.sce-card[title="marker_worker_path"]')
  const truck = page.locator('.sce-card[title="marker_truck_path"]')
  await expect(truck).toBeVisible()
  const sectionOf = async (loc: ReturnType<typeof page.locator>): Promise<string> =>
    await loc.evaluate((el) => el.closest('.sce-cat')?.querySelector('.sce-cat-head')?.textContent ?? '')
  expect(await sectionOf(worker)).toBe(await sectionOf(truck))
})

test('tracer 2 points puis Entrée crée le chemin et ouvre ses réglages', async ({ page }) => {
  await openEditor(page)
  await page.locator('.sce-card[title="marker_worker_path"]').click()

  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) {return}
  await canvas.click({ position: { x: box.width * 0.4, y: box.height * 0.5 } })
  await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.5 } })
  // Le compteur prouve que les clics ont été pris en compte — avant, rien ne le disait.
  await expect(page.locator('.sce-tool')).toContainText('2 points posés')

  await page.keyboard.press('Enter')
  // Le chemin existe ET s'ouvre sur ses réglages (« le chemin porte ses marcheurs »).
  await expect(page.locator('.sce-insp-title')).toContainText('Chemin ouvrier')
  await expect(page.locator('#path-count')).toHaveValue('1')
  await expect(page.locator('#path-speed')).toHaveValue('74')
  await expect(page.locator('#path-oneway')).not.toBeChecked()
})

test('un chemin déjà tracé se RE-sélectionne au clic sur son tracé', async ({ page }) => {
  await openEditor(page)
  await page.locator('.sce-card[title="marker_worker_path"]').click()
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) {return}
  const y = box.height * 0.5
  await canvas.click({ position: { x: box.width * 0.35, y } })
  await canvas.click({ position: { x: box.width * 0.65, y } })
  await page.keyboard.press('Enter')
  await expect(page.locator('.sce-insp-title')).toContainText('Chemin ouvrier')

  // Cliquer loin du tracé désélectionne (l'indice générique revient).
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.85 } })
  await expect(page.locator('.sce-insp-hint')).toBeVisible()

  // Cliquer SUR le tracé le re-sélectionne. Sans `pickPath`, un chemin n'était
  // sélectionnable par aucun moyen : ses réglages resteraient inatteignables dès
  // qu'on clique ailleurs une fois.
  await canvas.click({ position: { x: box.width * 0.5, y } })
  await expect(page.locator('.sce-insp-title')).toContainText('Chemin ouvrier')
  await expect(page.locator('#path-speed')).toBeVisible()
})

test('un chemin CAMION sur un stage sans camion le DIT (fini l’échec silencieux)', async ({ page }) => {
  await openEditor(page)
  await page.locator('.sce-card[title="marker_truck_path"]').click()
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) {return}
  await canvas.click({ position: { x: box.width * 0.4, y: box.height * 0.6 } })
  await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.6 } })
  await page.keyboard.press('Enter')
  // L'éditeur ouvre sur `fondations`, qui n'a pas de sprite de camion : le chemin
  // était ignoré par un `continue` MUET côté rendu. L'inspecteur l'annonce.
  await expect(page.locator('.sce-warn-err')).toContainText('pas de sprite de camion')
})
