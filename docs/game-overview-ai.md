# BTP Carnage — document de référence du jeu

> Ce document explique le jeu tel qu'il fonctionne actuellement dans le dépôt.
> Il est destiné à une IA ou à une personne qui ne connaît absolument pas le
> projet. En cas de contradiction avec une ancienne note de conception située
> dans `docs/superpowers/`, le code actuel et les données de `src/content/` font
> foi.

## 1. Résumé en une phrase

**BTP Carnage** est un jeu d'action et de survie en vue du dessus, inspiré de
*Vampire Survivors*, dans lequel un à quatre ouvriers se déplacent
continuellement sur un immense chantier, attaquent automatiquement des hordes
d'ennemis, ramassent de l'expérience, construisent un équipement, sauvent des
collègues et doivent finalement tuer le contremaître afin de livrer le chantier.

## 2. Identité du jeu

- Univers : chantier, bâtiment, travaux publics et bureaucratie absurde.
- Ton : arcade, spectaculaire, humoristique et volontairement excessif.
- Direction artistique : pixel art 16-bit, panneaux carrés, contours noirs,
  palette contrôlée et interface de borne d'arcade.
- Plateforme principale : navigateur sur PC.
- Contrôles prioritaires : manette Xbox et clavier.
- Joueurs : solo ou coopération locale de deux à quatre joueurs.
- Une partie complète dure environ 22 minutes, auxquelles s'ajoute le combat
  contre le boss final.
- Le jeu contient dix stages correspondant aux dix phases successives d'un
  chantier.

Le thème du chantier est l'identité du jeu. En revanche, le jeu n'est pas une
application marketing, un quiz ou un outil pédagogique de conformité.

## 3. Ce que fait le joueur

Le joueur contrôle principalement le déplacement de son personnage. Les armes
attaquent automatiquement selon leur cadence, leur portée et leur comportement.
Il n'existe pas de bouton de tir à presser continuellement.

La boucle fondamentale est la suivante :

1. choisir le nombre de joueurs et le stage ;
2. choisir un personnage par joueur ;
3. entrer sur le chantier ;
4. se déplacer pour éviter les ennemis et orienter certaines attaques ;
5. tuer des ennemis automatiquement avec les armes possédées ;
6. ramasser les gemmes d'expérience et les autres objets ;
7. choisir une amélioration à chaque montée de niveau ;
8. chercher les prisonniers et les objets destructibles ;
9. tuer les mini-boss et les porteurs de coffre ;
10. faire évoluer les armes grâce aux coffres ;
11. survivre à la saturation finale ;
12. tuer le boss final pour gagner.

Le joueur ne doit pas rester immobile. En plus d'être naturellement encerclé,
un joueur qui parcourt moins de 120 pixels en six secondes déclenche un
encerclement spécial de 8 à 12 chargeurs. Cette réaction anti-camping possède
un délai de douze secondes avant de pouvoir se reproduire.

## 4. Déroulement complet d'une partie

### 4.1 Avant la partie

Le menu titre permet de :

- lancer une partie ;
- choisir de un à quatre joueurs ;
- choisir l'un des dix stages ;
- consulter les scores du stage sélectionné ;
- consulter les succès globaux ;
- régler les options ;
- ouvrir l'éditeur de niveaux.

Les stages verrouillés peuvent être parcourus dans le sélecteur, mais pas
lancés normalement.

Chaque joueur choisit ensuite son personnage. En coopération, tous les joueurs
doivent verrouiller leur choix avant le lancement.

### 4.2 Introduction

Le début d'un stage peut jouer une courte introduction ou une cinématique
propre au stage. La simulation est gelée pendant cette séquence. Une entrée du
joueur permet de la passer.

### 4.3 Début et montée en puissance

Le début introduit peu d'ennemis afin de laisser le joueur comprendre son
déplacement et commencer son équipement. La pression augmente ensuite par
paliers :

- 0 à 3 minutes : démarrage et apprentissage ;
- 3 à 9 minutes : construction du build et hausse sensible de la densité ;
- 9 à 19 minutes : pression soutenue et ennemis renforcés ;
- 19 min 30 à 20 minutes : augmentation du plafond de horde ;
- 20 à 22 minutes : finale volontairement saturée et spectaculaire ;
- 22 minutes : apparition du boss final.

Le plafond normal est de 220 ennemis actifs. Il monte progressivement jusqu'à
700 pendant la finale. Les ennemis deviennent également plus résistants, plus
rapides et plus dangereux avec le temps.

Le directeur de vagues ne fait pas apparaître uniquement des individus isolés.
Il produit aussi des formations annoncées environ 800 ms à l'avance :
encerclements, murs, traversées et autres groupes structurés. Le télégraphe doit
laisser au joueur une possibilité de réaction.

### 4.4 Mini-boss

Des contremaîtres intermédiaires apparaissent à :

- 5 minutes ;
- 10 minutes ;
- 15 minutes.

Ils sont de plus en plus résistants et donnent chacun un coffre à leur mort.
Les tuer ne termine pas le stage.

### 4.5 Finale et victoire

À partir de 20 minutes, le jeu cherche une sensation de « moisson de horde » :
énormément d'ennemis arrivent, mais ils doivent rester tuables par un build
abouti.

Le boss final apparaît à 22 minutes, près des joueurs. Il charge, annonce ses
attaques, invoque des renforts et possède une phase d'enrage. Ses points de vie
dépendent notamment du niveau atteint par les joueurs et du nombre de joueurs.

La seule condition de victoire est la mort du boss final.

- Boss final vivant : le chantier n'est pas livré.
- Tous les joueurs morts : défaite.
- Boss final tué : victoire et avancement du chantier à 100 %.

Une défaite ne peut jamais afficher 100 % de progression ; elle est plafonnée à
99 %.

## 5. Contrôles

### 5.1 Clavier

| Action | Touches |
|---|---|
| Déplacement | flèches, WASD ou ZQSD |
| Naviguer dans les menus | mêmes touches de direction |
| Valider | Entrée ou Espace |
| Retour / pause contextuelle | Échap ou Retour arrière |
| Pause directe | P |
| Afficher ou masquer la mini-carte | M |
| Maintenir l'action de relève en coop | E |

### 5.2 Manette Xbox

| Action | Contrôle |
|---|---|
| Déplacement | stick gauche ou croix directionnelle |
| Naviguer dans les menus | stick gauche ou croix directionnelle |
| Valider | A |
| Retour | B |
| Pause | Start |
| Afficher ou masquer la mini-carte | Back / Select |
| Maintenir l'action de relève en coop | A |

Toutes les fonctions normales doivent être accessibles sans souris. Une couche
tactile existe également, mais le mobile n'est pas la cible prioritaire.

## 6. Joueurs et coopération

Le jeu accepte les modes solo, coop à deux, coop à trois et coop à quatre.
Chaque personnage possède un `playerId` distinct, sa propre position, ses
points de vie, son niveau, son expérience et son équipement.

En coopération :

- chaque joueur se déplace indépendamment ;
- les points de vie des ennemis sont multipliés par 1,5 à deux joueurs, 2 à
  trois joueurs et 2,5 à quatre joueurs ;
- une laisse souple empêche un joueur de s'éloigner à plus de 450 pixels du
  centre du groupe ;
- la caméra et les objectifs sont collectifs ;
- les montées de niveau restent attribuées au joueur concerné ;
- les sauvetages de prisonniers comptent pour toute l'équipe ;
- les résultats affichent les performances de chaque joueur et un podium.

### Joueur à terre et relève

En coop, tomber à zéro point de vie ne condamne pas immédiatement le joueur si
un coéquipier est encore vivant.

Pour relever un joueur :

1. un autre joueur vivant doit se placer à moins de 130 pixels ;
2. il doit maintenir l'action pendant deux secondes ;
3. le joueur relevé récupère 50 % de ses points de vie maximum.

Si l'action est interrompue, la jauge de relève redescend en deux secondes. La
partie est perdue lorsque tous les joueurs sont à terre. En solo, aucune relève
n'est possible.

## 7. Personnages

Les personnages ont actuellement les mêmes statistiques de simulation. Leur
différence fonctionnelle principale est leur arme de départ. Les champs de
statistiques propres aux personnages sont réservés à une évolution future et ne
doivent pas être présentés comme des bonus déjà actifs.

| Personnage | Arme de départ |
|---|---|
| Ouvrier | Cloueur |
| Soudeur | Scie orbitale |
| Maçon | Marteau-piqueur |
| Terrassier | Pied-de-biche |
| Électricien | Court-circuit |
| Ouvrière | Brouette |
| Charpentier | Boulons ricochets |
| Grutier | Goudron chaud |
| Plombier | Clé à molette |
| Samoyède | Extincteur |

Statistiques de base communes :

- 240 points de vie ;
- vitesse de déplacement de 200 pixels par seconde ;
- rayon d'attraction de l'expérience de 90 pixels ;
- vigilance de 100.

## 8. Expérience, niveaux et équipement

Chaque ennemi tué laisse systématiquement une gemme d'expérience. Une gemme non
ramassée disparaît après 20 secondes afin d'éviter une accumulation infinie.

Le premier niveau demande 25 points d'expérience. Le seuil suivant est
multiplié par 1,20 à chaque niveau.

À chaque montée de niveau :

- le temps de jeu est gelé ;
- quatre cartes sont proposées ;
- le joueur concerné en choisit une ;
- la carte peut donner une nouvelle arme, améliorer une arme possédée, donner
  un nouveau passif ou améliorer un passif possédé.

Un joueur peut posséder au maximum :

- six armes ;
- six passifs.

Les armes de base peuvent monter jusqu'au niveau 8. Les armes évoluées sont des
armes finales de niveau 1. Les améliorations d'une arme changent suivant son
profil : dégâts, cadence, quantité de projectiles, zone, durée, vitesse,
pénétration, rebonds ou autres propriétés propres.

## 9. Les douze armes de base

| Arme | Famille | Fonction principale |
|---|---|---|
| Cloueur | projectile | tire des clous vers des cibles |
| Scie orbitale | orbitale | fait tourner des scies autour du joueur |
| Marteau-piqueur | aura | frappe périodiquement autour du joueur |
| Pied-de-biche | balayage | frappe en arc devant le personnage |
| Court-circuit | frappe ciblée | électrocute des ennemis à distance |
| Goudron chaud | zone persistante | pose des flaques qui blessent dans le temps |
| Boulons ricochets | projectile | rebondit entre plusieurs ennemis |
| Clé à molette | projectile | agit comme un boomerang traversant |
| Extincteur | cône | projette de la mousse et ralentit |
| Brouette | projectile lourd | traverse et repousse les groupes |
| Chalumeau | cône | brûle les ennemis devant le joueur |
| Bonbonne de chantier | projectile explosif | provoque une explosion de zone |

Le chalumeau et la bonbonne de chantier ne sont l'arme de départ d'aucun des
dix personnages actuels, mais peuvent entrer dans le build par les cartes de
niveau.

Les attaques sont automatiques. Certaines utilisent la cible la plus pertinente
et d'autres la direction du personnage ; le joueur influence donc indirectement
leur efficacité par son placement et son mouvement.

## 10. Passifs

| Passif | Effet par niveau | Niveau maximal |
|---|---|---:|
| Air comprimé | +10 % vitesse des projectiles par niveau ; au niveau 5, +10 % de durée de vol donc de portée réelle | 5 |
| Groupe électrogène | +1 projectile | 2 |
| Outillage renforcé | +10 % dégâts | 5 |
| Cadence de chantier | −8 % temps de recharge | 5 |
| Casque homologué | +10 % points de vie maximum par niveau ; au niveau 5, repousse les ennemis au contact, au plus une fois toutes les 600 ms | 5 |
| Chaussures de sécurité | +10 % vitesse de déplacement par niveau ; au niveau 5, un balayage effectué en mouvement gagne +20 % de recul | 5 |
| Aimant de chantier | +8 % rayon et +5 % vitesse d'attraction des gemmes par niveau | 5 |
| Batterie 18V | +12 % de durée des projectiles, zones persistantes, boomerangs et ralentissements par niveau | 5 |
| Prime de rendement | +5 % expérience gagnée par niveau ; au niveau 5, 10 éliminations espacées de moins de 3 s activent +25 % de valeur de gemmes pendant 5 s | 5 |
| Surcharge de gaz | +10 / +20 / +30 / +40 % au rayon réel des explosions ; au niveau 5, conserve +40 % et une victime tuée au centre produit un petit souffle secondaire non récursif | 5 |
| Disque diamant | +8 / +16 / +24 / +32 % à la taille réelle des scies et balayages ; recul renforcé dès le niveau 3 ; au niveau 5, un contact réimpacte la même cible après 120 ms | 5 |
| Compresseur pneumatique | après 5 / 5 / 4 / 4 / 3 cibles uniques touchées par une frappe lourde, réduit uniquement sa prochaine attente de 10 / 15 / 20 / 25 / 30 % | 5 |

Plusieurs passifs ont un effet similaire parce qu'ils servent aussi de
catalyseurs thématiques pour des évolutions différentes.

## 11. Évolutions d'armes

Une arme n'évolue pas automatiquement lors d'une montée de niveau.

Conditions générales :

1. posséder l'arme de base au niveau maximal, généralement le niveau 8 ;
2. posséder au moins le niveau 1 du passif catalyseur ;
3. ouvrir un coffre ;
4. le coffre remplace alors l'arme de base par sa version évoluée.

| Arme de base | Catalyseur | Arme évoluée |
|---|---|---|
| Cloueur | Air comprimé | Mitrailleuse à clous |
| Scie orbitale | Disque diamant | Tronçonneuse de chantier |
| Marteau-piqueur | Compresseur pneumatique | Brise-roche |
| Pied-de-biche | Chaussures de sécurité | Barre à mine |
| Court-circuit | Groupe électrogène | Haute tension |
| Goudron chaud | Cadence de chantier | Coulée de bitume |
| Boulons ricochets | Aimant de chantier | Tempête de boulons |
| Clé à molette | Batterie 18V | Clé à choc |
| Extincteur | Casque homologué | Canon à mousse |
| Brouette | Prime de rendement | Transpalette automatisée |
| Chalumeau | Outillage renforcé | Lance thermique |
| Bonbonne de chantier | Surcharge de gaz | Détonation en chaîne |

L'écran « Évolutions », consultable pendant la pause, sert de mémo des recettes.

## 12. Ennemis

Les stages changent les noms, apparences et thèmes des ennemis, mais s'appuient
sur des archétypes de comportement communs.

| Archétype | Rôle |
|---|---|
| Nuée | très fragile, nombreuse, nourrit la densité |
| Standard | ennemi de poursuite équilibré |
| Rapide | peu résistant mais difficile à distancer |
| Tank | lent, résistant et dangereux au contact |
| Chargeur | annonce puis exécute une charge |
| Élite | cible prioritaire plus résistante |
| Boss | attaque structurée, charges, invocations et enrage |

Le `convoyeur` est un élite porteur de coffre. Un convoyeur est programmé
environ toutes les 55 secondes, avec au maximum un porteur vivant à la fois.

Les ennemis se déplacent en utilisant la position des joueurs et un champ de
navigation capable de contourner le terrain solide. Les obstacles ne doivent
donc pas être supposés purement décoratifs.

## 13. Les dix stages

Les stages suivent l'ordre du cycle de vie d'un chantier.

| N° | Identifiant interne | Titre | Ennemis thématiques principaux |
|---:|---|---|---|
| 1 | `terrain_vierge` | Terrain vierge | Paperasse, Inspecteur, Huissier, Motton, Enracineur |
| 2 | `terrassement` | Terrassement | Boueux, Foreur, Rocheux |
| 3 | `fondations` | Fondations | Gâchée, Ferrailleur, Massif |
| 4 | `reseaux_enterres` | Réseaux enterrés | Gaine, Fileur, Collecteur |
| 5 | `gros_oeuvre` | Gros œuvre | Parpaing, Truelle, Banche |
| 6 | `echafaudages` | Échafaudages | Boulon, Grimpeur, Pylône |
| 7 | `charpente_toiture` | Charpente / toiture | Copeau, Chevron, Poutre |
| 8 | `second_oeuvre` | Second œuvre | Plâtras, Gainard, Cloison |
| 9 | `finitions` | Finitions | Goutte, Pinceau, Pot |
| 10 | `livraison_audit` | Livraison / audit | Formulaire, Auditeur, Commission |

Chaque stage possède :

- un thème visuel et sonore ;
- un pool d'ennemis thématique ;
- un layout officiel ;
- du terrain, des obstacles, des éléments de décor et des zones ;
- des objets destructibles propres à sa phase ;
- des PNJ et dialogues d'ambiance selon sa composition ;
- éventuellement une cinématique d'introduction propre.

Le monde mesure 10 240 × 7 680 pixels. Le décor est chargé par zones autour de
la caméra afin que la taille du monde n'impose pas de tout rendre simultanément.

## 14. Prisonniers et alliés enragés

Le système prévoit normalement cinq ouvriers prisonniers. Dans les layouts
officiels actuels, les stages 2 à 10 en placent chacun cinq. Le layout officiel
du stage 1, `terrain_vierge`, n'en place actuellement aucun. Lorsqu'aucun layout
composé ne fournit explicitement cette liste, la génération de repli en crée
cinq.

Pour libérer un prisonnier, un joueur vivant doit simplement passer à moins de
64 pixels. La libération :

- ajoute un sauvetage au compteur collectif ;
- soigne le sauveteur de 30 % de ses points de vie maximum ;
- transforme temporairement le prisonnier en allié enragé.

L'allié enragé suit son sauveteur pendant 20 secondes. Toutes les 1,2 secondes,
il élimine une partie des ennemis normaux proches et inflige des dégâts
importants aux élites et aux boss, sans pouvoir achever directement ces derniers.
Ses éliminations ne donnent que 25 % de l'expérience normale afin d'éviter une
explosion incontrôlée de la progression.

Il peut exister au maximum cinq alliés enragés simultanément.

Les prisonniers sont un objectif secondaire important : sauver tous ceux du
layout actif est nécessaire pour obtenir trois étoiles. Sur le layout officiel
actuel de `terrain_vierge`, ce critère est satisfait d'office puisque le total
est nul.

## 15. Pickups et coffres

Les objets ramassables sont :

| Objet | Effet |
|---|---|
| Gemme d'expérience | ajoute de l'expérience |
| Soin | restaure des points de vie |
| Aimant | aspire les gemmes présentes |
| Coffre | améliore ou fait évoluer l'équipement |
| Pièce | augmente l'or de la partie |

À chaque mort ennemie, une gemme d'expérience tombe. Les soins et aimants ont
une faible probabilité supplémentaire d'apparaître. Les coffres ne tombent pas
aléatoirement des ennemis ordinaires.

Sources principales de coffres :

- convoyeurs périodiques ;
- mini-boss ;
- autres porteurs explicitement définis par le jeu.

Un coffre normal produit une issue. Un super coffre doré, qui a 10 % de chances
d'apparaître, peut produire jusqu'à trois issues. Le coffre :

1. cherche d'abord une évolution éligible ;
2. sinon améliore une arme possédée ;
3. si tout est déjà au maximum, soigne le joueur de 30 % de ses points de vie
   maximum.

L'ouverture utilise une présentation de machine à sous. Le joueur peut passer
l'animation ; la simulation reste gelée jusqu'à la fermeture correcte du
panneau.

## 16. Objets destructibles et pièces

Les stages contiennent des caisses, palettes, gravats, matériaux, éléments
métalliques et autres objets destructibles thématiques.

Ils sont :

- non bloquants pour le déplacement ;
- cassables par les armes ;
- cassés immédiatement au contact direct d'un joueur ;
- susceptibles de laisser des pièces selon leur matériau et leur définition.

Les pièces ramassées pendant une partie sont ajoutées au total persistant à la
fin de la partie, que celle-ci se termine par une victoire ou une défaite.

**État actuel important :** cette monnaie persistante constitue la fondation
d'une future boutique ou méta-progression, mais aucune boutique active ne la
dépense encore. Il ne faut pas inventer d'améliorations permanentes déjà
achetables.

## 17. Progression des stages et étoiles

Le stage 1 est toujours accessible. Pour ouvrir chaque stage suivant, il faut
avoir obtenu trois étoiles sur chacun des stages précédents.

Les étoiles sont strictement cumulatives :

- 0 étoile : défaite ;
- 1 étoile : victoire contre le boss final ;
- 2 étoiles : victoire et au moins une arme évoluée ;
- 3 étoiles : victoire, au moins une arme évoluée et tous les prisonniers du
  layout actif libérés.

Sur les stages qui en contiennent cinq, il faut donc sauver les cinq. Sauver
tous les prisonniers sans faire évoluer d'arme donne seulement une étoile. La
meilleure note de chaque stage est conservée dans le stockage local du
navigateur et ne peut pas régresser.

Après une victoire, le bouton « Stage suivant » apparaît uniquement si le stage
suivant vient d'être réellement déverrouillé.

## 18. Score, rapport de fin et classements

La simulation utilise le champ `score` comme compteur d'ennemis tués. Le score
du classement est différent et se calcule ainsi :

```text
score de base =
  ennemis tués × 10
  + secondes survécues × 5
  + niveau atteint × 100
  + pièces × 2

score final en cas de victoire = score de base × 1,5
```

Le rapport de fin indique notamment :

- victoire ou défaite ;
- progression du chantier ;
- temps joué et temps restant ;
- éliminations ;
- niveau atteint ;
- pièces récupérées ;
- détail par joueur en coop ;
- podium de l'équipe ;
- prisonniers sauvés ;
- évolutions réalisées ;
- nombre d'étoiles.

Les classements sont séparés par stage et conservent jusqu'à vingt entrées. Une
entrée qualifiée peut ouvrir un écran de saisie de nom. Le meilleur score
global alimente aussi l'affichage de high score du titre.

## 19. Succès persistants

Les succès sont globaux au profil, pas liés à un stage particulier.

| Succès | Condition |
|---|---|
| Contrôle inopiné | tuer un boss |
| Cent fois sur le métier | tuer 100 ennemis au total |
| Démolisseur agréé | tuer 1 000 ennemis au total |
| Livraison de matériel | ouvrir un coffre |
| Outillage homologué | faire évoluer une arme |
| Journée complète | survivre 10 minutes dans une partie |
| Chantier livré | terminer un stage |
| Sauveteur secouriste | libérer un prisonnier |
| Compagnon | atteindre le niveau 20 |
| Maître d'œuvre | terminer trois stages |

Les compteurs cumulés et les meilleurs résultats sont persistés dans le
navigateur.

## 20. Écrans et états du jeu

Les principaux écrans sont :

- titre ;
- consentement plein écran ;
- sélection des personnages ;
- jeu ;
- pause ;
- choix d'amélioration ;
- machine à sous de coffre ;
- game over ;
- victoire ;
- saisie de nom ;
- scores ;
- succès ;
- recettes d'évolution ;
- options ;
- éditeur de niveaux.

Les options gèrent notamment :

- volume général ;
- volume de la musique ;
- volume des effets ;
- son coupé ou actif ;
- vibrations ;
- taille des textes de jeu ;
- plein écran ;
- préférence de plein écran au démarrage.

La mini-carte peut être masquée. Elle sert entre autres à situer les joueurs,
les prisonniers et les points d'intérêt.

## 21. Audio, ambiance et effets

Le jeu possède des musiques, ambiances, voix et effets sonores. Ils font partie
du produit même lorsqu'un fichier particulier n'a pas encore de point d'appel
visible.

Le rendu ajoute des effets qui ne modifient pas la simulation :

- secousses de caméra ;
- dégâts flottants ;
- télégraphes ;
- particules et débris ;
- bulles des PNJ ;
- retours de coups ;
- animations de coffre ;
- vibrations ;
- flaques et effets du mode Carnage.

Ces effets rendent l'action lisible et spectaculaire, mais ne doivent jamais
changer les résultats déterministes du cœur du jeu.

## 22. Mode Carnage secret

Au menu titre, la séquence suivante active ou désactive le mode Carnage :

```text
haut, haut, bas, bas, gauche, droite, gauche, droite, retour, valider
```

Sur une manette Xbox, les deux dernières actions correspondent à B puis A.

Le mode Carnage est cosmétique. Il ajoute notamment des flaques et un bilan
visuel, mais ne change ni les dégâts, ni les apparitions, ni le score, ni
l'équilibrage de la simulation.

## 23. Éditeur et layouts de niveaux

L'éditeur est accessible depuis le titre ou avec `?editor=true`. Il permet de
composer les layouts des dix stages à partir du catalogue de terrain, décors,
obstacles, PNJ, prisonniers, objets destructibles, chemins et zones.

Il existe trois notions distinctes qu'il ne faut jamais confondre :

1. **Brouillon d'éditeur**

   Autosauvegardé dans `localStorage` sous la clé
   `stageComposer:<stage>`. Il sert à reprendre le travail dans l'éditeur.

2. **Variante personnelle jouable**

   Le bouton « Sauver comme variante personnelle » stocke une version locale
   dans le navigateur. Cette variante a priorité sur la version officielle
   tant qu'elle existe.

3. **Niveau officiel**

   En environnement de développement, le bouton « Publier comme niveau
   officiel » écrit `src/content/layouts/<stage>.json` et régénère
   `src/content/composedLayouts.ts`.

Une publication officielle :

- ne fonctionne que pour l'un des dix stages connus ;
- ne peut écrire que dans `src/content/layouts` et le registre généré ;
- affiche les chemins modifiés ;
- n'effectue aucun `git add`, commit ou push ;
- ne supprime pas automatiquement la variante personnelle.

Après publication, une variante personnelle existante continue donc de masquer
la nouvelle version officielle dans le navigateur. Il faut utiliser
« Restaurer le niveau d'origine » pour supprimer cette priorité locale et jouer
le layout officiel.

## 24. Architecture technique à respecter

Le projet sépare strictement la simulation, le contenu, le rendu et l'interface.

| Dossier | Responsabilité |
|---|---|
| `src/core` | simulation pure et déterministe |
| `src/content` | données des armes, ennemis, stages, équilibrage et layouts |
| `src/render` | rendu Phaser observant l'état du jeu |
| `src/ui` | écrans et surcouches DOM |
| `src/input` | clavier, manettes, tactile et routage des intentions |
| `src/app` | orchestration des écrans et de la simulation |
| `src/editor` | éditeur de layouts |

Règles essentielles :

- `src/core` n'importe jamais Phaser ni le DOM ;
- la logique de gameplay appartient au cœur, pas au rendu ;
- le cœur et le contenu n'utilisent jamais `Math.random()`, `Date.now()` ou
  `new Date()` ;
- même seed et mêmes entrées doivent produire le même résultat ;
- les entités sont identifiées par des ids et composées de données ;
- les systèmes travaillent sur ces données ;
- les armes, ennemis, passifs et stages sont data-driven ;
- le rendu observe l'état et ne décide pas des règles ;
- `GameScene` ne doit contenir que le cycle de vie Phaser et la délégation vers
  des modules de rendu spécialisés ;
- aucun joueur ne doit être codé en dur comme « player1 » ou « player2 » ;
- l'interface doit rester entièrement navigable au clavier et à la manette.

Flux de dépendances attendu :

```text
input → core ← app → render
              └────→ ui
```

## 25. Interface de test déterministe

En développement ou avec `?test=1`, le navigateur expose `window.__GAME__`.
Cette interface permet à Playwright ou à une IA de jouer sans cliquer sur des
coordonnées du canvas.

Fonctions importantes :

- `getState()` : renvoie l'état complet en JSON ;
- `renderToText()` : produit une représentation textuelle ;
- `advanceTime(ms)` : avance le jeu déterministement ;
- `setInput(playerId, input)` : injecte un déplacement ou une action ;
- `setSeed(seed)` : fixe la seed ;
- `nav(direction)`, `confirm()` et `back()` : pilotent les menus ;
- `start()`, `pause()`, `resume()` et `restart()` : pilotent la partie ;
- `chooseUpgrade(index)` : choisit une carte de niveau.

Exemple de démarrage direct :

```text
?autostart=solo&level=1&seed=123&test=1
```

Le repère du monde est :

```text
origine en haut à gauche
+x vers la droite
+y vers le bas
```

Une IA doit décider à partir de `getState()`, injecter une entrée, avancer le
temps, puis observer le nouvel état. Les captures d'écran servent à contrôler
le rendu, pas à prouver les règles de gameplay.

## 26. Limites importantes des tests automatiques actuels

Les bots de simulation ne représentent pas correctement un joueur humain. Ils
servent surtout à vérifier le déterminisme, les invariants et les régressions
grossières.

Limites connues :

- certains bots utilisent encore comme repère un ancien centre d'arène
  `{x: 800, y: 600}`, alors que le centre réel du monde est
  `{x: 5120, y: 3840}` ;
- ils comprennent mal les obstacles et les layouts composés ;
- ils ne planifient pas de route vers les prisonniers ou les destructibles ;
- ils ne construisent pas consciemment une synergie d'armes et de passifs ;
- le harness choisit généralement la carte d'index 0 lors d'une montée de
  niveau ;
- ils ne lisent pas les télégraphes comme un humain ;
- ils n'évaluent pas la clarté, le plaisir, le rythme ressenti ou la difficulté
  réelle ;
- un bot immobile est utile comme cas limite, mais ce n'est pas un comportement
  de joueur normal.

Conséquence :

> Une survie ou une mort de bot ne suffit pas à conclure que le jeu est trop
> facile, trop difficile ou amusant. L'équilibrage doit être confirmé par une
> partie pilotée activement, avec déplacement continu, esquive, collecte,
> exploration, choix de build et réaction aux télégraphes.

Le harness headless reste pertinent pour :

- reproduire exactement une seed ;
- détecter des valeurs impossibles ou des `NaN` ;
- vérifier les plafonds d'entités ;
- comparer deux versions avec les mêmes entrées ;
- contrôler que les systèmes ne divergent pas ;
- repérer une régression majeure.

## 27. Ce qu'une IA ne doit pas inventer

- Les personnages n'ont pas encore de statistiques uniques actives.
- Les pièces persistantes n'ont pas encore de boutique active.
- Le jeu n'est pas gagné au mini-boss de 5 minutes.
- Une partie n'est pas limitée à l'ancien MVP de 6 à 8 minutes.
- Le jeu ne contient pas seulement le stage Terrain vierge.
- Le jeu ne contient pas seulement trois armes ou trois ennemis.
- Les attaques ne demandent pas de maintenir un bouton de tir.
- Les layouts personnels ne deviennent pas officiels par une sauvegarde locale.
- Une publication officielle ne fait jamais de commit ou de push.
- Le mode Carnage n'est pas un modificateur de difficulté.
- Les PNJ d'ambiance ne doivent pas être transformés arbitrairement en quêtes.
- Les fichiers de musique, de tuiles et les archives historiques ne sont pas du
  code mort à supprimer.
- Les résultats d'un bot passif ne représentent pas l'expérience d'un joueur.
- Les anciens plans et commentaires ne sont pas plus fiables que le code actuel.

## 28. Sources de vérité principales dans le dépôt

Pour vérifier ou mettre à jour ce document :

- règles et valeurs globales : `src/content/config.ts` ;
- ordre et thème des stages : `src/content/phases.ts` ;
- layouts officiels : `src/content/layouts/*.json` ;
- registre des layouts : `src/content/composedLayouts.ts` ;
- personnages : `src/content/characters.ts` ;
- armes : `src/content/weapons.ts` ;
- passifs : `src/content/passives.ts` ;
- évolutions : `src/content/evolutions.ts` ;
- ennemis : `src/content/enemies.ts` ;
- rythme d'apparition : `src/content/spawnRamp.ts` ;
- étoiles : `src/content/stars.ts` ;
- succès : `src/content/achievements.ts` ;
- score de classement : `src/content/score.ts` ;
- simulation réelle : `src/core/simulation.ts` et `src/core/systems/` ;
- écrans et flux applicatif : `src/app/app.ts` ;
- contrôles : `src/input/keyboard.ts` et `src/input/gamepad.ts` ;
- seam de test : `src/app/seam.ts` ;
- éditeur : `src/editor/`.

## 29. Résumé opérationnel pour une autre IA

Si une IA doit modifier le jeu, elle doit raisonner dans cet ordre :

1. identifier si la demande touche une règle, une donnée, le rendu, l'UI,
   l'entrée ou l'éditeur ;
2. trouver la source de vérité correspondante ;
3. ne pas déplacer une règle de simulation dans Phaser ou dans le DOM ;
4. préserver le déterminisme ;
5. préserver les modes un à quatre joueurs ;
6. préserver le clavier et la manette sur tous les écrans ;
7. utiliser les layouts officiels sans écraser silencieusement une variante
   personnelle ;
8. tester la logique sur le vrai code de production ;
9. jouer activement la situation modifiée via le seam ou Playwright ;
10. ne jamais confondre un résultat de bot avec un verdict de game design.
