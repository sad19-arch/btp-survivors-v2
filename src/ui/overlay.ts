import { h, clear } from './h'
import { injectStyles } from './styles'
import { formatTime, formatNumber } from './format'
import { playerColor } from '@content/players'
import { gamepadHudModel } from './gamepadHud'
import { Minimap } from './minimap'
import type { ViewportState } from './viewport'
import { approach } from './anim'
import { cardEnterStyle } from './cardEnter'
import { readHiScore } from './hiscore'
import type { AppViewState, AppPlayerState, InventoryEntry, MenuItemView, ChestOpenView } from '@/app/appState'

/**
 * Overlay DOM des écrans (Titre / Pause / Upgrade / Game Over) + HUD. Observe
 * l'état de l'App et se redessine ; il n'écrit jamais la logique (la navigation
 * passe par la couche input → App). Style 16-bit (panneaux pixel), focus visible.
 */
export class Overlay {
  private readonly root: HTMLElement
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
  /** Couche du panneau jackpot (coffre d'évolution ramassé) — B5. */
  private readonly jackpotLayer: HTMLElement
  /** Timers en cours pour l'animation jackpot (anticipation + flash + fermeture). */
  private jackpotTimers: number[] = []
  /** Handle rAF du défilement de la roulette jackpot (pour annulation au re-trigger). */
  private jackpotRaf: number | null = null
  /** Mini-carte (bas-gauche) — prisonniers/boss/coffres/joueur, togglable. */
  private readonly minimap: Minimap
  /** Compteur de frames pour throttler la maj de la mini-carte (~toutes les 4 frames). */
  private minimapFrame = 0
  /** Mini-carte visible à la frame précédente — force une maj immédiate à l'apparition. */
  private minimapWasShown = false
  /** Signature (ids+niveaux) du dernier inventaire rendu — évite de reconstruire à chaque frame. */
  private inventorySignature = ''
  private signature = ''
  /** Suivi inter-frames pour déclencher le bandeau (départ de run / arrivée boss). */
  private prevInGame = false
  private prevHadBoss = false
  private bannerTimer: number | null = null
  /** Bandeaux « toast » suspendus tant que l'écran de level-up est ouvert (bug z-index 2d). */
  private bannerSuspended = false
  private pendingBanner: { text: string; className: string } | null = null
  /** Carton d'intro affiché (évite de le reconstruire chaque frame). */
  private introShown = false
  /** Élément du splash studio tant qu'il est affiché (null une fois retiré). */
  private studioSplashEl: HTMLElement | null = null
  /** Callback de cycle de vie du splash (émet 'end' à son retrait). */
  private onStudioSplash: ((phase: 'start' | 'end') => void) | undefined
  /**
   * Garde one-shot : `true` tant que la machine à sous du coffre courant a déjà
   * été jouée. Évite de la rejouer à chaque rAF pendant que `chestOpen` reste
   * non-null (notamment sur l'écran de choix gelé, où la sim ne réinitialise pas
   * le flag). Réinitialisé quand `chestOpen` repasse à `null` (pas suivant).
   */
  private chestSlotShown = false
  /** Callback de sélection d'un item par index (clic souris) ; route vers l'App. */
  private readonly onSelect: ((index: number) => void) | undefined
  /**
   * Ratio XP affiché (lissé via `approach`) par joueur (clé = playerId).
   * Permet une montée en douceur de la barre XP à chaque frame.
   */
  private readonly xpDisplayed = new Map<number, number>()
  /**
   * Dernier niveau mémorisé par joueur — détecter les level-ups pour déclencher le flash.
   */
  private readonly lastLevel = new Map<number, number>()
  /**
   * Échéance (performance.now, ms) jusqu'à laquelle la barre XP flashe après un level-up,
   * par joueur. Le HUD étant reconstruit chaque frame (`clear()`), le flash est piloté par
   * cet état (classe ré-appliquée tant que `now < échéance`) et NON par un `setTimeout`
   * one-shot sur un nœud détruit à la frame suivante (qui rendait le flash invisible).
   */
  private readonly xpFlashUntil = new Map<number, number>()
  /**
   * Timestamp (performance.now) du dernier appel à sync() — calcul du dt inter-frame
   * côté rendu. Initialisé à -1 (jamais vu) → dt=16ms nominal au premier appel.
   */
  private lastFrameTimeMs = -1
  /**
   * Écran de la frame précédente — détection des transitions de screen.
   * Permet de savoir si on vient d'arriver sur 'upgrade'.
   */
  private prevScreen: string = ''
  /**
   * Timestamp (performance.now) de l'apparition de l'écran upgrade.
   * -1 = écran upgrade inactif. Remis à -1 à la sortie de l'écran pour
   * rejouer le reveal au prochain level-up.
   */
  private upgradeAppearAt = -1

  constructor(
    root: HTMLElement,
    onSelect?: (index: number) => void,
    onStudioSplash?: (phase: 'start' | 'end') => void
  ) {
    injectStyles()
    this.onSelect = onSelect
    root.id = 'ui-root'
    this.root = root
    this.hud = h('div', { className: 'hud' })
    this.screenLayer = h('div')
    this.bannerLayer = h('div')
    this.introLayer = h('div')
    this.bossLayer = h('div')
    this.inventoryLayer = h('div')
    this.padLayer = h('div', { className: 'pads' })
    this.jackpotLayer = h('div')
    this.minimap = new Minimap()
    this.minimap.setVisible(false)
    // Cadre métal ouvragé (au fond) + couches UI + scanlines CRT (au-dessus). Décoratif.
    root.append(h('div', { className: 'frame' }))
    root.append(
      this.hud,
      this.screenLayer,
      this.bannerLayer,
      this.introLayer,
      this.bossLayer,
      this.inventoryLayer,
      this.padLayer,
      this.jackpotLayer,
      this.minimap.el
    )
    root.append(h('div', { className: 'frame__scan' }))
    // Splash studio « AIL Entertainment » : affiché au boot, retiré par le boot
    // (dismissStudioSplash) dès que l'audio est prêt / au 1er input — la voix « presents »
    // l'accompagne À COUP SÛR. L'invite « appuie pour commencer » clignote après le reveal.
    const base = import.meta.env.BASE_URL
    const splash = h('div', { className: 'splash' },
      h('div', { className: 'splash__gyro' }),
      h('div', { className: 'splash__flash' }),
      h('img', { className: 'splash__helmet', attrs: { src: `${base}casque.png`, alt: '' } }),
      h('div', { className: 'splash__name', text: 'AIL ENTERTAINMENT' }),
      h('div', { className: 'splash__tag', text: 'PRÉSENTE' }),
      h('div', { className: 'splash__hint', text: 'Appuie pour commencer' })
    )
    root.append(splash)
    this.studioSplashEl = splash
    this.onStudioSplash = onStudioSplash
    // Signale l'apparition → l'audio arme/joue « AIL Entertainment presents » EN SYNC.
    onStudioSplash?.('start')
    // Responsive : l'overlay ne LIT plus la fenêtre lui-même — il consomme l'état
    // du ViewportBus (source de vérité unique, câblé dans main.ts, émission
    // immédiate à l'abonnement). Fini le listener resize local (P3 refonte mobile).
  }

  /**
   * Applique l'état responsive au HUD : classe `.ui-mobile`, minimap compacte,
   * échelle `--ui-scale` (calculée par la source de vérité — safe areas incluses).
   * IDEMPOTENT : ré-appliquer le même état ne change rien au DOM.
   */
  applyResponsive(v: ViewportState): void {
    this.root.classList.toggle('ui-mobile', v.uiMobile)
    this.minimap.setCompact(v.uiMobile)
    this.root.style.setProperty('--ui-scale', String(v.uiScale))
  }

  /**
   * Retire le splash studio (idempotent) avec un court fondu, et ferme la fenêtre
   * audio de la voix « presents » ('end'). Appelé par le boot dès que l'audio est prêt
   * (voix jouée) / au 1er input / après un filet de sécurité.
   */
  dismissStudioSplash(): void {
    const el = this.studioSplashEl
    if (el === null) {
      return
    }
    this.studioSplashEl = null
    el.classList.add('splash--out')
    window.setTimeout(() => { el.remove() }, 420)
    this.onStudioSplash?.('end')
  }

  /** Met à jour l'overlay depuis l'état applicatif. */
  sync(state: AppViewState): void {
    // Calcul du delta inter-frame côté rendu (performance.now, pas dans l'util pur).
    const now = performance.now()
    const dtMs = this.lastFrameTimeMs < 0 ? 16 : Math.min(now - this.lastFrameTimeMs, 100)
    this.lastFrameTimeMs = now
    this.syncHud(state, dtMs, now)
    this.syncScreen(state, now)
    this.syncBanner(state)
    this.syncIntroCard(state)
    this.syncBossBar(state)
    this.syncInventory(state)
    this.syncGamepads(state)
    this.syncMinimap(state)
    // Machine à sous coffre : déclenchée UNE fois à chaque ouverture de coffre
    // (les 3 issues), via le one-shot `chestOpen`. Garde `chestSlotShown` pour ne
    // pas rejouer à chaque rAF tant que `chestOpen` reste non-null.
    const chest = state.chestOpen
    if (chest !== null && !this.chestSlotShown) {
      this.chestSlotShown = true
      this.showSlotMachine(chest)
      if (chest.kind === 'evolution' && chest.weaponName !== null) {
        this.showEvolutionBanner(chest.weaponName)
      }
    } else if (chest === null) {
      this.chestSlotShown = false
    }
  }

  /**
   * Mini-carte (bas-gauche) : visible seulement en écran `game` (hors intro) ET
   * si `minimapVisible` (toggle M / manette). Repositionne ses marqueurs toutes
   * les ~4 frames (throttle, comme l'inventaire/décor) — les entités bougent,
   * mais pas besoin d'un rebuild à 60 Hz.
   */
  private syncMinimap(state: AppViewState): void {
    const show = state.screen === 'game' && !state.introActive && state.minimapVisible
    this.minimap.setVisible(show)
    if (!show) {
      this.minimapWasShown = false
      return
    }
    // À l'apparition : maj immédiate (sinon panneau vide quelques frames). Ensuite throttle.
    if (!this.minimapWasShown) {
      this.minimapWasShown = true
      this.minimapFrame = 0
      this.minimap.update(state)
      return
    }
    this.minimapFrame = (this.minimapFrame + 1) % 4
    if (this.minimapFrame !== 0) {
      return
    }
    this.minimap.update(state)
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

  private syncHud(state: AppViewState, dtMs: number, now: number): void {
    // HUD visible en run, mais masqué pendant l'intro (le héros entre en scène).
    const inRun =
      (state.screen === 'game' || state.screen === 'paused' || state.screen === 'upgrade') && !state.introActive
    this.hud.style.display = inRun ? 'flex' : 'none'
    if (!inRun) {
      // Réinitialise l'état XP animé pour ne pas polluer la prochaine run.
      this.xpDisplayed.clear()
      this.lastLevel.clear()
      this.xpFlashUntil.clear()
      return
    }
    const p = state.players[0]
    const hp = p?.hp ?? 0
    const maxHp = p?.maxHp ?? 1
    const xp = p?.xp ?? 0
    const threshold = p?.nextThreshold ?? 1
    const level = p?.level ?? 1
    const playerId = p?.id ?? 1

    // --- Barre XP lissée (lerp via approach) ---
    const xpTarget = threshold > 0 ? xp / threshold : 0
    const prevDisplayed = this.xpDisplayed.get(playerId) ?? xpTarget
    const displayed = approach(prevDisplayed, xpTarget, dtMs)
    this.xpDisplayed.set(playerId, displayed)

    // --- Flash de level-up (piloté par état : le HUD est reconstruit chaque frame) ---
    const prevLevel = this.lastLevel.get(playerId)
    if (prevLevel !== undefined && level > prevLevel) {
      // Level-up : la barre repart de 0 (reset propre) et flashe pendant ~220 ms.
      this.xpDisplayed.set(playerId, 0)
      this.xpFlashUntil.set(playerId, now + 220)
    }
    this.lastLevel.set(playerId, level)
    // La classe de flash est ré-appliquée à chaque frame tant que l'échéance n'est pas
    // passée — sinon, le HUD étant recréé chaque frame, le flash serait invisible.
    const flashing = now < (this.xpFlashUntil.get(playerId) ?? 0)
    const xpBarModifier = flashing ? 'hud__bar--xp hud__bar--xp-flash' : 'hud__bar--xp'

    clear(this.hud)
    const xpBar = this.bar(displayed, xpBarModifier)

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
        h('span', { text: `Niv. ${level}` }),
        h('span', { className: 'hud__sep', text: '·' }),
        h('span', { text: `Score ${state.score}` }),
        h('span', { className: 'hud__sep', text: '·' }),
        h('span', { className: 'hud__coins', text: `Or ${state.coins}` })
      ),
      h(
        'div',
        { className: 'hud__row' },
        h('span', { className: 'hud__hp', text: `PV ${Math.ceil(hp)}/${Math.round(maxHp)}` }),
        this.bar(hp / maxHp, 'hud__bar--hp'),
        h('span', { className: 'hud__xp', text: `XP ${Math.floor(xp)}/${threshold}` }),
        xpBar
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

  private syncScreen(state: AppViewState, now: number): void {
    // Suivi des transitions d'écran pour le reveal des cartes upgrade.
    if (state.screen === 'upgrade' && this.prevScreen !== 'upgrade') {
      // On vient d'arriver sur l'écran upgrade → démarre le reveal.
      this.upgradeAppearAt = now
    } else if (state.screen !== 'upgrade' && this.prevScreen === 'upgrade') {
      // On quitte l'écran upgrade → réinitialise pour le prochain level-up.
      this.upgradeAppearAt = -1
    }
    // Slam-in du logo : joué UNE fois à l'ENTRÉE sur le titre (classe portée par la
    // racine, découplée du re-render de nav ; retirée une fois l'anim jouée).
    if (state.screen === 'title' && this.prevScreen !== 'title') {
      this.root.classList.add('arc-slam')
      window.setTimeout(() => this.root.classList.remove('arc-slam'), 1700)
    }
    this.prevScreen = state.screen

    const sig = this.computeSignature(state)
    const needsRebuild = sig !== this.signature
    if (needsRebuild) {
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

    // Stagger reveal des cartes upgrade : mis à jour en-place chaque frame
    // (sans reconstruire le panneau) pour que l'animation survive au cache de signature.
    if (state.screen === 'upgrade') {
      const elapsedMs = this.upgradeAppearAt >= 0 ? now - this.upgradeAppearAt : Number.MAX_SAFE_INTEGER
      const cardEls = this.screenLayer.querySelectorAll<HTMLElement>('.card')
      cardEls.forEach((el, i) => {
        const st = cardEnterStyle(elapsedMs, i)
        el.style.opacity = String(st.opacity)
        el.style.transform = `translateY(${st.translateYpx}px)`
      })
    }
  }

  // --- panneaux -------------------------------------------------------------

  private titlePanel(state: AppViewState): HTMLElement {
    const panel = h(
      'div',
      { className: 'panel' },
      h('div', { className: 'panel__title logo' },
        h('div', { className: 'logo__flash', attrs: { 'aria-hidden': 'true' } }),
        h('div', { className: 'logo__topper', text: 'SUPER CHANTIER-001' }),
        h('div', { className: 'logo__btp', text: 'BTP' }),
        h('div', { className: 'logo__carnage', text: 'CARNAGE' }),
        h('div', { className: 'logo__dust', attrs: { 'aria-hidden': 'true' } })
      ),
      h('p', { className: 'panel__subtitle', text: 'Survis au chantier' }),
      this.menuList(state),
      h('p', { className: 'hint-line', text: 'Manette ou clavier · Valider: A / Entrée' })
    )
    if (state.goldSkin) {
      panel.append(h('p', { className: 'unlock-line', text: 'Casque doré débloqué' }))
    }
    // Habillage arcade (planche 2a) : barre 1UP/HI-SCORE/2UP en haut ; INSERT COIN,
    // bandeau PUSH START, CREDIT et copyright en bas. Purement décoratif (le vrai
    // menu reste dans `.panel`). HI-SCORE persisté en localStorage.
    const arcbar = h('div', { className: 'arcbar', attrs: { 'aria-hidden': 'true' } },
      h('span', { className: 'arcbar__cell', text: '1UP 001250' }),
      h('span', { className: 'arcbar__cell arcbar__hi', text: `HI-SCORE ${String(readHiScore()).padStart(6, '0')}` }),
      h('span', { className: 'arcbar__cell arcbar__2up', text: '2UP 000000' })
    )
    const chrome = h('div', { className: 'title-chrome', attrs: { 'aria-hidden': 'true' } },
      h('div', { className: 'insertcoin', text: 'INSERT COIN' }),
      h('div', { className: 'pushstart' }, h('span', { className: 'pushstart__label', text: 'PUSH START' })),
      h('div', { className: 'title-credits' },
        h('span', { className: 'credit', text: 'CREDIT 00' }),
        h('span', { className: 'studio', text: '© 2026 AIL ENTERTAINMENT' })
      )
    )
    // Décor : ouvriers de chantier assombris en bas (frame 0 = face, croppée),
    // silhouettes d'ambiance derrière le menu et l'habillage.
    const base = import.meta.env.BASE_URL
    const crew = h('div', { className: 'title-crew', attrs: { 'aria-hidden': 'true' } },
      h('div', { className: 'crew-fig crew-fig--left' }, h('img', { className: 'crew-fig__img', attrs: { src: `${base}player_terrassier.png`, alt: '' } })),
      h('div', { className: 'crew-fig crew-fig--right' }, h('img', { className: 'crew-fig__img', attrs: { src: `${base}player_soudeur.png`, alt: '' } }))
    )
    // Décor titre tramé derrière le panneau (screen--title allège le voile sombre).
    return h('div', { className: 'screen screen--title' },
      h('img', { className: 'title-bg', attrs: { src: `${base}bg_dusk.png`, alt: '' } }),
      crew,
      arcbar,
      panel,
      chrome
    )
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
    // Écran de level-up ouvert → masque et SUSPEND les bandeaux « toast » : ils sont
    // dans une couche AU-DESSUS de screenLayer et couvriraient les cartes (bug 2d).
    // Le dernier bandeau suspendu est rejoué à la fermeture.
    const suspend = state.screen === 'upgrade'
    if (suspend && !this.bannerSuspended) {
      this.bannerSuspended = true
      clear(this.bannerLayer)
      if (this.bannerTimer !== null) {
        window.clearTimeout(this.bannerTimer)
        this.bannerTimer = null
      }
    } else if (!suspend && this.bannerSuspended) {
      this.bannerSuspended = false
      const held = this.pendingBanner
      this.pendingBanner = null
      if (held !== null) {
        this.showBanner(held.text, held.className)
      }
    }
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

  /**
   * B5 — Panneau « jackpot » (machine à sous arcade) déclenché à la prise d'un
   * coffre d'évolution. Affiche une roulette pixel qui défile (~1.1s) et s'arrête
   * sur le nom de l'arme évoluée, avec un flash final.
   *
   * Purement cosmétique : l'évolution est déjà appliquée par la sim au moment de
   * l'appel. Le panneau se ferme automatiquement après `totalMs` ms.
   * Ne bloque aucune interaction, ne perturbe pas le déterminisme.
   *
   * @param weaponName  Nom de l'arme évoluée (résolu côté `main.ts` via `WEAPONS`).
   * @param onDone      Callback optionnel appelé à la fermeture du panneau.
   */
  private clearJackpotTimers(): void {
    for (const id of this.jackpotTimers) { window.clearTimeout(id) }
    this.jackpotTimers = []
    if (this.jackpotRaf !== null) {
      cancelAnimationFrame(this.jackpotRaf)
      this.jackpotRaf = null
    }
  }

  /**
   * Machine à sous (casino) jouée à CHAQUE ouverture de coffre. Reprend l'esprit
   * de l'ancienne version : coffre qui rebondit + pluie de pièces + rouleau(x)
   * d'icônes d'armes qui décélèrent (cubic-bezier + léger overshoot) → arrêt PILE
   * sur le gain + flash blanc→doré. `isSuper` (évolution) : 3 rouleaux « escalier »
   * alignés sur le même gain (triple-match) + cadre arc-en-ciel.
   *
   * Purement cosmétique (l'issue est déjà appliquée par la sim). S'auto-ferme.
   * Ne bloque aucune interaction — pour les cartes, la roulette se joue par-dessus
   * l'écran de choix (temps gelé), qui apparaît quand elle se dismisse.
   */
  showSlotMachine(outcome: ChestOpenView, onDone?: () => void): void {
    this.clearJackpotTimers()
    clear(this.jackpotLayer)

    const CELL = 96 // hauteur d'une cellule (== CSS .jackpot__cell) — plus de désync itemH
    const WINNER_INDEX = 13 // le gain arrive après 13 leurres (défilement franc)
    const BUFFER = 2 // cellules après le gain (couvre l'overshoot du cubic-bezier)
    const isSuper = outcome.isSuper
    const nReels = isSuper ? 3 : 1

    // Durées (ms) — total borné < 2,5 s (contrainte e2e).
    const anticipationMs = 340
    const spinMs = 1180
    const staggerMs = 180
    const settleTailMs = 500 // laisse le gain lisible (total super ≈ 2380 ms < 2,5 s e2e)
    const lastReelStart = anticipationMs + (nReels - 1) * staggerMs
    const flashAtMs = lastReelStart + spinMs
    const totalMs = flashAtMs + settleTailMs

    // Titre + libellé de révélation selon l'issue (aucun emoji — DA + e2e).
    const title = outcome.kind === 'evolution' ? 'ÉVOLUTION' : 'COFFRE'
    const revealLabel =
      outcome.kind === 'evolution'
        ? (outcome.weaponName ?? 'Arme évoluée')
        : outcome.kind === 'cards'
          ? 'Choisis ta carte'
          : 'Soin d\'urgence'

    // Construit la cellule gagnante selon l'issue (icône d'arme / tuile ? / tuile +).
    const winnerCell = (): HTMLElement => {
      if (outcome.kind === 'evolution' && outcome.weaponId !== null) {
        const cell = h('div', { className: 'jackpot__cell jackpot__cell--winner' })
        cell.append(icon(outcome.weaponId, outcome.weaponName ?? '', 'jackpot__icon', 'jackpot__icon-img', 'jackpot__icon-mono'))
        return cell
      }
      const glyph = outcome.kind === 'heal' ? '+' : '?'
      const mod = outcome.kind === 'heal' ? 'jackpot__cell--heal' : 'jackpot__cell--mystery'
      return h('div', { className: `jackpot__cell jackpot__cell--winner ${mod}` }, h('div', { className: 'jackpot__glyph', text: glyph }))
    }

    // Un rouleau : WINNER_INDEX leurres (icônes d'armes) + gain + BUFFER leurres.
    const buildReel = (): HTMLElement => {
      const reel = h('div', { className: 'jackpot__reel' })
      for (let i = 0; i < WINNER_INDEX; i++) {
        const filler = h('div', { className: 'jackpot__cell' })
        const id = SLOT_FILLER_ICONS[(i * 7 + reel.childElementCount) % SLOT_FILLER_ICONS.length] ?? 'cloueur'
        filler.append(icon(id, id, 'jackpot__icon', 'jackpot__icon-img', 'jackpot__icon-mono'))
        reel.append(filler)
      }
      reel.append(winnerCell())
      for (let i = 0; i < BUFFER; i++) {
        const filler = h('div', { className: 'jackpot__cell' })
        const id = SLOT_FILLER_ICONS[(WINNER_INDEX + i) % SLOT_FILLER_ICONS.length] ?? 'cloueur'
        filler.append(icon(id, id, 'jackpot__icon', 'jackpot__icon-img', 'jackpot__icon-mono'))
        reel.append(filler)
      }
      reel.style.transform = 'translateY(0px)'
      return reel
    }

    const reels: HTMLElement[] = []
    const reelsRow = h('div', { className: 'jackpot__reels' })
    for (let r = 0; r < nReels; r++) {
      const reel = buildReel()
      reels.push(reel)
      reelsRow.append(h('div', { className: 'jackpot__window' }, reel))
    }

    // Pluie de pièces pixel (or) — quantité bornée (perf).
    const coins = h('div', { className: 'jackpot__coins' })
    const COIN_COUNT = 16
    for (let i = 0; i < COIN_COUNT; i++) {
      const coin = h('div', { className: 'jackpot__coin' })
      coin.style.left = `${(i * 6.1 + 3) % 100}%`
      coin.style.animationDelay = `${(i % 8) * 130}ms`
      coin.style.animationDuration = `${1600 + (i % 5) * 260}ms`
      coins.append(coin)
    }

    const panel = h(
      'div',
      { className: isSuper ? 'jackpot jackpot--super' : 'jackpot' },
      coins,
      h('div', { className: 'jackpot__chest' }),
      h('div', { className: 'jackpot__title', text: title }),
      reelsRow
    )
    this.jackpotLayer.append(panel)
    panel.classList.add('jackpot--charging')

    // Démarre chaque rouleau (transition CSS avec léger overshoot final), décalés
    // en « escalier » pour le super. translateY cible = arrêt PILE sur le gain.
    const targetY = -(WINNER_INDEX * CELL)
    reels.forEach((reel, r) => {
      this.jackpotTimers.push(window.setTimeout(() => {
        if (!panel.isConnected) { return }
        if (r === 0) { panel.classList.remove('jackpot--charging') }
        reel.style.transition = `transform ${spinMs}ms cubic-bezier(0.16, 0.86, 0.28, 1.12)`
        reel.style.transform = `translateY(${targetY}px)`
      }, anticipationMs + r * staggerMs))
    })

    // Flash blanc→doré + révélation du gain quand le dernier rouleau se pose.
    this.jackpotTimers.push(window.setTimeout(() => {
      if (!panel.isConnected) { return }
      panel.classList.add('jackpot--flash')
      panel.append(h('div', { className: 'jackpot__reveal', text: revealLabel }))
    }, flashAtMs))

    // Fermeture automatique (garde isConnected → pas d'action sur un panneau remplacé).
    this.jackpotTimers.push(window.setTimeout(() => {
      this.clearJackpotTimers()
      clear(this.jackpotLayer)
      onDone?.()
    }, totalMs))
  }

  private showBanner(text: string, className: string): void {
    // Level-up ouvert → on met en file (rejoué à la fermeture) au lieu de couvrir les cartes.
    if (this.bannerSuspended) {
      this.pendingBanner = { text, className }
      return
    }
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
    const sig = [...inv.weapons, ...inv.passives].map((e) => `${e.id}:${e.level}:${e.evolveReady ? 1 : 0}`).join(',')
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
        h('div', { className: 'inv__row' }, ...inv.weapons.map((e) => this.invTile(e, false))),
        h('div', { className: 'inv__row inv__row--passives' }, ...inv.passives.map((e) => this.invTile(e, true)))
      )
    )
  }

  /**
   * Une tuile d'inventaire : icône (ou monogramme de secours) + pastille de niveau.
   * @param small - true pour la rangée passifs (~56×56, classe `inv__tile--sm`)
   */
  private invTile(entry: InventoryEntry, small: boolean): HTMLElement {
    const evolveReady = entry.evolveReady === true
    const baseClass = small ? 'inv__tile inv__tile--sm' : 'inv__tile'
    const tileClass = evolveReady ? `${baseClass} inv__tile--evolve-ready` : baseClass
    const children: HTMLElement[] = [
      icon(entry.id, entry.name, 'inv__icon', 'inv__img', 'inv__mono'),
      h('div', { className: 'inv__lvl', text: `${entry.level}/${entry.maxLevel ?? entry.level}` })
    ]
    if (evolveReady) {
      children.push(h('div', { className: 'inv__evolve-mark' }))
    }
    if (evolveReady && entry.evolveHint !== undefined) {
      return h('div', { className: tileClass, attrs: { title: entry.evolveHint } }, ...children)
    }
    return h('div', { className: tileClass }, ...children)
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
    const report = state.deathReport
    // Garde-fou : si le rapport est absent, panneau minimal sans crash.
    if (report === null) {
      return h(
        'div',
        { className: 'screen' },
        h(
          'div',
          { className: 'panel' },
          h('h1', { className: 'panel__title', text: 'CHANTIER INTERROMPU' }),
          this.menuList(state)
        )
      )
    }

    // 1. Titre.
    const title = h('h1', { className: 'report__title', text: 'CHANTIER INTERROMPU' })

    // 2. Phrase culte ou moquerie (emphase si progressRatio > 0.8).
    const isCult = report.progressRatio > 0.8
    const quoteEl = h(
      'p',
      { className: isCult ? 'report__quote report__quote--cult' : 'report__quote' },
      `« ${report.quote} »`
    )

    // 3. Barre Cuphead — marqueur clampé dans [3, 94] pour ne jamais sortir du rail.
    const markerPct = Math.max(3, Math.min(report.progressPercent, 94))
    const markerImg = h('img', {
      className: 'report__marker',
      attrs: { src: 'ui_death_marker.png', alt: '' }
    })
    markerImg.style.left = `${markerPct}%`

    const bar = h(
      'div',
      { className: 'report__bar' },
      h('img', { className: 'report__start', attrs: { src: 'ui_death_start.png', alt: '' } }),
      markerImg,
      h('img', { className: 'report__end', attrs: { src: 'ui_death_flag.png', alt: '' } })
    )

    // 4. Stats.
    const stats = h(
      'div',
      { className: 'report__stats' },
      h('span', { text: `${report.progressPercent} % terminé` }),
      h('span', { text: `Temps tenu : ${formatTime(report.elapsedMs)} / ${formatTime(report.stageDurationMs)}` }),
      h('span', { text: `Ennemis tués : ${formatNumber(report.kills)}` }),
      h('span', { text: `Plus que ${formatTime(report.remainingSeconds * 1000)} avant validation.` })
    )

    // 5. Boutons via menuList (inchangé).
    return h(
      'div',
      { className: 'screen' },
      h('div', { className: 'panel' }, title, quoteEl, bar, stats, this.menuList(state))
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


const MONOGRAM_STOPWORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'et'])

/** Monogramme d'une carte : initiales des 2 premiers mots significatifs, en capitales (icône de secours). */
function monogram(label: string): string {
  const all = label.split(/[\s-]+/).filter((w) => w.length > 0)
  const significant = all.filter((w) => !MONOGRAM_STOPWORDS.has(w.toLowerCase()))
  const words = significant.length > 0 ? significant : all
  return words.slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase()
}

/**
 * Icônes d'armes servant de LEURRES aux rouleaux de la machine à sous (cosmétique
 * pur — si un fichier `icon_<id>_64.png` manque, `icon()` bascule sur le monogramme).
 * Liste figée côté UI (l'overlay ne dépend pas de `src/content`).
 */
const SLOT_FILLER_ICONS = [
  'cloueur', 'scie', 'marteau', 'brouette', 'goudron',
  'cle_molette', 'pied_de_biche', 'air_comprime', 'court_circuit', 'chalumeau'
]

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
