---
name: assets
description: Use BEFORE creating, generating, or integrating ANY visual asset (sprite, enemy, prop, tile, UI, VFX, icon). Enforces the BTP Survivors "asset factory" process — source of visual truth (player_j1), ask-the-user-per-asset, the PixelLab global prompt, golden-batch-first, automated QA, and refusal criteria. The full spec is docs/asset-manifest.md.
---

# Assets — process de création visuelle (obligatoire)

La DA est un **pilier produit** (PRD). Tout asset suit ce process. Référence complète, tables (formats, nommage, prompts par asset, ennemis/props par stage) : **`docs/asset-manifest.md`**.

## Règles non négociables

1. **Source de vérité visuelle = `public/player_j1.png`** (planche **768×768** = 4×4 de frames **192×192**, ordre `down/right/up/left`, 4 frames/dir, rendu en jeu ~99 px de haut). Tout nouveau perso/ennemi/monstre se calibre dessus : silhouette compacte, lecture immédiate en 2 s, contour sombre, palette 16-bit arcade, **pas de rendu moderne/3D/flou**.
2. **Demander la source à CHAQUE besoin d'asset** : réutiliser un CC0 (Kenney) existant / **générer via PixelLab (MCP)** / l'utilisateur le fournit. **Jamais de génération silencieuse** (consomme du quota).
3. **Ne jamais tout produire d'un coup.** Verrouiller le style sur un petit **golden batch** avant de consommer du quota. Produire **stage par stage**, pas catégorie par catégorie.
4. **Pas de mélange DA** : ne pas mêler nouveaux assets PixelLab et anciens LPC/Kenney dans une build de validation DA. L'ancien = placeholder technique uniquement.
5. **Valider par planche**, pas fichier par fichier. La QA est automatisée (`npm run assets:qa`).

## Prompt global PixelLab (à préfixer à CHAQUE génération)

```
16-bit clean arcade pixel art, top-down three-quarter RPG view, matching a 192x192 construction worker spritesheet, bold dark outline, compact readable silhouette, limited saturated color palette, SNES/Mega Drive era, crisp pixels, transparent background, no blur, no anti-aliased painting, no modern vector look, no realistic lighting, no text, no watermark
```

Négatif global :

```
no photorealism, no 3D render, no smooth digital painting, no soft gradients, no thin outlines, no messy tiny details, no UI text, no watermark, no isometric diamond perspective, no side-scroller perspective, no random tools as enemies, no ambiguous object-monster hybrid that cannot be read at small size
```

## Outils MCP PixelLab par type d'asset

| Besoin | Outil PixelLab | Format cible |
|---|---|---|
| Perso / ennemi (marche 4 dir.) | `create_character` puis `animate_character` (walk) | 192×192, 4×4 |
| Mini-boss / boss | `create_character` + `animate_character` (walk + attack) | 256×256 / 384×384 |
| Prop, engin, landmark | `create_map_object` (ou `create_1_direction_object`) | selon table manifest |
| Tileset sol | `create_topdown_tileset` | 32×32 tileable |
| UI (panneau, bouton, carte, barre) | `create_ui_asset` | selon table |
| Icône d'upgrade | `create_ui_asset` | 32×32 / 64×64 |

> **Moteur de génération UNIQUE = PixelLab (MCP)** (A/B tranché sur le golden batch ; Gamelabs écarté car illustration peinte hors-DA). PixelLab couvre tout le pipeline (`create_character` + `animate_character`, `create_topdown_tileset`, `create_map_object`, `create_ui_asset`). Mêmes règles : calibration `player_j1`, prompt global, QA. Aseprite (computer-use) pour le nettoyage.

## Process "asset factory"

1. **Concept lock** — 1 sprite *facing down*, fond transparent ; réduit à ~100 px à côté de `player_j1`. Rejeter si illisible en 2 s.
2. **Palette lock** — 1 couleur dominante par famille d'ennemis, 1 accent chantier par stage (éviter le tout-bleu/noir).
3. **Sheet walk** — 192×192, 4×4, ordre `down/right/up/left`.
4. **QA auto** — `npm run assets:qa` : dimensions, transparence, nommage, pixels parasites. Tout échec = renommé/corrigé/refusé avant intégration.
5. **Validation par planche** — une image récap par stage.
6. **Integration test** — capturer dans un mock gameplay (sol + joueur + projectile + 10 ennemis) ; si l'asset se confond avec un prop, il est **refusé** même s'il est joli.

**Golden batch (Batch 0)** à verrouiller AVANT toute production de masse :
`player_worker_j1_master`, `enemy_stage01_imp_rubalise`, `enemy_stage01_mudling`, `tile_stage01_ground_pack`, `ui_panel_9slice`, `dressing_stage02_excavator_big`.

## Nommage (voir manifest §6)

`enemy_stageXX_nom_walk_192.png` · `boss_stageXX_nom_walk_256.png` · `prop_stageXX_nom.png` · `tile_stageXX_nom_32.png` · `icon_nom_32.png` · `ui_nom.png` · `vfx_nom_sheet.png`. Les assets vivent dans `public/`.

## Critères de refus (manifest §15)

Refuser si : ne matche pas `player_j1` (densité/angle) · ressemble à un objet posé plutôt qu'à un monstre · illisible à ~100 px · contour trop fin/mou · texte non voulu · mélange de perspectives · style moderne/flou/3D · se confond avec les props du stage · palette hors DA.

## Anti-patterns

- ❌ Générer un asset sans demander la source à l'utilisateur. → ✅ Toujours demander (CC0 / PixelLab / fourni).
- ❌ Lancer la production des 10 stages en parallèle. → ✅ Golden batch d'abord, puis stage par stage.
- ❌ Valider 200 PNG à l'œil. → ✅ `npm run assets:qa` + planche récap.
- ❌ Garder de vieux sprites LPC/Kenney dans une build de validation DA. → ✅ Placeholder technique uniquement.
