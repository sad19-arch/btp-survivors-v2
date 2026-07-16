/**
 * Tableaux de HIGH SCORES **par stage** (top 20), persistés en localStorage.
 * Couche UI/impure (comme [[settings]] audio) : clé versionnée, validation
 * champ par champ après `JSON.parse` (repli sur `[]`/no-op si stockage
 * absent/corrompu). N'affecte JAMAIS la sim. Un run sur `terrain_vierge` et un
 * run sur `terrassement` sont incomparables → un classement par stage, pas un
 * classement global.
 */

export interface HiScoreEntry {
  name: string
  score: number
  kills: number
  elapsedMs: number
  level: number
}

const STORAGE_KEY = 'btp:hiscores_v1'
const MAX_ENTRIES = 20
const NAME_MAX_LEN = 8

/** Retire les caractères de contrôle (incl. retours à la ligne) et tronque à 8 caractères. */
function sanitizeName(raw: string): string {
  let out = ''
  for (const ch of raw) {
    if (out.length >= NAME_MAX_LEN) {
      break
    }
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) {
      out += ch
    }
  }
  return out
}

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/** Valide un item lu depuis le JSON stocké ; `null` si le champ manque/est du mauvais type. */
function parseEntry(raw: unknown): HiScoreEntry | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const p = raw as Record<string, unknown>
  if (typeof p.name !== 'string') {
    return null
  }
  if (!isFiniteNonNegative(p.score) || !isFiniteNonNegative(p.kills) ||
      !isFiniteNonNegative(p.elapsedMs) || !isFiniteNonNegative(p.level)) {
    return null
  }
  return {
    name: sanitizeName(p.name),
    score: Math.floor(p.score),
    kills: Math.floor(p.kills),
    elapsedMs: Math.floor(p.elapsedMs),
    level: Math.floor(p.level)
  }
}

/** Assainit une entrée fraîche (déjà typée) avant insertion/persistance. */
function normalizeEntry(entry: HiScoreEntry): HiScoreEntry {
  return {
    name: sanitizeName(entry.name),
    score: Math.max(0, Math.floor(entry.score)),
    kills: Math.max(0, Math.floor(entry.kills)),
    elapsedMs: Math.max(0, Math.floor(entry.elapsedMs)),
    level: Math.max(0, Math.floor(entry.level))
  }
}

function readAll(): Record<string, HiScoreEntry[]> {
  try {
    if (typeof localStorage === 'undefined') {
      return {}
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return {}
    }
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }
    const result: Record<string, HiScoreEntry[]> = {}
    for (const [stageId, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) {
        continue
      }
      const entries: HiScoreEntry[] = []
      for (const item of list) {
        const parsedEntry = parseEntry(item)
        if (parsedEntry !== null) {
          entries.push(parsedEntry)
        }
      }
      result[stageId] = entries.slice(0, MAX_ENTRIES)
    }
    return result
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, HiScoreEntry[]>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    }
  } catch {
    /* stockage indisponible : on ignore silencieusement */
  }
}

/** Liste triée (score décroissant) des high scores d'un stage, ≤ 20 entrées. */
export function readHiScores(stageId: string): HiScoreEntry[] {
  return readAll()[stageId] ?? []
}

/** true si la liste a < 20 entrées OU si `score` bat strictement la 20e. */
export function qualifies(stageId: string, score: number): boolean {
  const list = readHiScores(stageId)
  if (list.length < MAX_ENTRIES) {
    return true
  }
  const last = list[MAX_ENTRIES - 1]
  return last !== undefined && score > last.score
}

/**
 * Insère `entry` dans le classement du stage et persiste. Renvoie le rang
 * 0-19 obtenu, ou -1 si `entry.score` ne qualifie pas (rien n'est persisté
 * dans ce cas).
 */
export function insertHiScore(stageId: string, entry: HiScoreEntry): number {
  if (!qualifies(stageId, entry.score)) {
    return -1
  }
  const map = readAll()
  const list = map[stageId] ?? []
  const normalized = normalizeEntry(entry)
  list.push(normalized)
  list.sort((a, b) => b.score - a.score)
  const truncated = list.slice(0, MAX_ENTRIES)
  map[stageId] = truncated
  writeAll(map)
  return truncated.indexOf(normalized)
}
