# Optimisation performance mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir de bonnes perfs sur mobile en instrumentant d'abord (mesure device réelle), puis en réduisant le seul vrai risque mobile (fill-rate/overdraw GPU + parcours display-list CPU) via des optimisations **render-only** mesurées et réversibles, verrouillées par un gate anti-régression.

**Architecture :** Tout est **côté rendu** (`src/render`, `src/app` boot/overlay). **AUCUNE modification de `src/core` / `src/content` sim** → `sim:check` reste **diff 0 par construction** → l'équilibrage/gameplay **ne peut pas** être cassé. Un profileur (`PerfProbe`) mesure le temps de frame par section ; un overlay `?perf=1` l'affiche pour la mesure sur vrai device ; le culling + les plafonds de densité réduisent l'overdraw ; une qualité adaptative protège les vieux devices ; un `perf:check` gèle le budget CPU sim.

**Tech Stack :** TypeScript strict, Phaser 3.90 (WebGL), Vite, Vitest (happy-dom), Playwright (e2e via seam JSON), harness sim headless (`tsx`).

## Global Constraints

- **Render-only.** Interdit de toucher `src/core/**` et la logique sim de `src/content/**`. Preuve : `npm run sim:check` doit rester **diff 0** à chaque tâche qui touche le jeu.
- **Déterminisme.** `Math.random()`/`Date.now()`/`new Date()` interdits dans `src/core` et `src/content` (ESLint). Le code render peut utiliser `performance.now()` (jamais dans core). Le culling/plafonds de densité doivent rester **cosmétiques et déterministes** (mêmes entrées ⇒ même rendu ; on masque/plafonne, on ne re-seede pas).
- **Typage strict.** `tsconfig` strict, `exactOptionalPropertyTypes: true`, ESLint `no-explicit-any` = erreur, **0 warning** (`--max-warnings 0`). Zéro `any`.
- **DA 16-bit (PRD).** L'overlay perf passe par le helper `h()` (`src/ui/h.ts`) — **jamais** d'`innerHTML` interpolé — et n'utilise **que** `PALETTE` (`src/ui/palette.ts`). Panneaux pixel, bordures noires, **aucun emoji dans l'UI**. C'est un outil dev mais il respecte la DA.
- **Seam.** Le contrat `window.__GAME__` est activé via `import.meta.env.DEV` ou `?test=1` — **jamais** `process.env.NODE_ENV`. Les helpers de mesure sont test-only.
- **Gates par tâche (dans cet ordre) :** `npm run type-check` · `npm run lint` · `npm run test` (Vitest) · `npm run sim:check` (diff 0 obligatoire dès qu'on touche le jeu) · `npm run test:e2e` (tâches rendu) · `npm run build`.
- **Discipline de mesure.** Chaque tâche perf (4, 5, 6) : mesurer AVANT et APRÈS via `PerfProbe`/`debugPerfProfile()` ; **revert si aucun gain** sur le profil visé. On n'optimise pas à l'aveugle.

## Baseline mesurée (2026-07-12, référence pour les cibles)

RTX 2060, 218 ennemis, mode test, monkey-patch à chaud : sim **0,54 ms** + synchro rendu **0,21 ms** (horde 0,17 / joueurs 0,03 / télégraphe 0,004) + rendu Phaser (display-list + GPU) **1,38 ms** = **~2,1 ms CPU/frame** (13 % du budget 60 FPS). Draw calls = **3** (constant) même à 418 ennemis / 31 textures distinctes (Phaser multi-tex batch 16 unités). **Conclusion : CPU-léger ; le seul inconnu = fill-rate/overdraw GPU sur device faible, non mesurable sur GPU desktop.** D'où l'ordre imposé : instrumentation → mesure device → optimisations ciblées.

## Ordre & conditionnalité

- **P0 = Tâches 1→3** (profileur + instrumentation + overlay `?perf=1`). **Livrable : mesure device réelle.**
- **🚦 GATE user device** entre P0 et la suite : l'utilisateur lance `?perf=1` sur son téléphone et remonte les chiffres. Les Tâches 4-6 sont **priorisées selon ce que le device révèle** (fill-rate vs CPU) — le plan les fournit prêtes, mais on n'exécute que ce que la mesure justifie.
- **Tâche 7** (`perf:check`) peut se faire en parallèle (indépendante, gèle le budget sim).

---

## File Structure

- `src/render/perf/perfProbe.ts` — **NEW** — profileur pur (moyennes glissantes par section). Testable Vitest.
- `src/render/perf/cull.ts` — **NEW** — util pur de visibilité caméra. Testable Vitest.
- `src/render/perf/densityCap.ts` — **NEW** — util pur de budget de décalques par surface. Testable Vitest.
- `src/render/perf/qualityManager.ts` — **NEW** — tiers de qualité + FSM adaptative pure. Testable Vitest.
- `src/render/perf/perfOverlay.ts` — **NEW** — overlay DOM (`h()` + `PALETTE`) affichant le snapshot. Gated `?perf=1`.
- `src/app/bootOptions.ts` — **MODIFY** — parse le flag `perf`.
- `src/app/seam.ts` — **MODIFY** — expose `debugPerfProfile(): PerfSnapshot | null`.
- `src/render/scenes/GameScene.ts` — **MODIFY** — instrumente `update()` (sim/synchro), applique le culling, expose la sonde.
- `src/render/scenes/hordeRenderer.ts` — **MODIFY** — culling hors-écran des sprites.
- `src/app/main.ts` — **MODIFY** — instancie `PerfOverlay` si flag, le pousse chaque frame.
- `tools/perf/check.ts` — **NEW** + script `perf:check` dans `package.json` — gate budget CPU sim.
- Tests : `tests/unit/perfProbe.test.ts`, `cull.test.ts`, `densityCap.test.ts`, `qualityManager.test.ts` (NEW) ; `tests/e2e/perfOverlay.spec.ts` (NEW).

---

## Task 1 : PerfProbe (profileur pur)

**Files:**
- Create: `src/render/perf/perfProbe.ts`
- Test: `tests/unit/perfProbe.test.ts`

**Interfaces:**
- Produces: `class PerfProbe` avec `measure<T>(name: string, fn: () => T): T`, `count(name: string, value: number): void`, `snapshot(): PerfSnapshot` ; `interface PerfSnapshot { sections: Record<string, number>; counts: Record<string, number> }`. Constructeur `new PerfProbe(now?: () => number)` (horloge injectable pour tests).

- [ ] **Step 1 : Test qui échoue**

```ts
// tests/unit/perfProbe.test.ts
import { describe, it, expect } from 'vitest'
import { PerfProbe } from '@render/perf/perfProbe'

describe('PerfProbe', () => {
  it('moyenne les durées mesurées par section (horloge injectée)', () => {
    const ticks = [0, 5, 100, 103] // begin,end pour 2 mesures : 5ms puis 3ms
    let i = 0
    const probe = new PerfProbe(() => ticks[i++])
    probe.measure('sim', () => {})
    probe.measure('sim', () => {})
    expect(probe.snapshot().sections.sim).toBe(4) // (5+3)/2
  })

  it('expose les compteurs et une section vide vaut 0', () => {
    const probe = new PerfProbe(() => 0)
    probe.count('enemies', 217)
    expect(probe.snapshot().counts.enemies).toBe(217)
    expect(probe.snapshot().sections.sim).toBeUndefined()
  })
})
```

- [ ] **Step 2 : Lancer le test → échec** — `npm run test -- perfProbe` → FAIL (module absent).

- [ ] **Step 3 : Implémentation minimale**

```ts
// src/render/perf/perfProbe.ts
/**
 * Profileur de temps de frame — COUCHE RENDU uniquement. Accumule des durées par
 * section nommée sur une fenêtre glissante et expose des moyennes. `performance.now()`
 * autorisé ici (jamais dans src/core). Aucun effet sur la simulation.
 */
export interface PerfSnapshot {
  /** ms moyens par section (sim, hordeSync, phaserRender…). */
  sections: Record<string, number>
  /** Compteurs instantanés (enemies, objets, drawCalls…). */
  counts: Record<string, number>
}

const WINDOW = 60 // frames de moyenne glissante

export class PerfProbe {
  private readonly ring = new Map<string, number[]>()
  private readonly counts = new Map<string, number>()
  private readonly now: () => number

  constructor(now: () => number = () => performance.now()) {
    this.now = now
  }

  /** Chronomètre `fn` sous le nom `name` et renvoie son résultat. */
  measure<T>(name: string, fn: () => T): T {
    const start = this.now()
    const r = fn()
    this.record(name, this.now() - start)
    return r
  }

  /** Enregistre un compteur instantané (dernier écrasant). */
  count(name: string, value: number): void {
    this.counts.set(name, value)
  }

  private record(name: string, ms: number): void {
    let arr = this.ring.get(name)
    if (arr === undefined) {
      arr = []
      this.ring.set(name, arr)
    }
    arr.push(ms)
    if (arr.length > WINDOW) {
      arr.shift()
    }
  }

  snapshot(): PerfSnapshot {
    const sections: Record<string, number> = {}
    for (const [k, arr] of this.ring) {
      let sum = 0
      for (const x of arr) sum += x
      sections[k] = arr.length > 0 ? Math.round((sum / arr.length) * 100) / 100 : 0
    }
    const counts: Record<string, number> = {}
    for (const [k, v] of this.counts) counts[k] = v
    return { sections, counts }
  }
}
```

- [ ] **Step 4 : Lancer le test → passe** — `npm run test -- perfProbe` → PASS.

- [ ] **Step 5 : Gates + commit**

```bash
npm run type-check && npm run lint && npm run test -- perfProbe
git add src/render/perf/perfProbe.ts tests/unit/perfProbe.test.ts
git commit -m "feat(perf): PerfProbe — profileur de temps de frame render-side (pur, testé)"
```

---

## Task 2 : Instrumentation GameScene + `debugPerfProfile()` sur le seam

**Files:**
- Modify: `src/render/scenes/GameScene.ts` (update() ~ligne 633-709 ; constructeur pour créer la sonde)
- Modify: `src/app/seam.ts` (interface `AppSeam` ~L31-98 ; registre ~L150-170)
- Test: e2e (Task 3 le couvre) ; ici un smoke Vitest optionnel non requis.

**Interfaces:**
- Consumes: `PerfProbe`, `PerfSnapshot` (Task 1).
- Produces: `GameScene.perfSnapshot(): PerfSnapshot` (méthode publique lisant la sonde) ; seam `debugPerfProfile(): PerfSnapshot | null`.

- [ ] **Step 1 : Créer la sonde dans GameScene et instrumenter update()**

Dans `GameScene`, ajouter un champ et l'exposer :

```ts
// en tête de classe, près des autres renderers privés :
private readonly perf = new PerfProbe()

// méthode publique (near les autres accesseurs) :
/** Snapshot du profileur de frame (test/overlay only). */
perfSnapshot(): PerfSnapshot {
  return this.perf.snapshot()
}
```

Import en tête : `import { PerfProbe, type PerfSnapshot } from '@render/perf/perfProbe'`.

Dans `update(_time, delta)` (~L633+), envelopper les sections coûteuses avec `this.perf.measure(...)`. Remplacer :

```ts
      this.app.advanceTime(Math.min(delta, MAX_FRAME_MS))
```
par
```ts
      this.perf.measure('sim', () => this.app.advanceTime(Math.min(delta, MAX_FRAME_MS)))
```

et les synchros (~L674-684) :

```ts
    this.perf.measure('hordeSync', () => this.horde.sync(state, this.stage))
    this.perf.measure('playersSync', () => this.players.sync(state))
```
(garder les autres `.sync(...)` inchangés ou les envelopper de même — au minimum `hordeSync` + `playersSync`). Puis, en fin d'`update`, publier deux compteurs :

```ts
    this.perf.count('enemies', state.enemies.length)
    this.perf.count('objects', this.children.list.length)
```

- [ ] **Step 2 : Exposer sur le seam**

Dans `src/app/seam.ts`, ajouter à l'interface `AppSeam` (près des autres `debug…?`):

```ts
  /** Snapshot du profileur de frame render-side (null si scène pas montée). Test/overlay only. */
  debugPerfProfile?(): import('@render/perf/perfProbe').PerfSnapshot | null
```

Et dans le registre (le seam a accès à l'App ; la scène expose `perfSnapshot`). Le seam doit atteindre la `GameScene` active. Suivre le pattern existant : si le seam tient déjà une réf au jeu Phaser via `debugRenderInfo`, réutiliser la même voie. Registre :

```ts
    debugPerfProfile: () => {
      const scene = getGameScene() // même helper que debugRenderInfo
      return scene ? scene.perfSnapshot() : null
    },
```

> Si `debugRenderInfo` obtient la scène autrement (ex. via une réf injectée), **copier exactement ce mécanisme** — ne pas inventer un nouvel accès.

- [ ] **Step 3 : Vérifier via le seam (manuel/dev)**

`npm run dev` → ouvrir `http://localhost:3000/?test=1&autostart=solo` → console : `__GAME__.debugPerfProfile()` doit renvoyer `{ sections: { sim, hordeSync, phaserRender? … }, counts: { enemies, objects } }` avec des valeurs > 0 après quelques `advanceTime`.

- [ ] **Step 4 : Gates**

```bash
npm run type-check && npm run lint && npm run test && npm run sim:check
```
`sim:check` **doit** rester diff 0 (on n'a touché que du rendu/instrumentation).

- [ ] **Step 5 : Commit**

```bash
git add src/render/scenes/GameScene.ts src/app/seam.ts
git commit -m "feat(perf): instrumente GameScene.update + debugPerfProfile() sur le seam"
```

---

## Task 3 : Overlay `?perf=1` (mesure sur vrai device)

**Files:**
- Create: `src/render/perf/perfOverlay.ts`
- Modify: `src/app/bootOptions.ts`
- Modify: `src/app/main.ts`
- Test: `tests/e2e/perfOverlay.spec.ts`

**Interfaces:**
- Consumes: `PerfSnapshot` (Task 1), `h()` (`src/ui/h.ts`), `PALETTE` (`src/ui/palette.ts`).
- Produces: `class PerfOverlay { constructor(root: HTMLElement); update(snapshot: PerfSnapshot, fps: number): void }` ; `BootOptions.perf: boolean`.

- [ ] **Step 1 : Parse du flag (test qui échoue)**

```ts
// tests/unit/bootOptions.test.ts — ajouter (ou créer si absent)
import { parseBootOptions } from '@/app/bootOptions'
it('parse le flag perf', () => {
  expect(parseBootOptions('?perf=1').perf).toBe(true)
  expect(parseBootOptions('').perf).toBe(false)
})
```
Lancer → FAIL.

- [ ] **Step 2 : Implémenter le parse**

Dans `bootOptions.ts` : ajouter `perf: boolean` à `BootOptions`, puis dans `parseBootOptions` :
```ts
  const perf = params.get('perf') === '1'
```
et l'ajouter au `return { autostart, seed, test, level, lite, editor, perf }`.
Lancer le test → PASS.

- [ ] **Step 3 : Implémenter l'overlay (DA 16-bit, `h()` + PALETTE)**

```ts
// src/render/perf/perfOverlay.ts
import { h } from '@ui/h'
import { PALETTE } from '@ui/palette'
import type { PerfSnapshot } from './perfProbe'

/**
 * Petit panneau de diagnostic perf (dev/`?perf=1`). DA 16-bit : panneau pixel,
 * bordure noire, palette imposée, aucun emoji. Observer-only : n'affiche que ce
 * que la sonde publie. Se met à jour au plus ~4×/s pour ne rien coûter.
 */
export class PerfOverlay {
  private readonly el: HTMLElement
  private readonly lines: HTMLElement
  private lastPaint = 0

  constructor(root: HTMLElement) {
    this.lines = h('pre', {})
    this.lines.setAttribute(
      'style',
      `margin:0;font-family:monospace;font-size:12px;line-height:1.35;color:${PALETTE.jauneSecurite};white-space:pre`
    )
    this.el = h('div', { className: 'perf-overlay' }, this.lines)
    this.el.setAttribute(
      'style',
      `position:absolute;top:8px;left:8px;z-index:90;padding:8px 10px;` +
        `background:${PALETTE.contour};border:3px solid ${PALETTE.jauneSecurite};` +
        `box-shadow:4px 4px 0 rgba(0,0,0,0.5);pointer-events:none`
    )
    root.append(this.el)
  }

  /** `now` optionnel pour tester le throttle sans horloge réelle. */
  update(snapshot: PerfSnapshot, fps: number, now: number = performance.now()): void {
    if (now - this.lastPaint < 250) {
      return
    }
    this.lastPaint = now
    const s = snapshot.sections
    const c = snapshot.counts
    const ms = (n: string): string => (s[n] ?? 0).toFixed(2).padStart(5)
    const cpu = (s.sim ?? 0) + (s.hordeSync ?? 0) + (s.playersSync ?? 0) + (s.phaserRender ?? 0)
    this.lines.textContent = [
      `FPS        ${String(Math.round(fps)).padStart(3)}`,
      `CPU/frame  ${cpu.toFixed(2).padStart(5)} ms`,
      `  sim      ${ms('sim')} ms`,
      `  horde    ${ms('hordeSync')} ms`,
      `  joueurs  ${ms('playersSync')} ms`,
      `  phaser   ${ms('phaserRender')} ms`,
      `ennemis    ${String(c.enemies ?? 0).padStart(4)}`,
      `objets     ${String(c.objects ?? 0).padStart(4)}`
    ].join('\n')
  }

  destroy(): void {
    this.el.remove()
  }
}
```

> `phaserRender` n'est pas encore instrumenté dans GameScene (Phaser rend hors `update`). Optionnel : envelopper `this.renderer.render` via un hook en création de scène, sinon la ligne affiche 0 — acceptable, la valeur clé sur device est FPS + `sim`/`horde`. Si voulu, ajouter en Task 2 un wrap de `this.game.renderer` timé dans la sonde.

- [ ] **Step 4 : Câbler dans main.ts**

Dans `bootGame`, après création de l'`overlay`/`uiRoot`, si `opts.perf` (ou `import.meta.env.DEV`), instancier `PerfOverlay` et le nourrir dans la boucle `tick` :

```ts
  const perfOverlay = (opts.perf && audio !== null) ? new PerfOverlay(uiRoot) : null
  // dans tick(), après audio?.observe(state) :
  if (perfOverlay !== null) {
    const snap = seam.debugPerfProfile?.() ?? null
    if (snap !== null) perfOverlay.update(snap, game.loop.actualFps)
  }
```
Import : `import { PerfOverlay } from '@render/perf/perfOverlay'`.

> Le seam est déjà construit en dev/`?test=1` (`import.meta.env.DEV || opts.test`). En prod sans `?perf=1`, `perfOverlay` est `null` et rien ne se charge (l'overlay est tree-shakeable derrière le flag).

- [ ] **Step 5 : e2e — présent avec `?perf=1`, absent sans**

```ts
// tests/e2e/perfOverlay.spec.ts
import { test, expect } from '@playwright/test'
test('overlay perf present avec ?perf=1', async ({ page }) => {
  await page.goto('/?test=1&autostart=solo&perf=1')
  await page.waitForFunction(() => (window as any).__GAME__?.ready === true)
  await expect(page.locator('.perf-overlay')).toBeVisible()
})
test('overlay perf absent sans le flag', async ({ page }) => {
  await page.goto('/?test=1&autostart=solo')
  await page.waitForFunction(() => (window as any).__GAME__?.ready === true)
  await expect(page.locator('.perf-overlay')).toHaveCount(0)
})
```

- [ ] **Step 6 : Gates + commit**

```bash
npm run type-check && npm run lint && npm run test && npm run sim:check && npm run test:e2e -- perfOverlay
git add src/render/perf/perfOverlay.ts src/app/bootOptions.ts src/app/main.ts tests/unit/bootOptions.test.ts tests/e2e/perfOverlay.spec.ts
git commit -m "feat(perf): overlay ?perf=1 (FPS + decomposition frame) — DA 16-bit, mesure device"
```

**🚦 GATE user device (hors code) :** l'utilisateur lance `…/?perf=1&autostart=solo` **sur son téléphone**, joue jusqu'à une horde dense, et remonte : FPS, CPU/frame, `phaser` ms, `objets`. **Ces chiffres priorisent les Tâches 4-6** (si FPS chute avec objets élevés → culling/overdraw ; si `sim` domine → cas improbable, voir Task 7).

---

## Task 4 : Culling hors-écran (P1 — le levier prioritaire)

**Files:**
- Create: `src/render/perf/cull.ts`
- Test: `tests/unit/cull.test.ts`
- Modify: `src/render/scenes/hordeRenderer.ts` (et, si le device pointe le décor, `decorStreamer`/`siteRenderer`)

**Interfaces:**
- Produces: `interface ViewBounds { left:number; top:number; right:number; bottom:number }` ; `inView(x:number,y:number,b:ViewBounds,margin:number):boolean` ; `cameraBounds(cam:{worldView:{x:number;y:number;width:number;height:number}}):ViewBounds`.

- [ ] **Step 1 : Test qui échoue**

```ts
// tests/unit/cull.test.ts
import { describe, it, expect } from 'vitest'
import { inView, cameraBounds } from '@render/perf/cull'
describe('cull', () => {
  const b = { left: 0, top: 0, right: 100, bottom: 100 }
  it('point interne visible', () => { expect(inView(50, 50, b, 0)).toBe(true) })
  it('point externe masqué', () => { expect(inView(200, 50, b, 0)).toBe(false) })
  it('marge inclut le voisinage', () => { expect(inView(120, 50, b, 30)).toBe(true) })
  it('cameraBounds depuis worldView', () => {
    expect(cameraBounds({ worldView: { x: 10, y: 20, width: 30, height: 40 } }))
      .toEqual({ left: 10, top: 20, right: 40, bottom: 60 })
  })
})
```
Lancer → FAIL.

- [ ] **Step 2 : Implémenter l'util pur**

```ts
// src/render/perf/cull.ts
export interface ViewBounds { left: number; top: number; right: number; bottom: number }

/** Vrai si (x,y) est dans la vue caméra élargie d'une marge (px monde). */
export function inView(x: number, y: number, b: ViewBounds, margin: number): boolean {
  return x >= b.left - margin && x <= b.right + margin && y >= b.top - margin && y <= b.bottom + margin
}

/** Bornes monde d'une caméra Phaser (via son worldView). */
export function cameraBounds(cam: { worldView: { x: number; y: number; width: number; height: number } }): ViewBounds {
  const w = cam.worldView
  return { left: w.x, top: w.y, right: w.x + w.width, bottom: w.y + w.height }
}
```
Lancer → PASS.

- [ ] **Step 3 : Appliquer au rendu (hordeRenderer d'abord)**

Dans `hordeRenderer.sync(...)`, calculer les bornes une fois et, pour chaque sprite d'ennemi affiché, poser `sprite.visible = inView(enemy.x, enemy.y, bounds, MARGIN)`. `MARGIN` = ~un demi-sprite (ex. 120). Un objet `visible=false` n'est **pas dessiné** (fill-rate ↓) et le pipeline le saute. **Ne pas** dé-pooler (garder le sprite alloué) — on ne fait que masquer. Récupérer la caméra passée par GameScene (ajouter le paramètre `cam` à `sync` si absent, en le passant depuis `update`).

> **Priorité réelle** : appliquer d'abord au **décor** (décalques/props via `decorStreamer`/`siteRenderer`) **si** le device montre que le fill-rate est le mur — c'est là que se trouvent les ~500 décalques hors-écran-mais-dans-chunk. Les ennemis sont déjà centrés caméra.

- [ ] **Step 4 : Mesure avant/après (discipline)**

`?perf=1` (device + desktop) : comparer `phaser` ms et FPS horde AVANT/APRÈS. **Si aucun gain mesurable → revert cette application** (l'util pur peut rester). Noter les chiffres dans le message de commit.

- [ ] **Step 5 : Gates + commit**

```bash
npm run type-check && npm run lint && npm run test -- cull && npm run sim:check && npm run test:e2e
git add src/render/perf/cull.ts tests/unit/cull.test.ts src/render/scenes/hordeRenderer.ts
git commit -m "perf(render): culling hors-ecran (visible=false) — <gain mesure> ; sim:check diff 0"
```

---

## Task 5 : Plafond de densité décalques/props (P2 — overdraw)

**Files:**
- Create: `src/render/perf/densityCap.ts`
- Test: `tests/unit/densityCap.test.ts`
- Modify: le module de décor (streamer/`siteRenderer`) qui place les décalques.

**Interfaces:**
- Produces: `decalBudget(viewW:number, viewH:number, perMillionPx:number, hardCap:number):number`.

- [ ] **Step 1 : Test qui échoue**

```ts
// tests/unit/densityCap.test.ts
import { describe, it, expect } from 'vitest'
import { decalBudget } from '@render/perf/densityCap'
describe('decalBudget', () => {
  it('échelle avec la surface visible', () => {
    expect(decalBudget(1000, 1000, 50, 999)).toBe(50) // 1 Mpx * 50
    expect(decalBudget(2000, 1000, 50, 999)).toBe(100)
  })
  it('respecte le plafond dur', () => { expect(decalBudget(4000, 4000, 50, 120)).toBe(120) })
  it('jamais négatif', () => { expect(decalBudget(0, 0, 50, 120)).toBe(0) })
})
```
Lancer → FAIL.

- [ ] **Step 2 : Implémenter**

```ts
// src/render/perf/densityCap.ts
/** Budget de décalques pour une surface visible donnée, à densité cible, plafonné. */
export function decalBudget(viewW: number, viewH: number, perMillionPx: number, hardCap: number): number {
  const millions = (viewW * viewH) / 1_000_000
  return Math.min(hardCap, Math.max(0, Math.round(millions * perMillionPx)))
}
```
Lancer → PASS.

- [ ] **Step 3 : Appliquer déterministe**

Dans le placement des décalques : après génération **seedée** de la liste (ordre déterministe déjà en place), n'afficher que les `decalBudget(...)` premiers (les autres restent non-instanciés ou `visible=false`). **Ne pas** re-seeder ni ré-ordonner → même rendu à budget égal, simplement tronqué. Densité par défaut (`perMillionPx`, `hardCap`) issue de `QUALITY.high` (Task 6) pour rester généreux au départ.

- [ ] **Step 4 : Gate visuel + perf**

Capture avant/après (le sol ne doit pas paraître vide) + `?perf=1`. Revert si le rendu s'appauvrit sans gain device.

- [ ] **Step 5 : Gates + commit**

```bash
npm run type-check && npm run lint && npm run test -- densityCap && npm run sim:check
git add src/render/perf/densityCap.ts tests/unit/densityCap.test.ts <module décor modifié>
git commit -m "perf(render): plafond densite decalques par surface visible (deterministe cosmetique)"
```

---

## Task 6 : Qualité adaptative + option (P3 — vieux devices/thermal)

**Files:**
- Create: `src/render/perf/qualityManager.ts`
- Test: `tests/unit/qualityManager.test.ts`
- Modify: l'écran Options (là où vivent les réglages audio) + les consommateurs de `cullMargin`/`decalPerMillionPx`/`maxDamageNumbers`.

**Interfaces:**
- Produces: `type QualityTier = 'high'|'balanced'|'perf'` ; `const QUALITY: Record<QualityTier, QualityConfig>` ; `nextTier(current: QualityTier, recentFps: number, framesLow: number): { tier: QualityTier; framesLow: number }`.

- [ ] **Step 1 : Test qui échoue**

```ts
// tests/unit/qualityManager.test.ts
import { describe, it, expect } from 'vitest'
import { nextTier, QUALITY } from '@render/perf/qualityManager'
describe('qualityManager', () => {
  it('tiers ordonnés du + lourd au + léger', () => {
    expect(QUALITY.high.decalPerMillionPx).toBeGreaterThan(QUALITY.perf.decalPerMillionPx)
    expect(QUALITY.perf.targetFps).toBe(30)
  })
  it('descend d’un cran après 90 frames sous 45 FPS', () => {
    let st = { tier: 'high' as const, framesLow: 89 }
    const r = nextTier(st.tier, 40, st.framesLow)
    expect(r.tier).toBe('balanced')
    expect(r.framesLow).toBe(0)
  })
  it('reste stable si FPS OK et remet le compteur', () => {
    expect(nextTier('balanced', 60, 50)).toEqual({ tier: 'balanced', framesLow: 0 })
  })
  it('ne descend pas sous perf', () => {
    expect(nextTier('perf', 20, 999).tier).toBe('perf')
  })
})
```
Lancer → FAIL.

- [ ] **Step 2 : Implémenter la FSM pure**

```ts
// src/render/perf/qualityManager.ts
export type QualityTier = 'high' | 'balanced' | 'perf'
export interface QualityConfig {
  cullMargin: number
  decalPerMillionPx: number
  maxDamageNumbers: number
  targetFps: number
}
export const QUALITY: Record<QualityTier, QualityConfig> = {
  high:     { cullMargin: 400, decalPerMillionPx: 90, maxDamageNumbers: 40, targetFps: 60 },
  balanced: { cullMargin: 200, decalPerMillionPx: 55, maxDamageNumbers: 24, targetFps: 60 },
  perf:     { cullMargin: 80,  decalPerMillionPx: 28, maxDamageNumbers: 12, targetFps: 30 }
}
const ORDER: readonly QualityTier[] = ['high', 'balanced', 'perf']
const LOW_FPS = 45
const LOW_FRAMES = 90

/** FSM adaptative pure : descend d'un cran après LOW_FRAMES frames sous LOW_FPS. */
export function nextTier(current: QualityTier, recentFps: number, framesLow: number): { tier: QualityTier; framesLow: number } {
  const i = ORDER.indexOf(current)
  if (recentFps < LOW_FPS && current !== 'perf') {
    const fl = framesLow + 1
    if (fl >= LOW_FRAMES) {
      return { tier: ORDER[Math.min(ORDER.length - 1, i + 1)] as QualityTier, framesLow: 0 }
    }
    return { tier: current, framesLow: fl }
  }
  return { tier: current, framesLow: 0 }
}
```
Lancer → PASS.

- [ ] **Step 3 : Câbler**

- Consommer `QUALITY[tier]` dans le culling (Task 4 `MARGIN` → `cullMargin`), la densité (Task 5 `perMillionPx` → `decalPerMillionPx`), et le cap des chiffres de dégâts flottants (déjà poolés).
- Ajouter dans Options un réglage « Qualité : Auto / Élevée / Perf » (naviguable manette+clavier via le `FocusModel` existant, comme les réglages de volume). Mode **Auto** = appliquer `nextTier` chaque frame depuis `game.loop.actualFps` ; modes fixes = tier figé.
- Persistance : même mécanisme que les volumes audio (si `localStorage`/settings existants).

- [ ] **Step 4 : Gates + commit**

```bash
npm run type-check && npm run lint && npm run test -- qualityManager && npm run sim:check && npm run test:e2e
git add src/render/perf/qualityManager.ts tests/unit/qualityManager.test.ts <options + consommateurs>
git commit -m "feat(perf): qualite adaptative (tiers + FSM Auto) + option 30 FPS — render-only"
```

---

## Task 7 : Gate anti-régression `perf:check` (budget CPU sim)

**Files:**
- Create: `tools/perf/check.ts`
- Modify: `package.json` (script `perf:check`)

**Interfaces:**
- Consumes: l'infra sim headless existante (`tools/sim/`) — instancier la sim, spawn une horde au plafond, chronométrer le pas.
- Produces: exit code 0/1 selon `msPerStep < BUDGET`.

- [ ] **Step 1 : Écrire le harness**

```ts
// tools/perf/check.ts
// Mesure le COÛT CPU du pas de sim au plafond d'ennemis (headless, src/core pur —
// pas de DOM). Le rendu/fill = device (overlay ?perf=1), non couvert ici.
// Réutiliser l'amorçage de tools/sim/ (même construction de World + bot).
import { SPAWN } from '@content/config'
// … importer le harness sim (createWorld/step) comme dans tools/sim/runOne.ts

const BUDGET_MS = 2.0 // ×4 (mobile budget) = 8ms < 16.6ms @60fps. Marge assumée.
const STEPS = 300

function main(): void {
  // 1) construire une partie déterministe (seed fixe), fast-forward jusqu'au plafond d'ennemis
  //    (réutiliser debugSpawnEnemies ou l'arc de spawn jusqu'à SPAWN.maxActive)
  // 2) warmup 30 steps
  // 3) chronométrer STEPS pas de sim, calc msPerStep = total/STEPS
  const msPerStep = /* mesure */ 0
  const ok = msPerStep < BUDGET_MS
  // eslint-disable-next-line no-console
  console.log(`perf:check — ${msPerStep.toFixed(3)} ms/step @${SPAWN.maxActive} ennemis (budget ${BUDGET_MS}) → ${ok ? 'PASS' : 'FAIL'}`)
  process.exit(ok ? 0 : 1)
}
main()
```
> Compléter l'amorçage en **copiant** exactement la construction World/bot de `tools/sim/runOne.ts` (ne pas dupliquer les formules — importer le vrai code de prod). Le budget 2 ms/step correspond à la baseline mesurée 0,54 ms + marge de croissance de contenu.

- [ ] **Step 2 : Script**

`package.json` → `"perf:check": "tsx tools/perf/check.ts"`.

- [ ] **Step 3 : Vérifier**

`npm run perf:check` → doit PASS aujourd'hui (0,5 ms << 2 ms). Introduire volontairement un coût (temporaire) pour vérifier le FAIL, puis retirer.

- [ ] **Step 4 : Commit**

```bash
npm run type-check && npm run lint && npm run perf:check
git add tools/perf/check.ts package.json
git commit -m "chore(perf): gate perf:check — budget CPU du pas de sim au plafond (anti-regression)"
```

---

## Self-Review (fait à l'écriture)

1. **Couverture spec :** P0 (mesure) = Tâches 1-3 ✓ ; P1 culling = Tâche 4 ✓ ; P2 overdraw = Tâche 5 ✓ ; P3 qualité adaptative/30 FPS = Tâche 6 ✓ ; P4 gate = Tâche 7 ✓ ; overlay device + 🚦 GATE = Task 3 ✓ ; atlas = **exclu** (mesuré ≈0, cf note). 
2. **Placeholders :** les utils purs (perfProbe, cull, densityCap, qualityManager) ont du code complet + tests. Les intégrations (GameScene/hordeRenderer/Options/perf:check) référencent des **patterns existants à copier** (getGameScene de `debugRenderInfo`, amorçage de `tools/sim/runOne.ts`, réglages audio d'Options) — précisé faute de pouvoir recopier des fichiers non lus intégralement ; l'exécutant doit s'aligner sur l'existant.
3. **Cohérence de types :** `PerfSnapshot` (sections/counts) constant Task1→3 ; `QualityConfig` (cullMargin/decalPerMillionPx/maxDamageNumbers/targetFps) consommé Task 6 par Tasks 4/5. `ViewBounds` cohérent Task 4.
4. **Risque maîtrisé :** render-only ⇒ `sim:check` diff 0 exigé à chaque tâche touchant le jeu = garde-fou anti-casse gameplay. Discipline mesure avant/après + revert-si-pas-de-gain sur Tasks 4-5.

## Execution Handoff

**Plan complet et sauvé dans `docs/superpowers/plans/2026-07-12-perf-mobile.md`. Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — je dispatche un subagent frais par tâche, revue entre les tâches, itération rapide.

**2. Inline** — j'exécute les tâches dans cette session, checkpoints de revue.

**Ordre conseillé :** Tâches 1→3 (P0), puis **🚦 GATE device** (tu mesures sur ton téléphone), puis Tâches 4-6 priorisées par tes chiffres, Tâche 7 en parallèle.
