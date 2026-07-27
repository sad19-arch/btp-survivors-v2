# Audit technique approfondi des douze armes

> État audité : code et données du répertoire de travail au 27 juillet 2026.
> Les mesures de ce rapport précèdent le correctif de perforation décrit ci-dessous.
> Le périmètre initial était documentaire ; les corrections ont ensuite été
> implémentées sur instruction distincte et sont identifiées comme post-audit.

> **Statut post-audit.** La sémantique P0 a été corrigée : un projectile touche
> désormais chaque ennemi une seule fois pendant un passage ; un boomerang vide
> sa mémoire à l'inversion et peut donc toucher une fois à l'aller puis une fois
> au retour. Les ricochets conservent aussi cette mémoire après leur dernier
> rebond. Le Pied-de-biche et la Barre à mine frappent désormais un secteur
> frontal de 120° auto-orienté vers l'ennemi le plus proche et aligné avec leur
> VFX, au lieu d'un cercle à 360°. La Bonbonne déclenche désormais une vraie
> explosion de zone à chaque impact et Détonation en chaîne propage deux centres
> secondaires déterministes. Le Marteau affiche désormais sa frontière de dégâts
> instantanément, avant son onde animée. La Scie émet désormais un flash et des
> étincelles sur chaque contact réellement appliqué. Le Cloueur et sa Mitrailleuse
> possèdent désormais traînées et sparks d'impact dédiés. Les Boulons et la
> Tempête possèdent désormais une traînée directionnelle et un flash uniquement
> lorsqu'un ricochet trouve effectivement une nouvelle cible et redirige le
> projectile. Les armes cône marquent désormais chaque cible réellement touchée :
> dépôt mousse pour l'Extincteur/Canon et marque thermique brève pour le
> Chalumeau/Lance, sans simuler un DoT inexistant. Les mesures de contacts
> historiques restent les preuves du défaut initial ; les mesures post-correctif
> du §3.1 sont celles à utiliser avant toute décision d'équilibrage. Le sprite de la Brouette suit désormais
> partiellement son rayon de collision : échelle 0,62 au N1 puis ≈0,712 au N8,
> tandis que le Transpalette conserve sa silhouette distincte à 0,82. Chaque
> flaque de Goudron possède désormais un contour procédural exactement calé sur
> son rayon de dégâts, sans étirer son sprite. La Clé et la Clé à choc possèdent
> désormais une traînée d'aller jaune, une inversion synchronisée et une traînée
> de retour cyan plus longue.

## 1. Conclusion exécutable

Le premier diagnostic n'était pas visuel. **Avant le correctif, les projectiles
perforants sans liste de victimes pouvaient consommer plusieurs contacts sur la
même cible pendant leur chevauchement.** Ce comportement était particulièrement
visible sur la Clé, la Brouette, la Bonbonne et leurs évolutions. Sur le banc
fixe décrit ci-dessous :

- une Clé N1 produit 5 touches mais sur une seule victime ;
- une Brouette N1 produit 93 touches réparties sur seulement 11 victimes ;
- une Bonbonne N1 produit 3 touches sur une seule victime ;
- une Détonation en chaîne produit 160 touches sur 8 victimes avec une salve.

Ces chiffres ne sont pas un score d'équilibrage : le banc est volontairement
dense et immobile. Ils démontrent le défaut historique où `pierce` bornait des
**collisions**, pas des **victimes distinctes**. Le code actuel mémorise les
victimes par passage ; les mesures post-correctif du §3.1 remplacent donc ces
valeurs pour toute décision future.

Le second problème structurel est l'absence de provenance sur les impacts
ordinaires. Le rendu sait qu'un ennemi a perdu des PV, mais pas quelle arme l'a
touché. Le Court-circuit contourne cette limite grâce à un événement dédié
synchronisé sur chaque cible. Son défaut de provenance coop a depuis été
corrigé : l'événement transporte le propriétaire et sa position exacte au
moment de la frappe.

La promesse d'explosion de la Bonbonne a depuis été alignée sur le code. Son tir
reste volontairement cardinal, tandis que ses impacts produisent une zone et que
l'évolution propage deux détonations secondaires.

## 2. Méthode et niveaux de preuve

Quatre marqueurs sont utilisés :

- **[CODE]** : chemin d'exécution démontré par le code de production ;
- **[MESURE]** : résultat reproduit avec les vrais systèmes et données ;
- **[VISUEL]** : observé dans le vrai rendu Phaser ;
- **[HUMAIN]** : plaisir, fatigue et lisibilité restant à confirmer par un joueur.

### 2.1 Données et progression

Les niveaux N1 à N8 et les évolutions proviennent directement de `WEAPONS` et
`EVOLUTIONS`. La commande `npm run weapon:audit:extract` les réextrait, recalcule
les géométries dérivées et mesure les vrais PNG ; aucune formule de niveau n'est
maintenue séparément dans l'outil. Les mesures isolent l'arme, sans passif.
Dans une partie, les passifs génériques modifient encore Puissance,
Zone, Quantité, Vitesse, Durée et Recharge. Les passifs spécialisés présents
dans l'état audité s'ajoutent ensuite :

- Surcharge de gaz agrandit le projectile et le rayon d'explosion des Bonbonnes ;
- Disque diamant augmente les dégâts de contact et orbitaux ;
- Compresseur pneumatique raccourcit la prochaine recharge du Marteau après un impact.

« Dégâts seuls » signifie qu'aucun autre champ brut de `WeaponLevel` ne change.

### 2.2 Banc quantitatif fixe

Le banc quantitatif appelle les vrais `weaponSystem`, `movementSystem`,
`boomerangSystem`, `collisionSystem`, `projectileLifetimeSystem` et
`hazardSystem`, dans l'ordre de la simulation.

| Paramètre | Valeur |
| --- | --- |
| Seed / pas fixe | 42 / 16 ms |
| Cibles | 192 mannequins à 1 000 000 PV |
| Géométrie | 8 anneaux de 24 cibles, rayons 40 à 320 px |
| Mouvement / IA / recul | désactivés pour isoler l'arme |
| Configurations | N1, N3, N5, N8, évolution |
| Activation unique | recharge gelée après le premier tir ; effet mené à terme |
| Soutenu | 10 s, recharges actives |

Ce banc répond à « combien de collisions le code applique-t-il dans une
géométrie connue ? ». Il ne répond pas à « quelle arme est la meilleure en
partie ? ». La densité favorise les zones, l'immobilité favorise les hazards et
le placement pénalise certains éventails. Les valeurs ne sont comparables qu'à
l'intérieur d'une même arme et pour repérer des anomalies de comptage.

### 2.3 Partie dynamique rendue

Les 36 combinaisons N1/N8/évolution sont lancées par
`tests/e2e/weaponAuditMatrix.spec.ts` dans le vrai jeu, Chromium headless,
stage 1, seed 42. La liste est dérivée de `EVOLUTIONS` et non recopiée. Chaque
scénario démarre avec 24 ennemis ajoutés à 220 px ; le joueur change de direction
tous les cinq pas, choisit immédiatement ses montées de niveau et doit parcourir
plus de 300 px. Le test exige aussi une cible endommagée ou tuée et un écran
resté jouable.

Cette passe confirme que les assets chargent, que le joueur bouge, que les
armes tirent et que les VFX existent dans une horde réelle. Elle ne transforme
pas trois images en jugement de bon feeling. Les PNG restent hors dépôt.

### 2.4 Empreinte visuelle mesurée

Le rectangle des pixels dont l'alpha est supérieur à 8 a été mesuré, puis
multiplié par l'échelle réellement appliquée par Phaser.

| Asset | Natif | Pixels opaques | Échelle | Empreinte opaque rendue |
| --- | ---: | ---: | ---: | ---: |
| Clou | 8×30 | 6×28 | 0,80 | 4,8×22,4 |
| Scie | 44×44 | 42×42 | 0,80 | 33,6×33,6 |
| Boulon | 64×64 | 30×38 | 0,68 | 20,4×25,8 |
| Clé | 128×128 | 45×78 | 0,52 | 23,4×40,6 |
| Brouette | 160×128 | 128×94 | 0,62→0,712 | 79,4×58,3 au N1 → 91,1×66,9 au N8 |
| Boule de feu/Bonbonne | 64×64 | 55×60 | 1,15 | 63,3×69 |
| Flaque de goudron | 160×140 | 139×121 | dynamique | 86,9 % du diamètre en largeur, 75,6 % en hauteur |
| Mousse | 140×150 | 102×104 | anisotrope | longueur opaque ≈ 91 % de la portée |
| Flamme | 192×160 | 89×139 | niveau + anisotrope | longueur ≈ 85 % de la portée au N1, 123 % au N8 |
| Onde du Marteau | 89×90 | 87×88 | dynamique | diamètre demandé atteint à la fin du tween |
| Slash | 192×160 | 180×144 | dynamique | arc frontal, pas disque complet |

Le verdict compare l'empreinte opaque à la collision, pas le rectangle
transparent du fichier.

### 2.5 Son mesuré

`npm run audio:qa` mesure 150 fichiers par max momentané EBU R128 : 0 erreur,
0 avertissement. Les 19 fichiers d'armes vont de -20,3 à -5,2 LUFS, médiane
-10,3 LUFS. Cela exclut un fichier mort ; cela ne valide ni le timbre, ni la
fatigue, ni le mix en horde.

Les sons sont déclenchés par `weaponFired`, donc par la recharge, pas par une
collision. Il n'existe aucun cue distinct pour impact, ricochet, retour, tick
de goudron ou explosion de Bonbonne. Les fichiers durent 0,22 à 1,28 s. Certains
durent plus longtemps que la recharge — le Chalumeau dure 0,80 s pour une
recharge N8 de 0,35 s — et peuvent se chevaucher. La qualité de ce
chevauchement est **[HUMAIN]**.

### 2.6 Sources communes

| Responsabilité | Source |
| --- | --- |
| Données, niveaux et types | `src/content/weapons.ts` |
| Recettes d'évolution | `src/content/evolutions.ts` |
| Passifs et stats effectives | `src/content/effectiveStats.ts`, `src/content/passives.ts` |
| Sept familles d'armes | `src/core/systems/weapon.ts` |
| Projectiles, perforation, ricochets | `src/core/systems/collision.ts`, `src/core/systems/projectile.ts` |
| Retour des boomerangs | `src/core/systems/boomerang.ts` |
| Zones persistantes | `src/core/systems/hazard.ts` |
| Dégâts et recul | `src/core/systems/knockback.ts` |
| Sprites et diff de PV | `src/render/scenes/hordeRenderer.ts` |
| Configuration pure des sprites | `src/render/projectileSpriteConfig.ts` |
| Arcs, cônes, ondes, éclairs | `src/render/scenes/vfxManager.ts` |
| Routage des VFX | `src/render/scenes/GameScene.ts` |
| SFX | `src/audio/weaponSfx.ts`, `src/audio/audioDirector.ts`, `src/audio/manifest.ts` |
| Extraction reproductible | `tools/weapon-audit/model.ts`, `tools/weapon-audit/run.ts` |

### 2.7 Constats transversaux — état initial et corrections

1. **[CODE] Feedback ordinaire générique.** Une baisse de PV déclenche flash
   blanc, squash/recul visuel, nombre de dégâts et pixel-pop. Les allocations
   sont plafonnées à 16 impacts par frame ; le flash blanc ne l'est pas.
2. **[CODE] Provenance ordinaire encore limitée, feedback spécialisé corrigé.**
   `applyEnemyHit` accepte `weaponId`, mais le feedback générique ne l'expose
   toujours pas. Les impacts spécialisés ajoutés par cet audit transportent en
   revanche explicitement l'arme, le propriétaire ou la position nécessaires.
3. **[CODE] Perforation corrigée.** Tous les projectiles portent désormais
   `hitIds` pendant un passage. La liste persiste après le dernier ricochet et
   n'est vidée qu'à l'inversion d'un boomerang, autorisant exactement un hit à
   l'aller puis un au retour.
4. **[CODE] Impacts spécialisés synchronisés.** Marteau, Pied-de-biche,
   Court-circuit, cônes, Scie, Cloueur, Boulons, Bonbonne et Clé émettent
   désormais un événement au pas exact du contact, de l'explosion ou de
   l'inversion. Le feedback générique reste le repli des autres impacts.
5. **[CODE] Recul double couche.** La simulation applique un recul physique
   plafonné à 520 px/s ; le rendu ajoute un punch cosmétique de 7 px.
6. **[VISUEL] Les paliers de quantité sont les progressions les plus évidentes.**
   Les différences de dégâts seules reposent surtout sur les nombres.

### 2.8 Matrice sonore

| Base | Source / durée | Évolution | Source / durée |
| --- | --- | --- | --- |
| Cloueur | fichier / 0,30 s | Mitrailleuse | fichier / 0,35 s |
| Scie | fichier / 0,22 s, throttle 350 ms | Tronçonneuse | ZzFX, fichier rejeté |
| Marteau | ZzFX | Brise-roche | ZzFX, fichier rejeté |
| Pied-de-biche | fichier / 0,30 s | Barre à mine | ZzFX, fichier rejeté |
| Court-circuit | ZzFX | Haute tension | fichier / 0,35 s |
| Goudron | fichier / 0,68 s | Coulée | fichier / 1,20 s |
| Boulons | fichier / 0,28 s | Tempête | fichier / 0,35 s |
| Clé | fichier / 0,32 s | Clé à choc | fichier / 0,35 s |
| Extincteur | fichier / 0,45 s | Canon | fichier / 0,45 s |
| Brouette | fichier +17 dB / 0,35 s | Transpalette | fichier / 0,40 s |
| Chalumeau | fichier / 0,80 s | Lance thermique | fichier / 1,20 s |
| Bonbonne | fichier / 0,88 s | Détonation | fichier / 1,28 s |

### 2.9 Reproductibilité et périmètre

Trois commandes rendent les preuves réexécutables :

- `npm run weapon:audit:extract` produit le JSON des 12 armes, 96 niveaux de
  base, 12 évolutions, géométries dérivées et mesures alpha de 12 PNG ;
- `npm run test:e2e -- tests/e2e/weaponAuditMatrix.spec.ts --project=chromium`
  exécute les 36 scénarios mobiles dérivés de `EVOLUTIONS` ;
- `npm run weapon:audit:scope` classe le worktree sans modifier l'index Git.

Le dernier contrôle sépare explicitement la tranche armes des quatre changements
protégés qui lui préexistaient : `docs/game-overview-ai.md`,
`src/content/layouts/terrain_vierge.json`, `src/content/passives.ts` et
`tests/unit/signaturePassives.test.ts`. Un fichier modifié inconnu rend la
commande rouge au lieu d'être embarqué silencieusement.

## 3. Résultats quantifiés

Notation de la première colonne chiffrée : **dégâts totaux / touches
équivalentes / victimes distinctes / anneau le plus éloigné touché**. Une
« touche équivalente » vaut `dégâts totaux ÷ dégâts unitaires` ; elle permet de
voir les répétitions sur une même cible. Pour les hazards, l'activation unique
inclut toute la durée de vie de la zone. La colonne 10 s utilise la même horde
fixe et ne constitue pas un classement de DPS entre familles.

| Arme | Config. | Première activation | 10 s : dégâts / touches / victimes |
| --- | --- | --- | --- |
| Cloueur | N1 | 8 / 1 / 1 / 40 px | 144 / 18 / 1 |
|  | N3 | 24 / 2 / 2 / 40 px | 432 / 36 / 2 |
|  | N5 | 32 / 2 / 2 / 40 px | 576 / 36 / 2 |
|  | N8 | 66 / 3 / 2 / 40 px | 1 188 / 54 / 2 |
|  | Mitrailleuse | 360 / 12 / 2 / 40 px | 25 080 / 836 / 2 |
| Scie | N1 | 48 / 8 / 8 / 120 px | 1 968 / 328 / 48 |
|  | N3 | 72 / 8 / 8 / 120 px | 2 952 / 328 / 48 |
|  | N5 | 144 / 12 / 12 / 120 px | 5 904 / 492 / 48 |
|  | N8 | 264 / 16 / 16 / 120 px | 10 824 / 656 / 48 |
|  | Tronçonneuse | 432 / 18 / 18 / 160 px | 23 904 / 996 / 48 |
| Marteau | N1 | 960 / 96 / 96 / 160 px | 10 560 / 1 056 / 96 |
|  | N3 | 1 920 / 120 / 120 / 200 px | 21 120 / 1 320 / 120 |
|  | N5 | 2 640 / 120 / 120 / 200 px | 29 040 / 1 320 / 120 |
|  | N8 | 4 464 / 144 / 144 / 240 px | 49 104 / 1 584 / 144 |
|  | Brise-roche | 6 336 / 144 / 144 / 240 px | 107 712 / 2 448 / 144 |
| Pied-de-biche | N1 | 1 008 / 72 / 72 / 120 px | 15 120 / 1 080 / 72 |
|  | N3 | 1 584 / 72 / 72 / 120 px | 23 760 / 1 080 / 72 |
|  | N5 | 4 320 / 144 / 72 / 120 px | 64 800 / 2 160 / 72 |
|  | N8 | 8 064 / 192 / 96 / 160 px | 120 960 / 2 880 / 96 |
|  | Barre à mine | 20 880 / 360 / 120 / 200 px | 438 480 / 7 560 / 120 |
| Court-circuit | N1 | 60 / 5 / 5 / 240 px | 924 / 77 / 73 |
|  | N3 | 216 / 12 / 12 / 240 px | 3 078 / 171 / 109 |
|  | N5 | 288 / 12 / 12 / 240 px | 4 104 / 171 / 109 |
|  | N8 | 495 / 15 / 15 / 320 px | 9 636 / 292 / 124 |
|  | Haute tension | 3 330 / 74 / 73 / 320 px | 105 570 / 2 346 / 188 |
| Goudron | N1 | 840 / 168 / 21 / 120 px | 4 410 / 882 / 21 |
|  | N3 | 2 030,4 / 216 / 27 / 120 px | 10 659,6 / 1 134 / 27 |
|  | N5 | 6 844,8 / 496 / 56 / 120 px | 35 935,2 / 2 604 / 56 |
|  | N8 | 13 056 / 640 / 66 / 160 px | 68 544 / 3 360 / 66 |
|  | Coulée | 38 416 / 1 372 / 72 / 160 px | 227 752 / 8 134 / 72 |
| Boulons | N1 | 48 / 4 / 3 / 40 px | 576 / 48 / 3 |
|  | N3 | 85 / 5 / 3 / 40 px | 1 020 / 60 / 3 |
|  | N5 | 132 / 6 / 3 / 40 px | 1 584 / 72 / 3 |
|  | N8 | 354 / 12 / 3 / 40 px | 4 248 / 144 / 3 |
|  | Tempête | 840 / 21 / 2 / 40 px | 22 920 / 573 / 2 |
| Clé | N1 | 80 / 5 / 1 / 40 px | 832 / 52 / 1 |
|  | N3 | 130 / 5 / 1 / 40 px | 1 352 / 52 / 1 |
|  | N5 | 180 / 5 / 1 / 40 px | 1 872 / 52 / 1 |
|  | N8 | 510 / 10 / 2 / 40 px | 5 304 / 104 / 2 |
|  | Clé à choc | 816 / 12 / 3 / 80 px | 13 056 / 192 / 3 |
| Extincteur | N1 | 96 / 12 / 12 / 160 px | 960 / 120 / 12 |
|  | N3 | 168 / 12 / 12 / 160 px | 1 680 / 120 / 12 |
|  | N5 | 300 / 15 / 15 / 200 px | 3 000 / 150 / 15 |
|  | N8 | 522 / 18 / 18 / 240 px | 5 220 / 180 / 18 |
|  | Canon | 600 / 15 / 15 / 200 px | 10 200 / 255 / 15 |
| Brouette | N1 | 2 418 / 93 / 11 / 320 px | 17 160 / 660 / 11 |
|  | N3 | 3 760 / 94 / 11 / 320 px | 26 680 / 667 / 11 |
|  | N5 | 5 130 / 95 / 12 / 320 px | 36 396 / 674 / 12 |
|  | N8 | 7 200 / 96 / 11 / 320 px | 51 075 / 681 / 11 |
|  | Transpalette | 8 470 / 77 / 12 / 320 px | 76 230 / 693 / 12 |
| Chalumeau | N1 | 63 / 9 / 9 / 120 px | 1 197 / 171 / 9 |
|  | N3 | 132 / 11 / 11 / 160 px | 2 508 / 209 / 11 |
|  | N5 | 204 / 12 / 12 / 160 px | 4 896 / 288 / 12 |
|  | N8 | 367,5 / 15 / 15 / 200 px | 10 657,5 / 435 / 15 |
|  | Lance thermique | 504 / 12 / 12 / 160 px | 16 632 / 396 / 12 |
| Bonbonne | N1 | 60 / 3 / 1 / 40 px | 660 / 33 / 1 |
|  | N3 | 120 / 4 / 1 / 40 px | 1 320 / 44 / 1 |
|  | N5 | 400 / 10 / 1 / 40 px | 4 400 / 110 / 1 |
|  | N8 | 660 / 12 / 1 / 40 px | 7 260 / 132 / 1 |
|  | Détonation | 9 920 / 160 / 8 / 320 px | 202 244 / 3 262 / 8 |

### 3.1 Re-mesure après correction de la perforation

Le même banc, la même seed 42 et le même pas de 16 ms ont été rejoués deux
fois après le correctif. Les 25 lignes sont strictement identiques entre les
deux exécutions (`SHA-256
0e549556f2383d23112a01c62d183944ffcc73f151e750260cafe2fc7ec9394a`).
Les touches peuvent rester supérieures aux victimes lorsqu'une salve contient
plusieurs projectiles : la garantie porte sur **chaque projectile et chaque
passage**, pas sur l'ensemble de la salve.

| Arme | Config. | Première activation après correctif | 10 s après correctif |
| --- | --- | --- | --- |
| Cloueur | N1 | 8 / 1 / 1 / 40 px | 144 / 18 / 1 |
|  | N3 | 24 / 2 / 2 / 40 px | 432 / 36 / 2 |
|  | N5 | 32 / 2 / 2 / 40 px | 576 / 36 / 2 |
|  | N8 | 66 / 3 / 2 / 40 px | 1 188 / 54 / 2 |
|  | Mitrailleuse | 360 / 12 / 5 / 40 px | 25 080 / 836 / 5 |
| Boulons | N1 | 48 / 4 / 4 / 40 px | 576 / 48 / 4 |
|  | N3 | 85 / 5 / 5 / 40 px | 1 020 / 60 / 5 |
|  | N5 | 132 / 6 / 6 / 40 px | 1 584 / 72 / 6 |
|  | N8 | 354 / 12 / 8 / 40 px | 4 248 / 144 / 8 |
|  | Tempête | 840 / 21 / 11 / 40 px | 22 920 / 573 / 11 |
| Clé | N1 | 80 / 5 / 5 / 120 px | 832 / 52 / 5 |
|  | N3 | 130 / 5 / 5 / 120 px | 1 352 / 52 / 5 |
|  | N5 | 180 / 5 / 5 / 120 px | 1 872 / 52 / 5 |
|  | N8 | 510 / 10 / 6 / 80 px | 5 304 / 104 / 6 |
|  | Clé à choc | 816 / 12 / 8 / 80 px | 13 056 / 192 / 8 |
| Brouette | N1 | 520 / 20 / 20 / 320 px | 3 874 / 149 / 20 |
|  | N3 | 1 040 / 26 / 26 / 320 px | 7 640 / 191 / 26 |
|  | N5 | 1 404 / 26 / 26 / 320 px | 10 314 / 191 / 26 |
|  | N8 | 2 250 / 30 / 30 / 320 px | 16 425 / 219 / 30 |
|  | Transpalette | 3 190 / 29 / 29 / 320 px | 29 150 / 265 / 29 |
| Bonbonne | N1 | 60 / 3 / 3 / 40 px | 660 / 33 / 3 |
|  | N3 | 120 / 4 / 4 / 40 px | 1 320 / 44 / 4 |
|  | N5 | 400 / 10 / 6 / 40 px | 4 400 / 110 / 6 |
|  | N8 | 660 / 12 / 7 / 40 px | 7 260 / 132 / 7 |
|  | Détonation | 3 658 / 59 / 28 / 320 px | 75 826 / 1 223 / 28 |

Les conséquences mesurées sont nettes :

- Clé, Boulons, Cloueur et Bonbonne de base conservent globalement leur budget
  de contacts, mais le répartissent sur davantage de victimes ;
- la Brouette N1 passe de 93 contacts sur 11 victimes à 20 contacts sur 20
  victimes lors de sa première activation ;
- la Détonation passe de 160 contacts sur 8 victimes à 59 contacts sur 28
  victimes ; ses dégâts de première salve passent de 9 920 à 3 658 ;
- la Brouette et la Détonation doivent donc être rejouées humainement avant
  d'être déclarées trop faibles ou retouchées. Aucun chiffre d'arme n'a été
  compensé automatiquement.

### 3.2 Playtest dynamique après correction

Un second protocole a été exécuté dans le vrai jeu Chromium headless, seed 42 :
36 ennemis actifs à 260 px, 12 secondes, joueur parcourant successivement huit
directions au lieu de rester immobile. Chaque scénario a été rejoué deux fois
avec un résultat strictement identique.

| Arme | Distance joueur | Dégâts observés | Kills | PV perdus | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Brouette N1 | 2 320 px | 862 | 38 | 12 | Forte, viable |
| Brouette N8 | 2 360 px | 962 | 40 | 0 | Nettoie la horde |
| Transpalette | 2 357 px | 962 | 40 | 0 | Pas de compensation nécessaire |
| Bonbonne N1 | 2 397 px | 90 | 3 | 14 | Faible mais fonctionnelle |
| Bonbonne N8 | 2 377 px | 330 | 10 | 14 | Progression nette |
| Détonation | 2 373 px | 553 | 20 | 2 | Évolution nettement supérieure |

Ce scénario mobile ne justifiait aucun buff compensatoire de la Brouette ou de la
Détonation. Il confirmait aussi que la Bonbonne progressait bien en puissance,
avant l'implémentation de sa promesse explosion/chaîne.

Après implémentation, un nouveau scénario Chromium headless seed 42 a placé
36 ennemis à 220 px et déplacé réellement le joueur pendant 12 secondes. Les
dégâts directs existants sont inchangés ; l'explosion inflige 50 % des dégâts
aux autres victimes, dans un rayon 48→76 px. L'évolution utilise 96 px et deux
propagations de 160 px :

| Configuration post-correctif | Distance joueur | Kills | Ennemis restants |
| --- | ---: | ---: | ---: |
| Bonbonne N1 | 2 383 px | 16 | 24 |
| Bonbonne N8 | 2 367 px | 32 | 8 |
| Détonation en chaîne | 2 310 px | 38 | 2 |

La progression est monotone dans ce scénario contrôlé. Le plaisir, la lisibilité
avec plusieurs joueurs et le niveau sonore de neuf explosions simultanées restent
à valider humainement ; les VFX sont bornés à 16 émissions par pas sans borner
les dégâts.

Le Pied-de-biche frontal a ensuite été joué avec le même principe de déplacement
continu. Sur une horde de 25 ennemis, les trois configurations nettoient la
horde, avec une progression temporelle nette :

| Configuration | Distance joueur | Temps de nettoyage |
| --- | ---: | ---: |
| Pied-de-biche N1 | 2 340 px | 6,15 s |
| Pied-de-biche N8 | 2 340 px | 3,72 s |
| Barre à mine | 2 370 px | 2,78 s |

Une première version orientée uniquement selon le déplacement avait produit
0 kill au N1 pendant 12 secondes de kiting : elle a été rejetée. L'auto-ciblage
vers l'ennemi le plus proche conserve la liberté de mouvement attendue dans un
survivor tout en gardant un secteur réellement frontal.

## 4. Référence : ce que Court-circuit fait mieux

Le Court-circuit ne se contente pas du feedback générique. Chaque cible choisie
produit, exactement pendant le pas où les dégâts sont appliqués, un
`AuraPulse`. Le rendu trace alors un éclair complet du joueur à la cible, avec
un cœur blanc, un halo cyan, deux fourches, un pixel-pop et un flash au point
d'arrivée. La relation **source → trajet → victime** est donc visible dans une
seule image.

Sa progression est également lisible aux paliers 3 et 6 : le nombre de cibles
passe de 1 à 2 puis 3. Haute tension monte à 6 cibles, raccourcit fortement la
recharge et agrandit la zone collatérale. Il ne s'agit pas d'une vraie chaîne :
les cibles sont tirées sans remise, puis chaque cible devient le centre d'une
zone circulaire. Des zones qui se chevauchent peuvent frapper une même victime
plusieurs fois pendant la même activation.

En multijoueur, le VFX part désormais du propriétaire réel. La source est
capturée pendant le même pas que les dégâts : le déplacement ultérieur du joueur
ne décale donc plus le début de l'arc.

---

## Cloueur

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, `collision.ts`, `projectile.ts` |
| Fichiers de rendu | `hordeRenderer.ts`, `proj_cloueur.png` |
| Type de rendu | Sprite PixelLab 8×30, échelle 0,8, orienté sur la vitesse + traînée directionnelle |
| Forme de hitbox | Cercle de rayon 6 px ; contact des centres à 18 px avec le rayon ennemi |
| Portée réelle | Jusqu'à 780 px par durée de vie (`520 × 1,5 s`), hors collision et limites |
| Taille visuelle | PNG 6,4×24 px ; pixels opaques mesurés 4,8×22,4 px |
| Nombre de cibles | 1 impact par clou au niveau de base ; évolution : jusqu'à 3 impacts par clou |
| Recul | 170 ; Mitrailleuse : 95 |
| Feedback d'impact | Flash blanc et quatre sparks métalliques sur la victime réelle, bornés à 16 émissions par pas |
| Fonctionnement de l'évolution | 4 clous, recharge 140 ms, vitesse 640, perforation 2 |
| Écart visuel/hitbox | **Effet visuel plus petit que la hitbox latéralement**, mais plus long longitudinalement |
| Problème principal confirmé | **Corrigé** : la perforation vise des victimes distinctes ; trajectoire et point d'impact sont maintenant lisibles |
| Comparaison au Court-circuit | Source, direction et impact sont visibles ; le trait reste volontairement plus court qu'un éclair |
| Quick win réalisé | Traînée Graphics mutualisée et spark synchronisé |
| Complexité estimée | Implémentée |
| Risque d'équilibrage | Aucun : dégâts, cadence, recul, portée et perforation inchangés |

### Progression

| Niveau | Dégâts | Recharge | Quantité | Rayon | Perforation | Vitesse / vie | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 8 | 560 ms | 1 | 6 | 0 | 520 / 1 500 ms | Base |
| 2 | 10 | 560 ms | 1 | 6 | 0 | idem | **Dégâts seuls** |
| 3 | 12 | 560 ms | 2 | 6 | 0 | idem | Double clou |
| 4 | 14 | 560 ms | 2 | 6 | 0 | idem | **Dégâts seuls** |
| 5 | 16 | 560 ms | 2 | 6 | 0 | idem | **Dégâts seuls** |
| 6 | 18 | 560 ms | 3 | 6 | 0 | idem | Triple clou |
| 7 | 20 | 560 ms | 3 | 6 | 0 | idem | **Dégâts seuls** |
| 8 | 22 | 560 ms | 3 | 6 | 0 | idem | **Dégâts seuls** |
| Mitrailleuse | 30 | 140 ms | 4 | 6 | 2 | 640 / 1 600 ms | Rafale beaucoup plus dense |

---

## Scie orbitale

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, `knockback.ts` |
| Fichiers de rendu | `hordeRenderer.ts`, `vfxManager.ts`, `proj_scie.png` |
| Type de rendu | Sprite 44×44 en rotation continue + flash métallique et étincelles au contact |
| Forme de hitbox | Un cercle par lame, rayon 22 ; centre ennemi touché à 34 px |
| Portée réelle | Centres des lames à 104 px du joueur ; enveloppe de dégâts jusqu'à 138 px |
| Taille visuelle | Opaque : 33,6×33,6 px ; évolution : 54,6×54,6 px |
| Nombre de cibles | Toutes les cibles dans chaque lame tous les 250 ms ; même cible re-frappable |
| Recul | 90 ; Tronçonneuse : 130 |
| Feedback d'impact | Flash blanc compact et six étincelles métalliques sur la position exacte de chaque victime |
| Fonctionnement de l'évolution | 6 lames, orbite 128, vitesse 4,8, rayon de contact 26, recharge 200 ms |
| Écart visuel/hitbox | Base : **effet visuel plus petit que la hitbox** ; évolution : correspondance correcte |
| Problème principal confirmé | **Corrigé** : le moment où une lame mord une victime possède maintenant un point focal spécialisé |
| Comparaison au Court-circuit | La trajectoire est permanente et chaque impact possède maintenant un flash synchronisé |
| Quick win réalisé | Émissions bornées à 12 par pas sans borner les dégâts |
| Complexité estimée | Implémentée |
| Risque d'équilibrage | Aucun : dégâts, cadence, recul et hitbox inchangés |

### Progression

| Niveau | Dégâts | Recharge | Lames | Orbite | Rayon de lame | Vitesse orbitale | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 6 | 250 ms | 2 | 104 | 22 | 3,6 | Base |
| 2 | 7,5 | 250 ms | 2 | 104 | 22 | 3,6 | **Dégâts seuls** |
| 3 | 9 | 250 ms | 2 | 104 | 22 | 3,6 | **Dégâts seuls** |
| 4 | 10,5 | 250 ms | 3 | 104 | 22 | 3,6 | Troisième lame |
| 5 | 12 | 250 ms | 3 | 104 | 22 | 3,6 | **Dégâts seuls** |
| 6 | 13,5 | 250 ms | 3 | 104 | 22 | 3,6 | **Dégâts seuls** |
| 7 | 15 | 250 ms | 4 | 104 | 22 | 3,6 | Quatrième lame |
| 8 | 16,5 | 250 ms | 4 | 104 | 22 | 3,6 | **Dégâts seuls** |
| Tronçonneuse | 24 | 200 ms | 6 | 128 | 26 | 4,8 | Plus grande, plus rapide et plus dense |

---

## Marteau-piqueur

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, `knockback.ts` |
| Fichiers de rendu | `GameScene.ts`, `vfxManager.ts`, `shockwave.png` |
| Type de rendu | Anneau immédiat au rayon réel + onde circulaire en traîne + flash central + screen shake |
| Forme de hitbox | Cercle centré sur le joueur |
| Portée réelle | Rayon centre-à-centre 187 px au N1, 243 px au N8 |
| Taille visuelle | L'onde finit à ≈98 % du diamètre de dégâts ; elle démarre à 20 % de cette échelle |
| Nombre de cibles | Toutes les cibles du cercle, une fois par activation |
| Recul | 360 radial ; Brise-roche : 430 |
| Feedback d'impact | Onde, pixel-pop central, shake et feedback générique des victimes |
| Fonctionnement de l'évolution | Rayon centre-à-centre 272, recharge 620 ms, dégâts 44 |
| Écart visuel/hitbox | **Timing corrigé** : l'anneau naît directement à 100 % du rayon de dégâts ; l'onde de 320 ms reste une traîne |
| Problème principal confirmé | Le timing est corrigé ; seuls les débris/fissures associés aux victimes restent génériques |
| Comparaison au Court-circuit | L'origine et la frontière complète sont visibles pendant le pas du hit |
| Quick win réalisé | Anneau fin immédiat au rayon réel, onde actuelle conservée |
| Complexité estimée | Implémentée |
| Risque d'équilibrage | Faible |

### Progression

| Niveau | Dégâts | Recharge | Aire donnée | Rayon réel | Quantité | Recul | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 10 | 900 ms | 175 | 187 | 1 | 360 | Base |
| 2 | 13 | 900 ms | 183 | 195 | 1 | 360 | Onde légèrement plus large |
| 3 | 16 | 900 ms | 191 | 203 | 1 | Idem |
| 4 | 19 | 900 ms | 199 | 211 | 1 | Idem |
| 5 | 22 | 900 ms | 207 | 219 | 1 | Idem |
| 6 | 25 | 900 ms | 215 | 227 | 1 | Idem |
| 7 | 28 | 900 ms | 223 | 235 | 1 | Idem |
| 8 | 31 | 900 ms | 231 | 243 | 1 | Onde maximale |
| Brise-roche | 44 | 620 ms | 260 | 272 | 1 | 430 | Plus large et plus fréquent |

---

## Pied-de-biche

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts` |
| Fichiers de rendu | `GameScene.ts`, `vfxManager.ts`, `vfx_slash*.png` |
| Type de rendu | Sprite PixelLab en arc rotatif, burst et débris |
| Forme de hitbox | **Secteur frontal de 120°**, auto-orienté vers l'ennemi le plus proche |
| Portée réelle | Rayon centre-à-centre 132 px au N1, 174 px au N8 |
| Taille visuelle | Croissant orienté dans la direction réelle du coup ; double croissant dès le N5 |
| Nombre de cibles | Toutes les cibles du secteur ; dès le N5, chaque cible reçoit deux passes instantanées |
| Recul | 300 radial ; Barre à mine : 400 |
| Feedback d'impact | Arc, burst central, shake et feedback générique |
| Fonctionnement de l'évolution | Trois passes frontales, rayon réel 202, recharge 480 ms |
| Écart visuel/hitbox | **Corrigé** : le secteur de dégâts et l'arc utilisent la même direction |
| Problème principal confirmé | [CORRIGÉ] Le cercle à 360° a été remplacé par un secteur frontal de 120° |
| Comparaison au Court-circuit | La source, la direction et la zone frappée sont maintenant cohérentes ; les victimes individuelles restent moins explicites |
| Quick win réalisé | Secteur frontal dans le core et orientation réelle transmise au VFX |
| Complexité estimée | Réalisée |
| Risque d'équilibrage | Fort |

### Progression

| Niveau | Dégâts/passe | Recharge | Passes | Aire donnée | Rayon réel | Recul | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 14 | 700 ms | 1 | 120 | 132 | 300 | Arc simple visible, dégâts circulaires |
| 2 | 18 | 700 ms | 1 | 126 | 138 | 300 | Arc légèrement plus grand |
| 3 | 22 | 700 ms | 1 | 132 | 144 | 300 | Idem |
| 4 | 26 | 700 ms | 1 | 138 | 150 | 300 | Idem |
| 5 | 30 | 700 ms | 2 | 144 | 156 | 300 | Double arc et double dégât |
| 6 | 34 | 700 ms | 2 | 150 | 162 | 300 | Taille seule visible |
| 7 | 38 | 700 ms | 2 | 156 | 168 | 300 | Taille seule visible |
| 8 | 42 | 700 ms | 2 | 162 | 174 | 300 | Taille maximale |
| Barre à mine | 58 | 480 ms | 3 | 190 | 202 | 400 | Triple passe frontale |

---

## Court-circuit

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts` |
| Fichiers de rendu | `GameScene.ts`, `vfxManager.ts` |
| Type de rendu | Éclair Phaser multicouche, fourches et flash d'impact |
| Forme de hitbox | Cercle de rayon 60 centré sur chaque cible tirée |
| Portée réelle | Aucune limite de sélection : tout ennemi vivant peut être choisi |
| Taille visuelle | Arc complet joueur→cible ; flash local plus petit que l'AoE collatérale |
| Nombre de cibles | 1/2/3 centres selon les paliers ; toutes les victimes des cercles, avec chevauchement possible |
| Recul | 140 depuis le joueur ; Haute tension : 220 |
| Feedback d'impact | Éclair, fourches, flash, pixel-pop, feedback générique et zap dédié |
| Fonctionnement de l'évolution | 6 centres, rayon 80, recharge 380 ms, dégâts 45 |
| Écart visuel/hitbox | **Correspondance correcte pour les cibles principales** ; la zone collatérale de 60/80 px n'est pas dessinée |
| Problème principal confirmé | **Provenance coop corrigée** ; l'AoE collatérale de 60/80 px reste non dessinée |
| Comparaison au Court-circuit | Référence |
| Quick win réalisé | `ownerId` et coordonnées de source traversent simulation→app→rendu |
| Complexité estimée | Implémentée |
| Risque d'équilibrage | Aucun si la simulation ne change pas |

### Progression

| Niveau | Dégâts | Recharge | Centres | Rayon par centre | Recul | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 12 | 950 ms | 1 | 60 | 140 | Base |
| 2 | 15 | 950 ms | 1 | 60 | 140 | **Dégâts seuls** |
| 3 | 18 | 950 ms | 2 | 60 | 140 | Double éclair |
| 4 | 21 | 950 ms | 2 | 60 | 140 | **Dégâts seuls** |
| 5 | 24 | 950 ms | 2 | 60 | 140 | **Dégâts seuls** |
| 6 | 27 | 950 ms | 3 | 60 | 140 | Triple éclair |
| 7 | 30 | 950 ms | 3 | 60 | 140 | **Dégâts seuls** |
| 8 | 33 | 950 ms | 3 | 60 | 140 | **Dégâts seuls** |
| Haute tension | 45 | 380 ms | 6 | 80 | 220 | Arc massif et très fréquent |

---

## Goudron chaud

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, `hazard.ts` |
| Fichiers de rendu | `hordeRenderer.ts`, `vfxManager.ts`, `vfx_goudron.png` |
| Type de rendu | Sprite de flaque persistant, apparition en fondu et bulles + contour procédural exact |
| Forme de hitbox | Cercle persistant, décalé de 64 px dans la direction du mouvement |
| Portée réelle | Rayon 72 px au N1, 100 px au N8 ; tick toutes les 400 ms pendant 3 s |
| Taille visuelle | Le rectangle est mis à `2 × rayon` ; les pixels opaques couvrent 86,9 % du diamètre en largeur et 75,6 % en hauteur |
| Nombre de cibles | Toutes les cibles présentes à chaque tick ; une même cible est touchée répétitivement |
| Recul | 0 |
| Feedback d'impact | Flaque persistante + frontière sombre/chaude au rayon exact + feedback ennemi générique ; pas d'état de brûlure séparé |
| Fonctionnement de l'évolution | Deux flaques, rayon 108, tick 300 ms, durée 4,2 s, recharge 1 500 ms |
| Écart visuel/hitbox | [POST-CORRECTIF] Le sprite opaque reste plus petit (-13,1 % en largeur, -24,4 % en hauteur), mais sa frontière visible correspond exactement à la hitbox |
| Problème principal confirmé | [CORRIGÉ VISUELLEMENT] La marge opaque n'est plus une zone de dégâts invisible ; la progression reste une croissance douce avec palier de deux flaques |
| Comparaison au Court-circuit | Zone très lisible dans le temps, impact individuel peu caractérisé |
| Quick win réalisé | Contour pixel sombre/chaud centré sur le rayon réel, sans déformer l'asset ni changer les rayons |
| Complexité estimée | Faible |
| Risque d'équilibrage | Faible |

### Progression

| Niveau | Dégâts/tick | Recharge | Flaques | Aire donnée | Rayon réel | Tick / durée | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 5 | 1 800 ms | 1 | 60 | 72 | 400 / 3 000 ms | Base |
| 2 | 7,2 | 1 800 ms | 1 | 64 | 76 | idem | Flaque légèrement plus grande |
| 3 | 9,4 | 1 800 ms | 1 | 68 | 80 | idem | Idem |
| 4 | 11,6 | 1 800 ms | 1 | 72 | 84 | idem | Idem |
| 5 | 13,8 | 1 800 ms | 2 | 76 | 88 | idem | Deux flaques opposées |
| 6 | 16 | 1 800 ms | 2 | 80 | 92 | idem | Taille seule visible |
| 7 | 18,2 | 1 800 ms | 2 | 84 | 96 | idem | Taille seule visible |
| 8 | 20,4 | 1 800 ms | 2 | 88 | 100 | idem | Taille maximale |
| Coulée | 28 | 1 500 ms | 2 | 96 | 108 | 300 / 4 200 ms | Plus grande, dense et durable |

---

## Boulons ricochets

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, `collision.ts` |
| Fichiers de rendu | `hordeRenderer.ts`, `proj_boulons.png` |
| Type de rendu | Sprite PixelLab 64×64, échelle 0,68, orienté sur la vitesse |
| Forme de hitbox | Cercle de rayon 6 ; recherche d'une cible de rebond dans 320 px |
| Portée réelle | Jusqu'à 799 px par durée de vie (`470 × 1,7 s`), trajectoire prolongée par les rebonds |
| Taille visuelle | PNG 43,5×43,5 px ; pixels opaques 20,4×25,8 px |
| Nombre de cibles | Budget de 4/5/6 contacts au N1/N3/N5 ; après correctif, ces configurations touchent respectivement 4/5/6 victimes distinctes |
| Recul | 170 ; Tempête : 130 |
| Feedback d'impact | [CODE + VISUEL POST-CORRECTIF] Traînée directionnelle mutualisée ; anneau et pixel-pop uniquement lors d'un rebond effectivement redirigé ; maximum 12 émissions spécialisées par pas, sans plafonner les dégâts |
| Fonctionnement de l'évolution | 3 boulons, 6 rebonds, recharge 360 ms, vitesse 560 |
| Écart visuel/hitbox | **Effet visuel plus grand que la hitbox** |
| Problème principal confirmé | [CORRIGÉ] Le re-hit après le dernier rebond est supprimé ; la trajectoire et chaque redirection réussie sont désormais vérifiables sans changer la recherche de cible |
| Comparaison au Court-circuit | Le Court-circuit trace instantanément toute la liaison joueur→cible ; les Boulons rendent leur déplacement continu et ponctuent seulement les changements de direction réels |
| Quick win réalisé | Trail court partagé avec les autres projectiles et impact synchronisé sur la cible de rebond |
| Complexité estimée | Moyenne |
| Risque d'équilibrage | Faible |

### Progression

| Niveau | Dégâts | Recharge | Boulons | Rebonds | Rayon | Vitesse / vie | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 12 | 820 ms | 1 | 3 | 6 | 470 / 1 700 ms | Base |
| 2 | 14,5 | 820 ms | 1 | 3 | 6 | idem | **Dégâts seuls** |
| 3 | 17 | 820 ms | 1 | 4 | 6 | idem | Un rebond de plus, peu visible |
| 4 | 19,5 | 820 ms | 1 | 4 | 6 | idem | **Dégâts seuls** |
| 5 | 22 | 820 ms | 1 | 5 | 6 | idem | Un rebond de plus, peu visible |
| 6 | 24,5 | 820 ms | 1 | 5 | 6 | idem | **Dégâts seuls** |
| 7 | 27 | 820 ms | 2 | 5 | 6 | idem | Double boulon |
| 8 | 29,5 | 820 ms | 2 | 5 | 6 | idem | **Dégâts seuls** |
| Tempête | 40 | 360 ms | 3 | 6 | 6 | 560 / 1 900 ms | Grêle dense et rapide |

---

## Clé à molette

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, `collision.ts`, `boomerang.ts` |
| Fichiers de rendu | `hordeRenderer.ts`, `proj_cle.png` |
| Type de rendu | Sprite PixelLab 128×128 en rotation |
| Forme de hitbox | Cercle de rayon 6 |
| Portée réelle | Aller théorique ≈163 px (`380 × 0,43 s`) avant retour ; évolution ≈229 px |
| Taille visuelle | Opaque : 23,4×40,6 px ; évolution : 26,1×45,2 px |
| Nombre de cibles | Perforation 4 = 5 contacts possibles ; après correctif, le banc N1 les applique à 5 victimes distinctes |
| Recul | 230 ; Clé à choc : 320 |
| Feedback d'impact | [CODE + VISUEL POST-CORRECTIF] Traînée jaune courte à l'aller, flash cyan exact à l'inversion et traînée cyan plus longue au retour |
| Fonctionnement de l'évolution | Deux clés, vitesse 440, aller 520 ms, recharge 650 ms, perforation 5 |
| Écart visuel/hitbox | **Effet visuel beaucoup plus grand que la hitbox** |
| Problème principal confirmé | [CORRIGÉ] Le re-hit de chevauchement est supprimé et le passage aller→retour est désormais explicite ; le timer d'aller reste volontairement à 430 ms |
| Comparaison au Court-circuit | Le Court-circuit trace une liaison instantanée ; la Clé communique désormais sa trajectoire continue et son changement de phase |
| Quick win réalisé | Mémoire par passage, événement unique d'inversion et trails différenciés ; portée inchangée |
| Complexité estimée | Moyenne |
| Risque d'équilibrage | Moyen : augmenter la portée augmente les occasions de contact |

### Progression

| Niveau | Dégâts | Recharge | Clés | Perforation | Aller | Vitesse / vie | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 16 | 980 ms | 1 | 4 | 430 ms | 380 / 2 400 ms | Base |
| 2 | 21 | 980 ms | 1 | 4 | 430 ms | idem | **Dégâts seuls** |
| 3 | 26 | 980 ms | 1 | 4 | 430 ms | idem | **Dégâts seuls** |
| 4 | 31 | 980 ms | 1 | 4 | 430 ms | idem | **Dégâts seuls** |
| 5 | 36 | 980 ms | 1 | 4 | 430 ms | idem | **Dégâts seuls** |
| 6 | 41 | 980 ms | 2 | 4 | 430 ms | idem | Double clé |
| 7 | 46 | 980 ms | 2 | 4 | 430 ms | idem | **Dégâts seuls** |
| 8 | 51 | 980 ms | 2 | 4 | 430 ms | idem | **Dégâts seuls** |
| Clé à choc | 68 | 650 ms | 2 | 5 | 520 ms | 440 / 3 000 ms | Plus loin, plus vite, toujours deux |

---

## Extincteur

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, système de ralentissement |
| Fichiers de rendu | `GameScene.ts`, `vfxManager.ts`, `vfx_foam_cone.png` |
| Type de rendu | Sprite PixelLab orienté et étiré + 8 bulles + shake |
| Forme de hitbox | Secteur frontal de 57,3° au total, auto-orienté vers l'ennemi le plus proche |
| Portée réelle | 172 px au N1, 249 px au N8 |
| Taille visuelle | Pixels opaques : longueur utile ≈91 % de la portée ; largeur centrale ≈60 % de la portée, complétée par 8 bulles |
| Nombre de cibles | Toutes les cibles du secteur, une fois par activation |
| Recul | 260 dans la direction du jet ; Canon : 380 |
| Feedback d'impact | [CODE + VISUEL POST-CORRECTIF] Nuage, bulles, shake, ralentissement réel et dépôt mousse sur chaque cible touchée ; maximum 12 marques par pas sans plafonner les dégâts |
| Fonctionnement de l'évolution | Portée réelle 202, recharge 620 ms, slow à 35 % pendant 2,2 s |
| Écart visuel/hitbox | **Effet opaque plus étroit et légèrement plus court que le secteur**, les particules élargissant ponctuellement la lecture |
| Problème principal confirmé | Le Canon perd 47 px face au N8 mais gagne cadence, dégâts et slow ; sans intention de design documentée, c'est un compromis à valider, pas une régression prouvée |
| Comparaison au Court-circuit | Source, direction et victimes contrôlées sont désormais lisibles ; le dépôt reste plus longtemps que le jet mais ne prétend pas couvrir exactement toute la durée du slow |
| Quick win réalisé | Dépôt mousse synchronisé sur les contacts réels ; décider en playtest si la portée réduite fait partie du compromis de l'évolution |
| Complexité estimée | Moyenne |
| Risque d'équilibrage | Moyen si la portée du Canon change ; faible pour la marque visuelle |

### Progression

| Niveau | Dégâts | Recharge | Aire donnée | Portée réelle | Angle | Ralentissement | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 8 | 1 050 ms | 160 | 172 | 57,3° | 50 % / 700 ms | Base |
| 2 | 11 | 1 050 ms | 171 | 183 | idem | idem | Jet plus long |
| 3 | 14 | 1 050 ms | 182 | 194 | idem | idem | Idem |
| 4 | 17 | 1 050 ms | 193 | 205 | idem | idem | Idem |
| 5 | 20 | 1 050 ms | 204 | 216 | idem | idem | Idem |
| 6 | 23 | 1 050 ms | 215 | 227 | idem | idem | Idem |
| 7 | 26 | 1 050 ms | 226 | 238 | idem | idem | Idem |
| 8 | 29 | 1 050 ms | 237 | 249 | idem | idem | Jet maximal |
| Canon à mousse | 40 | 620 ms | 190 | 202 | idem | 35 % / 2 200 ms | Contrôle renforcé, portée réduite |

---

## Brouette

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, `collision.ts`, `projectile.ts` |
| Fichiers de rendu | `hordeRenderer.ts`, `proj_brouette.png` |
| Type de rendu | Sprite PixelLab 160×128, sans rotation |
| Forme de hitbox | Cercle croissant de rayon 26 à 40 |
| Portée réelle | Jusqu'à 624 px (`240 × 2,6 s`) |
| Taille visuelle | [POST-CORRECTIF] Opaque ≈79,4×58,3 px au N1 → 91,1×66,9 px au N8 ; croissance sous-linéaire par rapport au rayon |
| Nombre de cibles | Perforation 99 ; après correctif, le banc N1 mesure 20 contacts sur 20 victimes lors de la première activation |
| Recul | 420 ; Transpalette : 500 |
| Feedback d'impact | Projectile lourd, recul réel, feedback générique et SFX fichier corrigé de +17 dB |
| Fonctionnement de l'évolution | Rayon 40, vitesse 300, durée 3,2 s, recharge 1 100 ms, empreinte opaque ≈105×77 px |
| Écart visuel/hitbox | N1 : **effet visuel plus grand que la hitbox** ; N8 : meilleure correspondance |
| Problème principal confirmé | [CORRIGÉ VISUELLEMENT] Le re-hit massif est supprimé ; la croissance de hitbox est désormais perceptible sans faire grossir le sprite aussi vite que la collision. L'équilibre doit toujours être rejoué humainement |
| Comparaison au Court-circuit | Moins précis sur l'impact, mais masse, vitesse lente et recul donnent une signature immédiate |
| Quick win réalisé | Comptage par victimes corrigé ; sprite relié au rayon par une croissance sous-linéaire, Transpalette inchangé |
| Complexité estimée | Faible |
| Risque d'équilibrage | Faible |

### Progression

| Niveau | Dégâts | Recharge | Rayon | Perforation | Vitesse / vie | Recul | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| 1 | 26 | 1 400 ms | 26 | 99 | 240 / 2 600 ms | 420 | Base |
| 2 | 33 | 1 400 ms | 28 | 99 | idem | 420 | Hitbox et sprite grandissent |
| 3 | 40 | 1 400 ms | 30 | 99 | idem | 420 | Idem |
| 4 | 47 | 1 400 ms | 32 | 99 | idem | 420 | Idem |
| 5 | 54 | 1 400 ms | 34 | 99 | idem | 420 | Idem |
| 6 | 61 | 1 400 ms | 36 | 99 | idem | 420 | Idem |
| 7 | 68 | 1 400 ms | 38 | 99 | idem | 420 | Idem |
| 8 | 75 | 1 400 ms | 40 | 99 | idem | 420 | Hitbox maximale, sprite ≈14,8 % plus grand qu'au N1 |
| Transpalette | 110 | 1 100 ms | 40 | 99 | 300 / 3 200 ms | 500 | Sprite nettement plus gros |

---

## Chalumeau

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts` |
| Fichiers de rendu | `GameScene.ts`, `vfxManager.ts`, `vfx_flame_*.png` |
| Type de rendu | Sprite de flamme orienté + braises ; sprite distinct pour l'évolution |
| Forme de hitbox | Secteur frontal de 57,3°, auto-orienté vers l'ennemi le plus proche |
| Portée réelle | 142 px au N1, 205 px au N8 |
| Taille visuelle | Sprite 192×160 ; sa taille suit la portée et reçoit en plus un facteur N1 0,8 → N8 1,15 |
| Nombre de cibles | Toutes les cibles du secteur, une fois par activation |
| Recul | 120 ; Lance thermique : 180 |
| Feedback d'impact | [CODE + VISUEL POST-CORRECTIF] Flamme, braises, shake et marque thermique brève sur chaque cible touchée ; **toujours aucun état de brûlure ni DoT** |
| Fonctionnement de l'évolution | Sprite distinct, recharge 300 ms, dégâts 42, portée réelle 162 |
| Écart visuel/hitbox | Le sprite opaque atteint ≈85 % de la portée au N1 et ≈123 % au N8 : la croissance visuelle dépasse la croissance de hitbox |
| Problème principal confirmé | L'arme est un cône instantané, pas un jet continu ; la Lance perd 43 px face au N8 mais gagne cadence et dégâts, compromis à valider |
| Comparaison au Court-circuit | Le trajet et les victimes sont désormais identifiables ; la marque disparaît vite afin de ne pas suggérer un état persistant inexistant |
| Quick win réalisé | Marque thermique courte synchronisée sur les contacts réels ; ne modifier la portée de l'évolution qu'après comparaison humaine du compromis cadence/portée |
| Complexité estimée | Moyenne |
| Risque d'équilibrage | Moyen pour la portée ; faible pour la marque |

### Progression

| Niveau | Dégâts | Recharge | Aire donnée | Portée réelle | Angle | État | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 7 | 520 ms | 130 | 142 | 57,3° | Aucun | Base |
| 2 | 9,5 | 520 ms | 139 | 151 | idem | Aucun | Jet plus long/dense |
| 3 | 12 | 520 ms | 148 | 160 | idem | Aucun | Idem |
| 4 | 14,5 | 430 ms | 157 | 169 | idem | Aucun | Palier de cadence |
| 5 | 17 | 430 ms | 166 | 178 | idem | Aucun | Taille seule visible |
| 6 | 19,5 | 430 ms | 175 | 187 | idem | Aucun | Taille seule visible |
| 7 | 22 | 350 ms | 184 | 196 | idem | Aucun | Second palier de cadence |
| 8 | 24,5 | 350 ms | 193 | 205 | idem | Aucun | Jet maximal |
| Lance thermique | 42 | 300 ms | 150 | 162 | idem | Aucun | Sprite distinct, portée réduite |

---

## Bonbonne de chantier

| Champ | Résultat |
| --- | --- |
| Fichiers de données | `weapons.ts` ; évolution dans `evolutions.ts` |
| Fichiers de simulation | `weapon.ts`, `collision.ts`, `playerFacing` dans `simulation.ts` |
| Fichiers de rendu | `hordeRenderer.ts`, `boule_feu.png` |
| Type de rendu | Sprite de boule de feu 64×64 en rotation |
| Forme de hitbox | Projectile circulaire de rayon 16 ; explosion circulaire de 48→76 px |
| Portée réelle | Jusqu'à 836 px (`380 × 2,2 s`) ; tir cardinal persistant |
| Taille visuelle | Opaque : 63,3×69 px ; évolution : 77×84 px |
| Nombre de cibles | Perforation 2→5 ; après correctif, N1 applique ses 3 contacts à 3 victimes distinctes |
| Recul | 300 ; Détonation : 380 |
| Feedback d'impact | Événement synchronisé sur chaque centre ; anneau au rayon réel, flash et éclats orange/rouge |
| Fonctionnement de l'évolution | 3 projectiles, rayon 22, perforation 99, recharge 480 ms ; explosion 96 px puis 2 centres secondaires à 160 px maximum |
| Écart visuel/hitbox | **Aligné pour la zone** : l'anneau atteint le rayon de dégâts ; le sprite du projectile reste volontairement plus grand que sa collision directe |
| Problème principal confirmé | **Corrigé** pour l'explosion et la chaîne ; le tir cardinal reste une identité de contrôle à valider humainement |
| Comparaison au Court-circuit | Possède maintenant le même avantage d'un événement synchronisé, mais produit une zone/cascade plutôt qu'un tracé joueur→cible |
| Quick win proposé | Aucun autre changement avant playtest humain à 2–4 joueurs |
| Complexité estimée | Implémentée |
| Risque d'équilibrage | Fort |

### Progression

| Niveau | Dégâts | Recharge | Projectiles | Rayon projectile / explosion | Perforation | Vitesse / vie | Changement perceptible |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 20 | 900 ms | 1 | 16 / 48 | 2 | 380 / 2 200 ms | Base explosive |
| 2 | 25 | 900 ms | 1 | 16 / 52 | 2 | idem | Dégâts et zone |
| 3 | 30 | 900 ms | 1 | 16 / 56 | 3 | idem | Zone + perforation |
| 4 | 35 | 900 ms | 1 | 16 / 60 | 3 | idem | Dégâts et zone |
| 5 | 40 | 900 ms | 2 | 16 / 64 | 4 | idem | Double projectile + zone |
| 6 | 45 | 900 ms | 2 | 16 / 68 | 4 | idem | Dégâts et zone |
| 7 | 50 | 900 ms | 2 | 16 / 72 | 5 | idem | Zone + perforation |
| 8 | 55 | 900 ms | 2 | 16 / 76 | 5 | idem | Zone maximale |
| Détonation | 62 | 480 ms | 3 | 22 / 96 | 99 | 340 / 2 600 ms | Deux propagations secondaires |

---

## Matrice de synthèse et priorité

| Priorité | Arme(s) | Fait démontré | Catégorie | Décision suivante | Risque |
| ---: | --- | --- | --- | --- | --- |
| P0 — corrigé | Clé, Brouette, Bonbonne, évolutions perforantes | Plusieurs contacts pouvaient être consommés sur une même cible | **Simulation corrigée** | Refaire les mesures avant toute retouche de valeurs | Fort sur l'équilibrage existant |
| P0 — corrigé | Boulons | La protection par `hitIds` ne couvrait pas l'après-dernier-rebond | **Simulation corrigée** | Refaire les mesures de victimes distinctes | Moyen |
| P1 — corrigé | Pied-de-biche | L'arc visible et la zone de dégâts divergeaient | **Simulation et VFX corrigés** | Rejouer l'équilibrage sans modifier les valeurs par défaut | Fort |
| P1 — corrigé | Bonbonne | Description d'explosion/chaîne sans AoE ni chaîne | **Simulation et VFX corrigés** | Playtest humain multi, sans autre retouche préalable | Fort |
| P2 — corrigé | Court-circuit | L'arc partait du premier joueur vivant en coop | **Routage VFX corrigé** | Préserver les dégâts et valider la lisibilité à 4 joueurs | Aucun sur l'équilibrage |
| P2 — corrigé | Marteau | La frontière de dégâts arrivait 320 ms après le hit | **Feedback synchronisé** | Préserver l'anneau exact ; éventuels débris seulement après playtest | Aucun sur l'équilibrage |
| P2 — corrigé | Scie | Orbite claire, contact auparavant générique | **Feedback synchronisé** | Préserver le budget de 12 VFX par pas | Aucun sur l'équilibrage |
| P2 — corrigé | Cloueur | Trajectoire difficile à suivre et impact générique | **Feedback synchronisé** | Préserver le Graphics mutualisé et le budget de 16 impacts | Aucun sur l'équilibrage |
| P2 — corrigé | Boulons | Rebond auparavant réel mais sans trajet ni flash vérifiable | **Feedback synchronisé** | Préserver le budget de 12 VFX par pas et les règles de ricochet | Aucun sur l'équilibrage |
| P2 — corrigé | Clé | Inversion auparavant sans signal et aller/retour visuellement identiques | **Feedback de phase synchronisé** | Préserver la portée et les deux trails différenciés | Aucun sur l'équilibrage |
| P3 — corrigé | Goudron | Empreinte opaque sous la hitbox, auparavant sans frontière exacte | **Polish visuel réalisé** | Préserver le contour exact ; densité supplémentaire seulement après playtest | Aucun sur l'équilibrage |
| P3 — feedback corrigé | Extincteur | Cône réel + slow ; évolution plus courte mais plus forte ailleurs | **Préserver / valider humainement** | Préserver le dépôt mousse ; ne pas changer la portée sans test comparatif | Moyen si portée modifiée |
| P3 — feedback corrigé | Chalumeau | Cône instantané sans DoT ; VFX dépasse la portée au N8 ; évolution plus courte | **Polir / valider humainement** | Préserver la marque thermique brève ; vérifier le compromis cadence/portée | Moyen si portée modifiée |
| P3 — corrigé | Brouette | Silhouette et recul forts, sprite auparavant fixe alors que le rayon grandissait | **Polish visuel réalisé** | Préserver la croissance sous-linéaire et la distinction du Transpalette | Aucun sur l'équilibrage |

### Ordre recommandé

1. **Fait :** la perforation/re-hit compte désormais des victimes distinctes
   par passage ; refaire le banc de mesure avant de juger le DPS.
2. **Fait pour le Pied-de-biche et la Bonbonne :** secteurs/zones et VFX alignés.
   Valider maintenant leur lisibilité et leur puissance en playtest humain.
3. **Fait pour le Court-circuit :** l'impulsion porte `ownerId` et la position
   exacte du tireur ; conserver ce contrat pour les futurs impacts spécialisés.
4. **Fait pour le Marteau, la Scie, le Cloueur, les Boulons, la Clé et les armes
   cône :** feedback synchronisé sans changement d'équilibrage. Le Chalumeau
   conserve explicitement ses dégâts instantanés sans faux DoT.
5. **Fait pour la Brouette et le Goudron :** croissance visuelle reliée au rayon
   et frontière exacte, sans changement de simulation. Valider humainement le son
   et les compromis de portée des cônes évolués.

## Critères de validation des futurs changements

- La hitbox et le VFX utilisent la même origine, direction et portée.
- L'événement visuel est émis pendant le pas exact où le dégât est appliqué.
- Un effet propre à l'arme ne remplace pas le feedback générique : il le complète.
- Les captures N1/N8/évolution montrent une différence sans nombres de dégâts.
- Les essais visuels se font dans une horde contrôlée et les essais
  d'équilibrage avec la simulation déterministe ; aucun des deux ne remplace
  l'autre.
- Un test de projectile perforant compte à la fois les contacts et les victimes
  distinctes, à l'aller et au retour.
- Un test dynamique fait réellement déplacer le joueur ; le mannequin immobile
  reste réservé au banc de mesure.
- Court-circuit conserve son comportement et son rendu, hors correction de
  l'origine coop démontrée.

## Limites et validations humaines restantes

- Les sons ont été mesurés mais pas jugés à l'oreille. Il faut une écoute en
  contexte, musique et horde actives, surtout pour Chalumeau, Lance thermique,
  Bonbonne et Détonation dont les fichiers peuvent se chevaucher.
- Les 36 scénarios dynamiques prouvent l'exécution et donnent des séquences
  comparables, pas le plaisir de jeu sur une run complète.
- Les dégâts du banc fixe ne doivent pas servir à nerfer ou buffer directement :
  il faut d'abord rejouer une run déterministe avec une sémantique de collision
  explicitement choisie.
- « Préserver », « polir » et « refondre » sont des catégories techniques. Le
  ressenti final du Pied-de-biche et de la Bonbonne appartient encore au playtest humain.

## Validation exécutée

| Vérification | Résultat |
| --- | --- |
| Banc fixe, seed 42, 60 configurations | terminé ; résultats intégrés au §3 |
| `npm run weapon:audit:extract` | 12 armes, 36 scénarios dérivés et 12 PNG mesurés depuis les sources réelles |
| `weaponAuditExtract.test.ts` | 2 tests réussis : couverture des données et dimensions opaques |
| `weaponAuditMatrix.spec.ts`, Chromium seed 42 | 36/36 scénarios N1/N8/évolution réussis avec joueur mobile |
| `npm run weapon:audit:scope` | 49 fichiers armes, 4 changements protégés, 0 fichier inconnu |
| `npm run audio:qa` | 150 fichiers ; 0 erreur, 0 avertissement |
| `npm run type-check` | réussi |
| `npm run lint` | réussi, 0 warning |
| 12 fichiers Vitest ciblés armes/audio | 143 tests réussis |
| `weaponsA.spec.ts`, Chromium headless | 1 test réussi |
| Playtest mobile Brouette/Bonbonne, Chromium headless seed 42 | 6 scénarios × 2 exécutions strictement identiques |
| `piedDeBiche.spec.ts`, N1/N8/évolution avec joueur mobile | 1 test réussi ; nettoyage en 6,15/3,72/2,78 s |
| `bonbonneExplosion.test.ts` | 7 tests réussis : données, AoE, chaîne, tie-break, portée exacte et budget VFX |
| `bonbonneExplosion.spec.ts`, seed 42, joueur mobile | 1 test réussi ; 16/32/38 kills en N1/N8/évolution |
| `courtCircuitOwner.spec.ts`, coop seed 42, deux joueurs mobiles | 5/5 arcs issus de J2 ; écart événement→renderer = 0 px |
| `hammerImpactRing.spec.ts`, seed 42, joueur mobile | anneau immédiat présent ; rayon simulation→renderer strictement identique |
| `sawContactFeedback.spec.ts`, seed 42, joueur mobile | contacts spécialisés observés sur les victimes réelles ; provenance J1 conservée |
| `cloueurFeedback.spec.ts`, seed 42, joueur mobile | impacts spécialisés observés ; traînées actives côté renderer |
| `boulonsFeedback.test.ts` | 4 tests réussis : émission sur redirection réelle, absence sans cible et budget VFX indépendant des dégâts |
| `boulonsFeedback.spec.ts`, seed 42, joueur mobile | trajectoires actives et impacts de ricochet spécialisés observés dans le vrai renderer |
| `cleFeedback.test.ts` | 3 tests réussis : absence avant inversion et événement unique pour base/évolution |
| `cleFeedback.spec.ts`, seed 42, joueur mobile | 2/2 scénarios réussis ; trails aller/retour et inversion exacte observés |
| `coneContactFeedback.test.ts` | 4 tests réussis : provenance mousse/thermique, géométrie réelle et budget de 12 VFX indépendant des dégâts |
| `coneContactFeedback.spec.ts`, seed 42, joueur mobile | 2/2 scénarios réussis ; dépôt mousse et marque thermique observés avec déplacement > 500 px |
| `brouetteRenderScale.test.ts` | 4 tests réussis : N1 préservé, croissance N8 sous-linéaire, Transpalette distinct et autres projectiles inchangés |
| `brouetteRenderScale.spec.ts`, seed 42, joueur mobile | 3/3 scénarios réussis ; échelles renderer 0,62 / ≈0,712 / 0,82 |
| `tarRenderGeometry.test.ts` | 6 tests réussis : rayon exact, échelle historique, marge opaque mesurée et entrées invalides |
| `tarBoundary.spec.ts`, seed 42, joueur mobile | 3/3 scénarios réussis ; frontières exactes aux rayons runtime 72 / 100 / 108 px |
| `npm run build` | réussi |
| `npm run test` complet | 2 887 réussis, 7 échecs hors tranche armes |
| `npm run sim -- --seed 42 --duration 300 --bot greedy` | invariant rouge : mort médiane 41 s, seuil 45 s |

La suite complète n'est donc pas présentée comme verte. Pendant sa validation,
`src/content/layouts/terrain_vierge.json` a été réécrit dans l'environnement de
développement actif, ce qui a fait passer le stage de 86 à 117 immeubles et a
fait échouer des assertions de layout/PNJ ; deux assertions de split de boss ont
également échoué. Après une restauration de contrôle, le fichier a été réécrit
une seconde fois pendant la simulation. Il est donc laissé intact pour ne pas
écraser un niveau officiel potentiellement publié depuis l'éditeur. Aucun de
ces échecs n'est attribué ni à la correction de perforation ni au secteur
frontal du Pied-de-biche : les mêmes sept assertions étaient déjà rouges avec
le layout actuel. Les dégâts directs, cadences, quantités et perforations de la
Bonbonne n'ont pas été changés ; seuls les nouveaux paramètres nécessaires à
l'explosion et à la propagation ont été ajoutés.
