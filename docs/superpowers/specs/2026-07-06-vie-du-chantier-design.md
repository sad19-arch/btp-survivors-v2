# « La vie du chantier » — Design / Spec

**Date :** 2026-07-06
**Branche cible :** `feat/stage-life` (sur `feat/stage-identity`)
**Statut :** design validé (brainstorming) → prêt pour `writing-plans`.

## But

Rendre chaque stage **vivant** et **inciter à explorer** le grand monde (10240×7680). Trois
composants indépendants, thématiquement unifiés :

- **A. Prisonniers ×5** éparpillés loin — risque/récompense (soin), moteur d'exploration.
- **B. PNJ d'ambiance MOBILES** (4-5/stage) qui *travaillent* et *râlent* quand le joueur glande.
- **C. Mini-carte** bas-gauche pour repérer prisonniers / boss / coffres.

**Décisions utilisateur (brainstorming) :**
- Assets PNJ = **uniques par stage** (~4-5 PNJ métier/stage, feuilles animées PixelLab).
- Prisonniers = **éparpillés loin, +30% maxHp chacun, pas de plafond** (le trajet est le prix) ; re-tune sim.
- Mini-carte = **joueur + prisonniers + boss + coffres**, **masquable (toggle)**.

## Contraintes globales (impératives — cf CLAUDE.md)

- **Séparation sim/rendu.** A = `src/core`/`src/content` (pur, déterministe, RNG seedé, zéro Phaser/DOM,
  zéro `Math.random`/`Date`). B = `src/render` (observer-only, cosmétique). C = `src/ui` (overlay DOM `h()`).
  Flux : `input → core → app → render/ui`. **`sim:check` DOIT rester VERT** (A re-tuné/re-baseliné ; B/C = diff 0).
- **DA 16-bit stricte** : palette `src/ui/palette.ts`, panneaux pixel, **pas** d'emoji/glow/gradient/coins arrondis,
  **pas** de `innerHTML` interpolé (helper `h()`). Bulles = pixel DA.
- **Contrôle total manette + clavier** : le toggle mini-carte passe par `src/input` ; focus visible non requis
  pour un simple toggle mais aucune fonction ne doit exiger la souris.
- **Zéro `any` dans `src/core`**, TS strict, ESLint 0 warning.
- **Assets** : suivre le skill `assets` (source PixelLab, prompt global, calibration `player_j1`, golden-batch
  d'abord, `npm run assets:qa` 0 erreur — **le garde-fou détourage anti-fond-opaque est actif**).
- **Texte in-game en français.**
- Gates par tâche : `type-check` + `lint` + `test` (Vitest) + **`sim:check`** + `test:e2e` + `assets:qa`.
- Pas de push sans feu vert.

---

## Composant A — Prisonniers ×5 (cœur)

### Fichiers
- `src/content/config.ts` — objet `RESCUE`.
- `src/core/simulation.ts` — `spawnPrisoner()` → `spawnPrisoners()` ; compteur de sauvetages ;
  `collectPrisoners()`/`getState` (exposer `rescue: { total, rescued }`).
- `src/core/systems/rescue.ts` — soin fractionnaire.
- `src/core/types.ts` — `AppViewState.rescue` (ou équivalent).
- Tests : `tests/unit/rescue.test.ts` (+ `sim` harness re-baseline).

### Détail
- **`RESCUE`** :
  ```ts
  export const RESCUE = {
    radius: 64,
    healFraction: 0.30,   // 30% du maxHp du libérateur (remplace `heal: 40` plat)
    count: 5,             // 5 prisonniers/run
    distMin: 1600,        // éparpillés LOIN du centre (monde 10240×7680)
    distMax: 3800,
    fleeSpeed: 260
  } as const
  ```
- **`spawnPrisoners()`** : boucle `count` fois, **positions seedées déterministes** via `this.prisonerRng` :
  angle de base seedé `a0`, puis prisonnier `i` à l'angle `a0 + i*(2π/count) + jitter` (jitter seedé ±20°),
  distance seedée dans `[distMin, distMax]`. Clamp au monde avec marge 80. → 5 directions distinctes,
  reproductibles. Chaque prisonnier = entité `position` + `prisoner {freed:false}` (inchangé).
- **`rescueSystem`** : `health.hp = min(maxHp, hp + round(maxHp * RESCUE.healFraction))`. Reste : fuite vers
  le bas, despawn hors-monde, `freed.push(pos)` pour la façade (étincelles + bulle « Merci ! »).
- **Compteur** : `simulation` incrémente `rescuedTotal` à chaque libération ; `getState` expose
  `rescue: { total: RESCUE.count, rescued: rescuedTotal }` (pour la mini-carte « X/5 »).
- **Re-équilibrage** : mesurer `sim:check` après le passage à 5×30%. Les bots (greedy/kite) ne détournent pas
  vers des prisonniers lointains → impact probablement faible. Si les cibles bougent, re-tune la rampe de
  difficulté puis **re-baseline** (garder « tendu mais gagnable »). Gate = `sim:check` VERT.

### Tests (Vitest, pur)
- 5 prisonniers spawnés (déterministe : même seed → mêmes positions).
- Éparpillement : chaque prisonnier à `dist ≥ distMin` du centre ; angles distincts (pas deux dans le même secteur).
- Soin = `round(maxHp*0.30)`, borné à `maxHp`.
- `getState().rescue` = `{ total:5, rescued }` cohérent après libérations.

---

## Composant B — PNJ mobiles + bulles râleuses (rendu, cosmétique)

### Fichiers
- `src/render/stages.ts` — `StageRender.ambient` : **`StageAmbient` → `StageAmbientNpc[]`**.
- `src/render/ambientNpc.ts` (NOUVEAU) — errance déterministe pure + tir de bulle pur (testables).
- `src/render/scenes/GameScene.ts` — remplace le PNJ statique unique par la gestion d'un **groupe** de PNJ
  (placement seedé anti-chevauchement, anim d'activité, errance, bulles poolées).
- `src/content/phrases.ts` (ou constante render) — pool des répliques râleuses (FR).
- Tests : `tests/unit/ambientNpc.test.ts` + `tests/e2e/ambient-bubbles.spec.ts`.

### Détail
- **Type** :
  ```ts
  interface StageAmbientNpc extends StageEnemySprite {   // key,file,frame,scale
    behavior: 'work' | 'patrol'   // 'work' = activité sur place + micro-shuffle ; 'patrol' = ronde lente
    framePeriodMs?: number
    count?: number                // instances (défaut 1)
  }
  // StageRender.ambient?: StageAmbientNpc[]   (4-5 entrées/stage)
  ```
  Les 10 stages : migrer le PNJ unique actuel vers un tableau (au minimum l'existant → `[{...}]`), enrichi au
  déroulé assets.
- **Placement** : seedé (`resolvePlacement` anti-chevauchement, hors rayon spawn, près des zones de travail
  via `geometry`), reproductible. Chaque PNJ a une **ancre**.
- **Mouvement cosmétique déterministe** (`ambientNpc.ts`, pur) :
  `ambientOffset(seed, elapsedMs, behavior): {dx, dy}` — petit déplacement borné autour de l'ancre
  (`work` : rayon ~24px, lent ; `patrol` : rayon ~120px, ronde). Combinaisons de sinus seedées → **aucun RNG
  runtime, aucune dépendance sim**, reproductible. Rendu observer-only (comme l'anim de l'`ambientSprite` actuel).
- **Bulles râleuses** (`ambientNpc.ts` pur + `GameScene`) :
  - Pool FR (constante) : `['Arrête de glander !', 'Va bosser !', "T'en as pas marre de prendre des pauses ?", 'Tu veux aller manger ?']`.
  - Déclenchement : joueur (le plus proche, depuis `getState().players`) à `dist ≤ BUBBLE_RADIUS` (~150px) d'un PNJ.
  - **Anti-spam** : cooldown par PNJ (~4 s) ; au max ~1-2 bulles visibles simultanément (pool + throttle).
  - Réplique tirée **seedée par PNJ** (`pickPhrase(seed): string`, pure) → reproductible.
  - Rendu : bulle **pixel DA** (panneau + ergot, palette `palette.ts`) avec le texte de la réplique (police
    pixel/texte stylé DA), `depth` au-dessus des sprites, fade court. Pas d'emoji, pas d'`innerHTML`.
- **Assets = uniques par stage** (choix user) : 4-5 PNJ métier/stage, feuilles animées PixelLab
  (`create_character` + `animate_character`, activité lisible : creuser / tirer câble / porter / plaquer / peindre…),
  calibrés `player_j1`, style global. **Golden 1 stage d'abord** (capture validée) puis **déroulé 10 stages**
  (pipeline subagents, recette dédiée type `docs/stage-premium-recipe.md`). `assets:qa` 0 err (garde-fou détourage).

### Tests
- Vitest pur : `pickPhrase(seed)` déterministe + dans le pool ; `ambientOffset` borné + déterministe ;
  proximité → bubbleActive vrai (logique de déclenchement pure).
- e2e (seam) : bootstrap stage, `setInput` fait marcher le joueur près d'une ancre PNJ connue, `advanceTime`,
  assert qu'une bulle apparaît (marqueur render exposé ou événement).

---

## Composant C — Mini-carte (UI)

### Fichiers
- `src/ui/minimap.ts` (NOUVEAU) — construction + mise à jour du panneau (`h()`), mapping monde→panneau (pur).
- `src/ui/styles.ts` — styles `.minimap*` (DA pixel, bas-gauche).
- `src/ui/overlay.ts` — instancier/rafraîchir la mini-carte ; visibilité liée à l'état app.
- `src/input/*` + couche app — action **toggle** mini-carte (clavier `M` + bouton manette Back/Select).
- Tests : `tests/unit/minimap.test.ts` (mapping pur) + `tests/e2e/minimap.spec.ts`.

### Détail
- **Panneau** bas-gauche, pixel DA (bordure noire, ombre décalée, palette), taille ~200×150 px. **Ne recouvre
  pas** le bandeau d'inventaire (haut-gauche).
- **Mapping pur** : `worldToMinimap(x, y, worldW, worldH, mapW, mapH): {mx, my}` (fonction pure testable).
- **Contenu** (depuis `getState()`, throttlé ~toutes 4 frames) :
  - **Joueur(s)** : chevron à la couleur du joueur (coop-ready, `players[]`).
  - **Prisonniers non libérés** : petit marqueur cage (jaune sécurité) ; disparaît à la libération ;
    **compteur `rescued/total`** (ex. « 2/5 ») affiché sur le panneau.
  - **Boss** : marqueur rouge quand un boss est présent (`enemies[].isBoss`).
  - **Coffres** : marqueur or (`pickups[].type === 'coffre'` — cf `PickupKind` / `simulation.ts`).
- **Toggle** : action `toggleMinimap` (clavier `M` + bouton manette), gérée via `src/input` + état app
  `minimapVisible` (défaut : visible). N'interfère pas avec le `FocusModel` des menus.
- **DA-safe**, `h()` uniquement, pas d'emoji.

### Tests
- Vitest : `worldToMinimap` (coins, centre, clamp) ; marqueurs dérivés d'un `AppViewState` mock (bon nombre de
  prisonniers/boss/coffres).
- e2e (seam) : mini-carte présente en jeu ; toggle la masque/affiche ; marqueurs prisonniers = 5 au départ,
  compteur `0/5` puis décroît après libération.

---

## Séquencement (livrer + valider tôt)

1. **A — Prisonniers ×5 + rebalance** (cœur ; validé par Vitest + `sim:check`).
2. **C — Mini-carte** (s'appuie sur `getState` ; sert immédiatement à repérer les prisonniers).
3. **B — Code PNJ mobiles + bulles** avec les PNJ **existants** (migration `ambient` → tableau) — gameplay
   complet sans attendre les assets.
4. **B — Golden asset 1 stage** (4-5 PNJ métier animés) → **validation capture** → **déroulé 10 stages**.

→ Le gameplay (prisonniers, bulles, mini-carte) tombe avant la grosse génération d'assets.

## Hors périmètre

- Pas d'interaction avec les PNJ (les répliques sont du flavor ; « Tu veux aller manger ? » ne déclenche rien).
- Pas de pathfinding des PNJ (errance cosmétique bornée).
- Pas de méta-progression liée aux sauvetages.
- Brouillard de guerre / révélation progressive de la mini-carte (tout est montré d'emblée = repérage assumé).

## Oracle final

Playtest utilisateur : le chantier se sent-il **vivant** (PNJ qui bossent et râlent) et la mini-carte
**incite-t-elle à explorer** pour libérer les prisonniers ? Gates verts à chaque tâche.
