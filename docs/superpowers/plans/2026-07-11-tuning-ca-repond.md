# Tuning « ça répond » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommandé) ou executing-plans pour exécuter tâche par tâche. Les étapes utilisent des cases (`- [ ]`).

**Goal :** répondre à trois retours playtest — aimant qui aspire (au lieu de disparition sèche), ennemis qui apparaissent hors-écran (fini l'encerclement instantané), et boss transformés en mini-événements (PV ×5-8 + charges télégraphiées + invocation d'add + enrage).

**Architecture :** tout en `src/core` (sim pure déterministe) + `src/content` (données). Le rendu (`src/render`) n'observe que l'état. Aucune dépendance au viewport dans la sim.

**Tech Stack :** TypeScript strict, ECS-lite maison, `Rng` seedé + `FixedClock`, harness `npm run sim`, Vitest.

## Global Constraints

- `src/core`/`src/content` **purs** : interdit `Math.random`/`Date.now`/`new Date()`/Phaser/DOM ; utiliser `Rng` (waveRng pour le spawn) + `FixedClock`. Zéro `any` dans `src/core`. (ESLint strict, 0 warning.)
- **Spawn viewport-indépendant** : le rayon de spawn dérive d'une **résolution de référence** constante (`REFERENCE_VIEW`), jamais de la taille écran réelle → replay/`sim:check` reproductibles.
- **Chaque changement gameplay décale les cibles sim** (cf. mémoire *balance-zero-margin*). Gate central par sous-chantier : `npm run sim:check` re-tuné jusqu'à **cibles VERTES**, puis **re-baseline** (`--save`). Diff 0 après re-baseline.
- Texte in-game en **français**. Boss spawn volontairement **à l'écran** (rayon 320, lisibilité) — l'« off-screen » ne concerne QUE les ennemis normaux + l'anti-camping.
- Gates par tâche : `type-check` · `lint` · `test` · `sim:check`.

---

## Sous-chantier 1 — Aimant qui aspire (isolé, faible risque → en premier)

État actuel : `vacuumXpGems` (`src/core/systems/pickup.ts:118-147`) crédite l'XP et **despawn toutes les gemmes le même tick**. `PICKUP.magnetSpeed = 420` (`config.ts:48`) sert déjà à tirer les gemmes entrées dans `pickupRadius`.

### Task 1 : gemmes aimantées globalement + convergence

**Files :**
- Modify : `src/core/types.ts` (`PickupComp` ~l.111) · `src/core/systems/pickup.ts` · `src/content/config.ts` (~l.46-57)
- Test : `tests/unit/magnetPull.test.ts`

**Interfaces :**
- Produces : `startMagnetPull(world): void` (marque toutes les gemmes `xp` `magnetized`) ; la boucle `pickupSystem` tire les gemmes `magnetized` vers le joueur le plus proche à `PICKUP.magnetPullSpeed` **en ignorant `pickupRadius`**, collecte au contact (XP créditée à la collecte, pas d'un coup).

- [ ] **Step 1 — test rouge** : `startMagnetPull` met `magnetized=true` sur toutes les gemmes `xp` (et pas sur `heal`/`coffre`) ; après N ticks de `pickupSystem`, une gemme `magnetized` s'est rapprochée du joueur puis a été collectée (XP créditée). Vérifier qu'AUCUNE gemme n'est créditée+despawn le même tick.
- [ ] **Step 2** : `npx vitest run tests/unit/magnetPull.test.ts` → FAIL.
- [ ] **Step 3 — impl** : (a) `PickupComp` gagne `magnetized?: boolean`. (b) `config.ts` : `PICKUP.magnetPullSpeed = 900`. (c) remplacer `vacuumXpGems` par `startMagnetPull` (boucle sur les gemmes `xp` → `magnetized=true`, ne crédite/despawn PLUS). (d) dans `pickupSystem` (l.44-67), si `pickup.magnetized`, tirer vers `nearestPlayer` à `magnetPullSpeed*dt` sans condition de `pickupRadius` ; la collecte au contact (l.48) reste inchangée. Le cas `case 'magnet'` appelle `startMagnetPull(world)`.
- [ ] **Step 4** : vitest vert.
- [ ] **Step 5 — gate** : `type-check && lint && test && sim:check`. L'XP est collectée sur ~1 s au lieu d'instantané → petit décalage possible ; **re-baseline si diff** (`npm run sim -- ... --save` selon la convention du repo). Commit.

---

## Sous-chantier 2 — Spawn hors-écran (anti-encerclement) + re-tune

État actuel : `SPAWN.ringRadius = 560` **fixe** (`config.ts:177`), tombe dans l'écran sur les côtés (viewport ~1600×900 à zoom 1.2 → demi-extents ±800/±450, demi-diagonale ≈ 918). Formations resserrées : encircle `0.7` (392), concentric min `0.55` (308), spiral min `0.35` (196) → plein champ. Spawn autour du **centroïde joueur** (`spawn.ts:38-45`, `spawnGroup:114-117`).

### Task 2 : rayon de référence hors-écran + formations au bord

**Files :**
- Modify : `src/content/config.ts` (`SPAWN`, `FORMATION` ~l.284, `CAMPER`) · `src/content/waveEvents.ts` (facteurs de rayon l.183/282/367) · éventuellement `src/core/systems/waveDirector.ts` (input `ringRadius`) — la valeur transite déjà, pas de refonte structurelle.
- Test : `tests/unit/spawnOffscreen.test.ts`

- [ ] **Step 1 — test rouge** : une constante `REFERENCE_VIEW = { halfW: 800, halfH: 450 }` ; `SPAWN.ringRadius = round(hypot(halfW,halfH) + SPAWN.offscreenMargin)` ≈ 1040 ≥ demi-diagonale de référence (918) → tout spawn normal est hors-écran de référence. Test : `ringRadius ≥ hypot(halfW,halfH)` ; les rayons de formation `encircle`/`concentric`min/`spiral`min ≥ `hypot(halfW,halfH)` OU explicitement marqués « télégraphiés au bord » (≥ 0.85·ringRadius).
- [ ] **Step 2** : FAIL.
- [ ] **Step 3 — impl** : (a) `config.ts` : `REFERENCE_VIEW`, `SPAWN.offscreenMargin = 120`, `SPAWN.ringRadius` dérivé. (b) relever `FORMATION.encircleRadiusFactor` 0.7→0.9 et, dans `waveEvents.ts`, concentric min 0.55→0.85, spiral min 0.35→0.85 (les formations restent télégraphiées → partent du bord, pas du plein champ). (c) l'anti-camping `reactiveHook` (`waveDirector.ts:374`) utilise déjà `ringRadius` → ses chargeurs arrivent désormais du bord en fonçant (punition conservée, « venue du monde »). (d) **NE PAS** toucher aux rayons boss (`FINAL_BOSS.spawnRadius`/`MID_BOSS_WAVES.spawnRadius` = 320, à l'écran voulu).
- [ ] **Step 4** : vitest vert.
- [ ] **Step 5 — re-tune** : ennemis plus loin ⇒ arrivent plus tard ⇒ kite plus facile. Ajuster `src/content/spawnRamp.ts` (`SPAWN_RAMP` countPerWave / intervalMs, courbe `difficultyScaleAt`) jusqu'à **cibles sim VERTES**. Itérer `sim:check`.
- [ ] **Step 6 — gate** : `type-check && lint && test && sim:check` VERT + **re-baseline**. Commit.

---

## Sous-chantier 3 — Boss « mini-événement » (le plus gros)

État actuel : un seul def `contremaitre` (`enemies.ts:82-93`, hp 1800, speed 215>joueur, contact 22), **behavior par défaut `chase`, zéro pattern**. Réutilisé mid+final via `hpMult` (`config.ts` `FINAL_BOSS.hpMult 0.85`, `MID_BOSS_WAVES.hpMults [1,1.1,1.5]`). Les 5 behaviors existants (`chase/zigzag/circler/sweep/charger`, `types.ts:61`) dont `charger` = machine à états dash 4 phases (`enemyAi.ts:142-181`).

> Note scope : c'est un **nouveau système d'IA** (charges + invocation + enrage). Si ça déborde en exécution, le découper en son propre spec. Ordre : après 1 et 2.

### Task 3 : stats boss + constantes de pattern (données)

**Files :** Modify `src/content/enemies.ts` (def boss + `BEHAVIOR_TUNING`) · `src/content/config.ts` (`FINAL_BOSS.hpMult`, `MID_BOSS_WAVES.hpMults`, **`BOSS_HP_BY_PLAYER_LEVEL`**) · `src/core/systems/simulation.ts` (application du mult-niveau-joueur sur `bossScale.hp`). Test : couvrir la fonction pure de scaling dans `bossAi.test.ts` ou un test dédié.
- [ ] Baisser la vitesse de base du boss **sous** le joueur (215→170) pour le rendre esquivable.
- [ ] **PV boss = base(1800) × mult-vague × mult-niveau-joueur × facteur-coop.**
  - *Mult-vague* ×5-8 : `FINAL_BOSS.hpMult` 0.85→~5.0 ; `MID_BOSS_WAVES.hpMults` [1,1.1,1.5]→[5,6,8].
  - *Mult-niveau-joueur* (**demande user — niveau d'XP du joueur, PAS le stage**) : le boss scale avec le **niveau d'XP courant du joueur au moment du spawn** → reste un défi même quand le joueur monte en puissance. Le niveau étant **non borné** (peut monter à 20-30+), utiliser une **formule bornée** plutôt qu'une table : `bossLevelHpMult(lvl) = clamp(1 + (lvl-1)*k, 1, cap)` avec **k≈0.08** et **cap≈3.0** (fonction pure dans `src/content`, ex. `BOSS_HP_BY_PLAYER_LEVEL = { k: 0.08, cap: 3.0 }`). **Co-op** : prendre le **niveau d'XP max** parmi les joueurs vivants (scale au plus fort, équitable).
  - Application : dans `simulation.ts` (`maybeSpawnMidBoss` ~l.832 / `maybeSpawnFinalBoss` ~l.848), lire le niveau (`progress.level`) du/des joueur(s) et multiplier `bossScale.hp` — à côté de `coopHpFactor` et du `hpMult` de vague.
- [ ] Ajouter `BEHAVIOR_TUNING.boss` : `chargeTelegraphMs`, `chargeSpeed`, `chargeCooldownMs`, `summonAtHpPct: [0.75,0.5,0.25]`, `summonCount`, `enrageHpPct: 0.30`, `enrageSpeedMult`, `enrageChargeCooldownMult`.
- [ ] **Note déterminisme** : le niveau d'XP du joueur fait partie de l'état de sim déterministe (pas de RNG/viewport) → reproductible. Attention re-tune : un joueur qui monte vite verra des boss beaucoup plus gros → **surveiller le temps de victoire dans `sim:check`** (le bot kite atteint ~niv 15 à 5:00) et caler `k`/`cap` pour que la victoire reste atteignable.
- [ ] Gate : `type-check && lint`.

### Task 4 : behavior `boss` (IA pure, machine à états)

**Files :** Modify `src/core/types.ts` (union `EnemyBehavior` + état boss sur le composant enemy) · `src/core/systems/enemyAi.ts` (dispatch + `steerBoss`) · `src/core/systems/simulation.ts` (drain d'une file d'invocation) · `src/core/systems/spawn.ts` (assigner `behavior:'boss'` au boss). Test : `tests/unit/bossAi.test.ts`.

**Interfaces :**
- Produces : `steerBoss(enemy, target, dtMs, rng, ctx)` — phases **normal** (chase à vitesse baissée) → **télégraphe** (immobile/wind-up `chargeTelegraphMs`) → **charge** (dash `chargeSpeed` vers la position télégraphiée) → **récup** (cooldown) ; **invocation** : quand PV franchit un seuil `summonAtHpPct`, pousse une demande dans `world.bossSummons` (drainée par `simulation` qui spawne `summonCount` `chase` autour du boss) ; **enrage** sous `enrageHpPct` (vitesse × mult, cooldown de charge réduit).

- [ ] **Step 1 — test rouge** : machine à états déterministe — un boss neuf est en `normal` ; après `chargeCooldownMs` il passe télégraphe→charge→récup (positions/vitesses attendues) ; franchir 75 % PV pousse exactement une demande d'invocation ; sous 30 % PV l'enrage augmente la vitesse. (Tests sur la fonction pure, pas de Phaser.)
- [ ] **Step 2** : FAIL.
- [ ] **Step 3 — impl** : (a) `EnemyBehavior` += `'boss'` ; état boss (phase + timers + seuils déjà franchis) sur le composant enemy. (b) `steerBoss` dans `enemyAi.ts` (déterministe via `rng`/timers). (c) file `world.bossSummons` drainée dans `simulation.step` → `spawnEnemy` des adds (rayon court autour du boss). (d) `spawn.ts` : `spawnBoss` assigne `behavior:'boss'`.
- [ ] **Step 4** : vitest vert.
- [ ] **Step 5 — gate** : `type-check && lint && test`.

### Task 5 : télégraphe & feedback de rendu (observer-only)

**Files :** Modify `src/render/scenes/hordeRenderer.ts` (ou `vfxManager.ts`) — VFX de wind-up de charge (halo/flèche au sol vers la cible) sur les ennemis en phase télégraphe. La **barre de PV boss** + **bandeau BOSS** existent déjà (mémoire *boss-legibility-fix*).
- [ ] Lire depuis `getState` la phase boss (l'exposer dans `AppViewState.enemies[]` si besoin : `bossPhase?`) et dessiner le télégraphe. Aucun effet sim.
- [ ] Gate e2e léger si un test de bulles/HUD existe ; sinon capture manuelle.

### Task 6 : re-baseline sim + validation

- [ ] PV ×5-8 change le **temps de victoire** (boss final tué = victoire) → re-tuner si les cibles % victoire sortent, puis **re-baseline**.
- [ ] `sim:check` VERT + diff 0. Playtest humain = oracle final (boss = moment fort, esquivable, pression par à-coups).

---

## Fichiers clés (récap)

- **Create** : `tests/unit/{magnetPull,spawnOffscreen,bossAi}.test.ts`.
- **Modify** : `src/core/systems/{pickup,spawn,enemyAi,simulation}.ts` · `src/core/types.ts` · `src/content/{config,waveEvents,spawnRamp,enemies}.ts` · `src/core/systems/waveDirector.ts` · `src/render/scenes/{hordeRenderer,vfxManager}.ts`.

## Vérification (end-to-end)

1. **Aimant** : ramasser l'aimant → toutes les gemmes convergent visiblement vers le joueur en ~1 s puis sont collectées (plus de disparition sèche).
2. **Spawn** : s'arrêter quelques secondes → les ennemis (et l'encercle anti-camping) arrivent **du bord de l'écran** en fonçant, pas en plein champ.
3. **Boss** : PV = ×5-8 (vague) **× mult-niveau-joueur** (plus le joueur est haut niveau d'XP, plus le boss encaisse, borné par `cap`), esquivable (vitesse < joueur), charge télégraphiée qu'on peut esquiver, invocation d'add aux seuils, enrage sous 30 % → sentiment de mini-événement. Vérifier qu'un joueur bas niveau et un joueur haut niveau ne combattent pas un boss de même PV, tout en gardant la victoire atteignable (`sim:check` VERT).
4. **Gates** : `type-check` · `lint` · `test` (+ 3 nouveaux) · **`sim:check` VERT + re-baseliné** à chaque sous-chantier · build. Playtest humain = oracle.

## Ordre & hors-périmètre

Ordre : **1 (aimant) → 2 (spawn+re-tune) → 3 (boss)**. Hors périmètre (autres chantiers) : SFX métalliques/ElevenLabs (B), lisibilité/identité des armes + sprites soin nourriture (C), missions/collègue-allié/easter eggs (D). Le boss « mini-événement » est le plus risqué : à re-scoper en spec dédié s'il déborde.
