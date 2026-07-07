# Playtest #3 — corrections & profondeur — Plan d'implémentation

> **Pour agents :** SOUS-SKILL REQUISE : superpowers:subagent-driven-development. Exécution task-par-task, un implémenteur frais + relecteur par tâche. Cases `- [ ]` pour le suivi.

**But :** Traiter les 11 retours du 1er playtest humain — débloquer la boucle de puissance (le fun trop tardif), corriger les bugs, rendre les hordes LISIBLES (VS-style), polir.

**Architecture :** Sim déterministe pure (`src/core`/`src/content`) observée par Phaser (`src/render`) + overlay DOM (`src/ui`). Tout ajout sim = déterministe seedé + validé `sim:check`. Tout ajout rendu = observateur (`sync(state)`) dans un **module dédié** (jamais gonfler `GameScene`).

**Base :** branche `feat/playtest-3` sur `main` `044fcc8`. Spec : `docs/superpowers/specs/2026-07-07-playtest-3-fixes.md`.

## Global Constraints

- **Déterminisme** : `src/core`/`src/content` — jamais `Math.random`/`Date.now`/`new Date`. Aléa via un `Rng` seedé existant (`this.rng`, `this._waveRng`, `prisonerRng`, `lootRng`).
- **Séparation sim/rendu** : `src/core`/`src/content` n'importent jamais Phaser/DOM. Nouveau rendu = module dédié `src/render/*` observateur, délégué par `GameScene` (règle CLAUDE.md 🔴 — ne RIEN ajouter à GameScene sauf câblage).
- **`sim:check`** : toute tâche touchant la sim reste VERTE sur cibles (re-baseline seulement après cibles tenues). Tâches purement rendu/UI = sim diff 0.
- **Zéro `any` dans `src/core`** ; TS strict ; ESLint strict : **pas de `!`** (non-null), **`curly`** (accolades obligatoires), **`noUncheckedIndexedAccess`** (indexation possiblement `undefined` → gardée). **Tests** : jamais de garde silencieuse `if (x === undefined) { return }` — utiliser `throw`/`toBeDefined()`.
- **DA 16-bit** : palette `src/ui/palette.ts` / `PLAYER_COLORS` ; pas de glow moderne/gradient/emoji.
- Gates par tâche : `type-check` · `lint` · `test` · `sim:check` · `test:e2e` (aux tâches seam/rendu).

---

# PHASE P0 — Boucle de puissance (débloque le fun)

### Task 1 — Cartes de level-up pondérées (armes possédées ↑)

**Files:**
- Modify: `src/core/systems/cards.ts` (`rollCards` L143-157)
- Modify: `src/content/config.ts` (ajouter `CARD_WEIGHT`)
- Test: `tests/unit/cards.test.ts`

**Interfaces:**
- Consumes: `eligibleCards(inv): Card[]` (inchangé), `Card.kind: 'weapon-new'|'passive-new'|'weapon-up'|'passive-up'`, `Rng.int(min,max)` / `Rng.float(min,max)`.
- Produces: `rollCards(rng, inv, count): Card[]` (signature inchangée, tirage désormais **pondéré sans remise**).

**Design:** Remplacer le Fisher-Yates plat par un **tirage pondéré sans remise** déterministe. Poids par `kind` depuis `CARD_WEIGHT` (config) : `ownedUp` (weapon-up + passive-up) ≈ **4**, `new` (weapon-new + passive-new) = **1**. Algo : répéter `count` fois — somme des poids restants, `roll = rng.float(0, total)`, parcours cumulatif pour choisir, retirer la carte choisie. Distinct garanti (sans remise). Vider quand plus de cartes.

- [ ] **Step 1 — Test (échoue)** : dans `cards.test.ts`, ajouter :
  - Déterminisme : `rollCards(rng(seed), inv, 4)` deux fois même seed ⇒ mêmes ids/ordre.
  - **Taux d'offre** : inventaire `{ weapons:[{id:'cloueur',level:1}], passives:[] }`, sur 200 seeds, compter les tirages de 4 cartes contenant ≥1 `weapon-up` ⇒ **≥ 70 %** (échoue avec le code plat ≈ 40 %).
  - Sans remise : les 4 cartes ont des `id`+`kind` distincts.
  - Cas limite : `eligibleCards` renvoie ≤ 4 ⇒ `rollCards` renvoie tout (pas de crash), pondération sans effet.
- [ ] **Step 2** : lancer les tests → FAIL sur le taux d'offre.
- [ ] **Step 3 — Impl** : ajouter `export const CARD_WEIGHT = { ownedUp: 4, new: 1 } as const` dans `config.ts`. Réécrire `rollCards` en tirage pondéré (helper `cardWeight(kind)`). Respecter `noUncheckedIndexedAccess` (gardes sur les accès tableau).
- [ ] **Step 4** : tests → PASS. Si le taux < 70 %, monter `ownedUp` (5-6) — c'est le levier de tuning.
- [ ] **Step 5 — Gates** : `type-check`/`lint`/`test`. `sim:check` va **bouger** (progression accélérée) — NE PAS re-baseline ici, c'est le rôle de la Task 5. Noter les nombres. **Commit** `feat(core): cartes de level-up pondérées (armes possédées favorisées)`.

---

### Task 2 — Coffres non aimantés

**Files:**
- Modify: `src/core/systems/pickup.ts` (boucle aimantation ~L61)
- Test: `tests/unit/pickup*.test.ts` (ou créer `tests/unit/pickupMagnet.test.ts`)

**Interfaces:** `PickupKind = 'xp'|'heal'|'magnet'|'chest'|'coffre'` ; le composant `pickup.type` porte le kind. La collecte au contact (L48-56) reste ; seule l'**aimantation à distance** (L61-66) est exclue pour les coffres.

- [ ] **Step 1 — Test (échoue)** : un pickup `type:'coffre'` posé à distance `d` avec `collectDist < d ≤ pickupRadius` du joueur ne bouge PAS après un pas (`gpos` inchangé) ; un pickup `type:'xp'` dans les mêmes conditions se rapproche.
- [ ] **Step 2** : FAIL (le coffre est actuellement aimanté).
- [ ] **Step 3 — Impl** : dans la condition d'aimantation `pickup.ts:61`, sauter si `pickup.type === 'coffre' || pickup.type === 'chest'`.
- [ ] **Step 4** : PASS.
- [ ] **Step 5 — Gates** : tous. `sim:check` quasi inchangé (les bots ne farmaient pas les coffres) — si diff, re-baseline en Task 5. **Commit** `fix(core): les coffres ne sont plus attirés par l'aimant`.

---

### Task 3 — File de choix (`pendingLevelUp` → queue)

**Files:**
- Modify: `src/core/simulation.ts` (champ `pendingLevelUp` L137 ; `isFrozen` L209 ; `checkLevelUp` L622-651 ; `chooseUpgrade` L236-250 ; `getState` L~298)
- Modify: `src/core/types.ts` si besoin (inchangé côté `PendingLevelUp`)
- Test: `tests/unit/levelUpQueue.test.ts`

**Interfaces:**
- Produces: `getState().pendingLevelUp: PendingLevelUp | null` (inchangé en surface = `queue[0] ?? null`). Nouveau champ privé `choiceQueue: PendingLevelUp[]`. Consommé par Task 4 (le coffre pousse dans la file).
- `PendingLevelUp = { playerId: number; choices: Card[] }` (types.ts:329).

**Design:** Remplacer le champ scalaire `pendingLevelUp` par une **file** `choiceQueue: PendingLevelUp[]`. Refactor **préservant le comportement** :
- `isFrozen()` : `this.choiceQueue.length > 0` (au lieu de `pendingLevelUp !== null`).
- `checkLevelUp()` : au lieu d'assigner `this.pendingLevelUp` et `return`, **push** dans `choiceQueue` (continuer d'empiler les paliers bankés si présents, ou garder le `return` après un push — préserver l'ordre actuel « un palier à la fois »). Vérifier : le comportement actuel pose 1 pending puis rattrape via `chooseUpgrade`→`checkLevelUp` ; la file doit reproduire ça (ne pas tout empiler d'un coup si ça change la baseline — préférer push-un-puis-return pour rester iso).
- `chooseUpgrade(index)` : appliquer `choiceQueue[0]`, `shift()`, puis `checkLevelUp()` (rattrapage). Garder les gardes d'index.
- `getState()` : `pendingLevelUp: this.choiceQueue[0] ?? null`.
- `reset()` : vider la file.

- [ ] **Step 1 — Test (échoue)** : partie déterministe ; forcer 2 level-ups rapprochés (XP) ⇒ `getState().pendingLevelUp` non-null, après `chooseUpgrade(0)` le 2e apparaît ; le temps reste gelé tant que la file n'est pas vide.
- [ ] **Step 2** : écrire d'abord contre l'API queue (FAIL car pas encore implémentée).
- [ ] **Step 3 — Impl** : refactor décrit. **Aucune** régression de comportement (les tests level-up existants restent verts).
- [ ] **Step 4** : `test` complet vert (surtout les tests level-up existants) + nouveau test.
- [ ] **Step 5 — Gates** : tous. **`sim:check` DOIT rester diff 0** (refactor iso-comportement — c'est le garde-fou : si diff ≠ 0, la file change l'ordre des tirages `rng`, corriger pour rester iso). **Commit** `refactor(core): file de choix (pendingLevelUp → queue), iso-comportement`.

---

### Task 4 — Coffre : évolution OU choix de cartes OU secours + jackpot

**Files:**
- Modify: `src/core/simulation.ts` (`handleChestPickups` L597-616 ; `getState` pour flag `justEvolved`)
- Modify: `src/core/systems/evolution.ts` (lecture seule : `tryEvolve` L40-70 renvoie `string|null`)
- Modify: `src/content/config.ts` (`CHEST.fallbackHealPct`, `CHEST.fallbackGems`)
- Modify: `src/core/types.ts` (`GameState.justEvolved?: boolean` transitoire) ; `src/ui/overlay.ts` (`showJackpot` sur flag)
- Test: `tests/unit/chestReward.test.ts`

**Interfaces:**
- Consumes: `tryEvolve(world, player): string|null` ; `rollCards(rng, inv, count)` (pondéré, Task 1) ; `choiceQueue` (Task 3) ; `eligibleCards(inv)`.
- Produces: `getState().justEvolved` (flag transitoire, remis à false chaque frame après lecture) consommé par `overlay.sync`.

**Design:** Réécrire `handleChestPickups` : pour chaque `playerId` collecteur :
1. `const evolvedId = tryEvolve(world, player)` — si `!== null` → `dispatch(EvolvedEvent)` + poser `this.justEvolved = true` (déclenche jackpot + voix évolution). *(comportement actuel + jackpot)*
2. sinon → construire l'inventaire du joueur, `const choices = rollCards(this.rng, inv, PROGRESSION.choices)` ; si `choices.length > 0` → **push** `{ playerId, choices }` dans `choiceQueue` (réutilise le gel + l'écran upgrade). *(le coffre ouvre un choix de cartes)*
3. sinon (tout maxé, `choices` vide) → **secours** : soin `CHEST.fallbackHealPct` (ex. 0.30) ; si PV déjà pleins, `spawnGems(CHEST.fallbackGems)` (ou soin only — au choix, déterministe).
- **Jackpot câblé** : `overlay.sync(state)` lit `state.justEvolved` ; si vrai, `this.showJackpot(...)`. `justEvolved` est remis à `false` par `getState`/`step` après une frame (transitoire, one-shot).

- [ ] **Step 1 — Test (échoue)** :
  - Coffre ramassé, **arme prête à évoluer** ⇒ arme évoluée + `getState().justEvolved === true` (une frame).
  - Coffre, **aucune évolution mais inventaire non-maxé** ⇒ `getState().pendingLevelUp !== null` (cartes proposées) ; temps gelé.
  - Coffre, **tout maxé** ⇒ PV augmentés de `fallbackHealPct` (ou gemmes) ; pas de `pendingLevelUp`.
  - Déterminisme : même seed ⇒ mêmes cartes proposées par le coffre.
- [ ] **Step 2** : FAIL.
- [ ] **Step 3 — Impl** : réécrire `handleChestPickups` ; ajouter `CHEST.fallbackHealPct/fallbackGems` ; `justEvolved` transitoire dans `getState` ; câbler `overlay.showJackpot` sur le flag.
- [ ] **Step 4** : PASS.
- [ ] **Step 5 — Gates** : tous + `test:e2e` (coffre via seam : ramasser un coffre pose un `pendingLevelUp` ou évolue). `sim:check` bougera (Task 5). **Commit** `feat(core): coffre garantit un effet — évolution / choix de cartes / secours + jackpot`.

---

### Task 5 — Re-tune + re-baseline sim (P0)

**Files:**
- Modify: `tools/sim/targets.ts` si nécessaire ; `tools/sim/baseline.json`
- Modify: `src/content/config.ts`/`src/content/spawnRamp.ts` si un tuning est requis

**Design:** Les Tasks 1/3/4 accélèrent la montée en puissance → survie/win des bots montent. Relancer `npm run sim:check`, mesurer. Objectif : **conserver l'intention arc 20 min** (kite médiane ~13-16 min, win 25-40 %, campeurs idle/greedy punis). Si le joueur devient trop fort (kite survie/full trop haut), resserrer une variable de difficulté (une à la fois : `difficultyScaleAt` hp/contact, `SPAWN_RAMP`). Re-baseline **après** cibles vertes.

- [ ] **Step 1** : `npm run sim:check` — capturer les nouveaux nombres (kite/greedy/idle : survie médiane, win %, survive-full %).
- [ ] **Step 2** : ajuster cibles (`targets.ts`) et/ou difficulté pour rester « gagnable & profond ». Itérer (harness, une variable à la fois).
- [ ] **Step 3** : cibles VERTES ⇒ re-baseline (`npm run sim:check` régénère `baseline.json`).
- [ ] **Step 4 — Gates** : `type-check`/`lint`/`test`/`sim:check` VERT. **Commit** `chore(sim): re-tune + re-baseline (boucle de puissance P0)`.

---

# PHASE P1 — Bugs rapides

### Task 6 — Une seule voix par événement

**Files:**
- Modify: `src/audio/audioDirector.ts` (`bindEvents` L145-148 ; helper `playVoice` L262)
- Test: test pur `audioDirector` (ex. `tests/unit/audioDirector*.test.ts`)

**Design:** Deux corrections : (a) **filtrer `'coffre'`** de la branche voix `pickupCollected` (L145-148) — le coffre a désormais sa propre voix (évolution via `evolved`, ou l'écran de choix) ; ne plus jouer `VOICE.bonus` pour un coffre. (b) **Garde anti-chevauchement** dans `playVoice` : si une voix a été déclenchée dans la même frame / depuis moins de `VOICE_MIN_GAP_MS` (ex. 250 ms) via l'horloge de jeu exposée à l'audio, **ne pas** en superposer une seconde (garder la plus prioritaire : évolution > bonus > upgrade > enemyDown). Implémenter simplement (timestamp de dernière voix, comparaison au temps courant fourni au director — PAS `Date.now`, utiliser l'horloge déjà passée au director).

- [ ] **Step 1 — Test (échoue)** : simuler `emit('pickupCollected','coffre')` ⇒ **0** appel `playVoice(VOICE.bonus)`. Simuler deux `playVoice` dans la même frame ⇒ **1** seule voix effectivement jouée (l'autre est droppée par le garde).
- [ ] **Step 2** : FAIL.
- [ ] **Step 3 — Impl** : filtre `'coffre'` + garde min-gap.
- [ ] **Step 4** : PASS.
- [ ] **Step 5 — Gates** : `type-check`/`lint`/`test` (l'audio est rendu-side → `sim:check` diff 0 ; pas d'e2e requis). **Commit** `fix(audio): une seule voix par événement (fin du doublon coffre/level-up)`.

---

### Task 7 — Prisonniers visibles & sauvables

**Files:**
- Diagnostic : capture seam + inspection asset `public/stage01/props/cage.png` (alpha)
- Modify (selon diagnostic) : `src/render/scenes/playerRenderer.ts` (`syncPrisoners` L386-428, depth/alpha) et/ou l'asset cage et/ou `src/content/config.ts` (`RESCUE.distMin`)
- Vérif : capture in-game

**Design:** Sim OK, rendu câblé (worker `depth 2` scale 0.5 ; cage `depth 3` scale 1.2, `image('cage')`). Symptôme « cage vide » = 2 hypothèses : (a) **`cage.png` opaque** masque l'ouvrier (cage devant, depth 3 > 2) ; (b) **spawn trop loin** (`distMin 1600`→3800) → jamais croisé.

- [ ] **Step 1 — Diagnostic** : capture `?autostart=solo&level=1` près d'un prisonnier (réduire temporairement `distMin` pour en trouver un, ou inspecter `getState().prisoners` pour la position et téléporter la caméra). Inspecter l'alpha de `cage.png` (transparence entre barreaux ?).
- [ ] **Step 2 — Fix ciblé** selon le diagnostic :
  - Si cage opaque → rendre l'ouvrier **visible** : soit corriger l'asset (barreaux transparents), soit `cage.setAlpha(0.85)` + worker `depth 2` conservé, soit dessiner la cage en **surcouche à barreaux** (fallback stroke transparent). Le prisonnier doit se voir DANS la cage.
  - Si spawn trop loin → baisser `RESCUE.distMin` (ex. 700-900) pour qu'on croise les prisonniers pendant une run (rester déterministe ; **note : touche la sim → `sim:check` + re-baseline** si `distMin` change).
- [ ] **Step 3 — Vérif** : capture montrant l'ouvrier lisible dans sa cage ; `getState().prisoners` inchangé ; `test:e2e` rescue vert.
- [ ] **Step 4 — Gates** : tous (+ re-baseline si `distMin` a changé). **Commit** `fix(render): prisonnier visible dans sa cage (+ portée de spawn)`.

---

# PHASE P2 — Lisibilité des hordes (amplifier → nouvelles formations → télégraphe)

### Task 8 — Amplifier les formations existantes (nettes, denses, densité variable)

**Files:**
- Modify: `src/content/waveEvents.ts` (`placeEncircle` L148, `placeSweep` L202, counts) ; `src/content/config.ts` (`FORMATION` densité)
- Test: `tests/unit/waveEvents.test.ts`

**Design:** Rendre les formations LISIBLES :
- **encircle** : anneau **complet fermé** — garder l'équirépartition 360° mais relever `countMin/countMax` (ex. 12-18) et resserrer le rayon pour un cercle net et dense.
- **sweep** : **mur solide** — ennemis serrés sur la ligne (réduire l'écart, relever le count), traversée nette.
- **Densité variable** : introduire un paramètre de compacité (ex. `spread` réduit = condensé) exploité par certaines entrées de pool pour le contraste condensé ↔ aéré.
- Relever les `countMin/countMax` des events de formation dans `EVENT_POOL_DEFAULT`/`EVENT_POOL_BY_PHASE` (le directeur **conserve le budget** → moins de filet de fond, plus de gros pics).

- [ ] **Step 1 — Test** : `placeEncircle(count, r, rng)` avec `count=16` ⇒ 16 placements équirépartis (écart angulaire ≈ 2π/16, anneau fermé) ; `placeSweep` dense (écarts perpendiculaires resserrés vs avant). Déterminisme conservé.
- [ ] **Step 2** : FAIL.
- [ ] **Step 3 — Impl** : ajuster les fonctions + les counts de pool + `FORMATION` config.
- [ ] **Step 4** : PASS.
- [ ] **Step 5 — Gates** : tous. `sim:check` : budget conservé → difficulté ~stable ; re-baseline si léger diff (cibles vertes d'abord). **Commit** `feat(content): formations amplifiées (encerclement complet, mur dense, densité variable)`.

---

### Task 9 — Nouvelles formations VS-style (spiral, columns, concentric)

**Files:**
- Modify: `src/content/waveEvents.ts` (`WaveEventKind` L19 ; `placeEvent` L63 ; nouvelles `placeXxx`) ; `EVENT_POOL_BY_PHASE`
- Test: `tests/unit/waveEvents.test.ts`

**Interfaces:** `WavePlacement = { angle, radius, behavior, bAngle? }`. Les nouvelles formations sont **pures** (`rng` en argument, déterministes).

**Design:** Ajouter 3 kinds :
- **spiral** : `count` ennemis sur une spirale — angle `base + i*Δθ`, rayon croissant `r0 + i*Δr` (resserrement visuel tournant).
- **columns** : 2-3 lignes parallèles (murs segmentés) traversant l'arène (behavior `sweep`), décalées.
- **concentric** : deux anneaux `encircle` à rayons différents (double encerclement), l'externe légèrement retardé via `bAngle`.
Intégrer aux pools (identité tardive plus agressive). Comportements par défaut sensés (`chase`/`circler`/`sweep`).

- [ ] **Step 1 — Test** : pour chaque nouveau kind, `placeEvent(kind, count, r, rng)` renvoie `count` placements avec la forme attendue (spiral : rayon croissant monotone ; concentric : 2 rayons distincts ; columns : ≥2 groupes parallèles). Déterminisme. `placeEvent` gère les nouveaux kinds sans throw.
- [ ] **Step 2** : FAIL.
- [ ] **Step 3 — Impl** : `WaveEventKind` étendu + 3 `placeXxx` + `case` dans `placeEvent` + entrées de pool.
- [ ] **Step 4** : PASS.
- [ ] **Step 5 — Gates** : tous. `sim:check` VERT (budget conservé) + re-baseline si diff. **Commit** `feat(content): nouvelles formations (spirale, colonnes, vagues concentriques)`.

---

### Task 10 — Télégraphe des formations (on voit la horde arriver)

**Files:**
- Modify: `src/core/systems/waveDirector.ts` (`WaveDirectorState` + `triggerEvent`/`stepWaveDirector` : planifier ~0.8 s à l'avance)
- Modify: `src/core/types.ts` / `src/core/simulation.ts` (`getState().pendingFormations: { kind, angle, radius, triggersInMs }[]`)
- Create: `src/render/scenes/telegraphRenderer.ts` (module observateur : marqueur au sol + flèche de bord d'écran)
- Modify: `src/render/scenes/GameScene.ts` (instancier + déléguer `this.telegraph.sync(state)`)
- Test: `tests/unit/waveDirectorTelegraph.test.ts` + e2e `tests/e2e/telegraph.spec.ts`

**Interfaces:**
- Produces: `getState().pendingFormations` (liste des formations annoncées non encore spawnées, avec origine/kind/échéance). Consommé par `telegraphRenderer`.
- `TELEGRAPH_LEAD_MS` (config, ~800).

**Design:** Directeur **en deux temps** : quand une formation est décidée, au lieu de la spawner immédiatement, l'**annoncer** (`state.upcoming = { kind, angle, radius, triggersAtMs: elapsed + TELEGRAPH_LEAD_MS }`) et l'exposer ; au(x) pas suivant(s), quand `elapsed >= triggersAtMs`, produire les `placements` (via `placeEvent`) et vider `upcoming`. **Déterministe** : piloté par `_waveRng` ; ne change ni QUI ni COMBIEN, seulement décale le spawn de `TELEGRAPH_LEAD_MS` (impact équilibrage neutre → re-baseline du léger décalage). `telegraphRenderer` (nouveau module, **pas** dans GameScene) dessine un marqueur DA au sol à l'origine (arc pour encircle, ligne pour sweep/columns…) + une flèche de bord d'écran, poolés et bornés.

- [ ] **Step 1 — Test unit** : le directeur, quand il déclenche une formation, expose d'abord `pendingFormations` non vide (`triggersInMs ≈ TELEGRAPH_LEAD_MS`), puis émet les placements ~0.8 s plus tard, puis vide. Déterministe (même seed ⇒ mêmes annonces/instants).
- [ ] **Step 2** : FAIL.
- [ ] **Step 3 — Impl core** : champ `upcoming` dans `WaveDirectorState`, logique deux-temps dans `stepWaveDirector`/`triggerEvent`, `getState().pendingFormations`.
- [ ] **Step 4 — Impl rendu** : `telegraphRenderer.ts` observateur + câblage `GameScene` (délégation only). e2e seam : `getState().pendingFormations` se remplit puis se vide.
- [ ] **Step 5 — Gates** : tous + `test:e2e`. `sim:check` : re-mesurer (décalage 0.8 s) ⇒ cibles vertes + re-baseline. `fps-horde` vert. **Commit** `feat: télégraphe des formations (annonce directeur + rendu marqueur/flèche)`.

---

### Task 11 — Adoucir le pic ~11 min (post-P0)

**Files:**
- Modify: `src/content/spawnRamp.ts` (`difficultyScaleAt` / `SPAWN_RAMP`) ; `tools/sim/baseline.json`
- Test: `tests/unit/spawnRampArc.test.ts` (continuité)

**Design:** Une fois l'évolution accessible (P0) et les formations amplifiées (P2), re-mesurer la zone 9-13 min. Si un mur persiste (`kite` meurt en masse ~11 min), lisser localement la courbe (une variable à la fois : pente hp/contact autour de 11 min). Tuning au harness.

- [ ] **Step 1** : `npm run sim` seeds sur 660-780 s ; localiser le décrochage.
- [ ] **Step 2** : ajuster `difficultyScaleAt`/`SPAWN_RAMP` localement ; continuité/monotonie préservées (test).
- [ ] **Step 3 — Gates** : `sim:check` VERT + re-baseline. **Commit** `chore(balance): adoucir le pic ~11 min (post power-curve)`.

---

# PHASE P3 — Polish / lisibilité

### Task 12 — PNJ d'ambiance qui déambulent

**Files:**
- Modify: `src/render/ambientNpc.ts` (rayon/amplitude L~30)
- Test: `tests/unit/ambientNpc*.test.ts` (déterminisme) si existant, sinon vérif capture

**Design:** Actuel : `'work'` = rayon **±24 px** (bouge sur place). Élargir le déambulement : `'work'` → parcours plus large (ex. 80-120 px, trajet lent), garder déterministe (Lissajous seedé) et **cosmétique** (aucun impact sim). Le PNJ doit visiblement « circuler/travailler », rester non-menaçant.

- [ ] **Step 1 — Test** : `ambientOffset(seed, t, 'work')` sur une période couvre une amplitude ≥ ~80 px (bornée), déterministe (même seed+t ⇒ même offset).
- [ ] **Step 2** : FAIL (24 px actuel).
- [ ] **Step 3 — Impl** : augmenter le rayon `'work'`, éventuellement composer 2 sinus pour un trajet plus « déambulatoire ».
- [ ] **Step 4** : PASS + capture montrant des PNJ qui se déplacent.
- [ ] **Step 5 — Gates** : `type-check`/`lint`/`test` (rendu-only → `sim:check` diff 0). **Commit** `feat(render): les PNJ d'ambiance déambulent (amplitude élargie)`.

---

### Task 13 — Mini-carte : chevron par joueur, orienté, couleur par joueur

**Files:**
- Modify: `src/ui/minimap.ts` (marqueur joueur L78-84) ; CSS associé (`src/ui/styles.ts` `.minimap__dot--player` → chevron)
- Test: e2e/capture (marqueur présent, orienté)

**Design:** Remplacer le `div` point rond par un **chevron** (triangle CSS ou glyphe/SVG) **orienté** selon la direction du joueur `atan2(vy, vx)` (si `vx=vy=0`, garder l'orientation précédente ou pointer vers le haut), **coloré** par `playerColor(player.id)` (déjà en place). Un chevron **par joueur**.

- [ ] **Step 1 — Impl** : chevron CSS (bordures) ou petit SVG rotatif ; rotation par `transform: rotate(...)` depuis `(vx,vy)`. Conserver la couleur par joueur. `PlayerState` expose `vx`/`vy`.
- [ ] **Step 2 — Vérif** : capture/e2e : en solo un chevron coloré orienté ; simuler 2 joueurs ⇒ 2 chevrons de couleurs distinctes.
- [ ] **Step 3 — Gates** : `type-check`/`lint`/`test`/`test:e2e` (UI-only → `sim:check` diff 0). **Commit** `feat(ui): mini-carte — chevron orienté par joueur (couleur par joueur)`.

---

### Task 14 — Aura argentée sur les ennemis élite

**Files:**
- Modify: `src/render/scenes/hordeRenderer.ts` (boucle ennemis L145-201, après `setPosition` L164)
- Test: capture (élite visuellement distinct)

**Design:** Les élites (`EnemyState.isElite === true`, droppeurs de coffre) reçoivent un **liseré/aura argenté** (DA 16-bit, pas de glow moderne — un `Arc`/anneau pixel net derrière le sprite). Ajouter une `Map<number, Phaser.GameObjects.Arc> eliteAuras` sur le renderer ; créer/positionner l'aura derrière le sprite si `isElite`, même culling/pooling que `enemySprites` ; retirer quand l'ennemi meurt/sort. Observateur, borné. Aucun impact sim.

- [ ] **Step 1 — Impl** : aura poolée synchronisée avec les sprites élite (couleur argent palette).
- [ ] **Step 2 — Vérif** : `debugSpawnEnemies` (ou seam) avec un élite ⇒ capture montrant l'aura ; pas d'aura sur les non-élites ; pas de fuite d'objets (culling).
- [ ] **Step 3 — Gates** : `type-check`/`lint`/`test`/`fps-horde` vert (rendu-only → `sim:check` diff 0). **Commit** `feat(render): aura argentée sur les ennemis élite (lisibilité)`.

---

### Task 15 — Kills par joueur au game over (compétition 2 joueurs)

**Files:**
- Modify: `src/core/types.ts` (composant enemy `lastHitBy?: number` ; `PlayerState.kills: number`)
- Modify: sites de dégât : `src/core/systems/collision.ts:57` (projectile) ; `src/core/systems/weapon.ts:573/619/631` (cône/radius) ; `src/core/systems/hazard.ts` (`damageEnemiesInRadius`)
- Modify: `src/core/systems/reap.ts` (`reapDeadEnemies` → attribuer les kills) ; `src/core/simulation.ts` (tally par joueur, `collectPlayers`, `getState`)
- Modify: `src/ui/overlay.ts` (`gameOverPanel` L545-565 : kills par joueur + winner/loser)
- Test: `tests/unit/killAttribution.test.ts`

**Interfaces:**
- Le composant `enemy` (ou `health`) gagne `lastHitBy?: playerId`. Les projectiles/armes portent l'`ownerId`/`playerId` du tireur (vérifier au 1er pas — CLAUDE.md exige `ownerId` sur les entités ; sinon le plomber).
- `PlayerState.kills: number` exposé dans `AppViewState`.

**Design:** À chaque site où `enemy.health.hp -= damage`, poser `enemy.lastHitBy = ownerPlayerId` (récupéré depuis le projectile/arme/hazard source). `reapDeadEnemies` : pour chaque ennemi mort, incrémenter `killsByPlayer[lastHitBy]` (retourner la map ou muter un accumulateur). `simulation` tient `killsByPlayer: Map<number,number>`, exposé par joueur dans `getState().players[].kills`. `gameOverPanel` : afficher les kills par joueur ; en multi (≥2 joueurs), marquer **VAINQUEUR/PERDANT** (max kills). Solo : afficher le total (= `score`).

- [ ] **Step 1 — Test (échoue)** : 2 joueurs, l'arme du joueur 1 tue N ennemis, celle du joueur 2 en tue M ⇒ `getState().players[0].kills === N`, `players[1].kills === M`, somme = `score`. Un ennemi tué par contact/hazard sans propriétaire → attribué à personne (ou au dernier frappeur si applicable).
- [ ] **Step 2** : FAIL (pas d'attribution aujourd'hui).
- [ ] **Step 3 — Impl** : `lastHitBy` sur enemy + pose aux sites de dégât (vérifier l'`ownerId` disponible sur chaque source) ; attribution dans `reap` ; `kills` par joueur dans `getState` ; panneau game over.
- [ ] **Step 4** : PASS.
- [ ] **Step 5 — Gates** : tous + `test:e2e` (game over affiche les kills). `sim:check` : l'attribution ne change pas la mort des ennemis → **diff 0 attendu** (le tally est un sous-produit ; vérifier). **Commit** `feat: kills par joueur au game over (compétition — vainqueur/perdant)`.

---

# Vérification (« jouer pour valider »)

- **Par tâche** : `type-check` · `lint` · `test` · `sim:check` (diff 0 pour rendu/UI ; cibles vertes + re-baseline pour sim) · `test:e2e` (seam) aux tâches rendu/état.
- **Sim** : `npm run sim -- --seeds 12 --duration 1260 --bot kite|greedy|idle` = oracle d'équilibrage.
- **Captures** (régression visuelle uniquement) : prisonnier dans sa cage, télégraphe, aura élite, chevrons minimap, jackpot coffre.
- **Oracle final = playtest** : le fun arrive-t-il tôt (armes montées/évoluées, coffres satisfaisants) ? les hordes se LISENT-elles (encerclement complet, murs, spirales, télégraphe) ? la compétition 2 joueurs marche-t-elle ?

# Séquencement

P0 (T1→T5, débloque le fun + re-baseline) → P1 (T6, T7) → P2 (T8→T11, amplifier → nouvelles formations → télégraphe → adoucir) → P3 (T12→T15). Signaler à l'utilisateur aux **frontières de phase**.

# Hors périmètre

- Régénération d'assets PixelLab (sauf `cage.png` si le diagnostic T7 impose la transparence).
- Mode compétition dédié (le compteur de kills au game over suffit au MVP).
