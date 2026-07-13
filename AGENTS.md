# AGENTS.md

Guide pour Codex (Codex.ai/code) sur ce dépôt. **Ces instructions priment sur le comportement par défaut.**

## Aperçu

**BTP Carnage** est un jeu web type *Vampire Survivors* dans un monde de **chantier/BTP** : on survit à des vagues d'ennemis bureaucratiques (administration, inspections, non-conformités) à travers le **cycle de vie d'un chantier**. Reconstruction propre d'un prototype précédent : le *design* était bon, le *code* mauvais.

- **Cibles** : **PC navigateur + manette Xbox / clavier en priorité** (PRD) ; **borne/salon** (plein écran, manettes, multi local 2-4) ensuite ; web mobile/tactile en backlog (le modèle d'input ne doit pas l'empêcher).
- **Pas de marque Once For All** : la couche marketing/pédago (CTA conformité, QR, quiz contextualisé) est **hors périmètre**. Le thème chantier, lui, reste l'identité du jeu.
- **Colonne vertébrale = le cycle de chantier** : 10 phases ordonnées (`terrain_vierge → terrassement → fondations → réseaux enterrés → gros œuvre → échafaudages → charpente → second œuvre → finitions → livraison/audit`). C'est le squelette commun au mode Stage (1 phase = 1 mission) **et** au mode survie (le chantier « progresse » dans le temps).

## Règles d'architecture (impératives)

1. **Séparation sim / rendu.** Toute la logique de jeu vit dans `src/core` (TypeScript pur). **`src/core` n'importe JAMAIS Phaser ni le DOM.** Phaser (`src/render`) ne fait qu'observer l'état du `World` et dessiner.
2. **Déterminisme.** Dans `src/core` et `src/content` : **interdit** `Math.random()`, `Date.now()`, `new Date()`. Utiliser le `Rng` à seed (`src/core/rng.ts`) et le `FixedClock` (`src/core/clock.ts`). Même seed + mêmes inputs ⇒ même partie. (Vérifié par ESLint.)
3. **ECS-lite data-oriented.** Entités = id ; composants = données pures ; systèmes = fonctions sur le `World` à chaque pas fixe. Un fichier = une responsabilité. Pas de god object.
   - 🚫🔴 **`GameScene` N'EST PAS UNE POUBELLE — INTERDICTION D'Y AJOUTER DES ÉLÉMENTS PAR DÉFAUT.** Toute nouvelle responsabilité de rendu (synchro d'entités, VFX, caméra, bulles, séquences, HUD in-canvas, effets…) va dans un **module dédié** de `src/render/` (ex. `hordeRenderer.ts`, `vfxManager.ts`, `cameraController.ts`, `speechBubbleManager.ts`, `playerRenderer.ts`) que `GameScene` **instancie et à qui il DÉLÈGUE** (`this.x.sync(state, …)`). **On ne garde dans `src/render/scenes/GameScene.ts` QUE ce qui ne peut structurellement PAS vivre ailleurs** : les hooks de cycle de vie Phaser (`init`/`preload`/`create`/`update`) et le câblage/délégation. **Avant d'écrire quoi que ce soit dans `GameScene`, la question par défaut est « dans quel module ça va ? » — la réponse n'est JAMAIS « dans GameScene » sauf preuve du contraire.** (Historique : `GameScene` a dérivé en god object de ~1900 lignes ; c'était *la raison* de la refonte propre — **ça ne doit PLUS JAMAIS se reproduire**.)
4. **Prêt-N-joueurs.** Les entités portent un `playerId`/`ownerId`. **Jamais** de `player1`/`player2` codés en dur, même en solo.
5. **Data-driven.** Armes, ennemis, upgrades, phases = données typées validées au boot (`src/content`). Pas de logique par-entité copiée-collée.
6. **Typage strict.** `tsconfig` strict + ESLint strict (`no-explicit-any` = erreur). **Zéro `any` dans `src/core`.**
7. **UI componentisée.** Pas de `innerHTML` interpolé (helper `h()` dans `src/ui/h.ts`). L'overlay DOM (HUD, menus) passe par la couche `src/ui`.
8. **Contrôle total (PRD, bloquant).** 100 % des écrans/menus jouables **manette Xbox One ET clavier**, **focus visible** partout, **aucune fonction n'exige la souris**. Toute UI navigable passe par la couche `src/input` (router pur `routeInput`) + le `FocusModel` (`src/ui/focusModel.ts`) ; **jamais** d'écouteur clavier ad hoc dans un écran.
9. **DA 16-bit stricte (PRD).** Palette imposée = source unique `src/ui/palette.ts` ; style **panneaux pixel** (coins carrés, bordures noires, ombre portée décalée). **Interdits UI** : glassmorphism, gradients modernes, glow excessif, coins arrondis, **emojis dans l'UI**, `innerHTML` interpolé. (Assets pixel-art = passe DA ultérieure, hybride Kenney/PixelLab.)

Flux de dépendances (jamais l'inverse) :
`input → core (sim) ← app (écrans/focus) → render (Phaser) / ui (overlay DOM)`

## ⚠️ Méthodo « Codex joue pour valider » (obligatoire)

Une tâche n'est **pas terminée** tant que tu ne l'as pas **validée en te mettant dans la peau du joueur**. La validation est *exécutable*, pas déclarative. Choisis l'outil selon le cas :

| Cas | Outil | Commande |
|---|---|---|
| Logique, équilibrage, régression de gameplay | **Sim headless déterministe** | `npm run sim -- --seed 42 --duration 300 --bot greedy` |
| Comportement d'un système isolé | **Vitest** | `npm run test` |
| Rendu réel, UX, HUD, inputs | **Playwright** (vrai jeu) | `npm run test:e2e` |
| Type / qualité | **tsc + ESLint** | `npm run type-check && npm run lint` |

- **Déterminisme** : pour reproduire un bug, relance la **même seed**. Deux runs même seed/inputs ⇒ états identiques.
- **Invariants** : le harness vérifie des assertions de cohérence (HP jamais négatif silencieux, pas de NaN, survie minimale attendue, plafond d'entités…). Un invariant rouge = tâche non validée.
- Suis le skill **`play-to-validate`** (`.Codex/skills/play-to-validate/`) pour la procédure détaillée.

### Le « seam » de test (`window.__GAME__`) — construit en premier, pas en dernier

Playwright voit le DOM, **pas l'intérieur du `<canvas>`**. Tester par screenshots = fragile/lent/cher. Ce qui rend un jeu canvas testable par une IA, c'est un **seam** : le jeu **expose son état en JSON** et **accepte des commandes déterministes**. On le construit dès le premier prototype jouable.

Contrat exposé sur `window` (activé en dev/test, **strippé en prod**) :

```ts
window.__GAME__ = {
  ready: boolean,                  // true quand l'app est prête (scène montée)
  getState(): AppViewState,        // état COMPLET en JSON (décider sans regarder l'écran)
  renderToText(): string,          // vue texte pour "jouer à l'aveugle"
  advanceTime(ms): void,           // avance N frames de façon déterministe (pas de sleep réel)
  setInput(playerId, input): void, // injecte les commandes (move/attack) sans toucher au clavier
  setSeed(seed): void,             // fixe le RNG
  // navigation des écrans (manette/clavier simulés, sans pixels) :
  nav(dir): void,                  // 'up' | 'down' | 'left' | 'right' → déplace le focus
  confirm(): void, back(): void,   // valider / annuler l'item focalisé
  start(mode?): void,              // lancer une partie depuis le titre
  pause(): void, resume(): void, restart(): void,
  chooseUpgrade(index): void,      // choisir une carte de niveau (gel levé)
  events: EventTarget
}
```

`getState()` renvoie un `AppViewState` : tout l'état du jeu **plus** la couche écrans —
`scene`, `seed`, `elapsedMs`, `wave`, `score`, `coordSystem` (documenté : `origin top-left, +x right, +y down`), `players[]` (id, x, y, vx, vy, hp, maxHp, vigilance, **level, xp, nextThreshold**, alive, weapons), `enemies[]` (id, type, x, y, hp, isElite, isBoss), `projectiles[]` (les lames de scie y figurent), `pickups[]` (id, x, y, type, value), `pendingLevelUp` ({ playerId, choices[] }), **`screen`** (`title|game|paused|upgrade|gameover`) et **`menu`** (`{ screen, items[{id,label,hint}], index }` ou `null` en jeu). Le temps est **gelé** tant que `pendingLevelUp` est non nul (le seam choisit la carte) ou hors écran de jeu.

Règles non négociables liées au seam :
- **Boot direct par URL** : `?autostart=solo&level=1&seed=123` saute les menus, démarre la partie, émet `ready`. (`?test=1` active aussi le seam.)
- **Gating** : activer le seam via `import.meta.env.DEV` ou `?test=1`. **Jamais** `process.env.NODE_ENV` (undefined dans un bundle Vite → hooks morts).
- **Input par API**, pas par coordonnées/synthèse de touches : `setInput(1, { move:{x:0,y:-1}, attack:true })`.
- **État renvoyé, pas seulement loggé** : `getState()` retourne un objet ; pas de `console.log` comme seule vérité.
- **Logique pure** (spawn math, formules de dégâts, courbe d'XP, loot, conditions d'évolution) = fonctions pures sans Phaser, testées en Vitest sur **le vrai code de prod** (pas de recalcul des formules dans le test → fausse confiance).

Stratégie à 2 étages :

| Étage | Outil | Teste | Vitesse |
|---|---|---|---|
| 1. Logique pure | Vitest (`happy-dom`) + harness `npm run sim` | formules, systèmes, FSM sur le vrai code | ms, headless |
| 2. Jeu réel | Playwright **via le seam JSON**, **toujours en headless** | boucle réelle : `getState()` → `setInput()` → `advanceTime()` → réobserver ; assertions sur l'**état**, pas les pixels | secondes |

Screenshots/vision : réservés à la **régression visuelle** (le HUD est là, le menu s'affiche), pas à la vérification de gameplay.

Ne déclare jamais « ça marche » sans avoir lancé l'une de ces commandes et constaté le résultat.

## Workflow assets (DA = pilier produit)

Process complet : **`docs/asset-manifest.md`** + **skill `assets`** (`.Codex/skills/assets/`). Le suivre **avant toute création/génération/intégration d'asset visuel**.

Points clés (le skill détaille) :
- **Source de vérité visuelle** = `public/player_j1.png` (planche 768×768 = 4×4 de frames 192×192, `down/right/up/left`, ~99 px en jeu). Tout perso/ennemi se calibre dessus (silhouette compacte, lisible en 2 s, contour sombre, 16-bit arcade).
- **À CHAQUE besoin d'asset, demander la source** : CC0 (Kenney) / génération **PixelLab (MCP)** / fourni par l'utilisateur. **Jamais de génération silencieuse** (quota).
- **Golden batch d'abord**, puis **stage par stage** ; jamais tout d'un coup. Préfixer le **prompt global PixelLab** (manifest §3) à chaque génération.
- **QA automatisée** : `npm run assets:qa` (dimensions, transparence, nommage) ; valider par **planche récap**, pas fichier par fichier.
- **Pas de mélange DA** : ne pas mêler nouveaux assets PixelLab et anciens LPC/Kenney dans une build de validation DA (ancien = placeholder technique).
- Nommage : `enemy_stageXX_nom_walk_192.png`, `tile_stageXX_nom_32.png`, `ui_nom.png`, etc. (manifest §6). Les assets vivent dans `public/`. Conserver l'attribution CC0.

## Commandes

```bash
npm run dev          # serveur de dev (http://localhost:3000)
npm run build        # type-check + build de prod
npm run type-check   # tsc --noEmit
npm run lint         # ESLint strict (0 warning toléré)
npm run test         # Vitest (cœur, sans navigateur)
npm run test:e2e     # Playwright (vrai jeu)
npm run sim          # harness de simulation headless déterministe
npm run assets:qa    # QA des assets (dimensions/transparence/nommage)
```

## Conventions

- **Texte in-game en français** (termes chantier : conformité, attestation, etc.).
- Alias d'import : `@/*`, `@core/*`, `@content/*`, `@render/*`, `@input/*`, `@ui/*`, `@platform/*`.
- Temps : **ms** partout sauf le temps écoulé exposé en secondes.
- Pas de commit/push sans demande explicite ; brancher avant de committer sur `main`.

## Périmètre MVP (PRD)

1 perso · 1 niveau (terrain vierge) · **3 ennemis** (petit rapide / moyen standard / gros lent) · **3 armes** (cloueur projectile, scie orbitale, marteau de zone) · **6 upgrades** · **mini-boss à 5:00** · run 6-8 min · écrans **Titre / Pause / Upgrade / Game Over** · 100 % manette + clavier. Hors MVP : coop 4 joueurs, mobile complet, méta-progression, succès, 10 stages, boss final.

## État du projet

Reconstruction en cours — **tranche « MVP jouable » faite** : boucle complète Titre→Game Over (progression XP/niveaux/upgrades, 3 armes, mini-boss, navigation manette/clavier, écrans DOM 16-bit). Tests : ~99 Vitest + ~11 Playwright (headless), harness `npm run sim`. Backlog : tuning d'équilibrage, assets pixel-art (passe DA), coop 2-4, méta-progression, mode Stage complet, autres phases/armes/ennemis.
