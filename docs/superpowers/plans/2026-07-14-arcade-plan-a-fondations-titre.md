# Refonte arcade — Plan A (Fondations + Titre + Fix level-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations DA arcade partagées, refaire l'écran titre en style arcade Metal-Slug, et corriger le bug de z-index des cartes de level-up — première tranche autonome et testable de la refonte « BTP Carnage ».

**Architecture:** Couche DOM only (`src/ui/overlay.ts` via helper `h()` + `src/ui/styles.ts` + `index.html`), plus un timer d'attract-mode dans `src/app/app.ts`. La sim (`src/core`) n'est jamais touchée → `sim:check` reste VERT par construction. La maquette `integration/design-ref/Menus BTP Survivors.dc.html` (planches 2a, 2d) est la référence hi-fi ; on en recrée le rendu avec les classes CSS existantes.

**Tech Stack:** TypeScript strict, Phaser (observateur), couche UI DOM maison (`h()`), Vitest (happy-dom), Playwright (seam headless `?test=1&lite=1`), fontes Google (CDN).

## Global Constraints

- NE PAS modifier `src/core/**`, `src/content/config.ts` (valeurs gameplay), `src/ui/palette.ts`. (verbatim spec)
- CONSERVER tous les noms de classes CSS existants de `overlay.ts`.
- `npm run type-check` = 0 erreur TS ; `npm run lint` = 0 warning ; `npm run test` (Vitest) vert ; `npm run build` OK.
- DA 16-bit stricte : pas d'emoji UI, pas d'`innerHTML` interpolé (uniquement `h()`), coins carrés, panneaux pixel.
- Ne PAS remplacer `src/ui/styles.ts` par le v1 du zip (régression) — on ÉTEND l'existant.
- Fontes arcade : `Jersey 25` (logo/titres), `Pixelify Sans` 400–700 (corps), `Press Start 2P` (badges), `VT323` (HUD arcade). Jersey+Pixelify déjà chargées.
- Couleurs arcade (locales à `styles.ts`, JAMAIS dans `palette.ts`) : jaune `#FFD24A`/`#FFF4CC`/`#FFE9A8` · orange `#E86F1F`/`#F26A22` (ombres `#C85A12`/`#9c440d`/`#6e2f08`/`#4a1404`) · rouge `#D83B2D` · contour `#101014` · bruns `#2B2018`/`#241C16`/`#17120E` · crème `#EAD9B8`/`#E8B27A`.
- Assets zip à copier dans `public/` : `metal_v.png`, `dither_light.png`, `dither_dark.png`, `bg_dusk.png`, `casque.png` (source : `Design menu BTP Carnage.zip` → `integration/public/`).
- Le HI-SCORE de l'écran titre se persiste en `localStorage` (clé `btp:hiscore`).

---

## Contexte de départ (à lire avant Task 1)

- L'UI DOM se construit dans `src/ui/overlay.ts` avec le helper `h(tag, {className, text, attrs, children})` (voir `src/ui/h.ts`). `titlePanel(state)` (~ligne 434) rend l'écran titre ; il retourne un `HTMLElement` inséré dans `this.screenLayer`.
- Les styles sont un gros template-string exporté par `src/ui/styles.ts` (fonction `injectStyles()` / constante CSS) qui référence `PALETTE` (import `./palette`). On AJOUTE des règles ; on ne réécrit pas le fichier.
- Le seam de test expose `window.__GAME__` (`getState()`, `nav()`, `confirm()`, etc.). Les e2e vivent dans `tests/e2e/*.spec.ts` et démarrent via `page.goto('/?autostart=…&test=1&lite=1')` puis `page.waitForFunction(() => window.__GAME__?.ready === true)`.
- La maquette de référence est extraite dans le scratchpad : `…/scratchpad/carnage_zip/integration/design-ref/Menus BTP Survivors.dc.html`. Ouvrir les planches **2a** (titre) et **2d** (level-up) pour le rendu cible exact (couleurs, pile de `text-shadow`, keyframes). Le dossier `integration/` N'EST PAS committé.

---

## P0 — Fondations DA

### Task 1: Assets DA + fontes arcade

**Files:**
- Copy: `Design menu BTP Carnage.zip:integration/public/{metal_v,dither_light,dither_dark,bg_dusk,casque}.png` → `public/`
- Modify: `index.html` (bloc `<link>` fontes, ~ligne 9-11)

**Interfaces:**
- Produces: 5 PNG servis à la racine (`/metal_v.png`, etc.) ; fontes `Press Start 2P` et `VT323` disponibles globalement.

- [ ] **Step 1: Copier les 5 textures dans `public/`**

```bash
cd "<repo>"
DZ="/c/Users/SAD19_~1/AppData/Local/Temp/claude/<session>/scratchpad/carnage_zip/integration/public"
# (ou ré-extraire du zip si absent : unzip -o "Design menu BTP Carnage.zip" "integration/public/metal_v.png" ... )
cp "$DZ/metal_v.png" "$DZ/dither_light.png" "$DZ/dither_dark.png" "$DZ/bg_dusk.png" "$DZ/casque.png" public/
ls -la public/metal_v.png public/bg_dusk.png public/casque.png public/dither_light.png public/dither_dark.png
```
Expected: les 5 fichiers listés, taille > 0.

- [ ] **Step 2: Ajouter les 2 fontes arcade dans `index.html`**

Remplacer la ligne `<link href="https://fonts.googleapis.com/css2?family=Jersey+25&family=Pixelify+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />` par :
```html
<link href="https://fonts.googleapis.com/css2?family=Jersey+25&family=Pixelify+Sans:wght@400;500;600;700&family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet" />
```

- [ ] **Step 3: Vérifier build + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 erreur, 0 warning.

- [ ] **Step 4: Commit**

```bash
git add public/metal_v.png public/dither_light.png public/dither_dark.png public/bg_dusk.png public/casque.png index.html
git commit -m "feat(ui): assets DA arcade + fontes Press Start 2P / VT323"
```

### Task 2: Tokens arcade + cadre métal/CRT dans styles.ts

**Files:**
- Modify: `src/ui/styles.ts` (AJOUT de règles en fin du template CSS ; ne pas réécrire l'existant)

**Interfaces:**
- Consumes: rien.
- Produces: variables CSS `--arc-*` (couleurs arcade), classes utilitaires `.arc-metal` (fond `metal_v.png` + biseaux + rivets), `.arc-crt` (scanlines), keyframes `slamIn`, `impactFlash`, `impactDust`, `blinkSlow`. Les couleurs sont des littéraux (pas d'import `palette`).

- [ ] **Step 1: Ajouter le bloc de tokens + utilitaires arcade**

Repérer la fin du template CSS exporté par `src/ui/styles.ts` et y AJOUTER (avant la fermeture de la template-string) — valeurs exactes depuis la maquette planche 2a :
```css
:root{
  --arc-jaune:#FFD24A; --arc-jaune-clair:#FFF4CC; --arc-jaune2:#FFE9A8;
  --arc-orange:#E86F1F; --arc-orange2:#F26A22;
  --arc-ombre1:#C85A12; --arc-ombre2:#9c440d; --arc-ombre3:#6e2f08; --arc-ombre4:#4a1404;
  --arc-rouge:#D83B2D; --arc-contour:#101014;
  --arc-brun1:#2B2018; --arc-brun2:#241C16; --arc-brun3:#17120E;
  --arc-creme:#EAD9B8; --arc-creme2:#E8B27A;
}
#ui-root .arc-metal{
  background:url('metal_v.png') repeat, var(--arc-brun2);
  box-shadow: inset 0 2px 0 rgba(255,255,255,.14), inset 0 -3px 0 rgba(0,0,0,.5);
}
#ui-root .arc-crt{
  background-image: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 2px, transparent 2px 4px);
}
@keyframes slamIn{0%,8%{opacity:0;transform:scale(3.2) translateY(-22px)}15%{opacity:1;transform:scale(.9)}20%{transform:scale(1.06)}25%{transform:scale(.98)}30%,100%{transform:scale(1)}}
@keyframes impactFlash{0%,100%{opacity:0}12%{opacity:.9}}
@keyframes impactDust{0%{opacity:.7;transform:scale(.4)}100%{opacity:0;transform:scale(1.4)}}
@keyframes blinkSlow{0%,49%{opacity:1}50%,100%{opacity:0}}
```
> Note base Vite : `vite.config.ts` n'a pas de `base` custom (racine `/`) → `url('metal_v.png')` résout. Si un jour `base` change, préfixer par `import.meta.env.BASE_URL` côté TS.

- [ ] **Step 2: Vérifier type-check + lint + build**

Run: `npm run type-check && npm run lint && npm run build`
Expected: 0 erreur/warning, build OK.

- [ ] **Step 3: Commit**

```bash
git add src/ui/styles.ts
git commit -m "feat(ui): tokens couleur arcade + cadre métal/CRT + keyframes slam-in"
```

### Task 3: Logo sculpté BTP / CARNAGE

**Files:**
- Modify: `src/ui/overlay.ts` (`titlePanel`, ~ligne 434-440 : remplacer `h('h1', {className:'panel__title', text:'BTP Carnage'})` par un logo structuré)
- Modify: `src/ui/styles.ts` (classes `.logo*`)
- Test: `tests/e2e/arcadeTitleLogo.spec.ts`

**Interfaces:**
- Consumes: keyframes `slamIn` (Task 2).
- Produces: dans `titlePanel`, un bloc logo `h('div',{className:'logo'}, [ topper 'SUPER CHANTIER-001', 'BTP', 'CARNAGE' ])` avec classes `.logo__topper`, `.logo__btp`, `.logo__carnage`. Le `<h1 class="panel__title">` texte est remplacé mais **la classe `panel__title` reste utilisée** (sur le conteneur logo) pour ne pas casser le focus/les sélecteurs existants.

- [ ] **Step 1: Écrire le test e2e (échoue)**

`tests/e2e/arcadeTitleLogo.spec.ts` :
```ts
import { test, expect } from '@playwright/test'

test('écran titre : logo sculpté BTP + CARNAGE présent', async ({ page }) => {
  await page.goto('/?test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 60000 })
  await expect(page.locator('.logo__btp')).toHaveText('BTP')
  await expect(page.locator('.logo__carnage')).toHaveText('CARNAGE')
  await expect(page.locator('.logo__topper')).toContainText('SUPER CHANTIER')
})
```

- [ ] **Step 2: Lancer le test → échoue**

Run: `npx playwright test arcadeTitleLogo --project=chromium`
Expected: FAIL (`.logo__btp` introuvable).

- [ ] **Step 3: Remplacer le titre par le logo dans `titlePanel`**

Dans `src/ui/overlay.ts`, remplacer `h('h1', { className: 'panel__title', text: 'BTP Carnage' })` par :
```ts
h('div', { className: 'panel__title logo' }, [
  h('div', { className: 'logo__topper', text: 'SUPER CHANTIER-001' }),
  h('div', { className: 'logo__btp', text: 'BTP' }),
  h('div', { className: 'logo__carnage', text: 'CARNAGE' })
]),
```

- [ ] **Step 4: Styliser le logo (CSS) — pile de text-shadow depuis la maquette 2a**

Ajouter dans `src/ui/styles.ts` (référence : planche 2a de la maquette pour la pile d'ombres exacte) :
```css
#ui-root .logo{ display:flex; flex-direction:column; align-items:center; gap:2px; animation:slamIn .9s ease-out both; }
#ui-root .logo__topper{ font-family:'Pixelify Sans'; font-weight:700; color:var(--arc-creme2); letter-spacing:8px; font-size:14px; }
#ui-root .logo__btp{ font-family:'Jersey 25'; color:var(--arc-jaune); font-size:44px; line-height:.8; text-shadow:0 3px 0 var(--arc-ombre3),0 -2px 0 var(--arc-contour); }
#ui-root .logo__carnage{ font-family:'Jersey 25'; color:var(--arc-orange2); font-size:104px; line-height:.82;
  text-shadow:0 2px 0 var(--arc-ombre1),0 4px 0 var(--arc-ombre2),0 6px 0 var(--arc-ombre3),0 8px 0 var(--arc-ombre4),0 10px 12px rgba(0,0,0,.6); }
```

- [ ] **Step 5: Lancer le test → passe + type-check/lint**

Run: `npx playwright test arcadeTitleLogo --project=chromium && npm run type-check && npm run lint`
Expected: PASS, 0 erreur/warning.

- [ ] **Step 6: Commit**

```bash
git add src/ui/overlay.ts src/ui/styles.ts tests/e2e/arcadeTitleLogo.spec.ts
git commit -m "feat(ui): logo sculpté BTP/CARNAGE avec slam-in (titre 2a)"
```

---

## P1 — Écran titre arcade (planche 2a) 🚦 gate DA

### Task 4: Habillage arcade + HI-SCORE persistant

**Files:**
- Modify: `src/ui/overlay.ts` (`titlePanel` : ajouter les éléments d'habillage)
- Modify: `src/ui/styles.ts` (classes `.arcbar*`, `.insertcoin`, `.pushstart`, `.credit`, `.studio`)
- Create: `src/ui/hiscore.ts` (lecture/écriture `localStorage` — couche UI, pas core)
- Test: `tests/unit/hiscore.test.ts` + `tests/e2e/arcadeTitleChrome.spec.ts`

**Interfaces:**
- Consumes: tokens/keyframes Task 2, logo Task 3.
- Produces: `readHiScore(): number` et `writeHiScore(n: number): void` (`src/ui/hiscore.ts`, clé `btp:hiscore`, robustes sans localStorage). `titlePanel` affiche la barre `1UP / HI-SCORE / 2UP`, `INSERT COIN` (blink), `CREDIT 00`, bandeau `PUSH START`, `© 2026 AIL ENTERTAINMENT`.

- [ ] **Step 1: Test unité hiscore (échoue)**

`tests/unit/hiscore.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { readHiScore, writeHiScore } from '@/ui/hiscore'

describe('hiscore', () => {
  beforeEach(() => localStorage.clear())
  it('lit 0 par défaut', () => { expect(readHiScore()).toBe(0) })
  it('écrit puis relit', () => { writeHiScore(28900); expect(readHiScore()).toBe(28900) })
  it('ignore une valeur non finie / négative', () => { writeHiScore(-5); expect(readHiScore()).toBe(0) })
})
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run tests/unit/hiscore.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter `src/ui/hiscore.ts`**

```ts
const KEY = 'btp:hiscore'
export function readHiScore(): number {
  try { const v = Number(localStorage.getItem(KEY)); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 }
  catch { return 0 }
}
export function writeHiScore(n: number): void {
  try { if (Number.isFinite(n) && n > 0) { localStorage.setItem(KEY, String(Math.floor(n))) } } catch { /* no-op */ }
}
```

- [ ] **Step 4: Lancer → passe**

Run: `npx vitest run tests/unit/hiscore.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Ajouter l'habillage dans `titlePanel` + CSS**

Dans `src/ui/overlay.ts`, importer `readHiScore` et insérer dans `titlePanel` (au-dessus du logo pour la barre, en-dessous pour push-start) — police `VT323`/`Press Start 2P` :
```ts
// barre arcade (haut)
h('div', { className: 'arcbar' }, [
  h('span', { className: 'arcbar__cell', text: '1UP 001250' }),
  h('span', { className: 'arcbar__cell arcbar__hi', text: `HI-SCORE ${String(readHiScore()).padStart(6, '0')}` }),
  h('span', { className: 'arcbar__cell', text: '2UP 000000' })
]),
// … logo …
// bas
h('div', { className: 'insertcoin', text: 'INSERT COIN' }),
h('div', { className: 'pushstart', text: 'PUSH START' }),
h('div', { className: 'credit', text: 'CREDIT 00' }),
h('div', { className: 'studio', text: '© 2026 AIL ENTERTAINMENT' }),
```
CSS (`styles.ts`) — valeurs depuis la maquette 2a :
```css
#ui-root .arcbar{ display:flex; justify-content:space-between; width:100%; font-family:'VT323'; font-size:22px; color:var(--arc-jaune); }
#ui-root .arcbar__hi{ color:var(--arc-jaune-clair); }
#ui-root .insertcoin{ font-family:'Press Start 2P'; font-size:12px; color:var(--arc-jaune); animation:blinkSlow 1s steps(1) infinite; }
#ui-root .pushstart{ font-family:'Press Start 2P'; font-size:14px; color:var(--arc-contour); background:repeating-linear-gradient(45deg,var(--arc-jaune) 0 10px,#101014 10px 20px); padding:6px 14px; }
#ui-root .credit{ font-family:'VT323'; color:var(--arc-creme); font-size:18px; }
#ui-root .studio{ font-family:'Press Start 2P'; font-size:8px; color:var(--arc-creme2); }
```

- [ ] **Step 6: Test e2e habillage (présence + HI-SCORE persistant)**

`tests/e2e/arcadeTitleChrome.spec.ts` :
```ts
import { test, expect } from '@playwright/test'
test('titre arcade : habillage présent + HI-SCORE lu de localStorage', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('btp:hiscore', '28900'))
  await page.goto('/?test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 60000 })
  await expect(page.locator('.insertcoin')).toBeVisible()
  await expect(page.locator('.pushstart')).toHaveText('PUSH START')
  await expect(page.locator('.arcbar__hi')).toContainText('028900')
  await expect(page.locator('.studio')).toContainText('AIL ENTERTAINMENT')
})
```

- [ ] **Step 7: Lancer e2e → passe + gates**

Run: `npx playwright test arcadeTitleChrome --project=chromium && npm run type-check && npm run lint`
Expected: PASS, 0 erreur/warning.

- [ ] **Step 8: Commit**

```bash
git add src/ui/hiscore.ts tests/unit/hiscore.test.ts src/ui/overlay.ts src/ui/styles.ts tests/e2e/arcadeTitleChrome.spec.ts
git commit -m "feat(ui): habillage titre arcade (1UP/HI-SCORE/INSERT COIN/PUSH START) + hiscore localStorage"
```

### Task 5: Attract mode (inactivité ~15 s sur le titre)

**Files:**
- Modify: `src/app/app.ts` (compteur d'inactivité sur l'écran `title`)
- Modify: `src/ui/overlay.ts` (classe `.screen--attract` togglée) + `src/ui/styles.ts`
- Test: `tests/e2e/arcadeAttract.spec.ts` (via seam `advanceTime`)

**Interfaces:**
- Consumes: écran title existant.
- Produces: sur `title`, après `ATTRACT_MS = 15000` sans input, l'App expose `attract: true` dans `getState()` (nouveau champ optionnel, UI-only) → overlay ajoute `.screen--attract` (blink `PUSH START` accentué). Tout input le réinitialise. **Aucune logique sim** : c'est un timer d'écran, remis à zéro par `nav/confirm/back/setInput`.

- [ ] **Step 1: Test e2e attract (échoue)**

`tests/e2e/arcadeAttract.spec.ts` :
```ts
import { test, expect } from '@playwright/test'
test('titre : attract mode après ~15 s d’inactivité, annulé par input', async ({ page }) => {
  await page.goto('/?test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 60000 })
  await page.evaluate(() => window.__GAME__!.advanceTime(15500))
  expect(await page.evaluate(() => window.__GAME__!.getState().attract === true)).toBe(true)
  await page.evaluate(() => window.__GAME__!.nav('down'))
  expect(await page.evaluate(() => window.__GAME__!.getState().attract === true)).toBe(false)
})
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx playwright test arcadeAttract --project=chromium`
Expected: FAIL (`attract` toujours undefined).

- [ ] **Step 3: Implémenter le timer d'attract dans `src/app/app.ts`**

Ajouter un champ `private attractMs = 0` ; dans la boucle d'avance de temps de l'App (là où `elapsedMs`/`advanceTime` progressent hors écran de jeu), si `screen === 'title'` incrémenter `attractMs += dt`, sinon `attractMs = 0`. Dans `nav/confirm/back` (et l'entrée d'input titre) : `attractMs = 0`. Exposer dans `getState()` : `attract: this.screen === 'title' && this.attractMs >= 15000`. (Constante `const ATTRACT_MS = 15000` en tête de fichier.)
> Contrainte : `src/app` est la couche écrans (autorisée), PAS `src/core`. N'utiliser que l'horloge déjà disponible à l'App (pas de `Date.now()`).

- [ ] **Step 4: Toggler `.screen--attract` dans overlay + CSS**

Dans `overlay.ts` (rendu title), ajouter la classe conditionnelle `state.attract ? 'screen--attract' : ''` sur le conteneur titre. CSS :
```css
#ui-root .screen--attract .pushstart{ animation:blinkSlow .5s steps(1) infinite; }
```

- [ ] **Step 5: Lancer e2e → passe + gates**

Run: `npx playwright test arcadeAttract --project=chromium && npm run type-check && npm run lint && npm run test`
Expected: PASS ; Vitest inchangé vert.

- [ ] **Step 6: Commit**

```bash
git add src/app/app.ts src/ui/overlay.ts src/ui/styles.ts tests/e2e/arcadeAttract.spec.ts
git commit -m "feat(ui): attract mode sur l'écran titre (inactivité 15 s, reset input)"
```

### Task 6: Décor sommaire du titre + capture 🚦 gate DA

**Files:**
- Modify: `src/ui/overlay.ts` (titlePanel : backdrop `bg_dusk` + silhouettes) + `src/ui/styles.ts`

**Interfaces:**
- Consumes: `bg_dusk.png` (Task 1), classe `.screen--title`.
- Produces: décor discret — `bg_dusk` assombri en fond du panneau titre + 2 silhouettes de grue (pseudo-éléments ou 2 `div`) + 2-3 sprites `player_*.png` assombris (`filter:brightness(.5)`) en bas. Purement décoratif, `pointer-events:none`.

- [ ] **Step 1: Ajouter le backdrop + silhouettes**

Dans `titlePanel`, ajouter en premier enfant `h('div', { className: 'title-backdrop', attrs: { 'aria-hidden': 'true' } })` et une rangée basse `h('div', { className: 'title-crew', attrs: { 'aria-hidden': 'true' } }, [...3 imgs player_* filtrées])`. CSS :
```css
#ui-root .title-backdrop{ position:absolute; inset:0; z-index:-1; background:url('bg_dusk.png') center/cover; filter:brightness(.45) saturate(.8); pointer-events:none; }
#ui-root .title-crew{ display:flex; gap:24px; justify-content:center; opacity:.6; }
#ui-root .title-crew img{ width:64px; image-rendering:pixelated; filter:brightness(.5); }
```
(silhouettes de grue : 2 `div` `.title-crane` en `clip-path` triangle sombre, ou réutiliser un asset existant — garder discret.)

- [ ] **Step 2: Vérifier gates + build**

Run: `npm run type-check && npm run lint && npm run build`
Expected: 0 erreur/warning, build OK.

- [ ] **Step 3: Capture de l'écran titre (preuve visuelle)**

Écrire une capture Playwright ponctuelle (ou réutiliser un spec) : `page.goto('/?test=1&lite=1')`, `waitForFunction(ready)`, `page.screenshot({ path: 'test-results/arcade-title.png' })`.
Run: `npx playwright test arcadeTitleChrome --project=chromium` (ajouter le screenshot au spec) → fichier `test-results/arcade-title.png`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/overlay.ts src/ui/styles.ts
git commit -m "feat(ui): décor sommaire écran titre (bg_dusk + crew assombri)"
```

- [ ] **Step 5: 🚦 GATE DA — présenter la capture au créateur**

Envoyer `test-results/arcade-title.png` (via capture) et attendre validation du rendu du titre AVANT de continuer les phases suivantes (P3+). Ne PAS enchaîner sans feu vert DA.

---

## P2 — Fix z-index level-up (planche 2d)

### Task 7: Modale level-up au-dessus des toasts + file suspendue

**Files:**
- Modify: `src/ui/overlay.ts` (rendu upgrade + gestion de la file de toasts)
- Modify: `src/ui/styles.ts` (z-index modale > toasts ; cartes plus grandes)
- Test: `tests/e2e/levelupZindex.spec.ts`

**Interfaces:**
- Consumes: le rendu des cartes de level-up et le système de toasts existants dans `overlay.ts` ; l'événement d'ouverture de level-up (`pendingLevelUp` non nul dans `getState()`).
- Produces: quand `getState().pendingLevelUp` est non nul, (a) la modale a un z-index supérieur aux toasts, (b) les toasts « arme ramassée » sont **suspendus** (mis en file, non affichés) jusqu'à la fermeture, puis **flush**. Cartes agrandies (icône ~150px, carte ~452×616).

- [ ] **Step 1: Repérer le rendu actuel (lecture)**

Lire dans `src/ui/overlay.ts` : la classe de la modale de level-up (probablement `.upgrade*`/`.card*`) et le conteneur/queue des toasts « arme ramassée » (chercher `toast`, `pickup`, `weaponPicked`). Noter les classes réelles ET la variable de file de toasts.

- [ ] **Step 2: Test e2e (échoue) — la modale masque le toast**

`tests/e2e/levelupZindex.spec.ts` (adapter les sélecteurs à ceux repérés au Step 1) :
```ts
import { test, expect } from '@playwright/test'
test('level-up : la modale est au-dessus, aucun toast visible pendant le choix', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 60000 })
  // forcer un level-up via le seam (donner de l'XP jusqu'au palier) puis avancer
  await page.evaluate(() => { const g = window.__GAME__!; g.debugSpawnEnemies?.(30); g.advanceTime(4000) })
  await page.waitForFunction(() => window.__GAME__!.getState().pendingLevelUp !== null, undefined, { timeout: 60000 })
  // la modale de cartes est visible ; aucun toast d'arme ramassée n'est visible au-dessus
  const modalZ = await page.evaluate(() => { const el = document.querySelector('.upgrade, .cards, .card')?.closest('[class]'); return el ? getComputedStyle(el).zIndex : null })
  expect(modalZ).not.toBeNull()
  await expect(page.locator('.toast, .pickup-toast')).toHaveCount(0)
})
```
> Note : ajuster `debugSpawnEnemies`/le chemin d'obtention du level-up selon le seam réel (voir `tests/e2e/*` existants pour le pattern de déclenchement de `pendingLevelUp`).

- [ ] **Step 3: Lancer → échoue** (le toast passe au-dessus / la modale n'a pas le bon z-index)

Run: `npx playwright test levelupZindex --project=chromium`
Expected: FAIL.

- [ ] **Step 4: Implémenter le fix**

Dans `overlay.ts` : (a) au rendu, si `getState().pendingLevelUp !== null`, **ne pas afficher** les toasts (les garder en file `pendingToasts: ToastData[]`) ; quand `pendingLevelUp` repasse à `null`, **flush** la file (afficher les toasts en attente). (b) CSS : donner à la modale de level-up un `z-index` supérieur à celui des toasts (ex. toasts `z-index:30`, modale `z-index:60`) et agrandir les cartes :
```css
#ui-root .card{ min-width:452px; min-height:616px; }
#ui-root .card__icon, #ui-root .card__img{ width:150px; height:150px; }
/* modale au-dessus des toasts */
#ui-root .upgrade, #ui-root .cards-modal{ z-index:60; }
#ui-root .toast, #ui-root .pickup-toast{ z-index:30; }
```
(Adapter les noms de classe exacts à ceux repérés Step 1.)

- [ ] **Step 5: Lancer e2e → passe + gates + non-régression**

Run: `npx playwright test levelupZindex cardRendering upgradeKeyboard --project=chromium && npm run type-check && npm run lint && npm run test`
Expected: PASS ; les specs `cardRendering`/`upgradeKeyboard` existants restent verts ; Vitest vert.

- [ ] **Step 6: Commit**

```bash
git add src/ui/overlay.ts src/ui/styles.ts tests/e2e/levelupZindex.spec.ts
git commit -m "fix(ui): level-up au-dessus des toasts + file de toasts suspendue + cartes agrandies (2d)"
```

---

## Vérification finale de Plan A

- [ ] `npm run type-check && npm run lint && npm run build` — verts.
- [ ] `npm run test` — Vitest vert (nouveaux : `hiscore` ; inchangés : le reste).
- [ ] `npm run test:e2e` — 2 projets verts (nouveaux specs arcade + non-régression des specs existants).
- [ ] `npm run sim:check` — VERT diff 0 attendu (aucune modif `src/core` ; le RED éventuel = `terrain_vierge.json` non-committé, hors périmètre).
- [ ] Captures : `test-results/arcade-title.png` présentée au créateur (🚦 gate DA Task 6).
- [ ] Pas de `src/core/**` ni `palette.ts` touchés (`git diff --name-only origin/main..HEAD` ne liste que `src/ui/*`, `src/app/app.ts`, `index.html`, `public/*.png`, `tests/*`, `docs/*`).

## Self-Review (writing-plans)

- **Spec coverage** : P0 (Task 1-3), P1 (Task 4-6 + gate DA), P2 (Task 7). P3→P7 = plans B/C/D (à écrire ensuite). ✓
- **Placeholders** : les sélecteurs exacts des toasts/modale (Task 7) sont à confirmer par lecture (Step 1 le prévoit explicitement) — pas un placeholder de code mais une étape de repérage ; acceptable car le fichier réel doit être lu. Le reste est complet.
- **Type consistency** : `readHiScore`/`writeHiScore` (Task 4) ; `attract` champ getState (Task 5) ; classes `.logo*/.arcbar*/.insertcoin/.pushstart` cohérentes entre overlay et CSS. ✓
