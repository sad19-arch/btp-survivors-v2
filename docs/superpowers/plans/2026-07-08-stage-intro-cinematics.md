# Cinématiques d'intro de stage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un cold-open burlesque muet (~5-7 s, skippable) avant chaque stage, où un ouvrier récurrent maladroit déclenche/révèle la horde par une boulette physique — comédie portée par le MONTAGE (zooms/coupes/punch-in/filés), pas par la voix.

**Architecture :** on RÉUTILISE le gel d'intro existant (`App.introMsLeft` fige la sim + expose `introActive`). Un séquenceur render-only (`introSequencer.ts`) joue, pendant ce gel, une liste de commandes *data-driven* par stage, en pilotant des **primitives de montage** ajoutées à `cameraController` et des **acteurs cosmétiques** (jamais des entités du `World`). Skippable via input → fin du gel.

**Tech Stack :** TypeScript strict, Phaser (rendu + tweens), Vitest (happy-dom), Playwright (seam `__GAME__`), harness `npm run sim`.

## Global Constraints

- **Render-only / zéro impact sim.** Le séquenceur vit dans `src/render`. La sim est GELÉE pendant l'intro (mécanisme `App.introMsLeft` existant : `advanceTime` consomme le temps sans avancer la sim). `spawnPreview`/`actor*` posent des sprites COSMÉTIQUES (jamais `world.spawn`). Conséquence : **`npm run sim:check` reste diff 0** (aucune re-baseline).
- **Déterminisme.** Aucun `Math.random()`/`Date.now()`/`new Date()` dans le séquenceur ni les scripts. Le temps vient de l'horloge d'intro (ms accumulés, fournis par `update(dtMs)`). ESLint le vérifie sur `src/core`/`src/content` ; on l'applique aussi au séquenceur render par discipline (timings fixes en données).
- **Séparation sim/rendu + anti-god-object.** 🔴 RIEN de la logique de cinématique dans `GameScene`. `GameScene` instancie `IntroSequencer` et lui DÉLÈGUE (`this.intro.play(...)`, `this.intro.update(dt)`, `this.intro.skip()`, `this.intro.dispose()`). Les primitives de montage vivent dans `cameraController` ; les acteurs dans `introSequencer`.
- **Contrôle total (PRD).** L'intro est TOUJOURS skippable : toute entrée manette OU clavier saute au `unlockGameplay` (fin du gel + cleanup). Passe par la couche input existante / le seam, jamais d'écouteur ad hoc.
- **DA 16-bit.** Palette centralisée (`src/ui/palette.ts`), pas d'emoji. Le tampon (APPROVED/PENDING/DENIED) = motif récurrent 16-bit.
- **Cleanup zéro-fuite.** Tout acteur/preview cosmétique est détruit au `unlock`/`dispose`. Vérifié par compteur (sonde seam) borné au restart.
- **Golden-first.** On câble le moteur + UN gag (terrassement) validé en capture (GATE) AVANT de dérouler les 9 autres.

---

## File Structure

- **Create `src/render/scenes/introSequencer.ts`** — le séquenceur : types de commandes (union discriminée), exécution de la timeline pilotée par l'horloge d'intro, acteurs cosmétiques, skip, cleanup. Observateur pur.
- **Create `src/content/introScripts.ts`** — données : `INTRO_SCRIPTS: Record<stageId, IntroCommand[]>` (le golden terrassement + les 9 autres). Aucune logique.
- **Modify `src/render/scenes/cameraController.ts`** — ajoute les primitives de MONTAGE (`cut`/`zoomTo`/`punchIn`/`whipPan`/`hold` implicite/`slowmo`) qui animent l'`overview` gelé existant. Le `slowmo` retourne un facteur d'échelle de temps consommé par le séquenceur.
- **Modify `src/content/config.ts`** — `INTRO.durationMs` devient une base ; ajoute `INTRO.stageCinematicMs` (durée du gel quand un script existe) ou dérive la durée du script.
- **Modify `src/app/app.ts`** — durée de gel = longueur du script d'intro du stage si présent ; ajoute `skipIntro()` (met `introMsLeft = 0`) ; expose `introElapsedMs` dans `AppViewState` (progression pour piloter la timeline).
- **Modify `src/app/appState.ts`** — `AppViewState` : ajoute `introElapsedMs: number`.
- **Modify `src/app/seam.ts`** — expose `skipIntro()`, `debugIntroInfo()` (`{active, elapsedMs, actorCount, cameraZoom}`).
- **Modify `src/render/scenes/GameScene.ts`** — instancie `IntroSequencer`, délègue `play/update/skip/dispose`, câble le skip sur input. Rien d'autre.
- **Modify `src/render/stages.ts`** (au besoin) — déclarer les nouveaux props (`prop_toilet`, `prop_sign_done`, `ui_stamp_denied`) à précharger.
- **Create assets** `public/stageXX/props/…` (WC, pancarte, tampon) via skill `assets`.
- **Create tests** `tests/unit/introSequencer.test.ts`, `tests/unit/introScripts.test.ts`, `tests/unit/cameraMontage.test.ts`, `tests/e2e/introCinematic.spec.ts`.

---

## Task 1 : Horloge d'intro pilotable + skip (app)

**Files :**
- Modify : `src/app/app.ts` (durée de gel, `skipIntro`, `introElapsedMs`)
- Modify : `src/app/appState.ts` (champ `introElapsedMs`)
- Modify : `src/content/config.ts` (`INTRO.stageCinematicMs`)
- Test : `tests/unit/introClock.test.ts`

**Interfaces :**
- Consomme : `App` existant (`introMsLeft`, `start`, `advanceTime`, `getState`), `INTRO.durationMs`.
- Produit : `App.skipIntro(): void` ; `AppViewState.introElapsedMs: number` (= `totalIntroMs - introMsLeft`, 0 quand pas d'intro) ; `INTRO.stageCinematicMs: number`.

- [ ] **Step 1 — test qui échoue.** Dans `introClock.test.ts` : un `App` démarré avec `{intro:true}` a `getState().introActive === true` et `introElapsedMs === 0` ; après `advanceTime(500)`, `introElapsedMs === 500` et `introActive` reste vrai (si durée > 500) ; `skipIntro()` met `introActive === false` et fait avancer la sim au pas suivant (`elapsedMs` croît). Sans intro (`{intro:false}`), `introActive===false` et `introElapsedMs===0` dès le départ.
- [ ] **Step 2 — le lancer, vérifier l'échec** (`npm run test -- introClock`) : `skipIntro`/`introElapsedMs` n'existent pas.
- [ ] **Step 3 — implémenter.** `App` : mémorise `private totalIntroMs = 0`. Au `start()` : `this.totalIntroMs = this.introEnabled ? INTRO.stageCinematicMs : 0 ; this.introMsLeft = this.totalIntroMs`. `skipIntro()` : `this.introMsLeft = 0 ; this.refreshFocus() ; this.bumpState()`. Dans `getState()` : `introElapsedMs: Math.max(0, this.totalIntroMs - this.introMsLeft)`. `config.ts` : `INTRO = { durationMs: 2000, stageCinematicMs: 6500 }` (durée du gel cinématique ; le golden calera la valeur).
- [ ] **Step 4 — tests verts** (`npm run test -- introClock`).
- [ ] **Step 5 — gates + commit.** `npm run type-check` 0, `npm run lint` 0, **`npm run sim:check` diff 0** (la sim n'est pas touchée). Commit : `feat(cine): horloge d'intro pilotable + skipIntro + introElapsedMs`.

---

## Task 2 : Séquenceur + vocabulaire de commandes (render, cœur)

**Files :**
- Create : `src/render/scenes/introSequencer.ts`
- Test : `tests/unit/introSequencer.test.ts`

**Interfaces :**
- Consomme : `AppViewState.introActive`/`introElapsedMs` (Task 1). Une façade caméra/acteurs injectable (interface `CinemaStage`) pour tester sans Phaser.
- Produit :
  - Type `IntroCommand` = union discriminée : `{kind:'wait', ms}` · `{kind:'banner', text}` · `{kind:'voice', key}` · `{kind:'sfx', key}` · `{kind:'flash'}` · `{kind:'shake', intensity}` · `{kind:'cut', cx, cy, zoom}` · `{kind:'zoomTo', cx, cy, zoom, ms, ease?}` · `{kind:'punchIn', cx, cy, zoom, ms}` · `{kind:'whipPan', cx, cy, ms}` · `{kind:'slowmo', scale, ms}` · `{kind:'spawnPreview', key, x, y, count?}` · `{kind:'actor', id, key, x, y, scale?}` · `{kind:'actorMove', id, x, y, ms}` · `{kind:'actorPlay', id, anim}`.
  - `interface CinemaStage` : les effets exécutables (`banner(t)`, `voice(k)`, `sfx(k)`, `flash()`, `shake(i)`, `camCut(cx,cy,z)`, `camZoomTo(cx,cy,z,ms,ease)`, `camPunchIn(cx,cy,z,ms)`, `camWhipPan(cx,cy,ms)`, `spawn(id,key,x,y,scale)`, `move(id,x,y,ms)`, `play(id,anim)`, `clearAll()`). Chaque acteur/preview posé s'enregistre pour le cleanup.
  - `class IntroSequencer` : `constructor(stage: CinemaStage)` ; `load(script: IntroCommand[]): void` ; `update(elapsedMs: number): void` (exécute les commandes dont le temps de départ est atteint, dans l'ordre ; `slowmo` dilate l'horloge de la timeline) ; `skip(): void` (exécute tout ce qui reste instantanément SAUF les `wait`/anims → pose l'état final, puis `clearAll()` sera appelé au unlock) ; `get done(): boolean` ; `dispose(): void` (`stage.clearAll()`).
  - `scriptDurationMs(script): number` (somme des `wait`/durées d'anim — sert à caler `INTRO.stageCinematicMs`).

- [ ] **Step 1 — test qui échoue.** `introSequencer.test.ts` avec un `CinemaStage` FAKE qui enregistre les appels dans un journal :
  - déroulé ordonné : un script `[{cut...},{wait 200},{banner "X"},{wait 300},{flash}]` → à `update(0)` le `cut` est joué ; à `update(199)` pas encore le banner ; à `update(200)` le banner ; à `update(500)` le flash. Le journal reflète l'ordre exact.
  - déterminisme : deux séquenceurs, même script, mêmes `update(...)` → journaux identiques (aucun `Date`/`random`).
  - `skip()` : pose l'état final (dernier `banner`/`cut` appliqués) et `done===true`.
  - cleanup : après `spawn`×3 puis `dispose()`, le fake a reçu `clearAll()` (compteur d'acteurs = 0).
- [ ] **Step 2 — vérifier l'échec** (`npm run test -- introSequencer`).
- [ ] **Step 3 — implémenter** `introSequencer.ts` : timeline pré-calculée (chaque commande reçoit un `atMs` cumulé à partir des `wait`/durées) ; `update(elapsedMs)` joue les commandes `atMs <= elapsedMs` non encore jouées ; `slowmo` insère un facteur qui dilate les `atMs` suivants sur sa fenêtre. Curseur monotone (pas de rejeu). Zéro `any`.
- [ ] **Step 4 — tests verts.**
- [ ] **Step 5 — gates + commit.** type-check/lint/vitest ; **sim:check diff 0**. Commit : `feat(cine): séquenceur de commandes + vocabulaire typé (déterministe)`.

---

## Task 3 : Primitives de MONTAGE (cameraController)

**Files :**
- Modify : `src/render/scenes/cameraController.ts`
- Test : `tests/unit/cameraMontage.test.ts` (fonctions pures de trajectoire, séparées du Phaser)

**Interfaces :**
- Consomme : l'`overview` gelé existant (`setOverview({zoom,cx,cy})`, court-circuit d'`update`).
- Produit : fonctions PURES `cameraTrajectory` (extraites, testables) : `lerpCam(from, to, t, ease): {cx,cy,zoom}` avec eases `linear`/`easeOut`/`snap` ; `punchInProfile(ms)`/`whipPanProfile(ms)` (courbes de `t`). Méthodes sur `CameraController` : `camCut(cx,cy,zoom)` (instantané) ; `camZoomTo(cx,cy,zoom,ms,ease)` ; `camPunchIn(cx,cy,zoom,ms)` (snap ~120 ms easeOut agressif) ; `camWhipPan(cx,cy,ms)` (filé rapide + micro flou via `shake` léger). Toutes écrivent l'`overview` cible et animent via l'horloge de rendu ; `update()` applique la position courante tant qu'une anim caméra est active, SANS toucher la sim.

- [ ] **Step 1 — test qui échoue.** `cameraMontage.test.ts` (pur) : `lerpCam` à `t=0` = from, `t=1` = to, `easeOut` dépasse `linear` au milieu (t=0.5 plus proche de `to`) ; `snap` = `to` dès `t>0` ; `punchInProfile` monotone croissant 0→1 ; déterministe.
- [ ] **Step 2 — vérifier l'échec.**
- [ ] **Step 3 — implémenter** : extraire les fonctions pures (module `src/render/cameraTrajectory.ts` ou en tête de `cameraController.ts`) ; ajouter les méthodes `cam*` qui posent une anim caméra (état interne `activeCamAnim: {from,to,ms,ease,startedAt}|null`) appliquée dans `update()` quand `overview !== null`. `camCut` = pose l'overview direct. Réutilise `this.scene.cameras.main.setZoom/centerOn`.
- [ ] **Step 4 — tests verts.**
- [ ] **Step 5 — gates + commit.** type-check/lint/vitest ; sim:check diff 0. Commit : `feat(cine): primitives de montage caméra (cut/zoomTo/punchIn/whipPan)`.

---

## Task 4 : Acteurs cosmétiques + preview + cleanup zéro-fuite

**Files :**
- Modify : `src/render/scenes/introSequencer.ts` (implémentation Phaser de `CinemaStage`)
- Test : `tests/unit/introActors.test.ts` (via `CinemaStage` fake + un compteur ; l'impl Phaser réelle est couverte en e2e Task 5)

**Interfaces :**
- Consomme : `CinemaStage` (Task 2), `scene.add.sprite/image` (Phaser).
- Produit : `class PhaserCinemaStage implements CinemaStage` (dans `introSequencer.ts`) : garde une `Map<id, GameObject>` des acteurs + un tableau des previews ; `spawn` crée un sprite cosmétique (jamais `world.*`) ; `move` = tween de position ; `play` = `setFrame`/anim (gardé : ne fait rien si texture absente, comme siteWorkers `animatable`) ; `clearAll()` détruit tout et vide les collections. `actorCount` (sonde).

- [ ] **Step 1 — test qui échoue.** `introActors.test.ts` : via une façade fake instrumentée, un script `[{actor id:'w'},{spawnPreview count:40},{actorMove...}]` fait passer `actorCount` à 41 ; après `dispose()`, `actorCount === 0`. Rejouer (load+dispose)×3 → `actorCount` reste 0 (pas d'accumulation).
- [ ] **Step 2 — vérifier l'échec.**
- [ ] **Step 3 — implémenter** `PhaserCinemaStage` + brancher `spawn/move/play/clearAll` sur la Map ; garde `animatable` sur `play` (pas de `setFrame` sur repli). Zéro `any`.
- [ ] **Step 4 — tests verts.**
- [ ] **Step 5 — gates + commit.** type-check/lint/vitest ; sim:check diff 0. Commit : `feat(cine): acteurs cosmétiques + cleanup zéro-fuite`.

---

## Task 5 : Câblage GameScene + skip input + e2e

**Files :**
- Create : `src/content/introScripts.ts` (VIDE ce task : `export const INTRO_SCRIPTS: Record<string, IntroCommand[]> = {}` ; rempli en T6/T7)
- Modify : `src/render/scenes/GameScene.ts` (instancier + déléguer + skip)
- Modify : `src/app/seam.ts` (`skipIntro`, `debugIntroInfo`)
- Test : `tests/e2e/introCinematic.spec.ts`

**Interfaces :**
- Consomme : `IntroSequencer` (T2/T4), `CameraController.cam*` (T3), `App.skipIntro`/`introElapsedMs` (T1), `INTRO_SCRIPTS` (placeholder vide pour ce task ; rempli T6+).
- Produit : GameScene joue `intro.load(INTRO_SCRIPTS[stageId] ?? [])` au `create()` ; dans `update()`, si `state.introActive` → `intro.update(state.introElapsedMs)` (et NON la sync gameplay normale) ; toute entrée pad/clavier pendant `introActive` → `this.app.skipIntro()` ; `dispose()` → `intro.dispose()`. Seam : `window.__GAME__.skipIntro()`, `debugIntroInfo()`.

- [ ] **Step 1 — test e2e qui échoue.** `introCinematic.spec.ts` (NON-lite, un stage avec script — au début terrassement vide, sera rempli T6) : `?autostart=solo&level=2&seed=1&test=1&intro=1` → `getState().introActive===true`, `elapsedMs===0` pendant l'intro ; `introElapsedMs` croît via `advanceTime` ; `skipIntro()` → `introActive===false`, la sim démarre (`elapsedMs>0` au pas suivant) ; `debugIntroInfo().actorCount` retombe à 0 après skip ; **capture** de l'intro.
- [ ] **Step 2 — vérifier l'échec** (le seam `skipIntro`/`debugIntroInfo` n'existe pas encore).
- [ ] **Step 3 — implémenter** le câblage GameScene (délégation stricte, aucune logique cinéma inline) + les hooks seam. Gel de la sync gameplay pendant `introActive` (comme le fait déjà `introActive` pour la caméra).
- [ ] **Step 4 — e2e vert** (`npm run test:e2e -- introCinematic`).
- [ ] **Step 5 — gates + commit.** type-check/lint/vitest/e2e ; **sim:check diff 0**. Commit : `feat(cine): câblage GameScene + skip input + seam e2e`.

---

## Task 6 : GOLDEN terrassement (montage complet + assets) — GATE capture

**Files :**
- Create : `src/content/introScripts.ts` (entrée `terrassement`)
- Assets : `public/stage02/props/{toilet,sign_done}.png`, `public/ui/stamp_denied.png` (skill `assets`, PixelLab, calibrés `player_j1`, QA)
- Modify : `src/render/scenes/GameScene.ts` (préchargement des nouveaux props)
- Test : `tests/unit/introScripts.test.ts` + capture

**Interfaces :**
- Consomme : tout T1-T5 + assets.
- Produit : `INTRO_SCRIPTS.terrassement: IntroCommand[]` = le montage du gag (spec §2b), verbatim :
  ```
  zoomTo(large, 600, easeOut) · actor('w', ouvrier, x0,y0) · actorPlay('w','dig')
  wait(500)
  cut(pelle, 1.8) · shake(0.3) · sfx('clonk')
  wait(250)
  zoomTo(fosse, 1.4, 700) · spawnPreview(mudling, fosse, 1) [le "un seul"]
  wait(400)
  punchIn(visageOuvrier, 2.2, 120) · actorPlay('w','wave')  [le coucou gêné]
  wait(500)  [LE temps comique]
  whipPan(fosse, 150) · slowmo(0.4, 400) · spawnPreview(mudling, fosse, 40) · flash · shake(0.9)
  wait(400)
  cut(large) · actorMove('w', horsChamp, 300) · banner('TERRASSEMENT')
  wait(300)
  [fin → unlock au bout du gel]
  ```
- [ ] **Step 1 — assets.** Skill `assets` : golden-batch d'abord (le tampon), puis WC + pancarte. `npm run assets:qa` VERT. Nommage `prop_toilet`/`prop_sign_done`/`ui_stamp_denied`.
- [ ] **Step 2 — test qui échoue.** `introScripts.test.ts` : `INTRO_SCRIPTS.terrassement` existe, chaque commande référence une `key` d'asset connue (WC/pancarte/tampon OU asset stage 02 existant : mudling, pelleteuse), `scriptDurationMs` ∈ [4000, 8000] ms, se termine sur un `banner`. Test paramétrable réutilisé au rollout (T7).
- [ ] **Step 3 — écrire le script** (données) + précharger les props dans GameScene.
- [ ] **Step 4 — tests verts + CAPTURE.** Jouer `?autostart=solo&level=2&seed=1&test=1&intro=1`, capturer 3-4 frames clés (le coucou gêné en punch-in, le filé, les 40) via le seam. **GATE : revue de la capture par le contrôleur** — le montage doit être lisible et drôle.
- [ ] **Step 5 — gates + commit.** type-check/lint/vitest/e2e/**assets:qa**/sim:check diff 0. Commit : `feat(cine): golden terrassement (montage complet + props)`.

---

## Task 7 : Déroulé des 9 autres scripts (data)

**Files :**
- Modify : `src/content/introScripts.ts` (9 entrées)
- Assets : réutilise le kit (WC/tampon reviennent en fils rouges) + assets de chaque stage
- Test : `tests/unit/introScripts.test.ts` (test paramétré sur les 10 stages)

**Interfaces :** consomme le template golden (T6). Chaque script suit la structure setup → hold → punch-in → payoff → carton, skinné au gag du stage (spec « Les 10 gags »).

- [ ] **Step 1 — étendre le test paramétré** aux 10 stages (chaque script : keys connues, durée bornée, finit sur banner, contient au moins un `punchIn` + un `hold`/`wait≥300` = le beat comique).
- [ ] **Step 2 — écrire les 9 scripts** en données, un par gag du spec (terrain_vierge, fondations, réseaux, gros_oeuvre, échafaudages, charpente, second_oeuvre, finitions, livraison). Fils rouges : WC réutilisé (gros_oeuvre), tampon (livraison, climax avec `beam` ombre boss).
- [ ] **Step 3 — tests verts + captures** d'ensemble (une par stage via le seam) ; revue contrôleur.
- [ ] **Step 4 — gates + commit.** type-check/lint/vitest/e2e/assets:qa/**sim:check diff 0**. Commit : `feat(cine): déroulé des 9 intros restantes (data)`.

---

## Task 8 : Polish (sons universels + fils rouges)

**Files :**
- Modify : `src/content/introScripts.ts`, `src/audio/manifest.ts` (petits sfx zzfx : `clonk`, `gulp`, `sad_trombone`)
- Modify : `src/audio/audioDirector.ts` (jouer `sfx` du séquenceur)

- [ ] **Step 1 — sfx zzfx** procéduraux (déterministes) branchés sur les commandes `sfx`.
- [ ] **Step 2 — placer les sfx** aux beats clés (clonk stage 2, sad-trombone sur le tampon REFUSÉ stage 10, etc.).
- [ ] **Step 3 — gates + commit.** type-check/lint/vitest/e2e/sim:check diff 0. Commit : `feat(cine): polish sons universels + fils rouges`.

---

## Vérification finale (whole-branch)

Revue whole-branch (opus) — déterminisme (pas de `Date`/`random`), zéro impact sim (sim:check diff 0, acteurs cosmétiques jamais dans le World), séparation sim/rendu (GameScene = délégation pure), 0 fuite (compteur d'acteurs borné au restart), 0 `any`, DA. Puis `finishing-a-development-branch` — feu vert user avant merge/push. Oracle final = playtest (« le montage impressionne ? c'est drôle sans lire ? »).

## Séquencement

T1 (horloge) → T2 (séquenceur) → T3 (montage caméra) → T4 (acteurs) → T5 (câblage+e2e) → **T6 golden terrassement + GATE capture** → T7 (9 autres) → T8 (polish) → revue → merge (feu vert).

## Hors périmètre

Voix élaborée (voix = nom du stage) · cinématiques milieu/fin de stage · auto-skip d'une intro déjà vue · intégration mode survie.
