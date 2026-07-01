# Pixelabs Asset Manifest - BTP Survivors Reboot

## 1. Source de verite visuelle

Le sprite de reference n'est pas `player_lpc_*`. Le personnage actuellement utilise par le jeu est :

- `public/player_j1.png`
- spritesheet `192x192`
- 4 colonnes x 4 lignes
- ordre des directions existant : down, right, up, left
- 4 frames par direction
- rendu en jeu a scale `0.516`, soit environ 99 px de haut

Tous les nouveaux personnages, ennemis et monstres doivent etre calibres pour matcher ce rendu : silhouette compacte, lecture immediate, contour sombre, palette 16-bit arcade, ombrage propre, pas de rendu moderne.

## 2. Decision sur les directions d'animation

Decision recommandee : tous les ennemis mobiles doivent avoir 4 directions.

Raison : dans un survivors-like top-down, les ennemis arrivent de tous les cotes. Une seule direction donne vite une impression de sprite qui glisse. Pour une DA premium, les monstres communs doivent au minimum avoir une marche 4 directions.

Format standard :

| Type | Format | Sheet | Animations minimum |
|---|---:|---|---|
| Joueur | 192x192 | 4x4 | walk down/right/up/left, 4 frames chacune |
| Ennemi commun | 192x192 | 4x4 | walk down/right/up/left, 4 frames chacune |
| Ennemi special | 192x192 | 4x4 + option attack | walk 4 directions, attack separe si besoin |
| Mini-boss | 256x256 | 4x4 + attack | walk 4 directions, telegraph/attack separe |
| Boss majeur | 384x384 | 4x4 + attack + intro | walk 4 directions, telegraph, attack, death |
| Props | 32x32 a 256x256 | image transparente | statique, variantes si necessaire |
| Tiles | 32x32 | tileable | base + variations |
| UI icons | 32x32 ou 64x64 | image transparente | statique |

## 3. Prompt global a reutiliser

Ajouter ce bloc au debut de chaque prompt Pixelabs, sauf mention contraire :

```text
16-bit clean arcade pixel art, top-down three-quarter RPG view, matching a 192x192 construction worker spritesheet, bold dark outline, compact readable silhouette, limited saturated color palette, SNES/Mega Drive era, crisp pixels, transparent background, no blur, no anti-aliased painting, no modern vector look, no realistic lighting, no text, no watermark
```

Prompt negatif global :

```text
no photorealism, no 3D render, no smooth digital painting, no soft gradients, no thin outlines, no messy tiny details, no UI text, no watermark, no isometric diamond perspective, no side-scroller perspective, no random tools as enemies, no ambiguous object-monster hybrid that cannot be read at small size
```

## 4. Methode Pixelabs recommandee

| Etape | Methode |
|---|---|
| 1. Concept lock | Generer 1 sprite facing down sur fond transparent. Le reduire a environ 100 px de haut a cote de `player_j1`. Rejeter si la silhouette n'est pas lisible en 2 secondes. |
| 2. Palette lock | Garder 1 couleur dominante par famille d'ennemis et 1 accent chantier par stage. Eviter que tous les monstres soient bleus/noirs. |
| 3. Sheet walk | Generer la sheet `192x192`, 4 colonnes x 4 lignes, ordre down/right/up/left, 4 frames par direction. |
| 4. Nettoyage | Verifier transparence, bounding box, absence de pixels parasites, hauteur visible entre 55 et 95 px pour un ennemi standard. |
| 5. Integration test | Capturer le sprite dans un mock gameplay avec sol, joueur, projectile et 10 ennemis. Si l'ennemi se confond avec un prop, il est refuse. |
| 6. Variantes elite | Creer une variante elite seulement apres validation de la version normale. Variante = teinte + details + silhouette legerement plus agressive, pas un nouveau style. |

## 5. Configuration recommandee pour reduire la charge graphique

Objectif : ne pas gerer les assets un par un. Le bon systeme n'est pas un outil magique, mais une petite chaine de production qui verrouille les decisions graphiques et automatise les controles.

### Outils recommandes

| Outil | Role principal | Quand l'utiliser | Pourquoi |
|---|---|---|---|
| PixelLab (MCP) | **Moteur unique de génération** (validé sur le golden batch) | Personnages, ennemis, PNJ, boss (`create_character` + `animate_character`), tilesets, props, UI | Pixel art 16-bit natif calibré sur `player_j1` ; couvre tout le pipeline. |
| ~~Gamelabs Studio~~ | **Abandonné** (A/B golden batch) | — | Produit une illustration peinte haute déf hors-DA → mélange interdit. Écarté. |
| Aseprite | Nettoyage et verification | Alignement, transparence, grille, export propre, petites corrections | Indispensable pour eviter les spritesheets sales ou mal calees. |
| Pixel artist freelance | Validation DA ponctuelle | Golden batch, review de stage, assets heros/boss/UI critiques | Sert a eviter le patchwork et a valider la coherence sans tout produire a la main. |
| Claude Code / scripts | QA automatique | Nommage, dimensions, transparence, planches de preview | Permet de valider par batch au lieu de regarder 200 fichiers un par un. |

### Process "asset factory"

| Etape | Sortie attendue | Regle de decision |
|---|---|---|
| 1. Golden batch | `player_j1` reference, 2 ennemis stage 01, 1 boss, 1 tileset sol, 5 props, 1 UI panel, 1 VFX hit/death | Rien d'autre n'est produit tant que ce batch n'est pas coherent. |
| 2. Style lock | Une planche de reference avec joueur + ennemis + props + UI + sol | Si la planche ne donne pas une vraie DA 16-bit clean, reprendre les prompts. |
| 3. Production par stage | Un stage complet a la fois | Ne pas melanger production de 10 stages en parallele. |
| 4. QA automatique | Rapport dimensions, transparence, nommage, grille, pixels parasites | Tout asset qui echoue est renomme/corrige/refuse avant integration. |
| 5. Validation par planche | Une image recap par stage | Le createur valide une planche, pas chaque PNG separement. |
| 6. Integration gameplay | Capture avec joueur, ennemis, props, projectiles et HUD | Si la lisibilite gameplay baisse, l'asset est refuse meme s'il est joli. |

### Regles pour diminuer la charge mentale

- Ne jamais produire tous les assets d'un coup.
- Valider le style sur un petit batch avant de consommer du quota.
- Travailler par stage complet, pas par categorie globale.
- Generer des planches recap automatiques : une image par stage avec tous les assets importants.
- Ne valider que trois choses : coherence avec `player_j1`, lisibilite en gameplay, identite propre du stage.
- Refuser rapidement les assets "presque bons" s'ils demandent trop de retouche.
- Garder Aseprite pour les corrections simples, pas pour sauver des assets rates.
- Faire reviewer le golden batch par un pixel artist avant production massive.
- Garder les anciens assets uniquement comme placeholders techniques, jamais comme reference DA finale.

### Configuration conseillee par phase

| Phase | Configuration |
|---|---|
| Prototype visuel | PixelLab + Aseprite, petit quota (essai) suffisant. |
| Golden batch | PixelLab pour tout (persos, tiles, UI), Aseprite nettoyage, review freelance courte. |
| Production MVP | PixelLab (moteur unique), scripts de QA obligatoires. |
| Production complete 10 stages | Forfait PixelLab eleve, production stage par stage, review artistique toutes les 2 ou 3 phases. |
| Apres 30-50 assets valides | Envisager Scenario/Layer uniquement si besoin d'un modele entraine pour industrialiser encore plus. |

### Verdict outil (décision)

**A/B tranché sur le golden batch : PixelLab (MCP) est le moteur de génération UNIQUE.** Il produit du pixel art 16-bit natif cohérent avec `player_j1` et couvre tout le pipeline (persos/ennemis/boss + `animate_character`, tilesets, props, UI). Gamelabs a été écarté (illustration peinte hors-DA).

Pile retenue :
1. **PixelLab** — toute la génération (persos, ennemis, PNJ, boss, tilesets, props, UI).
2. **Aseprite** — contrôle, nettoyage, recadrage/export propre.
3. **Claude Code / scripts** — QA automatique (`npm run assets:qa`), planches récap.
4. (Optionnel) un pixel artist pour valider le golden batch et les assets critiques.

> Bémol pratique : l'essai PixelLab = 40 générations ; un **forfait payant** sera nécessaire pour la production complète (10 stages).

## 6. Conventions de nommage

| Type | Convention |
|---|---|
| Ennemi | `enemy_stageXX_nom_walk_192.png` |
| Ennemi elite | `enemy_stageXX_nom_elite_walk_192.png` |
| Boss | `boss_stageXX_nom_walk_256.png` ou `boss_stageXX_nom_walk_384.png` |
| Boss attaque | `boss_stageXX_nom_attack_256.png` |
| Prop | `prop_stageXX_nom.png` |
| Tile | `tile_stageXX_nom_32.png` |
| Danger | `hazard_stageXX_nom.png` |
| Icone | `icon_nom_32.png` ou `icon_nom_64.png` |
| UI | `ui_nom.png` |
| VFX | `vfx_nom_sheet.png` |

## 7. Assets coeur communs

| ID | Priorite | Categorie | Format | Prompt / methode Pixelabs |
|---|---:|---|---|---|
| player_worker_j1_master | P0 | Joueur reference | 192x192, 4x4 | Reprendre `player_j1` comme reference. Si regeneration : ouvrier BTP hero, casque jaune, gilet orange, pantalon bleu sombre, bottes, silhouette compacte, 4 directions down/right/up/left, 4 frames par direction, meme proportions que `player_j1`. |
| player_worker_j2_variant | P2 | Joueur coop | 192x192, 4x4 | Meme sprite que J1, variante couleur lisible rouge/orange, casque jaune conserve, pas de changement de style. |
| player_worker_j3_variant | P2 | Joueur coop | 192x192, 4x4 | Meme sprite que J1, variante couleur verte/cyan controlee, casque jaune conserve, silhouette identique. |
| player_worker_j4_variant | P2 | Joueur coop | 192x192, 4x4 | Meme sprite que J1, variante couleur violet/jaune controlee, casque jaune conserve, silhouette identique. |
| shadow_blob | P0 | Gameplay | 64x32 | Ombre elliptique pixel art, sombre, semi-transparente, lisible sous personnages, pas floue. Peut etre fait a la main plutot que Pixelabs. |
| pickup_xp_small | P0 | Pickup | 32x32, 4 frames | Petit cristal XP vert/cyan, contour sombre, sparkle arcade discret, transparent. |
| pickup_xp_big | P1 | Pickup | 32x32, 4 frames | Gros cristal XP jaune/vert, plus rare, meme style. |
| pickup_health | P1 | Pickup | 32x32 | Petite trousse/boite de soin chantier, rouge/blanc, contour noir, pas de texte. |
| pickup_magnet | P2 | Pickup | 32x32 | Aimant arcade stylise rouge/bleu, contour noir, readable at 32 px. |
| pickup_bonus_crate | P1 | Pickup | 64x64 | Caisse bonus chantier, bois/metal jaune securite, contour sombre, pas de texte. |

## 8. Armes, projectiles et icones

| ID | Priorite | Role gameplay | Format | Prompt / methode Pixelabs |
|---|---:|---|---|---|
| weapon_saw_orbit_icon | P0 | Arme orbitale | 64x64 | Scie circulaire arcade, disque metal, dents lisibles, petit accent jaune chantier, contour sombre, icon readable. |
| weapon_saw_orbit_projectile | P0 | Projectile | 32x32, 4 frames spin | Lame de scie circulaire pixel art, rotation 4 frames, metal clair, contour sombre. |
| weapon_nailgun_icon | P0 | Arme auto-cible | 64x64 | Cloueur de chantier stylise, orange/noir, silhouette simple, pas realiste, pixel art 16-bit. |
| weapon_nail_projectile | P0 | Projectile | 32x32 | Clou rapide, diagonale lisible, petite trainee pixel jaune/blanc. |
| weapon_hammer_icon | P0 | Arme zone | 64x64 | Marteau de chantier iconique, manche bois, tete metal, contour noir, lisible. |
| weapon_hammer_wave | P0 | VFX attaque | 128x128, 6 frames | Onde de choc circulaire pixel art, poussiere orange/grise, expansion courte, transparent. |
| weapon_concrete_splash_icon | P2 | Arme zone sol | 64x64 | Seau de beton stylise, eclaboussure grise, contour sombre, arcade. |
| weapon_concrete_splash_vfx | P2 | VFX attaque | 128x128, 6 frames | Splash de beton frais au sol, gris, bord sombre, disparition en 6 frames. |
| weapon_rebar_spear_icon | P2 | Projectile perce | 64x64 | Barre de ferraillage stylisee comme lance, gris metal, petits reflets jaunes. |
| weapon_rebar_projectile | P2 | Projectile | 48x16 | Ferraillage lance horizontal, outline sombre, readable. |
| weapon_cone_boomerang_icon | P2 | Arme boomerang | 64x64 | Cone de chantier transforme en boomerang arcade, orange/blanc, fun mais lisible. |
| weapon_cone_projectile | P2 | Projectile | 32x32, 4 frames | Cone tournoyant, rotation 4 frames, orange vif. |
| weapon_cable_whip_icon | P3 | Arme fouet | 64x64 | Cable electrique stylise, etincelles bleues, contour noir. |
| weapon_cable_whip_vfx | P3 | VFX attaque | 128x64, 6 frames | Arc de cable electrique, fouet lateral, etincelles 16-bit. |
| weapon_paint_roller_icon | P3 | Arme ligne | 64x64 | Rouleau de peinture arcade, manche court, peinture vive, contour noir. |
| weapon_paint_wave_vfx | P3 | VFX attaque | 128x64, 6 frames | Trainee de peinture au sol, couleur vive, animation courte. |

## 9. Upgrades et HUD

| ID | Priorite | Categorie | Format | Prompt / methode Pixelabs |
|---|---:|---|---|---|
| icon_upgrade_damage | P0 | Upgrade | 32x32 | Gant de chantier puissant, petit eclat rouge/orange, contour noir. |
| icon_upgrade_speed | P0 | Upgrade | 32x32 | Botte de securite avec lignes de vitesse, jaune/noir, readable. |
| icon_upgrade_cooldown | P0 | Upgrade | 32x32 | Chronometre arcade chantier, cyan/jaune, contour sombre. |
| icon_upgrade_area | P0 | Upgrade | 32x32 | Cercle d'impact agrandi, orange/gris, simple. |
| icon_upgrade_projectiles | P1 | Upgrade | 32x32 | Trois clous/projectiles en eventail, outline sombre. |
| icon_upgrade_magnet | P1 | Upgrade | 32x32 | Aimant arcade attirant un cristal XP. |
| icon_upgrade_armor | P1 | Upgrade | 32x32 | Gilet de securite renforce, orange/metal, contour noir. |
| icon_upgrade_hp | P1 | Upgrade | 32x32 | Casque de chantier avec croix de soin, pas de texte. |
| icon_upgrade_luck | P2 | Upgrade | 32x32 | Trefle stylise chantier ou etoile bonus verte, style arcade. |
| ui_title_logo | P1 | UI | 512x256 | Logo pixel art "BTP Survivors", arcade 90s, lettres massives, jaune/orange/metal, contour noir, pas de gradient moderne. Generer separement car contient du texte. |
| ui_panel_9slice | P0 | UI | 64x64 ou 96x96 | Cadre pixel art 9-slice, bord noir epais, interieur sombre, accents jaune securite, angles carres. |
| ui_button_idle | P0 | UI | 192x48 | Bouton pixel art rectangulaire, bord noir, fond sombre, accent jaune. Sans texte. |
| ui_button_focus | P0 | UI | 192x48 | Bouton focus manette, bordure jaune vive, petite animation possible, sans texte. |
| ui_upgrade_card | P0 | UI | 220x300 | Carte upgrade pixel art, bord noir, haut pour icone, zone texte sobre, sans texte integre. |
| ui_cursor_gamepad | P0 | UI | 32x32, 4 frames | Curseur focus arcade, triangle/fleche jaune, animation blink 4 frames. |
| ui_hp_bar | P0 | UI | 128x16 | Barre HP pixel art, fond sombre, bord noir, remplissage rouge/vert separe possible. |
| ui_xp_bar | P0 | UI | 256x12 | Barre XP pixel art, fond sombre, remplissage cyan/vert, bord noir. |

## 10. Stages - environnements, props et dangers

Chaque stage doit avoir au minimum : 1 pack sol, 5 props, 1 landmark, 1 danger environnemental. Les props doivent rester des decors, jamais se confondre avec les ennemis.

| Stage | ID | Priorite | Type | Format | Prompt / methode Pixelabs |
|---|---|---:|---|---|---|
| 01 Terrain vierge | tile_stage01_ground_pack | P0 | Tiles sol | 32x32 tileable, 8 variantes | Sol terre/herbe de terrain vierge, sable brun, petites pierres, herbes rares, traces legeres, palette chaude, tileable, 16-bit clean. Inclure base, variation, cailloux, herbe, bord sombre, poussiere. |
| 01 Terrain vierge | prop_stage01_survey_stakes | P0 | Prop | 64x64 | Piquets de geometre avec rubalise, petit prop chantier, rouge/blanc/bois, contour noir. |
| 01 Terrain vierge | prop_stage01_boundary_tape | P0 | Prop | 128x64 | Rubalise tendue entre deux piquets, lisible, pas trop haute, transparent. |
| 01 Terrain vierge | prop_stage01_rock_cluster | P1 | Prop | 64x64 | Tas de pierres terrain vierge, brun/gris, silhouette basse, ne pas ressembler a un ennemi. |
| 01 Terrain vierge | prop_stage01_weeds | P1 | Prop | 64x64 | Touffes d'herbe seche, brun/vert, decorative, basse. |
| 01 Terrain vierge | landmark_stage01_site_sign | P1 | Landmark | 192x128 | Panneau chantier sans texte lisible, cadre bois/metal, jaune securite, prop de decor. |
| 01 Terrain vierge | hazard_stage01_soft_ground | P1 | Danger | 96x96, 4 frames | Zone de sol meuble/poussiere, animation subtile, ralentit le joueur, lisible au sol. |
| 02 Terrassement | tile_stage02_mud_pack | P0 | Tiles sol | 32x32 tileable, 8 variantes | Sol de terrassement, boue, traces de pneus, terre remuee, flaques brunes, tileable, contrastes propres. |
| 02 Terrassement | prop_stage02_dirt_pile_small | P0 | Prop | 64x64 | Petit tas de terre, brun/orange, ombre pixel, contour sombre. |
| 02 Terrassement | prop_stage02_dirt_pile_large | P0 | Prop | 128x96 | Grand tas de terre, visible mais obstacle bas, variations de brun. |
| 02 Terrassement | prop_stage02_excavator_static | P1 | Landmark | 256x192 | Pelleteuse pixel art 16-bit, jaune chantier, vue top-down 3/4, statique, decor premium, pas ennemie. |
| 02 Terrassement | prop_stage02_dump_truck | P1 | Landmark | 256x160 | Camion benne chantier, jaune/orange, top-down 3/4, statique, silhouette claire. |
| 02 Terrassement | prop_stage02_trench | P0 | Prop/Danger | 128x64 | Tranchee ouverte dans la terre, bord sombre, lisible comme trou/danger. |
| 02 Terrassement | hazard_stage02_falling_dirt | P2 | Danger | 96x96, 6 frames | Eboulement de terre arcade, poussiere brune, animation courte, telegraph puis impact. |
| 03 Fondations | tile_stage03_concrete_pack | P0 | Tiles sol | 32x32 tileable, 8 variantes | Beton frais et dalle de fondation, gris chaud, fissures legeres, traces de taloche, tileable. |
| 03 Fondations | prop_stage03_rebar_grid | P0 | Prop | 128x128 | Grille de ferraillage au sol, metal sombre, lisible, pas trop dense. |
| 03 Fondations | prop_stage03_formwork | P0 | Prop | 128x64 | Coffrage bois pour fondations, planches brunes, contours noirs. |
| 03 Fondations | prop_stage03_cement_bags | P1 | Prop | 64x64 | Sacs de ciment empiles, gris/beige, sans logo ni texte. |
| 03 Fondations | prop_stage03_mixer | P1 | Prop | 128x128 | Betonniere statique 16-bit, orange/gris, top-down 3/4. |
| 03 Fondations | landmark_stage03_poured_slab | P1 | Landmark | 256x192 | Grande zone de dalle coulee, beton lisse, bords de coffrage, decorative. |
| 03 Fondations | hazard_stage03_wet_concrete | P0 | Danger | 96x96, 4 frames | Flaque de beton frais ralentissante, gris brillant pixel, animation tres subtile. |
| 04 Reseaux enterres | tile_stage04_trench_pack | P1 | Tiles sol | 32x32 tileable, 8 variantes | Sol tranchees techniques, terre ouverte, gravier, passages de gaines, tileable. |
| 04 Reseaux enterres | prop_stage04_blue_pipe | P1 | Prop | 128x64 | Tuyau bleu pose au sol, coude optionnel, contour noir. |
| 04 Reseaux enterres | prop_stage04_red_duct | P1 | Prop | 128x64 | Gaine rouge enterree, coude, arcade propre, pas trop fine. |
| 04 Reseaux enterres | prop_stage04_cable_reel | P1 | Prop | 96x96 | Touret de cable, bois/metal, top-down 3/4, lisible. |
| 04 Reseaux enterres | prop_stage04_manhole | P1 | Prop | 64x64 | Regard technique rond/carre, metal sombre, au sol. |
| 04 Reseaux enterres | landmark_stage04_pipe_crossing | P2 | Landmark | 256x192 | Croisement de reseaux enterres, tuyaux colores, tranchees, propre et lisible. |
| 04 Reseaux enterres | hazard_stage04_electric_spark | P1 | Danger | 64x64, 6 frames | Etincelles electriques sortant d'une gaine, cyan/jaune, telegraph clair. |
| 05 Gros oeuvre | tile_stage05_block_floor_pack | P1 | Tiles sol | 32x32 tileable, 8 variantes | Sol chantier gros oeuvre, poussiere beton, marques de parpaings, gravats, tileable. |
| 05 Gros oeuvre | prop_stage05_block_pallet | P1 | Prop | 128x96 | Palette de parpaings, gris, contours noirs, masse lisible. |
| 05 Gros oeuvre | prop_stage05_concrete_column | P1 | Prop | 96x128 | Poteau beton vertical top-down 3/4, ombre courte, obstacle. |
| 05 Gros oeuvre | prop_stage05_crane_hook | P1 | Prop | 96x128 | Crochet de grue suspendu, jaune/noir, lisible, pas ennemi. |
| 05 Gros oeuvre | prop_stage05_wall_segment | P1 | Prop | 192x96 | Mur en parpaings partiellement monte, gris, arcade. |
| 05 Gros oeuvre | landmark_stage05_tower_crane_base | P2 | Landmark | 256x256 | Base de grue de chantier, jaune, structure metal, top-down 3/4, decorative. |
| 05 Gros oeuvre | hazard_stage05_falling_block | P1 | Danger | 96x96, 6 frames | Parpaing qui tombe, telegraph ombre au sol puis impact poussiere, 16-bit. |
| 06 Echafaudages | tile_stage06_scaffold_floor_pack | P2 | Tiles sol | 32x32 tileable, 8 variantes | Sol poussiereux avec ombres d'echafaudages, planches, metal, tileable. |
| 06 Echafaudages | prop_stage06_scaffold_frame | P1 | Prop | 128x160 | Cadre d'echafaudage metal, bleu/gris, top-down 3/4, contour noir. |
| 06 Echafaudages | prop_stage06_scaffold_plank | P1 | Prop | 128x64 | Plancher d'echafaudage bois/metal, bas, lisible. |
| 06 Echafaudages | prop_stage06_guardrail | P2 | Prop | 128x64 | Garde-corps metal, jaune/gris, transparent. |
| 06 Echafaudages | prop_stage06_ladder | P2 | Prop | 96x128 | Echelle chantier, metal jaune, diagonale lisible. |
| 06 Echafaudages | landmark_stage06_scaffold_tower | P2 | Landmark | 256x256 | Tour d'echafaudage complete, silhouette verticale, 16-bit clean. |
| 06 Echafaudages | hazard_stage06_falling_plank | P2 | Danger | 128x64, 6 frames | Planche qui tombe/glisse, telegraph ombre, impact poussiere. |
| 07 Charpente toiture | tile_stage07_roof_pack | P2 | Tiles sol | 32x32 tileable, 8 variantes | Zone toiture/charpente, bois, tuiles, poussiere, lignes propres, tileable. |
| 07 Charpente toiture | prop_stage07_wood_beam | P2 | Prop | 128x64 | Poutre bois de charpente, brune, contour noir, top-down 3/4. |
| 07 Charpente toiture | prop_stage07_roof_tiles_stack | P2 | Prop | 96x96 | Pile de tuiles rouges, lisible, basse. |
| 07 Charpente toiture | prop_stage07_insulation_roll | P2 | Prop | 96x64 | Rouleau d'isolant, jaune pale, contour sombre. |
| 07 Charpente toiture | prop_stage07_gutter | P3 | Prop | 128x64 | Gouttiere metal, grise, forme simple. |
| 07 Charpente toiture | landmark_stage07_roof_frame | P2 | Landmark | 256x192 | Structure de charpente, poutres croisees, top-down 3/4, propre. |
| 07 Charpente toiture | hazard_stage07_sliding_tile | P2 | Danger | 64x64, 6 frames | Tuile qui glisse/tombe, rouge brique, telegraph lisible. |
| 08 Second oeuvre | tile_stage08_interior_pack | P2 | Tiles sol | 32x32 tileable, 8 variantes | Sol interieur chantier, dalle propre, traces de poussiere, gaines, plaques, tileable. |
| 08 Second oeuvre | prop_stage08_plasterboard_stack | P2 | Prop | 128x96 | Plaques de platre empilees, blanc casse, contour sombre, sans texte. |
| 08 Second oeuvre | prop_stage08_electric_box | P2 | Prop | 64x96 | Tableau electrique chantier, gris/cyan, pas de texte. |
| 08 Second oeuvre | prop_stage08_cable_bundle | P2 | Prop | 96x64 | Faisceau de cables, rouge/bleu/noir, lisible. |
| 08 Second oeuvre | prop_stage08_pipe_bundle | P3 | Prop | 96x64 | Tuyaux PVC/cuivre empiles, couleurs differenciees. |
| 08 Second oeuvre | landmark_stage08_partition_wall | P2 | Landmark | 192x128 | Cloisons en cours de pose, plaques blanches, montants metal. |
| 08 Second oeuvre | hazard_stage08_live_wire | P2 | Danger | 96x64, 6 frames | Cable denude electrique, etincelles cyan, telegraph clair. |
| 09 Finitions | tile_stage09_finish_pack | P3 | Tiles sol | 32x32 tileable, 8 variantes | Sol de chantier presque fini, propre, baches, traces peinture, carreaux, tileable. |
| 09 Finitions | prop_stage09_paint_bucket | P2 | Prop | 64x64 | Pot de peinture, blanc/couleur vive, sans marque, contour noir. |
| 09 Finitions | prop_stage09_paint_roller | P2 | Prop | 64x64 | Rouleau peinture au sol, manche, peinture visible. |
| 09 Finitions | prop_stage09_protective_sheet | P3 | Prop | 128x96 | Bache de protection au sol, beige/gris, plis pixel art. |
| 09 Finitions | prop_stage09_tile_stack | P3 | Prop | 96x96 | Pile de carrelage, gris clair, propre. |
| 09 Finitions | landmark_stage09_finished_corner | P3 | Landmark | 256x192 | Coin de piece presque fini, peinture, plinthes, sol propre, 16-bit. |
| 09 Finitions | hazard_stage09_paint_slip | P2 | Danger | 96x96, 4 frames | Flaque de peinture glissante, couleur vive, bord sombre, animation subtile. |
| 10 Livraison finale | tile_stage10_final_pack | P3 | Tiles sol | 32x32 tileable, 8 variantes | Chantier livre, sol propre avec quelques defauts visibles, rubans, marques de reprise, tileable. |
| 10 Livraison finale | prop_stage10_finish_ribbon | P3 | Prop | 128x64 | Ruban de livraison/inauguration sans texte, rouge/jaune, pixel art. |
| 10 Livraison finale | prop_stage10_clean_cones | P3 | Prop | 64x64 | Cones propres alignes, orange/blanc, contour noir. |
| 10 Livraison finale | prop_stage10_punchlist_board | P3 | Prop | 96x128 | Tableau de chantier sans texte lisible, cases abstraites, prop decoratif. |
| 10 Livraison finale | prop_stage10_crack_marker | P3 | Prop | 64x64 | Marqueur de fissure au sol, ruban/trace rouge, lisible. |
| 10 Livraison finale | landmark_stage10_final_gate | P3 | Landmark | 256x192 | Portail de livraison chantier, rubans, projecteurs, ambiance finale arcade. |
| 10 Livraison finale | hazard_stage10_quality_zone | P3 | Danger | 96x96, 6 frames | Zone instable/fissure finale au sol, telegraph rouge/orange, sans texte. |

## 11. Habillage et densite des niveaux

Objectif : aucun stage ne doit ressembler a une arene vide avec trois props poses au hasard. Chaque niveau doit avoir une couche de dressing lisible, mais qui ne parasite jamais le gameplay.

Regle de densite recommandee par ecran :

| Couche | Quantite visible | Collision | Role |
|---|---:|---|---|
| Landmarks lourds | 1 a 3 | souvent bloquant ou hors zone | Donner l'identite du stage : engin, grue, dalle, echafaudage, toiture. |
| Props moyens | 5 a 12 | parfois bloquant | Remplir l'espace : palettes, sacs, tuyaux, planches, bennes. |
| Clutter bas | 10 a 30 | non bloquant | Eviter le vide sans gener le combat : cailloux, traces, cables plats, taches, poussiere. |
| PNJ ambiance | 0 a 4 | hors zone ou non bloquant | Donner de la vie, jamais des ennemis. |
| Animations decoratives | 1 a 5 | non bloquant | Poussiere, gyrophares, etincelles, rubalise qui bouge. |

Regles de lisibilite :

- les PNJ ne doivent jamais poursuivre le joueur ;
- les PNJ doivent avoir une palette moins agressive que les ennemis ;
- les ennemis doivent rester les seules silhouettes hostiles avec yeux/lueur/pose de menace ;
- les engins de chantier doivent etre clairement statiques ou animes lentement ;
- les props de danger doivent avoir un telegraph visuel distinct ;
- garder une zone jouable claire autour du joueur, sans mur invisible.
- ne jamais utiliser le meme kit d'habillage d'un stage a l'autre comme remplissage par defaut ;
- si un objet revient naturellement, il doit changer de contexte, taille ou role visuel.

### Signature d'habillage obligatoire par stage

Chaque stage doit etre reconnaissable en 2 secondes, meme sans ennemis a l'ecran. Les props ci-dessous sont les signatures prioritaires ; elles ne doivent pas etre remplacees par un decor chantier generique.

| Stage | Signature visuelle | Engins / landmarks propres | Props propres | PNJ ambiance propre | Clutter propre a repeter |
|---|---|---|---|---|---|
| 01 Terrain vierge | Terrain brut avant chantier, piquetage, herbes, terre encore naturelle | Panneau de chantier, barrieres temporaires, trepied geometre | Piquets, rubalise, pierres, touffes d'herbe | Geometre | Herbes seches, petits cailloux, traces legeres |
| 02 Terrassement | Terre retournee, boue, tranchees, passage d'engins lourds | Pelleteuse, camion benne, gyrophares | Tas de terre, tranchees, godets, pneus/chenilles | Signaleur chantier | Ornieres, poussiere, boue, traces de chenilles |
| 03 Fondations | Beton frais, coffrage, ferraillage, dalle en cours | Pompe a beton, betonniere, dalle coulee | Coffrages, palettes de ferraillage, sacs ciment | Macon | Taches beton, fissures fines, planches basses |
| 04 Reseaux enterres | Tranchees techniques, gaines colorees, regards | Mini-pelle reseaux, croisement de tuyaux | Tuyaux bleus, gaines rouges, tourets, regards | Electricien / technicien reseaux | Cables plats, petits panneaux sans texte, gravier de tranchee |
| 05 Gros oeuvre | Structure massive, parpaings, murs, grue | Grue a tour, camion toupie, poteaux beton | Palettes de briques/parpaings, murs, gravats | Equipe macon | Poussiere beton, morceaux de parpaings, marques de levage |
| 06 Echafaudages | Verticalite, metal, cadres, planchers provisoires | Nacelle ciseaux, tour echafaudage | Cadres empiles, planchers, garde-corps, echelles | Monteur echafaudage | Ombres de tubes, filets, attaches, petites roues/fixations |
| 07 Charpente toiture | Bois, tuiles, hauteur, structure de toit | Charge suspendue de poutres, charpente | Poutres, piles de tuiles, isolant, gouttieres | Couvreur | Ombres de charpente, sciure, tuiles glissees |
| 08 Second oeuvre | Interieur en travaux, cloisons, electricite, plomberie | Fourgon artisan, zone cloisons | Plaques de platre, tableau electrique, chariot outils, tuyaux | Plombier / electricien interieur | Poussiere de platre, cables courts, traces blanches |
| 09 Finitions | Chantier presque propre, peinture, carrelage, protections | Station peinture, zone carrelage | Pots peinture, rouleaux, baches, coupe-carrelage | Peintre | Taches peinture, scotch masquage, carreaux poses |
| 10 Livraison finale | Chantier livre mais maudit, reception, proprette inquietante | Portail final, projecteurs, barrieres propres | Ruban final, tableau punchlist sans texte, marqueurs defauts | Nettoyage / reception | Fissures propres, confettis sobres, zones de controle |

Objets autorises a revenir avec moderation : cones, barrieres, casques, gilets, petites lampes. Ils ne doivent jamais etre les assets principaux d'identite du stage.

### Assets d'habillage supplementaires par stage

| Stage | ID | Priorite | Type | Format | Prompt / methode Pixelabs |
|---|---|---:|---|---|---|
| 01 Terrain vierge | dressing_stage01_surveyor_npc | P1 | PNJ ambiance | 192x192, 4 frames idle | Geometre chantier non hostile, casque blanc, gilet jaune, tient une mire ou tablette, idle loop, top-down 3/4, style `player_j1`, palette calme, pas de pose agressive. |
| 01 Terrain vierge | dressing_stage01_geometer_tripod | P1 | Prop moyen | 64x64 | Trepied de geometre, jaune/noir, petit prop lisible, transparent. |
| 01 Terrain vierge | dressing_stage01_tire_tracks | P1 | Clutter sol | 128x128 | Traces de pneus legeres dans la terre, non bloquant, tileable partiel, brun sombre. |
| 01 Terrain vierge | dressing_stage01_fence_segment | P1 | Bord decor | 128x64 | Barriere temporaire de chantier, rouge/blanc ou jaune/noir, top-down 3/4, peut servir de bord d'arene. |
| 02 Terrassement | dressing_stage02_excavator_big | P0 | Engin landmark | 384x256 | Grande pelleteuse statique, jaune chantier, vue top-down 3/4, proportions 16-bit clean, contour noir, cabine lisible, godet visible, pas d'effet 3D. |
| 02 Terrassement | dressing_stage02_dump_truck_big | P0 | Engin landmark | 384x224 | Gros camion benne, jaune/orange, statique, benne remplie de terre, style `player_j1`, transparent. |
| 02 Terrassement | dressing_stage02_worker_spotter_npc | P1 | PNJ ambiance | 192x192, 4 frames idle | Ouvrier signaleur non hostile avec gilet orange et panneau stop sans texte lisible, idle loop, posture neutre. |
| 02 Terrassement | dressing_stage02_warning_beacon | P1 | Animation decor | 64x64, 4 frames | Gyrophare orange chantier, petite animation arcade, non bloquant. |
| 02 Terrassement | dressing_stage02_tire_ruts_pack | P1 | Clutter sol | 128x128, 4 variantes | Pack de traces de chenilles et pneus dans la boue, non bloquant, brun/orange. |
| 03 Fondations | dressing_stage03_concrete_pump | P1 | Engin landmark | 384x256 | Pompe a beton statique avec bras replie, jaune/gris, top-down 3/4, 16-bit clean, contour noir. |
| 03 Fondations | dressing_stage03_rebar_pallet | P0 | Prop moyen | 128x96 | Palette de ferraillage, barres metal empilees, readable, non hostile. |
| 03 Fondations | dressing_stage03_mason_npc | P1 | PNJ ambiance | 192x192, 4 frames idle | Macon non hostile, casque jaune, gilet orange, truelle ou taloche, idle loop, silhouette humaine neutre. |
| 03 Fondations | dressing_stage03_curing_blanket | P2 | Clutter sol | 128x96 | Bache de cure beton au sol, gris/bleu, plis pixel art, non bloquant. |
| 04 Reseaux enterres | dressing_stage04_mini_excavator | P1 | Engin landmark | 256x192 | Mini-pelle de reseaux, jaune, compacte, godet fin, statique, top-down 3/4. |
| 04 Reseaux enterres | dressing_stage04_pipe_rack | P1 | Prop moyen | 160x96 | Rateliers de tuyaux bleus/rouges, chantier reseaux, lisible, pas confondu avec ennemis. |
| 04 Reseaux enterres | dressing_stage04_electrician_npc | P1 | PNJ ambiance | 192x192, 4 frames idle | Electricien non hostile, casque blanc, gilet jaune, cable en main, idle, palette calme. |
| 04 Reseaux enterres | dressing_stage04_trench_signs | P2 | Props petits | 64x64, 3 variantes | Petits panneaux de danger sans texte lisible, jaune/noir, props decoratifs. |
| 05 Gros oeuvre | dressing_stage05_tower_crane | P1 | Engin landmark | 384x384 | Grue a tour visible en base ou section, jaune chantier, structure metal, top-down 3/4, imposante mais decor. |
| 05 Gros oeuvre | dressing_stage05_brick_pallet | P0 | Prop moyen | 128x96 | Palette de briques/parpaings empiles, contour noir, gris/rouge brique, lisible et non hostile. |
| 05 Gros oeuvre | dressing_stage05_mixer_truck | P1 | Engin landmark | 384x224 | Camion toupie beton, blanc/orange, statique, top-down 3/4, premium 16-bit. |
| 05 Gros oeuvre | dressing_stage05_mason_team_npc | P2 | PNJ ambiance | 192x192, 4 frames idle | Ouvrier macon non hostile, porte un parpaing ou consulte le mur, idle loop, pas de mouvement agressif. |
| 05 Gros oeuvre | dressing_stage05_gravel_debris_pack | P1 | Clutter sol | 128x128, 6 variantes | Gravats, petits morceaux de parpaing, poussiere beton, non bloquant, gris/brun. |
| 06 Echafaudages | dressing_stage06_scissor_lift | P2 | Engin landmark | 256x224 | Nacelle ciseaux statique, jaune/gris, top-down 3/4, propre, non hostile. |
| 06 Echafaudages | dressing_stage06_stacked_frames | P1 | Prop moyen | 160x96 | Pile de cadres d'echafaudage, metal gris/bleu, lisible. |
| 06 Echafaudages | dressing_stage06_scaffold_worker_npc | P2 | PNJ ambiance | 192x192, 4 frames idle | Monteur echafaudage non hostile, casque, harnais, idle loop, silhouette humaine claire. |
| 06 Echafaudages | dressing_stage06_safety_net | P2 | Bord decor | 192x96 | Filet de securite vert/bleu accroche a l'echafaudage, decor, non bloquant. |
| 07 Charpente toiture | dressing_stage07_roof_crane_load | P2 | Engin/charge | 256x192 | Charge suspendue de poutres bois, crochet de grue, top-down 3/4, decor telegraphique mais non hostile. |
| 07 Charpente toiture | dressing_stage07_wood_stack | P1 | Prop moyen | 160x96 | Pile de poutres bois, brune, contour noir, lisible. |
| 07 Charpente toiture | dressing_stage07_roofer_npc | P2 | PNJ ambiance | 192x192, 4 frames idle | Couvreur non hostile, casque, gilet, tient une tuile, idle loop, palette calme. |
| 07 Charpente toiture | dressing_stage07_roof_shadow_pack | P2 | Clutter sol | 128x128, 4 variantes | Ombres de charpente/toiture au sol, legeres, non bloquantes, pas floues. |
| 08 Second oeuvre | dressing_stage08_van_interior | P3 | Vehicule decor | 256x160 | Fourgon d'artisan partiellement visible, blanc/gris, top-down 3/4, statique, sans marque. |
| 08 Second oeuvre | dressing_stage08_tool_cart | P2 | Prop moyen | 96x96 | Chariot d'outils interieur, tournevis/perceuse abstraits mais non ennemis, lisible. |
| 08 Second oeuvre | dressing_stage08_plumber_npc | P2 | PNJ ambiance | 192x192, 4 frames idle | Plombier non hostile, casque, gilet, tuyau en main, idle loop. |
| 08 Second oeuvre | dressing_stage08_drywall_dust_pack | P2 | Clutter sol | 128x128, 4 variantes | Poussiere de platre au sol, traces blanches, non bloquant. |
| 09 Finitions | dressing_stage09_painter_npc | P2 | PNJ ambiance | 192x192, 4 frames idle | Peintre non hostile, rouleau en main, salopette blanche, gilet discret, idle loop. |
| 09 Finitions | dressing_stage09_paint_station | P2 | Prop moyen | 128x96 | Station peinture avec pots, rouleaux, bache, sans texte, couleur vive mais decor. |
| 09 Finitions | dressing_stage09_tile_cutter | P3 | Prop moyen | 128x96 | Coupe-carrelage manuel, metal/gris, statique, lisible. |
| 09 Finitions | dressing_stage09_masking_tape_lines | P3 | Clutter sol | 128x128, 4 variantes | Lignes de scotch de masquage au sol/mur, jaune pale, non bloquant. |
| 10 Livraison finale | dressing_stage10_cleaning_crew_npc | P3 | PNJ ambiance | 192x192, 4 frames idle | Agent de nettoyage chantier non hostile, tenue simple, balai/autolaveuse petite, idle loop, pas ennemi. |
| 10 Livraison finale | dressing_stage10_inspection_lights | P3 | Prop moyen | 96x128 | Projecteur de chantier final, jaune/noir, petite lumiere pixel, non moderne. |
| 10 Livraison finale | dressing_stage10_barrier_queue | P3 | Bord decor | 192x96 | Barrieres propres de reception, ruban rouge/jaune sans texte, decor final. |
| 10 Livraison finale | dressing_stage10_confetti_pixels | P3 | Animation decor | 96x96, 6 frames | Petits confettis pixel tres sobres pour victoire/livraison, arcade, non envahissant. |

## 12. Ennemis par stage

Regle : 3 ennemis par stage minimum, plus 1 boss ou mini-boss. Tous les ennemis communs sont des monstres, pas des outils vivants confus. Le chantier donne la matiere et la palette, mais la silhouette doit rester creature.

| Stage | ID | Priorite | Role | Format | Prompt / methode Pixelabs |
|---|---|---:|---|---|---|
| 01 Terrain vierge | enemy_stage01_imp_rubalise | P0 | Commun rapide | 192x192, 4x4 walk | Petit diablotin de chantier, rubalise comme echarpe, silhouette triangulaire rapide, couleur rouge/orange, casque casse optionnel, 4 directions down/right/up/left, 4 frames each. |
| 01 Terrain vierge | enemy_stage01_mudling | P0 | Commun standard | 192x192, 4x4 walk | Petite creature de terre boueuse, bras courts, gros yeux jaunes, brun/orange, forme ronde mais pas prop, marche lourde. |
| 01 Terrain vierge | enemy_stage01_root_stalker | P1 | Special zigzag | 192x192, 4x4 walk | Monstre de racines et terre seche, jambes nerveuses, silhouette fine, touches vert sombre, attaque en zigzag. |
| 01 Terrain vierge | boss_stage01_ground_keeper | P1 | Mini-boss | 256x256, 4x4 walk + attack | Gardien du terrain vierge, grand monstre de terre et piquets, silhouette massive, bras de racines, accents rubalise rouge/blanc, attack sheet avec frappe au sol. |
| 02 Terrassement | enemy_stage02_mud_worm | P0 | Commun rapide | 192x192, 4x4 walk | Ver de boue fantastique, tete expressive, dents simples, brun humide, silhouette allongee lisible, pas realiste. |
| 02 Terrassement | enemy_stage02_clay_golem | P0 | Commun tank | 192x192, 4x4 walk | Petit golem de glaise, corps carre, poings lourds, brun/orange, contour noir, marche lente. |
| 02 Terrassement | enemy_stage02_shovel_fiend | P1 | Special charge | 192x192, 4x4 walk | Demon de terrassement avec machoire en forme de godet, pas une pelleteuse, silhouette de creature, jaune chantier en accent, charge courte. |
| 02 Terrassement | boss_stage02_burrow_maw | P1 | Mini-boss | 256x256, 4x4 walk + attack | Grande gueule souterraine de boue, dents de roche, jaillit du sol, accents jaune chantier, attaque eboulement. |
| 03 Fondations | enemy_stage03_concrete_larva | P0 | Commun standard | 192x192, 4x4 walk | Larve de beton frais, gris chaud, fissures lumineuses orange, silhouette organique claire, avance en ondulant. |
| 03 Fondations | enemy_stage03_rebar_crawler | P0 | Commun perce | 192x192, 4x4 walk | Creature arachnoide de ferraillage, metal sombre, yeux jaunes, pattes simples, lisible a petite taille. |
| 03 Fondations | enemy_stage03_formwork_brute | P1 | Special tank | 192x192, 4x4 walk | Brute de coffrage possedee, corps bois/beton, grosse silhouette carree, bras puissants, pas juste une planche vivante. |
| 03 Fondations | boss_stage03_foundation_colossus | P1 | Mini-boss | 256x256, 4x4 walk + attack | Colosse des fondations, beton arme, ferraillage comme cornes/epaulettes, orange fissure, frappe au sol avec onde. |
| 04 Reseaux enterres | enemy_stage04_cable_serpent | P1 | Commun rapide | 192x192, 4x4 walk | Serpent de cables electriques, corps noir/rouge/bleu, tete de monstre lisible, etincelles cyan, pas simple cable. |
| 04 Reseaux enterres | enemy_stage04_pipe_slime | P1 | Commun standard | 192x192, 4x4 walk | Slime d'eau boueuse sortant de tuyaux, vert/gris, yeux lumineux, silhouette molle lisible. |
| 04 Reseaux enterres | enemy_stage04_duct_specter | P2 | Special distance | 192x192, 4x4 walk | Spectre de gaine rouge, corps fantomatique, masque sombre, lance petites etincelles, rouge/cyan. |
| 04 Reseaux enterres | boss_stage04_network_hydra | P2 | Mini-boss | 256x256, 4x4 walk + attack | Hydre de canalisations, plusieurs tetes de tuyaux-creatures, couleurs bleu/rouge/jaune, attaque jets/etincelles. |
| 05 Gros oeuvre | enemy_stage05_block_brute | P1 | Commun tank | 192x192, 4x4 walk | Brute de parpaing, corps de monstre massif, blocs gris comme armure, yeux orange, poings larges. |
| 05 Gros oeuvre | enemy_stage05_crane_wraith | P1 | Commun volant | 192x192, 4x4 walk/float | Spectre de grue, silhouette flottante, crochet comme queue, jaune/noir, tete fantomatique lisible. |
| 05 Gros oeuvre | enemy_stage05_mortar_beast | P2 | Special split | 192x192, 4x4 walk | Bete de mortier, corps gris humide, bouche large, crache petites flaques, silhouette organique. |
| 05 Gros oeuvre | boss_stage05_reinforced_titan | P2 | Boss | 384x384, 4x4 walk + attack + death | Titan de beton arme, immense, epaulettes parpaings, barres metal, fissures orange, boss principal gros oeuvre. |
| 06 Echafaudages | enemy_stage06_scaffold_climber | P2 | Commun rapide | 192x192, 4x4 walk | Creature grimpeuse d'echafaudage, membres longs, metal gris/jaune, tete monstrueuse claire, mouvement nerveux. |
| 06 Echafaudages | enemy_stage06_steel_spider | P2 | Commun swarm | 192x192, 4x4 walk | Petite creature d'acier a pattes, silhouette basse, accents jaune securite, pas trop detaillee. |
| 06 Echafaudages | enemy_stage06_guardrail_knight | P2 | Special defense | 192x192, 4x4 walk | Sentinelle de garde-corps, monstre armure metal, bouclier jaune/noir, posture defensive. |
| 06 Echafaudages | boss_stage06_scaffold_master | P3 | Mini-boss | 256x256, 4x4 walk + attack | Maitre des echafaudages, grand monstre metal/bois, bras articules, attaque chute de planches. |
| 07 Charpente toiture | enemy_stage07_roof_harpy | P2 | Commun volant | 192x192, 4x4 float | Harpie de toiture, ailes de tuiles, rouge brique, visage monstrueux lisible, mouvement flottant. |
| 07 Charpente toiture | enemy_stage07_beam_sprite | P2 | Commun standard | 192x192, 4x4 walk | Esprit de poutre bois, creature fine, brun/orange, jambes courtes, pas juste morceau de bois. |
| 07 Charpente toiture | enemy_stage07_tile_gargoyle | P3 | Special dive | 192x192, 4x4 walk/float | Gargouille de tuiles, corps pierre/tuile rouge, plonge sur le joueur, silhouette ailee compacte. |
| 07 Charpente toiture | boss_stage07_roof_chimera | P3 | Boss | 384x384, 4x4 walk + attack | Chimere de charpente, bois, tuiles, isolant, tete expressive, boss toiture, attaque rafales de tuiles. |
| 08 Second oeuvre | enemy_stage08_spark_spirit | P2 | Commun rapide | 192x192, 4x4 walk/float | Esprit electrique, corps bleu/cyan, gants jaunes, yeux blancs, silhouette claire, etincelles controlees. |
| 08 Second oeuvre | enemy_stage08_plaster_blob | P2 | Commun standard | 192x192, 4x4 walk | Blob de platre blanc/gris, bouche sombre, bras mous, contour noir epais, lisible sur sol clair. |
| 08 Second oeuvre | enemy_stage08_partition_mimic | P3 | Special ambush | 192x192, 4x4 walk | Mimic de cloison, creature plate avec dents, plaques de platre comme carapace, pas confondue avec prop. |
| 08 Second oeuvre | boss_stage08_short_circuit | P3 | Mini-boss | 256x256, 4x4 walk + attack | Monstre de surcharge electrique, cables comme membres, noyau cyan, attaque arcs electriques. |
| 09 Finitions | enemy_stage09_paint_ghost | P3 | Commun flottant | 192x192, 4x4 float | Fantome de peinture, drap de peinture coloree, yeux noirs, contour sombre, peinture vive comme accent. |
| 09 Finitions | enemy_stage09_dust_imp | P3 | Commun rapide | 192x192, 4x4 walk | Petit esprit de poussiere de platre, gris/blanc, yeux jaunes, silhouette compacte et lisible. |
| 09 Finitions | enemy_stage09_tile_mimic | P3 | Special dash | 192x192, 4x4 walk | Mimic de carrelage, monstre plat avec dents, motifs carreaux, mouvement de dash court, pas prop. |
| 09 Finitions | boss_stage09_master_painter | P3 | Mini-boss | 256x256, 4x4 walk + attack | Maitre peintre fantomatique, grand spectre arcade, rouleaux/pinceaux comme armes, attaques de flaques colorees. |
| 10 Livraison finale | enemy_stage10_crackling_defect | P3 | Commun standard | 192x192, 4x4 walk | Malfacon vivante, creature fissuree, beton propre qui craque, lueur orange, silhouette organique. |
| 10 Livraison finale | enemy_stage10_final_specter | P3 | Commun flottant | 192x192, 4x4 float | Spectre de reception finale, blanc/gris/jaune, forme fantomatique, pas de documents, pas de texte. |
| 10 Livraison finale | enemy_stage10_snag_beast | P3 | Special elite | 192x192, 4x4 walk | Bete des defauts restants, corps compose de fissures, rubans et poussiere, silhouette agressive, rouge/orange. |
| 10 Livraison finale | boss_stage10_cursed_foreman | P3 | Boss final | 384x384, 4x4 walk + attack + intro + death | Contremaitre maudit, boss final arcade, casque fissure, manteau/gilet chantier, aura orange, silhouette imposante, pas corporate, pas paperwork. |

## 13. VFX partages

| ID | Priorite | Format | Prompt / methode Pixelabs |
|---|---:|---|---|
| vfx_hit_spark | P0 | 64x64, 4 frames | Impact arcade jaune/blanc, petits pixels, utilisable pour coups communs. |
| vfx_enemy_death_puff | P0 | 96x96, 6 frames | Disparition monstre en poussiere/pixels, gris/orange, pas gore, universel. |
| vfx_level_up_burst | P0 | 128x128, 8 frames | Explosion circulaire positive, jaune/cyan, arcade 16-bit, lisible. |
| vfx_pickup_sparkle | P0 | 32x32, 4 frames | Petite etoile sparkle pixel pour pickups. |
| vfx_boss_spawn_circle | P1 | 192x192, 8 frames | Cercle de spawn boss au sol, orange/rouge, runes abstraites sans texte, telegraph clair. |
| vfx_dust_trail | P1 | 64x32, 4 frames | Petite poussiere de pas/charge, brun clair, utilisable par ennemis terrestres. |
| vfx_electric_arc | P2 | 96x64, 6 frames | Arc electrique cyan/jaune, pixel art, transparent. |
| vfx_concrete_crack | P2 | 128x128, 6 frames | Fissure au sol qui s'ouvre, orange sombre, telegraph danger. |
| vfx_paint_splash | P3 | 96x96, 6 frames | Splash peinture coloree au sol, lisible, non realiste. |

## 14. Ordre de production recommande

| Batch | Objectif | Assets |
|---|---|---|
| Batch 0 | Verrouiller le style | `player_worker_j1_master`, `enemy_stage01_imp_rubalise`, `enemy_stage01_mudling`, `tile_stage01_ground_pack`, `ui_panel_9slice`, `dressing_stage02_excavator_big` |
| Batch 1 | Vertical slice jouable | Tous P0 : stage 01, 3 armes de base, pickups, HUD, VFX hit/death/level up, premiers assets d'habillage |
| Batch 2 | Premiere progression chantier | Stage 02 + Stage 03 complets, boss 01-03 |
| Batch 3 | Systeme long terme | Stages 04-06, dangers, mini-boss |
| Batch 4 | Fin de campagne | Stages 07-10, boss majeurs, title/logo, polish UI |
| Batch 5 | Variantes elite | Elites, recolors controles, details premium, animations additionnelles |

## 15. Criteres de refus d'un asset

Refuser un asset si :

- il ne matche pas `player_j1` en densite de details et angle de vue ;
- il ressemble a un objet pose plutot qu'a un monstre lisible ;
- il devient illisible a environ 100 px de haut ;
- son contour est trop fin ou trop mou ;
- il contient du texte non voulu ;
- il melange perspective isometrique, side-view et top-down ;
- il introduit un style moderne, flou, 3D ou peinture digitale ;
- il se confond avec les props du meme stage ;
- il utilise une palette completement hors direction artistique.

## 16. Decision importante pour Claude Code

Pour l'integration, ne pas melanger les nouveaux assets Pixelabs avec les anciens ennemis LPC/Kenney dans la version reboot. Les anciens assets peuvent servir de placeholder technique uniquement, mais ils ne doivent pas rester dans une build de validation DA.

La premiere build reboot doit prouver la coherence avec :

1. `player_j1` ou son equivalent regenere,
2. un sol stage 01 propre,
3. deux ennemis communs stage 01,
4. une arme orbitale,
5. une UI pixel simple,
6. une capture gameplay ou tout est lisible instantanement.

## 17. Leçons du golden batch (Batch 0) — à appliquer au Batch 1

Pièges rencontrés en produisant + intégrant le golden batch (2026-07-01). À relire **avant** la production de masse.

### 17.1 Calibration des tailles — échelle PAR FEUILLE (piège n°1)
L'art natif PixelLab a des **hauteurs très différentes** à l'intérieur de la cellule (l'objet est centré avec beaucoup de transparent autour). Une **échelle unique** rend donc les créatures ~2× plus petites que le joueur. Exemple mesuré (cellule 192, échelle 0.516) : joueur affiché 83px mais huissier 45px, inspecteur 40px, paperasse 30px → incohérent.
- **Régle** : calibrer une **échelle par feuille** pour viser une **hauteur affichée cible** (bbox de l'art × échelle), pas la taille de cellule. Outil : `tools/assets/measure-sprite-size.mjs` (bbox réelle → taille affichée). Garder ses échelles synchronisées avec `CHAR_SCALE` dans `src/render/scenes/GameScene.ts`.
- **Hiérarchie de tailles** (MVP « petit rapide / moyen / gros lent ») : rapide < base < **joueur (~83px, référence)** ≈ gros/tank < **boss (~1.6–1.8× joueur)**. Le boss DOIT être nettement plus grand que le joueur (vérifié en jeu, pas à l'œil sur la planche).

### 17.2 Performance / mémoire des textures (le souci perf)
Les feuilles 4×4 en cellules 192/256 font 768²/1024² ; rendues en **WebGL logiciel** (SwiftShader, headless), plusieurs onglets parallèles **saturent la mémoire du renderer** → Playwright `net::ERR_ABORTED / frame detached`. Corrigé en sérialisant l'e2e (`workers:1` dans `playwright.config.ts`), mais c'est un pansement.
- **Régle** : l'art natif étant petit dans les cellules, **packer en cellules SERRÉES** (cellule ≈ taille de l'art : ~96 pour un ennemi standard, ~128–160 pour un gros) → ÷4 mémoire, et on peut restaurer le parallélisme e2e. Garder le master 192/256 comme source de vérité, mais charger une **copie runtime allégée**.
- Ne jamais « régler » un OOM de test en retirant les sprites des tests ni en ajoutant des retries.

### 17.3 Sol seamless sans damier (le souci « papier peint / grille »)
- **Tuiles plates** : générer en `tile_view: top-down`, `tile_view_angle: 90`, `tile_depth_ratio: 0` (sinon la profondeur 3D cuite crée des bandes « briques » au tiling).
- **Anti-damier** : même après ça, les variantes de tuiles diffèrent en luminance → un hash par cellule produit un **damier**. Remède : **normaliser toutes les tuiles de base à la MÊME luminance moyenne + aplatir le contraste interne** (`tools/assets/flatten-tiles.mjs`, K≈0.4 ; retenir les tuiles les plus uniformes). Une base quasi unie + décalques = rendu propre.
- **Variété par décalques épars NON-tilants** (flaque, herbe, fissure, traces, cailloux), posés hors grille via PRNG seedé (`src/render/ground.ts`), PAS par de grandes zones (garde le combat lisible).
- **Toujours juger le tiling sur un aperçu répété** (`tile-preview.mjs` = 4×4 d'une tuile, `ground-preview.mjs` = rendu « comme en jeu ») AVANT d'intégrer — c'est ça qui a attrapé le damier sur 16 tuiles au lieu de 200.

### 17.4 Décalques = marquages PLATS au sol
Par défaut PixelLab sort des props 3D avec ombre. Pour un décalque sol, prompt explicite : `flat ground marking, seen straight from directly above, no height, no 3D, no shadow, low contrast` + `shading: flat shading`. Sinon ça ressort en « tonneau » posé.

### 17.5 Pipeline packaging
- `tools/assets/pack-character.mjs` : centre chaque frame native dans une cellule, ordre des lignes **south/east/north/west** (= down/right/up/left, comme `player_j1`).
- **Téléchargement** : les URLs **backblaze** (rotations/animations) sont **publiques → curl SANS header d'auth** (ajouter un Bearer les fait échouer). Les URLs **PixelLab MCP** (`api.pixellab.ai/mcp/...`) nécessitent **`Authorization: Bearer <clé>`**.
- Pas d'ImageMagick fiable sur cette machine (`convert` = utilitaire disque Windows, DANGEREUX) → compositing via **Node + pngjs** (les scripts vivent dans `tools/assets/`, pas dans le scratchpad, pour résoudre `node_modules`).

### 17.7 Icônes = create_map_object (PAS create_ui_asset)
`create_ui_asset` génère des **panneaux** (min 192px, 20-40 générations) — inadapté aux icônes 64px. Générer les **icônes d'armes/upgrades** comme objets vue `side` via `create_map_object` (64px), puis trim (`tools/assets/trim-object.mjs`). **Projectiles/pickups** = `create_map_object` vue `high top-down`. Au rendu, distinguer les projectiles via `ProjectileState.type` (= weaponId : `cloueur`, `scie`) et les pickups via `PickupState.type` (`xp`) → mapping `PROJ_SPRITE`/`PICKUP_SPRITE` dans `GameScene`. Un objet fin/ambigu vu de dessus (ex : clou top-down) sort mal → le générer en `side` et l'orienter en jeu vers la vitesse.

### 17.6 Valider le late-game / boss via un bot kiting (seam)
Le tuning « skill récompensé » fait **mourir le jeu passif** en milieu de run → impossible d'atteindre le boss (5:00) en restant immobile. Pour capturer le boss : piloter un **bot kiting** via le seam (`setInput` fuyant l'ennemi le plus proche + biais vers le centre du monde, `chooseUpgrade(0)` à chaque montée de niveau, `advanceTime` par pas de 200ms). Le temps est **gelé** sur l'écran upgrade → toujours gérer le cas `screen==='upgrade'`.
