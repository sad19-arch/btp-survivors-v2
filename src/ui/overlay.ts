import { h, clear } from './h'
import { injectStyles } from './styles'
import { formatTime, formatNumber } from './format'
import { playerColor } from '@content/players'
import { gamepadHudModel } from './gamepadHud'
import { Minimap } from './minimap'
import { approach } from './anim'
import { cardEnterStyle } from './cardEnter'
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
  /** Carton d'intro affiché (évite de le reconstruire chaque frame). */
  private introShown = false
  /**
   * Nom de l'arme pour laquelle le jackpot+bandeau ont déjà été déclenchés
   * (null = pas encore ou déjà consommé). Garde contre les appels répétés dans
   * la fenêtre d'un même pas sim où `justEvolvedWeaponName` est non-null.
   */
  private lastJackpotWeaponName: string | null = null
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
    this.jackpotLayer = h('div')
    this.minimap = new Minimap()
    this.minimap.setVisible(false)
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
    // Jackpot coffre : déclenché une seule fois par évolution (garde sur le nom
    // pour éviter de rejouer l'animation sur chaque rAF frame tant que le flag
    // transitoire est non-null). Le nom est résolu côté App (overlay sans dep content).
    if (state.justEvolvedWeaponName !== null && state.justEvolvedWeaponName !== this.lastJackpotWeaponName) {
      this.lastJackpotWeaponName = state.justEvolvedWeaponName
      this.showJackpot(state.justEvolvedWeaponName)
      this.showEvolutionBanner(state.justEvolvedWeaponName)
    } else if (state.justEvolvedWeaponName === null) {
      // Flag remis à null (nouveau pas sim) : réinitialise le verrou pour la prochaine évolution.
      this.lastJackpotWeaponName = null
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
        h('span', { text: `Score ${state.score}` })
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

  showJackpot(weaponName: string, onDone?: () => void): void {
    // Annuler tout jackpot en cours (timers + rAF) avant de reconstruire.
    this.clearJackpotTimers()
    clear(this.jackpotLayer)

    // Liste d'items défilants (mots-clés chantier + nom final).
    const reelItems = [
      'Niveau max', 'Passif actif', 'Coffre ouvert', 'Combinaison',
      weaponName, 'Niveau max', 'Passif actif', weaponName
    ]

    // Durées (ms).
    const anticipationMs = 500  // phase de suspense avant la roulette
    const reelDurationMs = 900  // durée de défilement
    const flashDelayMs = 950     // flash après arrêt de la roulette
    const totalMs = 1500         // durée de la roulette avant fermeture

    const itemH = 48 // hauteur d'un item en px (sync CSS .jackpot__item height)
    const winnerIndex = reelItems.length - 1 // dernier item = le vrai nom

    const reel = h('div', { className: 'jackpot__reel' })
    reelItems.forEach((label, i) => {
      reel.append(h('div', {
        className: i === winnerIndex ? 'jackpot__item jackpot__item--winner' : 'jackpot__item',
        text: label
      }))
    })

    // Position initiale : tout en haut (item 0 visible).
    reel.style.transform = 'translateY(0px)'

    const window_ = h('div', { className: 'jackpot__window' }, reel)
    const panel = h(
      'div',
      { className: 'jackpot' },
      h('div', { className: 'jackpot__title', text: 'Evolution' }),
      window_
    )
    this.jackpotLayer.append(panel)

    // ── Phase d'anticipation (~500 ms) : panneau pulsé/tremblant avant la roulette.
    panel.classList.add('jackpot--charging')

    // Timer 1 : fin de l'anticipation → démarre la roulette.
    this.jackpotTimers.push(window.setTimeout(() => {
      panel.classList.remove('jackpot--charging')

      // Animation de défilement CSS via requestAnimationFrame : décélération cubic-ease.
      const targetY = -(winnerIndex * itemH)
      const startTime = performance.now()

      const animate = (now: number): void => {
        const elapsed = now - startTime
        const t = Math.min(elapsed / reelDurationMs, 1)
        // Ease-out cubic : rapide au début, ralentit à la fin.
        const ease = 1 - (1 - t) ** 3
        const y = targetY * ease
        reel.style.transform = `translateY(${Math.round(y)}px)`
        if (t < 1) {
          this.jackpotRaf = requestAnimationFrame(animate)
        } else {
          this.jackpotRaf = null
        }
      }
      this.jackpotRaf = requestAnimationFrame(animate)

      // Timer 2 : flash pixel après arrêt de la roulette (DA-safe : animation CSS steps).
      this.jackpotTimers.push(window.setTimeout(() => {
        panel.classList.add('jackpot--flash')
      }, flashDelayMs))

      // Timer 3 : fermeture automatique.
      this.jackpotTimers.push(window.setTimeout(() => {
        this.clearJackpotTimers()
        clear(this.jackpotLayer)
        onDone?.()
      }, totalMs))
    }, anticipationMs))
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
