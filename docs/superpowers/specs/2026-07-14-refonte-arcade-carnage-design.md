# Refonte arcade « BTP Carnage » — Design

**Goal:** Refondre l'apparence de l'UI (menus, HUD, écrans) en style **arcade Metal-Slug 16-bit premium**, en RECRÉANT les écrans des maquettes `Menus BTP Survivors.dc.html` (planches 2a→2h) dans l'environnement du repo (TS strict + Phaser + couche DOM `h()` de `src/ui/overlay.ts` + `src/ui/styles.ts`), sans changer la logique de jeu.

**Source de vérité visuelle :** `Design menu BTP Carnage.zip` → `integration/design-ref/Menus BTP Survivors.dc.html` + `integration/CLAUDE-CODE-arcade.md` (roadmap) + `integration/pixellab-icons-brief.md`. Le zip est une **source d'intégration**, pas du code de prod.

**Origine :** roadmap « tour 2 » fournie par le créateur. Ce spec réorganise cette roadmap en phases exécutables, avec 2 décisions de cadrage tranchées (voir §Décisions).

## Garde-fous (bloquants, transverses à toutes les phases)

- **NE PAS toucher `src/core/**`** (sim déterministe, RNG, Vitest) ni `src/content/config.ts` (valeurs de gameplay) ni les clés de contenu (`weapons.ts`/`passives.ts`/`characters.ts`).
- **NE PAS changer `src/ui/palette.ts`** (palette imposée) ; les nuances arcade dérivées sont locales à `styles.ts`.
- **CONSERVER les noms de classes CSS** de `overlay.ts` (l'apparence se substitue sans toucher le DOM structurel).
- **UI/audio = cosmétique** : aucun impact sim. `sim:check` doit rester VERT (diff 0) — vérifiable par construction (aucune modif `src/core`).
- Gates par phase : `npm run type-check && npm run lint && npm run test` verts + `npm run build`. E2e (`npm run test:e2e`) et sim:check aux jalons.
- DA 16-bit stricte (CLAUDE.md §DA) : pas d'emoji UI, pas d'`innerHTML` interpolé (helper `h()`), coins carrés, panneaux pixel.
- **NE PAS déployer le `styles.ts` v1 du zip** : le `src/ui/styles.ts` du repo (678 l.) est déjà plus avancé que le v1 du zip (598 l.). On ÉTEND l'existant, on ne le remplace pas.

## Décisions de cadrage (validées avec le créateur)

1. **Co-op drop-in = LOBBY UNIQUEMENT.** La sim ne gère pas l'arrivée d'un joueur en cours de partie (`spawnPlayers()` une seule fois au reset, pas de late-join) et ajouter ça toucherait `src/core` (interdit). Donc : les manettes rejoignent J1→J4 via START **sur le lobby/écran de sélection** ; START de J1 lance le chantier. Aucune modif core.
2. **28 icônes PixelLab = phase dédiée** (golden batch → gate DA → 28 + QA + planche). Le jeu tourne déjà avec 42 stand-ins ; cette phase les remplace en vrai pixel-art 16-bit (brief `pixellab-icons-brief.md`).

## État actuel réconcilié (réduit le périmètre)

- **Rename → « BTP Carnage » : déjà fait** (`index.html <title>`, `overlay.ts` titre = commit `3b98712`). Reste : le **logo sculpté** arcade (2a), pas les chaînes.
- **Fontes** : Jersey 25 + Pixelify Sans déjà chargées (CDN, `index.html`). Ajout : Press Start 2P + VT323.
- **Écran `characterSelect` : existe déjà** (`app.ts`/`appState.ts`) → **restyle**, pas net-new.
- **Coffre/évolution + jackpot** : logique existante (`ChestOpenedEvent`/`EvolvedEvent`, overlay jackpot) → couche visuelle par-dessus.
- **Tactile + responsive** : `touch.ts`/`responsive.ts` existent → skin paysage = raffinement.

## Design tokens (repris de la maquette / arcade doc §2)

- **Polices** : `Jersey 25` (logo/titres) · `Pixelify Sans` 400–700 (corps/boutons) · `Press Start 2P` (badges/entêtes) · `VT323` (HUD/arcade monospace).
- **Couleurs arcade** (dérivées, LOCALES à `styles.ts`, sans toucher `palette.ts`) : jaune `#FFD24A` (clairs `#FFF4CC`/`#FFE9A8`) · orange `#E86F1F`/`#F26A22` (ombres `#C85A12`/`#9c440d`/`#6e2f08`/`#4a1404`) · rouge `#D83B2D` · contour `#101014` · bruns `#2B2018`/`#241C16`/`#17120E` · crème `#EAD9B8`/`#E8B27A` · cyan `#28B9D6`/`#7FC0FF` · vert `#3DDC84`.
- **Couleurs joueurs** (déjà dans `src/content/players.ts`) : J1 `#4aa3ff` · J2 `#ff5a5a` · J3 `#5ad25a` · J4 `#ffa64a`.
- **Cadre métal** : `metal_v.png` en fond + biseaux `inset … rgba(255,255,255,.14)` / `inset … rgba(0,0,0,.5)` + rivets. **CRT** : `repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 2px, transparent 2px 4px)`.
- Assets fournis (zip `public/`) : `metal_v.png`, `dither_light/dark.png`, `bg_dusk.png`, `casque.png` + 8 SFX UI + 40 icônes stand-in.

## Architecture / découpage en phases

Exécution **DA-first** : P0 pose les fondations partagées, les phases suivantes en héritent. Chaque phase = unité isolée, testable, commit(s) dédié(s).

### P0 — Fondations DA (socle partagé)
- **Fichiers** : `index.html` (+2 fontes), `src/ui/styles.ts` (tokens arcade + cadre métal/CRT raffinés), `src/ui/overlay.ts` (logo sculpté BTP/CARNAGE), assets → `public/` (metal_v, dither, bg_dusk, casque).
- **Contenu** : charger Press Start 2P + VT323 ; ajouter les tokens couleur/typo arcade dans `styles.ts` ; **logo sculpté** : topper `SUPER CHANTIER-001` + `BTP` (Jersey, or) au-dessus de `CARNAGE` (Jersey géant, `#F26A22`, pile de `text-shadow` biseau — cf. maquette) ; keyframe `slamIn` + `impactFlash` + `impactDust` ; raffiner cadre `.frame`/scanlines existants.
- **Validation** : type-check/lint/test/build ; capture visuelle du logo.

### P1 — Écran titre arcade (planche 2a) 🚦 gate DA
- **Fichiers** : `src/ui/overlay.ts` (`titlePanel`), `src/ui/styles.ts`, `src/app/app.ts` (attract timer).
- **Contenu** : habillage arcade — barre `1UP 001250 / HI-SCORE 028900 / 2UP 000000` (HI-SCORE en localStorage), `INSERT COIN` clignotant, `CREDIT 00`, bandeau `PUSH START` (tape jaune/noir animée), `© 2026 AIL ENTERTAINMENT` ; **attract mode** après ~15 s d'inactivité (blink `PUSH START`) ; décor sommaire (`bg_dusk` assombri + 2 silhouettes grue + 2-3 sprites `player_*` assombris). Le sélecteur « ÉQUIPIERS : N » est remplacé par le drop-in (P4).
- **Validation** : e2e/seam (menu title rendu, HI-SCORE persistant) + capture ; **🚦 gate DA user** sur le titre.

### P2 — Fix z-index level-up (planche 2d) — BUG
- **Fichiers** : `src/ui/overlay.ts`, `src/ui/styles.ts`.
- **Contenu** : **bug** — le toast « arme ramassée » s'affiche au-dessus des cartes de level-up. Fix : (a) modale level-up au-dessus (z-index) des toasts ; (b) **file de toasts suspendue** tant que la modale est ouverte (écoute `LevelUpEvent`), **flush** après le choix. Cartes plus grandes (icône ~150px, carte ~452×616), carte active dorée (dithering animé). `rollCards` (core) INCHANGÉ.
- **Validation** : test e2e/seam (spawn level-up + toast → assert ordre/visibilité) + capture.

### P3 — Sélection perso versus (planche 2b) — restyle
- **Fichiers** : `src/ui/overlay.ts` (rendu `characterSelect`), `src/ui/styles.ts`, `src/app/app.ts` (données affichées).
- **Contenu** : grille versus des **10 têtes** (crop frame 0 face de `player_<sheet>.png` : conteneur `overflow:hidden` + `<img>` positionné) ; panneau grand portrait + **nom** + **arme de départ** (`WEAPONS[startingWeapon].name` + `.description`) + **punchline** (table ci-dessous). AUCUNE stat inventée. Nav ◄►▲▼ + A (déjà routée). En co-op, un curseur par manette.
- **Punchlines** (arcade doc §2b) : ouvrier « Polyvalent, increvable. Cloue tout ce qui bouge. » · soudeur « Fait tourner ses lames, personne n'approche. » · macon « Béton dans les veines, marteau-piqueur en main. » · terrassier « Ouvre les hostilités au pied-de-biche. » · electricien « Envoie le jus. 380 volts dans la nuque. » · ouvriere « Charge la brouette et écrase tout devant. » · charpentier « Ses boulons ricochent de crâne en crâne. » · grutier « Étale du goudron brûlant sur leur passage. » · plombier « Sa clé revient toujours, comme un boomerang. » · samoyede « La mascotte. Mousse tout le monde à l'extincteur. »
- **Validation** : e2e/seam nav + capture.

### P4 — Co-op drop-in LOBBY (planche 2c)
- **Fichiers** : `src/input/*` (gamepad join), overlay lobby, `src/ui/styles.ts`. **Pas de `src/core`.**
- **Contenu** : sur le lobby, un gamepad qui presse **START** rejoint le prochain slot libre J1→J4 avec sa couleur `PLAYER_COLORS` ; `modeForCount(n)` reste la source du mode. UI 4 postes : `PRÊT` / `PRESS START` (clignotant) / `EN ATTENTE` (pas de manette). START de J1 lance. **Aucun join une fois la manche démarrée** (décision §1).
- **Validation** : e2e/seam (simuler join manette → mode/couleurs) + capture.

### P5 — Écran coffre / évolution (planche 2e)
- **Fichiers** : `src/ui/overlay.ts`, `src/ui/styles.ts` (+ rendu au reçu de `ChestOpenedEvent`/`EvolvedEvent` déjà émis).
- **Contenu** : à l'ouverture coffre / évolution — reveal rayons tournants + médaillon (icône arme, pop) + bannière `ÉVOLUTION !` + nom & description (`WEAPONS[evolvedId]`) + butin (`+OR`, `+SOIN`). Assets `pickups/crate.png` + `crate_open.png` existants. Couche visuelle only (events core inchangés).
- **Validation** : e2e/seam (déclencher évolution → bannière/médaillon) + capture.

### P6 — Skin mobile paysage (planches 2f/2g/2h)
- **Fichiers** : `src/input/touch.ts`, `src/ui/responsive.ts`, `src/ui/styles.ts`, `src/ui/overlay.ts`.
- **Contenu** : orientation **paysage** + hint « tourne l'appareil » si portrait ; **un stick virtuel gauche** (`touchMath` existant) + **tir auto** (les armes visent seules) ; HUD compact (PV/XP/timer/score, boss bar compacte, pause ≥44px, inventaire petites tuiles, mini-carte) ; cibles tactiles ≥44px ; level-up = 3 cartes plein-pouce.
- **Validation** : e2e paysage (Pixel 7 landscape) + mesure layout (cf. leçon HUD géant paysage) ; capture device recommandée.

### P7 — 28 icônes PixelLab (§5) 🚦 gate DA
- **Fichiers** : `public/stage01/ui/icon_<id>_64.png` (remplacement transparent des stand-ins), aucune modif code (loader `icon()` déjà branché).
- **Contenu** : via MCP **PixelLab** — **golden batch d'abord** (2-3 icônes calibrées `player_j1`/DA → 🚦 gate DA) puis les 28 icônes armes/passifs (64×64, transparent, brief `pixellab-icons-brief.md`, bloc de style préfixé) ; `npm run assets:qa` ; **planche récap** pour validation créateur. Portraits/pickups/projectiles existants : réutiliser, ne pas régénérer.
- **Validation** : `assets:qa` 0 erreur + planche récap + 🚦 gate DA user.

## Stratégie de test / validation (« Claude joue pour valider »)

- **Logique pure** : la sim ne change pas → `sim:check` VERT diff 0 (garanti par construction, aucune modif `src/core`). Vitest existant reste vert.
- **UI réelle** : e2e Playwright **headless via le seam** (`?test=1&lite=1`) — assertions sur l'état (`getState`/menu) et la présence des classes/écrans, pas les pixels. Le navigateur intégré ne peint pas ce jeu lourd → validation visuelle finale = capture Playwright / device.
- **Régression visuelle** : captures par écran (titre, sélection, level-up, coffre, mobile paysage).
- **Gates DA user** : P1 (titre) et P7 (icônes) — jalons bloquants où le créateur valide le rendu.

## Nettoyage

À la fin : supprimer le dossier `integration/` s'il a été déposé dans le repo (source d'intégration, pas du code). Ne pas committer les zips ni `terrain_vierge.json` (garde-fous session).

## Découpage en sous-plans (writing-plans)

Le périmètre (8 phases) est cohérent (une identité DA) mais volumineux. `writing-plans` produira le plan phasé ; si trop gros pour un seul document, découper en sous-plans exécutables : (A) P0+P1+P2 (fondations + titre + fix bug), (B) P3+P4+P5 (sélection + drop-in + coffre), (C) P6 (mobile), (D) P7 (icônes). Chaque sous-plan = logiciel testable de façon autonome.
