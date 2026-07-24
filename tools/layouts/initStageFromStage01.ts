import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LayoutInstance, StageLayout } from '../../src/content/stageLayout'

export const BUILDING_PREFIX = 'obj_building_'

export function isPerimeterBuilding(instance: LayoutInstance): boolean {
  return instance.prefab.startsWith(BUILDING_PREFIX)
}

/**
 * Base géographique d'un nouveau stage composé.
 *
 * Seuls les invariants du stage 01 sont recopiés : monde, spawn, caméra et
 * couronne d'immeubles. Aucun plan de chantier, marqueur, PNJ ou chemin n'est
 * généré ici : l'éditeur reste la source de vérité de la composition.
 */
export function initialiseFromStage01(stage01: StageLayout, stage: string): StageLayout {
  return {
    schemaVersion: stage01.schemaVersion,
    stage,
    worldSize: structuredClone(stage01.worldSize),
    spawn: structuredClone(stage01.spawn),
    cameraPreview: structuredClone(stage01.cameraPreview),
    instances: stage01.instances.filter(isPerimeterBuilding).map((instance) => structuredClone(instance)),
    markers: [],
    paths: [],
    npcs: [],
    keepSitePlan: false,
  }
}

export const MANUAL_LAYOUT_SOURCE_OF_TRUTH =
  'Génération CLI désactivée : les stages 02-10 sont une source manuelle. Utiliser Charger un fichier dans le Stage Composer.'

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  throw new Error(MANUAL_LAYOUT_SOURCE_OF_TRUTH)
}
