/**
 * Fonctions PURES d'atteignabilité (sans Phaser, sans DOM, sans I/O réseau).
 *
 * Séparées de `reachability.ts` pour être unit-testables (Vitest) sans déclencher
 * l'enregistrement du hook de résolution `phaser` ni la construction des mondes.
 * Chaque fonction prend les DONNÉES DE PROD en entrée et renvoie un `CategoryReport`
 * — jamais de recalcul d'une formule de prod, jamais de lecture d'écran.
 */

/** Résultat d'une catégorie : total déclaré, atteignables, et clés orphelines. */
export interface CategoryReport {
  /** Nom lisible de la catégorie (affiché dans le rapport). */
  readonly category: string
  /** Nombre total de clés DÉCLARÉES dans le contenu. */
  readonly declared: number
  /** Nombre de clés ATTEIGNABLES (référencées par un vrai chemin de prod). */
  readonly reachable: number
  /** Clés déclarées mais jamais atteintes, triées. */
  readonly orphans: readonly string[]
  /**
   * `true` ⇒ des orphelins font ÉCHOUER le build (gate). `false` ⇒ la catégorie
   * n'imprime qu'un AVERTISSEMENT (check trop incertain pour bloquer, ex. call-sites
   * audio détectés par littéral de chaîne : un faux positif marquerait « atteint »,
   * jamais « orphelin » — mais la précision ne suffit pas pour bloquer un build).
   */
  readonly gate: boolean
  /**
   * Orphelins ATTENDUS et documentés (choix d'auteur, PAS un bug) — soustraits des
   * orphelins bloquants. Ex. les 2 PNJ métier du stage 01, posables à l'éditeur.
   * Restent affichés (transparence) mais ne cassent pas le gate.
   */
  readonly expectedOrphans?: readonly string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Engins animés (LIVE_ENGINES) — atteignabilité dans les mondes construits
// ─────────────────────────────────────────────────────────────────────────────

/** Un engin statique et sa feuille animée (`workKey`) — sous-ensemble de `LiveEngine`. */
export interface LiveEngineProbe {
  readonly staticKey: string
  readonly workKey: string
}

/**
 * Un engin animé est ATTEIGNABLE si sa feuille `workKey` apparaît dans au moins une
 * instance de cluster réellement construite sur l'un des stages. `presentAssetKeys`
 * = union des `assetKey` de tous les éléments de clusters bâtis par `buildSiteLayout`
 * (registre `CLUSTERS` déjà passé par `withLiveEngine`, donc les statiques y sont
 * DÉJÀ swappées vers leur `workKey`).
 */
export function checkLiveEngines(
  engines: readonly LiveEngineProbe[],
  presentAssetKeys: ReadonlySet<string>
): CategoryReport {
  const orphans = engines
    .filter((e) => !presentAssetKeys.has(e.workKey))
    .map((e) => e.workKey)
    .sort()
  return {
    category: 'Engins animés (feuilles *_work)',
    declared: engines.length,
    reachable: engines.length - orphans.length,
    orphans,
    gate: true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tuiles de sol (STAGE_RENDER[stage].ground) — atteignabilité au rendu
// ─────────────────────────────────────────────────────────────────────────────

/** Les tuiles de sol déclarées d'un stage + la tuile de base RÉELLEMENT peinte. */
export interface StageGroundProbe {
  readonly stageId: string
  /** Toutes les clés de tuile déclarées (`ground[].key`). */
  readonly tileKeys: readonly string[]
  /** Index de la tuile de base (`baseTileIndex`, défaut 0). */
  readonly baseTileIndex: number
  /**
   * Clés RÉELLEMENT référencées par le chemin de rendu HORS base (compo `groundKey`
   * override + plaques `elements[].tile`). Le sol de base est ajouté ici même.
   */
  readonly extraReferenced: readonly string[]
}

/**
 * `createGround` peint EXACTEMENT UNE tuile de base par stage (`tileKeys[baseTileIndex]`
 * ou l'`overrideKey` d'une compo), et le `DecorStreamer` n'utilise QUE décalques/props
 * — jamais les tuiles de sol. Toute tuile déclarée autre que la base (ou une tuile
 * explicitement référencée par une compo) est donc chargée mais jamais peinte.
 *
 * ⚠️ INCIDENT CONNU ET NON CORRIGÉ (50/60) : cet outil le DÉTECTE, il ne le corrige
 * pas (réparer le rendu du sol est hors mandat). C'est un signalement, pas un patch.
 */
export function checkGroundTiles(stages: readonly StageGroundProbe[]): CategoryReport {
  const declaredKeys: string[] = []
  const orphanKeys: string[] = []
  for (const s of stages) {
    const baseKey = s.tileKeys[s.baseTileIndex] ?? s.tileKeys[0]
    const reached = new Set<string>(s.extraReferenced)
    if (baseKey !== undefined) {
      reached.add(baseKey)
    }
    for (const k of s.tileKeys) {
      declaredKeys.push(k)
      if (!reached.has(k)) {
        orphanKeys.push(k)
      }
    }
  }
  return {
    category: 'Tuiles de sol',
    declared: declaredKeys.length,
    reachable: declaredKeys.length - orphanKeys.length,
    orphans: orphanKeys.sort(),
    // Bloquant : l'incident est réel et mesurable. Le mettre en warning-only le
    // laisserait pourrir « en reste » — ce que le brief demande précisément d'éviter.
    gate: true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4a. Cues audio nommés (manifest `SFX`) — call-sites dans le code de prod
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un cue SFX nommé est ATTEIGNABLE si son nom apparaît en LITTÉRAL DE CHAÎNE (guillemets
 * simples/doubles/backtick) quelque part dans le code de prod, HORS son fichier de
 * déclaration (`manifest.ts`). Couvre les 3 chemins d'appel : `playCue('x')` direct,
 * table de dispatch (`def.breakSfx = 'break_wood'`) et script d'intro (`{kind:'sfx',
 * key:'clonk'}`).
 *
 * ⚠️ WARNING-ONLY (voir `gate:false`) : un littéral coïncident (ex. le mot « bonus »
 * dans une chaîne sans rapport) marquerait un cue « atteint » à tort — c'est un FAUX
 * NÉGATIF (orphelin manqué), jamais une fausse accusation. On préfère donc signaler
 * sans bloquer : le check indique où creuser, il ne condamne pas un build.
 */
export function checkAudioCues(
  cueNames: readonly string[],
  productionSources: ReadonlyMap<string, string>,
  declarationFileSuffix: string
): CategoryReport {
  const orphans: string[] = []
  for (const name of cueNames) {
    if (!hasStringLiteral(name, productionSources, declarationFileSuffix)) {
      orphans.push(name)
    }
  }
  return {
    category: 'Cues audio nommés (SFX)',
    declared: cueNames.length,
    reachable: cueNames.length - orphans.length,
    orphans: orphans.sort(),
    gate: false
  }
}

/** Vrai si `name` apparaît en littéral de chaîne dans une source de prod (hors fichier de déclaration). */
export function hasStringLiteral(
  name: string,
  sources: ReadonlyMap<string, string>,
  declarationFileSuffix: string
): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('[\'"`]' + esc + '[\'"`]')
  for (const [file, text] of sources) {
    if (file.endsWith(declarationFileSuffix)) {
      continue
    }
    if (re.test(text)) {
      return true
    }
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// 4b. SFX d'armes en FICHIER (WEAPON_SFX_IDS) — un id = une arme qui peut tirer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un id de `WEAPON_SFX_IDS` est ATTEIGNABLE s'il existe une arme de contenu dont
 * l'`id` est exactement cet id : le SFX en fichier est joué par `playWeaponSfx(kind)`
 * sur l'événement `weaponFired(def.id)` — sans arme portant cet id, aucun `weaponFired`
 * ne peut jamais transporter ce `kind`, et `sfx_weapon_<id>` ne joue jamais.
 *
 * Bloquant : la correspondance id↔arme est EXACTE (pas d'heuristique de chaîne), donc
 * fiable comme gate — zéro ambiguïté de dispatch ici.
 */
export function checkWeaponSfx(
  weaponSfxIds: readonly string[],
  weaponDefIds: ReadonlySet<string>
): CategoryReport {
  const orphans = weaponSfxIds.filter((id) => !weaponDefIds.has(id)).sort()
  return {
    category: 'SFX d’armes en fichier (WEAPON_SFX_IDS)',
    declared: weaponSfxIds.length,
    reachable: weaponSfxIds.length - orphans.length,
    orphans,
    gate: true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PNJ (catégorie 1) — la logique de comptage vit dans `reachability.ts` (elle a
// besoin du VRAI `SiteWorkers`, donc de Phaser stubé). On expose juste le
// formateur du rapport pour garder un point unique de construction du verdict.
// ─────────────────────────────────────────────────────────────────────────────

/** Construit le `CategoryReport` PNJ à partir des orphelins mesurés (mondes construits). */
export function buildAmbientReport(
  declaredCount: number,
  orphans: readonly string[],
  expectedOrphans: readonly string[]
): CategoryReport {
  const sorted = [...orphans].sort()
  return {
    category: 'PNJ ambient / métier',
    declared: declaredCount,
    reachable: declaredCount - sorted.length,
    orphans: sorted,
    expectedOrphans: [...expectedOrphans].sort(),
    gate: true
  }
}

/** Orphelins « inattendus » d'une catégorie = orphelins hors liste documentée (ceux qui cassent le gate). */
export function unexpectedOrphans(report: CategoryReport): string[] {
  const expected = new Set(report.expectedOrphans ?? [])
  return report.orphans.filter((o) => !expected.has(o))
}
