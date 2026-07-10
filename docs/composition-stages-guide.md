# BTP Survivors — Guide de composition des 10 stages (travail collaboratif)

> **But de ce doc.** Il te sert (toi + une autre IA) à préparer, en autonomie, les
> **ébauches de composition** de chaque stage. Ce que je (Claude Code) transforme
> ensuite en code testé : `sitePrograms.ts` (le programme sémantique) + `clusters.ts`
> (les scènes). **Ce que j'attends de vous, concrètement** : pour chaque stage,
> une **table d'association** (« quels assets vont ENSEMBLE, et pourquoi ») +
> éventuellement un **plan ASCII** (vue drone). Le §7 donne le gabarit exact.

---

## 1. Contexte du jeu (rappel court)

- **BTP Survivors** = *Vampire-Survivors-like* sur un **chantier**. On survit à des
  vagues d'ennemis bureaucratiques à travers le **cycle de vie d'un chantier**.
- **Colonne vertébrale = 10 phases ordonnées** (ci-dessous). Chaque phase = un stage.
- Vue **top-down**, monde immense (10240×7680), le joueur au centre, caméra qui suit.
- **Cible** : PC + manette. DA **16-bit arcade** (pixel art, contour sombre, palette
  saturée limitée). Le perso joueur fait **~99 px** de haut : c'est **l'unité de taille**.

---

## 2. Récap : ce qui s'est passé (pourquoi on en est là)

**Le problème.** Les stages avaient l'air « éparpillés » : des objets posés au hasard,
deux pelleteuses collées, des câbles tous les 2 m, une vue drone qui ne ressemblait
**pas** à un vrai chantier. Cause racine dans le code : le placement se faisait
**cellule par cellule à pile-ou-face** (`rng.chance(0.5)`), sans **zones**, sans
**portail**, sans **chemins**, sans **règles d'exclusion**. Plusieurs couches posaient
des engins **sans se coordonner**.

**Les fausses pistes (ce qui n'a PAS marché, et pourquoi).**
1. *Rendre le bruit « plus joli »* → toujours du bruit. Il manquait une **logique
   globale** (un plan masse), pas de la déco en plus.
2. *Poser des objets atomiques* (un trou ici, une pelleteuse là, indépendamment) →
   on obtient **un trou nu sans déblais ni engin**. Retour utilisateur, mots exacts :
   « un trou ça n'apparaît pas par magie céleste ». L'unité de composition était trop
   petite.
3. *Faire pivoter un sprite debout* (clôture, panneau) pour suivre une direction →
   **il se couche**. Idem, poteau lesté redondant à côté d'un panneau qui a déjà ses plots.
4. *Valider au zoom arrière / par le nom de fichier* → on croit que « ça marche »
   alors qu'au **zoom de jeu** c'est illisible. Il faut juger **en contexte, comme un joueur**.
5. *Deux systèmes de PNJ en parallèle* (errance aléatoire + ouvriers) → tailles
   incohérentes (certains minuscules, certains géants) et mouvements « n'importe quoi ».

**Comment on a redressé.** On a encodé une **méthode de contremaître en 6 étapes**
(raisonnement sémantique → contraintes → prefabs → plan ASCII → auto-vérification →
déploiement) **directement en code vérifiable** :
- le **programme sémantique** d'un stage devient des **données** (`sitePrograms.ts`) ;
- chaque **contrainte** de placement devient un **test** (rouge = CI refuse le plan) ;
- l'**ASCII** et la **vue drone** sont des artefacts **générés** qu'on juge en 10 s **avant** les pixels ;
- on **compose des SCÈNES, pas des objets** : un trou vient TOUJOURS avec ses
  déblais + l'engin qui l'a creusé (groupe indivisible).

Résultat sur le **golden terrassement** : plan masse cohérent (portail au sud →
base vie / parc engins près de l'entrée → grande fouille clôturée au nord → déblais
adjacents → piste de roulage), joueur qui **naît au bord d'un trou avec sa pelleteuse**,
camions qui roulent le long de la clôture, ouvriers qui font la navette entre fouilles.
**C'est ce modèle qu'on réplique sur les 9 autres stages.**

---

## 3. Les règles apprises (à respecter dans TES ébauches)

**Règles de composition (le cœur) :**
- **R-A — Plan sémantique d'abord.** Zones / portail / chemins pensés en contremaître ;
  placement par **ancrage** (nord, ouest, est, près du portail, adjacent à une autre zone),
  **jamais** aléatoire par cellule.
- **R-B — Contraintes = tests.** Chaque règle de placement est une assertion vérifiée.
- **R-C — Zéro bruit aléatoire** sur un stage composé : tout ce qui est au sol vient du plan.
- **R-D — Juger EN CONTEXTE au zoom de jeu**, comme un joueur, avant d'employer une texture.
  Jamais par le nom de fichier.
- **R-E — GROUPER PAR CAUSALITÉ : composer des SCÈNES, pas des objets.** Un objet
  n'existe jamais seul, il est le **produit d'une activité**. Unité atomique = la
  **scène d'activité**. Avant tout placement : « qu'est-ce qui doit se trouver ensemble,
  et pourquoi ? ». (Ex. terrassement : trou + anneau de mottes + pelleteuse + camion.)
- **R-F — Tableau signature au spawn.** Le début du stage cadre la **scène définitive**
  de la phase → identifiable en **2 secondes**. Le joueur naît DEDANS (ex. au bord du trou).
- **R-G — Échelle réelle.** Une infrastructure a la taille de sa fonction (une piste de
  roulage ≈ largeur d'un camion, ~280-320 px, pas un ruban). Test mental : « l'engin qui
  l'utilise passerait-il ? ».
- **R-H — Ne jamais faire pivoter un sprite debout** (clôture, panneau, PNJ 3/4) pour
  suivre une direction : il se couche. On le pose **debout**. Pas de déco redondante.
- **R-I — Orientation des assets directionnels.** Un asset de profil (camion, flèche,
  traces de pneu) doit pointer dans le **bon sens** (miroir horizontal selon le trajet),
  jamais posé « au hasard ».

**Règles PNJ (leçon récente) :**
- **UN SEUL système de PNJ par stage** piloté par le plan : des **ouvriers navetteurs**
  à **taille unique** (~celle du joueur), qui font des tâches **utiles** (aller d'un poste
  à l'autre), **pas** d'errance aléatoire en plus. Mouvement **purposeful**, pas d'oscillation
  sur place, pas de jitter.
- **Camions** : sur une **voie le long de la clôture** (pas relégués en bordure de monde),
  avec un **rebond de suspension** pour donner le roulé, orientés selon le sens.

**Contraintes de plan déjà codées (elles seront vérifiées automatiquement) :**
1. Route = bande sud pleine largeur ; portail SUR la route.
2. Toute zone d'excavation = **anneau de clôture fermé** sauf N ouvertures ; chaque
   ouverture débouche sur un chemin.
3. **Chemins connexes** : depuis le portail on atteint toutes les zones (BFS).
4. Machine **en travail** : min-dist entre deux machines ≥ ~600 px ; engin **au bord**
   du trou (adjacent, jamais dedans ni loin). Machines **parquées** : seulement dans le parc, alignées.
5. **Déblais adjacents** à une excavation (bords ≤ ~400 px).
6. Base vie proche du portail ET à distance des fouilles (danger).
7. **Zéro chevauchement** d'empreintes (chaque scène a un rayon d'encombrement).
8. **Spawn dégagé** : le joueur a une poche libre (il ne naît pas dans un trou / une clôture).
9. **Densité bornée** par zone (pas 12 tourets partout).

---

## 4. La méthode (comment une ébauche devient du jeu)

```
Ton ébauche (sémantique + associations + ASCII)
      │
      ▼
sitePrograms.ts   ← zones (rôle, taille, ancrage, prefabs) + règles chiffrées
      │
      ▼
buildSitePlan()   ← place les zones, trace portail→chemins, découpe les clôtures
      │
      ▼
clusters.ts       ← les SCÈNES (prefab = groupe d'assets indivisible, avec collision)
      │
      ▼
sim (collision) + rendu (sprites) + tests (contraintes) + ASCII/drone (revue)
```

**Vocabulaire à utiliser dans tes ébauches :**
- **Zone** = un rectangle sémantique du chantier (rôle : excavation, déblais, base vie,
  parc engins, stockage, bornage…), avec un **ancrage** (où dans le monde) et une taille.
- **Scène** (prefab) = un **groupe d'assets indivisible** posé d'un bloc (ex. `scene_dig_active`).
  C'est TON livrable principal : « cette scène = ces assets à ces positions relatives, parce que… ».
- **Ancrage d'une scène dans sa zone** : `front_north` (engin au bord nord du trou),
  `row` (alignés au cordeau), `scatter` (répartis, jamais collés), `center`, `at_door`,
  `anchor_spawn` (la scène signature, juste au nord du spawn).

---

## 5. LE MODÈLE — terrassement (déjà fait, à imiter)

C'est le stage de référence. Ses **scènes** (associations validées) :

| Scène | Contenu INDIVISIBLE | Pourquoi (causalité) |
|---|---|---|
| `scene_dig_active` | 1 trou + **anneau de 5 mottes** + pelleteuse au bord nord + camion-benne au flanc + traces | Front de creusement en cours : la pelle sort la terre → mottes autour → camion l'évacue |
| `scene_dig_active_spawn` | idem mais **arrangé face au joueur** : trou au plus près, engins au bord nord (dans le cadre), côté joueur laissé libre | Scène **signature** au spawn (R-F) : lit « terrassement » en 2 s sans coincer le joueur |
| `scene_dig_done` | 1 trou + **anneau complet de 5 mottes** (pas d'engin) | Fouille déjà creusée : le trou reste EXPLIQUÉ par ses déblais |
| `scene_spoil` | 3 tas alignés + **bulldozer** qui étale | Zone de dépôt : le bull régale les déblais |
| `scene_stock` | 4 tas alignés (sans engin ni trou) | Stock de terre pur |
| `scene_roll` | **rouleau compresseur** + 2 bandes de terre tassée | Compactage d'une zone remblayée |

Et les zones : `fouille_principale` (signature, clôturée, contient le spawn) ·
`deblais` (adjacent est) · `fouille_secondaire` (ouest) · `parc_engins` &
`base_vie` (près du portail) · `piquets` (bornage) · `stock_terre`.

**Ta mission pour les 9 autres stages : produire la même table d'association**, avec
les assets listés au §6.

---

## 6. Les 10 stages + assets disponibles

> Légende : **Landmark** = pièce-héros unique (repère lisible de loin) · **Engins/héros**
> = grosses structures posées 1 fois · **Props** = mobilier de chantier semé (clutter) ·
> **Ouvriers** = métiers présents · **Ennemis/Boss** = pour l'ambiance (ils *spawnent*,
> tu n'as pas à les composer) · le nombre entre parenthèses = combien d'exemplaires existent.

### Stage 01 — `terrain_vierge` (terrain vierge / installation)
- **Landmark** : permis de construire (`permit`).
- **Engins/héros** : panneau de chantier (`site_sign`), bungalow (`site_cabin`),
  rubalise de délimitation (`boundary_tape` ×2), plots de coin (`plot` ×3).
- **Props** : piquets topo (`survey_stakes` ×4), amas de cailloux (`rock_cluster` ×5),
  herbes sèches (`dry_weeds` ×6), sol meuble (`soft_ground` ×3).
- **Ouvriers** : géomètre, topographe, piqueteur, ouvrier-plan.
- **Ennemis** : huissier (brute), inspecteur (imp), paperasse (mudling). **Boss** : gardien du terrain.
- **Sol/ambiance** : terre nue, avant-chantier.

### Stage 02 — `terrassement` ✅ FAIT (modèle §5)
- **Landmark** : grande fosse (`pit`).
- **Engins/héros** : pelleteuse (`excavator`), camion-benne (`dump_truck`),
  rouleau compresseur (`road_roller`), bulldozer (`bulldozer`), grandes fosses (`pit_big` ×3).
- **Props** : gros tas de terre (`dirt_large` ×5). Décals : ornières (`tracks`), flaques (`puddle`).
- **Ouvriers** : chef de chantier, signaleur, porteur, maçon.
- **Ennemis** : boueux, foreur, rocheux. **Boss** : boss terrassement.

### Stage 03 — `fondations`
- **Landmark** : dalle béton (`slab`).
- **Engins/héros** : toupie/camion malaxeur (`mixer_truck`), pompe à béton (`concrete_pump`),
  travées de coffrage (`formwork_bay` ×5).
- **Props** : petite bétonnière (`concrete_mixer` ×3), ferraillage/rebar (`rebar` ×4),
  coffrage (`formwork` ×3). Décals : coulée de béton (`spill`), fissures (`crack`).
- **Ouvriers** : ferrailleur, coffreur, bétonnier, cimentier.
- **Ennemis** : gâchée, ferrailleur, massif. **Boss** : boss fondations.
- **Note** : intérieur en construction (poteaux béton bruts).

### Stage 04 — `reseaux_enterres` (réseaux enterrés)
- **Landmark** : croisement de tuyaux (`pipes`).
- **Engins/héros** : mini-pelle (`mini_excavator`), jonctions de tranchées (`trench_junction` ×4).
- **Props** : tuyaux (`pipes` ×4), trancheuse/gaine (`trencher` ×3), touret de câble
  (`cable_reel` ×3), regard/tampon (`regard` ×4). Décals : tranchée (`trench`), boue (`mud`), câbles (`cables`).
- **Ouvriers** : électricien, plombier, poseur de câble, gainier.
- **Ennemis** : gaine, fileur, collecteur. **Boss** : boss réseaux.

### Stage 05 — `gros_oeuvre` (gros œuvre)
- **Landmark** : murs qui montent (`walls`).
- **Engins/héros** : **grue à tour** (`tower_crane`), grue mobile/toupie (`mobile_crane`),
  sections de mur parpaings (`wall_section` ×5).
- **Props** : palette de parpaings (`block_pallet` ×5), poteau béton (`concrete_pole` ×4),
  crochet de grue (`crane_hook` ×3). Décals : mortier, gravats, marque de levage, poussière béton.
- **Ouvriers** : maçon, parpaingueur, porteur de blocs, grutier.
- **Ennemis** : parpaing, truelle, banche. **Boss** : boss gros œuvre.
- **Note** : on entre dans le bâtiment (poteaux structurels + voile de poussière).

### Stage 06 — `echafaudages` (échafaudages)
- **Landmark** : tour d'échafaudage complète (`scaffold_tower`).
- **Engins/héros** : nacelle/PEMP (`boom_lift`), grilles de cadres (`scaffold_grid` ×5).
- **Props** : cadre d'échafaudage (`scaffold` ×3), plancher/platelage (`plancher` ×3),
  garde-corps (`garde_corps` ×3), échelle (`echelle` ×3), tubes (`tubes` ×2).
  Décals : boulons épars (`bolt_scatter`), ombre de tubes (`tube_shadow`).
- **Ouvriers** : échafaudeur, monteur de tubes, porteur de planches, porteur d'échelle.
- **Ennemis** : boulon, grimpeur, pylône. **Boss** : boss échafaudages.

### Stage 07 — `charpente_toiture` (charpente / toiture)
- **Landmark** : charpente de toit (`roof_frame`).
- **Engins/héros** : charge suspendue à la grue (`suspended_load`), fermes de toit (`roof_trusses` ×5).
- **Props** : poutre bois (`beam` ×4), pile de tuiles rouges (`tile_pile` ×5), rouleau
  d'isolant (`insulation_roll` ×3), gouttière (`gutter` ×3). Décals : sciure (`sawdust_fine`),
  ombre de charpente (`truss_shadow`).
- **Ouvriers** : couvreur, charpentier, porteur de tuiles, poseur de liteaux.
- **Ennemis** : copeau, chevron, poutre. **Boss** : boss charpente.
- **Signature couleur** : bois brun + **tuiles rouges** + jaune isolant.

### Stage 08 — `second_oeuvre` (second œuvre)
- **Landmark** : cloison en cours (`partition`).
- **Engins/héros** : fourgon d'artisan (`artisan_van`), pièces à cloisonner (`partition_room` ×5).
- **Props** : pile de plaques de plâtre (`drywall_stack` ×5), tableau électrique
  (`electrical_panel` ×3), botte de câbles (`cable_bundle` ×4), tuyaux PVC (`pvc_pipes` ×3).
  Décals : poussière de plâtre (`plaster_dust`), câbles au sol (`cables_floor`).
- **Ouvriers** : plaquiste, plombier, électricien, porteur de plaques.
- **Ennemis** : plâtras, gainard, cloison. **Boss** : boss second œuvre.
- **Note** : intérieur (dans le bâtiment).

### Stage 09 — `finitions`
- **Landmark** : coin fini (`finished_corner`).
- **Engins/héros** : station de peinture (`paint_station`), pièces finies (`finished_room` ×4).
- **Props** : pots de peinture (`paint` ×5), rouleau (`roller` ×4), bâche (`tarp` ×3),
  palette de carrelage (`tile_pallet` ×3), coupe-carrelage (`tile_cutter` ×2).
  Décals : tache de peinture (`paint_spot`), scotch de masquage (`masking_tape`).
- **Ouvriers** : peintre, carreleur, poseur de sol, porteur de pots.
- **Ennemis** : goutte, pinceau, pot. **Boss** : boss finitions.
- **Ambiance** : chantier presque propre, densité minimale.

### Stage 10 — `livraison_audit` (livraison / audit)
- **Landmark** : portail avec ruban (`gate`).
- **Engins/héros** : fourgon d'inspection (`inspection_van`), bâtiments livrés (`building` ×4).
- **Props** : cônes (`cones` ×5), panneau conforme (`sign_ok` ×3), projecteur de chantier
  (`projector` ×2), barrière propre (`barrier` ×3). Décals : fissure orange (`crack_orange`
  — **menace narrative : malfaçon cachée**), ligne de balisage (`tape_line`).
- **Ouvriers** : inspecteur, agent de réception, technicien, porteur de cartons.
- **Ennemis** : formulaire, auditeur, commission. **Boss** : boss audit.
- **Ambiance** : propre, aéré, avec une **tension** (fissures orange discrètes au SE).

---

## 7. Ce que j'attends de vous (le livrable)

Pour **chaque stage 03→10**, produisez :

### A. La table d'association (OBLIGATOIRE — le plus utile)
Comme au §5. Pour chaque **scène** du stage :

| Scène | Contenu INDIVISIBLE (assets du §6) | Positions relatives (grossières) | Pourquoi (la causalité) |
|---|---|---|---|
| `scene_...` | ex. dalle + ferraillage DEDANS + coffrage au bord + toupie qui coule | trou/plaque au centre, engin au bord nord, clutter en anneau | « on ferraille la fouille avant de couler → la toupie déverse depuis le bord » |

Règles pour être « bon » :
- **Chaque pièce-héros (engin) doit être JUSTIFIÉE** par une activité (R-E) : jamais un
  engin seul, jamais un « trou » (dalle, tranchée, cloison…) sans ce qui l'entoure.
- **1 scène signature** par stage (celle du spawn, R-F) : quelle scène résume la phase
  en 2 s ? (fondations → une dalle qu'on ferraille/coule ; réseaux → une tranchée avec
  tuyaux dedans + mini-pelle + touret ; charpente → une ferme posée + tuiles ; etc.)
- **Sépare** : engin **en travail** (au bord, dans une zone de travail) vs engin **parqué**
  (aligné dans un parc). vs **stock** (matériel aligné, sans engin).

### B. Les zones + ancrages (le plan masse)
Liste des **zones** du stage (rôle + où : nord/ouest/est/près-portail/adjacent) et
**quelle scène va dans quelle zone**. Ex. « zone *coulée* au NE (contient
`scene_pour_active` ×1 + `scene_rebar_done` ×2) ; zone *stockage coffrage* à l'ouest ».

### C. (Optionnel mais top) un plan ASCII
Vue drone, 1 caractère ≈ 320 px, monde 32×24, avec portail (G) au sud, route (R),
clôtures (#), chemins (=), spawn (\*), et une lettre par zone. (Je peux aussi le
générer automatiquement une fois le programme codé — donc ne bloque pas là-dessus.)

### Questions utiles à poser à l'autre IA
- « Sur un vrai chantier de **\<phase\>**, **quels éléments se trouvent physiquement
  ensemble** (l'engin, ce qu'il produit, le stock qu'il consomme, l'ouvrier qui l'opère) ? »
- « Quelle **scène unique** résume cette phase en une image (pour le spawn) ? »
- « Quelle est la **logique de flux** du chantier (d'où vient le matériau, où va le
  déchet) → pour placer les zones les unes par rapport aux autres ? »
- « Y a-t-il un **danger / une verticalité / une couleur signature** propre à la phase ? »

---

## 8. Format d'échange

Rends-moi, par stage, un bloc Markdown : **(A) table d'association**, **(B) zones+ancrages**,
**(C) ASCII si tu l'as**. Je m'occupe de tout coder (données + scènes + collision + tests
+ captures de validation). Pas besoin de te soucier des noms de fichiers exacts ni du
TypeScript : raisonne en **assets sémantiques** (ceux du §6) et en **causalité**.

*Le golden terrassement (§5) est la barre de qualité : chaque stage doit lire comme un
vrai chantier vu du drone, où rien n'est orphelin.*
