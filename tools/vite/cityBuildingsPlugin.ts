/**
 * cityBuildingsPlugin — plugin Vite qui régénère le REGISTRE des immeubles de
 * bordure de carte à partir des fichiers présents dans `public/city/`.
 *
 * But : « déposer un PNG → il est dans l'anneau ». Aucune édition de code par
 * immeuble. Scanne `public/city/building_*.png` et (re)génère
 * `src/render/cityBuildings.generated.ts` (données statiques, pas d'import.meta.glob
 * → compatible tsx `npm run sim` + Vitest, comme composedLayouts).
 *
 * Libellés FR jolis via `LABEL_OVERRIDES` ci-dessous ; sinon nom de fichier
 * humanisé. `getCityBuildingLabel` est réexporté pour l'éditeur.
 */

import type { Plugin } from 'vite'
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CITY_DIR = join('public', 'city')
const OUT_FILE = join('src', 'render', 'cityBuildings.generated.ts')

/** Libellés FR par clé (nom de fichier sans .png). Absent ⇒ nom humanisé. */
export const LABEL_OVERRIDES: Record<string, string> = {
  building_office: 'Immeuble de bureau',
  building_apartment: "Immeuble d'habitation",
  building_tower: 'Tour de bureaux',
  building_warehouse: 'Entrepôt industriel',
  building_shops: 'Commerces de quartier',
  building_rowhouses: 'Maisons mitoyennes',
  building_parking: 'Parking à étages',
  building_factory: 'Usine en briques',
  building_hotel: 'Hôtel Art déco',
  building_lyon_bouchon: 'Bouchon lyonnais',
  building_lyon_canut: 'Immeuble de canuts (Croix-Rousse)',
  building_lyon_fourviere: 'Basilique de Fourvière',
  building_lyon_hotel_dieu: 'Grand Hôtel-Dieu',
  building_lyon_part_dieu: 'Tour Part-Dieu (le Crayon)',
  building_lyon_vieux_lyon: 'Vieux Lyon (traboules)',
  building_lyon_tower_incity: 'Tour Incity',
  building_lyon_tower_to_lyon: 'Tour To-Lyon',
  building_lyon_tower_part_dieu: 'Tour Part-Dieu (le Crayon)',
  building_lyon_tower_silex2: 'Tour Silex²',
  building_lyon_tower_oxygene: 'Tour Oxygène',
  building_lyon_tower_duchere: 'Tour panoramique de la Duchère',
  building_lyon_tower_fourviere_metal: 'Tour métallique de Fourvière',
  building_lyon_tower_swiss_life: 'Tour Swiss Life',
  building_lyon_tower_edf: 'Ancienne tour EDF',
  building_lyon_tower_circ: 'Tour du CIRC',
  building_lyon_traboule_tour_rose: 'Traboule de la Tour Rose',
  building_lyon_traboule_cour_voraces: 'Cour des Voraces',
  building_lyon_traboule_galleries: 'Galeries Renaissance',
  building_lyon_traboule_longue: 'Longue traboule du Vieux Lyon',
  building_lyon_traboule_avocats: 'Maison des Avocats',
  building_lyon_traboule_escalier: 'Escalier à vis Renaissance',
  building_lyon_mural_lyonnais: 'Fresque des Lyonnais',
  building_lyon_mural_canuts: 'Mur des Canuts',
  building_lyon_mural_bibliotheque: 'Bibliothèque de la Cité',
  building_lyon_block_quais: 'Façades colorées des quais',
  building_lyon_block_croix_rousse: 'Bloc coloré de la Croix-Rousse',
  building_lyon_block_vieux_lyon: 'Bloc coloré du Vieux Lyon',
  building_lyon_opera: 'Opéra de Lyon',
  building_lyon_gare_saint_exupery: 'Gare Lyon-Saint-Exupéry',
  building_lyon_palais_bourse: 'Palais de la Bourse',
  building_lyon_tchecoslovaques_76: '76 boulevard des Tchécoslovaques (ancien)'
}

function humanize(key: string): string {
  return key
    .replace(/^building_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const HEADER = `/**
 * cityBuildings.generated.ts — REGISTRE des immeubles de bordure de carte.
 *
 * ⚠️ FICHIER GÉNÉRÉ par tools/vite/cityBuildingsPlugin.ts (scan public/city/building_*.png).
 * Ne pas éditer à la main : déposer un PNG dans public/city/ suffit à l'ajouter à
 * l'anneau (+ la palette éditeur). Libellés FR via LABEL_OVERRIDES du plugin.
 */
`

/** Liste triée des immeubles présents (clé, fichier, libellé). */
export function scanCityBuildings(): { key: string; file: string; label: string }[] {
  if (!existsSync(CITY_DIR)) {
    return []
  }
  return readdirSync(CITY_DIR)
    .filter((f) => /^building_[a-z0-9_]+\.png$/i.test(f))
    .sort()
    .map((f) => {
      const key = f.replace(/\.png$/i, '')
      return { key, file: `city/${f}`, label: LABEL_OVERRIDES[key] ?? humanize(key) }
    })
}

/** Littéral de chaîne au style du repo : simple quote, sauf si la chaîne en contient une. */
function q(s: string): string {
  return s.includes("'") ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : `'${s}'`
}

/** (Re)génère le fichier registre, uniquement si le contenu a changé. */
export function regenerateCityBuildings(): void {
  const list = scanCityBuildings()
  const entries = list
    .map((b) => `  { key: '${b.key}', file: '${b.file}', label: ${q(b.label)} }`)
    .join(',\n')
  const body = `${HEADER}
export const CITY_BUILDINGS: { key: string; file: string; label: string }[] = [
${entries}
]
`
  const prev = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : ''
  if (prev !== body) {
    writeFileSync(OUT_FILE, body)
  }
}

export function cityBuildingsPlugin(): Plugin {
  return {
    name: 'city-buildings-registry',
    buildStart() {
      regenerateCityBuildings()
    }
  }
}
