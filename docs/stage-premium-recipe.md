# Recette — production premium d'un stage (refonte « stages représentatifs »)

Suivre **exactement** ce pipeline pour chaque stage. Le **golden = stage 02** (commit `738d101` assets + `e746378` compo) est l'exemple de référence. Branche `feat/stage-identity`.

## Principe
Chaque stage doit se lire en 2 s comme sa phase de chantier : **sol** + **1-2 structures-héros** (gros engins/bâtiments) + **props/clutter signature** + **PNJ métier**, placés en **composition** (pas en vrac). Le moteur de compo est déjà là (`StageGeometry`, `DecorZone`, `resolvePlacement` anti-chevauchement).

## Étape A — Générer les assets premium (PixelLab MCP)
- Charger les outils : `ToolSearch "pixellab"` puis `select:mcp__pixellab__get_map_object`.
- Pour chaque asset : `create_map_object` avec `view:"high top-down"`, `outline:"single color outline"` (décalques : `"selective outline"` + `shading:"flat shading"` + `detail:"low detail"`), `shading:"medium shading"`, `detail:"medium detail"`.
- **Description = motif + STYLE GLOBAL** (suffixer TOUJOURS) : *« … Bold dark outline, compact readable silhouette, limited saturated palette, SNES / Mega Drive era, crisp pixels, no blur, no anti-aliasing, no realistic lighting, no text. »* Calibré sur `public/player_j1.png` (~192px worker).
- Tailles : gros engins/structures 176-256 ; props 96-160 ; décalques 72-128. Landmark 256.
- ⚠️ **Rate limit** : ~6 générations en parallèle max, sinon `create` renvoie « rate limit exceeded » → relancer l'asset.
- Poll `get_map_object(id)` → `status: completed` (regarde l'image = QA). Régénérer si un asset est raté (angle/lisibilité). La **cage** a demandé 2 essais (v2 = `low top-down` barreaux ajourés).

## Étape B — Download + QA planche
- Download : `curl -s -L "https://api.pixellab.ai/mcp/map-objects/<id>/download" -o test-results/premium-preview/<name>.png` (URL valide une fois `completed`).
- Planche QA : `node` sur un script pngjs (cf `scratchpad/montage.cjs` du golden) avec `NODE_PATH=<repo>/node_modules`. Vérifier lisibilité + cohérence style avant intégration.

## Étape C — Intégrer dans public/
- `cp` chaque PNG vers son chemin existant : `public/stageXX/props/*.png`, `public/stageXX/landmarks/*.png`, `public/stageXX/structures/*.png`, `public/stageXX/decals/*.png` (garder les NOMS de fichiers déjà référencés dans `stages.ts` → pas de warning nommage). Cage = `public/stage01/props/cage.png` (partagée).
- `npm run assets:qa` → **0 erreur** (les warnings de nommage préexistants sont tolérés).

## Étape D — Composition (`src/render/stages.ts`, entrée du stage)
Reproduire le patron stage 02 (`TERRASSEMENT_RENDER`) :
- **Gros engins/bâtiments-héros → `structures`** (placés 1 fois), `band:'near'` (320-500px, présents) pour 1-2 hero, `band:'mid'` pour le reste. Échelle ~1.0-1.2 (assets ~192px → ~2× le joueur).
- **Petit clutter (tas, débris) → `props`** (streamés).
- **`geometry.structureAngles`** = 1 angle/instance (ordre des structures, ex. hero NE, autre SE, autres O/SO, fond N/SO), `landmarkAngle`, `ambientAngle` (PNJ près du hero).
- **`zones`** : 2-3 secteurs métier (angleCenter/spread/dist 320-760, dominantDecalIndices, density 1.2-1.8).
- **`baseTileIndex`** (sol) + **`decalDensityMultiplier`** (densité DÉCROISSANTE 01→10 : brut ~1.2-1.4 début, ~0.6-0.8 finitions).
- Anti-chevauchement automatique (resolvePlacement) — ne rien casser.

## Étape E — Vérifier
- Capture : `npx playwright test golden-overview --project=chromium` (adapter `level=N` dans le spec, ou dupliquer). Lire `test-results/golden-stage02-overview.png` → composition + assets premium lisibles, **AUCUN chevauchement**.
- Gates : `npm run type-check` 0 · `lint` 0 · `test` (vitest) · **`sim:check` diff 0** (render-only) · `assets:qa` 0 erreur.
- Commit sur `feat/stage-identity` (assets + data compo). Pas de push.

## Brief créatif par phase (assets signature à générer)
- **01 terrain vierge** : sol terre/herbe ; héros = panneau chantier, barrières rouge/blanc ; props = piquets+rubalise, tas pierres, touffes herbe ; PNJ géomètre ; densité moyenne.
- **03 fondations** : sol béton gris+fissures ; héros = pompe à béton, dalle ; props = ferraillage, coffrage bois, sacs ciment, bétonnière ; PNJ maçon ; densité forte.
- **04 réseaux enterrés** : sol tranchée gravier ; héros = mini-pelle, croisement tuyaux ; props = tuyau bleu, gaine rouge, touret câble, regards ; PNJ électricien ; densité moyenne.
- **05 gros œuvre** : sol poussière béton clair ; héros = grue à tour, toupie, mur en cours ; props = palette parpaings, poteau béton, crochet grue ; PNJ équipe maçon ; densité moyenne.
- **06 échafaudages** : sol gris+ombres tubes ; héros = tour échafaudage, nacelle ; props = cadre écha., plancher, garde-corps, échelle ; PNJ monteur ; densité légère.
- **07 charpente/toiture** : sol brun+sciure ; héros = charpente bois, charge suspendue ; props = poutre, pile tuiles rouges, isolant, gouttière ; PNJ couvreur ; densité légère.
- **08 second œuvre** : sol dalle intérieure gris clair ; héros = zone cloisons, fourgon ; props = plaques plâtre, tableau élec, câbles, tuyaux PVC ; PNJ plombier ; densité légère.
- **09 finitions** : sol carrelage/peint lisse ; héros = station peinture ; props = pots peinture, rouleau, bâche, pile carrelage ; PNJ peintre ; densité très légère.
- **10 livraison/audit** : sol propre + fissures fines orange (menace) ; héros = portail livraison (ruban), barrières propres ; props = cônes alignés, ruban, projecteurs, marqueurs fissure ; PNJ agent réception ; densité minimale.

Langage transversal : jaune sécurité constant (engins/PNJ) ; accent brun (01-02)→gris (03-06)→clair (07-10) ; densité brut→fini. Ordre de déroulé : 03→04→05→06→07→08→09→10→01.
