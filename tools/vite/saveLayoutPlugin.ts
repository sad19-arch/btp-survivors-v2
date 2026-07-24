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

const CANONICAL_ZONE_TYPES = [
  'signature_zone',
  'zone_access',
  'zone_storage',
  'zone_secondary',
  'zone_atmosphere'
] as const

/** Valide le contenu du layout avant toute écriture au dépôt. */
export function validateSaveLayoutRequest(stage: string, json: string): string | null {
  let layout: unknown
  try {
    layout = JSON.parse(json)
  } catch {
    return 'JSON invalide'
  }
  if (typeof layout !== 'object' || layout === null || Array.isArray(layout)) {
    return 'JSON invalide'
  }
  const record = layout as { stage?: unknown; markers?: unknown }
  if (record.stage !== stage) {
    return 'stage JSON incohérent'
  }
  if (!Array.isArray(record.markers)) {
    return 'zones canoniques invalides'
  }
  const types = record.markers.map((marker) =>
    typeof marker === 'object' && marker !== null ? (marker as { type?: unknown }).type : undefined
  )
  const hasCanonicalZonesExactlyOnce = CANONICAL_ZONE_TYPES.every(
    (type) => types.filter((candidate) => candidate === type).length === 1
  )
  return hasCanonicalZonesExactlyOnce ? null : 'zones canoniques invalides'
}

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

/**
 * ⚠️ N'APPELEZ PAS CECI DEPUIS UN HOOK `buildStart` / `watchChange`. La proposition
 * revient naturellement — « regenerateRegistry() n'est appelé QUE depuis POST
 * /__save-layout, donc un json qui bouge autrement (git pull, checkout) laisse le
 * registre périmé ; un hook supprimerait la classe de bug ». Étudié et ÉCARTÉ le
 * 2026-07-17, sur mesures :
 *
 * 1. LE HOOK SALIRAIT UN FICHIER SUIVI À CHAQUE DEV/BUILD. `regenerateRegistry`
 *    scanne le DOSSIER (`readdirSync`), sans aucune notion de git. Or ce dépôt a un
 *    `src/content/layouts/terrain_vierge.json` NON SUIVI (fichier de travail de
 *    l'utilisateur), tandis que `composedLayouts.ts` EST suivi et committé VIDE (`{}`).
 *    Mesuré : le hook y écrirait `{ terrain_vierge }`. À chaque `npm run dev` ET
 *    chaque `npm run build` — or `build` est un gate, et le webServer Playwright
 *    lance `dev`. Chaque gate salirait l'arbre, contre la routine documentée
 *    (`git checkout -- composedLayouts.ts` avant `sim:check`), et rapprocherait d'un
 *    commit accidentel d'un fichier explicitement interdit au commit.
 * 2. IL CRÉERAIT UNE NOUVELLE CLASSE DE BUG : écrire un fichier source pendant le dev
 *    déclenche un rechargement HMR complet → « Execution context was destroyed » en e2e.
 * 3. IL NE FERMERAIT AUCUN CHEMIN SILENCIEUX — le seul argument qui le justifiait.
 *    Le registre importe les json en STATIQUE (`import l0 from './layouts/x.json'`),
 *    donc leur CONTENU n'est jamais périmé : seul l'ENSEMBLE DES CLÉS peut désyncher,
 *    et ses deux sens crient déjà (vérifiés par mutation) :
 *      · json SUPPRIMÉ, encore dans le registre → l'import statique casse le build
 *        (tsc TS2307 « Cannot find module './layouts/json_disparu.json' »).
 *      · json AJOUTÉ et absent du registre → ROUGE de la garde
 *        `tests/unit/composedLayoutsRegistry.test.ts` (« Compo(s) suivie(s) par git
 *        absente(s) du registre »), avec la marche à suivre.
 *
 * Un hook « corrigerait » donc en mutant l'arbre dans le dos du développeur ce que la
 * garde signale déjà au bon moment (revue/CI). Committer une compo exige de committer
 * le registre régénéré : c'est une décision humaine, pas un effet de bord de build.
 */
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
            const validationError = validateSaveLayoutRequest(stage, json)
            if (validationError !== null) {
              res.statusCode = 400
              res.end(validationError)
              return
            }
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
