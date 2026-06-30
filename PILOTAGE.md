# 🎮 Piloter BTP Survivors depuis Claude Code (sans terminal)

> **Ce fichier est ton poste de pilotage.** Tu n'as jamais besoin d'ouvrir un terminal : tu écris à Claude Code en langage naturel, **il lance les commandes** (tests, build, git, génération d'assets…), valide, et te rend compte. Garde ce fichier ouvert et tiens à jour le **§10 Journal de bord** au fil des sessions.

**Prompt pour démarrer chaque session** (à coller en premier) :

> « Lis `PILOTAGE.md` et `CLAUDE.md`, fais le point sur où on en est, et propose-moi la prochaine étape. »

---

## 1. Où en est le projet

- **Genre** : Vampire-Survivors-like, monde **chantier/BTP**, DA 16-bit arcade. Cibles : PC + manette Xbox/clavier d'abord, borne ensuite, mobile en backlog.
- **Reconstruction propre** d'un prototype (le design était bon, le code mauvais).
- **Fait** : tranche **« MVP jouable »** — boucle complète **Titre → Jeu → Pause/Upgrade → Game Over** : déplacement, 3 armes (cloueur, scie orbitale, marteau), ennemis + spawn, XP/niveaux/6 upgrades, mini-boss à 5:00, navigation 100 % manette/clavier, écrans DOM 16-bit, score.
- **Qualité** : ~102 tests unitaires + ~11 tests e2e (navigateur), type-check & lint stricts verts.
- **Livraison** : branche `feat/mvp-jouable` poussée, **PR #1** ouverte vers `main`.
- **Reste (backlog)** : tuning d'équilibrage, **assets pixel-art** (production visuelle), coop 2-4, méta-progression, mode Stage complet, autres phases/armes/ennemis. Voir **§7**.

---

## 2. Comment continuer — tu parles, Claude exécute

**Règle d'or** : tu décris l'**objectif** ; Claude s'occupe du terminal, du plan, du TDD, de la validation et du commit. Tu n'as qu'à relire et valider. Pour toute tâche de code, Claude **propose un plan et attend ton accord** avant de coder.

| Je veux… | Dis à Claude Code… |
|---|---|
| Voir le jeu tourner | « Lance le serveur de dev et montre-moi des captures du titre et d'une partie. » |
| Tout vérifier | « Vérifie que tout est vert : type-check, lint, tests unitaires et e2e. » |
| Comprendre une partie du code | « Explique-moi comment marche le système d'XP / les armes / les écrans. » |
| Ajouter une feature | « Ajoute *(décris la feature)*. Fais un plan, attends mon accord, puis TDD + validation + commit. » |
| Régler l'équilibrage | « La partie est trop dure au début. Ajuste et **prouve-le avec le harness `sim`** (avant/après). » |
| Corriger un bug | « *(décris le bug)*. Trouve la seed qui le reproduit, corrige, ajoute un test de régression. » |
| Générer un asset | « Génère *(ex. l'ennemi enemy_stage01_imp_rubalise)*. **Demande-moi d'abord la source** (CC0 / PixelLab / je fournis). » |
| Sauvegarder le travail | « Commit ce qu'on vient de faire (message clair). » |
| Partager / livrer | « Pousse la branche et ouvre/mets à jour la PR vers main. » |
| Reprendre plus tard | « Mets à jour le Journal de `PILOTAGE.md` avec ce qu'on a fait aujourd'hui. » |

> Tu **n'as pas besoin de connaître les commandes** ci-dessous : Claude les lance pour toi. Elles sont listées au **§4** juste pour information.

---

## 3. Carte du projet (où est quoi)

```
src/
  core/        # CŒUR de jeu, TypeScript pur (zéro Phaser/DOM) — logique, déterministe
    systems/   # 1 système = 1 fichier (mouvement, armes, collisions, XP, spawn…)
    simulation.ts  # la "partie" : avance le temps, expose l'état
  content/     # DONNÉES typées : armes, ennemis, upgrades, phases, config d'équilibrage
  app/         # App-shell (écrans), boot, seam de test (window.__GAME__)
  input/       # clavier + manette Xbox → intents
  ui/          # overlay DOM (HUD, menus), palette 16-bit, helper h()
  render/      # Phaser : dessine l'état du cœur (ne contient pas de logique)
tools/
  sim/         # harness headless "Claude joue" (npm run sim)
  assets/      # QA des assets (npm run assets:qa)
tests/
  unit/        # Vitest (logique, headless)
  e2e/         # Playwright (vrai jeu, headless)
docs/
  asset-manifest.md   # spec complète de la création visuelle (DA)
public/        # assets (player_j1.png = référence visuelle)
```

Pointeurs clés :
- **`CLAUDE.md`** — les règles d'architecture et de qualité (Claude les suit automatiquement).
- **`docs/asset-manifest.md`** — tout le process de création visuelle (formats, prompts, nommage, ennemis/props par stage).
- **`.claude/skills/`** — `play-to-validate` (comment Claude valide en jouant) et `assets` (comment Claude crée un visuel).

---

## 4. Comment Claude valide (tu n'as rien à taper)

Principe : **« Claude joue pour valider »** — une tâche n'est pas finie tant qu'elle n'est pas prouvée en jouant. Quand tu dis « prouve-le », Claude lance l'outil adapté et te montre la sortie :

| Tu demandes | Claude lance (pour info) | Ce que ça prouve |
|---|---|---|
| « Fais tourner le jeu » | `npm run dev` + captures | rendu réel, écrans |
| « Vérifie la logique / l'équilibrage » | `npm run sim -- --seed 42 --bot kite` | survie, niveau, boss, invariants |
| « Lance les tests » | `npm run test` (unit) + `npm run test:e2e` | systèmes + vrai jeu |
| « Vérifie la qualité » | `npm run type-check` + `npm run lint` | types stricts, 0 warning |
| « Valide les assets » | `npm run assets:qa` | dimensions/transparence/nommage |
| « Prépare une build » | `npm run build` | build de prod |

---

## 5. Le seam de test (juste pour comprendre)

Le jeu expose son état et accepte des commandes via `window.__GAME__` (activé en dev/test). C'est ce qui permet à Claude de **jouer le vrai jeu sans regarder les pixels** : `getState()` (état JSON, dont `screen` et `menu`), `setInput/advanceTime` (déterministe), `nav/confirm/back/start/pause/chooseUpgrade` (traverser les écrans). Tu n'as rien à en faire ; c'est l'outil de Claude.

---

## 6. Création d'assets (direction artistique)

Le process est câblé (voir `docs/asset-manifest.md` + skill `assets`). Points à retenir côté pilotage :
- **Référence visuelle** = `public/player_j1.png` (planche 768×768 = 4×4 frames 192×192). Tout se calibre dessus.
- **Claude te demande la source à CHAQUE asset** : réutiliser un CC0 (Kenney) / **générer via PixelLab** / tu fournis. Pas de génération surprise.
- On produit **par petit lot** (golden batch d'abord), jamais tout d'un coup, puis stage par stage.

Prompts utiles :
- « Lance le **golden batch** (Batch 0) : montre-moi un sprite test d'abord pour valider le style. »
- « Génère le **tileset de sol du stage 01** via PixelLab, puis passe la QA et montre-moi une planche. »

---

## 7. Backlog / prochaines étapes (coche au fur et à mesure)

- [ ] **Production visuelle — Golden Batch** → « Lance le golden batch, un sprite test d'abord. »
- [ ] **Tuning d'équilibrage** (la run doit être survivable et fun 6-8 min) → « Équilibre la difficulté avec le harness sim, montre-moi les courbes avant/après. »
- [ ] **Coop locale 2-4** (revive, HUD multi, manettes) → « Ajoute la coop 2 joueurs. Plan d'abord. »
- [ ] **Mode Stage complet** (10 phases = 10 missions) → « Implémente le mode Stage avec objectifs/médailles. Plan d'abord. »
- [ ] **Méta-progression** (cartes/passifs complets, monnaie, arbre) → « Plan pour la méta-progression. »
- [ ] **Contenu** : autres phases de chantier, armes, ennemis, boss → « Ajoute la phase *terrassement* (ennemis + tileset). »
- [ ] **Audio** (SFX arcade, voix d'événements rares) → « Ajoute l'audio minimal du MVP. »

---

## 8. Conventions essentielles (résumé)

Claude les applique seul ; bon à savoir :
- **Texte du jeu en français** (termes chantier).
- **Cœur de jeu déterministe** (même seed = même partie) ; logique séparée du rendu Phaser.
- **100 % manette + clavier**, focus visible, zéro souris obligatoire (PRD).
- **DA 16-bit stricte** : palette imposée, panneaux pixel ; interdits : glow/gradients/emojis dans l'UI.
- **Data-driven** : l'équilibrage vit dans `src/content` (pas en dur dans le code).

Détails complets : **`CLAUDE.md`**.

---

## 9. Git & livraison (Claude s'en charge)

- Branche de travail : `feat/mvp-jouable` → **PR #1** vers `main`.
- Tu peux demander : « commit », « pousse », « ouvre/mets à jour la PR », « fusionne la PR dans main », « crée une nouvelle branche pour *(feature)* ».
- Claude ne pousse/commit **que si tu le demandes**.

---

## 10. Journal de bord (à tenir à jour)

> Demande à Claude « **mets à jour le Journal** » en fin de session. Format : date — ce qui a été fait — décisions — prochaine étape.

- **2026-06-30 — Tranche MVP jouable + process asset.**
  - Fait : progression XP/niveaux/6 upgrades, 3 armes (cloueur/scie/marteau), mini-boss 5:00, input manette+clavier, écrans DOM 16-bit, seam étendu. Process de création visuelle câblé (manifest + skill + `assets:qa`). 102 unit + 11 e2e verts.
  - Décisions : PC/manette d'abord ; DA 16-bit appliquée dès maintenant (assets plus tard) ; production visuelle repoussée ; PR #1 ouverte.
  - Prochaine étape : au choix — golden batch visuel, tuning d'équilibrage, ou une feature du backlog (§7).

- **(prochaine session) — …**
  - Fait :
  - Décisions :
  - Prochaine étape :
