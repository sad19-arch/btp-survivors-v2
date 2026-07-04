# Plan Persos-A — 5 armes de base manquantes (→ 10 armes distinctes)

> **Pour agents :** SOUS-SKILL REQUIS : superpowers:subagent-driven-development. Committer sur `feat/weapon-system-core` (HEAD `7c98367`). Pas de push sans feu vert. **Gate `type-check` = `npm run type-check` (tsc), coller la sortie — JAMAIS vitest seul.**

**Goal :** coder les 5 armes de base restantes du roster VS (goudron chaud, boulons ricochets, clé à molette, extincteur, brouette) — data + comportements cœur + 3 passifs catalyseurs + 5 évolutions + rendu jouable + réaffectation aux 5 persos placeholder — pour que les 10 personnages aient chacun une **arme de départ vraiment unique**.

**Architecture :** on étend le système d'armes data-driven existant (`WeaponKind` dispatch dans `src/core/systems/weapon.ts`). 3 des 5 armes réutilisent le kind `projectile` avec de nouveaux champs (`bounces` ricochet, `boomerangOutMs` aller-retour, `projectileRadius` gros projectile) ; 2 introduisent de nouveaux systèmes cœur purs : **hazard** (zone au sol DoT, goudron) et **cone+slow** (extincteur, 1er effet de contrôle du jeu). Tout reste déterministe (RNG seedé, pas de Phaser/Date dans `core`/`content`).

**Tech Stack :** TypeScript strict, ECS-lite maison (`World`), Vitest, harness `npm run sim`, Phaser (rendu observateur).

## Global Constraints (verbatim spec + CLAUDE.md)
- `src/core` & `src/content` **purs/déterministes** : interdit `Math.random`/`Date.now`/`new Date` (utiliser `Rng` seedé) ; `src/core` n'importe **jamais** Phaser/DOM. Zéro `any` (erreur ESLint), pas de `!` non-null. TS strict + `noUncheckedIndexedAccess`.
- **Data-driven** : armes/passifs/évolutions = données typées dans `src/content`, validées ; pas de logique par-entité copiée.
- **Prêt-N-joueurs** : entités portent `ownerId`/`playerId` ; jamais `player1` codé en dur.
- **Solo défaut inchangé** : l'ouvrier démarre avec `cloueur` ; les nouvelles armes ne sont **pas** dans le loadout par défaut → `sim:check` doit rester **VERT sans nouvelle dérive** (les cibles « skill récompensé » VERTES). Le câblage de `growth` doit laisser le run par défaut **byte-identique** (growth=1 → ×1).
- **Français in-game** (noms d'armes/passifs : « Goudron chaud », « Clé à molette », etc.).
- **Textes/noms exacts** (spec §4) : armes `Goudron chaud`, `Boulons ricochets`, `Clé à molette`, `Extincteur`, `Brouette` ; évolutions `Coulée de bitume`, `Tempête de boulons`, `Clé à choc`, `Canon à mousse`, `Transpallette automatisée` ; passifs `Aimant de chantier`, `Batterie 18V`, `Prime de rendement`.
- Gate par tâche : `npm run type-check` (coller sortie) + `npm run lint` + `npx vitest run` + `npm run sim:check` (VERTES) ; +`npx playwright test` pour les tâches rendu/app.

## Décisions de design verrouillées (archétype spec → implémentation)

| Arme (id) | kind impl | Mécanique | Catalyseur (passif) | → Évolution (id) |
|---|---|---|---|---|
| `goudron` Goudron chaud | **`hazard`** (nouveau) | Lâche une flaque au sol qui inflige des dégâts par tick aux ennemis dedans, pendant `lifeMs`. | `cadence_chantier` (−cd, existe) | `coulee_bitume` Coulée de bitume |
| `boulons` Boulons ricochets | `projectile` + `bounces` | Projectile qui rebondit vers l'ennemi le plus proche non-touché, `bounces` fois. | `aimant_chantier` (+magnet, NOUVEAU) | `tempete_boulons` Tempête de boulons |
| `cle_molette` Clé à molette | `projectile` + `boomerangOutMs` | Projectile lancé qui part `outMs` puis revient vers le lanceur (touche à l'aller ET au retour). | `batterie_18v` (+duration, NOUVEAU) | `cle_choc` Clé à choc |
| `extincteur` Extincteur | **`cone`** (nouveau) | Cône frontal vers l'ennemi le plus proche : dégâts + **ralentissement** (1er slow du jeu). | `casque_homologue` (+PV, existe) | `canon_mousse` Canon à mousse |
| `brouette` Brouette | `projectile` + gros `projectileRadius` | Gros projectile lent, traverse (pierce élevé), gros rayon. | `prime_rendement` (+growth XP, NOUVEAU) | `transpalette` Transpallette automatisée |

**Réaffectation persos** (`characters.ts`, remplace les armes partagées ⃰) : `ouvriere→brouette`, `charpentier→boulons`, `grutier→goudron`, `plombier→cle_molette` (clé = plombier !), `samoyede→extincteur` (chien-pompier). Après quoi **les 10 persos ont une arme distincte**. Défaut `ouvrier→cloueur` inchangé.

**Découpage en 2 tranches :**
- **Tranche A1 (ce plan) — jouable** : data + cœur + passifs + évolutions + rendu réutilisé (pas joli mais lisible) + réaffectation + tests. Livrable = les 5 armes se jouent, s'équipent via cartes, évoluent.
- **Tranche A2 (plan séparé ultérieur) — DA** : assets PixelLab dédiés (sprites de projectile, VFX goudron/cône/boomerang, icônes de cartes) via le skill `assets`. Hors de ce plan (process asset ≠ TDD).

---

## Task 1 — Data des 5 armes + 5 évoluées + champs de niveau

**Files :**
- Modifier : `src/content/weapons.ts` (WeaponKind, WeaponLevel, WEAPONS)
- Test : `tests/unit/weaponData.test.ts` (nouveau)

**Interfaces produites :**
- `WeaponKind` gagne `'hazard' | 'cone'`.
- `WeaponLevel` gagne (tous **optionnels**, défaut 0/undefined) : `bounces?: number`, `boomerangOutMs?: number`, `projectileRadius?: number`, `slowMult?: number`, `slowMs?: number`, `tickMs?: number`.
- `WEAPONS` gagne 10 entrées : `goudron`, `boulons`, `cle_molette`, `extincteur`, `brouette` (maxLevel 8) + `coulee_bitume`, `tempete_boulons`, `cle_choc`, `canon_mousse`, `transpalette` (maxLevel 1).

- [ ] **Step 1 — Test rouge** (`tests/unit/weaponData.test.ts`) : les 10 nouvelles armes existent, kinds valides, base maxLevel 8 / évoluées maxLevel 1, chaque niveau a `damage>0` et `cooldownMs>0`.
```ts
import { describe, it, expect } from 'vitest'
import { WEAPONS } from '@content/weapons'

const BASE = ['goudron', 'boulons', 'cle_molette', 'extincteur', 'brouette']
const EVO = ['coulee_bitume', 'tempete_boulons', 'cle_choc', 'canon_mousse', 'transpalette']

describe('Armes phase A — data', () => {
  it('les 5 armes de base existent, maxLevel 8, kind valide', () => {
    const kinds = new Set(['projectile', 'orbital', 'aura', 'sweep', 'strike', 'hazard', 'cone'])
    for (const id of BASE) {
      const w = WEAPONS[id]
      expect(w, id).toBeDefined()
      expect(w?.maxLevel).toBe(8)
      expect(kinds.has(w?.kind ?? '')).toBe(true)
      expect(w?.levels.length).toBe(8)
      for (const lvl of w?.levels ?? []) {
        expect(lvl.damage).toBeGreaterThan(0)
        expect(lvl.cooldownMs).toBeGreaterThan(0)
      }
    }
  })
  it('les 5 évoluées existent, maxLevel 1', () => {
    for (const id of EVO) {
      expect(WEAPONS[id]?.maxLevel, id).toBe(1)
      expect(WEAPONS[id]?.levels.length).toBe(1)
    }
  })
  it('goudron=hazard, extincteur=cone, boulons/cle/brouette=projectile', () => {
    expect(WEAPONS['goudron']?.kind).toBe('hazard')
    expect(WEAPONS['extincteur']?.kind).toBe('cone')
    expect(WEAPONS['boulons']?.kind).toBe('projectile')
    expect(WEAPONS['cle_molette']?.kind).toBe('projectile')
    expect(WEAPONS['brouette']?.kind).toBe('projectile')
  })
})
```
- [ ] **Step 2 — Run** `npx vitest run weaponData` → FAIL (armes absentes).
- [ ] **Step 3 — Implémenter** dans `weapons.ts` :
  - Ligne 13 : `export type WeaponKind = 'projectile' | 'orbital' | 'aura' | 'sweep' | 'strike' | 'hazard' | 'cone'`.
  - `WeaponLevel` (après `orbitHitRadius?`) : ajouter `bounces?: number; boomerangOutMs?: number; projectileRadius?: number; slowMult?: number; slowMs?: number; tickMs?: number`.
  - Ajouter au record `WEAPONS` (valeurs de départ ci-dessous ; ajustables au re-tuning) :
```ts
  goudron: {
    id: 'goudron', name: 'Goudron chaud', kind: 'hazard', maxLevel: 8,
    levels: buildLevels(
      { damage: 4, cooldownMs: 2200, count: 1, area: 60, pierce: 99, tickMs: 400, projectileLifeMs: 3000 },
      { damage: 1.2, area: 4 }, 8, { 5: { count: 2 } }
    )
  },
  boulons: {
    id: 'boulons', name: 'Boulons ricochets', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 10, cooldownMs: 820, count: 1, area: 0, pierce: 0, bounces: 3, projectileSpeed: 470, projectileLifeMs: 1700 },
      { damage: 2 }, 8, { 5: { bounces: 4 }, 7: { count: 2 } }
    )
  },
  cle_molette: {
    id: 'cle_molette', name: 'Clé à molette', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 16, cooldownMs: 1150, count: 1, area: 0, pierce: 99, projectileSpeed: 380, boomerangOutMs: 430, projectileLifeMs: 2400 },
      { damage: 4 }, 8, { 6: { count: 2 } }
    )
  },
  extincteur: {
    id: 'extincteur', name: 'Extincteur', kind: 'cone', maxLevel: 8,
    levels: buildLevels(
      { damage: 6, cooldownMs: 1000, count: 1, area: 130, pierce: 99, slowMult: 0.5, slowMs: 1500 },
      { damage: 2, area: 8 }, 8
    )
  },
  brouette: {
    id: 'brouette', name: 'Brouette', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 26, cooldownMs: 1650, count: 1, area: 0, pierce: 99, projectileSpeed: 240, projectileRadius: 26, projectileLifeMs: 2600 },
      { damage: 6, projectileRadius: 2 }, 8
    )
  },
  coulee_bitume: { id: 'coulee_bitume', name: 'Coulée de bitume', kind: 'hazard', maxLevel: 1,
    levels: [{ damage: 14, cooldownMs: 1500, count: 2, area: 96, pierce: 99, tickMs: 300, projectileLifeMs: 4200 }] },
  tempete_boulons: { id: 'tempete_boulons', name: 'Tempête de boulons', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 26, cooldownMs: 360, count: 3, area: 0, pierce: 0, bounces: 6, projectileSpeed: 560, projectileLifeMs: 1900 }] },
  cle_choc: { id: 'cle_choc', name: 'Clé à choc', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 40, cooldownMs: 650, count: 2, area: 0, pierce: 99, projectileSpeed: 440, boomerangOutMs: 520, projectileLifeMs: 3000 }] },
  canon_mousse: { id: 'canon_mousse', name: 'Canon à mousse', kind: 'cone', maxLevel: 1,
    levels: [{ damage: 18, cooldownMs: 620, count: 1, area: 190, pierce: 99, slowMult: 0.35, slowMs: 2200 }] },
  transpalette: { id: 'transpalette', name: 'Transpallette automatisée', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 60, cooldownMs: 1100, count: 1, area: 0, pierce: 99, projectileSpeed: 300, projectileRadius: 40, projectileLifeMs: 3200 }] },
```
- [ ] **Step 4 — Run** `npx vitest run weaponData` → PASS. Puis `npm run type-check` (coller sortie) — `WeaponLevel` optionnels ne cassent pas `effectiveStats`/`weaponStatsAtLevel` (ré-vérifier).
- [ ] **Step 5 — Commit** `feat(armes): data des 5 armes phase A + 5 évoluées (kinds hazard/cone + champs)`.

---

## Task 2 — 3 passifs catalyseurs + câblage de `growth` (XP)

**Files :**
- Modifier : `src/content/passives.ts` (PASSIVES)
- Modifier : `src/core/systems/leveling.ts` (appliquer `growth` au gain d'XP) — **localiser d'abord** où l'XP est ajoutée (gemme ramassée → `player.xp`), probablement `src/core/systems/pickup.ts` ou `leveling.ts`.
- Test : `tests/unit/passivesA.test.ts` (nouveau) + `tests/unit/leveling.test.ts` (étendre si existe, sinon nouveau)

**Interfaces produites :** `PASSIVES` gagne `aimant_chantier` `{magnet:+0.15}` maxLevel 5, `batterie_18v` `{duration:+0.12}` maxLevel 5, `prime_rendement` `{growth:+0.1}` maxLevel 5.

- [ ] **Step 1 — Test rouge passifs** : les 3 passifs existent avec la bonne stat/maxLevel ; `aggregatePassives([{id:'aimant_chantier',level:2}]).magnet` ≈ `1 + 0.30`.
```ts
import { describe, it, expect } from 'vitest'
import { PASSIVES, aggregatePassives } from '@content/passives'
describe('Passifs phase A', () => {
  it('aimant/batterie/prime existent', () => {
    expect(PASSIVES['aimant_chantier']?.perLevel.magnet).toBeCloseTo(0.15)
    expect(PASSIVES['batterie_18v']?.perLevel.duration).toBeCloseTo(0.12)
    expect(PASSIVES['prime_rendement']?.perLevel.growth).toBeCloseTo(0.1)
  })
  it('aggregatePassives applique magnet', () => {
    expect(aggregatePassives([{ id: 'aimant_chantier', level: 2 }]).magnet).toBeCloseTo(1.3)
    expect(aggregatePassives([]).growth).toBe(1) // défaut inchangé
  })
})
```
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implémenter** les 3 passifs dans `PASSIVES` (`passives.ts:24-31`). `StatKey`/`PlayerStats` incluent déjà `magnet`/`duration`/`growth` (base 1) — pas de nouveau champ.
- [ ] **Step 4 — Test rouge growth-XP** : localiser l'ajout d'XP (grep `xp +=` / `addXp` dans `src/core`). Écrire un test : joueur avec `stats.growth = 1.5`, ramasse une gemme de valeur V → l'XP gagnée = `round(V * 1.5)` (vs `V` avec growth=1). Le run par défaut (growth=1) doit rester **identique** (×1).
- [ ] **Step 5 — Implémenter** : au point d'ajout d'XP, multiplier par `stats.growth` (lire `world.get(playerEntity,'stats')?.growth ?? 1`). Déterministe : arrondir de façon stable (`Math.round`).
- [ ] **Step 6 — Run** vitest ciblés → PASS. **`npm run sim:check`** → VERTES **et diff inchangé** (growth=1 → XP ×1 → run par défaut byte-identique). Coller la sortie.
- [ ] **Step 7 — Commit** `feat(passifs): aimant/batterie/prime + câblage growth (XP) [défaut ×1]`.

---

## Task 3 — 5 évolutions (arme max + catalyseur → évoluée)

**Files :**
- Modifier : `src/content/evolutions.ts` (EVOLUTIONS)
- Test : `tests/unit/evolutionsA.test.ts` (nouveau) — s'inspirer de `tests/unit/evolution.test.ts` existant.

**Interfaces produites :** 5 `EvolutionDef` ajoutées (`reqBaseLevel: 8, reqPassiveLevel: 1` comme l'existant) :
```ts
{ base: 'goudron', passive: 'cadence_chantier', evolved: 'coulee_bitume', reqBaseLevel: 8, reqPassiveLevel: 1 },
{ base: 'boulons', passive: 'aimant_chantier', evolved: 'tempete_boulons', reqBaseLevel: 8, reqPassiveLevel: 1 },
{ base: 'cle_molette', passive: 'batterie_18v', evolved: 'cle_choc', reqBaseLevel: 8, reqPassiveLevel: 1 },
{ base: 'extincteur', passive: 'casque_homologue', evolved: 'canon_mousse', reqBaseLevel: 8, reqPassiveLevel: 1 },
{ base: 'brouette', passive: 'prime_rendement', evolved: 'transpalette', reqBaseLevel: 8, reqPassiveLevel: 1 },
```
- [ ] **Step 1 — Test rouge** : pour chaque paire, un inventaire {arme@8, passif@1} → `findEvolution(inv)` renvoie la bonne évolution ; {arme@7,...} → `null`. Réutiliser le helper de `evolution.test.ts`.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implémenter** : ajouter les 5 defs au tableau `EVOLUTIONS`. **Validation** : chaque `base`/`evolved` ∈ `WEAPONS`, chaque `passive` ∈ `PASSIVES` (ajouter un test d'intégrité qui itère `EVOLUTIONS`).
- [ ] **Step 4 — Run** → PASS. `npm run type-check` (coller).
- [ ] **Step 5 — Commit** `feat(évolutions): 5 évolutions phase A + test d'intégrité base/passif/evolved`.

---

## Task 4 — Projectiles étendus : ricochet (`bounces`) + boomerang (`boomerangOutMs`) + gros rayon

**Files :**
- Modifier : `src/core/types.ts` (`ProjectileComp` gagne `bounces?`, `boomerangOutMs?`, `returning?`, `hitIds?`)
- Modifier : `src/core/systems/weapon.ts` (`fireProjectiles` pose ces champs depuis `eff`)
- Modifier : `src/content/effectiveStats.ts` (`EffectiveStats` propage `bounces`, `boomerangOutMs`, `projectileRadius`)
- Modifier : `src/core/systems/collision.ts` (à l'impact d'un projectile `bounces>0` → redirige vers l'ennemi le plus proche non-touché au lieu de despawn)
- Créer : `src/core/systems/boomerang.ts` (renverse la vélocité après `boomerangOutMs`, revient vers l'owner)
- Modifier : `src/core/simulation.ts` (appeler `boomerangSystem` dans `step`, après mouvement, avant collision)
- Test : `tests/unit/projectileMods.test.ts` (nouveau)

**Interfaces produites :**
- `ProjectileComp`: `bounces?: number`, `boomerangOutMs?: number`, `returning?: boolean`, `hitIds?: number[]`.
- `EffectiveStats`: `bounces?: number`, `boomerangOutMs?: number`, `projectileRadius?: number`.
- `boomerangSystem(world: World, dtMs: number): void`.

- [ ] **Step 1 — Test rouge ricochet** : 2 ennemis ; tirer un projectile `bounces:1` vers e1 ; après collision, e1 touché ET le projectile est redirigé (vélocité pointe vers e2) ; après avancer, e2 touché. `bounces` décrémenté à 0, puis despawn. Utiliser le vrai `collisionSystem` + `movementSystem` + grille (voir `tests/unit/weaponGrid.test.ts` pour construire la grille).
- [ ] **Step 2 — Test rouge boomerang** : projectile `boomerangOutMs:200` lancé vers +x ; après ~200ms de `boomerangSystem`+`movement`, la vélocité s'inverse (revient vers l'owner) ; quand il repasse près de l'owner (<24px), il despawn.
- [ ] **Step 3 — Run** → FAIL.
- [ ] **Step 4 — Implémenter** :
  - `ProjectileComp` + champs. `fireProjectiles` (`weapon.ts:128-164`) lit `eff.bounces`/`eff.boomerangOutMs`/`eff.projectileRadius` et pose sur le comp (`radius = eff.projectileRadius ?? HITBOX.projectile`, `bounces = eff.bounces ?? 0`, `boomerangOutMs = eff.boomerangOutMs`, `hitIds = []`).
  - `effectiveStats.ts` : `bounces: lvl.bounces ?? 0`, `boomerangOutMs: (lvl.boomerangOutMs ?? 0) * s.duration` (batterie ↑ portée), `projectileRadius: (lvl.projectileRadius ?? 0) * s.area`.
  - `collision.ts` (`23-58`) : à l'impact, `proj.hitIds.push(enemyId)` ; si `proj.bounces > 0` → chercher via `grid.queryCircle(px,py, BOUNCE_SEEK_RADIUS≈320, cand)` l'ennemi vivant le plus proche **dont l'id ∉ hitIds** ; si trouvé → réorienter `velocity` vers lui (norme conservée), `proj.bounces -= 1`, **ne pas despawn** ; sinon comportement pierce/despawn actuel. **Déterminisme** : plus proche par distance², tie-break id croissant.
  - `boomerang.ts` : pour chaque projectile avec `boomerangOutMs !== undefined` non `returning` → décrémenter `boomerangOutMs -= dtMs` ; à ≤0 → `returning = true`. Si `returning` → vélocité = direction (ownerPos - projPos) × vitesse actuelle (norme conservée) ; si dist(owner) < 24 → despawn. Owner mort/absent → despawn.
  - `simulation.step` : `boomerangSystem(world, dtMs)` après `movementSystem`, avant `collisionSystem`.
- [ ] **Step 5 — Run** vitest ciblés → PASS. `npm run type-check` (coller) + `npm run lint`.
- [ ] **Step 6 — sim:check** → VERTES inchangé (aucune arme boomerang/ricochet par défaut → aucun projectile de ce type dans le run par défaut).
- [ ] **Step 7 — Commit** `feat(armes): projectiles ricochet + boomerang + gros rayon (cœur pur)`.

---

## Task 5 — Système hazard (goudron : zone au sol DoT)

**Files :**
- Modifier : `src/core/types.ts` (`HazardComp`)
- Créer : `src/core/systems/hazard.ts` (`hazardSystem` : tick de dégâts + expiration)
- Modifier : `src/core/systems/weapon.ts` (kind `hazard` → `tickHazard` : au cooldown, spawn une entité hazard à la position du joueur)
- Modifier : `src/core/simulation.ts` (`hazardSystem(world, dtMs, grid)` dans `step` ; exposer les hazards dans `getState` pour le rendu — cf. Task 8)
- Modifier : `src/core/simulation.ts` `collectXxx` (view-state) : liste `hazards[] {id,x,y,radius,remainingMs}` (additif).
- Test : `tests/unit/hazard.test.ts` (nouveau)

**Interfaces produites :**
- `HazardComp { type: string; ownerId: number; damagePerTick: number; radius: number; tickMs: number; tickLeftMs: number; lifeMs: number }`.
- `hazardSystem(world: World, dtMs: number, grid?: SpatialGrid): void`.
- View-state `hazards: { id: number; x: number; y: number; radius: number; remainingMs: number }[]`.

- [ ] **Step 1 — Test rouge** : joueur avec `goudron` niveau 1 ; `weaponSystem` au cooldown écoulé → **une** entité hazard spawn à la position du joueur (composants `position` + `hazard`). Un ennemi placé dans le rayon perd `damagePerTick` **par intervalle** `tickMs` (avancer `hazardSystem` de `tickMs` → 1 tick ; de `tickMs/2` → 0). Après `lifeMs`, le hazard est retiré du World.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implémenter** :
  - `HazardComp` dans `types.ts` (+ ajouter `hazard` aux `Components`).
  - `tickHazard` dans `weapon.ts` (nouveau `case 'hazard'` dans le switch `56-72`) : cooldown standard (`slot.cooldownLeftMs`) ; à échéance, `world.spawn()` + `position` (copie player pos) + `hazard { type: def.id, ownerId, damagePerTick: eff.damage, radius: eff.area + HITBOX.enemy, tickMs: eff.tickMs ?? 400, tickLeftMs: 0, lifeMs: eff.projectileLifeMs ?? 3000 }`. `count>1` → spawner `count` flaques (léger offset radial déterministe, ex. autour du joueur).
  - `effectiveStats.ts` : propager `tickMs: lvl.tickMs` (non scalé) ; `projectileLifeMs` déjà scalé par duration (goudron catalyseur = cadence, mais duration reste neutre par défaut).
  - `hazard.ts` : `hazardSystem` : pour chaque hazard : `lifeMs -= dt` (despawn si ≤0) ; `tickLeftMs -= dt` ; si ≤0 → `tickLeftMs += tickMs` puis `damageEnemiesInRadius(world, pos, radius, damagePerTick, grid)`. **Ennemis morts ignorés** (déjà géré par `damageEnemiesInRadius`).
  - `simulation.step` : appeler `hazardSystem` après collision/reap ; `collectXxx` expose `hazards[]`.
- [ ] **Step 4 — Run** → PASS. `type-check` (coller) + `lint`.
- [ ] **Step 5 — sim:check** VERTES inchangé (pas de goudron par défaut).
- [ ] **Step 6 — Commit** `feat(armes): système hazard (goudron, zone au sol DoT) + view-state`.

---

## Task 6 — Cône + ralentissement (extincteur : 1er effet de contrôle)

**Files :**
- Modifier : `src/core/types.ts` (`SlowComp` ; view-state ennemi `slowed?: boolean` optionnel additif)
- Créer : `src/core/systems/slow.ts` (`slowSystem` : décrément + retrait)
- Modifier : `src/core/systems/enemyAi.ts` (`enemyAiSystem` multiplie la vélocité par le slow courant si présent)
- Modifier : `src/core/systems/weapon.ts` (kind `cone` → `tickCone` : cône frontal vers l'ennemi le plus proche → dégâts + pose/rafraîchit `slow`)
- Modifier : `src/core/simulation.ts` (`slowSystem(world, dtMs)` dans `step` **avant** `enemyAiSystem` ; pulse VFX cône pour le rendu)
- Test : `tests/unit/cone.test.ts` (nouveau)

**Interfaces produites :**
- `SlowComp { mult: number; remainingMs: number }`.
- `slowSystem(world: World, dtMs: number): void`.
- Constante cône `CONE_HALF_ANGLE = 0.5` rad (~57° total) dans `config.ts` ou `weapon.ts`.

- [ ] **Step 1 — Test rouge cône** : joueur `extincteur` niveau 1 ; ennemi placé DANS le cône (devant, dans le rayon `area` et l'angle) → touché + reçoit `slow {mult:0.5, remainingMs:1500}` ; ennemi HORS de l'angle (derrière) → **pas** touché. Direction du cône = vers l'ennemi vivant le plus proche.
- [ ] **Step 2 — Test rouge slow** : ennemi avec `slow{mult:0.5}` → `enemyAiSystem` produit une vélocité de **norme moitié** vs sans slow ; `slowSystem` décrémente `remainingMs` et retire le comp à expiration ; ennemi sans slow → vitesse pleine (inchangé).
- [ ] **Step 3 — Run** → FAIL.
- [ ] **Step 4 — Implémenter** :
  - `SlowComp` (+ `slow` dans `Components`).
  - `tickCone` (`case 'cone'`) : trouver l'ennemi le plus proche (`findNearestEnemy`) → direction `d` ; pour chaque ennemi via `grid.queryCircle(px,py, eff.area+HITBOX.enemy, cand)` : si dans le rayon **et** `angleBetween(d, enemyDir) <= CONE_HALF_ANGLE` → `enemy.hp -= eff.damage` + poser `slow { mult: eff.slowMult ?? 1, remainingMs: eff.slowMs ?? 0 }` (rafraîchir si déjà présent, garder le plus fort/long). Émettre un `AuraPulse` kind `'cone'` (dir + portée) pour le rendu.
  - `effectiveStats.ts` : `slowMult: lvl.slowMult`, `slowMs: lvl.slowMs` (non scalés).
  - `slow.ts` : `slowSystem` : décrémente `remainingMs`, retire `slow` si ≤0.
  - `enemyAi.ts` : après calcul de la vélocité, si l'ennemi a `slow` → `vel.x *= slow.mult; vel.y *= slow.mult`.
  - `simulation.step` : `slowSystem` avant `enemyAiSystem`.
- [ ] **Step 5 — Run** → PASS. `type-check` (coller) + `lint`.
- [ ] **Step 6 — sim:check** VERTES inchangé (pas d'extincteur par défaut → aucun slow → enemyAi identique).
- [ ] **Step 7 — Commit** `feat(armes): cône + ralentissement (extincteur, 1er contrôle) [core pur]`.

---

## Task 7 — Rendu jouable des nouveaux comportements (réutilisé, non-DA)

**Files :**
- Modifier : `src/render/scenes/GameScene.ts` (hazards au sol ; pulse cône ; sprites projectile pour boulons/cle/brouette)
- Test : e2e léger `tests/e2e/weaponsA.spec.ts` (nouveau, chromium) — via le seam, équiper une arme (debug) et vérifier qu'un run tourne sans crash + hazards exposés dans `getState`.

**But :** jouable et lisible, **pas** joli (assets dédiés = Tranche A2). Réutiliser les primitives existantes.

- [ ] **Step 1 — Hazards** : dans `syncSprites`, dessiner chaque `state.hazards[]` comme un cercle semi-transparent au sol (Graphics `clear()`/redraw chaque frame comme `playerRings`, profondeur < entités ; teinte goudron sombre, alpha ~0.35, rayon = `h.radius`). Pas d'objet par hazard à détruire.
- [ ] **Step 2 — Cône** : dans `onAuraPulse`, `case 'cone'` → dessiner un secteur (arc rempli) orienté selon la direction du pulse, portée = rayon, demi-angle `CONE_HALF_ANGLE`, teinte blanc/mousse, fondu ~260ms (même schéma que `spawnSweepArc`).
- [ ] **Step 3 — Projectiles** : ajouter des entrées `PROJ_SPRITE` (`GameScene.ts:56-60`) pour `boulons`/`tempete_boulons` (réutiliser `proj_cloueur`, `scale 0.7`, `faceVel true`), `cle_molette`/`cle_choc` (réutiliser `proj_scie`, `spin true`), `brouette`/`transpalette` (réutiliser `proj_cloueur`, `scale` ~2.4, `faceVel true`). Repli déjà géré si clé absente → pas de crash.
- [ ] **Step 4 — e2e** : `weaponsA.spec.ts` (chromium, non-lite) : boot `?test=1&autostart=solo`, via seam `debugGrant({weapons:[{id:'goudron',level:1}]})` puis `debugGrant({weapons:[{id:'extincteur',level:1}]})`, `advanceTime`, `debugSpawnEnemies(20)`, `advanceTime` ; asserter `getState().hazards.length > 0` à un moment + aucun `pageerror` + `screen==='game'` (pas de crash). Skip sur projet `mobile`.
- [ ] **Step 5 — Run** `npx playwright test weaponsA --project=chromium` → PASS. `type-check`/`lint`.
- [ ] **Step 6 — Commit** `feat(rendu): hazards sol + cône + sprites projectile réutilisés (jouable, DA en A2)`.

---

## Task 8 — Réaffectation des armes aux persos + intégrité roster

**Files :**
- Modifier : `src/content/characters.ts` (5 `startingWeapon`)
- Modifier : `tests/unit/characters.test.ts` (nouvel invariant : toutes les armes de départ distinctes)
- Test : e2e existant `characterSkins`/coop reste vert.

- [ ] **Step 1 — Test rouge** : ajouter dans `characters.test.ts` un invariant « les 10 `startingWeapon` sont DISTINCTS » (Set.size === 10) + chaque ∈ `WEAPONS`. (Échoue aujourd'hui : 5 partagées.)
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implémenter** dans `characters.ts` : `ouvriere→'brouette'`, `charpentier→'boulons'`, `grutier→'goudron'`, `plombier→'cle_molette'`, `samoyede→'extincteur'`. **Ne pas toucher** `ouvrier→'cloueur'` (défaut). Retirer les commentaires ⃰ « arme partagée ».
- [ ] **Step 4 — Run** vitest complet → PASS (les tests app coop/solo attendent des armes distinctes adjacentes : index0 ouvrier=cloueur, index1 soudeur=scie → toujours distincts ; vérifier `app.test.ts`).
- [ ] **Step 5 — sim:check** VERTES **inchangé** (défaut ouvrier=cloueur seul concerné par la sim).
- [ ] **Step 6 — Commit** `feat(persos): chaque perso démarre avec son arme unique (10 armes distinctes)`.

---

## Task 9 — Validation finale + jouer-pour-valider

**Files :** aucun code (sauf correctifs) ; journal éventuel.

- [ ] **Step 1 — Gates complets** : `npm run type-check` (coller) · `npm run lint` · `npx vitest run` (tout vert) · `npx playwright test` (2 projets) · `npm run sim:check` (VERTES, pas de dérive nouvelle vs baseline) · `npm run assets:qa` (0 erreur).
- [ ] **Step 2 — Jouer-pour-valider (seam, play-to-validate)** : run réel, choisir un perso à arme neuve (ex. plombier=clé à molette), avancer, vérifier via `getState()` que l'arme tire (projectiles/hazards présents), monter l'arme niveau 8 + prendre le catalyseur, ramasser un coffre → **évolution** reflétée dans `getState().players[].weapons`. Capturer 1-2 écrans (goudron au sol + cône) pour preuve visuelle.
- [ ] **Step 3 — Revue finale** (subagent le plus capable, `review-package MERGE_BASE HEAD`).
- [ ] **Step 4 — Commit** éventuels correctifs ; **pas de push sans feu vert**.

---

## Vérification finale
Revue par tâche (contrôleur re-lance `tsc`) + revue finale. **Solo défaut byte-identique** (sim:check VERTES, growth×1). Les 5 armes se jouent, s'équipent via cartes, évoluent ; les 10 persos ont une arme distincte. Pas de push sans feu vert.

## Suite (Tranche A2 — plan séparé, skill `assets`)
Assets PixelLab DA : sprites de projectile dédiés (boulon, clé, brouette), VFX goudron (flaque bitume), cône de mousse, jingle/VFX d'évolution des 5 nouvelles ; **icônes de cartes** `icon_<id>_32` pour 5 armes + 5 évolutions + 3 passifs (repli monogramme en attendant). Golden-batch d'abord. Puis re-tuning fin de l'équilibrage si le playtest le demande.
