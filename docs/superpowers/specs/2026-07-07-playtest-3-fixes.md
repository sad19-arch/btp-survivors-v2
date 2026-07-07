# Playtest #3 — corrections & profondeur — Design

**Statut** : validé cadrage utilisateur (lot complet P0→P3 ; hordes = version ambitieuse « amplifier + télégraphe + nouvelles formations »).
**Branche** : `feat/playtest-3` (base `main` = `044fcc8`).
**Contexte** : 1er playtest humain de l'arc 20 min + directeur de vagues. 11 retours, root-causés (rapport d'exploration). La découpe GameScene n'a causé AUCUNE régression (câblage `sync()`/events intact).

## Fil rouge (le plus important)

Trois retours = **un seul** problème : **la boucle de puissance est inaccessible tôt**.
`cards.ts` tire 4 cartes dans un sac **plat non pondéré** → la montée de niveau d'une arme possédée sort ~1 fois sur 10 → aucune arme montée → aucune arme évoluable → le coffre (qui n'appelle que `tryEvolve`) **ne fait rien** faute d'arme prête → le fun (power fantasy) n'arrive qu'à ~9 min et le pic de 11 min cueille un joueur sans build. **Corriger la pondération des cartes est le levier le plus rentable de tout le lot.**

## Contraintes globales (BINDING — reprises du projet)

- **Sim déterministe pure** : `src/core`/`src/content` — jamais `Math.random`/`Date.now`/`new Date` ; RNG seedé uniquement. Nouveau tirage/aléa via un `Rng` seedé existant.
- **Séparation sim/rendu** : `src/core`/`src/content` n'importent jamais Phaser/DOM. Le rendu (télégraphe, aura, chevrons, PNJ) est **observateur** (`sync(state)`), délégué à des **modules dédiés** de `src/render` — **jamais** gonfler `GameScene` (règle CLAUDE.md 🔴).
- **`sim:check`** : toute modif touchant la sim (cartes, coffre, aimantation, formations, kills) doit rester **VERTE sur cibles re-dérivées** ; re-baseline seulement après avoir constaté les cibles tenues. Les changements purement rendu/UI ne touchent pas la sim (diff 0 attendu).
- **Zéro `any` dans `src/core`** ; TS strict ; ESLint strict (pas de `!`, `curly`, `noUncheckedIndexedAccess`).
- **Data-driven** : nouveaux poids/formations/seuils = données typées dans `src/content` (pas de magie en dur dans les systèmes).
- **DA 16-bit** : télégraphe/aura/chevrons respectent la palette `src/ui/palette.ts` (pas de glow moderne/gradient/emoji). Aura = liseré pixel net.
- Gates par tâche : `type-check` · `lint` · `test` (Vitest) · `sim:check` · `test:e2e`.

---

# P0 — Boucle de puissance (débloque le fun)

## P0.1 — Cartes de level-up pondérées (armes déjà possédées ↑)

**Fichiers** : `src/core/systems/cards.ts` (`rollCards`), `src/content/config.ts` (nouveaux poids), test `tests/unit/cards.test.ts`.

- Remplacer le Fisher-Yates plat de `rollCards` par un **tirage pondéré sans remise** (déterministe, `Rng` seedé). Chaque `Card` reçoit un poids selon son `kind` :
  - `weapon-up` / `passive-up` (déjà possédés, en progression) : poids **élevé** (`CARD_WEIGHT.ownedUp`, ~4).
  - `weapon-new` / `passive-new` (découverte) : poids **1** (`CARD_WEIGHT.new`).
- Algo : répéter `count` fois — tirer une carte proportionnellement à son poids parmi les restantes (roue pondérée seedée), la retirer du sac. Cartes distinctes garanties (sans remise).
- **Garde-fous** : (a) si des armes sont possédées mais non maxées, la probabilité d'en proposer au moins une doit être forte (test ci-dessous) ; (b) garder assez de `weapon-new` accessibles pour constituer un arsenal (early game). Les poids sont dans `config.ts` (`CARD_WEIGHT`) → re-tunables sans toucher au système.
- **Test** : sur un inventaire représentatif (1 arme niv 1 + 0 passif ; puis 2 armes + 1 passif), sur N seeds, l'offre de 4 cartes **contient une montée d'arme possédée dans ≥ ~70 %** des cas (vs ~40 % avant). Déterminisme conservé (même seed+inv ⇒ mêmes cartes). Ordre stable.

## P0.2 — Le coffre garantit toujours un effet : évolution OU carte au choix

**Décision utilisateur** : quand le coffre ne peut rien évoluer, il **ouvre un choix de cartes** (comme un level-up) plutôt qu'un effet automatique — plus de contrôle joueur, **réutilise le flux level-up existant** (écran de cartes + `chooseUpgrade` du seam + navigation manette/clavier), zéro nouvelle UI.

**Fichiers** : `src/core/simulation.ts` (`handleChestPickups`), le `tryEvolve` (localiser : appelé par `handleChestPickups`), `src/core/types.ts` (état/queue de choix), `src/content/config.ts` (secours tout-maxé), `src/ui/overlay.ts` (`showJackpot` pour le cas évolution), câblage `src/app` + `GameScene`. Tests unit.

- **Deux issues, toujours un effet** :
  1. Une arme est prête à évoluer → `tryEvolve` évolue (comportement actuel) + **bandeau jackpot** + voix d'évolution (voir P1.1).
  2. Aucune évolution possible → le coffre **pose un choix de cartes** en réutilisant le mécanisme `pendingLevelUp` (cartes **pondérées** P0.1, biaisées vers les montées d'arme). Le temps est **gelé** pendant le choix (comme un level-up) ; le joueur choisit via `chooseUpgrade(index)`, la carte s'applique.
- **Queue** : si un `pendingLevelUp` est déjà en cours (level-up même frame), le choix « coffre » se **met en file** derrière (réutiliser/étendre le mécanisme de file de `pendingLevelUp` existant — vérifier au plan comment les level-ups multiples sont empilés).
- **Secours tout-maxé** : si vraiment **aucune carte éligible** (tout maxé) ET pas d'évolution, effet garanti minimal : **soin** (`CHEST.fallbackHealPct`) ou **volée de gemmes** (`CHEST.fallbackGems`) — pour ne jamais avoir un coffre inerte.
- **Bandeau jackpot câblé** (cas évolution) : `overlay.showJackpot(label)` déclenché via un flag transitoire `justEvolved` dans `getState()` consommé par `overlay.sync` (voie **observateur**, cohérente avec l'archi overlay). Le cas « carte » n'a pas besoin de jackpot (l'écran de choix suffit).
- **Test** : coffre ramassé **sans arme évoluable** et inventaire non-maxé ⇒ `pendingLevelUp` devient non-null (cartes proposées) ; coffre **avec arme prête** ⇒ évolution + `justEvolved` posé une fois ; coffre **tout maxé** ⇒ effet de secours (soin/gemmes) déterministe.

## P0.3 — Les coffres ne sont plus aimantés

**Fichiers** : `src/core/systems/pickup.ts` (boucle d'aimantation), test `tests/unit/pickup*.test.ts`.

- Dans `pickupSystem`, **exclure `type === 'coffre'` de l'aimantation** (le joueur doit aller le chercher — c'est une décision, pas un ramassage passif). La **collecte au contact** reste (rayon de collision), seule l'**attraction à distance** est retirée pour les coffres.
- Déterministe, ~2 lignes. **Test** : un coffre à distance ≤ `pickupRadius` ne se déplace pas vers le joueur ; une gemme, si.

## P0.4 — Re-tune + re-baseline sim

**Fichiers** : `tools/sim/targets.ts` si besoin, `tools/sim/baseline.json`, `package.json` (inchangé).

- Les cartes pondérées **accélèrent la montée en puissance** → survie/win des bots vont bouger. Relancer `sim:check`, ajuster si une cible casse (viser à conserver l'intention arc 20 min : kite médiane ~13-16 min, win 25-40 %, campeurs punis). Re-baseline **après** cibles vertes. Documenter les nombres.
- Note : P0.3 (coffres non aimantés) change peu les bots (ils ne farmaient pas les coffres) ; P0.1 est le vrai mouvement.

---

# P1 — Bugs rapides

## P1.1 — Une seule voix par événement (fin du doublon level-up)

**Fichiers** : `src/audio/audioDirector.ts`, test unit ciblé (`audioDirector` a des tests purs).

- Cause : superposition de voix. `on('pickupCollected')` joue `VOICE.bonus` pour **tout** pickup non-xp (dont `'coffre'`), ET `on('evolved')`/le coffre joue une voix de récompense → 2 voix quasi simultanées. De plus vérifier le level-up strict (voix `upgrade` à l'entrée d'écran) ne se cumule pas avec une autre.
- Fix : **filtrer `'coffre'`** de la branche voix `pickupCollected` (le coffre a sa propre voix de récompense via l'event unifié P0.2) ; garantir **exactement une** voix par level-up (voix `upgrade` à l'entrée écran `'upgrade'`, rien d'autre). Ajouter un petit garde anti-chevauchement si deux voix seraient déclenchées dans la même frame (priorité : évolution > bonus > upgrade).
- **Test** : un ramassage de coffre ⇒ une seule voix ; un level-up ⇒ une seule voix.

## P1.2 — Prisonniers visibles & sauvables

**Fichiers** : diagnostic d'abord (capture) → `src/render/scenes/playerRenderer.ts` (`syncPrisoners`, depth/asset), éventuellement l'asset `public/*cage*`/`*prisoner*`, `src/content/config.ts` (`RESCUE.distMin/distMax` si spawn trop loin).

- Sim OK (spawn + `rescueSystem` + `getState().prisoners`), rendu câblé. Symptôme « cage vide » → hypothèses : (a) **asset cage opaque** masquant l'ouvrier (cage `depth 3` devant worker `depth 2`) ; (b) **spawn trop loin** (`RESCUE.distMin 1600` → 3800 px) → jamais rencontré ; (c) worker mal positionné/échelle.
- **Diagnostic obligatoire** : capture in-game (seam `?autostart=solo`) + inspection de l'asset cage (transparence entre barreaux). Puis fix ciblé : cage à barreaux transparents (ou worker rendu **devant** avec cage en surcouche), et/ou rapprocher le spawn pour qu'on croise les prisonniers. Prisonnier **lisible dans sa cage** et **sauvable** (soin 30 % au contact prolongé — mécanique existante).
- **Vérif** : capture montrant l'ouvrier dans la cage ; e2e `rescue`/`getState().prisoners` inchangé.

---

# P2 — Lisibilité des hordes (VS-style : amplifier + télégraphe + nouvelles formations)

Retour direct sur la feature livrée : « pas assez clair vs VS ; il manque l'encerclement complet, les ronds/rectangles nets, la densité qui varie ». Objectif : **une horde qu'on LIT** (on voit la forme se former, on comprend d'où ça vient).

## P2.1 — Amplifier les formations existantes (plus grosses, plus nettes, densité variable)

**Fichiers** : `src/content/waveEvents.ts` (`placeEvent` + tuning counts/rayons), `src/content/config.ts` (paramètres de densité), tests `tests/unit/waveEvents.test.ts`.

- **encircle** : anneau **complet, fermé et dense** (360° équirépartis, plus d'ennemis, rayon resserré cohérent) — pas un arc lâche.
- **sweep** : **mur solide** (ligne dense, ennemis serrés) qui traverse, pas une file éparse.
- **Densité variable** : introduire des variantes condensé ↔ aéré (paramètre de compacité par event) pour le contraste de rythme.
- **Formations plus grosses** : relever `countMin/countMax` des events de formation (le directeur **conserve le budget** → moins de filet de fond, plus de gros pics lisibles ; re-valider `sim:check`).

## P2.2 — Télégraphe visuel (on voit la horde arriver)

**Fichiers** : sim → `src/core/systems/waveDirector.ts` (planifier une formation ~0.6-1.0 s à l'avance + l'exposer), `src/core/types.ts`/`getState()` (liste `pendingFormations: { kind, angle, atMs }` ou event `formationTelegraph`), rendu → **nouveau module** `src/render/telegraphRenderer.ts` (observateur), câblé dans `GameScene`. Tests unit (déterminisme du planning) + e2e (télégraphe exposé dans getState).

- Le directeur **programme** une formation légèrement à l'avance et l'expose (position/kind/échéance). Le rendu affiche un **signal DA 16-bit** avant l'arrivée : marqueur au sol (arc/ligne selon la forme) et/ou **flèche de bord d'écran** pointant l'origine. ~0.6-1.0 s de préavis.
- **Déterministe** : le planning est piloté par le `waveRng` isolé ; le télégraphe ne change pas QUI/COMBIEN spawn, seulement le **moment exposé** (impact équilibrage nul → `sim:check` doit rester stable ; re-baseline si le léger décalage de timing bouge la baseline).
- **Perf** : le télégraphe = quelques Graphics/sprites poolés, bornés.

## P2.3 — Nouvelles formations VS-style

**Fichiers** : `src/content/waveEvents.ts` (nouveaux `WaveEventKind` + `placeEvent` cases), `src/core/types.ts` (si nouveau behavior), `src/content/enemies.ts` (tuning), pools `EVENT_POOL_BY_PHASE`, tests.

- Ajouter 2-3 patterns lisibles, ex. :
  - **spiral** : ennemis en spirale tournante qui se resserre.
  - **columns** (colonnes qui balaient) : 2-3 lignes verticales/horizontales qui traversent en parallèle (mur segmenté).
  - **concentric** (vagues concentriques) : 2 anneaux à rayons/délais différents (double encerclement).
- Déterministes (formations pures, `Rng` en argument). Intégrées aux pools par phase (identité tardive plus agressive). `sim:check` re-validé (budget conservé).

## P2.4 — Adoucir le pic ~11 min (après P0)

**Fichiers** : `src/content/spawnRamp.ts` (`difficultyScaleAt`/`SPAWN_RAMP`), re-tune sim.

- Une fois l'évolution accessible (P0), re-mesurer : si le mur ~11 min persiste, lisser la courbe localement. Tuning au harness (une variable à la fois), `sim:check` vert + re-baseline.

---

# P3 — Polish / features de lisibilité

## P3.1 — PNJ d'ambiance qui déambulent vraiment

**Fichiers** : `src/render/ambientNpc.ts` (rayon/mode), `src/content` (config PNJ des stages si besoin).

- Actuel : errance cosmétique de **±24 px** en mode `'work'` → « bouge sur place ». Faire **vraiment déambuler** : augmenter le rayon/l'amplitude (ex. `'work'` → parcours plus large, ou trajet lent entre points d'ancrage), garder déterministe (sinus/Lissajous seedé) et cosmétique (aucun impact sim). Rester lisible (le PNJ « travaille/circule », pas un ennemi).

## P3.2 — Mini-carte : chevron par joueur, couleur par joueur

**Fichiers** : le renderer de mini-carte (`src/render/*minimap*` ou `src/ui/*minimap*`), `PLAYER_COLORS`.

- Remplacer le **point vert** unique par un **chevron** (orienté selon la direction du joueur), **un par joueur**, **coloré par joueur** (`PLAYER_COLORS`). Observateur (lit `getState().players[]`). DA 16-bit (chevron pixel net).

## P3.3 — Ennemis élite identifiés (aura argentée)

**Fichiers** : **module rendu** (`src/render/scenes/hordeRenderer.ts` ou `vfxManager`), palette.

- Les élites (`getState().enemies[].isElite === true`, droppeurs de coffre) reçoivent une **aura/liseré argenté** (DA 16-bit, pas de glow moderne) pour être **reconnus en 1 s**. Observateur, borné (poolé). Aucun impact sim.

## P3.4 — Compteur d'ennemis tués au game over (par joueur → compétition)

**Fichiers** : `src/core` (attribution des kills par joueur), `src/core/types.ts` (`getState().players[].kills`), overlay game over (`src/ui/overlay.ts`), tests.

- Aujourd'hui `score` = **kills globaux** (`this.score += killed`). Pour la **compétition 2 joueurs**, attribuer chaque kill : l'ennemi mémorise `lastHitBy: playerId` (posé par le système de dégâts/collision d'arme), le reap incrémente `players[killerId].kills`. Exposer `kills` par joueur dans `getState()`.
- **Écran game over** : afficher les kills par joueur ; en multi, **winner/loser** (le plus de kills). Solo : total. DA 16-bit, `h()`.
- Déterministe (attribution dans la sim). **Test** : deux joueurs, kills attribués au bon `playerId` ; total = somme.

---

# Séquencement & vérification

Ordre : **P0** (puissance — débloque le fun, re-tune sim) → **P1** (bugs rapides) → **P2** (lisibilité hordes : amplifier → télégraphe → nouvelles formations, re-tune sim) → **P3** (polish). Chaque tâche a un livrable testable indépendamment.

- **Oracle logique/équilibrage** : `npm run sim` / `sim:check` (déterministe). Les tâches sim re-baseline après cibles vertes.
- **Oracle rendu/UX** : captures via le seam (`?autostart=solo&level=N`) — prisonniers visibles, télégraphe, aura élite, chevrons, jackpot. Régression visuelle = seul usage des pixels.
- **Oracle final = playtest utilisateur** : le fun arrive-t-il tôt ? les hordes se LISENT-elles (encerclement, murs, densité) ? le coffre est-il satisfaisant ? la compétition 2 joueurs fonctionne-t-elle ?

# Hors périmètre

- Refonte assets PixelLab (l'aura/chevron/télégraphe sont du rendu procédural DA, pas de nouveaux sprites — sauf si l'asset cage doit être régénéré pour la transparence, ponctuel).
- Nouveaux comportements d'ennemis au-delà de ceux requis par les nouvelles formations.
- Mode compétition dédié (le compteur de kills au game over suffit au MVP « winner/loser »).
