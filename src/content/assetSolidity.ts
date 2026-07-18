/**
 * assetSolidity — SOLIDITÉ DÉCLARÉE par clé d'asset. DATA PURE.
 *
 * ⚠️ SOURCE UNIQUE. Les trois chemins qui décident « ça bloque ou pas » la lisent :
 *   1. les clusters écrits à la main (`content/clusters.ts`, résolus au chargement) ;
 *   2. l'export du Stage Composer Editor (`editor/EditorState.ts`) ;
 *   3. la conversion compo → sim (`core/siteLayout.ts`, `embeddedToClusterElement`)
 *      — ce qui corrige AUSSI les niveaux joueur sauvegardés avant ce fichier.
 * Ils ne peuvent donc plus se contredire.
 *
 * POURQUOI. La solidité était DÉDUITE du rôle/préfixe de la clé (`prop_` passe,
 * `struct_` bloque). Or le préfixe n'encode pas la solidité : `prop_s2_excavator`
 * est une pelleteuse de 12 t (elle DOIT bloquer) et `site_gate` est un portail
 * (il DOIT laisser passer). Résultat mesuré : l'éditeur se trompait sur 4 cas / 4,
 * et la même clé se contredisait d'un cluster à l'autre (`prop_s2_truck` :
 * bloquant ×3, traversable ×1). Même classe de bug que le match de sous-chaîne
 * `road`/`decal` qui décidait la profondeur d'affichage (corrigé par `RenderLayer`).
 * **On déclare la donnée, on ne la devine pas du nom.**
 *
 * DÉFAUT SÛR : une clé ABSENTE de `ASSET_SOLIDITY` garde le comportement
 * historique (cf. `resolveSolidity` : le placement, puis le repli de l'appelant).
 * Déclarer un asset est donc toujours un acte volontaire — pas de collision
 * surprise sur les ~200 autres assets du jeu.
 */

/** Qui peut être bloqué par un élément. */
export type CollideKind = 'both' | 'enemies' | 'none'

/** Forme collidable, en coordonnées LOCALES à l'ancre de l'élément (dx, dy). */
export type ObstacleShape =
  | { kind: 'circle'; r: number }
  | { kind: 'segment'; x2: number; y2: number; thickness: number } // de (dx,dy) à (dx+x2, dy+y2)

/**
 * Solidité d'un asset ou d'un élément posé. Le type porte l'invariant du jeu :
 * **ce qui bloque a TOUJOURS une forme** (`extractObstacles` jette sinon).
 */
export type Solidity =
  | { collide: 'none' }
  | { collide: 'both' | 'enemies'; shape: ObstacleShape }

const NONE: Solidity = { collide: 'none' }

/**
 * Registre des assets dont la solidité est DÉCLARÉE.
 *
 * `shape` = forme PAR DÉFAUT (le placement peut écrire la sienne, elle est alors
 * transportée telle quelle — une clôture reste un segment orienté).
 * Coordonnées en px monde, à l'échelle nominale de l'asset dans les clusters.
 */
export const ASSET_SOLIDITY: Readonly<Record<string, Solidity>> = {
  // ── BARRIÈRES ─────────────────────────────────────────────────────────────
  // Un panneau de clôture est un MUR : un segment, jamais un disque. Les
  // clusters écrivent leur propre segment (orientation de la palissade) ; la
  // valeur ci-dessous sert au panneau posé seul depuis la palette.
  fence_panel: { collide: 'both', shape: { kind: 'segment', x2: 80, y2: 0, thickness: 10 } },
  fence_post: { collide: 'both', shape: { kind: 'circle', r: 14 } },
  // Barrière de police (Vauban) — stage 10.
  prop_stage10_barrier: { collide: 'both', shape: { kind: 'segment', x2: 70, y2: 0, thickness: 10 } },

  // ── LE PORTAIL — décision produit, et CAS-TEST de ce fichier ───────────────
  // `site_gate` a le rôle `structure` : toute déduction par rôle/préfixe le
  // rend bloquant et SCELLE l'anneau de clôture. Or le portail n'est pas une
  // barrière oubliée : c'est LE trou par lequel on entre dans la zone clôturée
  // (cf. `gates` des clusters). Il est donc déclaré traversable — la preuve
  // qu'on déclare la solidité au lieu de la déduire.
  site_gate: NONE,

  // ── ENGINS (tous les stages) ──────────────────────────────────────────────
  // Un engin est un corps solide de plusieurs tonnes : il arrête le joueur ET
  // les ennemis, partout où il est posé.
  // Stage 02 — terrassement
  prop_s2_excavator: { collide: 'both', shape: { kind: 'circle', r: 56 } }, // pelleteuse
  prop_s2_truck: { collide: 'both', shape: { kind: 'circle', r: 48 } }, // camion benne
  prop_s2_dozer: { collide: 'both', shape: { kind: 'circle', r: 48 } }, // bulldozer
  prop_s2_roller: { collide: 'both', shape: { kind: 'circle', r: 46 } }, // rouleau compresseur
  // Variantes ANIMÉES (machines vivantes) : MÊME engin, même encombrement que la
  // clé statique ci-dessus — une pelleteuse ne devient pas traversable parce que
  // son bras bouge. Valeurs volontairement identiques aux statiques.
  prop_s2_excavator_work: { collide: 'both', shape: { kind: 'circle', r: 56 } },
  prop_s2_excavator_move: { collide: 'both', shape: { kind: 'circle', r: 56 } },
  prop_s2_truck_work: { collide: 'both', shape: { kind: 'circle', r: 48 } },
  prop_s2_truck_move: { collide: 'both', shape: { kind: 'circle', r: 48 } },
  prop_s2_dozer_work: { collide: 'both', shape: { kind: 'circle', r: 48 } },
  prop_s2_dozer_move: { collide: 'both', shape: { kind: 'circle', r: 48 } },
  // Stage 03 — fondations
  struct_stage03_mixer: { collide: 'both', shape: { kind: 'circle', r: 52 } }, // toupie
  struct_stage03_mixer_work: { collide: 'both', shape: { kind: 'circle', r: 52 } },
  struct_stage03_pump: { collide: 'both', shape: { kind: 'circle', r: 46 } }, // pompe à béton
  prop_stage03_concrete_mixer: { collide: 'both', shape: { kind: 'circle', r: 38 } }, // bétonnière
  prop_stage03_concrete_mixer_work: { collide: 'both', shape: { kind: 'circle', r: 38 } },
  // Stage 04 — réseaux enterrés
  struct_stage04_excavator: { collide: 'both', shape: { kind: 'circle', r: 50 } }, // mini-pelle
  struct_stage04_excavator_work: { collide: 'both', shape: { kind: 'circle', r: 50 } },
  struct_stage04_excavator_move: { collide: 'both', shape: { kind: 'circle', r: 50 } },
  // ⚠️ LE NOM MENT : `trencher.png` n'est PAS une trancheuse, c'est un TOURET DE
  // TUYAU rouge posé au sol (vérifié en ouvrant le PNG). Il était déclaré solide
  // r40 — un flexible bloquait le joueur comme un mur. Faute commise dans le lot
  // même qui posait la règle « déclare, ne déduis pas » : j'ai déduit du nom.
  // Un tuyau au sol, on marche dessus.
  prop_stage04_trencher: { collide: 'none' },
  // Stage 05 — gros œuvre
  struct_stage05_crane: { collide: 'both', shape: { kind: 'circle', r: 60 } }, // grue à tour
  struct_stage05_crane_work: { collide: 'both', shape: { kind: 'circle', r: 60 } },
  struct_stage05_mixer: { collide: 'both', shape: { kind: 'circle', r: 52 } }, // toupie (cf. stages.ts)
  struct_stage05_mixer_work: { collide: 'both', shape: { kind: 'circle', r: 52 } },
  // Stage 06 — échafaudages
  struct_stage06_nacelle: { collide: 'both', shape: { kind: 'circle', r: 46 } }, // nacelle
  struct_stage06_nacelle_work: { collide: 'both', shape: { kind: 'circle', r: 46 } },
  // Stage 07 — charpente
  struct_stage07_crane: { collide: 'both', shape: { kind: 'circle', r: 52 } }, // camion-grue
  struct_stage07_crane_work: { collide: 'both', shape: { kind: 'circle', r: 52 } },
  // Stage 08 — second œuvre
  struct_stage08_van: { collide: 'both', shape: { kind: 'circle', r: 46 } }, // fourgon artisan
  // Stage 10 — livraison / audit
  struct_stage10_van: { collide: 'both', shape: { kind: 'circle', r: 46 } }, // fourgon d'inspection

  // ── PACK « PALETTE » (décor partagé, `public/palette/*`) ───────────────────
  // Règle appliquée, la même que ci-dessus : on DÉCLARE ce qui est un corps
  // physique — véhicule, machine, volume habitable, barrière, masse de béton —
  // et on laisse traversable tout ce qu'un ouvrier enjambe ou écrase (herbe,
  // feuilles, sacs, marquages au sol).
  //
  // ⚠️ Le silence est une DÉCISION, pas un oubli : les arbres du jeu
  // (`prop_stage01_tree_a/b`) ne sont PAS déclarés, donc traversables. Rendre les
  // arbres du pack solides créerait deux arbres au comportement opposé dans la
  // même palette. On garde la cohérence ; si la décision produit doit changer,
  // elle doit changer pour TOUS les arbres, ici, en un seul endroit.

  // Engins & machines — corps lourds, ils arrêtent joueur ET ennemis.
  pal_van: { collide: 'both', shape: { kind: 'circle', r: 50 } }, // camionnette
  pal_site_dumper: { collide: 'both', shape: { kind: 'circle', r: 46 } }, // dumper
  pal_forklift: { collide: 'both', shape: { kind: 'circle', r: 42 } }, // chariot élévateur
  pal_plant_trailer: { collide: 'both', shape: { kind: 'circle', r: 44 } }, // remorque
  pal_generator: { collide: 'both', shape: { kind: 'circle', r: 32 } }, // groupe électrogène
  pal_air_compressor: { collide: 'both', shape: { kind: 'circle', r: 34 } }, // compresseur
  pal_water_tank: { collide: 'both', shape: { kind: 'circle', r: 40 } }, // citerne

  // Volumes habitables — un bungalow n'est pas un décor qu'on traverse.
  pal_site_office: { collide: 'both', shape: { kind: 'circle', r: 58 } },
  pal_site_canteen: { collide: 'both', shape: { kind: 'circle', r: 58 } },
  pal_site_changing_room: { collide: 'both', shape: { kind: 'circle', r: 56 } },
  pal_scaffold_bay: { collide: 'both', shape: { kind: 'circle', r: 40 } },
  pal_bus_shelter: { collide: 'both', shape: { kind: 'circle', r: 46 } },

  // Barrières — des MURS : un segment orienté, jamais un disque (cf. `fence_panel`).
  pal_jersey_barrier: { collide: 'both', shape: { kind: 'segment', x2: 120, y2: 0, thickness: 14 } }, // GBA
  pal_farm_fence: { collide: 'both', shape: { kind: 'segment', x2: 150, y2: 0, thickness: 8 } }, // clôture agricole

  // Masses de béton / mobilier scellé.
  pal_culvert_pipes: { collide: 'both', shape: { kind: 'circle', r: 40 } }, // buses béton
  pal_rubble_skip: { collide: 'both', shape: { kind: 'circle', r: 48 } }, // benne à gravats
  pal_electrical_cabinet: { collide: 'both', shape: { kind: 'circle', r: 24 } }, // coffret élec.
  pal_site_locker: { collide: 'both', shape: { kind: 'circle', r: 26 } } // armoire de chantier
}

/** Solidité DÉCLARÉE d'un asset, ou `undefined` s'il n'est pas déclaré. */
export function assetSolidity(key: string): Solidity | undefined {
  return ASSET_SOLIDITY[key]
}

/**
 * Solidité EFFECTIVE d'un élément posé. Ordre de priorité, du plus fort au plus
 * faible :
 *
 * 1. **La déclaration** (`ASSET_SOLIDITY`) — elle gagne toujours. C'est ce qui
 *    empêche deux chemins (ou deux clusters) de diverger sur la même clé. Si le
 *    placement a écrit une forme, elle est TRANSPORTÉE (une palissade garde son
 *    segment orienté) ; sinon la forme déclarée sert de défaut.
 * 2. **Ce que le placement a écrit**, s'il est solide — un asset non déclaré
 *    garde exactement le comportement d'aujourd'hui.
 * 3. **Le repli de l'appelant** (`fallback`) — ce qu'on fait quand PERSONNE n'a
 *    dit « solide » : heuristique de rôle de l'éditeur, etc. Absent ⇒ traversable.
 *
 * @param written ce que le placement (cluster / JSON de compo) a écrit.
 * @param fallback repli si l'asset n'est pas déclaré et que rien de solide n'est écrit.
 */
export function resolveSolidity(assetKey: string, written?: Solidity, fallback?: Solidity): Solidity {
  const writtenShape = written !== undefined && written.collide !== 'none' ? written.shape : undefined
  const declared = ASSET_SOLIDITY[assetKey]
  if (declared !== undefined) {
    if (declared.collide === 'none') {
      return NONE
    }
    return { collide: declared.collide, shape: writtenShape ?? declared.shape }
  }
  if (written !== undefined && written.collide !== 'none') {
    return written
  }
  return fallback ?? NONE
}
