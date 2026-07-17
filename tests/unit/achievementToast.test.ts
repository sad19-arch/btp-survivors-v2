import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { App } from '@/app/app'
import {
  Overlay,
  TROPHY_VISIBLE_MS,
  TROPHY_GAP_MS,
  MAX_ACHIEVEMENT_QUEUE,
  type AchievementToast
} from '@ui/overlay'

/**
 * Toasts de succès — le POINT DUR est la FILE.
 *
 * Le mécanisme historique (`showBanner`) est MONO-SLOT : il `clear()` sa couche
 * avant d'insérer, et sa mémoire de suspension (`pendingBanner`) est un SCALAIRE.
 * Deux succès débloqués dans la même frame (« 100 kills » + « premier boss » —
 * un cas naturel, pas théorique) ⇒ un seul visible, l'autre perdu SANS TRACE.
 *
 * Ces tests verrouillent le contrat inverse : rien ne se perd silencieusement.
 */

const A: AchievementToast = {
  id: 'premier_boss',
  label: 'Contrôle inopiné',
  description: 'Neutraliser un boss de chantier.',
  icon: 'stage01/ui/icon_enemy_boss_64.png'
}
const B: AchievementToast = {
  id: 'kills_100',
  label: 'Cent fois sur le métier',
  description: 'Neutraliser 100 ennemis en tout.',
  icon: 'stage01/ui/icon_enemy_base_64.png'
}
const C: AchievementToast = {
  id: 'coffre_ouvert',
  label: 'Livraison de matériel',
  description: 'Ouvrir un coffre sur le chantier.'
}

function mount(): { root: HTMLElement; overlay: Overlay } {
  const root = document.createElement('div')
  document.body.append(root)
  return { root, overlay: new Overlay(root) }
}

/** Libellés des trophées actuellement dans le DOM (couche dédiée). */
function shown(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.trophy__name')].map((n) => n.textContent ?? '')
}

/** Avance le temps d'un cycle complet de trophée (affichage + inter-trophée). */
function advanceOneTrophy(): void {
  vi.advanceTimersByTime(TROPHY_VISIBLE_MS + TROPHY_GAP_MS + 10)
}

describe('Toast de succès — file FIFO', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  // ─── LE test : c'est celui qui échoue contre le mono-slot ────────────────
  it('deux succès poussés dans la MÊME frame finissent TOUS LES DEUX par s’afficher', () => {
    const { root, overlay } = mount()

    // Même frame : aucun timer ne s'écoule entre les deux appels.
    overlay.showAchievement(A)
    overlay.showAchievement(B)

    // Un seul à la fois — et c'est le PREMIER arrivé (FIFO, pas le dernier).
    // Mono-slot : B aurait déjà écrasé A ici.
    expect(shown(root)).toEqual(['Contrôle inopiné'])

    // Le second n'est pas perdu : il prend le relais à l'expiration du premier.
    // Mono-slot : la couche serait VIDE ici (A remplacé, B expiré).
    advanceOneTrophy()
    expect(shown(root)).toEqual(['Cent fois sur le métier'])

    // Puis plus rien : la file est vidée, pas bouclée.
    advanceOneTrophy()
    expect(shown(root)).toEqual([])
  })

  it('trois succès simultanés se déroulent dans l’ordre d’arrivée', () => {
    const { root, overlay } = mount()
    overlay.showAchievement(A)
    overlay.showAchievement(B)
    overlay.showAchievement(C)

    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      seen.push(...shown(root))
      advanceOneTrophy()
    }
    expect(seen).toEqual(['Contrôle inopiné', 'Cent fois sur le métier', 'Livraison de matériel'])
  })

  it('un même succès poussé deux fois ne s’affiche qu’une fois (dé-doublonnage par id)', () => {
    const { root, overlay } = mount()
    overlay.showAchievement(A)
    overlay.showAchievement(A)
    expect(shown(root)).toEqual(['Contrôle inopiné'])
    advanceOneTrophy()
    expect(shown(root)).toEqual([])
  })
})

describe('Toast de succès — file bornée', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('un déluge de succès ne monopolise pas l’UI : la file est plafonnée', () => {
    const { root, overlay } = mount()
    const flood: AchievementToast[] = Array.from({ length: 10 }, (_, i) => ({
      id: `succes_${i}`,
      label: `Succès ${i}`,
      description: 'Déluge.'
    }))
    for (const def of flood) {
      overlay.showAchievement(def)
    }

    // 1 affiché + MAX_ACHIEVEMENT_QUEUE en attente : le reste est écarté.
    const total = 1 + MAX_ACHIEVEMENT_QUEUE
    let cycles = 0
    while (shown(root).length > 0 && cycles < 20) {
      advanceOneTrophy()
      cycles++
    }
    expect(cycles).toBe(total)

    // Le budget total reste sous les 30 s dénoncées par le brief.
    expect(total * (TROPHY_VISIBLE_MS + TROPHY_GAP_MS)).toBeLessThan(30_000)
  })

  it('une troncature est TRACÉE (jamais silencieuse)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { overlay } = mount()
    for (let i = 0; i < 10; i++) {
      overlay.showAchievement({ id: `succes_${i}`, label: `Succès ${i}`, description: 'Déluge.' })
    }
    expect(warn).toHaveBeenCalled()
    // Le message nomme le succès tombé — un log qui ne dit pas QUOI ne sert à rien.
    const said = warn.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(said).toContain('succes_9')
    warn.mockRestore()
  })
})

describe('Toast de succès — canal indépendant des bandeaux', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('un trophée ne tue pas un bandeau d’évolution, ni l’inverse', () => {
    const { root, overlay } = mount()
    overlay.showEvolutionBanner('Cloueur automatique')
    overlay.showAchievement(A)

    // Les deux coexistent : couches distinctes, timers distincts.
    expect(root.querySelector('.banner--evolution')?.textContent).toContain('Cloueur automatique')
    expect(shown(root)).toEqual(['Contrôle inopiné'])
  })

  it('le bandeau poussé APRÈS le trophée ne le fait pas disparaître', () => {
    const { root, overlay } = mount()
    overlay.showAchievement(A)
    overlay.showEvolutionBanner('Scie circulaire')

    expect(shown(root)).toEqual(['Contrôle inopiné'])
    expect(root.querySelector('.banner--evolution')).not.toBeNull()
  })
})

describe('Toast de succès — suspension par la modale de level-up', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('modale ouverte ⇒ le trophée attend, puis se rejoue à la fermeture', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const { root, overlay } = mount()

    // Écran de level-up ouvert (modale) → suspension du canal trophées.
    const upgrade = { ...app.getState(), screen: 'upgrade' as const }
    overlay.sync(upgrade)
    overlay.showAchievement(A)

    // Rien par-dessus les cartes (précédent : bug de z-index).
    expect(shown(root)).toEqual([])
    vi.advanceTimersByTime(TROPHY_VISIBLE_MS * 3)
    expect(shown(root)).toEqual([])

    // Modale fermée → le trophée retenu se rejoue, il n'est pas perdu.
    overlay.sync({ ...app.getState(), screen: 'game' as const })
    expect(shown(root)).toEqual(['Contrôle inopiné'])
  })

  it('un trophée en cours est REMIS EN FILE si la modale s’ouvre par-dessus', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const { root, overlay } = mount()
    overlay.sync({ ...app.getState(), screen: 'game' as const })
    overlay.showAchievement(A)
    expect(shown(root)).toEqual(['Contrôle inopiné'])

    // La modale s'ouvre pendant l'affichage → le trophée disparaît de l'écran…
    overlay.sync({ ...app.getState(), screen: 'upgrade' as const })
    expect(shown(root)).toEqual([])

    // …et se rejoue ENTIER à la fermeture (pas de trophée mangé à moitié).
    overlay.sync({ ...app.getState(), screen: 'game' as const })
    expect(shown(root)).toEqual(['Contrôle inopiné'])
  })
})
