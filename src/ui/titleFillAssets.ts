/**
 * Pool d'assets qui tombent sur l'écran titre (décor « sablier »). Données pures —
 * chemins relatifs à `import.meta.env.BASE_URL` (le contrôleur préfixe). Tous ces
 * fichiers existent déjà dans `public/` (vérifié par `titleFillAssets.test.ts`).
 *
 * `aspect` = largeur/hauteur de l'IMAGE AFFICHÉE. Pour une feuille d'animation
 * (`frame`), c'est l'aspect d'UNE frame (les persos/ennemis sont des cellules
 * carrées 192×192 → aspect 1). Le contrôleur crope la frame 0 (« down », coin
 * haut-gauche) via `background-size`/`background-position`.
 */

import type { Weighted } from './titleFillModel'

export interface DropDef extends Weighted {
  /** Chemin relatif à BASE_URL (sans slash de tête). */
  src: string
  /** largeur/hauteur de l'image affichée (aspect d'une frame si `frame`). */
  aspect: number
  /** Grille de la feuille si l'asset est un spritesheet (sinon image mono-frame). */
  frame?: { cols: number; rows: number }
}

/** Feuilles perso/ennemi 4×4 (down/right/up/left) → frame 0 « down ». */
const SHEET_4x4 = { cols: 4, rows: 4 } as const

export const DROP_POOL: readonly DropDef[] = [
  // ── GROS ENGINS DE CHANTIER (mis en avant — poids fort) ─────────────────────
  // Sprites d'engins réels du jeu (stageXX/props), mono-frame sauf indication.
  { src: 'stage02/props/excavator.png', aspect: 1.09, weight: 2.6 }, // pelleteuse
  { src: 'stage02/props/bulldozer.png', aspect: 1.33, weight: 2.4 },
  { src: 'stage02/props/dump_truck.png', aspect: 1.2, weight: 2.4 }, // camion benne
  { src: 'stage02/props/road_roller.png', aspect: 1.22, weight: 2.4 }, // rouleau compresseur
  { src: 'shared/camion_benne_walk.png', aspect: 1, frame: SHEET_4x4, weight: 2.4 }, // camion de gravats
  { src: 'stage03/props/mixer_truck.png', aspect: 1.5, weight: 2.2 }, // toupie
  { src: 'stage03/props/concrete_mixer.png', aspect: 1.0, weight: 1.8 },
  { src: 'stage04/props/mini_excavator.png', aspect: 1.0, weight: 2.2 }, // mini-pelle
  { src: 'stage05/props/mobile_crane.png', aspect: 1.17, weight: 2.0 }, // grue mobile
  { src: 'stage05/props/tower_crane.png', aspect: 1.0, weight: 1.8 }, // grue à tour
  { src: 'stage07/props/crane_truck.png', aspect: 1.7, weight: 2.0 }, // camion-grue
  { src: 'stage09/props/roller.png', aspect: 1.0, weight: 1.8 },
  { src: 'stage10/props/inspection_van.png', aspect: 1.0, weight: 1.6 },
  // ── Engins & gros matériel (palette générique) ──────────────────────────────
  { src: 'palette/props/forklift.png', aspect: 0.86, weight: 1.4 },
  { src: 'palette/props/van.png', aspect: 1.31, weight: 1.4 },
  { src: 'palette/props/site_dumper.png', aspect: 1.33, weight: 1.4 },
  { src: 'palette/props/plant_trailer.png', aspect: 1.43, weight: 1.2 },
  { src: 'palette/props/generator.png', aspect: 1.02, weight: 1.2 },
  { src: 'palette/props/water_tank.png', aspect: 1.23, weight: 1.1 },
  { src: 'palette/props/air_compressor.png', aspect: 1.15, weight: 1.1 },
  { src: 'palette/props/electrical_cabinet.png', aspect: 0.71, weight: 1.0 },
  { src: 'palette/props/rubble_skip.png', aspect: 1.5, weight: 1.1 },
  // ── Matériaux & équipements ────────────────────────────────────────────────
  { src: 'palette/props/big_bag.png', aspect: 0.94 },
  { src: 'palette/props/block_pallet.png', aspect: 1.25 },
  { src: 'palette/props/cement_bags.png', aspect: 1.22 },
  { src: 'palette/props/concrete_foot.png', aspect: 1.2 },
  { src: 'palette/props/culvert_pipes.png', aspect: 1.64 },
  { src: 'palette/props/duct_coil.png', aspect: 1.51 },
  { src: 'palette/props/pvc_pipes.png', aspect: 1.26 },
  { src: 'palette/props/gravel_pile.png', aspect: 1.4 },
  { src: 'palette/props/sand_pile.png', aspect: 1.52 },
  { src: 'palette/props/steel_road_plate.png', aspect: 1.5 },
  { src: 'palette/props/jersey_barrier.png', aspect: 2.84, weight: 0.8 },
  { src: 'palette/props/bollards.png', aspect: 1.65, weight: 0.8 },
  { src: 'palette/props/farm_fence.png', aspect: 1.76, weight: 0.7 },
  { src: 'palette/props/trestles.png', aspect: 1.3 },
  { src: 'palette/props/step_ladder.png', aspect: 0.73 },
  { src: 'palette/props/site_locker.png', aspect: 0.83 },
  { src: 'palette/props/notice_board.png', aspect: 0.83, weight: 0.7 },
  { src: 'palette/props/bench.png', aspect: 1.16, weight: 0.7 },
  { src: 'palette/props/planter.png', aspect: 1.1, weight: 0.7 },
  { src: 'palette/props/embankment.png', aspect: 1.7, weight: 0.7 },
  { src: 'palette/props/litter_bin.png', aspect: 0.68, weight: 0.6 },
  { src: 'palette/props/fire_hydrant.png', aspect: 0.61, weight: 0.5 },
  // ── Nature / décor (moins fréquents) ───────────────────────────────────────
  { src: 'palette/props/tree_pine.png', aspect: 0.72, weight: 0.6 },
  { src: 'palette/props/tree_dead.png', aspect: 0.64, weight: 0.5 },
  { src: 'palette/props/hedge.png', aspect: 1.53, weight: 0.5 },
  { src: 'palette/props/flower_bed.png', aspect: 1.45, weight: 0.5 },
  { src: 'palette/props/tall_grass.png', aspect: 0.9, weight: 0.4 },
  { src: 'palette/props/stump.png', aspect: 1.22, weight: 0.4 },
  { src: 'palette/props/leaf_pile.png', aspect: 1.5, weight: 0.4 },
  // ── Personnages jouables (feuilles 4×4) ────────────────────────────────────
  { src: 'player_j1.png', aspect: 1, frame: SHEET_4x4, weight: 1.3 },
  { src: 'player_terrassier.png', aspect: 1, frame: SHEET_4x4, weight: 1.2 },
  { src: 'player_soudeur.png', aspect: 1, frame: SHEET_4x4, weight: 1.2 },
  { src: 'player_macon.png', aspect: 1, frame: SHEET_4x4, weight: 1.2 },
  { src: 'player_electricien.png', aspect: 1, frame: SHEET_4x4, weight: 1.2 },
  { src: 'player_plombier.png', aspect: 1, frame: SHEET_4x4, weight: 1.2 },
  { src: 'player_charpentier.png', aspect: 1, frame: SHEET_4x4, weight: 1.2 },
  { src: 'player_grutier.png', aspect: 1, frame: SHEET_4x4, weight: 1.2 },
  { src: 'player_ouvriere.png', aspect: 1, frame: SHEET_4x4, weight: 1.2 },
  { src: 'player_samoyede.png', aspect: 1, frame: SHEET_4x4, weight: 1.0 },
  // ── PNJ ouvriers (feuilles 4×4) ────────────────────────────────────────────
  { src: 'stage01/npc/ouvrier_zinedine_walk.png', aspect: 1, frame: SHEET_4x4, weight: 1.1 },
  { src: 'stage01/npc/ouvrier_marius_walk.png', aspect: 1, frame: SHEET_4x4, weight: 1.1 },
  { src: 'stage01/npc/ouvrier_erling_walk.png', aspect: 1, frame: SHEET_4x4, weight: 1.1 },
  { src: 'stage01/npc/prisoner_walk.png', aspect: 1, frame: { cols: 4, rows: 1 }, weight: 0.7 },
  // ── Ennemis (feuilles 4×4) ─────────────────────────────────────────────────
  { src: 'stage01/enemies/brute_walk.png', aspect: 1, frame: SHEET_4x4, weight: 1.0 },
  { src: 'stage01/enemies/imp_walk.png', aspect: 1, frame: SHEET_4x4, weight: 1.0 },
  { src: 'stage01/enemies/motton_walk.png', aspect: 1, frame: SHEET_4x4, weight: 1.0 },
  { src: 'stage01/enemies/mudling_walk.png', aspect: 1, frame: SHEET_4x4, weight: 1.0 },
  { src: 'stage01/enemies/enracineur_walk.png', aspect: 1, frame: SHEET_4x4, weight: 0.9 },
  // ── Coffres & pickups (rares, clins d'œil) ─────────────────────────────────
  { src: 'shared/chest/chest_gold_closed.png', aspect: 1, weight: 0.35 },
  { src: 'shared/chest/chest_super_closed.png', aspect: 1, weight: 0.25 },
  { src: 'stage01/pickups/health.png', aspect: 1, weight: 0.45 },
  { src: 'stage01/pickups/magnet.png', aspect: 1.03, weight: 0.35 }
]
