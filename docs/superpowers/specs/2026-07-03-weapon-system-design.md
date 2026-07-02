# Design — Système d'armes / level-up façon Vampire Survivors (BTP)

Date : 2026-07-03 · Statut : design validé en brainstorming, à relire avant plan d'implémentation.

## 1. Contexte & objectif

Le système actuel est plat : 3 armes à stats **fixes** (`cloueur`/`scie`/`marteau`), et 6 cartes d'upgrade qui ne font que des **multiplicateurs globaux** (`damageMult`/`cooldownMult`). Pas de niveau par arme, pas de passifs dédiés, pas d'évolutions. Résultat de playtest : on ne fait que **fuir** — il manque la **phase de puissance**, qui est le cœur d'un VS-like.

Objectif : reproduire la profondeur de **Vampire Survivors** — armes qui montent en niveau, passifs (stats globales), et **évolutions/combinaisons** (arme au max + passif catalyseur) — adapté au thème chantier. Le ressenti cible = la **phase de puissance** : le perso devient fort, l'écran se remplit d'**ennemis nombreux qui fondent vite**.

**Stratégie (découplage assumé).** On ne réécrit pas tout le jeu d'un coup. On livre le **système** + un **vertical slice** jouable sur **une seule phase**, en runs de **~10-12 min**, pour **valider le fun** avant de produire le roster complet et d'engager les 22 min × 10 phases.

## 2. Décisions verrouillées (issues du brainstorming)

- **Profondeur VS complète**, mais runs de **10-12 min** pour le proto (pas 22 min × 10 tout de suite).
- **Chaque phase = un run complet** de ~10-12 min avec son arc et son boss final (cible ; le proto n'en fait qu'une).
- **Évolutions déclenchées par un coffre** lâché par un **boss de mi-parcours (~3:00)** — fidèle à VS.
- **Modèle de données = tables de stats par niveau** (contrôle total palier par palier).
- **Inventaire 6 armes + 6 passifs** ; **level-up = 1 carte parmi 4** (nouvelle arme / nouveau passif / +1 niveau).
- **Arc** : Fuite (0-3) → Boss+coffre → Puissance (3-9) → Tension/climax + Boss final (~11) = victoire.

## 3. Architecture & modèle de données

Respecte les règles du dépôt : `src/core` pur (pas de Phaser/DOM), déterminisme (RNG seedé), data-driven, un fichier = une responsabilité.

### Contenu (`src/content/`)
```ts
// weapons.ts — chaque ligne = stats EFFECTIVES de l'arme à ce palier
interface WeaponLevel {
  damage: number; cooldownMs: number; count?: number;   // count = projectiles/lames
  area?: number; pierce?: number;
  projectileSpeed?: number; projectileLifeMs?: number;
  orbitRadius?: number; orbitSpeed?: number; orbitHitRadius?: number;
}
interface WeaponDef { id: string; name: string; kind: WeaponKind; maxLevel: number; levels: WeaponLevel[] }
export function weaponStatsAtLevel(def: WeaponDef, level: number): WeaponLevel // pure

// passives.ts — un passif contribue à des stats GLOBALES
interface GlobalStats { might; area; amount; cooldown; duration; projectileSpeed; moveSpeed; maxHp; recovery; magnet; growth }
interface PassiveDef { id: string; name: string; maxLevel: number; perLevel: Partial<GlobalStats> }
export function aggregatePassives(owned: {id:string;level:number}[]): GlobalStats // pure

// evolutions.ts
interface EvolutionDef { base: string; passive: string; evolved: string; reqBaseLevel: number; reqPassiveLevel: number }
```

### Cœur (`src/core/`) — pur, déterministe
- Composant `weapons` : slot devient `{ id, level, cooldownLeftMs }` (ajout de `level`).
- Composant `passives` sur le joueur : `{ list: {id, level}[] }`. On **remplace** `player.damageMult`/`cooldownMult` par un `PlayerStats` **dérivé** de `aggregatePassives(...)` (recalculé au gain).
- `weaponSystem` : inchangé dans sa structure, mais lit **stats effectives = `weaponStatsAtLevel(def, level) ⊗ PlayerStats`** (dégâts×might, cooldown×cooldown, count+amount, area×area, life×duration, projectileSpeed×projectileSpeed…).
- **Level-up** (`leveling`/`simulation`) : `rollCards(rng, inventory)` renvoie ≤4 cartes distinctes `{ kind:'weapon-new'|'passive-new'|'weapon-up'|'passive-up', id }` parmi les items éligibles. `applyCard(...)` mute l'inventaire.
- **Évolution** : à la collecte du coffre, `tryEvolve(world, player)` → cherche une arme éligible (`level==max` ET catalyseur possédé au niveau requis) ; remplace le slot par l'arme évoluée + événement. Aucune éligible → bonus (soin/or/XP).

### Rendu/UI (`src/render`, `src/ui`)
- Écran de carte enrichi (nouveau vs `Niv. X → Y`, effet 1 ligne) — réutilise l'écran d'upgrade existant + `FocusModel`.
- **Bandeau d'inventaire HUD** permanent : 6 armes + 6 passifs, icône + pastille de niveau (observation pure).
- **Retour d'évolution** : coffre → flash/halo sur l'arme + bandeau « ÉVOLUTION » + jingle (infra pickup/VFX/voix existante).

### Déterminisme & pureté
`weaponStatsAtLevel`, `aggregatePassives`, `rollCards`, éligibilité, `tryEvolve` = **fonctions pures** ; tout aléa passe par le `Rng` seedé. Testables en Vitest sur le vrai code de prod.

## 4. Roster cible (10 armes · 11 passifs · 10 évolutions)

| # | Arme | Archétype | Catalyseur (+ stat) | → Évolution |
|---|------|-----------|---------------------|-------------|
| 1 | Cloueur | projectile auto-visée | Air comprimé (+vit. proj.) | Mitrailleuse à clous |
| 2 | Scie orbitale | orbital | Outillage renforcé (+puissance) | Disqueuse folle |
| 3 | Marteau-piqueur | zone autour de soi | Gants anti-vibration (+régén) | Marteau-pilon |
| 4 | Pied-de-biche | balayage perforant | Bras télescopique (+zone) | Barre à mine |
| 5 | Goudron chaud | zone au sol | Cadence de chantier (−cooldown) | Coulée de bitume |
| 6 | Boulons ricochets | ricochet | Aimant de chantier (+aimant) | Tempête de boulons |
| 7 | Court-circuit | foudre aléatoire | Groupe électrogène (+nombre) | Haute tension |
| 8 | Clé à molette | boomerang | Batterie 18V (+durée) | Clé à choc |
| 9 | Extincteur | cône court / contrôle | Casque homologué (+PV max) | Canon à mousse |
| 10 | Brouette | gros projectile traversant | Prime de rendement (+XP) | Transpallette automatisée |

**Passifs** : les 10 catalyseurs ci-dessus (1 par arme, chacun une stat distincte) + 1 utilitaire `Chaussures de sécurité` (+vitesse dépl.). Toutes les stats VS couvertes, zéro doublon. **Noms « blague de menu »** écartés des passifs (`Renfort d'intérim`, `Heures sup`) → réservés à des succès / noms de vague / punchlines.

## 5. Level-up & inventaire

- **Tirage** : ≤4 cartes distinctes parmi { +niveau arme possédée non-maxée, +niveau passif possédé non-maxé, nouvelle arme (si <6 armes), nouveau passif (si <6 passifs) }. Seedé, sans doublon. Pondération uniforme au départ.
- **Inventaire plein** : armes pleines → plus de carte « nouvelle arme » ; idem passifs. **Rien d'éligible** (tout maxé) → pas d'écran bloquant, bonus auto.
- **Inventaire HUD** : toujours visible → on lit son build d'un coup (viser une évolution). Détail en pause = optionnel, hors MVP.
- **Évolution** : coffre du boss de mi-parcours → `tryEvolve` (1 seule arme évoluée si plusieurs éligibles, ordre de slot, déterministe).

## 6. Arc du run & horde

**Arc (~11 min)** : Fuite `0-3` (faible, on esquive) → **Boss mi-parcours ~3:00 + coffre → évolution** → Puissance `3-9` (on fauche la horde qui fond) → Tension/climax `9-12` + **Boss final ~11:00 = victoire**.

**Horde « beaucoup d'ennemis qui fondent vite »** :
- **Découpler la difficulté** (aujourd'hui `difficultyScaleAt` monte tout ensemble) : le **nombre** rampe fort (`SPAWN.maxActive` 200 → ~400-600 en phase de puissance, cadence de spawn haute → churn) ; les **PV ennemis** rampent doucement pendant la puissance (→ melt) puis PV+nombre montent en phase brutale. La **puissance joueur** (niveaux + évolution + passifs) doit dépasser la courbe.
- **Perf (risque principal)** : sprites 192² lourds. Livrables : **pooling de sprites** (réutiliser au lieu de create/destroy à chaque spawn/mort) ; **culling rendu** (ne dessiner que l'écran) ; **hachage spatial** côté sim si N élevé (collisions/voisin) ; **test de stress horde** via le seam (spawn 500, mesurer le temps de frame) avec **cible FPS explicite**.
- **Bosses** : le boss-victoire actuel (5:00) se **scinde** — boss **mi-parcours ~3:00** (lâche le coffre, ne finit pas le run) + boss **final ~11:00** (= victoire). Adapter `updateWin`/spawn boss.

## 7. Périmètre du 1er proto (vertical slice)

- **5 armes** : Cloueur, Scie orbitale, Marteau-piqueur (les 3 actuelles ré-outillées) + **Pied-de-biche** + **Court-circuit** (archétypes : projectile, orbital, zone-soi, balayage perforant, foudre aléatoire).
- **6 passifs** : Air comprimé (+vit. proj.), Groupe électrogène (+nombre) — les 2 catalyseurs du slice — + Outillage renforcé (+puissance), Cadence de chantier (−cooldown), Casque homologué (+PV max), Chaussures de sécurité (+vit. dépl.).
- **2 évolutions** : Cloueur + Air comprimé → **Mitrailleuse à clous** ; Court-circuit + Groupe électrogène → **Haute tension** (le combo « Thunder Loop »).
- **Arc 10-12 min complet** : boss mi-parcours + coffre + boss final ; **horde + perf** (pooling/culling/stress test) ; **re-tuning** de l'équilibrage sur la nouvelle courbe.

Les 5 autres armes, 5 passifs catalyseurs restants et 8 évolutions = **contenu cible**, produits après validation du fun.

## 8. Tests & validation

- **Vitest (pur)** : `weaponStatsAtLevel` palier par palier ; `aggregatePassives` (multiplicatif/additif) ; `rollCards` (inventaire plein ⇒ pas de new-weapon ; item maxé exclu ; sans doublon) ; `tryEvolve` (arme max + catalyseur ⇒ bonne évolution ; sans éligible ⇒ bonus) ; slot `level` et stats effectives.
- **Sim harness (`npm run sim` / `sim:check`)** : **re-dériver cibles + baseline** pour l'arc 10-12 min. Cibles : 1ʳᵉ évolution ~3 min · puissance = HP stable + kill-rate haut · brutal = HP qui descend · victoire par boss final avec build tenu.
- **Test de stress horde** (seam) : spawn ~500, mesurer temps de frame, **cible FPS** (ex. ≥ 50 fps en logiciel de test) — gate perf.
- **Seam / e2e** (headless) : level-up via `chooseUpgrade`/cartes, montée de niveau d'arme, collecte coffre → évolution reflétée dans `getState()`, boss mi-parcours ≠ victoire, boss final = victoire.
- **Play-to-validate** : run réel joué à l'aveugle via le seam (build → évolution → melt).

## 9. Hors périmètre (backlog)

22 min × 10 phases · reste du roster (5 armes + 5 passifs + 8 évolutions) · Unions (2 armes → 1) · reroll/skip/banish de cartes · méta-progression · refonte de tous les stages à l'arc long.

## 10. Risques

- **Perf horde** (le plus sérieux) : mitigé par pooling/culling/stress test avec cible FPS ; à valider tôt.
- **Coût de re-tuning** : la nouvelle courbe invalide le tuning 6-8 min ; le framework sim existe pour re-dériver.
- **Monotonie** : 10-12 min sur une phase à contenu mince ; la phase de puissance + les évolutions doivent porter le fun (c'est justement ce qu'on valide).
