# Plan CO-2 — Coquille couch (le jeu vraiment jouable à 4)

> **Pour agents :** SOUS-SKILL REQUIS : superpowers:subagent-driven-development. Committer sur `feat/weapon-system-core` (empile sur CO-1, HEAD `c85eb42`). Pas de push sans feu vert.

**Goal :** rendre le 4-joueurs réellement jouable sur un canapé : choisir 1-4 joueurs au titre, voir les 4 joueurs cadrés (caméra de groupe) et distincts (couleur + skin), chacun avec son HUD, se relever entre coéquipiers, et un équilibrage qui tient à N joueurs. S'appuie sur CO-1 (4 manettes → 4 joueurs) déjà livré.

**Architecture :** UI/render pour l'écran + le cadrage + le HUD + les skins ; core (déterministe, pur) pour le tether, le fix chest, le scaling, le revive. Solo strictement inchangé (tout le neuf coop est no-op à `playerCount===1`) → `sim:check` reste VERTE inchangée.

## Global Constraints

- `src/core`/`src/content` purs (pas de Phaser/DOM/`Math.random`/`Date`). Zéro `any`, pas de `!` non-null. TS strict. DA 16-bit (`h()`/palette, pas d'emoji/gradient/rounded). 100 % manette+clavier (tout nouvel écran/HUD navigable, focus visible). Prêt-N-joueurs (boucler, pas de per-index).
- **Solo = no-op** pour tout le neuf coop (tether, revive, scaling, HUD multi) → `sim:check` diff 0. Bonnes pratiques reprises de l'ancien projet : couleurs par joueur cohérentes partout ; caméra centroïde + zoom-par-écartement (paliers, lerp) + tether « annuler la vitesse sortante » (pas de ressort) ; revive **gated par la proximité du bon joueur** (pas « n'importe quel A tenu »).
- Constante partagée **`PLAYER_COLORS`** (id 1..4 → { hex, num, name }) : 1 bleu, 2 rouge, 3 vert, 4 orange. Source unique, réutilisée HUD + tint sprite + halo revive.

---

## Task 1 — Sélecteur « Joueurs ◄ N ► » au titre

**Files :** `src/app/app.ts` (item titre + mode dérivé), `src/ui/overlay.ts` (rendu item), `src/content/config.ts` (helper `modeForCount`), tests `tests/unit/app.test.ts` + e2e `screens.spec.ts`.

- `App` : nouvel état `selectedPlayers: number` (1..4, défaut 1). `titleItems()` gagne un item `players` (après `jouer`/`stage`) ; `nav('left'/'right')` sur cet item décrémente/incrémente `selectedPlayers` dans [1,4] (même pattern que `cycleStage`). `start()` lance avec `modeForCount(selectedPlayers)` (`1→solo, 2→coop, 3→coop3, 4→coop4`), au lieu du mode de boot.
- Overlay : l'item affiche `Joueurs ◄ N ►` (libellé dynamique).
- Tests : `app.test` — item présent, left/right borne [1,4], `start()` lance le bon mode (players.length attendu) ; e2e — au titre, sélectionner 2 joueurs → `getState().players.length===2` après start.

**Deliverable :** lancer une coop depuis le titre, 100 % manette. (Le boot URL `?autostart=coop4` reste dispo.)

---

## Task 2 — Couleurs par joueur + HUD multi

**Files :** `src/content/players.ts` (nouveau, `PLAYER_COLORS`), `src/ui/overlay.ts` (HUD par joueur), `src/ui/styles.ts`, tests overlay.

- `PLAYER_COLORS: Record<1|2|3|4, { hex: string; num: number; name: string }>` (pur). Réutilisable render+ui.
- Overlay `syncHud` : si `players.length > 1`, afficher un **mini-HUD par joueur** (petite pastille couleur + PV + niveau), en plus/à la place du HUD solo. Solo (`length===1`) inchangé. `h()`/palette + `PLAYER_COLORS[id].hex`. Focus/lecture 16-bit, pas d'emoji.
- Tests : overlay avec 3 joueurs → 3 mini-HUD, couleurs distinctes, PV/niveau par joueur ; solo inchangé.

---

## Task 3 — Skins P2-4 (recolors de `player_j1`)

**Files :** `tools/assets/recolor-player.mjs` (nouveau, pngjs — cf. `recolor-gold.mjs`), génère `public/player_j2.png`/`j3.png`/`j4.png` (teinte casque/gilet vers la couleur joueur) ; `src/render/scenes/GameScene.ts` (skin par joueur) ; `src/render/sprites.ts` si besoin.

- Script : recolore la planche `player_j1.png` (768²) en décalant la teinte du gilet/casque vers `PLAYER_COLORS[id]` (bleu/rouge/vert/orange), en gardant le contour sombre. QA (`assets:qa`) + planche récap.
- GameScene : `walkTextureKey(playerId)`/`idleTextureKey(playerId)` (ou une map id→key) ; charger `player_j1..j4` (partagés) ; `syncSprites` choisit le sheet par `p.id`. Le skin doré (Konami) reste sur P1 uniquement.
- Validation : capture non-lite coop4 (4 couleurs distinctes à l'écran) + `assets:qa` 0 erreur.

---

## Task 4 — Caméra de groupe (centroïde + zoom-par-écartement)

**Files :** `src/render/scenes/GameScene.ts` (remplace `followLeader`).

- Remplacer le suivi de P1 par : **centroïde** des joueurs vivants (`centerOn(cx, cy)`) + **zoom par paliers** selon l'écartement max (`spread<200→1.5, <350→1.3, <500→1.2, else 1.0`), **lerpé** vers la cible (`Phaser.Math.Linear(zoom, target, 0.05)`/frame). Solo : centroïde = P1 (comportement ~identique). Render-only, pas de déterminisme.
- Validation : capture coop4 (4 joueurs cadrés) + solo inchangé (e2e vert).

---

## Task 5 — Tether souple (core, coop-only)

**Files :** `src/core/systems/tether.ts` (nouveau, pur), `src/core/simulation.ts` (appel), `src/content/config.ts` (rayon), tests `tests/unit/tether.test.ts`.

- `tetherSystem(world, playerCount, maxRadius)` : si `playerCount <= 1` → **no-op** (return). Sinon : centroïde des joueurs vivants ; pour chaque joueur au-delà de `maxRadius`, **annuler la composante radiale sortante de sa vitesse** (laisse-le glisser vers l'intérieur, pas de ressort). Déterministe, pur.
- `simulation.step` : appeler après le mouvement, avant les bounds. Solo → no-op → `sim:check` **diff 0**.
- Tests : 2 joueurs écartés au-delà du rayon → vitesse sortante annulée, vitesse rentrante conservée ; solo → aucun effet.

---

## Task 6 — Fix `handleChestPickups` (vrai ramasseur) + cosmétiques P1-en-dur

**Files :** `src/core/simulation.ts` (`handleChestPickups`), `src/core/systems/pickup.ts` si besoin (exposer le ramasseur), `src/render/scenes/GameScene.ts` (halo évolution sur le vrai joueur), tests.

- `handleChestPickups` : créditer l'évolution au **joueur qui a réellement ramassé le coffre** (par `ownerId`/proximité du pickup), pas P1 en dur. L'`EvolvedEvent` porte le `playerId` évolué ; `GameScene.onEvolved` pose le halo sur CE joueur (plus `players[0]`).
- Solo : un seul ramasseur → comportement identique → `sim:check` inchangée. Tests : en coop, coffre ramassé par P2 → l'arme de P2 évolue (pas P1).

---

## Task 7 — Revive (à terre → coéquipier relève)

**Files :** `src/core/types.ts` (état `downed` + input `action`), `src/core/systems/revive.ts` (nouveau, pur), `src/core/systems/gameRules.ts` (game-over), `src/core/simulation.ts` (câblage + `applyPlayerInputs` lit `action`), `src/input/intents.ts` (routeInput passe l'action A par joueur), `src/render/scenes/GameScene.ts` (barre de revive + rendu « à terre »), tests.

- **Entrée** : étendre `PlayerInput` avec `action: boolean` ; `routeInput` le remplit par joueur (A tenu → action, dérivé du `pressed`/held de la manette — attention : A en menu = confirm ; en jeu = revive). Le clavier P1 : une touche dédiée (ex. E).
- **État à terre** : quand `hp<=0` ET qu'il reste ≥1 joueur vivant → le joueur passe `downed` (immobile, ne tire pas, ramassable-relevable) au lieu de mort définitive ; si c'est le dernier debout → game-over.
- **`reviveSystem`** : pour chaque `downed`, si un coéquipier **vivant** est à portée `reviveRadius` ET tient `action`, accumuler la progression (décroît si personne à portée/tenant) ; à 100 % → relever à ~50 % PV. **Gated par la proximité du bon joueur** (pas « n'importe quel A »).
- **`allPlayersDead`** → « tous à terre/morts et aucun revive possible ».
- **Render** : barre de progression + halo `PLAYER_COLORS` au-dessus du joueur à terre ; sprite grisé/couché.
- Solo : jamais de coéquipier → jamais de revive → `hp<=0` = mort = game-over (identique) → `sim:check` inchangée. Tests : downed + coéquipier proche tenant action → relevé ; hors portée → décroît ; dernier joueur → game-over.

---

## Task 8 — Scaling difficulté par nombre de joueurs

**Files :** `src/content/spawnRamp.ts` / `src/content/config.ts` (facteur), `src/core/simulation.ts` (appliquer), tests + `sim:check`.

- Facteur `1 + (playerCount - 1) * k` (k à tuner, ex. 0.5-0.75) sur les PV ennemis (+ éventuellement densité) et PV boss. Solo (`n=1`) → ×1 → **inchangé** → `sim:check` diff 0. Coop → plus dur, à la mesure du nombre de joueurs.
- Tests : `n=1` → facteur 1 (sim:check inchangée) ; `n=4` → PV ennemis/boss scalés.

---

## Vérification finale

Revue par tâche + revue finale (modèle le plus capable). Jouer-pour-valider seam coop4 : 4 builds indépendants, revive fonctionnel, game-over quand tous à terre. Captures non-lite (4 couleurs cadrées, HUD multi, barre de revive). `sim:check` VERTE **inchangée** (tout le neuf coop est no-op en solo). Pas de push sans feu vert.

## Séquencement conseillé (valeur en premier)

T1 (titre) → T2 (HUD/couleurs) → T3 (skins) → T4 (caméra) = **coquille visible** (lancer 4p, tout le monde cadré, coloré, avec son HUD). Puis T5 (tether) → T6 (fix chest) → T8 (scaling) = **coop-correct**. Puis T7 (revive) = **profondeur** (la plus grosse tâche, en dernier). Chaque tâche livre du jouable ; on peut s'arrêter proprement après n'importe laquelle.

## Hors périmètre CO-2 → plus tard

Drop-in/press-to-join, multi-pad robuste (poll défensif/reconnexion/hot-plug), appropriation menu par écran (le joueur qui level-up choisit SA carte — CO-1 laisse « n'importe quel joueur navigue »), friendly-fire, XP partagé, mobile/tactile.
