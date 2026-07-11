# PNJ 2-catégories + « compo = vérité totale » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal :** Quand un stage a une composition sauvée, elle est la source visuelle complète (zéro décor/PNJ procédural fantôme) ; les PNJ deviennent 2 catégories posées dans l'éditeur : « métier » fixe animé et « ouvrier » qui marche et fuit les ennemis.

**Architecture :** Tout est **render + éditeur** (le core/sim n'est pas touché → `sim:check` reste diff 0). Un `stageId` ayant `getComposedLayout(stageId) !== null` court-circuite `decorStreamer` (décor ambiant) et le bloc auto-peuplement de `siteWorkers`. Les PNJ deviennent une liste `npcs` dans la compo, rendus par `siteWorkers` selon `kind`. La fuite est un pur util cosmétique.

**Tech Stack :** TypeScript strict, Phaser (render), Vitest (happy-dom), PixelLab MCP (asset).

## Global Constraints

- `src/core` et `src/content` restent purs : zéro Phaser/DOM, zéro `Math.random`/`Date`, zéro `any`. (Le type `LayoutNpc` va dans `src/content/stageLayout.ts` = data pure.)
- La fuite/PNJ est **render-side cosmétique** : aucune collision, aucun impact sim/gameplay.
- `sim:check` doit rester **diff 0** (aucun fichier importé par `tools/sim/run.ts` n'est modifié sémantiquement).
- Séparation nette : `trade` (fixe) et `worker` (mobile) sont deux chemins distincts, pas de god-object.
- Asset : prompt global PixelLab + calibration `player_j1` + **golden-lock validé par l'utilisateur** avant packaging (skill `assets`).
- Texte in-game en français.
- Pas de commit/push sans que le lot soit vert (type-check + lint + vitest + sim:check).

---

### Task 1 : Asset ouvrier générique (golden-lock + feuille 4-dir 192)

**Files:**
- Create: `public/stage01/npc/ouvrier_walk.png` (feuille marche 4-dir 192×192, ordre `down/right/up/left`)
- Aucune modif de code dans ce lot.

**Interfaces:**
- Produces: la clé de skin `npc_stage01_ouvrier` → fichier `stage01/npc/ouvrier_walk.png` (consommée par Task 4 dans `stages.ts`).

- [ ] **Step 1 :** Générer le personnage via PixelLab (`create_character`, standard, 4 dir, size 128, view low top-down, prompt global + « construction worker, orange hard hat, hi-vis vest »). Récupérer via `get_character`.
- [ ] **Step 2 : GATE DA** — présenter la vue *down* à côté de `public/player_j1.png` (page `public/_gate/`) et **obtenir l'accord utilisateur**. Rejeter/regénérer si illisible à ~100 px ou hors DA (critères manifest §15). Ne pas continuer sans accord.
- [ ] **Step 3 :** `animate_character` (template `walk`, 4 directions) → frames de marche.
- [ ] **Step 4 :** Packager en feuille **192×192, 4×4, ordre down/right/up/left** (même pipeline que les feuilles existantes ; réutiliser le script de packaging du repo si présent, sinon composer via pngjs). Écrire `public/stage01/npc/ouvrier_walk.png`.
- [ ] **Step 5 :** `npm run assets:qa` → 0 erreur sur le nouveau fichier (dimensions/transparence/nommage).
- [ ] **Step 6 :** Commit `feat(assets): ouvrier générique marche 4-dir (stage01)`.

---

### Task 2 : Données `npcs` + `kind` + `fleeVelocity` (pur, testé)

**Files:**
- Modify: `src/content/stageLayout.ts` (ajout `LayoutNpc`, `npcs`)
- Modify: `src/editor/StageLayoutSchema.ts` (parse `npcs`)
- Modify: `src/render/stages.ts` (`StageAmbientNpc.kind`)
- Modify: `src/render/workerBehavior.ts` (ajout `fleeVelocity`)
- Test: `tests/unit/fleeVelocity.test.ts`, `tests/unit/stageLayoutNpcs.test.ts`

**Interfaces:**
- Produces:
  - `interface LayoutNpc { id: string; skin: string; kind: 'trade' | 'worker'; x: number; y: number }` et `StageLayout.npcs: LayoutNpc[]`.
  - `StageAmbientNpc.kind?: 'trade' | 'worker'` (défaut `'trade'`).
  - `fleeVelocity(pos: Vec2, enemies: ReadonlyArray<Vec2>, fleeRadius: number, speed: number): { vx: number; vy: number }` où `Vec2 = { x: number; y: number }`.

- [ ] **Step 1 (data) :** Dans `src/content/stageLayout.ts`, ajouter le type `LayoutNpc` (ci-dessus) + `npcs: LayoutNpc[]` à `StageLayout` + `npcs: []` dans `emptyLayout()`.
- [ ] **Step 2 (parse) — test d'abord :** `tests/unit/stageLayoutNpcs.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { parseLayout } from '@/editor/StageLayoutSchema'
import type { StageLayout } from '@content/stageLayout'

describe('parseLayout — npcs', () => {
  it('parse les PNJ (skin/kind/x/y), défaut kind=trade', () => {
    const json = JSON.stringify({ stage: 's', npcs: [
      { id: 'n1', skin: 'npc_stage01', kind: 'trade', x: 10, y: -20 },
      { id: 'n2', skin: 'npc_stage01_ouvrier', kind: 'worker', x: 0, y: 0 },
      { skin: 'npc_stage01' }
    ] })
    const r = parseLayout(json, 's')
    const l = r.layout as StageLayout
    expect(l.npcs).toHaveLength(3)
    expect(l.npcs[0]).toEqual({ id: 'n1', skin: 'npc_stage01', kind: 'trade', x: 10, y: -20 })
    expect(l.npcs[1]?.kind).toBe('worker')
    expect(l.npcs[2]?.kind).toBe('trade') // défaut
  })
  it('layout sans npcs → []', () => {
    const l = parseLayout('{"stage":"s"}', 's').layout as StageLayout
    expect(l.npcs).toEqual([])
  })
})
```

- [ ] **Step 3 :** Lancer → échoue (npcs non parsé). Implémenter le parse dans `StageLayoutSchema.parseLayout` : mapper `d.npcs` en `LayoutNpc[]` (skin string obligatoire sinon skip ; `kind` ∈ {trade,worker} défaut `trade` ; `x`/`y` via `num`). Relancer → PASS.
- [ ] **Step 4 (kind) :** Dans `src/render/stages.ts`, ajouter `kind?: 'trade' | 'worker'` à `interface StageAmbientNpc`. (Aucune valeur ajoutée ici — Task 4 taggue les skins.)
- [ ] **Step 5 (flee) — test d'abord :** `tests/unit/fleeVelocity.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { fleeVelocity } from '@render/workerBehavior'

describe('fleeVelocity', () => {
  it('aucun ennemi dans le rayon → immobile', () => {
    expect(fleeVelocity({ x: 0, y: 0 }, [{ x: 500, y: 0 }], 200, 60)).toEqual({ vx: 0, vy: 0 })
  })
  it('ennemi proche → s\'éloigne (direction opposée, norme = speed)', () => {
    const v = fleeVelocity({ x: 0, y: 0 }, [{ x: 100, y: 0 }], 200, 60)
    expect(v.vx).toBeCloseTo(-60, 5) // fuit vers -x
    expect(v.vy).toBeCloseTo(0, 5)
  })
  it('prend l\'ennemi le PLUS proche', () => {
    const v = fleeVelocity({ x: 0, y: 0 }, [{ x: 0, y: 150 }, { x: 30, y: 0 }], 200, 10)
    expect(v.vx).toBeCloseTo(-10, 5) // fuit le (30,0), pas le (0,150)
    expect(v.vy).toBeCloseTo(0, 5)
  })
  it('ennemi pile dessus (dist 0) → immobile (évite NaN)', () => {
    expect(fleeVelocity({ x: 5, y: 5 }, [{ x: 5, y: 5 }], 200, 60)).toEqual({ vx: 0, vy: 0 })
  })
})
```

- [ ] **Step 6 :** Lancer → échoue. Implémenter dans `src/render/workerBehavior.ts` :

```ts
export function fleeVelocity(
  pos: { x: number; y: number },
  enemies: ReadonlyArray<{ x: number; y: number }>,
  fleeRadius: number,
  speed: number
): { vx: number; vy: number } {
  let nx = 0, ny = 0, best = fleeRadius
  for (const e of enemies) {
    const dx = pos.x - e.x, dy = pos.y - e.y
    const d = Math.hypot(dx, dy)
    if (d < best && d > 0.0001) { best = d; nx = dx / d; ny = dy / d }
  }
  return { vx: nx * speed, vy: ny * speed }
}
```

- [ ] **Step 7 :** Relancer les 2 fichiers de test → PASS. `npm run type-check && npm run lint`.
- [ ] **Step 8 :** Commit `feat(pnj): data npcs/kind + fleeVelocity pur (tests)`.

---

### Task 3 : Rendu — compo autorité (siteWorkers PNJ posés + decorStreamer OFF)

**Files:**
- Modify: `src/render/scenes/siteWorkers.ts` (branche composée : ne créer que les `npcs` + paths ; couper porteur/navetteur/baseline)
- Modify: `src/render/scenes/GameScene.ts` (n'instancier/mettre à jour `decorStreamer` que si `getComposedLayout(stageId) === null`)
- Test: `tests/unit/siteWorkersComposed.test.ts`

**Interfaces:**
- Consumes: `LayoutNpc`, `getComposedLayout`, `fleeVelocity`.
- Produces: comportement runtime — 1 `npc` posé = 1 acteur ; `trade` = fixe + anim geste ; `worker` = marche + `fleeVelocity`.

- [ ] **Step 1 :** Ajouter les rôles `'npc_trade' | 'npc_worker'` au type `WorkerJob.role` de `siteWorkers.ts`. Un job npc porte `ax/ay` = position monde fixe (ancre) et `textureKey` = skin.
- [ ] **Step 2 (gating) :** En tête de `reset()`, après `buildSiteLayout`, calculer `const composed = getComposedLayout(stageId)`. **Encadrer les blocs porteur / navetteur / navetteur BASELINE par `if (composed === null) { … }`** (l'auto-peuplement ne tourne QUE hors compo). Conserver le bloc « chemins » (paths) tel quel (il tourne dans les 2 cas).
- [ ] **Step 3 (npcs) :** Toujours dans `reset()`, si `composed !== null`, pousser un job par `composed.npcs` : convertir compo→monde (`+worldW/2, +worldH/2`), `role = kind === 'worker' ? 'npc_worker' : 'npc_trade'`, `textureKey = npc.skin` (si `this.scene.textures.exists(skin)` sinon skip).
- [ ] **Step 4 (sync) :** Dans `sync(...)` (qui reçoit déjà l'état/les ennemis — sinon étendre la signature pour passer `enemies: ReadonlyArray<{x,y}>`), gérer les 2 rôles :
  - `npc_trade` : rester à `ax/ay`, jouer l'anim « work » (cycle de frames en place), pas de déplacement, pas de flip agressif.
  - `npc_worker` : `const {vx,vy} = fleeVelocity({x:job.px,y:job.py}, enemies, FLEE_R, WORKER_FLEE_SPEED)`. Intégrer `px += vx*dt`, `py += vy*dt`, clamp aux bornes monde ; si `vx≠0||vy≠0` jouer l'anim marche + flip selon `vx`, sinon idle. Constantes : `FLEE_R = 240`, `WORKER_FLEE_SPEED = 90`.
- [ ] **Step 5 (decorStreamer) :** Dans `GameScene`, localiser la création + l'`update` du `decorStreamer`. Les encadrer par `if (getComposedLayout(this.stage.id ?? stageId) === null)` (le stream ambiant ne tourne QUE hors compo). Vérifier le nom exact de l'id de stage dans GameScene.
- [ ] **Step 6 — test :** `tests/unit/siteWorkersComposed.test.ts` : tester la **fonction pure de sélection des jobs** extraite si nécessaire, OU au minimum documenter que la validation runtime se fait en jeu (Task 5). Test minimal viable : extraire une fonction pure `planNpcJobs(composed, worldW, worldH): Array<{role,x,y,skin}>` et l'assert (composé avec 1 npc → 1 job ; 0 auto). Écrire ce test AVANT l'extraction.

```ts
import { describe, it, expect } from 'vitest'
import { planNpcJobs } from '@render/scenes/siteWorkers'
import { emptyLayout } from '@content/stageLayout'

describe('planNpcJobs (compo → PNJ posés)', () => {
  it('1 npc posé → 1 job, converti en coords monde', () => {
    const l = emptyLayout('terrain_vierge')
    l.npcs = [{ id: 'n1', skin: 'npc_stage01', kind: 'trade', x: 100, y: -50 }]
    const jobs = planNpcJobs(l, 10240, 7680)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ role: 'npc_trade', x: 5220, y: 3790, skin: 'npc_stage01' })
  })
})
```

- [ ] **Step 7 :** Implémenter `planNpcJobs` (exportée, pure) et l'appeler dans `reset()`. Relancer → PASS.
- [ ] **Step 8 :** `npm run type-check && npm run lint && npm run test`. Puis **`npm run sim:check` → diff 0** (aucune modif core).
- [ ] **Step 9 :** Commit `feat(pnj): compo=vérité (siteWorkers PNJ posés + decorStreamer off)`.

---

### Task 4 : Éditeur — 2 sections PNJ + pose + import des PNJ auto

**Files:**
- Modify: `src/editor/PrefabCatalog.ts` (catégories `npc_metier`/`npc_ouvrier` + entrées PNJ par skin, taggées `kind`)
- Modify: `src/editor/EditorState.ts` (`addNpc`, sélection/déplacement/suppression npc, `importGenerated` → npcs, export inclut npcs)
- Modify: `src/editor/EditorScene.ts` (rendu des npcs : sprite frame 0 + badge fixe/mobile ; hit-test)
- Modify: `src/render/stages.ts` (tagger les skins ambient stage01 : géomètre/topographe/piqueteur/ouvplan = `trade` ; ajouter le skin `npc_stage01_ouvrier` = `worker` dans `ambient` ou une liste dédiée + preload)
- Test: `tests/unit/npcPalette.test.ts`

**Interfaces:**
- Consumes: `LayoutNpc`, `StageAmbientNpc.kind`, la clé `npc_stage01_ouvrier` (Task 1).
- Produces: entrées de palette PNJ ; `EditorState.layout.npcs` peuplé à la pose ; `exportGameJson()`/`exportJson()` incluent `npcs`.

- [ ] **Step 1 (skins) :** Dans `stages.ts` terrain_vierge, tagger `kind: 'trade'` sur les 4 skins ambient existants + déclarer le skin ouvrier `{ key: 'npc_stage01_ouvrier', file: 'stage01/npc/ouvrier_walk.png', frame: 192, kind: 'worker', … }` (dans `ambient`, ou une nouvelle liste `npcSkins` si on ne veut pas qu'il déambule en fallback — décider : le plus simple = `ambient` avec `kind:'worker'`). Précharger sa feuille (déjà couvert par le preload `ambient`).
- [ ] **Step 2 (palette) — test d'abord :** `tests/unit/npcPalette.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { getStageCatalog } from '@/editor/PrefabCatalog'

describe('palette PNJ (2 sections)', () => {
  it('les skins trade → npc_metier, le skin worker → npc_ouvrier', () => {
    const cat = getStageCatalog('terrain_vierge')
    const metier = cat.entries.filter((e) => e.category === 'npc_metier')
    const ouvrier = cat.entries.filter((e) => e.category === 'npc_ouvrier')
    expect(metier.length).toBeGreaterThan(0)
    expect(ouvrier.some((e) => e.id.includes('ouvrier'))).toBe(true)
  })
})
```

- [ ] **Step 3 :** Ajouter les catégories `{ id: 'npc_metier', label: 'PNJ métier (fixe)' }` et `{ id: 'npc_ouvrier', label: 'PNJ ouvrier (mobile)' }` à `CATEGORIES` (juste après `scenes`/topo). Générer une entrée de palette par skin ambient : `npcEntries(assets)` → pour chaque skin, `{ id: 'npc_'+key, label, category: kind==='worker'?'npc_ouvrier':'npc_metier', kind:'objet', size:'moyenne', npcSkin:key, npcKind:kind }`. Étendre `PaletteEntry` avec `npcSkin?: string; npcKind?: 'trade'|'worker'`. Relancer → PASS.
- [ ] **Step 4 (pose) :** Dans `EditorState`, `addNpc(skin: string, kind: 'trade'|'worker', worldX, worldY)` → push `LayoutNpc` (comp coords) ; câbler le drop d'une entrée PNJ dans `EditorScene` vers `addNpc`. Sélection/déplacement/suppression : réutiliser le modèle de sélection (id) en ajoutant les npcs à la boucle de hit-test/rendu.
- [ ] **Step 5 (rendu éditeur) :** Dans `EditorScene`, dessiner chaque `state.npcs` : sprite `skin` frame 0 + petit badge texte « fixe »/« mobile ». Hit-test pour sélection/drag.
- [ ] **Step 6 (import) :** Étendre `EditorState.importGenerated()` pour amener les PNJ auto du stage comme `LayoutNpc` éditables : pour chaque skin ambient du stage, poser 1-2 `LayoutNpc` à des positions dérivées (près du centre / des scènes), `kind` = celui du skin. (But : point de départ éditable, pas la reproduction exacte du runtime.)
- [ ] **Step 7 (export) :** Vérifier que `exportGameJson()` et `exportJson()` incluent `npcs` (via `serializeLayout` = `JSON.stringify`, déjà le cas). Ajouter un test rapide : après `addNpc`, `parseLayout(state.exportJson()).layout.npcs` non vide.
- [ ] **Step 8 :** `type-check && lint && test`. Commit `feat(editor): 2 sections PNJ + pose/import (compo)`.

---

### Task 5 : Validation en jeu + gates finaux

**Files:** aucun code (sauf correctifs).

- [ ] **Step 1 :** Sauver au repo une compo terrain_vierge de test avec 1 PNJ métier + 1 PNJ ouvrier + quelques décalques posés. Lancer `?autostart=solo&level=terrain_vierge`.
- [ ] **Step 2 (capture) :** Vérifier via capture `_gate` : **1 PNJ métier posé = 1 en jeu** (fixe, animé), **1 ouvrier = 1** (marche), **zéro trace de pneu / décalque auto**, l'ouvrier **s'éloigne** quand un ennemi entre à ~240 px.
- [ ] **Step 3 :** Vérifier un **stage sans compo** (ex. `gros_oeuvre`) : PNJ auto + décor procédural **inchangés** (fallback).
- [ ] **Step 4 :** Gates complets : `type-check`, `lint`, `test`, **`sim:check` diff 0**, `build`, `assets:qa`.
- [ ] **Step 5 :** Nettoyer la compo de test (ne pas committer `layouts/terrain_vierge.json` sauf demande — cf. gate équilibrage). Commit final si nouveaux correctifs.

---

## Self-Review

**Spec coverage :** décorStreamer OFF (Task 3 S5) ✓ · siteWorkers auto OFF (Task 3 S2) ✓ · 2 catégories data-driven (Task 4 S1/S3) ✓ · trade fixe / worker marche+fuite (Task 3 S4) ✓ · fleeVelocity pur (Task 2) ✓ · npcs dans compo (Task 2) ✓ · import PNJ auto (Task 4 S6) ✓ · asset ouvrier golden-lock (Task 1) ✓ · sim:check diff 0 (Task 3 S8, Task 5 S4) ✓ · fallback non composé (Task 3 S2/S5, Task 5 S3) ✓.

**Placeholders :** les incertitudes restantes (nom exact de l'id de stage dans GameScene, signature exacte de `sync`, présence d'un script de packaging) sont des points de vérification explicites dans le code, pas des trous — le subagent lit le fichier et adapte. Aucun « TODO » de logique.

**Cohérence des types :** `LayoutNpc {id,skin,kind,x,y}` identique Task 2↔3↔4 ; `fleeVelocity` signature identique Task 2↔3 ; `npcSkin/npcKind` sur `PaletteEntry` cohérents Task 4.
