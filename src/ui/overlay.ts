import { h, clear } from './h'
import { injectStyles } from './styles'
import type { AppViewState, MenuItemView } from '@/app/appState'

/**
 * Overlay DOM des écrans (Titre / Pause / Upgrade / Game Over) + HUD. Observe
 * l'état de l'App et se redessine ; il n'écrit jamais la logique (la navigation
 * passe par la couche input → App). Style 16-bit (panneaux pixel), focus visible.
 */
export class Overlay {
  private readonly hud: HTMLElement
  private readonly screenLayer: HTMLElement
  /** Couche des éléments transitoires (bandeau « ZONE À SÉCURISER → »). */
  private readonly bannerLayer: HTMLElement
  /** Couche du carton d'intro « PHASE N · TITRE ». */
  private readonly introLayer: HTMLElement
  private signature = ''
  /** Suivi inter-frames pour déclencher le bandeau (départ de run / arrivée boss). */
  private prevInGame = false
  private prevHadBoss = false
  private bannerTimer: number | null = null
  /** Carton d'intro affiché (évite de le reconstruire chaque frame). */
  private introShown = false
  /** Callback de sélection d'un item par index (clic souris) ; route vers l'App. */
  private readonly onSelect: ((index: number) => void) | undefined

  constructor(root: HTMLElement, onSelect?: (index: number) => void) {
    injectStyles()
    this.onSelect = onSelect
    root.id = 'ui-root'
    this.hud = h('div', { className: 'hud' })
    this.screenLayer = h('div')
    this.bannerLayer = h('div')
    this.introLayer = h('div')
    root.append(this.hud, this.screenLayer, this.bannerLayer, this.introLayer)
  }

  /** Met à jour l'overlay depuis l'état applicatif. */
  sync(state: AppViewState): void {
    this.syncHud(state)
    this.syncScreen(state)
    this.syncBanner(state)
    this.syncIntroCard(state)
  }

  private syncHud(state: AppViewState): void {
    // HUD visible en run, mais masqué pendant l'intro (le héros entre en scène).
    const inRun =
      (state.screen === 'game' || state.screen === 'paused' || state.screen === 'upgrade') && !state.introActive
    this.hud.style.display = inRun ? 'flex' : 'none'
    if (!inRun) {
      return
    }
    const p = state.players[0]
    const hp = p?.hp ?? 0
    const maxHp = p?.maxHp ?? 1
    const xp = p?.xp ?? 0
    const threshold = p?.nextThreshold ?? 1
    clear(this.hud)
    this.hud.append(
      h(
        'div',
        { className: 'hud__row hud__stage' },
        h('span', { className: 'hud__stagenum', text: `Phase ${state.stageOrder}/10` }),
        h('span', { className: 'hud__sep', text: '·' }),
        h('span', { className: 'hud__stagename', text: state.stageTitle })
      ),
      h(
        'div',
        { className: 'hud__row' },
        h('span', { className: 'hud__time', text: formatTime(state.elapsedMs) }),
        h('span', { className: 'hud__sep', text: '·' }),
        h('span', { text: `Niv. ${p?.level ?? 1}` }),
        h('span', { className: 'hud__sep', text: '·' }),
        h('span', { text: `Score ${state.score}` })
      ),
      h(
        'div',
        { className: 'hud__row' },
        h('span', { className: 'hud__hp', text: `PV ${Math.ceil(hp)}/${Math.round(maxHp)}` }),
        this.bar(hp / maxHp, 'hud__bar--hp'),
        h('span', { className: 'hud__xp', text: `XP ${Math.floor(xp)}/${threshold}` }),
        this.bar(xp / threshold, 'hud__bar--xp')
      )
    )
  }

  private syncScreen(state: AppViewState): void {
    const sig = this.computeSignature(state)
    if (sig === this.signature) {
      return
    }
    this.signature = sig
    clear(this.screenLayer)
    switch (state.screen) {
      case 'title':
        this.screenLayer.append(this.titlePanel(state))
        break
      case 'paused':
        this.screenLayer.append(this.menuPanel('Pause', null, state))
        break
      case 'gameover':
        this.screenLayer.append(this.gameOverPanel(state))
        break
      case 'victory':
        this.screenLayer.append(this.victoryPanel(state))
        break
      case 'upgrade':
        this.screenLayer.append(this.upgradePanel(state))
        break
      default:
        break // en jeu : pas de modale
    }
  }

  // --- panneaux -------------------------------------------------------------

  private titlePanel(state: AppViewState): HTMLElement {
    const panel = h(
      'div',
      { className: 'panel' },
      h('h1', { className: 'panel__title', text: 'BTP Survivors' }),
      h('p', { className: 'panel__subtitle', text: 'Survis au chantier' }),
      this.menuList(state),
      h('p', { className: 'hint-line', text: 'Manette ou clavier · Valider: A / Entrée' })
    )
    if (state.goldSkin) {
      panel.append(h('p', { className: 'unlock-line', text: 'Casque doré débloqué' }))
    }
    return h('div', { className: 'screen' }, panel)
  }

  /**
   * Bandeau transitoire « ZONE À SÉCURISER → » (clin d'œil beat'em up). Déclenché
   * au vrai départ de run (après l'intro) et à l'arrivée d'un boss. Géré ici, hors
   * du mécanisme de signature (couche transitoire propre).
   */
  private syncBanner(state: AppViewState): void {
    const inGame = state.screen === 'game' && !state.introActive
    const hasBoss = state.enemies.some((e) => e.isBoss)
    const startedRun = inGame && !this.prevInGame && state.elapsedMs < 500
    const bossArrived = inGame && hasBoss && !this.prevHadBoss
    if (startedRun || bossArrived) {
      this.showBanner()
    }
    this.prevInGame = inGame
    this.prevHadBoss = hasBoss
  }

  private showBanner(): void {
    clear(this.bannerLayer)
    this.bannerLayer.append(h('div', { className: 'banner', text: 'ZONE À SÉCURISER →' }))
    if (this.bannerTimer !== null) {
      window.clearTimeout(this.bannerTimer)
    }
    this.bannerTimer = window.setTimeout(() => {
      clear(this.bannerLayer)
      this.bannerTimer = null
    }, 1800)
  }

  /**
   * Carton d'intro « arcade » : pendant l'intro de run, affiche PHASE N / titre /
   * sous-titre au centre. C'est aussi ce qui NOMME la phase en jeu (le HUD la garde
   * ensuite en permanence). Reconstruit une seule fois par intro.
   */
  private syncIntroCard(state: AppViewState): void {
    if (state.introActive) {
      if (this.introShown) {
        return
      }
      this.introShown = true
      clear(this.introLayer)
      this.introLayer.append(
        h(
          'div',
          { className: 'stagecard' },
          h('div', { className: 'stagecard__num', text: `Phase ${state.stageOrder} / 10` }),
          h('div', { className: 'stagecard__title', text: state.stageTitle }),
          h('div', { className: 'stagecard__sub', text: state.stageSubtitle })
        )
      )
    } else if (this.introShown) {
      this.introShown = false
      clear(this.introLayer)
    }
  }

  private menuPanel(title: string, subtitle: string | null, state: AppViewState): HTMLElement {
    const panel = h('div', { className: 'panel' }, h('h1', { className: 'panel__title', text: title }))
    if (subtitle !== null) {
      panel.append(h('p', { className: 'panel__subtitle', text: subtitle }))
    }
    panel.append(this.menuList(state))
    return h('div', { className: 'screen' }, panel)
  }

  private gameOverPanel(state: AppViewState): HTMLElement {
    const p = state.players[0]
    const stats = h(
      'div',
      { className: 'stats' },
      h('span', { text: `Temps survécu : ${formatTime(state.elapsedMs)}` }),
      h('span', { text: `Niveau atteint : ${p?.level ?? 1}` }),
      h('span', { text: `Score : ${state.score}` })
    )
    return h(
      'div',
      { className: 'screen' },
      h(
        'div',
        { className: 'panel' },
        h('h1', { className: 'panel__title', text: 'Game Over' }),
        stats,
        this.menuList(state)
      )
    )
  }

  private victoryPanel(state: AppViewState): HTMLElement {
    const p = state.players[0]
    const hasNext = (state.menu?.items ?? []).some((it) => it.id === 'stage_suivant')
    const stats = h(
      'div',
      { className: 'stats' },
      h('span', { text: `Chantier : ${state.stageTitle}` }),
      h('span', { text: `Temps : ${formatTime(state.elapsedMs)}` }),
      h('span', { text: `Niveau atteint : ${p?.level ?? 1}` }),
      h('span', { text: `Score : ${state.score}` })
    )
    return h(
      'div',
      { className: 'screen' },
      h(
        'div',
        { className: 'panel' },
        h('h1', { className: 'panel__title', text: hasNext ? 'Chantier livré !' : 'Chantier terminé !' }),
        h('p', {
          className: 'panel__subtitle',
          text: hasNext ? 'Direction le chantier suivant' : 'Bravo — tous les chantiers sont livrés'
        }),
        stats,
        this.menuList(state)
      )
    )
  }

  private upgradePanel(state: AppViewState): HTMLElement {
    const items = state.menu?.items ?? []
    const index = state.menu?.index ?? 0
    const cards = h('div', { className: 'cards' })
    items.forEach((item, i) => {
      cards.append(this.card(item, i === index, i))
    })
    return h(
      'div',
      { className: 'screen' },
      h(
        'div',
        { className: 'panel' },
        h('h1', { className: 'panel__title', text: 'Niveau supérieur' }),
        h('p', { className: 'panel__subtitle', text: 'Choisis une amélioration' }),
        cards,
        h('p', { className: 'hint-line', text: 'Gauche/Droite pour choisir · Valider: A / Entrée' })
      )
    )
  }

  private card(item: MenuItemView, focused: boolean, index: number): HTMLElement {
    return h(
      'div',
      {
        className: focused ? 'card card--focus' : 'card',
        onClick: this.onSelect === undefined ? undefined : () => { this.onSelect?.(index) }
      },
      h('img', {
        className: 'card__icon',
        attrs: { src: `${import.meta.env.BASE_URL}stage01/ui/icon_${item.id}.png`, alt: '' }
      }),
      h('div', { className: 'card__name', text: item.label }),
      h('div', { className: 'card__hint', text: item.hint ?? '' })
    )
  }

  /** Barre de progression (remplissage proportionnel), pour le HUD. */
  private bar(pct: number, modifier: string): HTMLElement {
    const fill = h('div', { className: 'hud__bar-fill' })
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`
    return h('div', { className: `hud__bar ${modifier}` }, fill)
  }

  private menuList(state: AppViewState): HTMLElement {
    const list = h('div', { className: 'menu' })
    const items = state.menu?.items ?? []
    const index = state.menu?.index ?? 0
    items.forEach((item, i) => {
      list.append(
        h('div', {
          className: i === index ? 'menu__item menu__item--focus' : 'menu__item',
          text: item.label,
          onClick: this.onSelect === undefined ? undefined : () => { this.onSelect?.(i) }
        })
      )
    })
    return list
  }

  /** Signature : ne reconstruit la modale que si l'écran/menu/focus change. */
  private computeSignature(state: AppViewState): string {
    const menu = state.menu
    const menuPart = menu === null ? '' : `${menu.items.map((i) => i.id).join(',')}#${menu.index}`
    const statsPart =
      state.screen === 'gameover' || state.screen === 'victory' ? `${state.elapsedMs}|${state.score}` : ''
    // Le déblocage du casque doré change le panneau titre → l'inclure dans la signature.
    const titlePart = state.screen === 'title' && state.goldSkin ? 'gold' : ''
    return `${state.screen}|${menuPart}|${statsPart}|${titlePart}`
  }
}

/** Formate un temps en ms vers `m:ss`. */
function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
