/**
 * Tableau de succès — data PURE, déterministe (aucun Math.random / Date.now ici).
 *
 * OBJECTIF : ajouter un succès doit coûter UNE entrée dans `ACHIEVEMENTS`, zéro
 * ligne de code ailleurs. Les succès listés ici sont volontairement INDÉPENDANTS
 * des stages (aucun `stageId` en dur) : ils ne bougeront pas quand les stages
 * évolueront. Le tableau se complétera plus tard, stages avancés.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ PIÈGE DE COMPTAGE — À LIRE AVANT D'ALIMENTER `AchievementProgress`
 * ---------------------------------------------------------------------------
 * `EnemyDiedEvent` est PLAFONNÉ par pas de simulation (`MAX_DIED_EVENTS_PER_STEP`
 * = 12, `src/core/simulation.ts`) : c'est un événement de RENDU (une mort = une
 * flaque de Mode Carnage), borné parce que le rendu ne peut pas honorer 50 morts
 * dans une frame. Les morts au-delà du plafond ne sont JAMAIS émises.
 *
 * ⇒ Compter les `EnemyDiedEvent` donnerait un total FAUX (sous-évalué) sur les
 *   grosses vagues — exactement là où le joueur débloquerait « 1000 ennemis ».
 *
 * Sources FIABLES (non plafonnées), à utiliser pour alimenter ce module :
 *   - `state.score`            → compteur de kills cumulé de la run (`this.score += reap.total`)
 *   - `EnemyKilledEvent.count` → nombre RÉEL de morts du pas (`reap.total`, non borné)
 *   - `state.rescue.rescued`   → prisonniers libérés (cumul sim)
 *   - `state.elapsedMs`, `state.players[].level`, `state.scene === 'won'`
 *   - `ChestOpenedEvent` / `EvolvedEvent` (non plafonnés)
 *
 * Ne JAMAIS brancher un compteur de succès sur `EnemyDiedEvent`.
 */

/**
 * Compteurs cumulés servant de base au test de chaque succès.
 *
 * Mélange assumé de deux natures, documenté par champ :
 *   - CUMUL PROFIL (croît d'une run à l'autre) : `kills`, `bossKills`,
 *     `chestsOpened`, `weaponEvolutions`, `prisonersFreed`, `stagesCompleted`.
 *   - MEILLEURE RUN (max historique, pas une somme) : `bestSurvivalMs`,
 *     `bestLevel` — sommer ces deux-là débloquerait « survivre 10 minutes »
 *     avec dix runs d'une minute, ce qui n'est pas le succès demandé.
 *
 * Tous les champs sont requis : un champ optionnel se ferait silencieusement
 * oublier par l'appelant qui alimente le profil.
 */
export interface AchievementProgress {
  /** CUMUL PROFIL — ennemis neutralisés (source : `state.score` / `EnemyKilledEvent.count`). */
  readonly kills: number
  /** CUMUL PROFIL — boss tués, rôle `mid` ou `final` confondus. */
  readonly bossKills: number
  /** CUMUL PROFIL — coffres ouverts (`ChestOpenedEvent`). */
  readonly chestsOpened: number
  /** CUMUL PROFIL — évolutions d'arme déclenchées (`EvolvedEvent`). */
  readonly weaponEvolutions: number
  /** CUMUL PROFIL — prisonniers libérés (`state.rescue.rescued`). */
  readonly prisonersFreed: number
  /** CUMUL PROFIL — chantiers livrés, toutes phases confondues (`scene === 'won'`). */
  readonly stagesCompleted: number
  /** MEILLEURE RUN — plus longue survie en ms (max de `state.elapsedMs`, pas une somme). */
  readonly bestSurvivalMs: number
  /** MEILLEURE RUN — plus haut niveau atteint (max de `state.players[].level`). */
  readonly bestLevel: number
}

export interface AchievementDef {
  /** Identifiant stable — sert de CLÉ DE PERSISTANCE : ne jamais le renommer. */
  readonly id: string
  /** Libellé court FR (toast). */
  readonly label: string
  /** Condition de déblocage, en FR. */
  readonly description: string
  /**
   * Chemin de l'icône RELATIF à `public/` (ex. `ui_trophy.png`,
   * `stage01/ui/icon_enemy_boss_64.png`). Deux familles d'icônes coexistent
   * (racine `ui_*.png` et `stage01/ui/icon_*_64.png`), donc on stocke le chemin
   * complet plutôt qu'une clé nue ambiguë : l'affichage n'a qu'à préfixer
   * `import.meta.env.BASE_URL`. Absent = pas d'icône adaptée en stock
   * (l'affichage retombe sur un monogramme) — ne jamais inventer un fichier.
   */
  readonly icon?: string
  /** Prédicat PUR : ne lit que `p`, ne mute rien. */
  readonly test: (p: AchievementProgress) => boolean
}

/** Seuils nommés — le chiffre du libellé et celui du test viennent de la même source. */
const KILLS_APPRENTI = 100
const KILLS_DEMOLISSEUR = 1000
const SURVIE_MS = 10 * 60 * 1000
const NIVEAU_COMPAGNON = 20
const LIVRAISONS_CONFIRMEES = 3

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'premier_boss',
    label: 'Contrôle inopiné',
    description: 'Neutraliser un boss de chantier.',
    icon: 'stage01/ui/icon_enemy_boss_64.png',
    test: (p) => p.bossKills >= 1,
  },
  {
    id: 'kills_100',
    label: 'Cent fois sur le métier',
    description: `Neutraliser ${KILLS_APPRENTI} ennemis en tout.`,
    icon: 'stage01/ui/icon_enemy_base_64.png',
    test: (p) => p.kills >= KILLS_APPRENTI,
  },
  {
    id: 'kills_1000',
    label: 'Démolisseur agréé',
    description: `Neutraliser ${KILLS_DEMOLISSEUR} ennemis en tout.`,
    icon: 'stage01/ui/icon_enemy_tank_64.png',
    test: (p) => p.kills >= KILLS_DEMOLISSEUR,
  },
  {
    id: 'coffre_ouvert',
    label: 'Livraison de matériel',
    description: 'Ouvrir un coffre sur le chantier.',
    // Aucune icône de coffre en stock : monogramme assumé (pas de génération).
    test: (p) => p.chestsOpened >= 1,
  },
  {
    id: 'evolution_arme',
    label: 'Outillage homologué',
    description: 'Faire évoluer une arme.',
    icon: 'stage01/ui/icon_mitrailleuse_clous_64.png',
    test: (p) => p.weaponEvolutions >= 1,
  },
  {
    id: 'survie_10min',
    label: 'Journée complète',
    description: 'Tenir 10 minutes sur un même chantier.',
    icon: 'ui_casque.png',
    test: (p) => p.bestSurvivalMs >= SURVIE_MS,
  },
  {
    id: 'stage_livre',
    label: 'Chantier livré',
    description: 'Terminer un chantier.',
    icon: 'ui_trophy.png',
    test: (p) => p.stagesCompleted >= 1,
  },
  {
    id: 'prisonnier_libere',
    label: 'Sauveteur secouriste',
    description: 'Libérer un collègue retenu sur le chantier.',
    icon: 'stage01/ui/icon_casque_homologue_64.png',
    test: (p) => p.prisonersFreed >= 1,
  },
  {
    id: 'niveau_20',
    label: 'Compagnon',
    description: `Atteindre le niveau ${NIVEAU_COMPAGNON}.`,
    icon: 'ui_star_on.png',
    test: (p) => p.bestLevel >= NIVEAU_COMPAGNON,
  },
  {
    id: 'livraisons_3',
    label: 'Maître d’œuvre',
    description: `Terminer ${LIVRAISONS_CONFIRMEES} chantiers.`,
    icon: 'stage01/ui/icon_char_grutier_64.png',
    test: (p) => p.stagesCompleted >= LIVRAISONS_CONFIRMEES,
  },
]

/**
 * Retourne les ids NOUVELLEMENT débloqués — jamais ceux déjà acquis (sinon le
 * toast se rejouerait à chaque évaluation).
 *
 * Fonction PURE : ne mute ni `p` ni `alreadyUnlocked`. L'appelant reste maître
 * de la persistance.
 */
export function evaluateAchievements(
  p: AchievementProgress,
  alreadyUnlocked: ReadonlySet<string>
): string[] {
  const newly: string[] = []
  for (const def of ACHIEVEMENTS) {
    if (!alreadyUnlocked.has(def.id) && def.test(p)) {
      newly.push(def.id)
    }
  }
  return newly
}
