import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import { composedStageIds } from '@content/composedLayouts'

/**
 * Garde anti-désynchronisation du REGISTRE de compos (`src/content/composedLayouts.ts`).
 *
 * Le piège : `regenerateRegistry()` (tools/vite/saveLayoutPlugin.ts) n'est appelé QUE
 * depuis le handler POST `/__save-layout` de l'éditeur. Aucun hook Vite, aucun watcher
 * ne le rejoue. Dès que `src/content/layouts/*.json` bouge autrement (git pull, clone
 * frais, ajout manuel), le registre reste périmé et la compo devient du CODE MORT —
 * silencieusement : `getComposedLayout` renvoie null et le jeu retombe en génératif
 * sans un mot d'erreur.
 *
 * ⚠️ Périmètre VOLONTAIREMENT restreint aux jsons SUIVIS PAR GIT.
 * Dans ce repo, `src/content/layouts/terrain_vierge.json` est un fichier de travail
 * LOCAL non suivi, et le registre est régénéré/restauré en permanence (`git checkout`
 * avant `sim:check`). La paire « json non suivi + registre vide » est donc l'état
 * NORMAL et attendu. Un test qui comparerait le DOSSIER au registre serait rouge en
 * permanence sur la machine de l'auteur — et un rouge permanent est un rouge qu'on
 * apprend à ignorer, donc pire que pas de test.
 *
 * Règle retenue :
 *   - json NON suivi  ⇒ fichier de travail local  ⇒ hors périmètre, aucun avis.
 *   - json SUIVI mais absent du registre ⇒ VRAIE désync ⇒ ROUGE légitime.
 *
 * L'autre sens (entrée du registre sans json) n'a pas besoin de garde : le registre
 * importe les json en statique, donc un json manquant casse déjà l'import du module.
 */

const LAYOUTS_DIR = 'src/content/layouts'

/** Ids des compos SUIVIES par git, ou `null` si git est indisponible (tarball, CI sans .git). */
function trackedLayoutIds(): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '--', LAYOUTS_DIR], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.json'))
      .map((p) => basename(p, '.json'))
      .sort()
  } catch {
    return null
  }
}

const tracked = trackedLayoutIds()

describe('composedLayouts — registre synchronisé avec les compos suivies par git', () => {
  it.skipIf(tracked === null)(
    'toute compo SUIVIE par git est déclarée dans le registre',
    () => {
      // `tracked === null` ⇒ test sauté (cf. skipIf) ; ce garde-fou est pour le typeur.
      const ids = tracked ?? []
      const registered = new Set(composedStageIds())
      const missing = ids.filter((id) => !registered.has(id))

      expect(
        missing,
        missing.length === 0
          ? ''
          : `Compo(s) suivie(s) par git absente(s) du registre : ${missing.join(', ')}.\n` +
            `=> src/content/composedLayouts.ts est PÉRIMÉ : ces compos sont du code mort ` +
            `(getComposedLayout renvoie null, le jeu retombe en génératif sans erreur).\n` +
            `Régénère le registre : lance \`npm run dev\`, ouvre l'éditeur (?editor=true) ` +
            `et re-sauve chaque stage concerné ("Sauver au repo"), ce qui rejoue ` +
            `regenerateRegistry() dans tools/vite/saveLayoutPlugin.ts.`
      ).toEqual([])
    }
  )

  it('le registre reste interrogeable sans compo (jeu génératif = défaut sain)', () => {
    // Non-régression du contrat : registre vide ⇒ null, jamais une exception.
    expect(composedStageIds()).toBeInstanceOf(Array)
  })
})
