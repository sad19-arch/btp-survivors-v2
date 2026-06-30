# Spec — Tuning d'équilibrage « skill récompensé »

> Date : 2026-06-30 · Branche de travail : à créer depuis `feat/mvp-jouable` (ou `main` si la PR #1 est fusionnée).
> Objectif produit : prouver que la boucle MVP est **fun et survivable 6-8 min**, avec un **climax au mini-boss (5:00)**.

## 1. Contexte & problème

Le MVP est jouable (boucle Titre→Game Over complète) mais l'équilibrage n'a jamais été mesuré ni tuné. Deux manques constatés en lisant le code :

1. **Le harness `sim` ne sait pas prouver l'équilibrage** : il tourne sur **1 seule seed**, n'imprime que **l'état final**, et ses invariants se limitent à NaN / HP négatif / plafond d'ennemis. Pas d'invariant « survie attendue » (pourtant promis dans `CLAUDE.md`), pas de courbes avant/après (promises dans `PILOTAGE.md`).
2. **Le spawn est plat** : `SPAWN.intervalMs` (1400 ms) et `SPAWN.countPerWave` (1) sont des constantes lues dans `runSpawns` (`src/core/simulation.ts`). **Aucune montée en difficulté dans le temps** → impossible d'obtenir un « skill récompensé avec climax à 5:00 » dans l'état actuel.

On ne peut pas tuner sérieusement sans instrument de mesure. Le travail se fait donc en **deux couches**, dans l'ordre.

## 2. Cible de feel : « skill récompensé »

- Un **bon joueur** (esquive/kite) survit les 6-8 min ; le mini-boss à 5:00 est le climax.
- Un joueur **imprudent** (gourmand, se jette sur les pickups/ennemis) meurt en milieu de partie.
- Un joueur **passif** (immobile) est puni (mort plus tôt).
- La mort est **possible mais pas punitive au tout début** (PRD : 0-1 min = apprentissage).

## 3. Couche A — Instrument de mesure (à livrer EN PREMIER)

Étendre `tools/sim/` pour en faire un outil de preuve. **Contrainte d'archi : lecture seule de `getState()`** — le cœur (`src/core`) reste pur et déterministe, l'instrument ne le mute pas.

### 3.1 Séries temporelles
Échantillonner toutes les ~10 s de temps de jeu, par run : `t` (s), `HP%` (hp/maxHp du joueur), `nbEnnemis`, `niveau`, `score`.

### 3.2 Balayage déterministe
Flags : `--seeds <N|liste>` (seeds **énumérées**, p.ex. 1..N — zéro `Math.random`), `--bots kite,greedy,idle`, `--duration <sec>` (défaut 480 = 8 min), `--step <ms>` (défaut 100).
Pour chaque bot, agréger sur les seeds : **survie médiane**, **% de runs survivant la durée pleine**, **niveau médian @5:00**, **pic d'ennemis médian**, et la **courbe médiane par bucket de temps** (HP%, nbEnnemis).

### 3.3 Sortie CLI
- Tableau récap **par bot** (survie médiane / min / max, % survie pleine, niveau médian @5:00, pic ennemis).
- **Sparklines ASCII** des courbes médianes (HP% et nbEnnemis dans le temps).
- Bloc **PASS/FAIL** vs cibles (§3.5).

### 3.4 Avant/après
- `npm run sim -- --baseline save` → écrit les agrégats dans `tools/sim/baseline.json`.
- Un run normal, si `baseline.json` existe, imprime le **diff** vs baseline (survie ±, niveau ±, pic ±). C'est la preuve « avant/après ».

### 3.5 Cibles (deviennent des invariants) — valeurs de DÉPART, à calibrer

> **Process obligatoire (consigne utilisateur)** : l'instrument **mesure d'abord l'équilibrage existant** et montre les courbes + un diagnostic. **On calibre ces seuils contre le réel ensemble. On ne touche à AUCUN chiffre de gameplay tant que les cibles ne sont pas validées.** Les valeurs ci-dessous sont des hypothèses initiales, pas une vérité.

- **kite** (habile) : ≥ 80 % des seeds survivent la durée pleine ; atteint le boss vivant sur ≥ 80 % ; niveau médian @5:00 ≥ ~8 ; **ne meurt jamais avant 1:00**.
- **greedy** (imprudent) : mort médiane entre **3:00 et 5:30**.
- **idle** (passif) : mort médiane **< 4:00** mais **> 1:30**.
- **Sanity** (conservés) : pas de NaN, HP jamais < 0, plafond d'ennemis respecté.

### 3.6 Hypothèses de mesure
- Le bot choisit les upgrades de façon **déterministe** (stratégie par défaut : index 0 ; une stratégie « DPS » est hors périmètre — YAGNI).
- Les définitions des bots (`kite`/`greedy`/`idle`) restent la définition opérationnelle du « niveau de skill ».

## 4. Couche B — Tuning des leviers (data-driven) — APRÈS validation des cibles

Tout vit dans `src/content` (règle data-driven de `CLAUDE.md`). Ordre d'attaque : spawn d'abord (dominant), puis le reste.

1. **Rampe de spawn temporelle** *(nouveau, levier #1)* — remplacer les constantes par une **table de paliers** typée dans `config.ts` :
   `SPAWN_RAMP: { fromSec: number; intervalMs: number; countPerWave: number; poolWeights?: ... }[]`.
   `runSpawns` (`simulation.ts`) lit le palier courant selon `elapsedMs`. Extension **minimale** du système (lire une table au lieu de constantes), pas de logique en dur. Pondération de pool évolutive = optionnelle (vérifier le support des poids dans `phases.ts` ; sinon hors périmètre).
2. **Joueur / progression** (`config.ts`) : `PLAYER_BASE.hp/speed/pickupRadius`, `PROGRESSION.firstThreshold/growth`.
3. **Armes** (`weapons.ts`) : `damage`/`cooldownMs` du cloueur, scie, marteau.
4. **Ennemis** (`enemies.ts`) : `hp`/`speed`/`contactDamage`/`xpValue` des 3 + mini-boss.

**Méthode itérative prouvée** : baseline → écarts vs cibles → ajuster un groupe de leviers (spawn d'abord) → re-mesurer → comparer au baseline → itérer jusqu'à PASS. Chaque pas est prouvé par le harness, pas déclaré.

## 5. Validation (skill `play-to-validate`)

- **Vitest (TDD)** : la lecture de la rampe est testée en pur — à tel `elapsedMs`, on attend tel `intervalMs`/`countPerWave`. Écrit **avant** le code de rampe.
- **Sim** : validation principale — cibles **PASS** sur le balayage de seeds, diff avant/après affiché.
- **e2e Playwright (headless)** : smoke — la partie tourne, le boss apparaît à 5:00, pas de régression d'écran/HUD.
- **type-check + lint** : verts, 0 warning ; **zéro `any`** dans `src/core`/`src/content`.

## 6. Garde-fous d'architecture (impératifs `CLAUDE.md`)

- `src/core` et `src/content` n'importent ni Phaser ni le DOM ; pas de `Math.random`/`Date.now`/`new Date` (RNG seedé + `FixedClock`).
- Équilibrage = **données typées** validées au boot, jamais en dur dans les systèmes.
- Déterminisme : même seed + mêmes inputs ⇒ même partie (seeds du balayage énumérées).
- Un fichier = une responsabilité ; pas de god object dans l'instrument.

## 7. Livrables

- `tools/sim/` étendu : métriques temporelles, balayage multi-seed/multi-bot, sparklines, tableau, PASS/FAIL, baseline/diff. Découpé proprement (collecte de métriques, agrégation, rendu CLI, invariants — fichiers séparés).
- `src/content/config.ts` : `SPAWN_RAMP` + valeurs tunées ; `weapons.ts` / `enemies.ts` tunés.
- `simulation.ts` : `runSpawns` lit la rampe.
- Test Vitest pour la rampe.
- `tools/sim/baseline.json` (snapshot avant tuning).
- Entrée **avant/après** dans le Journal de `PILOTAGE.md`.

## 8. Hors périmètre (YAGNI)

- Dashboard HTML / graphiques interactifs (sortie reste CLI).
- Stratégies d'upgrade complexes du bot.
- Équilibrage de la coop, des autres phases, d'autres armes/ennemis (MVP solo, 1 phase uniquement).
- Refactor non lié à l'équilibrage.

## 9. Ordre d'exécution (jalons)

1. **Couche A** complète (instrument + balayage + sparklines + baseline/diff), invariants en mode « informatif » (n'échouent pas encore).
2. **Mesure de l'existant** : run du balayage sur l'équilibrage actuel → courbes + diagnostic présentés à l'utilisateur.
3. **Calibration des cibles** avec l'utilisateur → figer les invariants (§3.5).
4. **Couche B** : tuning itératif prouvé jusqu'à PASS.
5. Journal avant/après + validation complète (Vitest/sim/e2e/type-check/lint).
