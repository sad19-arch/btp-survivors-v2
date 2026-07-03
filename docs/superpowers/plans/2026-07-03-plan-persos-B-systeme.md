# Plan Persos-B — Système de personnage + sélection par joueur (ossature)

> **Pour agents :** SOUS-SKILL REQUIS : superpowers:subagent-driven-development. Committer sur `feat/weapon-system-core` (HEAD 74b951e). Pas de push sans feu vert. **Gate `type-check` = `npm run type-check` (tsc), coller la sortie.**

**Goal :** l'ossature « personnages jouables » : un modèle `CharacterDef` (skin + arme de départ), une **sélection PAR JOUEUR** au lancement, le câblage core (chaque joueur démarre avec l'arme de SON perso) et le **swap de skin** par joueur au rendu. Validé de bout en bout avec les **armes existantes** + des skins **placeholder** (les vrais 10 skins = phase C, les 5 armes de plus = phase A). Solo comme coop.

**Contexte :** aujourd'hui tous les joueurs démarrent avec `STARTING_WEAPONS=['cloueur']` (`config.ts:109`, `spawnPlayers` `simulation.ts:450-451`) et le même skin `player_j1` (`SHARED_SHEETS`, `walkTextureKey()` scene-global). CO-2 a livré le sélecteur « Joueurs ◄ N ► », le rendu N-joueurs, l'identité couleur. On s'appuie dessus.

**Décision UX (ossature) : sélection SÉQUENTIELLE par joueur** (« P1, choisis ton perso » → confirme → « P2… »), qui réutilise le `FocusModel` unique existant. La sélection simultanée multi-curseurs (chaque pad son curseur) = polish ultérieur.

## Global Constraints
`src/core`/`src/content` purs/déterministes (pas de Phaser/DOM/`Math.random`/`Date`). Zéro `any`, pas de `!` non-null. TS strict. **Solo par défaut inchangé** : si aucun perso choisi → perso par défaut = ouvrier `player_j1` + `cloueur` → `sim:check` **diff 0**. DA 16-bit (h()/palette, focus visible, 100 % manette). Prêt-N-joueurs. `tsc` re-vérifié à chaque revue.

---

## Task 1 — Modèle `CharacterDef` + roster (contenu pur)

**Files :** `src/content/characters.ts` (nouveau), test.

- `export interface CharacterDef { id: string; name: string; sheet: string; startingWeapon: string; stats?: Partial<PlayerBaseStats> }` (`stats` optionnel = divergence future ; ignoré pour l'instant = swap pur).
- `export const CHARACTERS: Readonly<Record<string, CharacterDef>>` + `DEFAULT_CHARACTER_ID = 'ouvrier'`. Roster de l'ossature (mappé aux **5 armes existantes** + skin placeholder = `player_j1` en attendant la phase C) :
  - `ouvrier` (player_j1, cloueur) · `soudeur` (scie) · `macon` (marteau) · `terrassier` (pied_de_biche) · `electricien` (court_circuit). (5 persos distincts par arme ; les 5 autres arrivent avec la phase A/C.)
  - `sheet` pointe vers la clé de feuille (ex. `'player'` pour l'ouvrier ; les autres réutilisent `'player'` en placeholder jusqu'à la phase C qui livrera `char_soudeur.png` etc.).
- Helper `characterDef(id): CharacterDef` (fallback `DEFAULT`). Validation au boot (arme + sheet connus).
- **Test :** roster non vide, chaque `startingWeapon` ∈ `WEAPONS`, `characterDef(inconnu)===DEFAULT`.

---

## Task 2 — Câblage core : arme de départ par perso

**Files :** `src/core/simulation.ts` (`SimulationOptions`/`spawnPlayers`), `src/core/types.ts` (`PlayerState.characterId`), test.

- `SimulationOptions` gagne `characters?: readonly string[]` (index = playerId-1). `spawnPlayers` : pour le joueur `i` (1..count), `charId = characters?.[i-1] ?? DEFAULT_CHARACTER_ID` ; `char = characterDef(charId)` ; loadout initial = `[{ id: char.startingWeapon, level:1, cooldownLeftMs:0 }]` (remplace `STARTING_WEAPONS` global). Stocker `characterId` sur le composant `player` (nouveau champ) pour le rendu.
- `PlayerState` gagne `characterId: string` ; `collectPlayers` l'expose (additif).
- **Solo/défaut inchangé** : sans `characters`, tout le monde = `ouvrier`+`cloueur` (identique à `STARTING_WEAPONS=['cloueur']`) → `sim:check` **diff 0**.
- **Test :** `new Simulation({seed,mode:'coop',characters:['soudeur','electricien']})` → `players[0]` a `scie` + `characterId 'soudeur'`, `players[1]` a `court_circuit` + `'electricien'`. Sans `characters` → `cloueur` partout.

---

## Task 3 — Sélection SÉQUENTIELLE par joueur (app + overlay)

**Files :** `src/app/app.ts` (état + flux), `src/app/appState.ts` (`Screen 'characterSelect'`), `src/ui/overlay.ts` (écran), tests.

- Nouvel écran `characterSelect` inséré au lancement quand on confirme « Jouer » depuis le titre : pour `p = 1..selectedPlayers`, chacun à son tour choisit son perso (carrousel `◄ Nom ►` + aperçu arme, couleur `PLAYER_COLORS[p]`), `confirm` → joueur suivant ; après le dernier → `start(mode, selectedCharacters)`. `back` revient au joueur précédent / au titre. Réutilise le `FocusModel` unique (un seul joueur actif à la fois). 100 % manette (le pad du joueur actif — ou n'importe quel pad via l'agrégation CO-1 — pilote).
- `App` : `selectedCharacters: string[]` ; `start` passe `characters: selectedCharacters` à `new Simulation(...)`.
- Overlay : panneau « Joueur N (couleur) — choisis ton personnage » + carrousel + hint. DA 16-bit.
- **Tests :** app — flux titre→characterSelect→(choix P1,P2)→jeu, `getState().players` a les bons `characterId`/armes ; e2e — sélectionner 2 persos distincts → armes distinctes.

---

## Task 4 — Rendu : swap de skin par joueur

**Files :** `src/render/scenes/GameScene.ts`.

- Charger les feuilles de perso du roster (préchargement ; en placeholder elles pointent toutes sur `player_j1` → un seul load réel). `walkTextureKey`/`idleTextureKey` prennent le `characterId`/`sheet` du joueur (via `p.characterId` → `characterDef().sheet`) au lieu de la feuille globale. Le skin doré (Konami) reste une surcouche P1.
- Quadrupède (chien, phase C) : prévoir que `sheet` puisse être un layout différent — pour l'ossature, tous placeholder `player_j1` (4×4). Noter le point d'extension.
- **Validation :** capture non-lite coop (2 persos → skins ; placeholder = identiques pour l'instant, mais le CÂBLAGE choisit par `characterId`) + solo inchangé (e2e vert).

---

## Task 5 — Validation d'ossature + gates finaux

- Seam/e2e : titre → 2 joueurs → chacun choisit un perso → `getState().players[i].characterId` + `weapons` corrects ; solo (aucun choix) → ouvrier+cloueur inchangé.
- **Gates :** `npm run type-check` (tsc, sortie) + lint + `npx vitest run` + `npx playwright test` + **`npm run sim:check` diff 0** (défaut = ouvrier+cloueur).

---

## Vérification finale
Revue par tâche (tsc re-vérifié) + revue finale. Jouer-pour-valider : choisir des persos distincts → armes de départ distinctes en solo ET coop. `sim:check` diff 0 (défaut inchangé). Pas de push sans feu vert.

## Suite (après B)
**Phase A** : coder les 5 armes de base manquantes (goudron chaud, boulons ricochets, clé à molette, extincteur, brouette) → 10 armes distinctes ; étendre le roster à 10 persos. **Phase C** : 10 skins PixelLab (golden-batch, chien quadrupède) remplaçant les placeholder `player_j1`. Puis **sélection simultanée multi-curseurs** (polish) + `stats` par perso (si voulu).
