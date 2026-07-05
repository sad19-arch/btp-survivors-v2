import { h, clear } from './h'
import { injectStyles } from './styles'
import { playerColor } from '@content/players'
import { gamepadHudModel } from './gamepadHud'
import type { AppViewState, AppPlayerState, InventoryEntry, MenuItemView } from '@/app/appState'

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
  /** Couche de la barre de PV de boss (haut-centre, tant qu'un boss est en vie). */
  private readonly bossLayer: HTMLElement
  /** Couche de l'inventaire (armes/passifs + niveaux) — lecture seule, coin dédié. */
  private readonly inventoryLayer: HTMLElement
  /** Couche du HUD manettes (coin haut-droit) : « Manettes N/4 » + pastilles par joueur. */
  private readonly padLayer: HTMLElement
  /** Signature du dernier état manettes rendu — évite de reconstruire à chaque frame. */
  private padSignature = ''
  /** Remplissage de la barre de PV de boss (mis à jour chaque frame ; null = pas de boss). */
  private bossBarFill: HTMLElement | null = null
  /** Signature (ids+niveaux) du dernier inventaire rendu — évite de reconstruire à chaque frame. */
  private inventorySignature = ''
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
    this.bossLayer = h('div')
    this.inventoryLayer = h('div')
    this.padLayer = h('div', { className: 'pads' })
    root.append(
      this.hud,
      this.screenLayer,
      this.bannerLayer,
      this.introLayer,
      this.bossLayer,
      this.inventoryLayer,
      this.padLayer
    )
  }

  /** Met à jour l'overlay depuis l'état applicatif. */
  sync(state: AppViewState): void {
    this.syncHud(state)
    this.syncScreen(state)
    this.syncBanner(state)
    this.syncIntroCard(state)
    this.syncBossBar(state)
    this.syncInventory(state)
    this.syncGamepads(state)
  }

  /**
   * HUD manettes (coin haut-droit) : « Manettes N/4 » + 4 pastilles (une par
   * joueur, couleur `playerColor`, allumée si la manette du slot est connectée).
   * Source = `navigator.getGamepads()` (couche UI/DOM, jamais le cœur). Masqué
   * pendant l'intro. Reconstruit seulement quand l'état des manettes change.
   */
  private syncGamepads(state: AppViewState): void {
    const show = !state.introActive
    const raw =
      typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? Array.from(navigator.getGamepads())
        : []
    const model = gamepadHudModel(raw)
    const sig = `${show ? 1 : 0}:${model.slots.map((s) => (s ? 1 : 0)).join('')}`
    if (sig === this.padSignature) {
      return
    }
    this.padSignature = sig
    clear(this.padLayer)
    this.padLayer.style.display = show ? 'flex' : 'none'
    if (!show) {
      return
    }
    const pips = model.slots.map((on, i) => {
      const pip = h('div', { className: on ? 'pad__pip pad__pip--on' : 'pad__pip' })
      if (on) {
        pip.style.backgroundColor = playerColor(i + 1).hex
      }
      return pip
    })
    this.padLayer.append(
      h('span', { className: 'pad__label', text: `Manettes ${model.count}/4` }),
      h('div', { className: 'pad__pips' }, ...pips)
    )
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
    // Co-op (>1 joueur) : bandeau de mini-HUD par joueur (pastille couleur + PV + niveau).
    // Solo (1 joueur) : rien de plus — le HUD ci-dessus reste visuellement inchangé.
    if (state.players.length > 1) {
      this.hud.append(
        h(
          'div',
          { className: 'hud__players' },
          ...state.players.map((player) => this.playerCard(player))
        )
      )
    }
  }

  /** Mini-HUD d'un joueur (co-op) : pastille couleur + id + PV + niveau, atténué si mort. */
  private playerCard(player: AppPlayerState): HTMLElement {
    const color = playerColor(player.id)
    const swatch = h('div', { className: 'hud__pswatch' })
    swatch.style.backgroundColor = color.hex
    return h(
      'div',
      { className: player.alive ? 'hud__pcard' : 'hud__pcard hud__pcard--dead' },
      swatch,
      h('div', { className: 'hud__pinfo' },
        h('span', { className: 'hud__pid', text: `J${player.id}` }),
        h('span', { className: 'hud__php', text: `PV ${Math.ceil(player.hp)}/${Math.round(player.maxHp)}` }),
        h('span', { className: 'hud__plvl', text: `Nv ${player.level}` })
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
      case 'characterSelect':
        this.screenLayer.append(this.characterSelectPanel(state))
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
      case 'options':
        this.screenLayer.append(this.menuPanel('Options', 'Réglages audio', state))
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

  /** Panneau de sélection de personnage : un joueur à la fois, carrousel ◄ Nom — Arme ►. */
  private characterSelectPanel(state: AppViewState): HTMLElement {
    const sel = state.characterSelect
    const player = sel?.player ?? 1
    const total = sel?.total ?? 1
    const color = playerColor(player)
    const header = h('h1', { className: 'panel__title', text: `Joueur ${player}/${total}` })
    header.style.color = color.hex
    const panel = h(
      'div',
      { className: 'panel' },
      header,
      h('p', { className: 'panel__subtitle', text: 'Choisis ton personnage' }),
      this.menuList(state),
      h('p', { className: 'hint-line', text: 'Gauche/Droite pour changer • Valider: A / Entrée' })
    )
    return h('div', { className: 'screen' }, panel)
  }

  /**
   * Bandeau transitoire « ZONE À SÉCURISER → » (clin d'œil beat'em up). Déclenché
   * au vrai départ de run (après l'intro) et à l'arrivée d'un boss. Géré ici, hors
   * du mécanisme de signature (couche transitoire propre).
   */
  private syncBanner(state: AppViewState): void {
    const inGame = state.screen === 'game' && !state.introActive
    const boss = state.enemies.find((e) => e.isBoss)
    const hasBoss = boss !== undefined
    const startedRun = inGame && !this.prevInGame && state.elapsedMs < 500
    const bossArrived = inGame && hasBoss && !this.prevHadBoss
    // L'arrivée du boss a son propre bandeau (rouge, nom du boss) → alerte claire.
    // Le boss FINAL a un bandeau distinct (nom + classe) — c'est un palier plus dangereux.
    if (bossArrived) {
      if (boss.bossRole === 'final') {
        this.showBanner('DANGER — CONTREMAÎTRE MAUDIT', 'banner banner--boss-final')
      } else {
        this.showBanner('Alerte — Contremaître', 'banner banner--boss')
      }
    } else if (startedRun) {
      this.showBanner('Zone à sécuriser →', 'banner')
    }
    this.prevInGame = inGame
    this.prevHadBoss = hasBoss
  }

  /**
   * Bandeau « ÉVOLUTION — <nom> » (coffre ramassé + conditions réunies). Appelé
   * depuis la composition root (`main.ts`) qui résout le nom via `WEAPONS` —
   * l'Overlay reste sans dépendance à `src/content`.
   */
  showEvolutionBanner(name: string): void {
    this.showBanner(`Évolution — ${name}`, 'banner banner--evolution')
  }

  private showBanner(text: string, className: string): void {
    clear(this.bannerLayer)
    this.bannerLayer.append(h('div', { className, text }))
    if (this.bannerTimer !== null) {
      window.clearTimeout(this.bannerTimer)
    }
    this.bannerTimer = window.setTimeout(() => {
      clear(this.bannerLayer)
      this.bannerTimer = null
    }, 1800)
  }

  /**
   * Barre de PV de boss (haut-centre) tant qu'un boss est en vie. Rend la mise à
   * mort LISIBLE : la jauge se vide jusqu'à 0 → victoire (plus de « victoire au
   * timer, boss encore vivant »). Reconstruite à l'apparition, largeur maj/frame.
   */
  private syncBossBar(state: AppViewState): void {
    const inRun =
      (state.screen === 'game' || state.screen === 'upgrade' || state.screen === 'paused') && !state.introActive
    const boss = inRun ? state.enemies.find((e) => e.isBoss) : undefined
    if (boss === undefined) {
      if (this.bossBarFill !== null) {
        clear(this.bossLayer)
        this.bossBarFill = null
      }
      return
    }
    if (this.bossBarFill === null) {
      clear(this.bossLayer)
      const fill = h('div', { className: 'bossbar__fill' })
      const isFinal = boss.bossRole === 'final'
      this.bossLayer.append(
        h(
          'div',
          { className: isFinal ? 'bossbar bossbar--final' : 'bossbar' },
          h('div', { className: 'bossbar__name', text: isFinal ? 'CONTREMAÎTRE MAUDIT' : 'Contremaître' }),
          h('div', { className: 'bossbar__track' }, fill)
        )
      )
      this.bossBarFill = fill
    }
    const frac = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0
    this.bossBarFill.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`
  }

  /**
   * Inventaire du joueur 1 (armes + passifs, icône + niveau) — lecture seule,
   * coin dédié pour ne pas couvrir PV/XP/barre de boss. Visible en run (jeu/pause/
   * upgrade), masqué pendant l'intro. Reconstruit seulement quand la signature
   * (ids+niveaux) change (l'inventaire évolue rarement).
   */
  private syncInventory(state: AppViewState): void {
    const inRun =
      (state.screen === 'game' || state.screen === 'paused' || state.screen === 'upgrade') && !state.introActive
    if (!inRun) {
      if (this.inventorySignature !== '') {
        clear(this.inventoryLayer)
        this.inventorySignature = ''
      }
      return
    }
    const inv = state.players[0]?.inventory ?? { weapons: [], passives: [] }
    const sig = [...inv.weapons, ...inv.passives].map((e) => `${e.id}:${e.level}`).join(',')
    if (sig === this.inventorySignature) {
      return
    }
    this.inventorySignature = sig
    clear(this.inventoryLayer)
    if (inv.weapons.length === 0 && inv.passives.length === 0) {
      return
    }
    this.inventoryLayer.append(
      h(
        'div',
        { className: 'inv' },
        h('div', { className: 'inv__row' }, ...inv.weapons.map((e) => this.invTile(e))),
        h('div', { className: 'inv__row' }, ...inv.passives.map((e) => this.invTile(e)))
      )
    )
  }

  /** Une tuile d'inventaire : icône (ou monogramme de secours) + pastille de niveau. */
  private invTile(entry: InventoryEntry): HTMLElement {
    return h(
      'div',
      { className: 'inv__tile' },
      icon(entry.id, entry.name, 'inv__icon', 'inv__img', 'inv__mono'),
      h('div', { className: 'inv__lvl', text: `${entry.level}/${entry.maxLevel ?? entry.level}` })
    )
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

  private levelPips(current: number, max: number): HTMLElement {
    const pips: HTMLElement[] = []
    for (let i = 0; i < max; i++) {
      pips.push(h('span', { className: i < current ? 'pip pip--on' : 'pip' }))
    }
    return h(
      'div',
      { className: 'card__pips' },
      ...pips,
      h('span', { className: 'card__lvltext', text: `${current}/${max}` })
    )
  }

  private card(item: MenuItemView, focused: boolean, index: number): HTMLElement {
    const kindClass =
      item.kind?.startsWith('weapon') === true
        ? 'card--weapon'
        : item.kind?.startsWith('passive') === true
          ? 'card--passive'
          : ''
    const classNames = ['card', kindClass, focused ? 'card--focus' : ''].filter(Boolean).join(' ')
    const children: HTMLElement[] = [
      this.cardIcon(item),
      h('div', { className: 'card__name', text: item.label })
    ]
    if (item.maxLevel !== undefined) {
      children.push(h('div', { className: 'card__hint', text: item.hint ?? '' }))
      children.push(this.levelPips(item.currentLevel ?? 0, item.maxLevel))
    } else {
      children.push(h('div', { className: 'card__hint', text: item.hint ?? '' }))
    }
    if (item.description !== undefined && item.description !== '') {
      children.push(h('div', { className: 'card__desc', text: item.description }))
    }
    if (item.delta !== undefined && item.delta !== '') {
      children.push(h('div', { className: 'card__delta', text: item.delta }))
    }
    return h(
      'div',
      {
        className: classNames,
        onClick: this.onSelect === undefined ? undefined : () => { this.onSelect?.(index) }
      },
      ...children
    )
  }

  /**
   * Icône de carte : tente `icon_<id>.png` (pixel-art dédié à venir en passe DA) ;
   * en l'absence de fichier (armes/passifs sans icône propre pour l'instant), bascule
   * sur un MONOGRAMME lisible (initiales) plutôt qu'une image cassée. Forward-compatible :
   * dès qu'une icône `icon_<id>.png` existe, elle s'affiche automatiquement.
   */
  private cardIcon(item: MenuItemView): HTMLElement {
    return icon(item.id, item.label, 'card__icon', 'card__img', 'card__mono')
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
    // Inclut les LIBELLÉS (pas que les ids) → re-rend quand un % de volume ou le
    // nom de phase du sélecteur change (mêmes ids, libellé différent).
    const menuPart = menu === null ? '' : `${menu.items.map((i) => `${i.id}:${i.label}`).join(',')}#${menu.index}`
    const statsPart =
      state.screen === 'gameover' || state.screen === 'victory' ? `${state.elapsedMs}|${state.score}` : ''
    // Le déblocage du casque doré change le panneau titre → l'inclure dans la signature.
    const titlePart = state.screen === 'title' && state.goldSkin ? 'gold' : ''
    // Sélection de personnage : le joueur actif (couleur du header) ne fait pas partie du
    // menu (item unique 'char') → inclure explicitement pour re-rendre au changement de joueur.
    const charSelectPart =
      state.screen === 'characterSelect' && state.characterSelect !== null
        ? `p${state.characterSelect.player}/${state.characterSelect.total}`
        : ''
    return `${state.screen}|${menuPart}|${statsPart}|${titlePart}|${charSelectPart}`
  }
}

/** Formate un temps en ms vers `m:ss`. */
function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const MONOGRAM_STOPWORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'et'])

/** Monogramme d'une carte : initiales des 2 premiers mots significatifs, en capitales (icône de secours). */
function monogram(label: string): string {
  const all = label.split(/[\s-]+/).filter((w) => w.length > 0)
  const significant = all.filter((w) => !MONOGRAM_STOPWORDS.has(w.toLowerCase()))
  const words = significant.length > 0 ? significant : all
  return words.slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase()
}

/**
 * Icône générique (carte d'upgrade ou tuile d'inventaire) : tente
 * `icon_<id>_64.png` (pixel-art PixelLab, lot B3) ; bascule sur un MONOGRAMME
 * (initiales du libellé) si le fichier n'existe pas encore (ex. armes évoluées
 * sans icône dédiée). Factorisé entre `cardIcon` (upgrade) et `invTile`
 * (inventaire HUD) — mêmes règles, classes CSS différentes selon le contexte.
 */
function icon(id: string, label: string, boxClass: string, imgClass: string, monoClass: string): HTMLElement {
  const box = h('div', { className: boxClass })
  const img = h('img', {
    className: imgClass,
    attrs: { src: `${import.meta.env.BASE_URL}stage01/ui/icon_${id}_64.png`, alt: '' }
  })
  img.addEventListener('error', () => {
    img.remove()
    box.append(h('div', { className: monoClass, text: monogram(label) }))
  })
  box.append(img)
  return box
}
