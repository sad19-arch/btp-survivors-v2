# Plan CO-1 — Fondation d'entrée multi-joueur (4 manettes → 4 joueurs)

> **Pour agents :** SOUS-SKILL REQUIS : superpowers:subagent-driven-development. Committer sur `feat/weapon-system-core` (CO-1 empile sur le trunk courant — le `GameScene` cible dépend de `getStateForFrame`/`frameId` (B2) et de la structure GameScene B2/B3, absents de `main`). Pas de push sans feu vert.

**Goal :** rendre `?autostart=coop4` réellement jouable — 4 manettes (+ clavier pour P1) pilotent 4 joueurs indépendants — en refondant `src/input` en modèle par-joueur + multi-manette, sans toucher le cœur déterministe.

**Architecture :** couche input/render uniquement. Le sim est déjà N-joueur (`spawnPlayers`, armes/XP/pickups/collision itèrent sur tous), le seam `setInput(playerId)` déjà N-joueur. On supprime l'effondrement sur P1 (`intents.ts:22` `setInput(1)` en dur + `getPad(0)` unique) et on route par joueur.

## Global Constraints

- `src/core`/`src/content` **non touchés** (déterminisme préservé ; la lecture périphérique est un bord render non-déterministe toléré ; sim déterministe donné les `setInput`). `getState()` inchangé. `sim:check` doit rester **inchangée** (diff 0).
- **Un seul chemin d'input** : l'ancienne fusion mono-joueur + `setInput(1)` en dur est SUPPRIMÉE dans le même changement (pas de second chemin résiduel — piège n°2 de l'ancien projet).
- **Boucler sur le nombre de joueurs** ; jamais de branches par-index déroulées P1/P2/P3/P4. Zéro `any`, pas de `!` non-null, TS strict.
- **Solo strictement inchangé** : P1 = clavier ⊕ manette 0 fusionnés (comportement identique à aujourd'hui) → tous les tests solo restent verts.
- **Contrôle total maintenu** : les menus restent navigables (voir la correction « max(playerCount,1) » ci-dessous — sinon plus personne ne navigue au titre). Aucune fonction souris-only introduite.
- Gates par tâche : `type-check` + `lint` (0) + `vitest` + `playwright` + `sim:check` inchangée.

**⚠️ Correction contrôleur (bord titre) :** au titre/hors-jeu, `getState().players.length === 0`. Construire la map d'entrées pour `1..playerCount` laisserait la map **vide** → aucune navigation menu. Donc construire pour **`1..max(playerCount, 1)`** : P1 (clavier⊕pad0) est TOUJOURS présent et pilote les menus, même sans partie lancée.

---

## Task 1 — `GamepadInput` paramétré par index de pad (+ deadzone re-scale)

**Files :** Modify `src/input/gamepad.ts` ; Test `tests/unit/gamepad.test.ts` (nouveau — teste la fonction pure `applyDeadzone`).

- Constructeur `(plugin: Phaser.Input.Gamepad.GamepadPlugin, padIndex: number)`. `readFrame()` lit `this.plugin.getPad(this.padIndex)` au lieu de `getPad(0)`. `prev` reste par-instance. Pad absent → `{ move:{x:0,y:0}, pressed:[] }` (inchangé).
- Extraire une fonction pure exportée `applyDeadzone(value: number, deadzone: number): number` : `0` si `Math.abs(value) < deadzone`, sinon `Math.sign(value) * (Math.abs(value) - deadzone) / (1 - deadzone)`. L'utiliser pour `mx`/`my` (remplace le clamp brut `Math.abs(ax) > DEADZONE ? ax : 0`). Le stick atteint 1 au max.
- Rien d'autre ne change (mapping BTN, D-pad, fronts montants).

- [ ] Step 1 — Test `applyDeadzone` : `applyDeadzone(0.35, 0.35)===0`, `applyDeadzone(1, 0.35)≈1`, valeur médiane re-scalée > brut-clampé, signe conservé, sous-deadzone → 0.
- [ ] Step 2 — Vérifier l'échec (fonction absente).
- [ ] Step 3 — Implémenter `padIndex` + `applyDeadzone`.
- [ ] Step 4 — Gates : type-check + lint + `npx vitest run tests/unit/gamepad.test.ts` + suite complète. Commit.

**Produit :** `new GamepadInput(plugin, padIndex)` ; `applyDeadzone(value, deadzone): number`.

---

## Task 2 — Assemblage par-joueur pur : `buildPlayerInputs`

**Files :** Create `src/input/players.ts` (pur) ; Test `tests/unit/players.test.ts`.

**Interface :**
```ts
import type { FrameInput } from './intents'
export function buildPlayerInputs(
  keyboard: FrameInput,
  pads: ReadonlyArray<FrameInput>,   // pads[0..3], FrameInput vide si pad absent
  playerCount: number
): Map<number, FrameInput>
```
Règle (boucle `for (let id = 1; id <= Math.max(playerCount, 1); id++)`) :
- **id 1** = fusion `keyboard` + `pads[0]` : `move` = somme composantes clampée à [-1,1] ; `pressed` = union **dédupliquée** (Set) des deux.
- **id k ≥ 2** = `pads[k-1] ?? EMPTY` (FrameInput vide si absent).
- Fonction de fusion réutilisable `mergeFrames(a, b): FrameInput` (clamp move, union pressed).
Pur, déterministe, aucun accès Phaser.

- [ ] Step 1 — Tests : solo (`playerCount=1`) → `{1: kb⊕pad0}` ; `playerCount=0` → **encore** `{1: kb⊕pad0}` (grâce à `max(,1)`) ; coop4 avec 4 pads distincts → 4 entrées moves distincts, id1 = fusion ; pad manquant → entrée vide ; dédup `pressed` (kb 'down' + pad0 'down' = un seul 'down').
- [ ] Step 2 — Vérifier l'échec.
- [ ] Step 3 — Implémenter `buildPlayerInputs` + `mergeFrames`.
- [ ] Step 4 — Gates. Commit.

**Produit :** `buildPlayerInputs(keyboard, pads, playerCount): Map<number, FrameInput>`.

---

## Task 3 — `routeInput` par-joueur + navigation menu agrégée

**Files :** Modify `src/input/intents.ts` ; Test `tests/unit/routeInput.test.ts` (étendu).

- Nouvelle signature : `routeInput(app: App, perPlayer: ReadonlyMap<number, FrameInput>): void`.
  - Déplacement : pour chaque `[playerId, frame]` de `perPlayer`, `app.setInput(playerId, { move: frame.move, attack: false })`.
  - Menu : réunir tous les `frame.pressed` de toutes les entrées dans un **Set** (dédup), puis pour chaque action piloter `app.nav/confirm/back/togglePause` UNE fois. (« N'importe quel joueur navigue le menu partagé » ; dédup = pas de double-cran.)
- **Supprimer** l'ancien corps mono-joueur (`app.setInput(1, …)` + boucle sur `frame.pressed`).

- [ ] Step 1 — Tests (App coop construite comme dans `app.test.ts`) : `routeInput(app, new Map([[1,{move:{x:1,y:0},pressed:[]}],[2,{move:{x:-1,y:0},pressed:[]}]]))` puis `advanceTime` → `players[0].vx>0`, `players[1].vx<0`. Menu : map `{1:{move,pressed:[]},2:{move,pressed:['down']}}` déplace le focus d'un cran ; `{1:pressed:['down'],2:pressed:['down']}` → un seul cran (dédup). Cas solo `{1:…}` conservés.
- [ ] Step 2 — Vérifier l'échec (signature changée).
- [ ] Step 3 — Implémenter.
- [ ] Step 4 — Gates. Commit.

---

## Task 4 — Câblage `GameScene` : 4 pads + lecture par-joueur

**Files :** Modify `src/render/scenes/GameScene.ts`.

- `create()` : remplacer l'unique `this.gamepadInput` par un tableau `this.gamepads: GamepadInput[]` = `[0,1,2,3].map((i) => new GamepadInput(this.input.gamepad, i))` (garder la garde `if (this.input.gamepad !== null)`). Conserver `this.keyboardInput`.
- Nouvelle méthode privée `readPlayerInputs(playerCount: number): Map<number, FrameInput>` : lit `keyboardInput.readFrame()` (ou frame vide si null) + `this.gamepads.map((g) => g.readFrame())`, appelle `buildPlayerInputs(kb, pads, playerCount)`.
- `update()` (bloc `if (!this.testMode)`) : lire l'état une fois (déjà fait via `getStateForFrame(this.app.frameId)` en tête d'`update`), `const playerCount = st.players.length` ; `routeInput(this.app, this.readPlayerInputs(playerCount))` ; puis `this.app.advanceTime(...)` inchangé.
- **Supprimer** l'ancien `readInput()` (fusion mono-frame) — plus aucun appelant après cette tâche.

- [ ] Step 1 — Implémenter le câblage (pas de Vitest Phaser ; couvert par tâches 2-3 + Task 5).
- [ ] Step 2 — Gates : type-check + lint + `npx vitest run` (suite complète verte) + `npx playwright test` (24/24 maintenu — le solo réel passe toujours). Commit.

---

## Task 5 — Validation multi-joueur (seam) + solo non-régressé + gates finaux

**Files :** Create `tests/e2e/coopInput.spec.ts` (ou étendre `seam.spec.ts`).

- **Seam N-joueur** : boot `?autostart=coop4&seed=1&test=1&lite=1`, `waitForFunction ready`, `setInput(1,{move:{x:1,y:0}})`, `setInput(2,{move:{x:-1,y:0}})`, `setInput(3,{move:{x:0,y:1}})`, `advanceTime(600)` → lire `getState().players`, assert positions/vx/vy **distinctes et cohérentes** par joueur (P1 vers +x, P2 vers −x, P3 vers +y). Prouve le contrat par-joueur bout-en-bout (indépendant des vraies manettes).
- **Solo non-régressé** : suite existante verte (`routeInput`/`app`/`screens`/`seam` solo).
- **Checklist manuelle multi-pad** (non automatisable en CI — aucun test gamepad, comme l'ancien projet) → écrite dans le rapport : 2 manettes branchées + `?autostart=coop` → pad0 pilote P1, pad1 pilote P2, indépendamment ; chaque pad navigue les menus (pause).
- **Gates finaux :** `npm run type-check` + `npm run lint` (0) + `npx vitest run` + `npx playwright test` (vert, dont `coopInput.spec.ts`) + **`npm run sim:check` INCHANGÉE (diff 0)**.

---

## Vérification finale

Revue finale (modèle le plus capable) : un seul chemin d'input (ancien supprimé), boucle sur joueurs (pas de per-index), solo byte-identique, menu nav toujours dispo au titre (`max(,1)`), core non touché (sim:check diff 0). Jouer-pour-valider seam coop4. Pas de push sans feu vert.

## Hors périmètre CO-1 → Plan CO-2 (coquille couch)

Sélecteur « Joueurs ◄ N ► » au titre (mode dérivé) ; **revive** (à terre → coéquipier maintient A à proximité, barre décroissante, ~50 % PV, game-over si tous à terre) ; caméra centroïde + zoom-par-écartement (paliers, lerp) + tether souple ; HUD multi (PV/niveau + couleur par joueur : 1 bleu/2 rouge/3 vert/4 orange) ; skins P2-4 (recolors `player_j1`, script, zéro PixelLab) ; fix `handleChestPickups` (vrai ramasseur par ownerId) + cosmétiques P1-en-dur (halo évolution, orientation ennemis, intro) ; scaling difficulté par nb joueurs ; appropriation menu par écran (le joueur qui level-up choisit sa carte). Reporté : drop-in/press-to-join, multi-pad robuste (poll défensif/reconnexion), mobile/tactile.
