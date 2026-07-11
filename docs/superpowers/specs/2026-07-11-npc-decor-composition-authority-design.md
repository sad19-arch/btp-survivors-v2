# PNJ 2-catégories + « compo = vérité totale » — Design

**Goal :** Quand un stage a une composition sauvée, elle est la **source de vérité visuelle complète** : plus aucun contenu procédural fantôme (décor streamé, PNJ baseline auto). Les PNJ deviennent 2 catégories nettes, posées dans l'éditeur.

**Origine :** playtest terrain_vierge composé — l'utilisateur pose 1 géomètre mais en voit ~8 en jeu (siteWorkers `navetteur baseline`), et des traces de pneu partout (`decorStreamer`). Deux symptômes, une cause : le procédural tourne *en plus* de la compo.

## Principe unifié

Pour un `stageId` avec `getComposedLayout(stageId) !== null` :
- **`decorStreamer` OFF** — zéro décalque/prop ambiant auto. (fix traces de pneu)
- **`siteWorkers` auto-peuplement OFF** — zéro porteur/navetteur/baseline. (fix géomètres multipliés)
- Rendu = **la compo seule** : instances (décor/scènes/props posés) + PNJ posés.
- Stage **sans** compo → procédural conservé **inchangé** (fallback stages 03-10).

## Système PNJ (2 catégories, data-driven par skin)

- **Donnée** : `StageAmbientNpc.kind: 'trade' | 'worker'` (`stages.ts`). Terrain vierge : géomètre/topographe/piqueteur/ouvplan = `trade` ; nouveau skin ouvrier générique = `worker`.
- **Compo** : nouveau tableau `npcs: LayoutNpc[]` dans `StageLayout` (`stageLayout.ts`). `LayoutNpc = { id, skin, kind, x, y }` (coords compo, origine = centre monde).
- **Éditeur** : la palette expose 2 sections — **PNJ métier (fixe)** (skins `trade`) et **PNJ ouvrier (mobile)** (skins `worker`). Poser un PNJ ajoute un `LayoutNpc`. Un PNJ est un **système distinct** des instances de décor (fini le géomètre rendu en image statique). Rendu éditeur = sprite (frame 0) + badge fixe/mobile.
- **Import du stage généré** : amène les PNJ auto du stage comme `LayoutNpc` éditables (positions dérivées de la définition d'ambiance du stage) → l'utilisateur ajuste/déplace/supprime.
- **Rendu (`siteWorkers`)** — lit `compo.npcs` :
  - `trade` → **fixe** au point + animation de geste (comme aujourd'hui les stationnaires).
  - `worker` → animation de **marche** + **fuite** : s'éloigne quand un ennemi entre dans un rayon.

## Comportement de fuite (pur, testable)

`workerBehavior.ts` : `fleeVelocity(pos, enemies, fleeRadius, speed): {vx, vy}`.
- Ennemi le plus proche dans `fleeRadius` → vecteur unité opposé × `speed`.
- Aucun ennemi proche → `{0,0}` (flânerie douce gérée côté acteur, hors scope pur).
- **Cosmétique** (render-side, aucune collision ni impact gameplay/sim). Lit `state.enemies` fourni à `sync()`.

## Asset

1 **ouvrier générique** neuf (casque + gilet, **marche 4 directions 192×192**) via PixelLab, calibré `player_j1`, **golden-lock avant intégration**. Skin `worker` de terrain_vierge (réutilisable autres stages).

## Fichiers

- **Modifier** : `src/content/stageLayout.ts` (`LayoutNpc`, `npcs`), `src/render/stages.ts` (`kind` sur `StageAmbientNpc` + skin worker), `src/render/scenes/siteWorkers.ts` (compo→PNJ posés, coupe auto), `src/render/decorStreamer.ts` **ou** son appel dans `GameScene` (OFF si compo), `src/render/workerBehavior.ts` (`fleeVelocity`), `src/editor/PrefabCatalog.ts` (2 sections PNJ), `src/editor/EditorState.ts` (place/import NPCs), `src/editor/EditorScene.ts` (rendu NPC + badge), `src/editor/StageLayoutSchema.ts` (parse `npcs`).
- **Créer** : sprite worker (`public/stage01/npc/…`), tests `fleeVelocity` + « compo → 0 procédural ».

## Validation

- Vitest : `fleeVelocity` (fuite/ pas de fuite/ direction) ; test « stage composé → `decorStreamer` non appelé + `siteWorkers` ne crée que `npcs` ».
- Jeu : capture terrain_vierge composé → **1 PNJ posé = 1 en jeu**, zéro trace de pneu auto, l'ouvrier s'éloigne d'un ennemi qui approche.
- Gates : type-check, lint, vitest, **sim:check diff 0** (tout est render/éditeur — le core n'est pas touché), build.

## Hors périmètre

- Le comportement du PNJ métier face à un ennemi (il reste ; pas de fuite) — assumé.
- Plusieurs skins d'ouvriers, brosse à décor, densité réglable — extensions futures (l'utilisateur a tranché « je pose tout »).
