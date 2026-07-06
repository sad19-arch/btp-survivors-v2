# Recette — PNJ métier animés (« vie du chantier », feat/stage-life)

Ajouter **3-4 PNJ métier animés** par stage (à côté du PNJ existant), pour que chaque
chantier grouille d'ouvriers qui travaillent (et râlent quand le joueur glande).
**Golden éprouvé = stage 02** (commit `1d228c8`). Observer-only : `sim:check` reste diff 0.

## Pipeline par PNJ (éprouvé)

1. **create_character** (MCP PixelLab) :
   ```
   create_character(
     description: "<ouvrier + outil tenu + activité> , orange hi-vis safety vest, yellow hard hat, work boots, compact stocky readable build. 16-bit clean arcade pixel art, bold dark outline, limited saturated palette, SNES/Mega Drive era, crisp pixels, no blur, no text.",
     view: "high top-down", n_directions: 4, size: 64,
     outline: "single color black outline", shading: "basic shading", name: "<Metier> stageXX"
   )
   ```
   → id. **Décris l'ouvrier + un outil CLAIREMENT tenu** (« holding a trowel », « carrying a plank »),
   évite les verbes d'action ambigus seuls (« digging » a échoué 3×). **Relance sur `status: failed`**
   (les « Generation failed » arrivent ~1/4 ; recrée simplement).

2. **Poll** `get_character(id)` jusqu'à `status: completed`.

3. **animate_character** (marche, 4 directions, template) :
   ```
   animate_character(character_id: id, template_animation_id: "walk")
   ```
   → 4 jobs (~2-4 min). **Poll** `get_character(id)` jusqu'à voir `animations (4)` avec `walk (south, 6f)`.

4. **Récupère l'URL des frames SUD** de l'anim walk dans la sortie `get_character` :
   `https://backblaze.pixellab.ai/file/pixellab-characters/<proj>/<charId>/animations/<animId>/south`
   (frames `0.png`..`5.png`).

5. **Pack** en feuille du jeu (⚠️ **4 frames** car `SHEET_FRAMES = 4` — 6 frames casse l'anim) :
   ```
   node tools/assets/pack-npc.mjs "<baseUrlSud>" 4 256 public/stageXX/npc/<metier>_work.png 95 0
   ```
   → écrit `1024x256`, imprime **`scale pour ~95px = <N>`** → note `<N>`.

6. **Intègre** dans `src/render/stages.ts`, tableau `ambient` du stage (à côté de l'existant) :
   ```ts
   { key: 'npc_stageXX_<metier>', file: 'stageXX/npc/<metier>_work.png', frame: 256, scale: <N>, framePeriodMs: 300, behavior: 'work' }
   ```
   `behavior: 'patrol'` pour un PNJ qui doit se balader plus large (signaleur, porteur) ; `'work'` sinon.

## Métiers par phase (3-4 nouveaux ; cohérents avec l'étape)

| Stage | Existant | Nouveaux (exemples) |
|---|---|---|
| 01 terrain vierge | géomètre | topographe (mire), piqueteur, ouvrier plan |
| 03 fondations | ferrailleur | coffreur (planche), bétonnier (seau), porteur sac ciment |
| 04 réseaux enterrés | électricien | plombier (tuyau), poseur de câble (touret), terrassier tranchée |
| 05 gros œuvre | maçon | parpaingueur, porteur de parpaing, grutier au sol (radio) |
| 06 échafaudages | échafaudeur | monteur de tube, porteur de planche, ouvrier nacelle |
| 07 charpente/toiture | couvreur | charpentier (marteau), porteur de tuiles, poseur de liteau |
| 08 second œuvre | plaquiste | plombier (tuyau PVC), électricien (gaine), porteur de plaque |
| 09 finitions | peintre | carreleur (truelle crantée), poseur de sol, porteur de pot |
| 10 livraison/audit | inspecteur | agent réception (clipboard), technicien, porteur de carton |

Langage transversal : gilet orange + casque jaune constants ; silhouette compacte lisible à ~95px.

## Gates (par stage, avant commit)

- `npm run assets:qa` → **0 erreur** (garde-fou détourage : un PNJ à fond opaque = erreur ; les feuilles
  packées ont 0 coin opaque).
- `npm run type-check` 0 · `npm run lint` 0 · `npm run test` (Vitest) · **`npm run sim:check` VERT diff 0**.
- **Capture** : faire marcher le joueur parmi les PNJ (`window.__GAME__.debugAmbientNpcs()` + `setInput`),
  screenshot → sprites nets, bonne taille (cohérente avec le joueur), bulles OK.
- Commit par stage sur `feat/stage-life`. Pas de push.

## Ordre de déroulé

Stage par stage, **séquentiel** (tous éditent `src/render/stages.ts` → conflit si parallèle) :
01 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 (02 = golden déjà fait). Bilan groupé (planche) à la fin.
