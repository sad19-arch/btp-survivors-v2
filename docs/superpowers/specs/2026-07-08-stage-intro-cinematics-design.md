# Cinématiques d'intro de stage — design

**Goal :** un *cold-open burlesque muet* avant chaque stage (~5-7 s, skippable), où un **ouvrier maladroit récurrent** déclenche ou révèle la horde par une boulette *physique*. Le comique est porté par la **séquence** (visuel universel), pas par la voix. Zéro impact sur la simulation.

**Architecture :** un séquenceur de commandes render-only (Phaser) joué à l'entrée d'un stage, alimenté par un script de commandes *data-driven* par stage. La sim est gelée pendant la cinématique ; les acteurs/ennemis affichés sont **cosmétiques**. GameScene instancie et délègue à un module dédié.

**Tech :** TypeScript strict, Phaser (rendu), déterminisme (pas de `Math.random`/`Date.now`), skill `assets` (PixelLab) pour les rares props nouveaux.

---

## Pourquoi / contexte

Feature notée de longue date (mémoire `stage-intro-cinematics-idea`). Vocabulaire de commandes proposé par l'utilisateur : `lockGameplay` / `unlockGameplay` / `banner` / `voice` / `wait` / `flash` / `shake` / `cameraZoom` / `spawnPreview`.

**Décisions créatives (session de brainstorming 2026-07-08)** — après plusieurs directions écartées (satire bureaucratique, narrateur bavard façon Joueur du Grenier/AVGN) :
- Le comique doit être **porté par la séquence, pas par la voix**. Tout le monde doit comprendre en 2 s, quelle que soit sa langue.
- **Voix minimale** : au plus le nom du stage sur le carton (+ éventuel petit son universel). Aucune phrase à lire pour comprendre le gag.
- **Zéro gros mot**, tout public.
- **Burlesque muet** (Buster Keaton / Mr. Bean) : un ouvrier récurrent attachant dont la boulette physique cause/révèle la horde ; sa **réaction déadpan** (haussement d'épaules, regard caméra, fuite) est la punchline.
- **Escalade de campagne** + **fils rouges** : le WC de chantier (stage 5) et le tampon REFUSÉ (stage 10) reviennent.

## Global Constraints

- **Zéro impact simulation / déterminisme.** Render-only. La sim est **gelée ou pas démarrée** pendant la cinématique ; `spawnPreview` pose des sprites **cosmétiques** (jamais d'entités du `World`). Les vrais ennemis n'apparaissent qu'au `unlockGameplay`. Conséquence : `sim:check` reste **diff 0**, pas de re-baseline. Aucun `Math.random`/`Date.now` — les timings viennent d'une horloge de cinématique déterministe (dt Phaser, ou compteur ms interne au module).
- **Séparation sim/rendu + anti-god-object.** Le séquenceur vit dans un **module dédié** de `src/render/scenes/` ; GameScene se contente de l'instancier et de lui déléguer (`this.intro.play(stageId)`), jamais de logique de cinématique dans GameScene.
- **Contrôle total (PRD).** La cinématique est **toujours skippable** : n'importe quelle entrée manette **ou** clavier saute directement au `unlockGameplay` (+ cleanup). Focus/скip géré via la couche input existante, pas d'écouteur ad hoc.
- **DA 16-bit.** Palette centralisée, pas d'emoji. Le tampon (APPROVED / PENDING / DENIED) = motif visuel récurrent, cohérent 16-bit.
- **Réutilisation.** Recycle : bandeau nom-de-phase, voix annonceur, `shake`, `dust`, `beam` (ombre du boss #10), sprites ouvrier/prisonnier, machines/landmarks de stage, `cameraController.setOverview` (cadrage gelé). Nouveaux assets réduits au strict minimum (WC de chantier, pancarte « DONE », tampon).

---

## Composants

### 1. Le séquenceur — `src/render/scenes/introSequencer.ts`

Module observateur instancié par GameScene. Rôle : jouer une **liste ordonnée de commandes** pour un stage, gérer le skip, nettoyer à la fin.

- `play(stageId): void` — démarre le script du stage (verrouille le gameplay, joue les commandes).
- `update(dtMs): void` — avance l'horloge de cinématique, exécute les commandes dues.
- `skip(): void` — saute à la fin (unlock + cleanup) ; câblé sur toute entrée.
- `dispose(): void` — cleanup complet (zéro fuite : tous les sprites/props cosmétiques détruits).
- `get active(): boolean` — sonde (le gameplay est gelé tant que `active`).

### 2. Le vocabulaire de commandes (data)

Une commande = un objet typé (union discriminée), interprété par le séquenceur. On étend le vocabulaire proposé avec ce que le **burlesque physique exige** (déplacer/animer des acteurs) :

| Commande | Rôle | Réutilise |
|---|---|---|
| `lockGameplay` / `unlockGameplay` | gèle / rend le contrôle (sim non avancée pendant) | seam / GameScene |
| `banner(text)` | carton nom de stage | bandeau existant |
| `voice(key)` | clip annonceur **minimal** (nom du stage) — optionnel | AudioDirector |
| `wait(ms)` | pause (timing du gag) | — |
| `flash()` / `shake(intensity)` | le punch | vfxManager / cameraController |
| `cut` / `zoomTo` / `punchIn` / `whipPan` / `hold` / `slowmo` | **le montage** (voir §2b) | `cameraController` |
| `spawnPreview(key, at, count?)` | ennemis/foule **cosmétiques** (télégraphe/gag) | sprites de stage |
| `actor(id, key, at)` | pose l'ouvrier / un prop cosmétique | sprites existants |
| `actorMove(id, to, ms)` / `actorPlay(id, anim)` | **cœur du burlesque** : déplacer/animer un acteur | tweens Phaser |
| `sfx(key)` | petit son universel (gulp, sad-trombone) — optionnel | AudioDirector |

`actor*` sont les ajouts nécessaires au gag muet (le vocabulaire initial ne permettait que du décor statique). Tout acteur/preview est **cosmétique et détruit au unlock**.

### 2b. Montage & caméra — le nerf de la guerre

Un gag muet n'est drôle **que si le montage l'est**. La caméra et le rythme des coupes ne sont pas de la déco : ce sont les outils comiques n°1. Le séquenceur doit donc offrir un vrai langage de mise en scène, tout en caméra gelée (aucun impact sim) :

| Commande | Effet | Usage comique |
|---|---|---|
| `zoomTo(cx, cy, zoom, ms, ease)` | travelling avant/arrière fluide | plan d'établissement, montée de tension |
| `cut(cx, cy, zoom)` | **coupe franche** (repositionne instantanément) | passer du plan large au gros plan — le montage |
| `punchIn(cx, cy, zoom, ms)` | zoom-snap rapide (~120 ms) sur une réaction | **l'arme n°1** : punch-in sur le coucou gêné, sur l'œil qui tique |
| `whipPan(cx, cy, ms)` | filé très rapide (flou de mouvement) | transition kinétique : de l'ouvrier vers les quarante ennemis |
| `hold(ms)` | temps mort — rien ne bouge, la caméra tient | **le beat comique** : le silence juste avant le payoff |
| `slowmo(scale, ms)` | ralenti (échelle de temps de la cinématique, pas de la sim) | bullet-time sur le moment clé (les quarante qui jaillissent) |

**Le MONTAGE = l'ordre + le timing de ces plans.** Le même terrassement, exprimé *en montage* (c'est ça qui doit impressionner) :

1. **Plan large**, la caméra respire — `zoomTo(wide, 600ms)`. L'ouvrier siffle.
2. **Coupe** gros plan sur la pelle — `cut(pelle, 1.8)` + `shake(léger)` sur le *Clonk*.
3. **Zoom lent** sur l'homme-boue qui remonte — `zoomTo(fosse, 1.4, 700ms)` (tension).
4. **Punch-in** sur le visage de l'ouvrier — `punchIn(visage, 120ms)` → `hold(500ms)` sur le coucou gêné. *C'est là que ça se joue.*
5. **Filé + ralenti** vers la fosse — `whipPan(fosse, 150ms)` + `slowmo(0.4, 400ms)` : les quarante jaillissent. `flash()` + `shake(fort)`.
6. **Coupe plan large** — `cut(large)`, l'ouvrier détale, `banner("TERRASSEMENT")`. `unlockGameplay()`.

Ce langage est **réutilisable et data-driven** : chaque stage a son propre montage, mais le séquenceur ne connaît que ces primitives. Le golden (terrassement) sert à **caler le feel du montage** avant de dérouler les 9 autres.

### 3. Les scripts par stage (contenu)

Un script d'intro par stage = un `IntroScript` (tableau de commandes), rangé en **données** (`src/content/introScripts.ts` ou à côté de `stages.ts`). Data-driven : aucune logique par-stage copiée-collée ; chaque commande référence un asset **déjà chargé** (ou un nouveau prop déclaré).

Golden d'abord (terrassement), puis les 9 autres.

---

## Les 10 gags (le contenu comique)

Même ouvrier récurrent. Sa poisse escalade jusqu'au boss. Chaque gag est lisible en ~2 s, sans texte.

| # | Stage | Gag (100 % visuel) |
|---|---|---|
| 1 | Terrain vierge | Il plante fièrement le panneau PERMIS ; le panneau bascule et lui tombe dessus ; il le cale contre lui toute l'intro. |
| 2 | Terrassement | Il creuse en sifflotant ; **un seul** homme-boue remonte et le fixe ; petit coucou gêné ; **quarante** déboulent ; il détale. |
| 3 | Fondations | Il lisse le béton amoureusement, recule pour admirer : sa botte est prise dedans. La horde arrive, pied bloqué. |
| 4 | Réseaux enterrés | Il tire un câble « pour tester » ; tout le sous-sol jaillit en chaîne comme un diable en boîte. Il tient toujours le câble. |
| 5 | Gros œuvre | La grue passe une charge au-dessus de lui ; il ne remarque rien ; elle lui **dépose un WC de chantier sur la tête** ; il continue à bosser, coiffé. |
| 6 | Échafaudages | Il grimpe ; l'échafaudage se déplie beaucoup trop haut ; le voilà minuscule tout en haut, à agiter la main à l'aide. |
| 7 | Charpente / toiture | Il hisse une poutre ; le contrepoids le tire **lui** vers le haut ; il pendouille. |
| 8 | Second œuvre | Il allume : les ampoules révèlent **une à une** la horde tapie dans le noir ; il éteint. Ça n'aide pas. |
| 9 | Finitions | Mur parfait, il recule fier ; un ennemi pose aussitôt une **empreinte boueuse** ; œil qui tique ; puis cent empreintes. |
| 10 | Livraison / audit | Il présente le bâtiment fini avec une pancarte « DONE » ; l'ombre du contremaître tombe ; **tampon REFUSÉ** sur sa pancarte ; il fixe la caméra, vaincu → boss. |

**Fils rouges :** le WC (stage 5, peut réapparaître en clin d'œil) ; le tampon (motif récurrent, culmine stage 10). **Voix :** rien, ou juste le nom du stage sur le carton.

---

## Nouveaux assets (skill `assets`, minimal)

Calibrés `player_j1`, 16-bit, QA `npm run assets:qa`. Golden-batch d'abord.
- `prop_toilet` (WC de chantier bleu) — gag stage 5, fil rouge.
- `prop_sign_done` (petite pancarte « DONE ») — gag stage 10.
- `ui_stamp_denied` (tampon REFUSÉ / DENIED) — motif récurrent, culmine stage 10.
- Frames de réaction de l'ouvrier (coucou gêné, épaules, regard caméra) — si les frames existantes ne suffisent pas ; sinon on réutilise le sprite ouvrier/prisonnier + tweens.

Le reste (homme-boue, câble, grue, échafaudage, poutre, ampoules, empreintes, bâtiment fini, ombre boss) **existe déjà** dans les assets de stage.

---

## Tests / validation

- **Vitest (séquenceur, logique pure).** Ordre d'exécution des commandes selon les timings ; `skip()` saute bien à la fin (dernière commande = unlock) ; `dispose()`/fin détruit **tous** les acteurs cosmétiques (compteur = 0) ; déterminisme (mêmes timings ⇒ même déroulé ; aucun `Math.random`/`Date`). Scripts = données validées (chaque `key` de commande référence un asset connu).
- **e2e (seam, `src/app`).** À l'entrée d'un stage : `intro.active` vrai, gameplay gelé, `elapsedMs` reste 0 pendant l'intro ; **skip** via input ⇒ `unlockGameplay` ⇒ la sim démarre ; **`sim:check` diff 0** (render-only) ; pas de fuite de sprites (compteur borné au restart).
- **Capture.** Storyboard/capture du gag golden (terrassement) via `debugCameraOverview` pour la revue visuelle.
- **Gates :** `type-check` 0 · `lint` 0 · `vitest` · `sim:check` **diff 0** · `test:e2e` · `assets:qa` sur les nouveaux props.

## Séquencement (à l'implémentation — « demain »)

1. Séquenceur `introSequencer.ts` + vocabulaire de commandes typé + tests unitaires (skip/cleanup/déterminisme).
2. Câblage GameScene (délégation, skip via input) + e2e (gel sim, skip, diff 0).
3. **Golden : le gag terrassement** (script + assets props golden-batch) → capture GATE.
4. Déroulé des 9 autres scripts (data), stage par stage.
5. Polish : sons universels optionnels, fils rouges (WC/tampon).

## Hors périmètre (pour l'instant)

- Voix/doublage élaboré (la voix reste minimale).
- Cinématiques de milieu ou de fin de stage (uniquement l'intro).
- Auto-skip d'une intro déjà vue (mémoire de visionnage) — extension possible plus tard.
- Le mode Stage vs survie : ce design couvre l'**entrée de stage** ; l'intégration au mode survie (où le chantier « progresse ») est à cadrer séparément.
