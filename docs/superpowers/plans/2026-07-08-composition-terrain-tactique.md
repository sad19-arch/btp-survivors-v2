# Composition cohérente + terrain tactique — Plan (tranche GOLDEN terrassement)

> **Pour agents :** SOUS-SKILL : superpowers:subagent-driven-development. Basé sur le spec `docs/superpowers/specs/2026-07-08-composition-terrain-tactique-design.md`.

**But :** remplacer le semis d'assets par une **composition en clusters cohérents** + **terrain tactique** (collision) + **champ de flux** (pathfinding léger) + **ouvriers navetteurs**, validé d'abord sur le **terrassement (stage 02)**.

**Branche :** `feat/tactical-terrain` sur `main` `6078a31`.

**Portée de CE plan :** phases 1→7 du spec (assets golden, data, collision, pathfinding, rendu, ouvriers, capture golden → GATE user). Le **re-tune/re-baseline** (phase 8) et le **déroulé des 9 stages** (phase 9) seront planifiés APRÈS la validation golden (chaque stage = son mini-cycle sémantique→ASCII).

## Global Constraints
- **Séparation sim/rendu** : la géométrie du site (`siteLayout`) est PURE et vit en `src/core`/`src/content` ; **sim ET rendu appellent la MÊME fonction** `buildSiteLayout(seed,…)` au reset (le rendu peut importer core). `src/core` n'importe jamais Phaser/DOM.
- **Déterminisme** : zéro `Math.random`/`Date.now`/`new Date` en core/content. `siteLayout` calculé **une fois au reset** via un **RNG dédié** `siteRng = mulberry32(seed ^ 0x51e0)` — n'avance PAS le flux RNG loot/chest/wave (comme `_waveRng`). Même seed ⇒ même site.
- **`sim:check` teste `terrain_vierge` (stage 01)** : tant que **stage 01 n'a PAS de clusters** (`STAGE_CLUSTERS['terrain_vierge'] = []`), collision et flow-field sont des **no-op sur stage 01** ⇒ **`sim:check` diff 0** pendant tout le golden. La divergence sim (et le re-baseline) arriveront quand stage 01 recevra des clusters (rollout).
- **Anti-god-object** : rendu des clusters → `siteRenderer.ts` ; ouvriers → `siteWorkers.ts` ; JAMAIS dans `GameScene` (câblage/délégation only).
- **DA 16-bit** : nouveaux assets calibrés `player_j1`, prompt global, `npm run assets:qa`, pas d'emoji.
- Zéro `any` core, TS strict, ESLint 0. Gates/tâche : tsc · lint · vitest · sim:check · test:e2e (+ assets:qa pour les tâches d'asset).

## Ancres de code (vérifiées)
- `src/content/config.ts:22` `WORLD = { width:10240, height:7680 }`.
- `src/render/stages.ts` `STAGE_RENDER` + interface `StageRender` (stage 02 = `TERRASSEMENT`/équivalent : structures excavator/dump_truck/road_roller/bulldozer/pit_big, landmark pit, decals tracks/puddle, prop dirt_large).
- `public/stage02/` : `props/{excavator,dump_truck,road_roller,bulldozer}.png`, `structures/pit_big.png`, `landmarks/pit.png`, `props/dirt_large.png`, `decals/{tracks,puddle}.png`, `ground/tile_0..5.png`, `npc/{chef,signaleur,porteur,macon}_work.png`.
- `src/render/props.ts` `resolvePlacement` (dart-throwing déterministe, 12 candidats) + `createStructures`/`createLandmark`.
- `src/render/decorStreamer.ts` (chunks 1024, hash `(seed,cx,cy)` FNV+mulberry32) — patron de déterminisme streamé.
- `src/core/systems/collision.ts` (projectile↔ennemi↔joueur) ; `src/core/systems/bounds.ts` (clamp joueur au monde). C'est là que s'insère la collision d'obstacles.
- Enemy AI : `src/core/systems/enemyAi.ts` (dispatch behaviors chase/zigzag/circler/sweep/charger). C'est là que se branche le flux.
- `SpatialGrid` (core, lot B2 perf) — à réutiliser pour indexer les obstacles.
- RNG isolés existants : `_waveRng` seed^0x5a1e, `chestRng` seed^0x3c7a, `lootRng` 0x1007, `prisonerRng` 0x2b1d (choisir un const distinct pour `siteRng`).
- `src/render/scenes/ambientNpc.ts` + câblage GameScene `ambientSprites` — **remplacé** par `siteWorkers.ts`.

---

## Phase A — Assets golden (contrôleur, PixelLab)

### A0 — Concept-lock du panneau de clôture (GATE DA user)
Générer **1 asset** `fence_panel` (panneau de clôture de chantier type Heras, répétable pour former une ligne/anneau), calibré `player_j1`, prompt global, fond transparent. Le montrer à l'utilisateur pour **valider la DA** avant de produire le reste. (Contrôleur pilote `create_map_object` ; pas de tâche implémenteur.)

### A1 — Set d'assets + QA
Après validation A0 : `road_strip` (bande route), `site_gate` (portail), `fence_post` (poteau d'angle) + accessoires ouvriers si absents (charge : brouette pleine/vide [existe], planche, seau ; emote panique ; pose « porte charge » + gilet HV). `npm run assets:qa` vert + planche récap. Nommage `public/stage02/...` cohérent.

---

## Phase B — Data (core/content, pur)

### T1 — Modèle de prefabs + clusters terrassement (`src/content/clusters.ts`)
**Files:** Create `src/content/clusters.ts` ; Test `tests/unit/clusters.test.ts`.
**Interfaces produites :**
```ts
export type CollideKind = 'both' | 'enemies' | 'none'
export type ObstacleShape =
  | { kind: 'circle'; r: number }
  | { kind: 'segment'; x2: number; y2: number; thickness: number } // de (dx,dy) à (dx+x2,dy+y2)
export interface ClusterElement { assetKey: string; dx: number; dy: number; scale: number; collide: CollideKind; shape?: ObstacleShape }
export interface ClusterDef { id: string; elements: ClusterElement[]; footprintRadius: number; gates: { dx: number; dy: number }[] }
export const CLUSTERS: Record<string, ClusterDef>          // registre global par id
export const STAGE_CLUSTERS: Record<string, { role: string; clusterId: string }[]>  // par stageId → rôles de zone
// terrain_vierge → [] (VIDE : garantit sim:check diff 0 tant que le golden ne touche que le stage 02)
```
Définir les prefabs terrassement : `cluster_excavation` (pit `both` circle + 5-6 `fence_panel` `both` segment en anneau **avec un gate** + excavator `none` accolé + dump_truck `none` + 2 dirt `none`), `cluster_spoil` (3-4 dirt + puddle, `none`), `cluster_plant` (road_roller+bulldozer, `none`), `cluster_pause` (cabane `none`), `cluster_route` (road_strip + fence_panel `both` le long + site_gate = ouverture).
- **Steps TDD :** test échoue → intégrité (chaque `assetKey` non vide ; chaque cluster avec des éléments `collide!=='none'` a **≥1 gate** ; `footprintRadius` ≥ rayon max des éléments ; `STAGE_CLUSTERS['terrain_vierge']` est `[]`) → impl → vert → commit.
- **Gate :** tsc/lint/vitest/**sim:check diff 0** (data pure non câblée).

### T2 — Zonage du site (`src/core/siteLayout.ts`, pur seedé)
**Files:** Create `src/core/siteLayout.ts` ; Test `tests/unit/siteLayout.test.ts`.
**Interfaces produites :**
```ts
export interface PlacedCluster { defId: string; x: number; y: number }
export interface Obstacle { kind: 'circle' | 'segment'; x: number; y: number; x2?: number; y2?: number; r?: number; thickness?: number; blocks: 'both' | 'enemies' }
export interface SiteLayout { clusters: PlacedCluster[]; obstacles: Obstacle[] }
export function buildSiteLayout(seed: number, worldW: number, worldH: number, stageId: string): SiteLayout
```
Algo (pur, `siteRng = mulberry32(seed ^ 0x51e0)`) : route = bande `y ∈ [worldH-ROUTE_BAND, worldH]` (clusters `cluster_route` le long) ; grille de cellules `CELL≈2048` jittée ; rôle par cellule selon distance à la route (proche → plant/pause ; loin → excavation ; intermédiaire → spoil) ; tirage du clusterId dans `STAGE_CLUSTERS[stageId]` filtré par rôle ; **rejet** si l'ancre est à < `MIN_GAP` d'une ancre posée OU à < `SPAWN_SAFE_R` du centre monde (spawn) pour tout cluster **collidable**. `obstacles` = formes absolues dérivées des éléments `collide!=='none'` des clusters posés. Si `STAGE_CLUSTERS[stageId]` est `[]` → `{ clusters:[], obstacles:[] }`.
- **Steps TDD :** déterminisme (même seed → `SiteLayout` égal) ; **sécurité spawn** (aucun obstacle `both` dans `SPAWN_SAFE_R`) ; **espacement** (toute paire d'ancres ≥ `MIN_GAP`) ; `terrain_vierge` → vide ; **isolation RNG** (appeler `buildSiteLayout` n'altère pas une séquence `mulberry32(seed)` indépendante — il a son propre state).
- **Gate :** tsc/lint/vitest/**sim:check diff 0** (pas encore câblé dans la sim).

---

## Phase C — Sim (collision + pathfinding) — no-op sur stage 01 ⇒ sim:check diff 0

### T3 — Collision d'obstacles (`src/core/systems/obstacleCollision.ts`)
**Files:** Create `src/core/systems/obstacleCollision.ts` ; MAJ `src/core/simulation.ts` (calcul `buildSiteLayout` au reset + index spatial + appel du système) ; Test `tests/unit/obstacleCollision.test.ts`.
**Interfaces :**
```ts
export function resolveObstacleCollisions(world: World, obstacles: SpatialIndex, dtMs: number): void
```
Au `reset()` de `Simulation` : `const layout = buildSiteLayout(seed, WORLD.width, WORLD.height, stageId)` ; insérer `layout.obstacles` dans une `SpatialGrid` stockée sur le world. Chaque pas, APRÈS le mouvement des entités : pour joueur (obstacles `both`) et ennemis (`both`+`enemies`), **push-out** hors des formes chevauchées (circle↔circle, circle↔segment — projection sur le point le plus proche + repousse selon la pénétration). Déterministe.
- **Steps TDD :** une entité qui pénètre un disque/segment est repoussée juste au contact ; un obstacle `enemies` ne repousse PAS le joueur ; `none` jamais dans la liste ; déterminisme ; **stage `terrain_vierge` → obstacles vides → aucune modif de trajectoire**.
- **Gate :** tsc/lint/vitest/**sim:check diff 0** (stage 01 sans clusters)/e2e (le joueur sur stage 02 ne traverse plus une fosse ; ne se coince jamais au spawn).

### T4 — Champ de flux + branchement enemyAi (`src/core/systems/flowField.ts`)
**Files:** Create `src/core/systems/flowField.ts` ; MAJ `src/core/systems/enemyAi.ts` (mélange flux) ; MAJ `simulation.ts` (throttle rebuild) ; Test `tests/unit/flowField.test.ts`.
**Interfaces :**
```ts
export interface FlowField { originX: number; originY: number; cell: number; cols: number; rows: number; dir: Int8Array /* 2 valeurs/cellule ou index de direction */ }
export function buildFlowField(px: number, py: number, obstacles: SpatialIndex, cell: number, half: number): FlowField
export function sampleFlow(f: FlowField, x: number, y: number): { fx: number; fy: number } // (0,0) hors champ
```
BFS/Dijkstra depuis la cellule du joueur sur une fenêtre `2*half` (ex. 4096) centrée joueur, `cell≈128` ; voisins 8-connexes, ordre FIXE (déterministe) ; cellules obstruées (obstacle `both`/`enemies` chevauchant) non traversables. Stocké sur le world, **rebâti seulement quand le joueur change de cellule** (garder `lastFlowCell`). `enemyAi` : `sampleFlow` → si non nul, **mélanger** au vecteur chase (ex. `0.7*flow + 0.3*chase`, renormalisé) ; sinon chase pur. Glissement conservé via T3.
- **Steps TDD :** avec un mur entre ennemi et joueur, `sampleFlow` à la position ennemi pointe vers le **contournement** (pas droit dans le mur) ; sans obstacle, le flux pointe droit vers le joueur (⇒ enemyAi **identique** au chase → diff 0) ; déterminisme ; rebuild throttlé (ne recalcule pas si même cellule).
- **Gate :** tsc/lint/vitest/**sim:check diff 0** (stage 01 : pas d'obstacles → flux = droit → enemyAi inchangé)/e2e (un ennemi contourne une fosse pour atteindre le joueur ; jamais coincé indéfiniment).

---

## Phase D — Rendu (observateur, diff 0)

### T5 — Rendu des clusters (`src/render/scenes/siteRenderer.ts`)
**Files:** Create `src/render/scenes/siteRenderer.ts` ; MAJ `GameScene` (instancie + délègue `sync`/`reset`) ; retirer le semis hero du stage 02 concerné ; Test e2e.
`SiteRenderer` : au reset, `buildSiteLayout(seed, WORLD.width, WORLD.height, stageId)` (MÊME appel que la sim) → dessine chaque cluster (ses éléments aux offsets, depth décor) ; **cull** par vue (n'affiche que les clusters dont l'empreinte recoupe la caméra) ; garde un léger clutter streamé pour la texture (decorStreamer conservé, allégé). Pool/nettoyage au reset (pas de fuite).
- **Steps TDD :** e2e stage 02 — les clusters apparaissent (pelleteuse + fosse + clôture groupées, pas en vrac) ; pas de fuite au restart (compteur d'objets borné). Capture.
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e.

### T6 — Ouvriers navetteurs (`src/render/scenes/siteWorkers.ts`)
**Files:** Create `src/render/scenes/siteWorkers.ts` + util pur `src/render/workerBehavior.ts` ; MAJ `GameScene` (remplace le câblage `ambientNpc`/`ambientSprites`) ; Test `tests/unit/workerBehavior.test.ts` + e2e.
**Util pur :**
```ts
export function commutePos(ax, ay, bx, by, tMs, speed): { x, y, atEnd: 'a'|'b'|null, dir }   // navette A↔B
export function loadVisible(phase): boolean                                                    // plein à l'aller, vide au retour
export function panicDecision(wx, wy, nearestEnemyX, nearestEnemyY, panicR): { flee: boolean; fx: number; fy: number }
```
`SiteWorkers` : sélectionne ~**10 ouvriers** dans la région autour du joueur (paires de zones issues de `siteLayout` — ex. excavation↔benne, patrouille route), les fait faire la **navette** (temps-piloté), affiche la **charge** (sprite attaché, plein/vide selon la phase), joue un **geste** aux extrémités ; **panique** si un ennemi entre dans `PANIC_R` (fuite opposée + emote). Gilet HV, emote panique **≠** bulle « Merci ». Non-collidable. Ré-ancré quand le joueur change de région. Nettoyage au reset.
- **Steps TDD :** util pur (navette borne A/B, charge plein↔vide, panique déclenchée dans le rayon et fuite opposée) ; e2e (ouvriers présents, distincts, ne comptent pas comme ennemis/objectifs).
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e.

---

## Phase E — Golden

### T7 — Câblage golden terrassement + capture (GATE user)
**Files:** MAJ `stages.ts`/`clusters.ts` pour finaliser le terrassement (prefabs + rôles + ouvriers), capture en jeu (spec e2e de capture). 
Vérifier en jeu : composition cohérente (accès sud → excavation nord, enclos à portail, engins accolés, chemins), terrain qui bloque proprement (joueur pas coincé, ennemis contournent), ~10 ouvriers vivants. **Capture envoyée à l'utilisateur = GATE** avant re-tune + déroulé des 9 stages.
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e/assets:qa + capture.

---

## Suite (planifiée APRÈS le GATE golden)
- **Phase 8 — Re-tune + re-baseline** : quand `terrain_vierge` (stage sondé par `sim:check`) reçoit des clusters, la sim diverge → mesurer, ajuster (densité d'obstacles, vitesse horde, drops), re-baseliner. Prévoir option harness pour sonder un stage à obstacles. **+ re-tune combiné** avec le lot juice en pause (`feat/addiction-juice`) au moment de la fusion.
- **Phase 9 — Déroulé des 9 stages** : pour chacun, mini-cycle sémantique → contraintes → prefabs → ASCII → auto-vérif → assets → capture, stage par stage.

## Vérification
Gates par tâche ci-dessus. Revue whole-branch (opus) en fin de tranche golden. Oracle : playtest (« le chantier est lisible et le terrain est fun sans frustrer ? »). `finishing-a-development-branch` + feu vert user avant merge/push.
