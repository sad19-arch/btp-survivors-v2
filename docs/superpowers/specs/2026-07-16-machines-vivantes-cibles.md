# Machines vivantes — cibles à tenir

**Contexte** : les 11 engins du chantier sont des IMAGES MORTES. Aucun n'a de
feuille de sprites, donc aucun ne bouge. « C'est bizarre d'avoir des véhicules de
chantier qui ne font rien » (utilisateur, 2026-07-16).

**Le moteur sait déjà les animer.** `ClusterElement.animation { frameRate }` →
`siteRenderer` crée l'anim et la joue (`siteRenderer.ts:207`). Prouvé de bout en
bout par `prop_stage03_hose_active` (feuille 128×32 = 4 frames, `frame: 32`,
`frameRate: 8`) — le SEUL asset animé du jeu. **Zéro travail moteur** : c'est de
la production d'assets + une ligne de déclaration par engin.

## Consignes utilisateur (fermes)

1. **Faire les 11.**
2. **Proportions justes par rapport au perso** — le critère qui tue si on le rate.
3. **GARDER les engins statiques** dans les assets (ne pas supprimer les PNG
   actuels ; les animés prennent de NOUVELLES clés).
4. **Qualité graphique proche de l'existant** — « ceux qu'on a sont pas mal ».
5. **DEUX animations par engin MOBILE** : « pense à animer les chenilles ou les
   roues au cas où j'ai besoin de les déplacer ». Un engin qui roule sur un chemin
   avec ses chenilles figées serait aussi faux que ce qu'on répare.

## Les deux animations

| Suffixe | Quand | Ce qui bouge |
|---|---|---|
| `_work` | l'engin est POSÉ (décor) | le geste métier : bras qui creuse, cuve qui tourne, flèche qui pivote. Le châssis ne bouge pas. |
| `_move` | l'engin PARCOURT un chemin | chenilles / roues qui défilent. Le reste est en position de transport, figé. |

**Câblage** : ce sont deux clés d'asset distinctes. Un engin posé en décor
déclare `*_work` + `animation: { frameRate }`. Le sélecteur de skin d'un chemin
(lot trajets, `walkerSkinsFor`) ne propose que les variantes **`_move`** — un
engin qui roule ne joue pas son geste de travail.

**Engins SANS `_move`** (ils ne se déplacent pas d'eux-mêmes) : bétonnière sur
châssis, grue à tour, crochet de grue, nacelle en poste.

## Piège de packing découvert sur le golden

`animate_object` rend une animation à **SENS UNIQUE** (ex. bras déployé →
replié). Avec `repeat: -1`, Phaser saute de la dernière frame à la première : un
à-coup visible. **Packer en ALLER-RETOUR** (0-1-2-3-4-5-6-5-4-3-2-1 = 12 frames à
partir de 7) → boucle continue, coût nul. Vérifié sur la pelleteuse.

**MAIS ce n'est PAS universel — c'est la MESURE qui décide, animation par
animation.** Vérifié : sur 4 animations produites, **3 sont naturellement
cycliques** (benne 22,1 %/frame, roues 13,1 %, cuve 15,5 % — raccord 1,3-1,6× la
moyenne = une transition normale). **Seule** la pelleteuse `_move` sortait à
2,3× — et pas parce que les chenilles ne bouclent pas, mais parce que **le bras
dérivait** (la dérive hors-brief acceptée par l'user). C'est la dérive qui
cassait le cycle, pas le mécanisme.

**Critère chiffré** : `raccord(dernière→première) > 2,2 × moyenne(frame→frame)`
⇒ sens unique ⇒ packer en aller-retour. Sinon ⇒ **boucle directe**, 7 frames.
Packer en aller-retour « au cas où » double la feuille (12 frames au lieu de 7)
et la VRAM **pour rien**.

⚠️ **Le script de packing doit décider PAR ANIMATION**, pas appliquer
l'aller-retour en dur (erreur commise : `pack.mjs` avait `ORDER` codé en dur).

## Cible de proportions — À TENIR EXACTEMENT

Le joueur fait **99 px** à l'écran (planche 192 × 0.516). La garantie est
mécanique : après génération, régler `scale` pour retomber sur la hauteur écran
ci-dessous. **La taille du fichier source n'a alors aucune importance.**

| Clé | Fichier actuel | px | scale | **Hauteur écran** | × joueur | Action attendue |
|---|---|---|---|---|---|---|
| `prop_s2_excavator` | stage02/props/excavator.png | 192×176 | 1.2 | **211** | 2.13× | bras qui creuse |
| `struct_stage04_excavator` | stage04/props/mini_excavator.png | 192×192 | 1.1 | **211** | 2.13× | bras qui creuse |
| `struct_stage06_nacelle` | stage06/props/boom_lift.png | 160×192 | 1.1 | **211** | 2.13× | nacelle monte/descend |
| `struct_stage05_crane` | stage05/props/tower_crane.png | 256×256 | 1.2 | **307** | 3.10× | flèche qui pivote |
| `struct_stage05_mixer` | stage05/props/mobile_crane.png ⚠️ | 224×192 | 1.05 | **202** | 2.04× | **cuve qui tourne** (2e TOUPIE) |
| `struct_stage03_mixer` | stage03/props/mixer_truck.png | 384×256 ⚠️ | 0.72 | **184** | 1.86× | toupie qui tourne |
| `struct_stage07_crane` | stage07/props/crane_truck.png | 269×158 ⚠️ | 1.15 | **182** | 1.84× | flèche |
| `prop_s2_truck` | stage02/props/dump_truck.png | 192×160 | 1.05 | **168** | 1.70× | roule / benne bascule |
| `prop_s2_dozer` | stage02/props/bulldozer.png | 192×144 | 1.0 | **144** | 1.45× | lame + chenilles |
| `prop_stage03_concrete_mixer` | stage03/props/concrete_mixer.png | 128×128 | 0.65 | **83** | 0.84× | cuve qui tourne |
| `prop_stage05_crane_hook` | stage05/props/crane_hook.png | 96×96 | 0.8 | **77** | 0.78× | crochet qui balance |

⚠️ (colonne px) = dépasse le plafond **256×256** du mode v3 de `animate_object` → régénérer plus petit.

## ⚠️ LE NOM DU FICHIER MENT — vérifier l'IMAGE, pas la clé ni le chemin

`stage05/props/mobile_crane.png` **n'est PAS une grue mobile** : c'est une
**toupie à béton**. Vérifié en ouvrant le PNG, et confirmé par le commentaire du
code lui-même (`stages.ts:703` : « 1 = mobile_crane (SE, ~315°) — *toupie
livrant le béton* côté SE »). La CLÉ dit vrai (`struct_stage05_mixer`), le
FICHIER porte un nom faux.

**Conséquences** :
- Le jeu a **DEUX toupies** (`struct_stage03_mixer` + `struct_stage05_mixer`) et
  **AUCUNE grue mobile**. Une grue mobile générée serait un asset orphelin.
- La cible de `struct_stage05_mixer` est **cuve qui tourne**, pas « flèche ».
- **Il reste donc 10 engins, pas 11.**

Erreur commise et rattrapée en regardant l'image. **Règle : ouvrir le PNG avant
de prescrire une animation.** Un nom de fichier n'est pas une source de vérité.

## ⚠️ DÉRIVE PIXELLAB : vue de côté sur les objets HAUTS

Confirmé sur la grue à tour ET la grue mobile : malgré `NOT a side view, NOT a
profile view` dans le prompt, PixelLab rend une **élévation plate** (flèche
horizontale, mât vertical, zéro ombre, zéro profondeur). L'interdiction ne
marche pas.

**Parade** : décrire ce qui FAIT la 3/4 au lieu d'interdire la vue de côté —
« la flèche court en DIAGONALE de haut-gauche à bas-droite en perspective
fuyante », « on voit le DESSUS de la cabine », « une ombre portée sombre au sol
sur le côté », « fort sentiment de regarder d'en haut ».

**Étalon de comparaison = l'asset EXISTANT du jeu** (`stage05/props/tower_crane.png`
a une vraie 3/4 : flèche diagonale, ombre portée, base en volume). L'utilisateur
a été formel : « ceux qu'on a sont pas mal ». Une génération moins bonne que
l'existant est une RÉGRESSION — la jeter, pas la livrer.

## Contraintes techniques mesurées

- **`animate_object` ne peut PAS animer un PNG du disque** : il lui faut un
  `object_id` PixelLab. Pour animer, il faut **régénérer** l'engin chez PixelLab
  puis l'animer. Le look changera — accepté par l'utilisateur.
- **Mode v3** : canvas ≤ 256×256, `frame_count` pair 4-16 (défaut 8). Préféré à
  `pro` (moins cher ET meilleure qualité selon la doc de l'outil).
- **Frames CARRÉES obligatoires** : `load.spritesheet` utilise
  `{ frameWidth: e.frame, frameHeight: e.frame }` — un seul nombre. Padding
  au carré requis au packing.
- **Déclaration** : entrée `editorExtras` avec `frame: N` → `load.spritesheet`
  (`GameScene.ts:398`). Sans `frame`, c'est un `load.image` et rien n'est animable.

## Recette (par engin)

1. `create_map_object` — prompt global manifest §3 + description, canvas ≤ 192.
2. `animate_object` mode v3, 1 direction, `frame_count: 6` ou `8`.
3. Télécharger les frames, packer en feuille à frames CARRÉES.
4. Déclarer dans `stages.ts` : nouvelle clé `*_anim`, `frame: N`.
5. Ajouter `animation: { frameRate }` à l'élément de cluster qui l'utilise.
6. **Régler `scale`** pour retomber sur la hauteur écran du tableau.
7. Juger **EN CONTEXTE** (`tools/assets/context-board.mjs`) avec l'ANCIEN engin
   à côté — les vignettes de l'API mentent (6/6 vs 3/6 sur le lot précédent).

## Gates

`assets:qa` 0/0 · tsc · lint 0 · Vitest · build · `sim:check` diff 0 (les engins
sont du décor ; les statiques restent déclarés donc aucune collision ne bouge).
