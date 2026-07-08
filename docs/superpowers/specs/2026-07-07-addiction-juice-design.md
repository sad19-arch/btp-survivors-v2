# Roadmap addiction — Pilier 1 « Juice immédiat » (design)

> Face « boucle immédiate » de la roadmap addiction (validée en plan-mode : *Pilier 2 = moteur méta complet*, *juice immédiat d'abord*). Ce document couvre **uniquement Pilier 1**. Pilier 2 (monnaie / boutique / déblocages / codex / high scores / écran de récompense de fin de run) est un lot ultérieur, hors périmètre ici.

## But

Rendre chaque instant de jeu **immédiatement satisfaisant** — combler les manques de *game-feel* que l'audit VS a relevés et que playtest-3 n'a **pas** déjà couverts : rythme early mou, barre XP sans vie, level-up sans « moment », coffre sans suspense, dégâts sans impact, évolutions opaques, fin de partie sans explosion. Objectif ressenti : « c'est jouissif tout de suite ».

## Périmètre (décision user : **Pilier 1 complet + re-tune**)

Les 8 items de Pilier 1, dont les 2 qui touchent l'équilibrage (rythme early + réactivation des drops soin/aimant). Le lot **re-baseline + re-tune la sim en fin** (ce n'est donc PAS un lot `sim:check` diff 0 comme l'écran de mort).

## Contraintes globales (impératives)

- **Séparation sim/rendu** : logique de jeu dans `src/core` (TS pur, zéro Phaser/DOM) ; rendu dans `src/render` (observe l'état) ; overlay DOM dans `src/ui` ; colle dans `src/app`.
- **Déterminisme** : dans `src/core`/`src/content`, **interdit** `Math.random`/`Date.now`/`new Date`. Les drops utilisent le `lootRng` seedé déjà en place. Toute nouvelle logique core = pure, testée sur le vrai code de prod.
- **`GameScene` n'est PAS une poubelle** : le screenshake va dans `cameraController.ts` (c'est du comportement caméra), les VFX dans `vfxManager.ts`. **Rien de neuf dans `GameScene`** hormis câblage/délégation.
- **DA 16-bit stricte** : palette `src/ui/palette.ts`, panneaux pixel, **emojis INTERDITS**, pas de `innerHTML` interpolé (helper `h()`). Le juice reste arcade, pas de glow moderne.
- **Contrôle total** : rien n'exige la souris ; les nouveautés d'UI restent navigables manette/clavier via `FocusModel`.
- **Typage** : zéro `any` dans `src/core`, TS strict, ESLint 0 warning.
- **Zéro nouvel asset** requis (tout est procédural CSS/Phaser). Si un besoin d'asset émerge, demander la source (skill `assets`) — pas de génération silencieuse.

## Deux natures de tâches (à ne pas mélanger)

| Nature | Effet sur `sim:check` | Tâches |
|---|---|---|
| **Observateur** (`src/render`/`src/ui`/`src/app`, lecture seule de l'état) | **diff 0** obligatoire | J1 (signal, lecture seule), J2–J7 |
| **Équilibrage** (`src/core`/`src/content`, change la trajectoire) | **diff attendu** (re-baseliné en J10) | J8, J9 |
| **Validation** | cibles VERTES avec **nouvelle** baseline | J10 |

**Ordre d'exécution** : toutes les tâches diff-0 d'abord (J1→J7, vérifiables contre la baseline actuelle intouchée), **puis** les 2 tâches d'équilibrage (J8, J9), **puis** J10 (re-tune + re-baseline). Ainsi chaque « diff 0 » se vérifie contre une baseline stable, et la divergence sim est isolée à la fin.

## Les tâches

### J1 — Signal « prête à évoluer » (core, lecture seule)
Fonction **pure** dans `src/core/systems/evolution.ts` : `evolutionStatuses(inv): EvolutionStatus[]` — pour chaque `EVOLUTIONS` dont l'arme `base` est possédée, renvoie `{ base, evolved, passive, baseLevel, reqBaseLevel, hasPassive, ready }` (`ready = baseLevel≥reqBaseLevel && hasPassive`). `App.getState()` enrichit chaque `InventoryEntry` d'arme d'un `evolveReady?: boolean` + `evolveHint?: string` (FR : « Prête à évoluer ! » / « Passif manquant : Air comprimé » / « Monte-la au max »). **Aucun** changement de comportement sim → diff 0.

### J2 — Barre XP animée (HUD, `src/ui/overlay.ts`)
La barre XP se remplit en douceur (lerp vers la cible) au lieu de sauter, + pulse/flash bref au passage de niveau (détection d'incrément de `level`). Helper pur `approach(current, target, dt)` testé. Observateur, diff 0.

### J3 — Reveal des cartes de level-up (`src/ui/overlay.ts` `upgradePanel` + styles)
Apparition **décalée** des cartes (stagger fade/slide via classes CSS + `animation-delay` par index) → le « Niveau supérieur ! » devient un moment. Pas d'emoji, DA respectée. Diff 0.

### J4 — Suspense avant le coffre (`src/ui/overlay.ts` `showJackpot`)
Beat d'anticipation (~0,5 s de « charge/tremble » du panneau) **avant** que la roulette démarre. Cosmétique (le jackpot ne gèle pas la sim). Diff 0.

### J5 — Screenshake (`src/render/scenes/cameraController.ts`)
Méthode `shake(intensityPx, durationMs)` + décroissance ; offset **pur** `shakeOffset(elapsedMs, durationMs, intensityPx)` (sinus amorti, **pas** de `Math.random`) → testable. Déclenché côté rendu quand les PV d'un joueur baissent d'une frame à l'autre (dégât), plus fort sur boss/gros dégât. Purement cosmétique (n'affecte pas `advanceTime`/l'état). Diff 0.

### J6 — Boom de mort + escalade late-game (`src/render/scenes/vfxManager.ts`)
`spawnDeathBoom(x, y, scale)` (pixel-pop poolé, DA-safe) à la mort d'un ennemi ; intensité/échelle qui **monte avec le temps écoulé** (fin de partie = plus explosif). Réutilise le pooling existant (perf : pas d'allocation par frame). Diff 0.

### J7 — Affichage « prête à évoluer » (inventaire HUD, `src/ui`)
Consomme `evolveReady`/`evolveHint` (J1) : marqueur/halo pixel sur l'arme prête dans le **bandeau d'inventaire existant** (pas de nouveau HUD) → les évolutions cessent d'être opaques. Diff 0.

### J8 — Rythme early plus vif (`src/content/spawnRamp.ts`) — *équilibrage*
Comprimer les paliers de début de `SPAWN_RAMP` (aujourd'hui 0→3000 ms, 45→2200, 100→1600) pour un démarrage plus nerveux (valeurs de départ ~2200/1800/1400, calées par J10). Pure data. **Diff sim attendu** — ne pas re-baseliner ici ; vérifier seulement l'absence d'invariant rouge (pas de NaN, survie plausible).

### J9 — Réactiver les drops soin/aimant (`src/content/config.ts` `PICKUP_DROPS`) — *équilibrage*
`heal.chance 0→~0.03`, `magnet.chance 0→~0.02` (valeurs calées J10). **`chest.chance` reste 0** (les coffres restent gérés par le directeur — on ne casse pas le renforcement intermittent). `applyPickup`/`maybeDropBonus` gèrent déjà ces types. **Diff sim attendu**.

### J10 — Re-tune + re-baseline (`tools/sim` + valeurs J8/J9)
Mesurer l'effet cumulé de J8+J9, ajuster les valeurs (et si besoin une pression late-game compensatoire) pour **ramener le win-kite dans la bande cible (25-40 %)**, `npm run sim -- --baseline save`, valider `sim:check` VERT, **rapporter les chiffres** (avant/après). Le user tranchera au playtest si la générosité résultante convient.

## Vérification
- Gates par tâche : `type-check` 0 · `lint` 0 · Vitest · `sim:check` (diff 0 pour J1–J7 ; diff attendu documenté pour J8–J9 ; VERT nouvelle baseline pour J10) · `test:e2e`.
- Revue whole-branch (opus) en fin de lot, puis feu vert user avant merge/push.
- **Oracle final = playtest** : « le jeu est-il jouissif tout de suite, et reste-t-il tendu ? »

## Hors périmètre
Pilier 2 (méta) entier. Nouveaux assets. Refonte de l'économie de coffres (intervalle/elite inchangés). Le son (sting coffre / level-up) — un pass audio séparé si le user le veut (l'audio a son propre `AudioDirector`).
