# Comportements d'ennemis + chorégraphie de horde (directeur de vagues) — Design

**Date** : 2026-07-07
**Statut** : design validé (brainstorming), prêt pour writing-plans

## Contexte & problème

Aujourd'hui les ennemis ne font qu'**une seule chose** : poursuivre en ligne directe le joueur vivant le plus proche (`enemyAiSystem`, poursuite homing, vitesse × direction normalisée). Les seules variations sont la **vitesse/PV par archétype** (BASE/FAST/TANK). Le spawn est un **flux continu plat** : la rampe `SPAWN_RAMP` émet `countPerWave` ennemis toutes les `intervalMs` sur un anneau (rayon 560 px) autour du joueur. Résultat : pas de **rythme**, pas de **variété de menace**, et une run « MVP » courte (boss final ~10:30).

**But** : introduire (1) des **comportements de mouvement variés** et (2) une **chorégraphie de vagues** (arrivées groupées/synchronisées, encerclements, salves, traversées) qui **amène du rythme** (alternance calme ↔ pic), le tout pilotant des **runs plus longues (~20 min)**. Inspiration : Vampire Survivors (mouvements « Medusa » ondulés, « Stalker » à-coups) et son système de **« timed enemy spawn / map events »** — des événements scriptés à des instants fixes qui injectent des groupes hors du flux normal (nuée qui balaie l'écran, encerclement par des costauds). Voir aussi le pattern « AI Director » (L4D) pour les **événements réactifs au joueur**.

## Décisions de cadrage (validées avec l'utilisateur)

1. **Priorité = chorégraphie d'abord.** Le directeur de vagues est le moteur de rythme ; les comportements de mouvement sont au service des événements (juste ce qu'il faut pour les rendre lisibles).
2. **Difficulté par-moment tenue, mais arc allongé.** La chorégraphie **redistribue** le budget d'ennemis (calme + pics) sans augmenter la pression nette instantanée ; en parallèle, l'**arc de la run est étendu à ~20 min**.
3. **Approche B — directeur cadencé + pool d'événements pondéré par phase** (pas de timeline scriptée manuelle). Tirages seedés → déterministe **et** varié d'un run à l'autre.
4. **Événements réactifs inclus** (anti-camping en vedette).
5. **Arc 20 min dans CE lot** (re-tune + re-baseline complets).
6. **Mini-boss/« reapers » périodiques inclus** comme événements du directeur.

## Non-goals (YAGNI)

- Pas d'ennemis à **tir à distance** (projectiles ennemis) dans ce lot.
- Pas de refonte des armes/upgrades.
- Pas d'IA de pathfinding (évitement d'obstacles) — le monde est ouvert, on reste en steering direct.
- Pas de nouveaux assets requis : on **réutilise** les sprites d'ennemis/boss existants par stage. (Un comportement peut réutiliser un skin existant ; l'ajout de skins dédiés = passe DA ultérieure, hors périmètre.)

## Contraintes d'architecture (rappel projet)

- **Sim déterministe pure** : tout vit dans `src/core` (aucun Phaser/DOM). Interdit `Math.random`/`Date.now`/`new Date` → `Rng` seedé + `FixedClock` (pas fixe `STEP_MS ≈ 16.67 ms`, 60 Hz).
- **Data-driven** : comportements & événements = **données typées** dans `src/content`, validées au boot.
- **Séparation sim/rendu** : le rendu (couche `src/render`, ex. `hordeRenderer.ts`) ne fait qu'observer. Les nouveaux comportements ne changent **pas** l'API de rendu (les ennemis restent des entités position/type) — donc **impact rendu ≈ nul**, hormis d'éventuels VFX de télégraphe (option, hors cœur).
- **Zéro `any` dans `src/core`**, TS strict, ESLint 0 warning.

---

## Composant 1 — Comportements de mouvement (data-driven)

### Modèle de données

`EnemyComp` (`src/core/types.ts`) gagne un champ **`behavior`** + un petit état par-ennemi (interprété selon le comportement) :

```ts
export type EnemyBehavior = 'chase' | 'zigzag' | 'circler' | 'sweep' | 'charger'

export interface EnemyComp {
  // …existant : type, speed, isElite, isBoss, bossRole?, contactDamage, xpValue
  behavior: EnemyBehavior         // défaut 'chase'
  /** Phase/graine par-ennemi pour les mouvements périodiques (zigzag). Seedée au spawn. */
  bPhase?: number
  /** Angle cible autour du joueur (circler) OU direction fixe encodée (sweep). Radians. */
  bAngle?: number
  /** État machine du charger + timer (ms) : 0=approche,1=télégraphe,2=dash,3=récup. */
  bMode?: number
  bTimer?: number
}
```

`EnemyDef` (`src/content/enemies.ts`) gagne un `behavior?: EnemyBehavior` (défaut `'chase'`). Un **même archétype** (BASE/FAST/TANK) peut être spawné avec un comportement **override** par l'événement (ex. un archétype BASE spawné en `circler` pour un encerclement). Donc le comportement peut venir soit de la def (défaut du type), soit de l'événement (override au spawn).

### Les comportements (fonctions PURES dans `enemyAi.ts`)

`enemyAiSystem` **dispatche** sur `enemy.behavior`. Chaque comportement calcule la `velocity` du pas courant (puis `movementSystem` applique `pos += vel·dt`, et le `slow` d'arme continue de multiplier la vélocité comme aujourd'hui).

- **`chase`** (défaut, INCHANGÉ) : homing vers le joueur vivant le plus proche.
- **`zigzag`** : direction de base = homing, + une **oscillation sinusoïdale perpendiculaire** d'amplitude bornée. `perp = rot90(dirToPlayer)`, `offsetVel = perp · A · sin(ω·elapsed + bPhase)`. `bPhase` seedé au spawn → chaque ennemi ondule différemment. Déterministe (elapsed = temps fixe).
- **`circler`** (encercleur) : ne vise pas le joueur mais un **point sur un anneau** autour de lui, à l'angle `bAngle` (assigné par l'événement d'encerclement), rayon d'orbite `R`. Steering vers `player + R·(cos bAngle, sin bAngle)` → l'ensemble forme un cercle qui se resserre. `bAngle` peut dériver lentement (rotation de l'anneau) pour un effet « ils tournent autour ».
- **`sweep`** (traversée) : **direction fixe** (`bAngle`, assignée au spawn par l'événement), **ignore le joueur**, avance tout droit → « mur qui passe ». Despawn géré par le culling de distance existant.
- **`charger`** (à-coups, « Stalker ») : machine à états pilotée par `bMode`/`bTimer` : **approche** (vitesse normale) → au bout d'un délai/rapprochement, bref **télégraphe** (quasi-arrêt, marque un temps ~300 ms) → **dash** rapide (×N vitesse) vers la **dernière position** du joueur → **récupération** (lent) → boucle. Déterministe (timers en ms fixes). Le télégraphe rend le dash lisible/évitable.

Constantes de tuning (amplitude/ω zigzag, R circler, vitesses/délais charger) : dans `src/content` (data-driven, seedable/tunable), pas en dur dans le cœur.

---

## Composant 2 — Directeur de vagues (le moteur de rythme)

Nouveau module pur **`src/core/systems/waveDirector.ts`** + données **`src/content/waveEvents.ts`**. Il **remplace** l'émission plate de `runSpawns()` par une **cadence calme ↔ événement**, à **budget conservé**.

### Principe de budget conservé

La rampe `SPAWN_RAMP` définit un **budget d'ennemis par unité de temps** (aujourd'hui `countPerWave/intervalMs`). Le directeur **accumule** ce budget et le dépense en deux modes :
- **Accalmie** (par défaut) : un **filet continu** léger (petite fraction du budget) — le monde n'est jamais vide.
- **Événement** (à intervalles seedés) : il **met de côté** puis **dépense un gros bloc** du budget en **une formation** tirée du pool pondéré de la phase.

Sur une fenêtre, `Σ ennemis(directeur) ≈ Σ ennemis(rampe plate)` → **pression nette ≈ inchangée**, juste **cadencée**. (C'est ce qui permet de tenir les cibles d'équilibrage.)

### Les 5 formations d'événement (fonctions pures de placement)

Chacune produit une liste de spawns `{ x, y, type, behavior }` autour du centroïde joueur (rayon d'anneau existant, ou serré pour l'encerclement), positions via `waveRng` seedé :

| Événement | Forme | Comportement des ennemis |
|---|---|---|
| **Convergence** | N sur **un même secteur** de l'anneau (arc étroit), groupés | `chase` |
| **Pincer** | 2 sous-groupes de ~N/2 à **angles opposés** | `chase` |
| **Encerclement** | anneau **régulier** de N (angles équirépartis), rayon serré | `circler` (bAngle = position) |
| **Salve** | N **répartis tout autour** de l'anneau, d'un coup | `chase` (mix possible) |
| **Traversée** | ligne de N à **un bord**, direction fixe traversant l'arène | `sweep` (bAngle = direction) |

### Pool pondéré par phase (data-driven)

`waveEvents.ts` : par phase, une liste `{ kind, weight, countMin, countMax, enemyPool?, behaviorOverride?, minGapMs, allowedFromSec }`. Le directeur :
1. à chaque « slot d'événement » (intervalle seedé, décroissant au fil de l'arc → plus fréquent en fin de run),
2. tire un `kind` du pool selon les poids (`waveRng`),
3. choisit `count` ∈ [min,max] et les positions (`waveRng`),
4. dépense le budget accumulé.

### Mini-boss / « reapers » comme événements

Le pool peut contenir des entrées **`kind: 'miniBoss'`** déclenchant un mini-boss **réutilisant le boss existant du stage** (skin déjà présent), à des **paliers** de l'arc 20 min (ex. ~toutes les ~4-5 min), rôle `'mid'` (ne gagne pas la partie, peut lâcher un coffre). Le boss final reste l'unique condition de victoire, déplacé vers ~20:00 (cf. Composant 3).

### Couche réactive (directeur adaptatif) — anti-camping en vedette

Le directeur reçoit l'**état déterministe** du joueur et peut **forcer** un événement en réponse. **Déterministe-safe** : c'est une **fonction pure de l'état sim** (le chemin du joueur découle du seed + inputs), donc « même run → mêmes réactions », aucun hasard non-seedé.

- **Anti-camping** : le directeur suit un **déplacement cumulé sur fenêtre glissante** (ex. distance parcourue par le joueur sur les ~6 dernières secondes, calculée dans le cœur). Si < seuil → il déclenche immédiatement un événement **agressif** (encerclement ou convergence de `charger`) pour le **forcer à bouger**, puis pose un **cooldown** (évite le harcèlement).
- **Généralisation** (data-driven, options pour plus tard, pas toutes dans le 1er golden) : PV joueur bas → petit **répit** (saute un slot d'événement) ; **snowball** (haut niveau/DPS) → intensifier légèrement. On livre l'anti-camping ; le reste est câblé comme règles réactives optionnelles.

---

## Composant 3 — Arc de run ~20 min (re-pacing + re-équilibrage)

- **Étendre `SPAWN_RAMP`** (`src/content/spawnRamp.ts`) : nouveaux paliers couvrant ~0→20 min (budget global recalibré pour un arc long, montée + climax vers la fin).
- **Étendre `difficultyScaleAt`** : la courbe de scaling (hp/contact/speed) s'étale jusqu'à ~20 min au lieu de plafonner à ~10:30 (garder un « coup de fouet » final avant le boss).
- **Déplacer le boss final** (`FINAL_BOSS.atMs`) vers **~20:00** (1 200 000 ms). Mini-boss périodiques (Composant 2) ponctuent l'arc.
- **Re-dériver les cibles `sim:check`** (`tools/sim/targets.ts`) pour un arc 20 min : notamment `KITE_MIN_SURVIVAL_MEDIAN_MS` (viser une médiane qui traverse une bonne part de l'arc), `KITE_MIN_WIN_PCT` (rester ≥ un plancher gagnable), le creux de PV (climax), et les plafonds greedy/idle. **Re-baseline** (`tools/sim/baseline.json`) une fois les cibles tenues.

> ⚠️ **C'est le gros du travail** : le code du directeur est modéré ; l'effort réel est le **tuning itératif** (boucle `npm run sim -- …` / `sim:check`) pour retrouver « tendu mais gagnable » sur un arc 2× plus long.

---

## Flux de données (par pas fixe)

`runSpawns(dt, elapsed)` → `waveDirector.step({ dt, elapsed, ramp, players, rng: waveRng })` → décide accalmie vs événement (+ règles réactives) → produit des spawns `{x,y,type,behavior,bAngle?,bPhase?}` → `spawnEnemy()` pose l'ennemi **avec son `behavior` + état seedé**. Puis, chaque pas : `slowSystem` → `enemyAiSystem` (dispatch behavior → `velocity`) → `movementSystem` (`pos += vel·dt`). Aucune boucle rendu changée : `hordeRenderer` continue d'observer positions/type.

## Déterminisme

- **Nouveau flux `waveRng`** (dérivé `seed ^ CONST`, comme `chestRng`) : les tirages du directeur **ne décalent pas** les flux existants (`rng` spawn/upgrade, `lootRng`, `chestRng`, `prisonerRng`) → seuls les **motifs de spawn** changent (qu'on re-baseline), pas le reste.
- Tous les comportements/événements/règles réactives = **fonctions pures** de `(état, elapsed, waveRng)`. Zéro `Math.random`/`Date`. Même seed + mêmes inputs → **run identique** (vérifié par `sim:check` rejouant les seeds).

## Tests & équilibrage

**Vitest (unités pures) :**
- Comportements : `zigzag` borné (|offset| ≤ A) + déterministe (même seed → même trajectoire) ; `circler` converge vers l'anneau à `bAngle` ; `sweep` va tout droit ; `charger` respecte la séquence approche→télégraphe→dash→récup (timers) ; défaut `chase` byte-identique.
- Directeur : **conservation du budget** (Σ spawns sur fenêtre ≈ rampe plate, à ε près) ; sélection d'événement déterministe + distribution des poids sur un grand échantillon ; formations produisent les bons comptes/positions ; **anti-camping** déclenche sous le seuil et respecte le cooldown (déterministe).
- Isolation RNG : le `waveRng` ne perturbe pas les autres flux (test « listes loot/chest identiques avec/sans directeur »).

**Harness sim (`npm run sim` / `sim:check`) :** boucle de tuning itérative pour tenir les **cibles re-dérivées (arc 20 min)** puis **re-baseline**. C'est le cœur de l'effort.

**e2e (seam) :** une capture golden montrant un **encerclement** et une **traversée** déclenchés (via `getState()` : positions/behaviors exposés) → lisibilité, pas de crash, `advanceTime` déterministe.

**Playtest = oracle final** du « ça a du rythme / la run de 20 min respire ».

## Déroulé (golden-first, YAGNI)

1. **Socle** : champ `behavior` + dispatch `enemyAi` + les 5 comportements (avec tests). `chase` défaut inchangé → sim toujours verte à ce stade.
2. **Directeur** : `waveDirector` + `waveEvents` + les 5 formations + conservation de budget, branché sur `runSpawns`, **sur 1-2 stages golden**. Valider ressenti + sim.
3. **Réactif** : anti-camping.
4. **Arc 20 min** : étendre rampe/courbe/boss + mini-boss événements + **re-tune + re-baseline** (le gros).
5. **Déroulé** : régler les **poids d'événements par phase** sur les 10 stages (data-only).

## Fichiers touchés (indicatif)

- `src/core/types.ts` — `EnemyBehavior` + champs `behavior/bPhase/bAngle/bMode/bTimer` sur `EnemyComp`.
- `src/core/systems/enemyAi.ts` — dispatch + 5 comportements purs.
- `src/core/systems/waveDirector.ts` *(nouveau)* — cadence, budget, formations, réactif.
- `src/core/simulation.ts` — brancher le directeur dans `runSpawns` + `waveRng` ; boss final @20:00.
- `src/core/systems/spawn.ts` — poser `behavior` + état seedé au spawn ; helper `spawnGroup`.
- `src/content/enemies.ts` — `behavior?` sur `EnemyDef` + constantes de tuning des comportements.
- `src/content/waveEvents.ts` *(nouveau)* — pool pondéré d'événements par phase (+ règles réactives).
- `src/content/spawnRamp.ts` — rampe + courbe étendues à ~20 min.
- `src/content/config.ts` — timings boss (final @~20:00), seuils anti-camping.
- `tools/sim/targets.ts` + `tools/sim/baseline.json` — cibles re-dérivées + re-baseline.
- (rendu : aucun changement d'API ; VFX de télégraphe du charger = option hors cœur.)

## Risques / points ouverts

- **Tuning 20 min** : risque principal (arc 2× plus long = espace de tuning plus grand, cibles à recalibrer). Mitigé par le golden-first (mécanique validée à durée actuelle avant d'étendre — mais l'utilisateur a choisi « tout dans ce lot », donc on itère au harness).
- **Perf horde** : les événements créent des **pics de spawn** ; le plafond d'entités existant (~cap) et le budget conservé bornent le total. Vérifier `fps-horde` reste vert.
- **Lisibilité DA** : `charger` (télégraphe) et `sweep` doivent rester lisibles sans nouveaux assets ; un VFX léger de télégraphe (option) aide mais reste hors cœur.
