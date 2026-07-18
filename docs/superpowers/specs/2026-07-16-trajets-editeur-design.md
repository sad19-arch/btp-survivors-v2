# Trajets d'entités dans le Stage Composer — design

**Date** : 2026-07-16
**Statut** : validé (décisions user actées ci-dessous)

## Le problème

> « Comment je peux indiquer à des PNJ de se déplacer d'un point A à un point B ?
> Pareil pour les camions. Si c'est possible, dis-moi comment ; sinon rends-le possible. »

La question n'a pas de réponse aujourd'hui, pour une raison structurelle : **deux
systèmes coexistent sans se parler**.

| Système | Ce qu'il fait | Fichier |
|---|---|---|
| `layout.npcs[]` | PNJ posés, **statiques** — `planNpcJobs` leur donne `ax=bx`, `speed:0` : ils jouent leur geste métier sur place, point. | `workerBehavior.ts:284` |
| `layout.paths[]` | Chaque chemin **fabrique sa propre silhouette anonyme** (un porteur générique ou `prop_s2_truck`) et la fait marcher dessus. | `siteWorkers.ts:452` |

**On ne peut donc pas relier un PNJ posé à un chemin.** Poser un maçon, tracer un
chemin, et dire « ce maçon suit ce chemin » est impossible : le chemin choisit
seul son marcheur.

S'y ajoutent trois défauts d'ergonomie qui rendent la fonctionnalité *invisible*
alors qu'elle existe :

1. **`Entrée` n'est annoncé nulle part.** `finishPath()` n'est appelé que par
   `Enter` (`EditorScene.ts:655`), mais l'indice affiché dit seulement « clique
   sur la map (Échap pour annuler) » (`EditorOverlay.ts:227`). Sans la touche, on
   pose des points et **il ne se passe jamais rien** — le symptôme exact rapporté.
2. **Les deux outils sont dans deux sections différentes** : « Chemin camion » en
   *Marqueurs*, « Chemin ouvrier » en *Ouvriers & chemins* (`PrefabCatalog.ts:236-237`).
3. **Échec silencieux du camion** : si `prop_s2_truck` n'est pas chargé sur le
   stage, le chemin est ignoré par un `continue` muet (`siteWorkers.ts:460`). On
   trace, et rien n'apparaît, sans un mot.

## Décisions (user)

| Question | Réponse retenue |
|---|---|
| Qui parcourt un chemin ? | **Le chemin porte ses marcheurs** — on lui dit qui et combien. Les PNJ posés restent fixes à leur poste. |
| Que fait un marcheur au bout ? | **Pause réglable + option sens unique** (disparaît au bout, réapparaît au départ). |
| Plusieurs marcheurs sur un chemin ? | **Étalés automatiquement** (décalage de phase), zéro réglage. |
| Aller-retour ou boucle ? | **Aller-retour** — pas de bascule à construire. |

## Architecture

**Fonction pure du temps**, pas de marcheurs à état : `position = f(chemin, t)`.

Retenu parce que c'est du **décor d'ambiance, pas du gameplay** :
- aucun état à réinitialiser au restart de scène (source de fuites déjà vécue) ;
- testable en Vitest sans Phaser ;
- déterministe par construction ;
- N marcheurs étalés = un simple décalage de phase, gratuit.

L'alternative (marcheurs à état, avançant de `dt`) ouvrirait l'accélération et
l'évitement d'obstacles — qu'on ne veut pas ici, et qu'on paierait en état,
en tests et en risque. Un marcheur traverse un obstacle : c'est **déjà le cas**
aujourd'hui et ça n'a jamais posé problème pour du décor.

**Flux de dépendances inchangé.** `layer`/`paths` sont des données de RENDU : la
sim ne les lit jamais → `sim:check` diff 0 par construction, comme `RenderLayer`.

## Modèle de données

`src/content/stageLayout.ts` :

```ts
export interface LayoutPath {
  id: string
  type: PathType            // conservé : couleur du tracé + sémantique de rendu
  points: Vec2[]
  name?: string             // « Livraison béton » — repérage dans l'inspecteur
  skin?: string             // QUI parcourt (défaut : porteur / camion selon `type`)
  count?: number            // COMBIEN, étalés automatiquement (défaut 1)
  speed?: number            // px/s (défaut 74 ouvrier / 150 camion)
  pauseMs?: number          // pause aux DEUX extrémités (défaut 0 = comportement actuel)
  oneWay?: boolean          // disparaît au bout, réapparaît au départ (défaut false)
}
```

**Tous les champs neufs sont optionnels** : les compos existantes fonctionnent à
l'identique, sans migration. Défauts = comportement actuel exactement.

`type` est CONSERVÉ (et non remplacé par `skin`) parce qu'il porte une vraie
différence de rendu, pas une simple étiquette : `isCamion` décide de l'animation
de marche et de l'orientation (`siteWorkers.ts:740`). Un camion n'est pas un
piéton avec une autre texture.

## Le calcul

`pathFollow` raisonne aujourd'hui en **distance** (`traveled % (2*total)`). Une
pause est du **temps**, pas de la distance → bascule du raisonnement en temps.

Soit `tTrajet = longueur / vitesse`, `pause = pauseMs / 1000` :

| Mode | Cycle | Déroulé |
|---|---|---|
| Aller-retour (défaut) | `2·tTrajet + 2·pause` | aller → pause en B → retour → pause en A → … |
| Sens unique | `tTrajet + pause` | aller → pause en B → **invisible** → réapparaît en A |

Signature étendue :

```ts
export interface PathOpts {
  pauseMs?: number
  oneWay?: boolean
}
export interface PathResult {
  x: number; y: number; seg: number
  dirX: number; dirY: number
  atEnd: boolean
  /** false = marcheur caché (sens unique, entre la fin et la réapparition). */
  visible: boolean
}
export function pathFollow(
  points: ReadonlyArray<PathPoint>,
  tMs: number,
  speedPxPerSec: number,
  opts?: PathOpts
): PathResult
```

`visible` est nécessaire : sans lui, un camion en sens unique se **téléporterait
à vue** du bout au départ — artefact visuel classique.

Étalement de N marcheurs : marcheur `i` reçoit `tMs + i * (cycle / count)`. Ils se
répartissent d'eux-mêmes et se croisent. C'est le mécanisme `phaseOffsetMs` déjà
en place (`siteWorkers.ts:471`), généralisé.

**Compat** : `pathFollow(pts, t, v)` sans `opts` doit rendre **exactement** le même
résultat qu'aujourd'hui (`visible: true` constant). Vérifié par test.

## Composants

| Fichier | Responsabilité | Nature du changement |
|---|---|---|
| `src/content/stageLayout.ts` | Type `LayoutPath` étendu | additif, champs optionnels |
| `src/editor/StageLayoutSchema.ts` | `parseLayout` **préserve** les champs neufs | additif — **le piège** : 3 régressions déjà vécues ici (`destructible`, `layer`, `tile`) |
| `src/render/workerBehavior.ts` | `pathFollow` + pauses + sens unique (PUR) | cœur du lot, testable |
| `src/render/scenes/siteWorkers.ts` | `count` marcheurs par chemin, skin/vitesse choisis, `visible` | consommation |
| `src/editor/EditorState.ts` | `addPath` avec réglages + mutateurs | additif |
| `src/editor/EditorOverlay.ts` | Inspecteur de chemin + indice `Entrée` + avertissement camion | ergonomie |
| `src/editor/PrefabCatalog.ts` | Une seule section « PNJ & chemins » | ré-étiquetage |

## Ergonomie (les 3 correctifs)

1. **Indice de tracé** : « clique pour poser les points · **Entrée** pour valider ·
   Retour arrière annule le dernier · Échap abandonne », avec le compteur de points
   posés (`N points`). C'est la cause exacte de l'incompréhension rapportée.
2. **Section unique « PNJ & chemins »** : les deux outils de chemin y sont réunis.
3. **Avertissement camion** : si le stage n'a pas de sprite camion, l'inspecteur le
   dit. Plus de `continue` muet.

## Inspecteur d'un chemin

Sélection d'un chemin → réglages : nom · qui le parcourt · combien · vitesse ·
pause · case « sens unique ». Seul endroit à régler, cohérent avec « le chemin
porte ses marcheurs ».

**Le choix de `skin` est filtré par `type`** — et ce n'est pas cosmétique : `type`
décide de l'animation de marche et de l'orientation (`isCamion`). Un skin de camion
sur un `worker_path` produirait un camion qui « marche » : incohérent. Donc :
- `worker_path` → skins de PNJ du stage (métiers + ouvriers génériques) ;
- `truck_path` → sprites de véhicule disponibles.

Un `skin` inconnu au chargement (compo d'un stage qui ne l'a pas) retombe sur le
défaut de la famille — jamais d'écran vide, jamais de crash.

**Bornes** (pour que l'inspecteur ne puisse pas produire d'absurdité) :
- `count` ∈ [0, 8] — **0 = aucun marcheur**, le chemin devient un simple repère
  de conception (utile pour tracer une intention sans peupler) ;
- `speed` ∈ [10, 400] px/s — 0 provoquerait une division par zéro dans `tTrajet` ;
- `pauseMs` ∈ [0, 30000].
Les valeurs hors bornes sont **clampées au parse**, pas rejetées : une compo reste
chargeable.

## Hors périmètre (YAGNI)

- Évitement d'obstacles / files d'attente (c'est du décor).
- Vitesse ou skin différents **par marcheur** d'un même chemin (l'user a écarté :
  « l'inspecteur devient une liste à gérer »).
- Bascule boucle fermée / aller-retour (l'aller-retour convient).
- Assignation d'un PNJ posé à un chemin (modèle « le chemin porte ses marcheurs »
  retenu à la place).

## Vérification

**Vitest (pur, sur le vrai code)** :
- `pathFollow` sans `opts` = résultat identique à l'actuel (**non-régression**) ;
- pause : à `t` dans la fenêtre de pause, position figée à l'extrémité ;
- sens unique : `visible: false` entre la fin et la réapparition ; jamais de saut visible ;
- N marcheurs : positions distinctes, étalées sur le cycle ;
- `count: 0` → aucun marcheur (chemin = repère) ; `points.length < 2` et vitesse
  hors bornes → pas de NaN, pas de division par zéro, pas de boucle infinie ;
- `parseLayout` **préserve** `name`/`skin`/`count`/`speed`/`pauseMs`/`oneWay`, et
  **clampe** les valeurs hors bornes au lieu de rejeter la compo ;
- un `skin` inconnu retombe sur le défaut de la famille (pas d'écran vide) ;
- catalogue : les 2 outils de chemin sont dans la MÊME section, sur les 10 stages.

**e2e (`?editor=true`)** : tracer un chemin → `Entrée` → il existe ; l'indice
mentionne `Entrée` **avant** validation.

**Gates** : tsc · lint 0 · Vitest · build · e2e (2 projets) · assets:qa
· **`sim:check` diff 0** (à prouver, pas à supposer : `paths` est du rendu, mais
l'éditeur exporte vers `siteLayout`).

**Oracle final** : gametest user — tracer un chemin de camion avec pause, vérifier
que le camion s'arrête au bout et repart.
