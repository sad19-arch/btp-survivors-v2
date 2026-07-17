import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ACHIEVEMENTS, evaluateAchievements } from '@content/achievements'
import type { AchievementProgress } from '@content/achievements'
import { ConstructionPhaseId } from '@content/phases'

const PUBLIC_DIR = resolve(__dirname, '../../public')

/** Profil vierge — aucun succès ne doit se déclencher dessus. */
const ZERO: AchievementProgress = {
  kills: 0,
  bossKills: 0,
  chestsOpened: 0,
  weaponEvolutions: 0,
  prisonersFreed: 0,
  stagesCompleted: 0,
  bestSurvivalMs: 0,
  bestLevel: 0,
}

const at = (patch: Partial<AchievementProgress>): AchievementProgress => ({ ...ZERO, ...patch })

/** Récupère une def par id, en échouant explicitement si l'id disparaît. */
function def(id: string) {
  const d = ACHIEVEMENTS.find((a) => a.id === id)
  if (d === undefined) {
    throw new Error(`Succès '${id}' introuvable — id renommé ? (les ids sont des clés de persistance)`)
  }
  return d
}

// ---------------------------------------------------------------------------
// Intégrité du catalogue
// ---------------------------------------------------------------------------
describe('ACHIEVEMENTS — intégrité du catalogue', () => {
  it('expose au moins les 10 succès du socle', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10)
  })

  it('a des ids UNIQUES (deux ids identiques corrompraient l’état sauvegardé)', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a un label ET une description non vides pour chaque succès', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.label.trim(), `label vide pour '${a.id}'`).not.toBe('')
      expect(a.description.trim(), `description vide pour '${a.id}'`).not.toBe('')
    }
  })

  it('n’utilise aucun emoji dans les textes affichés (règle DA)', () => {
    // \p{Extended_Pictographic} couvre les emojis sans toucher aux accents FR.
    const emoji = /\p{Extended_Pictographic}/u
    for (const a of ACHIEVEMENTS) {
      expect(emoji.test(a.label), `emoji dans le label de '${a.id}'`).toBe(false)
      expect(emoji.test(a.description), `emoji dans la description de '${a.id}'`).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Icônes : le fichier doit EXISTER sur le disque (attrape une clé fantôme)
// ---------------------------------------------------------------------------
describe('ACHIEVEMENTS — icônes', () => {
  it('référence uniquement des fichiers présents dans public/', () => {
    for (const a of ACHIEVEMENTS) {
      if (a.icon === undefined) {
        continue
      }
      const full = resolve(PUBLIC_DIR, a.icon)
      expect(existsSync(full), `icône fantôme pour '${a.id}' : public/${a.icon} n'existe pas`).toBe(
        true
      )
    }
  })

  it('déclare des chemins relatifs à public/ (ni absolus, ni préfixés d’un slash)', () => {
    for (const a of ACHIEVEMENTS) {
      if (a.icon === undefined) {
        continue
      }
      expect(a.icon.startsWith('/'), `'${a.id}' : chemin absolu interdit`).toBe(false)
      expect(a.icon.endsWith('.png'), `'${a.id}' : icône attendue en .png`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Indépendance vis-à-vis des stages (consigne utilisateur : ils ne bougent pas)
// ---------------------------------------------------------------------------
describe('ACHIEVEMENTS — aucun succès ne dépend d’un stage précis', () => {
  it('ne nomme aucune phase de chantier dans les ids/labels/descriptions', () => {
    const phaseIds = Object.values(ConstructionPhaseId)
    for (const a of ACHIEVEMENTS) {
      // NB : `icon` est volontairement exclu — 'stage01/ui/...' est un chemin
      // d'asset partagé, pas une dépendance de gameplay à la phase 01.
      const haystack = `${a.id} ${a.label} ${a.description}`.toLowerCase()
      for (const pid of phaseIds) {
        expect(haystack.includes(pid), `'${a.id}' nomme la phase '${pid}'`).toBe(false)
      }
    }
  })

  it('se décide uniquement à partir des compteurs de AchievementProgress', () => {
    // Preuve structurelle : pour chaque succès il existe un profil (fait des seuls
    // compteurs) qui le verrouille et un autre qui le déverrouille. Aucun stageId
    // n'entre dans la décision — `AchievementProgress` n'en porte pas.
    const maxed: AchievementProgress = {
      kills: 1_000_000,
      bossKills: 1_000,
      chestsOpened: 1_000,
      weaponEvolutions: 1_000,
      prisonersFreed: 1_000,
      stagesCompleted: 1_000,
      bestSurvivalMs: 60 * 60 * 1000,
      bestLevel: 999,
    }
    for (const a of ACHIEVEMENTS) {
      expect(a.test(ZERO), `'${a.id}' se déclenche sur un profil vierge`).toBe(false)
      expect(a.test(maxed), `'${a.id}' ne se déclenche jamais`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Seuils : on teste les BORNES, pas le milieu
// ---------------------------------------------------------------------------
describe('ACHIEVEMENTS — seuils exacts', () => {
  it('kills_100 : 99 non, 100 oui', () => {
    expect(def('kills_100').test(at({ kills: 99 }))).toBe(false)
    expect(def('kills_100').test(at({ kills: 100 }))).toBe(true)
  })

  it('kills_1000 : 999 non, 1000 oui', () => {
    expect(def('kills_1000').test(at({ kills: 999 }))).toBe(false)
    expect(def('kills_1000').test(at({ kills: 1000 }))).toBe(true)
  })

  it('survie_10min : 9:59.999 non, 10:00 oui', () => {
    expect(def('survie_10min').test(at({ bestSurvivalMs: 599_999 }))).toBe(false)
    expect(def('survie_10min').test(at({ bestSurvivalMs: 600_000 }))).toBe(true)
  })

  it('niveau_20 : niveau 19 non, niveau 20 oui', () => {
    expect(def('niveau_20').test(at({ bestLevel: 19 }))).toBe(false)
    expect(def('niveau_20').test(at({ bestLevel: 20 }))).toBe(true)
  })

  it('livraisons_3 : 2 chantiers non, 3 oui', () => {
    expect(def('livraisons_3').test(at({ stagesCompleted: 2 }))).toBe(false)
    expect(def('livraisons_3').test(at({ stagesCompleted: 3 }))).toBe(true)
  })

  it('premier_boss : 0 non, 1 oui', () => {
    expect(def('premier_boss').test(at({ bossKills: 0 }))).toBe(false)
    expect(def('premier_boss').test(at({ bossKills: 1 }))).toBe(true)
  })

  it('coffre_ouvert : 0 non, 1 oui', () => {
    expect(def('coffre_ouvert').test(at({ chestsOpened: 0 }))).toBe(false)
    expect(def('coffre_ouvert').test(at({ chestsOpened: 1 }))).toBe(true)
  })

  it('evolution_arme : 0 non, 1 oui', () => {
    expect(def('evolution_arme').test(at({ weaponEvolutions: 0 }))).toBe(false)
    expect(def('evolution_arme').test(at({ weaponEvolutions: 1 }))).toBe(true)
  })

  it('prisonnier_libere : 0 non, 1 oui', () => {
    expect(def('prisonnier_libere').test(at({ prisonersFreed: 0 }))).toBe(false)
    expect(def('prisonnier_libere').test(at({ prisonersFreed: 1 }))).toBe(true)
  })

  it('stage_livre : 0 non, 1 oui', () => {
    expect(def('stage_livre').test(at({ stagesCompleted: 0 }))).toBe(false)
    expect(def('stage_livre').test(at({ stagesCompleted: 1 }))).toBe(true)
  })

  it('chaque succès a un test indépendant des AUTRES compteurs', () => {
    // Un profil qui ne remplit QUE 'kills' ne doit pas débloquer un succès de coffre.
    const onlyKills = at({ kills: 1_000_000 })
    expect(def('coffre_ouvert').test(onlyKills)).toBe(false)
    expect(def('premier_boss').test(onlyKills)).toBe(false)
    expect(def('stage_livre').test(onlyKills)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateAchievements
// ---------------------------------------------------------------------------
describe('evaluateAchievements', () => {
  it('retourne les ids nouvellement débloqués', () => {
    const newly = evaluateAchievements(at({ kills: 100 }), new Set())
    expect(newly).toContain('kills_100')
    expect(newly).not.toContain('kills_1000')
  })

  it('ne retourne JAMAIS un succès déjà débloqué (sinon le toast se rejoue en boucle)', () => {
    const p = at({ kills: 1000 })
    const first = evaluateAchievements(p, new Set())
    expect(first).toContain('kills_100')
    expect(first).toContain('kills_1000')

    // Deuxième passe avec tout ce qui vient d'être acquis → plus rien de neuf.
    const second = evaluateAchievements(p, new Set(first))
    expect(second).toEqual([])
  })

  it('n’émet un succès qu’une fois même si la progression continue de monter', () => {
    const unlocked = new Set(evaluateAchievements(at({ kills: 100 }), new Set()))
    const later = evaluateAchievements(at({ kills: 5000 }), unlocked)
    expect(later).not.toContain('kills_100')
    expect(later).toContain('kills_1000')
  })

  it('retourne un tableau vide sur un profil vierge', () => {
    expect(evaluateAchievements(ZERO, new Set())).toEqual([])
  })

  it('est PUR : ne mute ni la progression ni l’ensemble déjà débloqué', () => {
    const p = at({ kills: 1000, bossKills: 3, stagesCompleted: 5 })
    const pSnapshot = { ...p }
    const unlocked = new Set(['kills_100'])
    const unlockedSnapshot = new Set(unlocked)

    evaluateAchievements(p, unlocked)

    expect(p).toEqual(pSnapshot)
    expect([...unlocked].sort()).toEqual([...unlockedSnapshot].sort())
    expect(unlocked.size).toBe(1)
  })

  it('ne retourne que des ids présents dans ACHIEVEMENTS', () => {
    const all = new Set(ACHIEVEMENTS.map((a) => a.id))
    const newly = evaluateAchievements(
      at({
        kills: 1_000_000,
        bossKills: 10,
        chestsOpened: 10,
        weaponEvolutions: 10,
        prisonersFreed: 10,
        stagesCompleted: 10,
        bestSurvivalMs: 1_200_000,
        bestLevel: 99,
      }),
      new Set()
    )
    expect(newly.length).toBe(ACHIEVEMENTS.length)
    for (const id of newly) {
      expect(all.has(id)).toBe(true)
    }
  })
})
