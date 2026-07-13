/**
 * Stages édités par le JOUEUR, persistés en localStorage (`btp:userLayouts`) —
 * couche app/UI (impure), comme [[metaProgress]]. C'est la sauvegarde JOUABLE du
 * jeu final : l'éditeur y écrit (`saveUserLayout`), le boot les réinjecte dans la
 * sim via `setRuntimeLayout` (cf. `src/content/runtimeLayouts.ts`), et le jeu joue
 * alors le stage édité. Stockage = map `{ stageId: serializedLayout }` (chaînes
 * JSON de layout). Robuste aux environnements sans localStorage (test/SSR).
 */
const KEY = 'btp:userLayouts'

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) {
      return {}
    }
    const obj = JSON.parse(raw) as unknown
    return typeof obj === 'object' && obj !== null ? (obj as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // no-op : pas de localStorage → la sauvegarde est simplement absente.
  }
}

/** Enregistre (ou remplace) le layout édité d'un stage. `layoutJson` = chaîne JSON de StageLayout. */
export function saveUserLayout(stage: string, layoutJson: string): void {
  const map = readAll()
  map[stage] = layoutJson
  writeAll(map)
}

/** Layout édité d'un stage, ou `null` si aucun. */
export function getUserLayout(stage: string): string | null {
  return readAll()[stage] ?? null
}

/** Ids des stages ayant un layout édité sauvé. */
export function listUserLayouts(): string[] {
  return Object.keys(readAll())
}

/** Supprime le layout édité d'un stage (revient au niveau généré/committé). */
export function deleteUserLayout(stage: string): void {
  const map = readAll()
  if (stage in map) {
    delete map[stage]
    writeAll(map)
  }
}
