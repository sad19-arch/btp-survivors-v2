# Composition cohérente de chantier + terrain tactique (design)

> Refonte de la mise en scène des niveaux : passer d'un **semis d'assets isolés** (qui lit « en vrac ») à une **composition par clusters cohérents**, avec **collision** (terrain tactique). Golden **terrassement** d'abord, puis déroulé des 9 autres stages.

## Problème
Les stages sont « jolis mais en vrac » : le décor est placé par **zones + densité** (semis individuel de tas/ornières par chunk) et par angles scriptés pour les hero-props, sans **logique de chantier réel**. Un terrassement réel a une organisation (accès camion → parc/pause → excavation clôturée), pas des objets flottants.

## Décisions (validées)
1. **Modèle** : **clusters prefab procéduraux**. On garde le monde streamé (10240×7680) ; on place des **blocs cohérents** (Lego) via une **carte de zones grossière seedée**, avec espacement anti-chevauchement. La méthode « plan de site » sert à concevoir chaque cluster + la grille de zones.
2. **Assets** : **générer le set manquant** (PixelLab) — panneau de clôture chantier (répétable), bande de route/piste, portail d'accès, poteau d'angle. Golden-lock du style d'abord.
3. **Terrain tactique** : le décor devient **collidable** → connu de la **sim** (`src/core`). Change le gameplay et l'équilibrage.
4. **Clôtures & IA** : **champ de flux** (pathfinding léger, déterministe, partagé) → les ennemis **contournent** les obstacles et rejoignent le **portail**. Les enclos peuvent donc être des **anneaux quasi-fermés avec une ouverture (gate)** — plus fidèles au vrai chantier. Push-out + glissement en complément. **Spawn et lanes garantis sans blocage.**
5. **Déroulé** : **golden terrassement** (compo + collision + assets + capture → validation) **puis** les 9 stages.

## Contraintes d'architecture (impératives)
- **Séparation sim/rendu** : la **géométrie du site** (ancres de clusters + formes collidables) est calculée en **`src/core`/`src/content`** (pur, seedé) ; consommée par **la sim** (collision) ET **le rendu** (dessin), aux **mêmes positions**. `src/core` n'importe jamais Phaser/DOM.
- **Déterminisme** : `siteLayout` calculé **une fois** au `reset()` depuis la seed via une **dérivation dédiée** (`siteRng`, seed^const distinct — n'AVANCE PAS le flux RNG loot/chest/wave). Zéro `Math.random`/`Date.now`. Même seed ⇒ même site ⇒ mêmes collisions ⇒ run rejouable.
- **Data-driven** : prefabs et zonage = données typées validées au boot. Pas de placement copié-collé.
- **Perf** : obstacles statiques indexés spatialement (réutiliser la `SpatialGrid` existante de `src/core`), requête O(1) par entité (cellule locale). Streaming O(1) conservé.
- **DA 16-bit** : nouveaux assets calibrés `player_j1`, prompt global, QA (`npm run assets:qa`), pas de mélange DA.
- **Anti-god-object** : le dessin des clusters va dans un **module de rendu dédié** (ex. `siteRenderer.ts`), pas dans `GameScene`.
- Zéro `any` core, TS strict, ESLint 0.

## Modèle de données

### Prefabs (clusters) — `src/content/clusters.ts` (data pure)
Un cluster = un template d'éléments à offsets relatifs :
```
ClusterElement {
  assetKey: string        // clé d'asset (rendu)
  dx, dy: number          // offset px depuis l'ancre du cluster
  scale: number
  collide: 'both' | 'enemies' | 'none'   // qui l'élément bloque
  shape: { kind: 'circle', r } | { kind: 'segment', x2, y2, thickness }  // forme collidable (si collide≠none)
}
ClusterDef { id: string; elements: ClusterElement[]; footprintRadius: number }
```
Terrassement (exemple) : `cluster_excavation` (fosse `both` + 5-6 panneaux clôture `both` en U ouvert + pelleteuse `none` accolée + benne `none` + 2 tas `none` + ornières `none`), `cluster_spoil` (tas + flaques, `none`), `cluster_plant` (rouleau+dozer, `none`), `cluster_pause` (cabane, `none`), `cluster_route` (bande route + barrières `both` + portail = ouverture).

### Zonage — `src/core/siteLayout.ts` (pur, seedé)
`buildSiteLayout(seed, worldW, worldH, stageId): SiteLayout`
- **Route** : bande basse `y ∈ [worldH - ROUTE_BAND, worldH]` (bord sud), portails ponctuels.
- **Zonage par distance à la route** : proche = parc/pause/staging ; loin (nord) = excavation. Sur une **grille de cellules** (~`CELL` px, ex. 2048) jittée, chaque cellule reçoit un **type de cluster** selon sa bande + un tirage `siteRng`.
- **Espacement** : ancres espacées ≥ `MIN_GAP` (lanes de kite ≥ ~400 px) ; anti-chevauchement (rejet si trop proche d'une ancre déjà posée — dart-throwing déterministe).
- **Sécurité spawn** : aucune ancre de cluster **collidable** dans le disque `SPAWN_SAFE_R` (≥ 400 px) autour du spawn (5120,3840) ; garantit des lanes de sortie.
- Sortie : `{ clusters: {defId, x, y}[], obstacles: Obstacle[] }` (obstacles = formes collidables absolues dérivées des prefabs).

### Collision — `src/core/systems/obstacleCollision.ts`
- Après le déplacement de chaque entité (joueur + ennemis), **push-out** hors des obstacles chevauchés (résolution de pénétration circle↔circle / circle↔segment), déterministe.
- **Navigation ennemie** : direction = **champ de flux** (cf. ci-dessous) mélangée au chase direct ; la vitesse qui pénètre encore un obstacle est **projetée sur la tangente** (glissement) en complément.
- **Par cible** : `collide: 'both'` bloque joueur+ennemis ; `'enemies'` bloque seulement les ennemis ; `'none'` = cosmétique (non collidable).
- Requête via `SpatialGrid` (obstacles insérés une fois au reset).
- **Le joueur n'est jamais piégé** : tout enclos a un **portail**, spawn/lanes sûrs (garantis par le zonage).

### Pathfinding — champ de flux — `src/core/systems/flowField.ts`
- **UN seul BFS/Dijkstra depuis le joueur** sur une **grille locale grossière** (fenêtre ~4096² autour du joueur, cellule ~128 px → ~32×32 cellules) → un **champ de directions** vers le joueur en **contournant les obstacles**. Partagé par TOUS les ennemis (échantillonnage **O(1)/ennemi**) → coût ~indépendant du nombre d'ennemis.
- **Throttle** : rebâti seulement quand le joueur **change de cellule** (~toutes les 6–10 frames), pas chaque frame.
- **Déterministe** : grille + obstacles + ordre de voisins fixes, **zéro RNG** → même coût en headless (`sim:check`).
- **Repli** : un ennemi **hors de la fenêtre locale** (loin du joueur) suit le chase direct (les obstacles sont locaux aux clusters proches).
- **Anti-escalier** : la direction du flux est **mélangée** au vecteur chase direct pour lisser les coins.

### Rendu — `src/render/siteRenderer.ts` (observateur)
- Consomme `SiteLayout` (exposé via getState ou fourni au boot) pour **dessiner les clusters aux mêmes positions** que la sim. Remplace le semis hero par des clusters ; garde un léger clutter streamé pour la texture.
- Streaming : n'affiche que les clusters dont l'empreinte recoupe la vue (cull par cellule).

### Vie du chantier — ouvriers navetteurs — `src/render/siteWorkers.ts` (observateur, **remplace l'errance ambiante `ambientNpc.ts`**)
- **Densité : ~10 ouvriers actifs dans la région autour du joueur** (streamés comme le décor : ré-ancrés sur les clusters proches quand le joueur se déplace — PAS 10 figés au spawn dans un monde de 10240×7680). Répartis sur plusieurs paires de zones + rôles métier. Perf négligeable (cosmétique).
- Chaque ouvrier reçoit **2 ancres de zones** (issues de `SiteLayout`, ex. fosse ↔ benne) + un **rôle métier** + un **geste** à chaque bout. Il fait la **navette** (déterministe, temps-piloté) et joue le geste à l'arrivée.
- **Charge visible** : un sprite de charge (brouette pleine/vide, planche, seau) attaché, qui **apparaît au chargement** (fosse) et **disparaît au déchargement** (benne) → l'aller « plein », le retour « vide ».
- **Réactif à la horde** : si un ennemi entre dans un rayon `PANIC_R`, l'ouvrier **panique** (s'arrête/fuit à l'opposé du plus proche ennemi + emote de panique, lâche éventuellement sa charge) ; reprend la navette une fois dégagé.
- **Lisibilité (impératif)** : gilet haute-visibilité + silhouette non-menaçante + emote de panique **distincte** de la bulle « Merci » des prisonniers → jamais confondu avec un ennemi ni un objectif de jeu.
- **100 % cosmétique** : non-collidable, ne touche JAMAIS la sim (lit `state.enemies` seulement pour la proximité) → **`sim:check` diff 0**. Fonctions pures (navette, cycle de charge, décision de panique) testées ; le rendu Phaser observe.

## Assets à générer (PixelLab, golden-lock)
`fence_panel` (panneau clôture chantier répétable), `road_strip` (bande route), `site_gate` (portail), `fence_post` (poteau d'angle). Calibrés DA 16-bit ; concept-lock sur 1 asset (le panneau) avant le reste. QA verte + planche.
**Ouvriers** : pose « porte une charge » + accessoires de charge (brouette pleine/vide — `brouette` existe déjà — planche, seau) + emote de panique. Générés seulement si absents (les feuilles de marche PNJ par stage existent déjà). Gilet haute-visibilité pour la lisibilité.

## Équilibrage
Les obstacles changent le kite (couverts, goulots, glissement horde) → **re-tune + re-baseline** obligatoire (`sim:check` re-dérivé). ⚠️ Le lot juice en pause (`feat/addiction-juice`, J8/J9 rythme+drops) touche AUSSI l'équilibrage : quand les deux fusionneront, prévoir un **re-tune combiné** (ne pas re-baseliner deux fois à l'aveugle).

## Sécurité / anti-frustration (invariants à tester)
- Aucun obstacle `both` dans `SPAWN_SAFE_R` du spawn.
- Tout enclos a **au moins un portail** (le champ de flux y route les ennemis) — testé sur les prefabs.
- Le joueur ne peut pas être enfermé (au moins une lane libre depuis toute cellule) — testé sur le zonage.
- Déterminisme : même seed ⇒ obstacles identiques (test).
- `siteRng` n'altère pas le flux RNG de la sim (test : liste d'ennemis/loot identique avec/sans site — comme l'isolation `_waveRng`/`chestRng`).

## Vérification
Gates par tâche : tsc 0 · lint 0 · Vitest (siteLayout, collision, prefabs, invariants) · **sim:check** (diff attendu → re-baseliné en fin) · e2e (le joueur ne se coince pas ; capture golden) · assets:qa. Oracle final = playtest (« le chantier est-il lisible et le terrain est-il fun sans frustrer ? »).

## Séquencement (golden-first)
1. **Assets golden** (panneau clôture d'abord → set) + QA.
2. **Data** : `clusters.ts` (prefabs terrassement) + `siteLayout.ts` (zonage pur seedé) + tests.
3. **Collision core** : `obstacleCollision.ts` (push-out `both`/`enemies`, sécurité spawn) + tests + isolation RNG.
4. **Pathfinding** : `flowField.ts` (BFS local depuis le joueur, throttlé, déterministe) + branchement `enemyAi` (mélange flux+chase+glissement) + tests (contournement d'un obstacle, jamais coincé).
5. **Rendu** : `siteRenderer.ts` (dessine clusters aux positions sim) + cull streaming.
6. **Ouvriers navetteurs** : `siteWorkers.ts` (navette 2 zones + charge visible + panique horde ; **remplace `ambientNpc.ts`**), render-only + fonctions pures testées.
7. **Golden terrassement** : brancher, capture en jeu → **GATE user** (validation visuelle + jouabilité).
8. **Re-tune + re-baseline** sim.
9. **Déroulé 9 stages** : prefabs + zonage + rôles d'ouvriers par stage (chacun : sémantique → contraintes → prefabs → ASCII → auto-vérif), stage par stage, capture.

## Hors périmètre
A\* par ennemi / navmesh complet (le champ de flux partagé suffit). Destruction d'obstacles. Collision entre décors non-collidables. Refonte du sol en « vraies routes » de tuiles (la route = bande de décor/asset). Le lot juice (séparé).
