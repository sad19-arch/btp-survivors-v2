# CLAUDE.md

Guide pour Claude Code (claude.ai/code) sur ce dépôt. **Ces instructions priment sur le comportement par défaut.**

## Aperçu

**BTP Survivors** est un jeu web type *Vampire Survivors* dans un monde de **chantier/BTP** : on survit à des vagues d'ennemis bureaucratiques (administration, inspections, non-conformités) à travers le **cycle de vie d'un chantier**. Reconstruction propre d'un prototype précédent : le *design* était bon, le *code* mauvais.

- **Cibles** : web grand public **mobile** (lien partagé) + **borne/salon** (plein écran, manettes, multi local 2-4).
- **Pas de marque Once For All** : la couche marketing/pédago (CTA conformité, QR, quiz contextualisé) est **hors périmètre**. Le thème chantier, lui, reste l'identité du jeu.
- **Colonne vertébrale = le cycle de chantier** : 10 phases ordonnées (`terrain_vierge → terrassement → fondations → réseaux enterrés → gros œuvre → échafaudages → charpente → second œuvre → finitions → livraison/audit`). C'est le squelette commun au mode Stage (1 phase = 1 mission) **et** au mode survie (le chantier « progresse » dans le temps).

## Règles d'architecture (impératives)

1. **Séparation sim / rendu.** Toute la logique de jeu vit dans `src/core` (TypeScript pur). **`src/core` n'importe JAMAIS Phaser ni le DOM.** Phaser (`src/render`) ne fait qu'observer l'état du `World` et dessiner.
2. **Déterminisme.** Dans `src/core` et `src/content` : **interdit** `Math.random()`, `Date.now()`, `new Date()`. Utiliser le `Rng` à seed (`src/core/rng.ts`) et le `FixedClock` (`src/core/clock.ts`). Même seed + mêmes inputs ⇒ même partie. (Vérifié par ESLint.)
3. **ECS-lite data-oriented.** Entités = id ; composants = données pures ; systèmes = fonctions sur le `World` à chaque pas fixe. Un fichier = une responsabilité. Pas de god object.
4. **Prêt-N-joueurs.** Les entités portent un `playerId`/`ownerId`. **Jamais** de `player1`/`player2` codés en dur, même en solo.
5. **Data-driven.** Armes, ennemis, upgrades, phases = données typées validées au boot (`src/content`). Pas de logique par-entité copiée-collée.
6. **Typage strict.** `tsconfig` strict + ESLint strict (`no-explicit-any` = erreur). **Zéro `any` dans `src/core`.**
7. **UI componentisée.** Pas de `innerHTML` interpolé. L'overlay DOM (HUD, menus) passe par la couche `src/ui`.

Flux de dépendances (jamais l'inverse) :
`input → core (sim) → render (Phaser) / ui (overlay DOM)`

## ⚠️ Méthodo « Claude joue pour valider » (obligatoire)

Une tâche n'est **pas terminée** tant que tu ne l'as pas **validée en te mettant dans la peau du joueur**. La validation est *exécutable*, pas déclarative. Choisis l'outil selon le cas :

| Cas | Outil | Commande |
|---|---|---|
| Logique, équilibrage, régression de gameplay | **Sim headless déterministe** | `npm run sim -- --seed 42 --duration 300 --bot greedy` |
| Comportement d'un système isolé | **Vitest** | `npm run test` |
| Rendu réel, UX, HUD, inputs | **Playwright** (vrai jeu) | `npm run test:e2e` |
| Type / qualité | **tsc + ESLint** | `npm run type-check && npm run lint` |

- **Déterminisme** : pour reproduire un bug, relance la **même seed**. Deux runs même seed/inputs ⇒ états identiques.
- **Invariants** : le harness vérifie des assertions de cohérence (HP jamais négatif silencieux, pas de NaN, survie minimale attendue, plafond d'entités…). Un invariant rouge = tâche non validée.
- **Hooks debug** (dev only, `window.__btp`) pour mettre le vrai jeu dans un état précis en E2E : `spawn`, `giveWeapon`, `setTime`, `seed`, `godMode`, `fastForward`.
- Suis le skill **`play-to-validate`** (`.claude/skills/play-to-validate/`) pour la procédure détaillée.

Ne déclare jamais « ça marche » sans avoir lancé l'une de ces commandes et constaté le résultat.

## Workflow assets

Assets = hybride **CC0 (packs Kenney)** + **génération pixel-art via MCP PixelLab**.

> **Règle : à CHAQUE besoin d'asset, demander à l'utilisateur la source** (réutiliser un CC0 existant / générer via PixelLab / fournir lui-même). **Jamais** de génération silencieuse.

Les assets vivent dans `public/`. Conserver l'attribution CC0. Conventions de nommage à définir avec le contenu.

## Commandes

```bash
npm run dev          # serveur de dev (http://localhost:3000)
npm run build        # type-check + build de prod
npm run type-check   # tsc --noEmit
npm run lint         # ESLint strict (0 warning toléré)
npm run test         # Vitest (cœur, sans navigateur)
npm run test:e2e     # Playwright (vrai jeu)
npm run sim          # harness de simulation headless déterministe
```

## Conventions

- **Texte in-game en français** (termes chantier : conformité, attestation, etc.).
- Alias d'import : `@/*`, `@core/*`, `@content/*`, `@render/*`, `@input/*`, `@ui/*`, `@platform/*`.
- Temps : **ms** partout sauf le temps écoulé exposé en secondes.
- Pas de commit/push sans demande explicite ; brancher avant de committer sur `main`.

## État du projet

Reconstruction en cours — **slice 1** (boucle solo minimale end-to-end). Voir le plan de reconstruction et le backlog de ré-intégration des features (coop, méta-progression, mode Stage complet, etc.).
