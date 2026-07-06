# La vie du chantier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le chantier vivant et inciter à explorer — 5 prisonniers éparpillés (soin 30%), PNJ mobiles qui râlent à l'approche, mini-carte togglable.

**Architecture:** 3 composants séquencés `A (core) → C (ui) → B (render)`. A change la sim (re-baseline). C et B sont observer-only (`sim:check` diff 0). Flux `input → core → app → render/ui`.

**Tech Stack:** TypeScript strict, Phaser (render), DOM `h()` (ui), Vitest, Playwright (seam), harness `npm run sim`, PixelLab (assets).

**Spec :** `docs/superpowers/specs/2026-07-06-vie-du-chantier-design.md`. **Branche :** `feat/stage-life`.

## Global Constraints

- **Sim/rendu séparés.** `src/core`/`src/content` purs : zéro Phaser/DOM, zéro `Math.random`/`Date.now`/`new Date` — RNG seedé (`Rng`, `src/core/rng.ts`, `.float(min,max)`) + `FixedClock`. Render/ui = observer-only.
- **`sim:check` VERT** : A re-baseliné ; B/C **diff 0** (aucun `src/core` touché).
- **DA 16-bit** : palette `src/ui/palette.ts`, panneaux pixel, **pas** d'emoji/glow/gradient/coins arrondis, **pas** d'`innerHTML` interpolé (helper `src/ui/h.ts`). Bulles pixel DA.
- **Manette + clavier** : toggle mini-carte via `src/input` (jamais d'écouteur clavier ad hoc dans un écran).
- **Zéro `any` dans `src/core`.** TS strict, ESLint 0 warning.
- **Texte in-game en français.**
- **Assets** : skill `assets`, prompt global PixelLab, calibration `public/player_j1.png`, golden-batch d'abord, `npm run assets:qa` **0 erreur** (garde-fou détourage actif : un sprite à fond opaque = erreur).
- **Gates par tâche** (obligatoires avant commit) : `npm run type-check` · `npm run lint` · `npm run test` · **`npm run sim:check`** · `npm run test:e2e` (si rendu/ui) · `npm run assets:qa` (si asset).
- Pas de push sans feu vert.

---

# PHASE A — Prisonniers ×5 (cœur)

### Task A1 : RESCUE ×5 + soin fractionnaire + état exposé

**Files:**
- Modify: `src/content/config.ts` (objet `RESCUE`, ~ligne 220)
- Modify: `src/core/systems/rescue.ts` (soin fractionnaire)
- Modify: `src/core/simulation.ts` (`spawnPrisoner`→`spawnPrisoners` ~ligne 444 ; compteur `rescuedTotal` ; `getState` ~ligne 283 ; `collectPrisoners` ~ligne 823)
- Modify: `src/core/types.ts` (`GameState`, ajouter `rescue` après `prisoners:` ligne 324)
- Test: `tests/unit/rescue.test.ts` (nouveau ou étendu)

**Interfaces:**
- Produces: `RESCUE = { radius:64, healFraction:0.30, count:5, distMin:1600, distMax:3800, fleeSpeed:260 }` ; `GameState.rescue: { total: number; rescued: number }` ; `rescueSystem(world, freed)` inchangé de signature.

- [ ] **Step 1 — Test qui échoue (config + spawn + état).** Créer `tests/unit/rescue.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { RESCUE, WORLD } from '@content/config'

function bootSim(seed = 42): Simulation {
  const sim = new Simulation({ mode: 'solo', level: 1, seed })
  sim.reset()
  return sim
}

describe('prisonniers ×5', () => {
  it('RESCUE expose 5 prisonniers, soin 30 %, distances larges', () => {
    expect(RESCUE.count).toBe(5)
    expect(RESCUE.healFraction).toBeCloseTo(0.30)
    expect(RESCUE.distMin).toBeGreaterThanOrEqual(1200)
  })

  it('spawn 5 prisonniers éparpillés (déterministe) hors du centre', () => {
    const a = bootSim(7).getState().prisoners
    const b = bootSim(7).getState().prisoners
    expect(a.length).toBe(5)
    expect(a).toEqual(b) // déterminisme
    const cx = WORLD.width / 2, cy = WORLD.height / 2
    for (const p of a) {
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeGreaterThanOrEqual(RESCUE.distMin - 1)
    }
    // secteurs distincts : deux prisonniers ne partagent pas le même angle grossier
    const sectors = a.map((p) => Math.round(((Math.atan2(p.y - cy, p.x - cx) + Math.PI) / (2 * Math.PI)) * 5))
    expect(new Set(sectors).size).toBeGreaterThanOrEqual(4)
  })

  it('getState().rescue = { total:5, rescued:0 } au départ', () => {
    expect(bootSim(1).getState().rescue).toEqual({ total: 5, rescued: 0 })
  })
})
```

- [ ] **Step 2 — Lancer, vérifier l'échec.** `npx vitest run tests/unit/rescue.test.ts` → FAIL (`RESCUE.count` undefined, `rescue` absent). NB : adapter le constructeur `Simulation` à la vraie signature (lire `src/core/simulation.ts` en tête — si le boot diffère, utiliser le même helper que les tests sim existants).

- [ ] **Step 3 — `RESCUE` (config.ts).** Remplacer l'objet :

```ts
export const RESCUE = {
  /** Rayon de proximité (px) pour déclencher la libération. */
  radius: 64,
  /** Fraction du maxHp du libérateur rendue en PV (remplace le soin plat). */
  healFraction: 0.30,
  /** Nombre de prisonniers éparpillés par run. */
  count: 5,
  /** Distance min/max au centre du monde (éparpillement lointain, exploration). */
  distMin: 1600,
  distMax: 3800,
  /** Vitesse de fuite (px/s) de l'ouvrier libéré (part vers le bas hors écran). */
  fleeSpeed: 260
} as const
```

- [ ] **Step 4 — `spawnPrisoners` (simulation.ts).** Remplacer `spawnPrisoner()` par une boucle 5× seedée. Angles répartis en `count` secteurs (base seedée + i·(2π/count) + jitter seedé) :

```ts
/** Place les `RESCUE.count` prisonniers, éparpillés loin dans des secteurs distincts. */
private spawnPrisoners(): void {
  const cx = WORLD.width / 2
  const cy = WORLD.height / 2
  const margin = 80
  const base = this.prisonerRng.float(0, Math.PI * 2)
  for (let i = 0; i < RESCUE.count; i++) {
    const jitter = this.prisonerRng.float(-0.35, 0.35) // ±20°
    const angle = base + (i * 2 * Math.PI) / RESCUE.count + jitter
    const dist = this.prisonerRng.float(RESCUE.distMin, RESCUE.distMax)
    const x = Math.min(WORLD.width - margin, Math.max(margin, cx + Math.cos(angle) * dist))
    const y = Math.min(WORLD.height - margin, Math.max(margin, cy + Math.sin(angle) * dist))
    const e = this.world.spawn()
    this.world.add(e, 'position', { x, y })
    this.world.add(e, 'prisoner', { freed: false })
  }
}
```
Puis, à l'endroit qui appelait `this.spawnPrisoner()` (~ligne 430), appeler `this.spawnPrisoners()`. Ajouter un champ `private rescuedTotal = 0` et le remettre à 0 dans `reset()`.

- [ ] **Step 5 — Soin fractionnaire + compteur (rescue.ts + simulation.ts).** Dans `rescueSystem`, remplacer `RESCUE.heal` :

```ts
health.hp = Math.min(health.maxHp, health.hp + Math.round(health.maxHp * RESCUE.healFraction))
```
Le compteur : `rescueSystem` pousse déjà dans `freed[]` à chaque libération. Dans `simulation.ts`, après l'appel à `rescueSystem(this.world, freed)`, faire `this.rescuedTotal += freed.length` (là où `freed` est consommé pour les events).

- [ ] **Step 6 — `GameState.rescue` (types.ts + simulation.ts).** Dans `types.ts` après `prisoners: PrisonerState[]` :

```ts
  /** Progression des sauvetages (mini-carte + HUD). */
  rescue: { total: number; rescued: number }
```
Dans `simulation.ts` `getState()`, ajouter au littéral retourné :

```ts
      rescue: { total: RESCUE.count, rescued: this.rescuedTotal },
```

- [ ] **Step 7 — Lancer les tests.** `npx vitest run tests/unit/rescue.test.ts` → PASS. Puis `npm run type-check` (le champ `rescue` manquant ailleurs = erreur `tsc` → corriger tout littéral `GameState` incomplet, ex. mocks de test).

- [ ] **Step 8 — Gates + commit.** `npm run type-check && npm run lint && npm run test`. **`npm run sim:check`** (peut être ROUGE si le soin déplace les cibles → c'est l'objet de A2 ; noter le diff). Commit :

```bash
git add src/content/config.ts src/core/systems/rescue.ts src/core/simulation.ts src/core/types.ts tests/unit/rescue.test.ts
git commit -m "feat(core): 5 prisonniers éparpillés + soin 30% maxHp + getState.rescue"
```

### Task A2 : re-équilibrage sim (baseline)

**Files:** Modify: `src/content/config.ts` (rampe difficulté si nécessaire) ; baseline sim (fichier écrit par `npm run sim:check --update` — vérifier la commande exacte dans `package.json`/`tools/sim`).

- [ ] **Step 1 — Mesurer.** `npm run sim:check`. Si VERT → aller au Step 4 (les bots ne détournent pas vers les prisonniers lointains, impact nul). Si ROUGE → noter quelles cibles bougent (survie médiane / niv@5:00 / pic ennemis).
- [ ] **Step 2 — Re-tuner (si ROUGE).** Ajuster la rampe `difficultyScaleAt` (config) du minimum nécessaire pour revenir « tendu mais gagnable » (cf `docs`/mémoire équilibrage). Ne PAS toucher au soin (choix produit : 30 %).
- [ ] **Step 3 — Boucler** jusqu'à `sim:check` VERT.
- [ ] **Step 4 — Re-baseline** si l'oracle a légitimement bougé (commande de mise à jour de la baseline). Vérifier `npm run sim:check` VERT stable (2 runs même seed identiques).
- [ ] **Step 5 — Commit.** `git commit -am "chore(sim): re-baseline après prisonniers ×5 (tendu mais gagnable)"`.

---

# PHASE C — Mini-carte (UI)

### Task C1 : `worldToMinimap` (pur) + tests

**Files:** Create: `src/ui/minimap.ts` (d'abord juste la fonction pure) · Test: `tests/unit/minimap.test.ts`

**Interfaces:**
- Produces: `export function worldToMinimap(x:number, y:number, worldW:number, worldH:number, mapW:number, mapH:number): { mx:number; my:number }` (mappe + clamp dans [0,mapW]×[0,mapH]).

- [ ] **Step 1 — Test qui échoue.** `tests/unit/minimap.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { worldToMinimap } from '@ui/minimap'

describe('worldToMinimap', () => {
  it('coin (0,0) → (0,0)', () => {
    expect(worldToMinimap(0, 0, 1000, 800, 200, 160)).toEqual({ mx: 0, my: 0 })
  })
  it('centre → centre', () => {
    expect(worldToMinimap(500, 400, 1000, 800, 200, 160)).toEqual({ mx: 100, my: 80 })
  })
  it('hors-monde clampé dans le panneau', () => {
    const p = worldToMinimap(99999, -50, 1000, 800, 200, 160)
    expect(p.mx).toBeLessThanOrEqual(200)
    expect(p.my).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2 — Échec.** `npx vitest run tests/unit/minimap.test.ts` → FAIL (module absent).
- [ ] **Step 3 — Implémenter.** `src/ui/minimap.ts` :

```ts
/** Mappe une position monde vers le panneau mini-carte (clampée). PURE. */
export function worldToMinimap(
  x: number, y: number, worldW: number, worldH: number, mapW: number, mapH: number
): { mx: number; my: number } {
  const mx = Math.max(0, Math.min(mapW, (x / worldW) * mapW))
  const my = Math.max(0, Math.min(mapH, (y / worldH) * mapH))
  return { mx, my }
}
```

- [ ] **Step 4 — Passe.** `npx vitest run tests/unit/minimap.test.ts` → PASS.
- [ ] **Step 5 — Commit.** `git add src/ui/minimap.ts tests/unit/minimap.test.ts && git commit -m "feat(ui): worldToMinimap (mapping pur mini-carte)"`.

### Task C2 : panneau mini-carte (rendu DOM DA) + wiring overlay

**Files:** Modify: `src/ui/minimap.ts` (classe/factory de panneau) · `src/ui/styles.ts` (`.minimap*`, DA pixel, bas-gauche) · `src/ui/overlay.ts` (instancier + rafraîchir depuis `getState`, throttlé)

**Interfaces:**
- Consumes: `GameState` (players, prisoners, enemies[isBoss], pickups[type==='coffre'], `rescue`), `worldToMinimap`, `PALETTE`/`h()`.
- Produces: `export class Minimap { el: HTMLElement; update(state: GameState): void; setVisible(v: boolean): void }`.

- [ ] **Step 1 — Styles DA.** Dans `styles.ts`, ajouter des classes `.minimap` (position bottom-left, bordure noire 2px, ombre décalée, fond palette, taille 200×150), `.minimap__counter`, `.minimap__dot` — **coins carrés, pas de gradient/glow** (copier le style des panneaux existants `.inv*`). Ne pas recouvrir l'inventaire (haut-gauche).
- [ ] **Step 2 — Classe `Minimap`.** Dans `minimap.ts`, construire le panneau via `h()` : un conteneur + une couche de marqueurs (absolus, positionnés par `worldToMinimap`) + un compteur `rescued/total`. `update(state)` : reconstruire/repositionner les marqueurs joueur(s) (chevron couleur joueur), prisonniers **non libérés** (marqueur cage jaune), boss (`enemies.filter(e=>e.isBoss)`, rouge), coffres (`pickups.filter(p=>p.type==='coffre')`, or). Compteur = `state.rescue.rescued/state.rescue.total`. **Aucun `innerHTML` interpolé** — que des nœuds `h()`.
- [ ] **Step 3 — Wiring overlay.** Dans `overlay.ts`, instancier `Minimap` au montage du HUD de jeu, appeler `minimap.update(state)` dans la boucle de rafraîchissement (throttle ~toutes 4 frames, comme l'inventaire). Visible uniquement en écran `game`.
- [ ] **Step 4 — Vérif visuelle (régression DA).** `npm run type-check && npm run lint`. e2e temporaire : boot `?autostart=solo&level=1&test=1`, screenshot, vérifier la présence du panneau bas-gauche (marqueurs prisonniers = 5). (Spec e2e définitif en C3.)
- [ ] **Step 5 — Commit.** `git commit -am "feat(ui): panneau mini-carte DA (joueur/prisonniers/boss/coffres + X/5)"`.

### Task C3 : toggle (clavier M + manette) + e2e

**Files:** Modify: `src/input/intents.ts` (`NavAction` + route) · `src/input/keyboard.ts` (touche M) · `src/input/gamepad.ts` (bouton Back/Select) · `src/app/*` (méthode `toggleMinimap` + état `minimapVisible`) · `src/ui/overlay.ts` (lier `setVisible`) · seam (`src/app` exposer l'état si utile) · Test: `tests/e2e/minimap.spec.ts`

**Interfaces:**
- Consumes: `routeInput(app, perPlayer)`.
- Produces: `NavAction` gagne `'minimap'` ; `app.toggleMinimap()` bascule `app.minimapVisible: boolean` (défaut `true`) ; overlay lit `minimapVisible`.

- [ ] **Step 1 — Test e2e qui échoue.** `tests/e2e/minimap.spec.ts` :

```ts
import { test, expect } from '@playwright/test'
test('mini-carte : présente, togglable, marqueurs prisonniers', async ({ page }) => {
  await page.goto('/?autostart=solo&level=1&seed=7&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  const map = page.locator('.minimap')
  await expect(map).toBeVisible()
  // 5 prisonniers au départ
  await expect(page.locator('.minimap__dot--prisoner')).toHaveCount(5)
  // toggle via le seam (l'action clavier/manette route vers app.toggleMinimap)
  await page.evaluate(() => window.__GAME__?.toggleMinimap?.())
  await expect(map).toBeHidden()
})
```
(Adapter les sélecteurs aux classes réellement posées en C2. Exposer `toggleMinimap` sur `window.__GAME__` dans le seam, à côté de `pause()`/`nav()`.)

- [ ] **Step 2 — Échec.** `npx playwright test minimap --project=chromium` → FAIL.
- [ ] **Step 3 — Action `minimap`.** `intents.ts` : `NavAction` += `'minimap'` ; dans `routeInput`, `case 'minimap': app.toggleMinimap(); break`. `keyboard.ts` : émettre `'minimap'` sur la touche `KeyM` (edge, comme `pause`). `gamepad.ts` : émettre `'minimap'` sur le bouton Back/Select (index 8, edge, comme `pause` sur Start).
- [ ] **Step 4 — App state.** Ajouter `minimapVisible = true` + `toggleMinimap()` dans l'App ; l'overlay appelle `minimap.setVisible(app.minimapVisible)` à chaque refresh. Exposer `toggleMinimap` sur le seam.
- [ ] **Step 5 — Passe.** `npx playwright test minimap --project=chromium` → PASS.
- [ ] **Step 6 — Gates + commit.** type-check/lint/test/**sim:check (diff 0)**/test:e2e. `git commit -am "feat(ui): toggle mini-carte (M + manette) + e2e"`.

---

# PHASE B — PNJ mobiles + bulles râleuses (rendu)

### Task B1 : `StageRender.ambient` → tableau (migration non-visuelle)

**Files:** Modify: `src/render/stages.ts` (type `StageAmbient`→`StageAmbientNpc[]` ; 10 entrées de stage) · `src/render/scenes/GameScene.ts` (préchargement + création : itérer le tableau au lieu du singleton)

**Interfaces:**
- Produces:
```ts
export interface StageAmbientNpc extends StageEnemySprite {   // key,file,frame,scale
  behavior: 'work' | 'patrol'
  framePeriodMs?: number
  count?: number
}
// StageRender.ambient?: StageAmbientNpc[]
```

- [ ] **Step 1 — Type.** Remplacer `ambient?: StageAmbient` par `ambient?: StageAmbientNpc[]` ; définir `StageAmbientNpc`. Migrer les 10 stages : envelopper l'entrée existante en `[{ ...ancien, behavior: 'work' }]`.
- [ ] **Step 2 — GameScene.** Là où `this.stage.ambient` (singulier) est préchargé (~ligne 619) et créé (~ligne 993) puis animé (~ligne 1574), itérer le tableau : précharger chaque feuille, créer un sprite par PNJ (placement `resolvePlacement` seedé, hors centre), animer chacun. Remplacer le champ `ambientSprite` unique par une liste `ambientSprites: { sprite; anchor; seed; behavior }[]`. (Comportement identique visuellement à 1 PNJ tant qu'il n'y a qu'une entrée — pas de régression.)
- [ ] **Step 3 — Gates + commit.** type-check/lint/test/**sim:check diff 0**/test:e2e. `git commit -am "refactor(render): ambient PNJ en tableau (préparation vie du chantier)"`.

### Task B2 : `ambientNpc.ts` — errance + bulles (pur) + tests

**Files:** Create: `src/render/ambientNpc.ts` · `src/content/phrases.ts` (pool FR) · Test: `tests/unit/ambientNpc.test.ts`

**Interfaces:**
- Produces:
  - `export const NAG_PHRASES = ['Arrête de glander !', 'Va bosser !', "T'en as pas marre de prendre des pauses ?", 'Tu veux aller manger ?'] as const`
  - `export function pickPhrase(seed: number): string` (déterministe, ∈ NAG_PHRASES)
  - `export function ambientOffset(seed: number, elapsedMs: number, behavior: 'work'|'patrol'): { dx: number; dy: number }` (borné : work ≤ ~24px, patrol ≤ ~120px ; sinus seedés ; aucun RNG runtime)
  - `export function shouldBubble(playerDist: number): boolean` (`playerDist <= 150`)

- [ ] **Step 1 — Tests qui échouent.** `tests/unit/ambientNpc.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { pickPhrase, ambientOffset, shouldBubble, NAG_PHRASES } from '@render/ambientNpc'

describe('ambientNpc (pur)', () => {
  it('pickPhrase déterministe et dans le pool', () => {
    expect(pickPhrase(3)).toBe(pickPhrase(3))
    expect(NAG_PHRASES).toContain(pickPhrase(3))
  })
  it('ambientOffset borné + déterministe', () => {
    for (const t of [0, 500, 1234, 99999]) {
      const o = ambientOffset(7, t, 'work')
      expect(Math.hypot(o.dx, o.dy)).toBeLessThanOrEqual(24 + 0.001)
      expect(ambientOffset(7, t, 'work')).toEqual(o)
    }
    const p = ambientOffset(7, 1234, 'patrol')
    expect(Math.hypot(p.dx, p.dy)).toBeLessThanOrEqual(120 + 0.001)
  })
  it('shouldBubble sous 150px', () => {
    expect(shouldBubble(120)).toBe(true)
    expect(shouldBubble(200)).toBe(false)
  })
})
```

- [ ] **Step 2 — Échec.** `npx vitest run tests/unit/ambientNpc.test.ts` → FAIL.
- [ ] **Step 3 — Implémenter.** `src/render/ambientNpc.ts` :

```ts
export const NAG_PHRASES = [
  'Arrête de glander !',
  'Va bosser !',
  "T'en as pas marre de prendre des pauses ?",
  'Tu veux aller manger ?'
] as const

export function pickPhrase(seed: number): string {
  const i = ((seed % NAG_PHRASES.length) + NAG_PHRASES.length) % NAG_PHRASES.length
  return NAG_PHRASES[i] ?? NAG_PHRASES[0]
}

/** Errance cosmétique bornée : sinus seedés, aucun RNG runtime → reproductible. */
export function ambientOffset(
  seed: number, elapsedMs: number, behavior: 'work' | 'patrol'
): { dx: number; dy: number } {
  const r = behavior === 'patrol' ? 120 : 24
  const s = seed * 0.001
  const t = elapsedMs / 1000
  // Deux fréquences déphasées par le seed → trajectoire de Lissajous douce, |offset| ≤ r.
  const dx = 0.5 * r * (Math.sin(t * 0.6 + s) + Math.sin(t * 0.23 + s * 2))
  const dy = 0.5 * r * (Math.cos(t * 0.5 + s * 1.7) + Math.sin(t * 0.31 + s))
  // Normalise pour garantir la borne r (les deux sinus ∈ [-2r·0.5, ...]).
  const m = Math.hypot(dx, dy)
  const scale = m > r ? r / m : 1
  return { dx: dx * scale, dy: dy * scale }
}

export function shouldBubble(playerDist: number): boolean {
  return playerDist <= 150
}
```
`phrases.ts` : si on préfère centraliser le pool côté contenu, réexporter `NAG_PHRASES` ; sinon garder dans `ambientNpc.ts` (render). (Choix : garder dans `ambientNpc.ts` — c'est du flavor render, pas de la sim.)

- [ ] **Step 4 — Passe.** `npx vitest run tests/unit/ambientNpc.test.ts` → PASS.
- [ ] **Step 5 — Commit.** `git commit -am "feat(render): ambientNpc — errance + phrases râleuses (pur, testé)"`.

### Task B3 : PNJ mobiles rendus (errance) + Task B4 : bulles à l'approche

**Files:** Modify: `src/render/scenes/GameScene.ts` (utiliser `ambientOffset` par PNJ dans `update` ; déclenchement bulle via `shouldBubble` + cooldown + pool ; texte = `pickPhrase`) · réutiliser la brique bulle (`bubble_merci` / rectangle DA existants ~ligne 721-747) · Test: `tests/e2e/ambient-bubbles.spec.ts`

- [ ] **B3.1 — Errance.** Dans l'`update` de GameScene, pour chaque PNJ de `ambientSprites`, positionner `sprite = anchor + ambientOffset(seed, this.time.now, behavior)` + jouer la frame d'anim (activity). Vérifier : pas de saccade, PNJ reste autour de son ancre. Gate rendu (e2e existant vert). Commit.
- [ ] **B4.1 — Test e2e bulle qui échoue.** `tests/e2e/ambient-bubbles.spec.ts` : boot stage, `setInput` marche le joueur vers l'ancre d'un PNJ connu, `advanceTime`, assert qu'une bulle (`.chest`-style ou marqueur render exposé) apparaît. (Exposer un compteur/flag « bulle active » via le seam ou une classe DOM pour l'assertion.)
- [ ] **B4.2 — Bulle.** Quand un joueur (`getState().players`, le plus proche) est à `shouldBubble(dist)` d'un PNJ **et** que le cooldown de ce PNJ (~4000ms, suivi par `Map<npcId, lastMs>`) est écoulé : afficher une bulle DA (réutiliser la brique existante) avec `pickPhrase(npcSeed)`, throttlée. Fade court, pool borné (≤2 simultanées). **Pas d'emoji, pas d'innerHTML.**
- [ ] **B4.3 — Passe + gates + commit.** e2e vert ; type-check/lint/test/**sim:check diff 0**/test:e2e. `git commit -m "feat(render): PNJ mobiles + bulles râleuses à l'approche"`.

### Task B5 : GOLDEN asset — 1 stage de PNJ métier animés

**Files:** `public/stageXX/npc/*.png` (4-5 PNJ animés du stage golden) · `src/render/stages.ts` (renseigner le tableau `ambient` du stage golden) · capture de validation

- [ ] **Step 1 — Choisir le stage golden** (ex. 02 terrassement, riche en activités) et lister 4-5 métiers/gestes (creuseur, signaleur, porteur, ...).
- [ ] **Step 2 — Générer** via PixelLab (skill `assets`, prompt global, calibration `player_j1`) : `create_character` + `animate_character` (walk + geste d'activité), feuilles 4×4. QA planche + `npm run assets:qa` **0 erreur** (garde-fou détourage).
- [ ] **Step 3 — Intégrer** dans le tableau `ambient` du stage golden (`behavior` par PNJ), placement seedé.
- [ ] **Step 4 — Capture** (faire marcher le joueur près des PNJ) → **valider avec l'utilisateur** (lisibilité, DA, activités crédibles, bulles). GATE : ne pas dérouler les autres stages avant validation.
- [ ] **Step 5 — Commit.** `git commit -m "feat(assets): golden PNJ métier animés (stage XX)"`.

### Task B6 : déroulé assets PNJ — 9 stages restants

- [ ] Pipeline subagents (une recette type `docs/stage-premium-recipe.md`, un implémenteur/stage) : 4-5 PNJ métier/stage, gates verts (`assets:qa` 0, sim:check diff 0, captures) par stage, commit par stage. Bilan groupé final (planche) envoyé à l'utilisateur.

---

## Self-Review (writing-plans)

- **Couverture spec** : A (RESCUE×5+30%+rescue exposé+rebalance)=A1/A2 ✓ ; C (worldToMinimap+panneau+toggle)=C1/C2/C3 ✓ ; B (ambient tableau+errance+bulles+assets golden+rollout)=B1..B6 ✓. Séquencement A→C→B respecté.
- **Placeholders** : code complet fourni pour les unités pures (config, spawnPrisoners, heal, worldToMinimap, ambientOffset/pickPhrase) + tests. Les tâches d'intégration (C2/C3/B3/B4) donnent interfaces + points d'ancrage exacts + snippets clés ; l'implémenteur lit les patterns voisins (inventaire pour le panneau, `pause` pour le toggle, brique bulle existante). Assets (B5/B6) = recette + gate.
- **Cohérence de types** : `RESCUE` (config) ↔ tests A1 ; `GameState.rescue {total,rescued}` ↔ C2 ; `worldToMinimap` signature ↔ C1/C2 ; `NAG_PHRASES`/`ambientOffset`/`shouldBubble`/`pickPhrase` ↔ B2/B3/B4 ; `StageAmbientNpc` ↔ B1/B3.
- **Points à vérifier par l'implémenteur au boot** (non bloquants) : signature exacte du constructeur `Simulation` (helper des tests sim existants) ; commande de mise à jour de baseline sim ; index du bouton manette Back/Select ; nom exact du seam pour exposer `toggleMinimap`.
