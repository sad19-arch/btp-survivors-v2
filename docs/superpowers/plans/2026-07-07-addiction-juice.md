# Roadmap addiction — Pilier 1 « Juice immédiat » — Plan d'implémentation

> **Pour agents :** SOUS-SKILL : superpowers:subagent-driven-development. Basé sur le spec `docs/superpowers/specs/2026-07-07-addiction-juice-design.md`.

**But :** rendre le jeu jouissif immédiatement (rythme, barre XP, level-up, coffre, impact, évolutions lisibles, explosion late-game) — 8 items de feel, dont 2 d'équilibrage.

**Branche :** `feat/addiction-juice` sur `main` `6078a31`.

## Global Constraints
- **Séparation sim/rendu** ; `src/core`/`src/content` PURS (zéro Phaser/DOM, zéro `Math.random`/`Date.now`/`new Date` — RNG seedé `lootRng`). Zéro `any` core, TS strict, ESLint 0.
- **`GameScene` = câblage/délégation SEULEMENT** : screenshake → `cameraController.ts`, VFX → `vfxManager.ts`.
- **DA 16-bit** : palette `src/ui/palette.ts`, **pas d'emoji**, pas d'`innerHTML` interpolé (`h()`). Navigable manette+clavier (`FocusModel`).
- **`sim:check`** : diff 0 pour J1–J7 (observateurs) ; diff ATTENDU (non re-baseliné) pour J8–J9 ; VERT nouvelle baseline en J10.
- Gates/tâche : `npm run type-check` · `npm run lint` · `npm run test` · `npm run sim:check` · `npm run test:e2e`.

## Ordre d'exécution
J1→J7 (diff 0, contre baseline intouchée) **puis** J8, J9 (équilibrage, diff attendu) **puis** J10 (re-tune + re-baseline VERT). NE PAS re-baseliner avant J10.

## Ancres de code (vérifiées)
- `src/content/spawnRamp.ts:23` `SPAWN_RAMP` (early : `{0,3000,1} {45,2200,1} {100,1600,1} {180,1200,2}…`) ; `spawnParamsAt()` L47.
- `src/content/config.ts:70` `PICKUP_DROPS = { heal:{chance:0,value:18}, magnet:{chance:0,value:0}, chest:{chance:0,value:35} }`.
- `src/content/evolutions.ts:21` `EVOLUTIONS` (9 défs `{base,passive,evolved,reqBaseLevel,reqPassiveLevel}`) ; `src/core/systems/evolution.ts:19` `findEvolution(inv)`, type `Inventory` (`{weapons:{id,level}[], passives:{id,level}[]}`) importé de `@core/systems/cards`.
- `src/app/appState.ts:37` `InventoryEntry {id,name,level,maxLevel?}` ; `InventoryView {weapons[],passives[]}` ; `AppPlayerState extends PlayerState {inventory}`. `AppViewState.justEvolvedWeaponName`.
- `src/ui/overlay.ts` : `syncHud` L172 (barre XP via `this.bar(xp/threshold,'hud__bar--xp')` L208), `upgradePanel` L652, `showJackpot` L359, `showEvolutionBanner` L343, inventaire `syncInventory`/`.inv*`.
- `src/render/scenes/cameraController.ts` (pas de shake) ; `src/render/scenes/vfxManager.ts` (`spawnPixelPop`/`spawnFlash` poolés) ; `src/render/hitDiff.ts`, `src/render/damageNumbers.ts`.

---

### J1 — Signal « prête à évoluer » (core lecture seule) — diff 0
**Files:** Modif `src/core/systems/evolution.ts` (+ fonction pure) ; `src/app/appState.ts` (`InventoryEntry.evolveReady?`, `.evolveHint?`) ; `src/app/app.ts` (enrichir les entrées d'arme dans `getState`) ; Test `tests/unit/evolutionStatus.test.ts`.
**Interfaces produites :**
```ts
// evolution.ts
export interface EvolutionStatus {
  base: string; evolved: string; passive: string
  baseLevel: number; reqBaseLevel: number; hasPassive: boolean; ready: boolean
}
export function evolutionStatuses(inv: Inventory): EvolutionStatus[]
// appState.ts InventoryEntry additif :
evolveReady?: boolean; evolveHint?: string
```
`evolutionStatuses` : pour chaque `EVOLUTIONS` dont `inv.weapons` contient `base`, calcule `baseLevel` (niveau de l'arme possédée), `hasPassive` (`inv.passives.some(p=>p.id===passive && p.level>=reqPassiveLevel)`), `ready = baseLevel>=reqBaseLevel && hasPassive`. Pur, déterministe, aucune mutation.
Dans `app.ts getState`, pour chaque arme de `inventory.weapons` : trouver le status dont `base===entry.id`, poser `evolveReady=status.ready` et `evolveHint` (FR : `ready` → « Prête à évoluer ! » ; `!hasPassive` → « Passif manquant : <nom du passif> » ; sinon → « Monte-la au max »).
- **Steps TDD :** test échoue (fonction absente) → arme au max + passif → `ready:true` ; arme sous le max → `ready:false, hasPassive` reflété ; arme sans évolution → absente du tableau ; **déterminisme** (même inv → même sortie) ; puis implémentation minimale → vert → commit.
- **Gate :** tsc/lint/vitest/**sim:check diff 0**.

### J2 — Barre XP animée (HUD) — diff 0
**Files:** `src/ui/overlay.ts` (`syncHud`), `src/ui/styles.ts` (pulse) ; util pur `src/ui/anim.ts` (`approach`) ; Test `tests/unit/anim.test.ts`.
`approach(current, target, dtMs, ratePerSec=6): number` (lerp borné, ne dépasse jamais la cible ; `approach(x,x,dt)===x`). `syncHud` conserve un ratio XP affiché par joueur, l'`approach` vers `xp/threshold` chaque frame, et applique un flash (classe `hud__bar--xp-flash` ~200 ms) quand `level` augmente. **Aucun** `Math.random`/`Date.now` dans le util (dt fourni).
- **Steps TDD :** test `approach` (monte vers cible sans dépasser ; atteint la cible ; ne recule pas si déjà à la cible) → impl → vert. Vérif visuelle overlay (test overlay : la barre XP existe et reflète le ratio).
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e.

### J3 — Reveal des cartes de level-up — diff 0
**Files:** `src/ui/overlay.ts` (`upgradePanel`), `src/ui/styles.ts` (`.upgrade__card--enter` + `animation-delay` par index) ; Test overlay.
Les 4 cartes reçoivent une classe d'entrée avec délai croissant (index×~70 ms), animation `fade+slide-up` courte, **CSS pur** (pas de JS timer, pas d'emoji). Le focus clavier/manette reste fonctionnel dès l'affichage (l'animation ne bloque pas l'interaction).
- **Steps TDD :** test overlay — `upgradePanel` rend 4 cartes portant la classe d'entrée avec un style/delay distinct par index ; la 1re carte reste focalisable.
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e.

### J4 — Suspense avant le coffre — diff 0
**Files:** `src/ui/overlay.ts` (`showJackpot`), `src/ui/styles.ts`.
Ajouter une phase d'anticipation (~500 ms) AVANT le défilement : le panneau apparaît « fermé/chargé » (tremble/pulse via classe CSS) puis la roulette démarre. Purement cosmétique (le jackpot ne gèle pas la sim ; la résolution est déjà déterministe côté core). La durée totale reste bornée et l'auto-fermeture existante reste correcte.
- **Steps TDD :** test overlay — après `showJackpot`, le panneau passe par la classe d'anticipation puis affiche l'item résolu ; pas de fuite (nettoyage des timers/handlers).
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e.

### J5 — Screenshake (caméra) — diff 0
**Files:** `src/render/scenes/cameraController.ts` (+ `shake` + intégration décroissance), util pur `src/render/shakeOffset.ts`, câblage dans `GameScene.update` (délégation : détecter la baisse de PV joueur → `cameraController.shake(...)`) ; Test `tests/unit/shakeOffset.test.ts`.
```ts
// shakeOffset.ts — pur, déterministe, sans Math.random
export function shakeOffset(elapsedMs: number, durationMs: number, intensityPx: number): { dx: number; dy: number }
```
Sinus amorti : amplitude = `intensity * max(0, 1 - elapsed/duration)`, `dx = amp*sin(elapsed*ω)`, `dy = amp*sin(elapsed*ω*1.3)` (ω constant). `elapsed>=duration → {0,0}`. `cameraController` applique l'offset au scroll caméra chaque frame et le décroît. Déclenchement : `GameScene` compare les PV du/des joueur(s) frame-à-frame (déjà dans l'état observé) ; baisse → `shake(6, 180)`, gros dégât/boss → plus fort. **N'affecte pas l'état/`advanceTime`** (offset de rendu uniquement).
- **Steps TDD :** test `shakeOffset` (t=0 amplitude≈intensité, décroît, `>=duration → {0,0}`, déterministe). Câblage minimal, aucun ajout de responsabilité dans `GameScene` hormis la délégation.
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e (l'état ne bouge pas — le shake est invisible au seam).

### J6 — Boom de mort + escalade late-game (VFX) — diff 0
**Files:** `src/render/scenes/vfxManager.ts` (`spawnDeathBoom`), câblage à la mort d'ennemi (là où les morts sont déjà détectées côté rendu — `hordeRenderer`/`hitDiff`) ; util pur `src/render/boomScale.ts` (échelle selon temps) ; Test `tests/unit/boomScale.test.ts`.
`boomScale(elapsedMs): number` — croît par paliers avec le temps (ex. ×1 avant 5:00, montant jusqu'à ×~2 vers 18:00), borné, pur. `spawnDeathBoom` réutilise le POOL existant (pixel-pop/flash) — **zéro allocation par frame** ; DA-safe (carré pixel, palette). Escalade : `spawnDeathBoom(x,y, boomScale(elapsedMs))`.
- **Steps TDD :** test `boomScale` (monotone non-décroissant, borné, valeurs aux bornes). Perf : le pool reste borné (pas de croissance illimitée sous forte mortalité).
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e.

### J7 — Affichage « prête à évoluer » (inventaire HUD) — diff 0
**Files:** `src/ui/overlay.ts` (`syncInventory`/rendu des tuiles d'arme), `src/ui/styles.ts` (`.inv__tile--evolve-ready` halo pixel) ; Test overlay.
Consomme `entry.evolveReady`/`entry.evolveHint` (J1) : sur une tuile d'arme `evolveReady`, appliquer un halo/marqueur pixel (DA, pas d'emoji) + exposer le hint en `title`/sous-texte. Rien si non prête.
- **Steps TDD :** test overlay — une entrée d'arme `evolveReady:true` rend la classe/halo ; `evolveReady:false`/absent → pas de halo.
- **Gate :** tsc/lint/vitest/**sim:check diff 0**/e2e.

### J8 — Rythme early plus vif (équilibrage) — diff ATTENDU
**Files:** `src/content/spawnRamp.ts` (`SPAWN_RAMP` paliers early) ; Test `tests/unit/spawnRamp.test.ts` (adapter les attendus).
Comprimer les 3 premiers paliers (valeurs de départ, ajustées en J10) : `{0, 2200, 1} {45, 1800, 1} {100, 1400, 1}` (le reste inchangé). Garder la monotonie (intervalle décroissant, count non-décroissant).
- **Steps TDD :** `spawnParamsAt` renvoie les nouvelles valeurs à t=0/45/100 ; monotonie préservée sur toute la rampe. `sim:check` **affichera un diff** (attendu) — **NE PAS re-baseliner** ; confirmer seulement : pas de NaN, survie kite plausible (> ~8 min), pas d'invariant rouge.
- **Gate :** tsc/lint/vitest ; `sim:check` exécuté (diff documenté, PAS re-baseliné).

### J9 — Réactiver drops soin/aimant (équilibrage) — diff ATTENDU
**Files:** `src/content/config.ts` (`PICKUP_DROPS`) ; Test `tests/unit/dropBonus.test.ts` (ou existant sur `maybeDropBonus`).
`heal.chance: 0.03`, `magnet.chance: 0.02` (valeurs de départ, calées J10) ; `magnet.value` reste 0 ; **`chest.chance` reste 0**. La logique `maybeDropBonus`/`applyPickup` gère déjà ces types (rien à câbler).
- **Steps TDD :** avec un `lootRng` seedé forcé sous le seuil, `maybeDropBonus` peut émettre `heal` puis `magnet` ; `chest` jamais émis (chance 0). `sim:check` **diff attendu** — NE PAS re-baseliner ici.
- **Gate :** tsc/lint/vitest ; `sim:check` exécuté (diff documenté).

### J10 — Re-tune + re-baseline (validation)
**Files:** ajustements de valeurs J8 (`spawnRamp.ts`) / J9 (`config.ts`) au besoin ; `tools/sim/baseline.json` (regénéré) ; journal dans le commit.
Boucle : `npm run sim -- --seeds 12 --duration 1260` → lire win-kite / survie / pics → ajuster (rythme early + chances drop + éventuelle pression late-game compensatoire de `difficultyScaleAt`) pour **ramener le win-kite dans 25-40 %** tout en gardant la gagnabilité. Puis `npm run sim -- --baseline save --seeds 12 --duration 1260`, vérifier `npm run sim:check` VERT. **Rapporter** avant/après (win %, survie médiane, pic ennemis) dans le message de commit et au user.
- **Gate :** tsc/lint/vitest/**sim:check VERT (nouvelle baseline)**/e2e.

---

## Vérification finale
Revue whole-branch (opus) — spec vs implémentation, séparation sim/rendu, GameScene non pollué, déterminisme, DA. Puis `finishing-a-development-branch` (feu vert user avant merge/push). Oracle : playtest (« jouissif tout de suite ? tendu ? »).

## Séquencement
J1→J7 (diff 0) · J8→J9 (équilibrage, diff attendu) · J10 (re-baseline VERT) · revue · merge sur feu vert.
