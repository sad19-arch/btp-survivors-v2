# Trajets d'entités — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les trajets d'entités réglables et découvrables dans le Stage Composer : un chemin porte ses marcheurs (qui, combien, vitesse, pause, sens unique), au lieu de fabriquer une silhouette anonyme en silence.

**Architecture:** Fonction PURE du temps — `position = f(chemin, t)`, aucun marcheur à état. C'est du décor d'ambiance : la sim ne lit jamais `paths` → `sim:check` diff 0 par construction. Les pauses et le sens unique sont de l'arithmétique sur le temps ; N marcheurs = un décalage de phase.

**Tech Stack:** TypeScript strict · Phaser (rendu observateur) · Vitest (`happy-dom`) · Playwright · PixelLab MCP (tâche finale) · pngjs (packing 4-dir).

Spec : `docs/superpowers/specs/2026-07-16-trajets-editeur-design.md`

## Global Constraints

- **`src/core` n'importe JAMAIS Phaser ni le DOM.** `paths` est du RENDU : la sim ne le lit pas.
- **Déterminisme** : interdit `Math.random()`, `Date.now()`, `new Date()` dans `src/core` et `src/content` (vérifié par ESLint).
- **`GameScene` n'est pas une poubelle** : toute nouvelle responsabilité de rendu va dans un module dédié de `src/render/`.
- **Zéro `any`**, `no-explicit-any` = erreur. ESLint : **0 warning toléré**.
- **Texte in-game en français.**
- **Rétro-compatibilité stricte** : tous les champs neufs de `LayoutPath` sont OPTIONNELS. Une compo existante rend EXACTEMENT comme avant. La compo de l'utilisateur contient **19 PNJ ouvriers posés** (4 `npc_ouvrier_a`, 5 `npc_ouvrier_b`, 10 `npc_ouvrier_c`) : **le renommage NE DOIT PAS les faire disparaître**.
- **Bornes** (clampées au parse, jamais rejetées) : `count` ∈ [0, 8] · `speed` ∈ [10, 400] px/s · `pauseMs` ∈ [0, 30000].
- **Sémantique de `pauseMs`** (décision de cadrage, à respecter à la lettre) :
  - aller-retour → arrêt **VISIBLE** à chaque extrémité ;
  - sens unique → temps **INVISIBLE** entre la sortie et la réapparition (espacement du flux).
- **Ne jamais committer** : `src/content/layouts/terrain_vierge.json`, `src/content/composedLayouts.ts`, `.claude/launch.json`, `Écran de mort.docx`, les 2 `.zip`, `docs/narrative/`, `docs/superpowers/plans/2026-07-05-chest-economy.md`, `docs/superpowers/plans/2026-07-08-stage-intro-cinematics.md`. **`git add` par chemin explicite, jamais `-A`.**
- **`sim:check`** : le lancer en TÂCHE DE FOND (~4 min), et **APRÈS avoir écarté** `src/content/layouts/terrain_vierge.json` (`mv` hors du repo) et remis `src/content/composedLayouts.ts` à l'état committé (`git checkout --`) — sinon FAUX ROUGE connu.

---

## Structure de fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `src/render/workerBehavior.ts` | `pathFollow` : position sur polyligne, pauses, sens unique. **PUR**, cœur du lot. | 1 |
| `src/content/stageLayout.ts` | Type `LayoutPath` étendu + `PATH_LIMITS` + `PATH_DEFAULT_SPEED` (data pure, lue par l éditeur ET le rendu). | 2 |
| `src/editor/StageLayoutSchema.ts` | `parseLayout` **préserve + clampe** les champs neufs. | 2 |
| `src/render/scenes/siteWorkers.ts` | Consomme : N marcheurs étalés, skin choisi, `visible`. | 3 |
| `src/editor/EditorState.ts` | `addPath(type, points, opts)` + `updatePath` + suppression. | 4 |
| `src/editor/EditorScene.ts` | Indice de tracé (compteur de points + `Entrée`). | 4 |
| `src/editor/EditorOverlay.ts` | Inspecteur de chemin + avertissement camion. | 4 |
| `src/editor/PrefabCatalog.ts` | Section unique « PNJ & chemins » + `walkerSkinsFor`. | 4 |
| `src/render/stages.ts` | Ouvriers renommés + `WORKER_SKIN_ALIASES`. | 5 |
| `tools/assets/pack-truck-4dir.mjs` | Packing des 4 directions du camion en feuille. | 6 |

---

## Task 1 : `pathFollow` — pauses et sens unique (PUR)

**Files:**
- Modify: `src/render/workerBehavior.ts:122-210`
- Test: `tests/unit/pathFollow.test.ts` (créer)

**Interfaces:**
- Consumes: `PathPoint { x: number; y: number }` (existe déjà, ligne 122).
- Produces:
  - `export interface PathOpts { pauseMs?: number; oneWay?: boolean }`
  - `PathResult` gagne `visible: boolean`
  - `export function pathFollow(points: ReadonlyArray<PathPoint>, tMs: number, speedPxPerSec: number, opts?: PathOpts): PathResult`

**Pourquoi cette tâche d'abord :** c'est le seul endroit où la logique vit. Tout le reste consomme. Elle est pure → testable sans Phaser.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/unit/pathFollow.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { pathFollow } from '@render/workerBehavior'

/**
 * `pathFollow` — position sur une polyligne, en fonction PURE du temps.
 *
 * Le raisonnement est passé de la DISTANCE au TEMPS : une pause est du temps,
 * pas de la distance. Sans ça, « s'arrêter 2 s au bout » est inexprimable.
 */

/** Ligne droite horizontale de 100 px : 10 px/s → 10 s pour la parcourir. */
const LINE = [{ x: 0, y: 0 }, { x: 100, y: 0 }]

describe('pathFollow — non-régression (sans opts)', () => {
  it('sans opts, se comporte EXACTEMENT comme avant : aller-retour continu', () => {
    // t=0 → départ ; t=5s → milieu ; t=10s → bout ; t=15s → milieu au retour.
    expect(pathFollow(LINE, 0, 10).x).toBeCloseTo(0)
    expect(pathFollow(LINE, 5000, 10).x).toBeCloseTo(50)
    expect(pathFollow(LINE, 10000, 10).x).toBeCloseTo(100)
    expect(pathFollow(LINE, 15000, 10).x).toBeCloseTo(50)
    // Et le cycle boucle : t=20s = t=0.
    expect(pathFollow(LINE, 20000, 10).x).toBeCloseTo(0)
  })

  it('sans opts, toujours visible (le champ est neuf, le défaut ne cache rien)', () => {
    for (const t of [0, 3000, 7000, 12000, 19000]) {
      expect(pathFollow(LINE, t, 10).visible, `t=${t}`).toBe(true)
    }
  })

  it('sens de marche : aller vers +x, retour vers -x', () => {
    expect(pathFollow(LINE, 2000, 10).dirX).toBeCloseTo(1)
    expect(pathFollow(LINE, 12000, 10).dirX).toBeCloseTo(-1)
  })
})

describe('pathFollow — pause aux extrémités (aller-retour)', () => {
  // 100px @ 10px/s = 10s de trajet ; pause 2s ⇒ cycle = 10+2+10+2 = 24s.
  const OPTS = { pauseMs: 2000 }

  it('s’ARRÊTE au bout pendant la pause, visible', () => {
    // t=10s : arrivée en B. t=10..12s : figé en B.
    expect(pathFollow(LINE, 10000, 10, OPTS).x).toBeCloseTo(100)
    expect(pathFollow(LINE, 11000, 10, OPTS).x).toBeCloseTo(100)
    expect(pathFollow(LINE, 11900, 10, OPTS).x).toBeCloseTo(100)
    // La pause est un arrêt VISIBLE (livraison), pas une disparition.
    expect(pathFollow(LINE, 11000, 10, OPTS).visible).toBe(true)
  })

  it('repart APRÈS la pause', () => {
    // t=12s : la pause finit, le retour démarre. t=17s : milieu.
    expect(pathFollow(LINE, 12000, 10, OPTS).x).toBeCloseTo(100)
    expect(pathFollow(LINE, 17000, 10, OPTS).x).toBeCloseTo(50)
    expect(pathFollow(LINE, 22000, 10, OPTS).x).toBeCloseTo(0)
  })

  it('s’arrête AUSSI au départ (les deux extrémités)', () => {
    // t=22..24s : figé en A.
    expect(pathFollow(LINE, 23000, 10, OPTS).x).toBeCloseTo(0)
    // t=24s : nouveau cycle.
    expect(pathFollow(LINE, 24000, 10, OPTS).x).toBeCloseTo(0)
    expect(pathFollow(LINE, 29000, 10, OPTS).x).toBeCloseTo(50)
  })
})

describe('pathFollow — sens unique', () => {
  // 100px @ 10px/s = 10s ; pause 5s d'INVISIBILITÉ ⇒ cycle = 15s.
  const OPTS = { oneWay: true, pauseMs: 5000 }

  it('parcourt A→B, visible', () => {
    expect(pathFollow(LINE, 0, 10, OPTS).x).toBeCloseTo(0)
    expect(pathFollow(LINE, 5000, 10, OPTS).x).toBeCloseTo(50)
    expect(pathFollow(LINE, 9900, 10, OPTS).visible).toBe(true)
  })

  it('DISPARAÎT après le bout (pause = temps invisible, pas un arrêt)', () => {
    // En sens unique, `pauseMs` est l'espacement du flux : le marcheur est SORTI.
    expect(pathFollow(LINE, 10500, 10, OPTS).visible).toBe(false)
    expect(pathFollow(LINE, 14900, 10, OPTS).visible).toBe(false)
  })

  it('RÉAPPARAÎT au départ, jamais à mi-chemin (pas de téléportation à vue)', () => {
    const r = pathFollow(LINE, 15000, 10, OPTS)
    expect(r.visible).toBe(true)
    expect(r.x).toBeCloseTo(0)
    // Ne repart JAMAIS en arrière : toujours vers +x.
    expect(pathFollow(LINE, 16000, 10, OPTS).dirX).toBeCloseTo(1)
  })

  it('sans pause, le flux est continu (réapparition immédiate)', () => {
    const noPause = { oneWay: true }
    expect(pathFollow(LINE, 10000, 10, noPause).x).toBeCloseTo(0)
    expect(pathFollow(LINE, 10000, 10, noPause).visible).toBe(true)
  })
})

describe('pathFollow — cas dégénérés (aucun NaN, aucune division par zéro)', () => {
  it('0 point → origine, sans planter', () => {
    const r = pathFollow([], 1234, 10)
    expect(Number.isFinite(r.x)).toBe(true)
    expect(r.atEnd).toBe(true)
  })

  it('1 point → immobile dessus', () => {
    const r = pathFollow([{ x: 7, y: 9 }], 1234, 10)
    expect(r.x).toBe(7)
    expect(r.y).toBe(9)
  })

  it('longueur nulle (points confondus) → immobile, pas de /0', () => {
    const r = pathFollow([{ x: 5, y: 5 }, { x: 5, y: 5 }], 1234, 10)
    expect(Number.isFinite(r.x)).toBe(true)
    expect(r.x).toBe(5)
  })

  it('vitesse 0 ou négative → immobile au départ, PAS de division par zéro', () => {
    // tTrajet = longueur / vitesse : une vitesse nulle ferait exploser le calcul.
    for (const v of [0, -5]) {
      const r = pathFollow(LINE, 5000, v)
      expect(Number.isFinite(r.x), `v=${v}`).toBe(true)
      expect(r.x, `v=${v}`).toBe(0)
    }
  })

  it('pause démesurée → pas de boucle infinie, résultat fini', () => {
    const r = pathFollow(LINE, 1000, 10, { pauseMs: 30000 })
    expect(Number.isFinite(r.x)).toBe(true)
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils ÉCHOUENT**

Run: `npx vitest run tests/unit/pathFollow.test.ts`
Expected: FAIL — `visible` n'existe pas sur `PathResult`, et les tests de pause/sens unique échouent (le 4e argument est ignoré).

- [ ] **Step 3 : Implémenter**

Dans `src/render/workerBehavior.ts`, remplacer `PathResult` et `pathFollow` (lignes ~127-210) par :

```ts
/** Résultat du suivi de polyligne. */
export interface PathResult {
  x: number
  y: number
  /** Index du segment courant. */
  seg: number
  /** Direction de déplacement normalisée (pour orienter le sprite / flipX). */
  dirX: number
  dirY: number
  atEnd: boolean
  /**
   * false = marcheur CACHÉ (sens unique, entre la sortie et la réapparition).
   * Sans ce champ, un camion en sens unique se téléporterait À VUE du bout au
   * départ — l'artefact visuel que le sens unique est censé éviter.
   */
  visible: boolean
}

/** Réglages de parcours. Absent = aller-retour continu (comportement historique). */
export interface PathOpts {
  /**
   * Aller-retour : arrêt VISIBLE à chaque extrémité (livraison, chargement).
   * Sens unique : temps INVISIBLE entre la sortie et la réapparition au départ
   * (= espacement du flux). Deux sens distincts, assumés : dans un cas le
   * marcheur attend, dans l'autre il est parti.
   */
  pauseMs?: number
  /** true = A→B puis disparaît et réapparaît en A (flux). false = aller-retour. */
  oneWay?: boolean
}

/** Position à `dist` px du début de la polyligne (0..total). */
function pointAtDistance(
  points: ReadonlyArray<PathPoint>,
  segLen: ReadonlyArray<number>,
  dist: number
): { x: number; y: number; seg: number; dirX: number; dirY: number } {
  let d = dist
  for (let i = 0; i < segLen.length; i++) {
    const l = segLen[i] as number
    const a = points[i] as PathPoint
    const b = points[i + 1] as PathPoint
    if (d <= l || i === segLen.length - 1) {
      const t = l < 0.001 ? 0 : Math.min(1, Math.max(0, d / l))
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      return {
        x: a.x + dx * t,
        y: a.y + dy * t,
        seg: i,
        dirX: dx / len,
        dirY: dy / len
      }
    }
    d -= l
  }
  const first = points[0] as PathPoint
  return { x: first.x, y: first.y, seg: 0, dirX: 1, dirY: 0 }
}

/**
 * Position sur une POLYLIGNE, en fonction PURE du temps.
 *
 * Le raisonnement est en TEMPS, pas en distance : une pause est du temps. Soit
 * `tTrajet = longueur / vitesse` et `pause = pauseMs / 1000` :
 *
 *  - aller-retour : cycle = 2·tTrajet + 2·pause
 *      aller → pause VISIBLE en B → retour → pause VISIBLE en A → …
 *  - sens unique  : cycle = tTrajet + pause
 *      aller → INVISIBLE pendant `pause` → réapparaît en A
 *
 * Cas dégénérés : 0 point → origine ; 1 point, longueur nulle, ou vitesse ≤ 0
 * → immobile au départ (jamais de division par zéro, jamais de NaN).
 */
export function pathFollow(
  points: ReadonlyArray<PathPoint>,
  tMs: number,
  speedPxPerSec: number,
  opts?: PathOpts
): PathResult {
  const n = points.length
  if (n === 0) {
    return { x: 0, y: 0, seg: 0, dirX: 1, dirY: 0, atEnd: true, visible: true }
  }
  const first = points[0] as PathPoint
  const still = (): PathResult => ({
    x: first.x, y: first.y, seg: 0, dirX: 1, dirY: 0, atEnd: true, visible: true
  })
  if (n === 1 || speedPxPerSec <= 0) {
    return still()
  }

  const segLen: number[] = []
  let total = 0
  for (let i = 0; i < n - 1; i++) {
    const a = points[i] as PathPoint
    const b = points[i + 1] as PathPoint
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    segLen.push(l)
    total += l
  }
  if (total < 0.001) {
    return still()
  }

  const tTravel = total / speedPxPerSec
  const pause = Math.max(0, opts?.pauseMs ?? 0) / 1000
  const t = Math.max(0, tMs) / 1000
  const oneWay = opts?.oneWay === true

  if (oneWay) {
    const cycle = tTravel + pause
    const u = cycle <= 0 ? 0 : t % cycle
    if (u >= tTravel) {
      // Sorti : caché jusqu'à la réapparition en A.
      const p = pointAtDistance(points, segLen, total)
      return { ...p, atEnd: true, visible: false }
    }
    const p = pointAtDistance(points, segLen, u * speedPxPerSec)
    return { ...p, atEnd: false, visible: true }
  }

  const cycle = 2 * tTravel + 2 * pause
  const u = cycle <= 0 ? 0 : t % cycle
  if (u < tTravel) {
    const p = pointAtDistance(points, segLen, u * speedPxPerSec)
    return { ...p, atEnd: false, visible: true }
  }
  if (u < tTravel + pause) {
    // Arrêt visible en B, face au sens d'arrivée.
    const p = pointAtDistance(points, segLen, total)
    return { ...p, atEnd: true, visible: true }
  }
  if (u < 2 * tTravel + pause) {
    const back = u - (tTravel + pause)
    const p = pointAtDistance(points, segLen, total - back * speedPxPerSec)
    return { ...p, dirX: -p.dirX, dirY: -p.dirY, atEnd: false, visible: true }
  }
  // Arrêt visible en A, face au sens d'arrivée (le retour).
  const p = pointAtDistance(points, segLen, 0)
  return { ...p, dirX: -p.dirX, dirY: -p.dirY, atEnd: true, visible: true }
}
```

- [ ] **Step 4 : Lancer les tests, vérifier qu'ils PASSENT**

Run: `npx vitest run tests/unit/pathFollow.test.ts`
Expected: PASS (tous).

- [ ] **Step 5 : Réparer les appelants + gates**

`siteWorkers.ts:527` appelle `pathFollow(job.points ?? [], tMs, job.speed)` — la signature reste compatible (`opts` optionnel), mais `PathResult.visible` est neuf : TypeScript ne casse pas. Vérifier :

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 0 erreur, 0 warning, tous les tests verts.

- [ ] **Step 6 : Commit**

```bash
git add src/render/workerBehavior.ts tests/unit/pathFollow.test.ts
git commit -m "feat(trajets 1/6): pathFollow — pauses et sens unique (fonction pure)

Le raisonnement passe de la DISTANCE au TEMPS : une pause est du temps, pas de
la distance — « s'arrêter 2 s au bout » était inexprimable.

`pauseMs` a DEUX sens, assumés et documentés :
 - aller-retour → arrêt VISIBLE à chaque extrémité (livraison, chargement) ;
 - sens unique  → temps INVISIBLE avant réapparition au départ (espacement du flux).

`PathResult.visible` est neuf et nécessaire : sans lui, un camion en sens unique
se téléporterait À VUE du bout au départ — l'artefact que le sens unique évite.

Non-régression verrouillée : sans \`opts\`, résultat identique à l'existant.
Cas dégénérés couverts : 0/1 point, longueur nulle, vitesse ≤ 0 (division par
zéro dans tTrajet = longueur/vitesse), pause démesurée.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 : Type `LayoutPath` + préservation au parse

**Files:**
- Modify: `src/content/stageLayout.ts:113-119`
- Modify: `src/editor/StageLayoutSchema.ts:140-158` (bloc `d.paths`)
- Test: `tests/unit/pathLayout.test.ts` (créer)

**Interfaces:**
- Produces:
  - `LayoutPath` += `name?: string` · `skin?: string` · `count?: number` · `speed?: number` · `pauseMs?: number` · `oneWay?: boolean`
  - `export const PATH_LIMITS = { count: { min: 0, max: 8 }, speed: { min: 10, max: 400 }, pauseMs: { min: 0, max: 30000 } }`

**⚠️ LE PIÈGE DE CE FICHIER :** `parseLayout` a déjà mordu **trois fois** (`destructible`, `layer`, `tile`). À chaque fois, un champ non préservé disparaissait **en silence** à la première sauvegarde. Le test de préservation n'est pas décoratif : il DOIT échouer si la ligne est retirée.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/unit/pathLayout.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { PATH_LIMITS } from '@content/stageLayout'

/**
 * Les réglages d'un chemin doivent SURVIVRE à l'aller-retour sauvegarde →
 * chargement. `parseLayout` a déjà perdu `destructible`, `layer` et `tile` en
 * silence : un champ non recopié ici disparaît sans la moindre erreur.
 */

function layoutWith(path: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1,
    stage: 'terrain_vierge',
    worldSize: { width: 10240, height: 7680 },
    paths: [{ id: 'p1', type: 'worker_path', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], ...path }]
  })
}

function firstPath(raw: string) {
  const res = parseLayout(raw, 'terrain_vierge')
  expect(res.ok).toBe(true)
  if (res.layout === undefined) { throw new Error('parseLayout n’a rien rendu') }
  const p = res.layout.paths[0]
  if (p === undefined) { throw new Error('chemin perdu au parse') }
  return p
}

describe('parseLayout — réglages de chemin PRÉSERVÉS', () => {
  it('préserve name / skin / count / speed / pauseMs / oneWay', () => {
    const p = firstPath(layoutWith({
      name: 'Livraison béton',
      skin: 'npc_ouvrier_zinedine',
      count: 3,
      speed: 120,
      pauseMs: 2000,
      oneWay: true
    }))
    expect(p.name).toBe('Livraison béton')
    expect(p.skin).toBe('npc_ouvrier_zinedine')
    expect(p.count).toBe(3)
    expect(p.speed).toBe(120)
    expect(p.pauseMs).toBe(2000)
    expect(p.oneWay).toBe(true)
  })

  it('un chemin SANS réglages reste sans réglages (défauts = comportement actuel)', () => {
    const p = firstPath(layoutWith({}))
    expect(p.name).toBeUndefined()
    expect(p.skin).toBeUndefined()
    expect(p.count).toBeUndefined()
    expect(p.speed).toBeUndefined()
    expect(p.pauseMs).toBeUndefined()
    expect(p.oneWay).toBeUndefined()
  })
})

describe('parseLayout — bornes CLAMPÉES, jamais rejetées', () => {
  it('clampe count hors bornes (une compo doit rester chargeable)', () => {
    expect(firstPath(layoutWith({ count: 99 })).count).toBe(PATH_LIMITS.count.max)
    expect(firstPath(layoutWith({ count: -3 })).count).toBe(PATH_LIMITS.count.min)
  })

  it('clampe la vitesse — 0 provoquerait une division par zéro dans tTrajet', () => {
    expect(firstPath(layoutWith({ speed: 0 })).speed).toBe(PATH_LIMITS.speed.min)
    expect(firstPath(layoutWith({ speed: 9999 })).speed).toBe(PATH_LIMITS.speed.max)
  })

  it('clampe la pause', () => {
    expect(firstPath(layoutWith({ pauseMs: -1 })).pauseMs).toBe(PATH_LIMITS.pauseMs.min)
    expect(firstPath(layoutWith({ pauseMs: 999999 })).pauseMs).toBe(PATH_LIMITS.pauseMs.max)
  })

  it('ignore les types aberrants au lieu de casser la compo', () => {
    const p = firstPath(layoutWith({ count: 'trois', speed: null, oneWay: 'oui', name: 42 }))
    expect(p.count).toBeUndefined()
    expect(p.speed).toBeUndefined()
    expect(p.oneWay).toBeUndefined()
    expect(p.name).toBeUndefined()
    // Le chemin lui-même survit.
    expect(p.points.length).toBe(2)
  })
})
```

- [ ] **Step 2 : Lancer, vérifier l'ÉCHEC**

Run: `npx vitest run tests/unit/pathLayout.test.ts`
Expected: FAIL — `PATH_LIMITS` n'existe pas ; les champs ne sont pas préservés.

- [ ] **Step 3 : Étendre le type**

Dans `src/content/stageLayout.ts`, remplacer le bloc `LayoutPath` (lignes ~113-119) :

```ts
export type PathType = 'truck_path' | 'worker_path'

/**
 * Bornes des réglages de chemin. CLAMPÉES au parse (jamais un rejet : une compo
 * doit rester chargeable). `speed.min > 0` est structurel : `tTrajet = longueur
 * / vitesse` — une vitesse nulle ferait exploser le calcul.
 */
export const PATH_LIMITS = {
  count: { min: 0, max: 8 },
  speed: { min: 10, max: 400 },
  pauseMs: { min: 0, max: 30000 }
} as const

/**
 * Vitesse par défaut, par famille (px/s). Ici et NON dans `render/` : c'est de
 * la DONNÉE, et l'éditeur comme le rendu la lisent. La dupliquer ferait
 * afficher une valeur à l'inspecteur pendant que le jeu en applique une autre.
 */
export const PATH_DEFAULT_SPEED: Record<PathType, number> = {
  worker_path: 74,
  truck_path: 150
}

/**
 * Un trajet tracé dans l'éditeur. **Le chemin porte ses marcheurs** : il ne
 * déplace pas un PNJ posé, il fabrique ses propres marcheurs. Les PNJ posés
 * (`npcs[]`) restent fixes à leur poste.
 *
 * Tous les réglages sont OPTIONNELS : absent = comportement historique exact
 * (1 marcheur, aller-retour continu, sans pause).
 *
 * `type` est CONSERVÉ et n'est pas une simple étiquette : il porte une vraie
 * différence de RENDU (un camion ne joue pas d'animation de marche et s'oriente
 * autrement — cf. `isCamion` dans siteWorkers). Il détermine aussi la couleur du
 * tracé dans l'éditeur et le skin par défaut.
 */
export interface LayoutPath {
  id: string
  type: PathType
  points: Vec2[]
  /** Nom libre, pour s'y retrouver dans l'inspecteur (« Livraison béton »). */
  name?: string
  /** Skin du marcheur. Défaut : porteur / camion selon `type`. */
  skin?: string
  /** Nombre de marcheurs, étalés automatiquement. Défaut 1. 0 = chemin repère. */
  count?: number
  /** Vitesse px/s. Défaut : 74 (ouvrier) / 150 (camion). */
  speed?: number
  /** Aller-retour : arrêt VISIBLE aux bouts. Sens unique : temps INVISIBLE. */
  pauseMs?: number
  /** true = A→B puis disparaît et réapparaît en A (flux). Défaut false. */
  oneWay?: boolean
}
```

- [ ] **Step 4 : Préserver + clamper au parse**

Dans `src/editor/StageLayoutSchema.ts`, ajouter l'import et le helper en tête de fichier (après les imports existants) :

```ts
import { PATH_LIMITS } from '@content/stageLayout'

/** Borne une valeur numérique, ou `undefined` si ce n'est pas un nombre fini. */
function clampNum(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return undefined }
  return Math.min(max, Math.max(min, v))
}
```

Puis, dans le bloc `if (Array.isArray(d.paths))` (~ligne 140), remplacer le `return` du `.map(...)` :

```ts
        const lp: LayoutPath = { id: typeof o.id === 'string' ? o.id : `${t}_${i + 1}`, type: t, points: pts }
        // Réglages du chemin : PRÉSERVER, sinon ils disparaissent en silence à la
        // première sauvegarde (déjà vécu 3× ici : destructible, layer, tile).
        if (typeof o.name === 'string' && o.name !== '') { lp.name = o.name }
        if (typeof o.skin === 'string' && o.skin !== '') { lp.skin = o.skin }
        const count = clampNum(o.count, PATH_LIMITS.count.min, PATH_LIMITS.count.max)
        if (count !== undefined) { lp.count = Math.round(count) }
        const speed = clampNum(o.speed, PATH_LIMITS.speed.min, PATH_LIMITS.speed.max)
        if (speed !== undefined) { lp.speed = speed }
        const pauseMs = clampNum(o.pauseMs, PATH_LIMITS.pauseMs.min, PATH_LIMITS.pauseMs.max)
        if (pauseMs !== undefined) { lp.pauseMs = pauseMs }
        if (typeof o.oneWay === 'boolean') { lp.oneWay = o.oneWay }
        return lp
```

Ajouter `type LayoutPath` à l'import depuis `@content/stageLayout` s'il n'y est pas déjà.

- [ ] **Step 5 : Lancer, vérifier le PASSAGE**

Run: `npx vitest run tests/unit/pathLayout.test.ts && npx tsc --noEmit && npm run lint`
Expected: tous verts, 0 warning.

- [ ] **Step 6 : PROUVER que le test mord**

Commenter la ligne `if (typeof o.name === 'string' ...) { lp.name = o.name }`, relancer :

Run: `npx vitest run tests/unit/pathLayout.test.ts`
Expected: **FAIL** sur « préserve name / skin / … ». Puis DÉCOMMENTER et re-vérifier le vert.

Cette étape n'est pas facultative : un test de préservation qui ne mord pas est un test qui ment.

- [ ] **Step 7 : Commit**

```bash
git add src/content/stageLayout.ts src/editor/StageLayoutSchema.ts tests/unit/pathLayout.test.ts
git commit -m "feat(trajets 2/6): réglages de chemin — type + préservation au parse

LayoutPath gagne name/skin/count/speed/pauseMs/oneWay, TOUS optionnels : une
compo existante rend exactement comme avant, sans migration.

parseLayout les PRÉSERVE et CLAMPE (jamais un rejet : une compo doit rester
chargeable). speed.min > 0 est structurel — tTrajet = longueur/vitesse, une
vitesse nulle ferait exploser le calcul.

4e passage sur ce fichier après destructible/layer/tile : le test de préservation
a été vérifié MORDANT (retiré la ligne → rouge).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 : `siteWorkers` — N marcheurs, skin choisi, visibilité

**Files:**
- Modify: `src/render/scenes/siteWorkers.ts:435-475` (`_addComposedNpcsAndPaths`)
- Modify: `src/render/scenes/siteWorkers.ts:520-535` (branche `role === 'path'`)
- Test: `tests/unit/pathWalkers.test.ts` (créer)

**Interfaces:**
- Consumes: `pathFollow(points, tMs, speed, opts)` + `PathOpts` (Task 1) ; `LayoutPath` + `PATH_LIMITS` (Task 2).
- Produces: `export function planPathWalkers(layout: StageLayout, worldW: number, worldH: number): PathWalkerPlan[]` dans `src/render/workerBehavior.ts`, avec
  `export interface PathWalkerPlan { pathId: string; type: PathType; skin: string | null; points: PathPoint[]; speed: number; pauseMs: number; oneWay: boolean; phaseMs: number }`

**Pourquoi extraire `planPathWalkers` :** le calcul « un chemin → N plans de marcheurs étalés » est de la logique PURE. Dans `siteWorkers` (qui tient Phaser) elle serait intestable. Dans `workerBehavior.ts` (déjà pur, déjà testé) elle est vérifiable sans navigateur. `siteWorkers` se contente de créer les sprites.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/unit/pathWalkers.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { planPathWalkers } from '@render/workerBehavior'
import { emptyLayout, type StageLayout, type LayoutPath } from '@content/stageLayout'

/**
 * Un chemin → N plans de marcheurs ÉTALÉS. Logique pure : `siteWorkers` ne fait
 * que créer les sprites correspondants.
 */

function withPath(p: Partial<LayoutPath>): StageLayout {
  const l = emptyLayout('terrain_vierge')
  l.paths = [{
    id: 'p1', type: 'worker_path',
    points: [{ x: -100, y: 0 }, { x: 100, y: 0 }],
    ...p
  } as LayoutPath]
  return l
}

const W = 10240
const H = 7680

describe('planPathWalkers — défauts = comportement historique', () => {
  it('un chemin sans réglages → UN marcheur, sans pause, aller-retour', () => {
    const plans = planPathWalkers(withPath({}), W, H)
    expect(plans.length).toBe(1)
    expect(plans[0]?.pauseMs).toBe(0)
    expect(plans[0]?.oneWay).toBe(false)
    expect(plans[0]?.phaseMs).toBe(0)
  })

  it('vitesse par défaut selon le type : 74 ouvrier / 150 camion', () => {
    expect(planPathWalkers(withPath({}), W, H)[0]?.speed).toBe(74)
    expect(planPathWalkers(withPath({ type: 'truck_path' }), W, H)[0]?.speed).toBe(150)
  })

  it('convertit les points en coordonnées MONDE (origine = centre)', () => {
    const p = planPathWalkers(withPath({}), W, H)[0]
    expect(p?.points[0]?.x).toBe(W / 2 - 100)
    expect(p?.points[1]?.x).toBe(W / 2 + 100)
  })
})

describe('planPathWalkers — N marcheurs étalés', () => {
  it('count: 3 → 3 plans, décalés d’un tiers de cycle', () => {
    // 200px @ 100px/s = 2s de trajet → cycle aller-retour = 4s = 4000ms.
    const plans = planPathWalkers(withPath({ count: 3, speed: 100 }), W, H)
    expect(plans.length).toBe(3)
    const phases = plans.map((p) => Math.round(p.phaseMs))
    expect(phases).toEqual([0, 1333, 2667])
  })

  it('l’étalement tient compte de la pause (le cycle s’allonge)', () => {
    // 2s de trajet + 1s de pause à chaque bout → cycle = 2*2 + 2*1 = 6s.
    const plans = planPathWalkers(withPath({ count: 2, speed: 100, pauseMs: 1000 }), W, H)
    expect(Math.round(plans[1]?.phaseMs ?? 0)).toBe(3000)
  })

  it('count: 0 → AUCUN marcheur (le chemin est un simple repère)', () => {
    expect(planPathWalkers(withPath({ count: 0 }), W, H).length).toBe(0)
  })

  it('un chemin de moins de 2 points est ignoré', () => {
    expect(planPathWalkers(withPath({ points: [{ x: 0, y: 0 }] }), W, H).length).toBe(0)
  })
})

describe('planPathWalkers — réglages transmis', () => {
  it('transmet skin / pause / sens unique tels quels', () => {
    const p = planPathWalkers(withPath({
      skin: 'npc_ouvrier_marius', pauseMs: 2500, oneWay: true
    }), W, H)[0]
    expect(p?.skin).toBe('npc_ouvrier_marius')
    expect(p?.pauseMs).toBe(2500)
    expect(p?.oneWay).toBe(true)
  })

  it('skin absent → null (le rendu choisira le défaut de la famille)', () => {
    expect(planPathWalkers(withPath({}), W, H)[0]?.skin).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer, vérifier l'ÉCHEC**

Run: `npx vitest run tests/unit/pathWalkers.test.ts`
Expected: FAIL — `planPathWalkers` n'existe pas.

- [ ] **Step 3 : Implémenter `planPathWalkers`**

Dans `src/render/workerBehavior.ts`, ajouter en fin de fichier :

```ts
import { PATH_DEFAULT_SPEED, type PathType } from '@content/stageLayout'

/** Un marcheur planifié sur un chemin. `phaseMs` étale les marcheurs sur le cycle. */
export interface PathWalkerPlan {
  pathId: string
  type: PathType
  /** null = le rendu choisit le défaut de la famille (porteur / camion). */
  skin: string | null
  /** Polyligne en coordonnées MONDE. */
  points: PathPoint[]
  speed: number
  pauseMs: number
  oneWay: boolean
  /** Décalage temporel de CE marcheur (étalement sur le cycle). */
  phaseMs: number
}

/**
 * Un chemin → N plans de marcheurs ÉTALÉS sur le cycle.
 *
 * PUR : aucune dépendance à Phaser. `siteWorkers` se contente de créer un sprite
 * par plan — d'où la testabilité de l'étalement sans navigateur.
 *
 * L'étalement décale chaque marcheur de `cycle / count` : ils se répartissent
 * d'eux-mêmes et se croisent, sans aucun réglage.
 */
export function planPathWalkers(
  layout: StageLayout,
  worldW: number,
  worldH: number
): PathWalkerPlan[] {
  const offX = worldW / 2
  const offY = worldH / 2
  const out: PathWalkerPlan[] = []

  for (const p of layout.paths) {
    if (p.points.length < 2) { continue }
    const count = p.count ?? 1
    if (count <= 0) { continue }

    const points = p.points.map((pt) => ({ x: offX + pt.x, y: offY + pt.y }))
    const speed = p.speed ?? PATH_DEFAULT_SPEED[p.type]
    const pauseMs = p.pauseMs ?? 0
    const oneWay = p.oneWay === true

    let total = 0
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i] as PathPoint
      const b = points[i + 1] as PathPoint
      total += Math.hypot(b.x - a.x, b.y - a.y)
    }
    const travelMs = speed > 0 ? (total / speed) * 1000 : 0
    const cycleMs = oneWay ? travelMs + pauseMs : 2 * travelMs + 2 * pauseMs

    for (let i = 0; i < count; i++) {
      out.push({
        pathId: p.id,
        type: p.type,
        skin: p.skin ?? null,
        points,
        speed,
        pauseMs,
        oneWay,
        phaseMs: count > 1 ? (cycleMs / count) * i : 0
      })
    }
  }
  return out
}
```

- [ ] **Step 4 : Lancer, vérifier le PASSAGE**

Run: `npx vitest run tests/unit/pathWalkers.test.ts`
Expected: PASS.

- [ ] **Step 5 : Brancher `siteWorkers`**

Dans `src/render/scenes/siteWorkers.ts`, remplacer la boucle `for (const p of composed.paths)` de `_addComposedNpcsAndPaths` (~ligne 452-473) par :

```ts
    for (const plan of planPathWalkers(composed, worldW, worldH)) {
      const isTruck = plan.type === 'truck_path'
      // Skin explicite > défaut de la famille. Un skin absent des textures
      // chargées retombe sur le défaut : jamais d'écran vide, jamais de crash.
      const wanted = plan.skin !== null && this.scene.textures.exists(plan.skin)
        ? plan.skin
        : (isTruck ? 'prop_s2_truck' : this._resolveKey('porteur', npcKeys))
      if (wanted === null || !this.scene.textures.exists(wanted)) {
        // Rien à afficher (stage sans sprite camion). L'inspecteur AVERTIT déjà
        // côté éditeur — ici on ne peut que ne rien créer.
        continue
      }
      const first = plan.points[0] ?? { x: offX, y: offY }
      const mid = plan.points[Math.floor(plan.points.length / 2)] ?? first
      this.jobs.push({
        textureKey: wanted,
        role: isTruck ? 'path_camion' : 'path',
        ax: first.x, ay: first.y, bx: first.x, by: first.y,
        speed: plan.speed,
        midX: mid.x, midY: mid.y,
        phaseOffsetMs: plan.phaseMs,
        points: plan.points,
        pauseMs: plan.pauseMs,
        oneWay: plan.oneWay
      })
      jobIdx++
    }
```

Ajouter à l'import en tête : `import { planPathWalkers } from '@render/workerBehavior'` (ou compléter l'import existant de `workerBehavior`).

Étendre l'interface de job (~ligne 110-126) :

```ts
  /** Polyligne à suivre (rôles 'path'/'path_camion'), en coordonnées MONDE. */
  points?: Array<{ x: number; y: number }>
  /** Pause aux extrémités (rôles 'path'/'path_camion'). */
  pauseMs?: number
  /** Sens unique (rôles 'path'/'path_camion'). */
  oneWay?: boolean
```

- [ ] **Step 6 : Honorer `visible` dans `sync`**

Dans `siteWorkers.ts`, branche `role === 'path' || role === 'path_camion'` (~ligne 526) :

```ts
      if (job.role === 'path' || job.role === 'path_camion') {
        const pf = pathFollow(job.points ?? [], tMs, job.speed, {
          pauseMs: job.pauseMs ?? 0,
          oneWay: job.oneWay === true
        })
        // Sens unique : le marcheur est SORTI — on le cache au lieu de le
        // téléporter à vue du bout au départ.
        aw.sprite.setVisible(pf.visible)
        if (!pf.visible) { continue }
        aw.sprite.setPosition(pf.x, pf.y)
        if (job.role === 'path_camion') {
```

(garder la suite existante de la branche telle quelle).

- [ ] **Step 7 : Gates**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 0 erreur, 0 warning, tous verts.

- [ ] **Step 8 : Commit**

```bash
git add src/render/workerBehavior.ts src/render/scenes/siteWorkers.ts tests/unit/pathWalkers.test.ts
git commit -m "feat(trajets 3/6): N marcheurs étalés, skin choisi, visibilité honorée

planPathWalkers (PUR, dans workerBehavior) : un chemin → N plans étalés d'un
cycle/count. Extrait de siteWorkers, qui tient Phaser et serait intestable :
l'étalement se vérifie désormais sans navigateur.

siteWorkers ne fait plus que créer un sprite par plan, et honore `visible` —
sans quoi un camion en sens unique se téléporterait à vue.

Un skin absent des textures chargées retombe sur le défaut de la famille :
jamais d'écran vide.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 : Éditeur — découvrabilité + inspecteur

**Files:**
- Modify: `src/editor/PrefabCatalog.ts:236-237` (section unique) + ajout `walkerSkinsFor`
- Modify: `src/editor/EditorState.ts:539-542` (`addPath` + `updatePath` + `deletePath`)
- Modify: `src/editor/EditorOverlay.ts:226-227` (indice) et bloc inspecteur
- Modify: `src/editor/EditorScene.ts:604-612` (compteur de points)
- Test: `tests/unit/editorPaths.test.ts` (créer) ; compléter `tests/unit/editorCatalog.test.ts`

**Interfaces:**
- Consumes: `PATH_LIMITS` et `PATH_DEFAULT_SPEED` (Task 2).
- Produces:
  - `EditorState.addPath(type: PathType, points: Vec2[]): LayoutPath` (retourne le chemin créé)
  - `EditorState.updatePath(id: string, patch: Partial<Omit<LayoutPath, 'id' | 'points'>>): void`
  - `EditorState.selectedPath(): LayoutPath | null`
  - `walkerSkinsFor(stageId: string, type: PathType): Array<{ key: string; label: string }>`

**C'EST LA CAUSE EXACTE du problème rapporté** : « je ne comprends pas comment déplacer un PNJ ». La fonctionnalité existait ; `Entrée` n'était écrit nulle part.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/unit/editorPaths.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { walkerSkinsFor, getStageCatalog } from '@/editor/PrefabCatalog'
import { PATH_LIMITS } from '@content/stageLayout'

describe('EditorState — réglages de chemin', () => {
  let st: EditorState
  beforeEach(() => {
    localStorage.clear()
    st = new EditorState('terrain_vierge')
  })

  it('addPath rend le chemin créé (pour le sélectionner aussitôt)', () => {
    const p = st.addPath('worker_path', [{ x: 0, y: 0 }, { x: 100, y: 0 }])
    expect(p.id).toBeTruthy()
    expect(st.paths.length).toBe(1)
  })

  it('updatePath modifie les réglages sans toucher aux points', () => {
    const p = st.addPath('worker_path', [{ x: 0, y: 0 }, { x: 100, y: 0 }])
    st.updatePath(p.id, { name: 'Ronde', count: 3, pauseMs: 2000, oneWay: true })
    const got = st.paths[0]
    expect(got?.name).toBe('Ronde')
    expect(got?.count).toBe(3)
    expect(got?.oneWay).toBe(true)
    expect(got?.points.length).toBe(2)
  })

  it('updatePath CLAMPE — l’inspecteur ne peut pas produire une vitesse nulle', () => {
    const p = st.addPath('truck_path', [{ x: 0, y: 0 }, { x: 100, y: 0 }])
    st.updatePath(p.id, { speed: 0 })
    expect(st.paths[0]?.speed).toBe(PATH_LIMITS.speed.min)
    st.updatePath(p.id, { count: 99 })
    expect(st.paths[0]?.count).toBe(PATH_LIMITS.count.max)
  })

  it('updatePath sur un id inconnu ne casse rien', () => {
    expect(() => st.updatePath('inexistant', { count: 2 })).not.toThrow()
  })
})

describe('walkerSkinsFor — le choix est filtré par la famille', () => {
  it('un chemin d’ouvrier ne propose QUE des PNJ', () => {
    const skins = walkerSkinsFor('terrain_vierge', 'worker_path')
    expect(skins.length).toBeGreaterThan(0)
    // Un skin de camion sur un chemin piéton donnerait un camion qui MARCHE.
    expect(skins.some((s) => s.key.includes('truck'))).toBe(false)
  })

  it('un chemin de camion ne propose QUE des véhicules', () => {
    const skins = walkerSkinsFor('terrain_vierge', 'truck_path')
    expect(skins.every((s) => !s.key.startsWith('npc_'))).toBe(true)
  })
})

describe('Palette — les 2 outils de chemin sont RÉUNIS', () => {
  it('« Chemin ouvrier » et « Chemin camion » sont dans la MÊME section, sur les 10 stages', () => {
    for (const stage of ['terrain_vierge', 'fondations', 'livraison_audit']) {
      const cat = getStageCatalog(stage)
      const worker = cat.entries.find((e) => e.id === 'marker_worker_path')
      const truck = cat.entries.find((e) => e.id === 'marker_truck_path')
      expect(worker, `ouvrier manquant sur ${stage}`).toBeDefined()
      expect(truck, `camion manquant sur ${stage}`).toBeDefined()
      expect(worker?.category).toBe(truck?.category)
    }
  })
})
```

- [ ] **Step 2 : Lancer, vérifier l'ÉCHEC**

Run: `npx vitest run tests/unit/editorPaths.test.ts`
Expected: FAIL — `updatePath`/`walkerSkinsFor` n'existent pas ; les 2 outils sont dans 2 sections.

- [ ] **Step 3 : `EditorState` — addPath / updatePath / selectedPath**

Dans `src/editor/EditorState.ts`, remplacer `addPath` (~ligne 539) :

```ts
  addPath(type: PathType, points: Vec2[]): LayoutPath {
    const p: LayoutPath = { id: newId(type), type, points }
    this.layout.paths.push(p)
    this.emit()
    return p
  }

  /** Chemin actuellement sélectionné (l'inspecteur s'y branche), ou null. */
  selectedPath(): LayoutPath | null {
    return this.layout.paths.find((p) => p.id === this.primaryId) ?? null
  }

  /**
   * Modifie les RÉGLAGES d'un chemin (jamais ses points). Les valeurs sont
   * CLAMPÉES ici aussi, pas seulement au parse : l'inspecteur ne doit pas
   * pouvoir produire une vitesse nulle (division par zéro dans `tTrajet`).
   */
  updatePath(id: string, patch: Partial<Omit<LayoutPath, 'id' | 'points'>>): void {
    const p = this.layout.paths.find((x) => x.id === id)
    if (p === undefined) { return }
    if (patch.name !== undefined) { p.name = patch.name }
    if (patch.skin !== undefined) { p.skin = patch.skin }
    if (patch.oneWay !== undefined) { p.oneWay = patch.oneWay }
    if (patch.count !== undefined) {
      p.count = Math.round(Math.min(PATH_LIMITS.count.max, Math.max(PATH_LIMITS.count.min, patch.count)))
    }
    if (patch.speed !== undefined) {
      p.speed = Math.min(PATH_LIMITS.speed.max, Math.max(PATH_LIMITS.speed.min, patch.speed))
    }
    if (patch.pauseMs !== undefined) {
      p.pauseMs = Math.min(PATH_LIMITS.pauseMs.max, Math.max(PATH_LIMITS.pauseMs.min, patch.pauseMs))
    }
    this.emit()
  }
```

Ajouter aux imports : `import { PATH_LIMITS, type LayoutPath, type PathType } from '@content/stageLayout'` (ou compléter l'import existant de `StageLayoutSchema` qui les ré-exporte).

- [ ] **Step 4 : `walkerSkinsFor` + section unique**

Dans `src/editor/PrefabCatalog.ts`, changer la catégorie de `marker_truck_path` (~ligne 236) de `'markers'` à `'workers'`, et renommer la catégorie `workers` :

```ts
  { id: 'workers', label: 'PNJ & chemins' },
```

Puis ajouter en fin de fichier :

```ts
/** Sprites de véhicule utilisables comme marcheurs de chemin camion. */
const VEHICLE_SKINS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'prop_s2_truck', label: 'Camion benne' }
]

/**
 * Skins proposés pour les marcheurs d'un chemin, FILTRÉS par la famille.
 *
 * Le filtre n'est pas cosmétique : `type` décide de l'animation de marche et de
 * l'orientation (`isCamion`). Un skin de camion sur un chemin d'ouvrier
 * produirait un camion qui MARCHE.
 */
export function walkerSkinsFor(
  stageId: string,
  type: PathType
): Array<{ key: string; label: string }> {
  if (type === 'truck_path') {
    return VEHICLE_SKINS.filter((v) => STAGE_RENDER[stageId]?.props.some((p) => p.key === v.key) === true)
  }
  const sr = STAGE_RENDER[stageId]
  const out: Array<{ key: string; label: string }> = []
  for (const npc of sr?.ambient ?? []) {
    out.push({ key: npc.key, label: assetMeta(npc.key)?.label ?? humanize(npc.file) })
  }
  for (const npc of SHARED_WORKER_NPCS) {
    out.push({ key: npc.key, label: assetMeta(npc.key)?.label ?? humanize(npc.file) })
  }
  return out
}
```

Ajouter `import type { PathType } from '@content/stageLayout'` en tête.

- [ ] **Step 5 : Indice de tracé + inspecteur**

Dans `src/editor/EditorScene.ts`, exposer le nombre de points en cours de tracé (ajouter un getter public près de `pathDraft`, ~ligne 71) :

```ts
  /** Nombre de points du tracé en cours (l'overlay l'affiche). */
  get pathDraftCount(): number {
    return this.pathDraft.length
  }
```

Dans `src/editor/EditorOverlay.ts`, remplacer la ligne de l'indice marqueur (~ligne 227) :

```ts
    if (active.marker !== null) {
      const isPath = active.marker === 'worker_path' || active.marker === 'truck_path'
      if (isPath) {
        // LA cause du « je ne comprends pas comment faire » : `Entrée` n'était
        // écrit NULLE PART. Sans la touche, on pose des points et il ne se passe
        // jamais rien.
        const n = this.scene.pathDraftCount
        parts.push(
          `<div class="sce-tool">Tracé : <b>${active.marker === 'truck_path' ? 'chemin camion' : 'chemin ouvrier'}</b> — ` +
          `${n} point${n > 1 ? 's' : ''} posé${n > 1 ? 's' : ''}<br>` +
          'clique pour poser · <b>Entrée</b> pour valider · Retour arrière annule le dernier · Échap abandonne</div>'
        )
      } else {
        parts.push(`<div class="sce-tool">Marqueur : <b>${active.marker}</b> — clique sur la map (Échap pour annuler)</div>`)
      }
    }
```

Ajouter le bloc inspecteur de chemin, juste après le bloc `else if (inst !== null)` :

```ts
    } else if (state.selectedPath() !== null) {
      const p = state.selectedPath() as LayoutPath
      const isTruck = p.type === 'truck_path'
      const skins = walkerSkinsFor(this.scene.stage, p.type)
      // Défaut lu à la SOURCE (Task 3), jamais recopié en dur : sinon l'inspecteur
      // afficherait 74 pendant que le rendu en utilise un autre.
      const speed = p.speed ?? PATH_DEFAULT_SPEED[p.type]
      const opts = skins.map((s) =>
        `<option value="${esc(s.key)}"${p.skin === s.key ? ' selected' : ''}>${esc(s.label)}</option>`
      ).join('')
      parts.push(
        `<div class="sce-insp-title">${esc(p.name ?? (isTruck ? 'Chemin camion' : 'Chemin ouvrier'))}</div>` +
        `<div class="sce-insp-row">${p.points.length} points</div>` +
        `<label class="sce-insp-row">Nom <input class="sce-search" id="path-name" value="${esc(p.name ?? '')}"></label>` +
        `<label class="sce-insp-row">Qui <select class="sce-select" id="path-skin"><option value="">(défaut)</option>${opts}</select></label>` +
        `<label class="sce-insp-row">Combien <input class="sce-search" id="path-count" type="number" min="0" max="8" value="${p.count ?? 1}"></label>` +
        `<label class="sce-insp-row">Vitesse <input class="sce-search" id="path-speed" type="number" min="10" max="400" value="${speed}"></label>` +
        `<label class="sce-insp-row">Pause (ms) <input class="sce-search" id="path-pause" type="number" min="0" max="30000" value="${p.pauseMs ?? 0}"></label>` +
        `<label class="sce-insp-row"><input type="checkbox" id="path-oneway"${p.oneWay === true ? ' checked' : ''}> Sens unique</label>`
      )
      // Le camion sans texture était ignoré par un `continue` MUET : on trace, et
      // rien n'apparaît, sans un mot. L'inspecteur le dit maintenant.
      if (isTruck && skins.length === 0) {
        parts.push('<div class="sce-warn sce-warn-warn">Ce stage n’a pas de sprite de camion : aucun véhicule n’apparaîtra sur ce chemin.</div>')
      }
    }
```

Ajouter aux imports de `EditorOverlay.ts` : `import { PATH_DEFAULT_SPEED, type LayoutPath } from '@content/stageLayout'` et `import { walkerSkinsFor } from './PrefabCatalog'` (compléter l'import existant).

Ajouter en tête de `EditorOverlay.ts` un échappeur (le fichier utilise `innerHTML` — un nom de chemin contenant `<` casserait l'UI) :

```ts
/** Échappe une valeur avant interpolation dans innerHTML (le nom est libre). */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
```

Câbler les champs. L'inspecteur est reconstruit par `innerHTML` à chaque `sync`,
donc les écouteurs doivent être (ré)installés APRÈS l'affectation — sinon ils
pointent des nœuds détachés et ne se déclenchent jamais (piège déjà rencontré sur
le HUD co-op). Ajouter, juste après la ligne qui affecte l'`innerHTML` de
l'inspecteur :

```ts
    // Réinstallés à CHAQUE sync : innerHTML détruit les nœuds précédents, donc
    // tout écouteur posé avant pointerait dans le vide.
    const sel = state.selectedPath()
    if (sel !== null) {
      const bind = (id: string, ev: 'change' | 'input', fn: (el: HTMLInputElement) => void): void => {
        const el = this.root.querySelector<HTMLInputElement>('#' + id)
        if (el !== null) { el.addEventListener(ev, () => { fn(el) }) }
      }
      bind('path-name', 'change', (el) => { state.updatePath(sel.id, { name: el.value }) })
      bind('path-count', 'change', (el) => { state.updatePath(sel.id, { count: Number(el.value) }) })
      bind('path-speed', 'change', (el) => { state.updatePath(sel.id, { speed: Number(el.value) }) })
      bind('path-pause', 'change', (el) => { state.updatePath(sel.id, { pauseMs: Number(el.value) }) })
      bind('path-oneway', 'change', (el) => { state.updatePath(sel.id, { oneWay: el.checked }) })
      const skinEl = this.root.querySelector<HTMLSelectElement>('#path-skin')
      if (skinEl !== null) {
        skinEl.addEventListener('change', () => { state.updatePath(sel.id, { skin: skinEl.value }) })
      }
    }
```

Adapter `this.root` au nom réel du conteneur de l'overlay dans ce fichier.

- [ ] **Step 6 : Lancer les tests**

Run: `npx vitest run tests/unit/editorPaths.test.ts tests/unit/editorCatalog.test.ts && npx tsc --noEmit && npm run lint`
Expected: verts, 0 warning.

- [ ] **Step 7 : e2e — l'indice mentionne `Entrée`**

Ajouter à `tests/e2e/` (fichier `editorPaths.spec.ts`) :

```ts
import { test, expect } from '@playwright/test'

test('l’outil de chemin annonce la touche Entrée AVANT de valider', async ({ page }) => {
  await page.goto('/?editor=true')
  await page.waitForSelector('.sce-palette')
  await page.getByText('Chemin ouvrier').click()
  // C'est CE texte qui manquait, et c'est toute la cause du problème rapporté.
  await expect(page.locator('.sce-tool')).toContainText('Entrée')
})
```

Run: `npx playwright test tests/e2e/editorPaths.spec.ts`
Expected: PASS.

- [ ] **Step 8 : Commit**

```bash
git add src/editor/PrefabCatalog.ts src/editor/EditorState.ts src/editor/EditorOverlay.ts src/editor/EditorScene.ts tests/unit/editorPaths.test.ts tests/unit/editorCatalog.test.ts tests/e2e/editorPaths.spec.ts
git commit -m "feat(trajets 4/6): éditeur — inspecteur de chemin + découvrabilité

LA cause du « je ne comprends pas comment déplacer un PNJ » : `finishPath()`
n'est appelé que par Entrée, et Entrée n'était écrit NULLE PART. L'indice disait
seulement « clique sur la map ». On posait des points, et rien n'arrivait jamais.
L'indice annonce désormais la touche + le compteur de points ; un e2e le verrouille.

Les 2 outils de chemin sont réunis dans « PNJ & chemins » (ils étaient dans 2
sections distinctes, rien ne disait qu'ils allaient ensemble).

Le camion sans texture était ignoré par un `continue` MUET → l'inspecteur avertit.

Le choix du skin est FILTRÉ par la famille : un skin de camion sur un chemin
d'ouvrier donnerait un camion qui marche.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 : Ouvriers nommés (Zinedine · Marius · Erling) + alias de compat

**Files:**
- Modify: `src/render/stages.ts:217-221`
- Rename: `public/stage01/npc/ouvrier_{a,b,c}_walk.png` → `ouvrier_{zinedine,marius,erling}_walk.png`
- Modify: `src/editor/PrefabCatalog.ts` (`ASSET_META` : libellés)
- Test: `tests/unit/workerAliases.test.ts` (créer)

**Interfaces:**
- Produces: `export const WORKER_SKIN_ALIASES: Record<string, string>` dans `src/render/stages.ts` ; `export function resolveWorkerSkin(key: string): string`.

**⚠️ LE RISQUE :** la compo de l'utilisateur pose **19 ouvriers** (`npc_ouvrier_a` ×4, `_b` ×5, `_c` ×10). Renommer la clé sans alias les fait **disparaître en silence**. Les sprites sont déjà visuellement distincts (peau mate/moustache, peau noire, blond) — **aucun asset à produire**, seuls les noms sont à réparer.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/unit/workerAliases.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { SHARED_WORKER_NPCS, WORKER_SKIN_ALIASES, resolveWorkerSkin } from '@render/stages'

/**
 * Les ouvriers génériques passent de « A/B/C » (illisible dans la palette) à des
 * PRÉNOMS. Les sprites ne changent PAS : ils étaient déjà distincts.
 *
 * Une compo de l'utilisateur pose 19 ouvriers sous les ANCIENNES clés. Sans
 * alias, elles ne résolvent plus et les 19 PNJ disparaissent SANS ERREUR.
 */
describe('Ouvriers nommés', () => {
  it('les 3 ouvriers portent des prénoms', () => {
    const keys = SHARED_WORKER_NPCS.map((n) => n.key)
    expect(keys).toEqual(['npc_ouvrier_zinedine', 'npc_ouvrier_marius', 'npc_ouvrier_erling'])
  })

  it('ALIAS : les anciennes clés résolvent toujours (19 PNJ posés en dépendent)', () => {
    expect(resolveWorkerSkin('npc_ouvrier_a')).toBe('npc_ouvrier_zinedine')
    expect(resolveWorkerSkin('npc_ouvrier_b')).toBe('npc_ouvrier_marius')
    expect(resolveWorkerSkin('npc_ouvrier_c')).toBe('npc_ouvrier_erling')
  })

  it('une clé déjà à jour passe telle quelle', () => {
    expect(resolveWorkerSkin('npc_ouvrier_zinedine')).toBe('npc_ouvrier_zinedine')
  })

  it('une clé inconnue passe telle quelle (pas de perte silencieuse)', () => {
    expect(resolveWorkerSkin('npc_stage01')).toBe('npc_stage01')
  })

  it('chaque alias pointe vers une clé qui EXISTE vraiment', () => {
    const keys = new Set(SHARED_WORKER_NPCS.map((n) => n.key))
    for (const [old, now] of Object.entries(WORKER_SKIN_ALIASES)) {
      expect(keys.has(now), `${old} → ${now} : cible inexistante`).toBe(true)
    }
  })
})
```

- [ ] **Step 2 : Lancer, vérifier l'ÉCHEC**

Run: `npx vitest run tests/unit/workerAliases.test.ts`
Expected: FAIL — `WORKER_SKIN_ALIASES` n'existe pas.

- [ ] **Step 3 : Renommer les fichiers**

```bash
git mv public/stage01/npc/ouvrier_a_walk.png public/stage01/npc/ouvrier_zinedine_walk.png
git mv public/stage01/npc/ouvrier_b_walk.png public/stage01/npc/ouvrier_marius_walk.png
git mv public/stage01/npc/ouvrier_c_walk.png public/stage01/npc/ouvrier_erling_walk.png
```

- [ ] **Step 4 : Implémenter**

Dans `src/render/stages.ts`, remplacer `SHARED_WORKER_NPCS` (~ligne 217) :

```ts
/**
 * Ouvriers génériques, partagés par les 10 stages. Ils portent des PRÉNOMS et
 * non « A/B/C » : les trois sprites sont visuellement distincts (peau mate et
 * moustache · peau noire · blond), mais leurs anciens noms ne le disaient pas —
 * dans la palette, il fallait cliquer pour découvrir qui on posait.
 */
export const SHARED_WORKER_NPCS: StageAmbientNpc[] = [
  { key: 'npc_ouvrier_zinedine', file: 'stage01/npc/ouvrier_zinedine_walk.png', frame: 192, scale: 0.62, framePeriodMs: 200, behavior: 'patrol', kind: 'worker' },
  { key: 'npc_ouvrier_marius', file: 'stage01/npc/ouvrier_marius_walk.png', frame: 192, scale: 0.62, framePeriodMs: 200, behavior: 'patrol', kind: 'worker' },
  { key: 'npc_ouvrier_erling', file: 'stage01/npc/ouvrier_erling_walk.png', frame: 192, scale: 0.62, framePeriodMs: 200, behavior: 'patrol', kind: 'worker' }
]

/**
 * Anciennes clés → nouvelles. **Ne pas supprimer** : des compositions déjà
 * sauvegardées posent des PNJ sous `npc_ouvrier_a/b/c`. Sans cette table, elles
 * ne résolvent plus et les PNJ disparaissent SANS la moindre erreur.
 */
export const WORKER_SKIN_ALIASES: Record<string, string> = {
  npc_ouvrier_a: 'npc_ouvrier_zinedine',
  npc_ouvrier_b: 'npc_ouvrier_marius',
  npc_ouvrier_c: 'npc_ouvrier_erling'
}

/** Résout un skin d'ouvrier via les alias. Clé inconnue → rendue telle quelle. */
export function resolveWorkerSkin(key: string): string {
  return WORKER_SKIN_ALIASES[key] ?? key
}
```

- [ ] **Step 5 : Appliquer l'alias aux PNJ posés**

Dans `src/render/workerBehavior.ts`, `planNpcJobs` (~ligne 291) :

```ts
  return layout.npcs.map((n) => ({
    role: n.kind === 'worker' ? ('npc_worker' as const) : ('npc_trade' as const),
    x: offX + n.x,
    y: offY + n.y,
    // Alias : une compo sauvegardée avant le renommage pose encore
    // `npc_ouvrier_a/b/c`. Sans cette résolution, ses PNJ disparaissent.
    skin: resolveWorkerSkin(n.skin)
  }))
```

Ajouter `import { resolveWorkerSkin } from '@render/stages'`.

Faire de même dans `planPathWalkers` (Task 3) pour `skin: p.skin ?? null` → `skin: p.skin !== undefined ? resolveWorkerSkin(p.skin) : null`.

- [ ] **Step 6 : Libellés de palette**

Dans `src/editor/PrefabCatalog.ts`, `ASSET_META` :

```ts
  npc_ouvrier_zinedine: { label: 'Ouvrier — Zinedine', category: 'npc_ouvrier' },
  npc_ouvrier_marius: { label: 'Ouvrier — Marius', category: 'npc_ouvrier' },
  npc_ouvrier_erling: { label: 'Ouvrier — Erling', category: 'npc_ouvrier' },
```

- [ ] **Step 7 : Vérifier + gates**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npx tsx tools/assets/qa.ts`
Expected: tous verts, 0 warning, assets:qa **0 erreur 0 avertissement**.

- [ ] **Step 8 : PROUVER que les 19 PNJ survivent**

```bash
node -e "
const { resolveWorkerSkin } = require('./src/render/stages.ts');
" 2>/dev/null || npx tsx -e "
import { resolveWorkerSkin } from './src/render/stages'
import { readFileSync, existsSync } from 'node:fs'
const f = 'src/content/layouts/terrain_vierge.json'
if (!existsSync(f)) { console.log('(compo absente — vérif sautée)'); process.exit(0) }
const d = JSON.parse(readFileSync(f, 'utf8'))
let ok = 0, ko = 0
for (const n of d.npcs ?? []) {
  const r = resolveWorkerSkin(n.skin)
  if (r.startsWith('npc_ouvrier_') && /_[abc]$/.test(r)) { ko++ } else { ok++ }
}
console.log('PNJ résolus:', ok, '· non résolus:', ko)
if (ko > 0) { throw new Error('des PNJ ne résolvent plus !') }
"
```

Expected: `PNJ résolus: 20 · non résolus: 0`

- [ ] **Step 9 : Commit**

```bash
git add src/render/stages.ts src/render/workerBehavior.ts src/editor/PrefabCatalog.ts tests/unit/workerAliases.test.ts public/stage01/npc
git commit -m "feat(trajets 5/6): ouvriers nommés Zinedine · Marius · Erling (+ alias)

Les 3 sprites étaient DÉJÀ visuellement distincts (peau mate et moustache · peau
noire · blond) : aucun asset produit. Seuls leurs noms mentaient — « Ouvrier A/B/C »
n'apprend rien, il fallait cliquer pour découvrir qui on posait.

ALIAS DE COMPAT obligatoire : une compo pose 19 ouvriers sous les anciennes clés.
Renommer sans alias les aurait fait disparaître SANS ERREUR. Vérifié : 20/20 PNJ
résolvent encore.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6 : Camion animé 4 directions + roues (PixelLab)

**Files:**
- Create: `public/stage02/props/truck_4dir.png` (feuille 4×N de frames 192)
- Create: `tools/assets/pack-truck-4dir.mjs`
- Modify: `src/render/stages.ts` (déclarer la feuille)
- Modify: `src/render/scenes/siteWorkers.ts` (jouer l'anim selon la direction)

**⚠️ Cette tâche est la SEULE qui consomme du quota PixelLab.** Suivre le skill `assets` : **golden batch d'abord** (1 direction), **gate DA avec l'utilisateur**, puis les 3 autres. Ne JAMAIS générer les 4 d'un coup.

**Contexte mesuré :** `dump_truck.png` fait 192×160 — une **image unique**, pas une feuille. Le code le sait (`animatable: hasTexture && !isCamion`). Le camion glisse donc sans tourner : un camion allant vers le nord est dessiné comme s'il allait vers l'est. C'est un **manque d'asset**, pas un bug de rendu.

**Rappel de la consigne utilisateur (ferme) :** tout visuel passe par **PixelLab en priorité** — ne jamais substituer un VFX procédural.

- [ ] **Step 1 : Golden — une seule direction**

Générer la vue « down » (camion vu de dessus allant vers le sud), avec le prompt global du manifest §3 préfixé, et les contre-mesures mesurées sur le golden batch précédent (PixelLab dérive vers la vue de CÔTÉ dès que l'objet est haut) :

```
mcp__pixellab__create_map_object
description: "16-bit clean arcade pixel art, top-down three-quarter RPG view like Zelda A Link to the Past, matching a 192x192 construction worker spritesheet, bold dark outline, compact readable silhouette, limited saturated color palette, SNES/Mega Drive era, crisp pixels, transparent background, no blur, no anti-aliased painting, no modern vector look, no realistic lighting, no text, no watermark — a yellow construction dump truck seen from ABOVE at a steep three-quarter angle, driving TOWARD the viewer (southward), the ROOF of the cab and the open dump bed are the largest visible surfaces, windshield foreshortened, wheels barely visible at the sides, chunky readable silhouette, NOT a side view, NOT a profile view"
width: 192, height: 192, view: "high top-down"
outline: "single color outline", shading: "medium shading", detail: "medium detail"
```

- [ ] **Step 2 : GATE DA — juger EN CONTEXTE, pas sur la vignette**

Télécharger, puis :

```bash
node tools/assets/context-board.mjs <spec.json>
```

avec un spec pointant le PNG, `h: 130`, sol `public/stage02/ground/tile_0.png`.

**Ne JAMAIS juger sur la vignette de l'API** : sur le golden batch précédent, les vignettes donnaient 6/6 corrects, la planche en contexte 3/6. Déposer la planche dans `public/_gate/palette/` (dossier exclu du linter, jamais committé) et **demander l'avis de l'utilisateur** avant de générer les 3 autres directions.

- [ ] **Step 3 : Les 3 autres directions (après le feu vert)**

Répéter pour `up` (s'éloigne, on voit l'arrière et la benne), `right`, `left` — en gardant le même prompt à l'identique sauf la direction. `left` peut être obtenu par miroir de `right` (économise une génération) : vérifier que l'asymétrie du camion le permet ; sinon générer.

- [ ] **Step 4 : Packer la feuille 4 directions**

D'abord LIRE un packer existant pour reprendre exactement sa convention :

```bash
ls tools/assets/pack-*.mjs
```

Créer `tools/assets/pack-truck-4dir.mjs` sur ce modèle. Contrat : **ordre
`down/right/up/left`** (l'ordre du dépôt, cf. `player_j1.png`), frames 192×192,
une ligne par direction, sortie `public/stage02/props/truck_4dir.png` (768×192 si
1 frame/direction ; 768×384 si 2). L'ordre n'est pas négociable : `walkFrame`
(`src/render/sprites.ts`) le suppose.

Run: `node tools/assets/pack-truck-4dir.mjs && npx tsx tools/assets/qa.ts`
Expected: feuille écrite aux bonnes dimensions, assets:qa **0 erreur 0 avertissement**.

- [ ] **Step 5 : Déclarer + jouer la bonne direction**

Dans `src/render/stages.ts`, déclarer la feuille en `editorExtras` avec `frame: 192`
(c'est ce champ qui déclenche `load.spritesheet` au lieu de `load.image`, cf.
`GameScene.ts:398`).

Dans `siteWorkers.ts` :

1. `animatable: hasTexture && !isCamion` → `animatable: hasTexture` (le camion
   devient animable — c'est tout l'objet de la tâche) ;
2. dans la branche `role === 'path_camion'` de `sync`, choisir la frame depuis la
   direction que `pathFollow` rend DÉJÀ :

```ts
        if (job.role === 'path_camion') {
          // La direction est déjà calculée par pathFollow : on ne la re-devine pas.
          // walkFrame mappe (dirX, dirY) → ligne de la feuille (down/right/up/left).
          aw.sprite.setFrame(walkFrame(pf.dirX, pf.dirY, tMs))
        }
```

Ajouter `import { walkFrame } from '@render/sprites'`. **Vérifier la signature réelle
de `walkFrame` avant de l'appeler** (`grep -n "export function walkFrame" -A 8
src/render/sprites.ts`) et adapter l'appel : elle est déjà utilisée par
`GameScene` pour les joueurs, c'est la source de vérité de la convention 4-dir.

- [ ] **Step 6 : Gates + commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build && npx tsx tools/assets/qa.ts`

```bash
git add public/stage02/props/truck_4dir.png tools/assets/pack-truck-4dir.mjs src/render/stages.ts src/render/scenes/siteWorkers.ts
git commit -m "feat(trajets 6/6): camion animé 4 directions

dump_truck.png était une IMAGE UNIQUE (192×160) : rien à animer, le camion
glissait sans jamais tourner — un camion allant vers le nord était dessiné comme
s'il allait vers l'est. Manque d'asset, pas bug de rendu.

Feuille 4 directions (PixelLab, golden batch + gate DA en contexte). La direction
vient de pathFollow (dirX/dirY), déjà calculée.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7 : Gates finaux + gametest

- [ ] **Step 1 : Écarter les pièges de `sim:check`**

```bash
mv src/content/layouts/terrain_vierge.json /tmp/terrain_vierge.LIVE.json
git checkout -- src/content/composedLayouts.ts
git status --porcelain src/content/composedLayouts.ts src/content/layouts/terrain_vierge.json
```

Expected: aucune sortie (les deux sont propres). **Sans ça, `sim:check` sort un FAUX ROUGE connu.**

- [ ] **Step 2 : `sim:check` en TÂCHE DE FOND**

Run (background, ~4 min): `npm run sim:check`
Expected: `diff vs baseline` = `+0s / niv +0 / pic +0` sur kite/greedy/idle, et `[sim] cibles VERTES ✓`.

`paths` est du RENDU : la sim ne le lit pas. Le diff 0 doit être **prouvé**, pas supposé.

- [ ] **Step 3 : Gates complets**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build && npx tsx tools/assets/qa.ts && npx playwright test`
Expected: 0 erreur · 0 warning · tous verts · assets:qa 0/0 · e2e vert sur les **2 projets**.

- [ ] **Step 4 : Restaurer la compo**

```bash
mv /tmp/terrain_vierge.LIVE.json src/content/layouts/terrain_vierge.json
```

- [ ] **Step 5 : Gametest (l'oracle, c'est l'utilisateur)**

Démarrer le serveur, donner l'**URL LAN COMPLÈTE prête à coller** (le port change à chaque session) :

```bash
npx vite --host 0.0.0.0 --port 3000
```

→ `http://<IP_LAN>:3000/?editor=true`

À vérifier par l'utilisateur :
1. Prendre « Chemin camion » dans **PNJ & chemins** ; l'indice annonce **Entrée**.
2. Poser 3 points, `Entrée` → le chemin existe.
3. Le sélectionner : régler pause 2000 ms, count 2 → sauver → jouer.
4. En jeu : deux camions étalés, qui **s'arrêtent** aux extrémités puis repartent.
5. Cocher « sens unique » → ils disparaissent au bout et réapparaissent au départ.
6. Les ouvriers de la palette s'appellent **Zinedine / Marius / Erling**, et les 19 déjà posés sont **toujours là**.

---

## Ordre & dépendances

```
1 (pathFollow) → 3 (siteWorkers)
2 (types+parse) → 3, 4
3 → 4 (inspecteur)
5 (renommage) — indépendant, peut passer en parallèle
6 (camion) — APRÈS 1-4 ; seule tâche à quota PixelLab
7 — gates finaux
```

## Hors périmètre (YAGNI, acté au cadrage)

- Évitement d'obstacles / files d'attente (c'est du décor).
- Vitesse ou skin **par marcheur** d'un même chemin (« l'inspecteur devient une liste à gérer »).
- Bascule boucle fermée / aller-retour (l'aller-retour convient).
- Assignation d'un PNJ posé à un chemin (modèle « le chemin porte ses marcheurs » retenu).
- Feuilles de MARCHE pour les 7 métiers (les ouvriers génériques suffisent — décision utilisateur).
