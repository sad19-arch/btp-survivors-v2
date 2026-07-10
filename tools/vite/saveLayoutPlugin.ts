/**
 * saveLayoutPlugin — plugin Vite DEV (jamais en build prod) qui permet au Stage
 * Composer Editor de sauver une compo « au repo » en 1 clic.
 *
 * POST /__save-layout  body { stage, json }
 *   → écrit src/content/layouts/<stage>.json
 *   → régénère src/content/composedLayouts.ts (imports statiques des JSON présents ;
 *     pas d'import.meta.glob, pour rester compatible avec le harness tsx `npm run sim`).
 */

import type { Plugin } from 'vite'
import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const STAGES = new Set([
  'terrain_vierge',
  'terrassement',
  'fondations',
  'reseaux_enterres',
  'gros_oeuvre',
  'echafaudages',
  'charpente_toiture',
  'second_oeuvre',
  'finitions',
  'livraison_audit'
])

const CONTENT_DIR = join('src', 'content')
const LAYOUTS_DIR = join(CONTENT_DIR, 'layouts')
const REGISTRY_FILE = join(CONTENT_DIR, 'composedLayouts.ts')

const HEADER = `/**
 * composedLayouts — REGISTRE des compositions du Stage Composer Editor,
 * committées sous src/content/layouts/*.json.
 *
 * ⚠️ FICHIER GÉNÉRÉ par tools/vite/saveLayoutPlugin.ts à chaque « Sauver au repo ».
 * Ne pas éditer à la main. Imports statiques (pas d'import.meta.glob → tsx-safe).
 * Registre vide ⇒ getComposedLayout renvoie null ⇒ jeu génératif + sim:check diff 0.
 */

import type { StageLayout } from './stageLayout'
`

function regenerateRegistry(): void {
  const files = existsSync(LAYOUTS_DIR)
    ? readdirSync(LAYOUTS_DIR).filter((f) => f.endsWith('.json')).sort()
    : []
  const imports = files.map((f, i) => `import l${i} from './layouts/${f}'`).join('\n')
  const entries = files
    .map((f, i) => `  '${f.replace(/\.json$/, '')}': l${i} as unknown as StageLayout`)
    .join(',\n')
  const registry = entries === '' ? '{}' : `{\n${entries}\n}`
  const body = `${HEADER}${imports === '' ? '' : imports + '\n'}
const REGISTRY: Record<string, StageLayout> = ${registry}

/** Compo committée d'un stage, ou null si aucune (le jeu reste génératif). */
export function getComposedLayout(stageId: string): StageLayout | null {
  return REGISTRY[stageId] ?? null
}

/** Ids des stages ayant une compo committée (diagnostic / tests). */
export function composedStageIds(): string[] {
  return Object.keys(REGISTRY)
}
`
  writeFileSync(REGISTRY_FILE, body)
}

export function saveLayoutPlugin(): Plugin {
  return {
    name: 'stage-composer-save-layout',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-layout', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }
        let raw = ''
        req.on('data', (c) => {
          raw += String(c)
        })
        req.on('end', () => {
          try {
            const parsed = JSON.parse(raw) as { stage?: unknown; json?: unknown }
            const stage = parsed.stage
            const json = parsed.json
            if (typeof stage !== 'string' || !STAGES.has(stage)) {
              res.statusCode = 400
              res.end('stage invalide')
              return
            }
            if (typeof json !== 'string') {
              res.statusCode = 400
              res.end('json manquant')
              return
            }
            JSON.parse(json) // valide la forme
            mkdirSync(LAYOUTS_DIR, { recursive: true })
            writeFileSync(join(LAYOUTS_DIR, `${stage}.json`), json)
            regenerateRegistry()
            res.statusCode = 200
            res.end(`ok: ${stage}`)
          } catch (e) {
            res.statusCode = 400
            res.end(`erreur: ${e instanceof Error ? e.message : String(e)}`)
          }
        })
      })
    }
  }
}
