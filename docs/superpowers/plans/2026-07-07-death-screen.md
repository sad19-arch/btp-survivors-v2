# Écran de mort « Rapport de chantier » — Plan d'implémentation

> **Pour agents :** SOUS-SKILL : superpowers:subagent-driven-development. Basé sur le doc utilisateur `Écran de mort.docx` + plan approuvé (`.claude/plans/proud-sniffing-wilkinson.md`).

**But :** Remplacer le game-over nu (« Game Over » + 3 stats) par un **Rapport de chantier** style Cuphead : barre de progression montrant OÙ le joueur est mort par rapport à la fin du stage, phrase moqueuse (phrase culte obligatoire > 80 %), stats, bouton Recommencer prioritaire.

**Branche :** `feat/death-screen` sur `main` `188019d`.

## Global Constraints
- **UI pure, sim intouchée** : écran dans `src/ui` (`h()`, jamais `innerHTML`) + `src/app` + données `src/content`. `src/core` non touché → **`sim:check` diff 0**.
- **Déterminisme data** : les phrases dans `src/content/deathQuotes.ts` (data pure, aucun `Math.random`/`Date`). `selectDeathQuote({elapsedSeconds, stageDurationSeconds, roll})` PURE (roll ∈ [0,1) fourni). Le `Math.random()` du roll vit dans `src/app` (fige la phrase UNE fois à la mort).
- **DA 16-bit** : palette `src/ui/palette.ts`, panneaux pixel, **emojis INTERDITS** (barre = assets PixelLab + CSS). `FocusModel` (manette+clavier). Zéro `any` core, TS strict, ESLint 0.
- **Décisions user** : bouton « Améliorations » OMIS (Recommencer principal + Menu) ; barre = **assets pixel dédiés** (PixelLab).
- **Règle centrale** : la barre = progression TEMPORELLE de la tentative (`elapsedMs / FINAL_BOSS.atMs`), PAS une frise de construction.
- Gates : tsc/lint/vitest/**sim:check diff 0**/e2e/assets:qa/captures.

## Données & calculs (du doc)
`stageDurationMs = FINAL_BOSS.atMs` (config, 1_200_000 — importer, pas de 1200 hardcodé). `elapsedMs`/`kills=score` figés. `progressRatio = clamp(elapsedMs/FINAL_BOSS.atMs,0,1)` ; `progressPercent=floor(ratio*100)` ; `remainingSeconds=max(0, floor(atMs/1000)-floor(elapsedMs/1000))`. `formatTime(ms)→m:ss` (existe overlay.ts:733, à exporter). `formatNumber(1248)→"1 248"` (à créer).

**Règle phrase (PRIORITÉ ABSOLUE)** : `if (progressRatio > 0.8) return CULT` (écrase tout, systématique) ; sinon palier par minutes : `0_1`(humiliation), `1_3`(très moqueur), `3_5`(moqueur), `5_10`(taquin), `10_15`(respect naissant), `15_18`(presque respectueux). Contenu verbatim = doc `Écran de mort.docx` (fourni à l'implémenteur).

---

### Task 1: deathQuotes.ts (données + sélecteur pur)
**Files:** Create `src/content/deathQuotes.ts` ; Test `tests/unit/deathQuotes.test.ts`.
`CULT_DEATH_QUOTE` + `DEATH_QUOTES: Record<'0_1'|'1_3'|'3_5'|'5_10'|'10_15'|'15_18', readonly string[]>` (verbatim, fournis dans le dispatch). Pur `selectDeathQuote({elapsedSeconds, stageDurationSeconds, roll}): string` : `ratio>0.8`→cult ; sinon palier par `elapsedSeconds/60` → `pool[floor(roll*pool.length)]` (gardes `noUncheckedIndexedAccess`). **Test** : ratio 0.81→cult / 0.79→palier ; frontières (59s→`0_1`, 61s→`1_3`, 179s→`1_3`, 181s→`3_5`, etc.) ; roll 0/≈1 → 1er/dernier ; déterminisme. sim:check diff 0.

### Task 2: format utils (`src/ui/format.ts`)
**Files:** Create `src/ui/format.ts` (exporter `formatTime` depuis overlay.ts:733 + `formatNumber`) ; MAJ `overlay.ts` (importer) ; Test `tests/unit/format.test.ts`. `formatNumber(n)=n.toLocaleString('fr-FR')` (espace insécable). **Test** : `formatTime(1002000)="16:42"`, `formatNumber(1248)="1 248"`, `formatNumber(37)="37"`. sim:check diff 0.

### Task 3: deathReport figé (`src/app`)
**Files:** MAJ `src/app/appState.ts` (`DeathReport` + `AppViewState.deathReport`) ; `src/app/app.ts` (calcul one-shot) ; Test. `DeathReport {elapsedMs,kills,progressRatio,progressPercent,remainingSeconds,stageDurationMs,quote}`. `App._deathReport` remis à null dans `start()`/`restart()`, calculé UNE fois au 1er `getState()` où `scene==='gameover'` (importer `FINAL_BOSS`, `quote=selectDeathQuote({...,roll:Math.random()})`). Exposé dans `AppViewState.deathReport`. **Test** : calculé une fois (stable), reset au restart, valeurs correctes. sim:check diff 0.

### Task 4: assets PixelLab de la barre (skill `assets`)
3 icônes UI 16-bit (prompt global, calibration player_j1, QA) : `ui_death_start` (barrière/plot), `ui_death_marker` (casque renversé/ouvrier au sol — golden concept-lock EN PREMIER), `ui_death_flag` (drapeau/tampon VALIDÉ). `npm run assets:qa` VERT + planche. Repli CSS si échec QA.

### Task 5: refonte gameOverPanel + barre + styles + e2e
**Files:** `src/ui/overlay.ts` (`gameOverPanel`) ; `src/ui/styles.ts` (`.report*`) ; `src/app/app.ts` (`GAMEOVER_ITEMS` reste Recommencer+Menu) ; Test overlay + e2e `tests/e2e/deathScreen.spec.ts`. Structure (hiérarchie doc) : titre **CHANTIER INTERROMPU** → phrase `« … »` (`.report__quote`, `--cult` si >80%) → **barre** (rail + `ui_death_start` gauche + `ui_death_flag` droite + `ui_death_marker` à `left: clamp(%)` — ne sort JAMAIS du rail) → `X % terminé` → `Temps tenu : m:ss / 20:00` → `Ennemis tués : formatNumber(kills)` → `Plus que m:ss avant validation.` → boutons (Recommencer principal + Menu, via `menuList`). e2e : seam `debugKillPlayer()` (dev/test, PV→0 → gameover) → `getState().scene==='gameover'` + `deathReport` peuplé. Capture. sim:check diff 0.

### Task 6 (cuttable): polish — animation + audio
Marqueur avance+tombe à progressRatio (~0.6s) + % count-up ; sting audio (klaxon/tampon) + sting « so close » si >80%. Observateur, sim diff 0.

---

## Vérification
Gates par tâche (tsc/lint/vitest/**sim:check diff 0**/e2e/assets:qa/captures). **Critères d'acceptation du doc** : CHANTIER INTERROMPU à chaque mort ; barre = position de mort ; % / temps tenu / total / restant / kills ; phrase ; **>80% ⇒ phrase culte exacte** ; ≤80% ⇒ aléatoire du bon palier ; Recommencer prioritaire ; pas de mélange progression/noms de niveaux. Captures à 4 progressions (~8% / ~52% / ~84% culte / ~97%) — marqueur dans le rail.

## Séquencement
T1→T3 (data/calc/report) → T4 (assets) → T5 (écran+e2e) → T6 (polish). Feu vert user avant merge/push.

## Hors périmètre
Bouton Améliorations + boutique (lot méta). Banques de phrases « futures » du doc (record/boss/chest/upgrade — exigent signaux inexistants ; ne doivent jamais écraser la phrase culte). Écran de victoire inchangé. Kills par joueur en coop (death screen = solo, score total).
