import { h, clear } from './h'
import { injectStyles } from './styles'
import { PALETTE } from './palette'
import { formatTime, formatNumber } from './format'
import { playerColor } from '@content/players'
import { gamepadHudModel } from './gamepadHud'
import { Minimap } from './minimap'
import type { ViewportState } from './viewport'
import { approach } from './anim'
import { cardEnterStyle } from './cardEnter'
import { readHiScore } from './hiscore'
import { CHARACTER_IDS, DEFAULT_CHARACTER_ID, characterDef } from '@content/characters'
import { WEAPONS } from '@content/weapons'
import { STAR_SLOTS } from '@content/stars'
import type { AchievementEntryView, AppViewState, AppPlayerState, InventoryEntry, MenuItemView, ChestOpenView, ChestResultView } from '@/app/appState'

// ── Timings de la machine à sous (coffre) — PARTAGÉS avec le gel côté app ──────
// La partie est GELÉE pendant TOUTE la durée de la révélation (skippable avec A) ;
// le `settle` long (+2 s vs l'ancienne version) laisse SAVOURER le gain (dopamine).
const CHEST_ANTICIPATION_MS = 340
const CHEST_SPIN_MS = 1180
const CHEST_STAGGER_MS = 180
const CHEST_SETTLE_TAIL_MS = 2500
/** Durée totale de la machine à sous selon le nombre de rouleaux (= nombre d'issues). */
export function chestRevealTotalMs(nReels: number): number {
  return CHEST_ANTICIPATION_MS + Math.max(0, nReels - 1) * CHEST_STAGGER_MS + CHEST_SPIN_MS + CHEST_SETTLE_TAIL_MS
}

/** Durée d'affichage d'un trophée (ms). */
export const TROPHY_VISIBLE_MS = 3000
/** Battement entre deux trophées (ms) — sinon ils se lisent comme un seul. */
export const TROPHY_GAP_MS = 200
/** Plafond de la file d'attente (hors trophée affiché). */
export const MAX_ACHIEVEMENT_QUEUE = 4

/** Vue d'un succès pour le toast (sous-ensemble d'`AchievementDef`, sans le prédicat). */
export interface AchievementToast {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly icon?: string
}

/**
 * Punchlines arcade par personnage (couche UI, purement cosmétique). Une phrase
 * d'accroche « select screen » façon borne, affichée sous le portrait dans le
 * sélecteur de personnage. Indexé par `CharacterDef.id`.
 */
const PUNCHLINES: Readonly<Record<string, string>> = {
  ouvrier: 'Polyvalent, increvable. Cloue tout ce qui bouge.',
  soudeur: 'Fait tourner ses lames, personne n\'approche.',
  macon: 'Béton dans les veines, marteau-piqueur en main.',
  terrassier: 'Ouvre les hostilités au pied-de-biche.',
  electricien: 'Envoie le jus. 380 volts dans la nuque.',
  ouvriere: 'Charge la brouette et écrase tout devant.',
  charpentier: 'Ses boulons ricochent de crâne en crâne.',
  grutier: 'Étale du goudron brûlant sur leur passage.',
  plombier: 'Sa clé revient toujours, comme un boomerang.',
  samoyede: 'La mascotte. Mousse tout le monde à l\'extincteur.'
}

/**
 * La clé de feuille 'player' (ouvrier) mappe le fichier de référence `player_j1.png`
 * (cf. GameScene.SHARED_SHEETS) : aucun `player.png` n'existe. Résolu ici pour les <img> DOM
 * (portrait du sélecteur de perso, portrait du bloc HUD co-op).
 */
function sheetFile(sheet: string): string {
  return sheet === 'player' ? 'player_j1' : sheet
}

/** En dessous de cette fraction de PV, la vignette « alerte sécurité » bat (juice #3). */
const LOW_HP_FRACTION = 0.3
/** Durée du flash de dégât reçu (ms) — bref accent d'impact (juice #4). */
const HURT_FLASH_MS = 150
/** Opacité de crête du flash de dégât (fond it depuis là vers 0 sur `HURT_FLASH_MS`). */
const HURT_FLASH_PEAK = 0.4
/** Perte de PV minimale (≥) pour déclencher un flash — filtre le bruit numérique. */
const HP_LOSS_EPS = 0.5

/** Fenêtre glissante d'un enchaînement (juice #7) : sans kill pendant ce délai, la cadence retombe. */
const COMBO_WINDOW_MS = 2000
/** En dessous de ce compteur, la CADENCE ne s'affiche pas (on ne montre pas les mini-streaks). */
const CADENCE_MIN = 5
/** Paliers de couleur de la cadence (montée en intensité) — bornes basses. */
const CADENCE_TIERS: ReadonlyArray<{ min: number; color: string }> = [
  { min: 50, color: PALETTE.cyanAccent },
  { min: 30, color: PALETTE.rougeAlerte },
  { min: 15, color: PALETTE.orangeDanger },
  { min: 0, color: PALETTE.jauneSecurite }
]
/** Palier de célébration (juice #8) : un bandeau tous les N kills. */
const MILESTONE_STEP = 100
/** Durée d'affichage du bandeau de palier (ms). */
const MILESTONE_SHOW_MS = 1400

/** Taille de base (px) du chiffre de CADENCE, avant croissance. */
const CADENCE_FONT_BASE_PX = 26
/** Croissance (px) par kill dans l'enchaînement — retour playtest : « de plus en plus gros ». */
const CADENCE_FONT_GROWTH_PX = 0.5
/** Taille max (px) — borne pour ne pas déborder le panneau `.cadence`. */
const CADENCE_FONT_MAX_PX = 54

/** Taille du chiffre de CADENCE pour un enchaînement donné. Fonction PURE → testable. */
export function cadenceFontSizePx(comboCount: number): number {
  return Math.min(CADENCE_FONT_MAX_PX, CADENCE_FONT_BASE_PX + comboCount * CADENCE_FONT_GROWTH_PX)
}

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
  /** Couche DÉDIÉE des trophées de succès — canal distinct des bandeaux boss/évolution. */
  private readonly achievementLayer: HTMLElement
  /**
   * File FIFO des trophées EN ATTENTE (le trophée affiché n'y est plus).
   * Une vraie file, pas un scalaire : plusieurs succès tombent dans la même frame.
   */
  private readonly achievementQueue: AchievementToast[] = []
  /** Trophée actuellement à l'écran (null = voie libre). */
  private achievementShowing: AchievementToast | null = null
  /** Timer du trophée courant (affichage puis battement). */
  private achievementTimer: number | null = null
  /** Canal suspendu tant que l'écran de level-up (modal) est ouvert. */
  private achievementSuspended = false
  /** Ids déjà passés à l'écran — un succès ne se rejoue pas (double `commitRun`). */
  private readonly achievementSeen = new Set<string>()
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
  /** Dernier `chestSkipToken` vu : un changement pendant une révélation = SKIP (A). */
  private lastChestSkipToken = 0
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

  /** Invite « tourne l'appareil » (tactile + portrait) — P6 mobile paysage. */
  private readonly rotateHint: HTMLElement

  /**
   * Couche des blocs HUD par joueur (co-op ≥ 2 joueurs) : un bloc par coin d'écran.
   * Vide en solo — le HUD solo historique reste strictement inchangé.
   */
  private readonly coopLayer: HTMLElement

  /** Feedback combat plein écran : vignette PV bas (persistante, juice #3). */
  private readonly combatFxDanger: HTMLElement
  /** Feedback combat plein écran : flash de dégât reçu (bref, juice #4). */
  private readonly combatFxHurt: HTMLElement
  /** PV mémorisés par joueur — détecte une PERTE (flash) sans event dédié. */
  private readonly lastHp = new Map<number, number>()
  /** Échéance (performance.now) du flash de dégât ; -1 = inactif. */
  private hurtFlashUntil = -1

  /** CADENCE (combo, juice #7) : panneau + chiffre + barre de fenêtre. */
  private readonly cadenceEl: HTMLElement
  private readonly cadenceLabelEl: HTMLElement
  private readonly cadenceFillEl: HTMLElement
  /** Bandeau de palier (juice #8). */
  private readonly milestoneEl: HTMLElement
  /** Score de la frame précédente — dérive l'enchaînement des deltas de kills (comme #3/#4). */
  private prevScore = -1
  /** Enchaînement courant + échéance de la fenêtre glissante. */
  private comboCount = 0
  private comboExpiresAt = -1
  /** Dernier palier de 100 kills déjà célébré (0 = aucun), + échéance du bandeau. */
  private celebratedMilestone = 0
  private milestoneUntil = -1
  /**
   * Horloge virtuelle de la CADENCE (retour playtest) : n'avance QUE hors modale de
   * coffre (`state.chestOpen`). `lastCadenceRealNow` = dernier `performance.now()` vu
   * (calcule le dt réel à intégrer) ; -1 = non initialisée.
   */
  private cadenceClockMs = 0
  private lastCadenceRealNow = -1

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
    this.coopLayer = h('div', { className: 'phud-layer' })
    this.jackpotLayer = h('div')
    this.achievementLayer = h('div', { className: 'trophy-layer' })
    this.minimap = new Minimap()
    this.minimap.setVisible(false)
    // Feedback combat plein écran : vignette PV bas + flash de dégât. Attaché tôt
    // (sous le HUD) pour ne pas obscurcir le texte. Piloté par `syncCombatFeedback`.
    this.combatFxDanger = h('div', { className: 'combat-fx__danger' })
    this.combatFxHurt = h('div', { className: 'combat-fx__hurt' })
    // CADENCE (combo #7) + bandeau de palier (#8) : éléments dédiés, pilotés par sync.
    this.cadenceLabelEl = h('span', { className: 'cadence__label' })
    this.cadenceFillEl = h('div', { className: 'cadence__fill' })
    this.cadenceEl = h('div', { className: 'cadence' },
      this.cadenceLabelEl,
      h('div', { className: 'cadence__bar' }, this.cadenceFillEl)
    )
    this.milestoneEl = h('div', { className: 'milestone' })
    // Cadre métal ouvragé (au fond) + couches UI + scanlines CRT (au-dessus). Décoratif.
    root.append(h('div', { className: 'frame' }))
    root.append(h('div', { className: 'combat-fx' }, this.combatFxDanger, this.combatFxHurt))
    root.append(this.cadenceEl, this.milestoneEl)
    root.append(
      this.hud,
      this.screenLayer,
      this.bannerLayer,
      this.introLayer,
      this.bossLayer,
      this.inventoryLayer,
      this.padLayer,
      this.coopLayer,
      this.jackpotLayer,
      this.achievementLayer,
      this.minimap.el
    )
    root.append(h('div', { className: 'frame__scan' }))
    // Invite « tourne l'appareil » (P6) : superposée en tactile + portrait ; masquée
    // par défaut, montrée par applyResponsive. Le jeu se joue en PAYSAGE.
    this.rotateHint = h('div', { className: 'rotate-hint' },
      h('div', { className: 'rotate-hint__icon', attrs: { 'aria-hidden': 'true' } }),
      h('div', { className: 'rotate-hint__title', text: 'TOURNE L\'APPAREIL' }),
      h('div', { className: 'rotate-hint__sub', text: 'Le chantier se joue en paysage' })
    )
    root.append(this.rotateHint)
    // Splash studio « AIL Entertainment » : affiché au boot, retiré par le boot
    // (dismissStudioSplash) dès que l'audio est prêt / au 1er input — la voix « presents »
    // l'accompagne À COUP SÛR. L'invite « appuie pour commencer » clignote après le reveal.
    const base = import.meta.env.BASE_URL
    const splash = h('div', { className: 'splash' },
      h('div', { className: 'splash__gyro' }),
      h('div', { className: 'splash__flash' }),
      h('img', { className: 'splash__helmet', attrs: { src: `${base}ui_casque.png`, alt: '' } }),
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
    // P6 : sur un vrai tactile tenu en portrait, invite à tourner (jeu = paysage).
    // Jamais sur desktop (pointer) — une fenêtre étroite reste jouable à la souris.
    const showRotate = v.inputType === 'touch' && v.orientation === 'portrait'
    this.rotateHint.classList.toggle('rotate-hint--show', showRotate)
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
    // Canal SÉPARÉ des bandeaux : un trophée ne doit ni tuer ni subir un bandeau boss.
    this.syncAchievements(state)
    this.syncIntroCard(state)
    this.syncBossBar(state)
    this.syncInventory(state)
    this.syncGamepads(state)
    this.syncMinimap(state)
    this.syncCombatFeedback(state, now)
    this.syncCadence(state, now)
    // Machine à sous coffre : déclenchée UNE fois à chaque ouverture de coffre
    // (les 3 issues), via le one-shot `chestOpen`. Garde `chestSlotShown` pour ne
    // pas rejouer à chaque rAF tant que `chestOpen` reste non-null.
    const chest = state.chestOpen
    if (chest !== null && !this.chestSlotShown) {
      this.chestSlotShown = true
      this.showSlotMachine(chest)
      const evo = chest.results.find((r) => r.kind === 'evolution')
      if (evo !== undefined && evo.weaponName !== null) {
        this.showEvolutionBanner(evo.weaponName)
      }
    } else if (chest === null) {
      this.chestSlotShown = false
    }
    // SKIP (A) : le token a changé pendant une révélation → ferme la machine à sous
    // immédiatement (la partie a déjà été dégelée côté app ; le résultat est appliqué).
    if (state.chestSkipToken !== this.lastChestSkipToken) {
      this.lastChestSkipToken = state.chestSkipToken
      if (this.chestSlotShown) {
        this.skipSlotMachine()
      }
    }
  }

  /** Ferme immédiatement la machine à sous (skip A) : coupe les timers + vide le panneau. */
  private skipSlotMachine(): void {
    this.clearJackpotTimers()
    clear(this.jackpotLayer)
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
   * Feedback combat plein écran (juice, observer-only) :
   *  - vignette « alerte sécurité » PERSISTANTE tant qu'un joueur vivant est sous
   *    `LOW_HP_FRACTION` (le plus bas des joueurs vivants pilote) ;
   *  - flash de dégât BREF quand un joueur perd des PV entre deux frames.
   *
   * Piloté par les DELTAS de PV lus dans l'état (comme le flash de level-up),
   * sans nouvel abonnement : la perte n'existe que pendant le jeu, jamais au reset
   * (les PV mémorisés sont purgés hors run → pas de faux flash au (re)départ).
   */
  private syncCombatFeedback(state: AppViewState, now: number): void {
    const inRun = state.screen === 'game' && !state.introActive
    if (!inRun) {
      this.lastHp.clear()
      this.hurtFlashUntil = -1
      this.combatFxDanger.classList.remove('combat-fx__danger--on')
      this.combatFxHurt.style.opacity = '0'
      return
    }
    let hurt = false
    let minFrac = 1
    for (const p of state.players) {
      if (!p.alive) {
        continue
      }
      const frac = p.maxHp > 0 ? p.hp / p.maxHp : 0
      minFrac = Math.min(minFrac, frac)
      const prev = this.lastHp.get(p.id)
      if (prev !== undefined && p.hp <= prev - HP_LOSS_EPS) {
        hurt = true
      }
      this.lastHp.set(p.id, p.hp)
    }
    if (hurt) {
      this.hurtFlashUntil = now + HURT_FLASH_MS
    }
    // Vignette : anneau battant tant que le plus bas des vivants est en danger.
    this.combatFxDanger.classList.toggle('combat-fx__danger--on', minFrac < LOW_HP_FRACTION)
    // Flash : voile rouge dont l'opacité DÉCROÎT sur `HURT_FLASH_MS` (fondu par frame).
    const remain = this.hurtFlashUntil - now
    this.combatFxHurt.style.opacity =
      remain > 0 ? String((HURT_FLASH_PEAK * Math.min(1, remain / HURT_FLASH_MS)).toFixed(3)) : '0'
  }

  /**
   * CADENCE (combo, juice #7) + palier « N DÉBLAYÉS » (juice #8) — observer-only.
   * Dérivé des DELTAS de `state.score` (= kills) en `sync()`, comme le flash de
   * dégât (#4) : aucun event, aucune donnée de sim ajoutée. L'enchaînement grimpe
   * à chaque kill et retombe après `COMBO_WINDOW_MS` sans kill ; tous les 100 kills,
   * un bandeau doré célèbre le palier (le SON/rumble est géré côté GameScene).
   */
  private syncCadence(state: AppViewState, now: number): void {
    const inRun = state.screen === 'game' && !state.introActive
    if (!inRun) {
      this.prevScore = -1
      this.comboCount = 0
      this.comboExpiresAt = -1
      this.celebratedMilestone = 0
      this.milestoneUntil = -1
      this.lastCadenceRealNow = -1
      this.cadenceClockMs = 0
      this.cadenceEl.classList.remove('cadence--on')
      this.milestoneEl.classList.remove('milestone--on')
      return
    }
    // Horloge VIRTUELLE (retour playtest) : n'avance PAS tant qu'une modale de coffre
    // est affichée (`state.chestOpen`) — sinon la fenêtre de combo/le bandeau de palier
    // se vident en temps RÉEL pendant que le joueur regarde un spectacle où la partie
    // est totalement gelée. Miroir de comment `chestRevealMsLeft` gèle la sim côté app.
    // `lastCadenceRealNow` est INVALIDÉ (-1) tant qu'on est gelé : le premier appel
    // suivant le dégel ne crédite PAS tout le temps réel écoulé PENDANT le gel (sinon
    // la fenêtre saute d'un coup à la réouverture au lieu de reprendre son décompte).
    const frozen = state.chestOpen !== null
    if (frozen) {
      this.lastCadenceRealNow = -1
    } else {
      if (this.lastCadenceRealNow >= 0) {
        this.cadenceClockMs += Math.max(0, now - this.lastCadenceRealNow)
      }
      this.lastCadenceRealNow = now
    }
    const clock = this.cadenceClockMs

    const score = state.score
    // 1er passage de la run : mémorise sans dériver (pas de faux combo ni palier au (re)départ).
    if (this.prevScore < 0) {
      this.prevScore = score
      this.celebratedMilestone = Math.floor(score / MILESTONE_STEP)
    }
    const delta = score - this.prevScore
    if (delta > 0) {
      this.comboCount += delta
      this.comboExpiresAt = clock + COMBO_WINDOW_MS
    } else if (clock >= this.comboExpiresAt) {
      this.comboCount = 0
    }
    // Palier (#8) : franchissement d'un multiple de MILESTONE_STEP.
    const reached = Math.floor(score / MILESTONE_STEP)
    if (reached > this.celebratedMilestone) {
      this.celebratedMilestone = reached
      this.milestoneEl.textContent = `${reached * MILESTONE_STEP} DÉBLAYÉS`
      this.milestoneEl.classList.remove('milestone--on')
      void this.milestoneEl.offsetWidth // reflow → rejoue l'animation « pop »
      this.milestoneEl.classList.add('milestone--on')
      this.milestoneUntil = clock + MILESTONE_SHOW_MS
    }
    if (this.milestoneUntil > 0 && clock >= this.milestoneUntil) {
      this.milestoneEl.classList.remove('milestone--on')
      this.milestoneUntil = -1
    }
    // Rendu de la CADENCE : chiffre (taille croissante, bornée) + couleur de palier
    // + barre de fenêtre restante.
    if (this.comboCount >= CADENCE_MIN) {
      const color = CADENCE_TIERS.find((t) => this.comboCount >= t.min)?.color ?? PALETTE.jauneSecurite
      this.cadenceEl.classList.add('cadence--on')
      this.cadenceLabelEl.textContent = `CADENCE ×${this.comboCount}`
      this.cadenceLabelEl.style.color = color
      this.cadenceLabelEl.style.fontSize = `${cadenceFontSizePx(this.comboCount)}px`
      this.cadenceFillEl.style.backgroundColor = color
      const remain = Math.max(0, Math.min(1, (this.comboExpiresAt - clock) / COMBO_WINDOW_MS))
      this.cadenceFillEl.style.width = `${(remain * 100).toFixed(1)}%`
    } else {
      this.cadenceEl.classList.remove('cadence--on')
    }
    this.prevScore = score
  }

  /**
   * HUD manettes (coin haut-droit) : « Manettes N/4 » + 4 pastilles (une par
   * joueur, couleur `playerColor`, allumée si la manette du slot est connectée).
   * Source = `navigator.getGamepads()` (couche UI/DOM, jamais le cœur). Masqué
   * pendant l'intro. Reconstruit seulement quand l'état des manettes change.
   */
  private syncGamepads(state: AppViewState): void {
    // En co-op, chaque joueur a son bloc de coin (couleur + portrait) : le HUD
    // « Manettes » ferait doublon ET chevaucherait le bloc de J2 (haut-droite).
    // Gardé ICI et pas en CSS : `display` est posé en style inline plus bas, qui
    // l'emporterait sur toute règle de la feuille.
    const show = !state.introActive && state.players.length <= 1
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
      clear(this.coopLayer)
      this.root.classList.remove('coop')
      return
    }
    // Co-op (≥2 joueurs) : CHAQUE joueur a son bloc à son coin (portrait, PV, XP, armes)
    // et le HUD central ne garde que l'info de run. Solo (1 joueur) : HUD historique
    // strictement inchangé (rangée PV/XP incluse).
    const coop = state.players.length > 1
    this.root.classList.toggle('coop', coop)

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
        // En co-op le niveau est propre à chaque joueur → il vit dans son bloc, pas ici.
        ...(coop
          ? []
          : [
              h('span', { text: `Niv. ${state.players[0]?.level ?? 1}` }),
              h('span', { className: 'hud__sep', text: '·' })
            ]),
        h('span', { text: `Score ${state.score}` }),
        h('span', { className: 'hud__sep', text: '·' }),
        h('span', { className: 'hud__coins', text: `Or ${state.coins}` })
      )
    )

    if (!coop) {
      const p = state.players[0]
      const hp = p?.hp ?? 0
      const maxHp = p?.maxHp ?? 1
      const xp = p?.xp ?? 0
      const threshold = p?.nextThreshold ?? 1
      this.hud.append(
        h(
          'div',
          { className: 'hud__row' },
          h('span', { className: 'hud__hp', text: `PV ${Math.ceil(hp)}/${Math.round(maxHp)}` }),
          this.bar(hp / maxHp, 'hud__bar--hp'),
          h('span', { className: 'hud__xp', text: `XP ${Math.floor(xp)}/${threshold}` }),
          this.xpBar(p, dtMs, now)
        )
      )
      clear(this.coopLayer)
      return
    }

    clear(this.coopLayer)
    for (const player of state.players) {
      this.coopLayer.append(this.playerBlock(player, dtMs, now))
    }
  }

  /**
   * Barre d'XP lissée d'un joueur (lerp `approach` + flash de level-up ~220 ms).
   * L'état animé est mémorisé PAR `playerId` → marche identiquement en solo et en co-op.
   * La classe de flash est ré-appliquée tant que l'échéance court : le HUD étant
   * reconstruit chaque frame, sans ça le flash serait invisible.
   */
  private xpBar(player: AppPlayerState | undefined, dtMs: number, now: number): HTMLElement {
    const xp = player?.xp ?? 0
    const threshold = player?.nextThreshold ?? 1
    const level = player?.level ?? 1
    const playerId = player?.id ?? 1
    const xpTarget = threshold > 0 ? xp / threshold : 0
    const prevDisplayed = this.xpDisplayed.get(playerId) ?? xpTarget
    const displayed = approach(prevDisplayed, xpTarget, dtMs)
    this.xpDisplayed.set(playerId, displayed)
    const prevLevel = this.lastLevel.get(playerId)
    if (prevLevel !== undefined && level > prevLevel) {
      // Level-up : la barre repart de 0 (reset propre) et flashe.
      this.xpDisplayed.set(playerId, 0)
      this.xpFlashUntil.set(playerId, now + 220)
    }
    this.lastLevel.set(playerId, level)
    const flashing = now < (this.xpFlashUntil.get(playerId) ?? 0)
    return this.bar(displayed, flashing ? 'hud__bar--xp hud__bar--xp-flash' : 'hud__bar--xp')
  }

  /**
   * Bloc HUD d'un joueur (co-op) : portrait de SON perso, label `J{n}` à sa couleur,
   * barre de PV, barre d'XP + niveau, et SES armes/passifs. Placé à son coin d'écran
   * via `phud--p{id}` (J1 haut-gauche → J4 bas-droite). Atténué s'il est à terre.
   */
  private playerBlock(player: AppPlayerState, dtMs: number, now: number): HTMLElement {
    const color = playerColor(player.id)
    const base = import.meta.env.BASE_URL
    const def = characterDef(player.characterId ?? DEFAULT_CHARACTER_ID)
    const portrait = h('div', { className: 'phud__portrait' },
      h('img', { className: 'phud__portrait-img', attrs: { src: `${base}${sheetFile(def.sheet)}.png`, alt: '' } })
    )
    portrait.style.borderColor = color.hex
    const id = h('span', { className: 'phud__id', text: `J${player.id}` })
    id.style.color = color.hex
    const tiles = [
      ...player.inventory.weapons.map((e) => this.invTile(e, true)),
      ...player.inventory.passives.map((e) => this.invTile(e, true))
    ]
    return h(
      'div',
      { className: player.alive ? `phud phud--p${player.id}` : `phud phud--p${player.id} phud--dead` },
      portrait,
      h('div', { className: 'phud__col' },
        h('div', { className: 'phud__top' },
          id,
          h('span', { className: 'phud__lvl', text: `Nv ${player.level}` }),
          h('span', { className: 'phud__hp', text: `${Math.ceil(player.hp)}/${Math.round(player.maxHp)}` })
        ),
        this.bar(player.maxHp > 0 ? player.hp / player.maxHp : 0, 'hud__bar--hp'),
        this.xpBar(player, dtMs, now),
        h('div', { className: 'phud__inv' }, ...tiles)
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
        // Défaite et victoire partagent le même « Rapport de chantier » (variante par outcome).
        case 'gameover':
        case 'victory':
          this.screenLayer.append(this.reportPanel(state))
          break
        case 'nameEntry':
          this.screenLayer.append(this.nameEntryPanel(state))
          break
        case 'hiscores':
          this.screenLayer.append(this.hiScoresPanel(state))
          break
        case 'achievements':
          this.screenLayer.append(this.achievementsPanel(state))
          break
        case 'evolutions':
          this.screenLayer.append(this.evolutionsPanel(state))
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
      h('img', { className: 'title-bg', attrs: { src: `${base}ui_bg_dusk.png`, alt: '' } }),
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
    const base = import.meta.env.BASE_URL
    const activeId = sel?.charId ?? CHARACTER_IDS[0] ?? 'ouvrier'
    const def = characterDef(activeId)
    const weapon = WEAPONS[def.startingWeapon]
    const punch = PUNCHLINES[def.id] ?? ''

    // En-tête « SELECT YOUR CREW » + joueur courant (couleur du joueur).
    const header = h('h1', { className: 'panel__title charsel__heading', text: 'SELECT YOUR CREW' })
    const who = h('p', { className: 'charsel__who', text: `JOUEUR ${player}/${total}` })
    who.style.color = color.hex

    // Portrait géant du perso courant (frame 0 = face, croppée dans un cadre pixel).
    const portrait = h('div', { className: 'charsel-portrait' },
      h('img', { className: 'charsel-portrait__img', attrs: { src: `${base}${sheetFile(def.sheet)}.png`, alt: '' } })
    )
    const info = h('div', { className: 'charsel__info' },
      h('div', { className: 'charsel__name', text: def.name.toUpperCase() }),
      h('div', { className: 'charsel__weapon' },
        h('span', { className: 'charsel__weapon-label', text: 'ARME' }),
        h('span', { className: 'charsel__weapon-name', text: weapon?.name ?? def.startingWeapon })
      ),
      h('p', { className: 'charsel__desc', text: weapon?.description ?? '' }),
      h('p', { className: 'charsel__punch', text: punch })
    )
    const stage = h('div', { className: 'charsel__stage' }, portrait, info)

    // Grille des 10 têtes (frame 0 croppée) — la sélection courante est mise en avant.
    const grid = h('div', { className: 'charsel-grid', attrs: { 'aria-hidden': 'true' } })
    for (const id of CHARACTER_IDS) {
      const cd = characterDef(id)
      const cell = h('div', {
        className: id === activeId ? 'charsel-cell charsel-cell--active' : 'charsel-cell'
      }, h('img', { className: 'charsel-cell__img', attrs: { src: `${base}${sheetFile(cd.sheet)}.png`, alt: '' } }))
      grid.append(cell)
    }

    const panel = h(
      'div',
      { className: 'panel panel--charsel arc-metal' },
      header,
      who,
      stage,
      grid,
      this.menuList(state),
      h('p', { className: 'hint-line', text: 'Gauche/Droite pour changer • Valider: A / Entrée' })
    )
    return h('div', { className: 'screen screen--charsel' }, panel)
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
   * Carton titre d'une cinématique d'intro (ex. « TERRASSEMENT »). Appelé depuis
   * `main.ts` sur l'événement `cinemaBanner` émis par la façade cinématique. Réutilise
   * le bandeau 16-bit existant — aucune nouvelle couche ni style.
   */
  showCinemaBanner(text: string): void {
    this.showBanner(text, 'banner')
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
    const results: ChestResultView[] = outcome.results.length > 0
      ? outcome.results
      : [{ kind: 'heal', weaponId: null, weaponName: null, level: null }]
    const nReels = results.length

    // Durées (ms) — partagées avec le gel côté app (`chestRevealTotalMs`). La partie
    // est GELÉE pendant toute la durée (skippable avec A) → settle long = on savoure.
    const anticipationMs = CHEST_ANTICIPATION_MS
    const spinMs = CHEST_SPIN_MS
    const staggerMs = CHEST_STAGGER_MS
    const settleTailMs = CHEST_SETTLE_TAIL_MS
    const lastReelStart = anticipationMs + (nReels - 1) * staggerMs
    const flashAtMs = lastReelStart + spinMs
    const totalMs = flashAtMs + settleTailMs

    // Titre selon la rareté / l'issue (aucun emoji — DA + e2e).
    const anyEvo = results.some((r) => r.kind === 'evolution')
    const title = isSuper ? 'SUPER COFFRE' : anyEvo ? 'ÉVOLUTION' : 'COFFRE'

    // Cellule gagnante d'un rouleau : icône de la VRAIE arme qui monte/évolue
    // (fini la tuile « ? » : le coffre ne propose plus jamais de cartes) ; tuile
    // « + » pour un soin de repli.
    const winnerCell = (r: ChestResultView): HTMLElement => {
      if (r.kind !== 'heal' && r.weaponId !== null) {
        const cell = h('div', { className: 'jackpot__cell jackpot__cell--winner' })
        cell.append(icon(r.weaponId, r.weaponName ?? '', 'jackpot__icon', 'jackpot__icon-img', 'jackpot__icon-mono'))
        return cell
      }
      return h('div', { className: 'jackpot__cell jackpot__cell--winner jackpot__cell--heal' }, h('div', { className: 'jackpot__glyph', text: '+' }))
    }

    // Un rouleau : WINNER_INDEX leurres (icônes d'armes) + gain + BUFFER leurres.
    const buildReel = (r: ChestResultView): HTMLElement => {
      const reel = h('div', { className: 'jackpot__reel' })
      for (let i = 0; i < WINNER_INDEX; i++) {
        const filler = h('div', { className: 'jackpot__cell' })
        const id = SLOT_FILLER_ICONS[(i * 7 + reel.childElementCount) % SLOT_FILLER_ICONS.length] ?? 'cloueur'
        filler.append(icon(id, id, 'jackpot__icon', 'jackpot__icon-img', 'jackpot__icon-mono'))
        reel.append(filler)
      }
      reel.append(winnerCell(r))
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
      const res = results[r]
      if (res === undefined) {
        continue
      }
      const reel = buildReel(res)
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
      // Rayons tournants derrière la révélation (reveal arcade, planche 2e) — décor pur.
      h('div', { className: 'jackpot__rays', attrs: { 'aria-hidden': 'true' } }),
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

    // Flash blanc→doré + révélation quand le dernier rouleau se pose : UNE ligne par
    // issue réelle (arme évoluée / arme montée de niveau / soin). Pas de « carte ».
    this.jackpotTimers.push(window.setTimeout(() => {
      if (!panel.isConnected) { return }
      panel.classList.add('jackpot--flash')
      const reveal = h('div', { className: 'jackpot__reveal' })
      for (const r of results) {
        const label = r.kind === 'evolution'
          ? `${r.weaponName ?? 'Arme'} — ÉVOLUTION`
          : r.kind === 'weapon-up'
            ? `${r.weaponName ?? 'Arme'} — Niv. ${r.level ?? ''}`
            : 'Soin d\'urgence'
        reveal.append(h('div', { className: 'jackpot__reveal-name', text: label }))
      }
      panel.append(reveal)
    }, flashAtMs))

    // Fermeture automatique (garde isConnected → pas d'action sur un panneau remplacé).
    this.jackpotTimers.push(window.setTimeout(() => {
      this.clearJackpotTimers()
      clear(this.jackpotLayer)
      onDone?.()
    }, totalMs))
  }

  /**
   * Met un succès en FILE d'affichage (toast « trophée », coin haut-droit).
   *
   * ⚠️ POURQUOI UNE FILE, et pas le mécanisme `showBanner` : ce dernier est
   * MONO-SLOT (il `clear()` sa couche avant d'insérer, et sa mémoire de
   * suspension est un SCALAIRE). Deux succès tombant dans la MÊME frame —
   * « 100 kills » + « premier boss », un cas NATUREL — n'en laisseraient qu'un
   * seul visible. Ici les trophées se déroulent l'un APRÈS l'autre, sur une
   * couche DÉDIÉE : un trophée ne tue pas un bandeau boss, ni l'inverse.
   *
   * Bornée à `MAX_ACHIEVEMENT_QUEUE` en attente (+1 affiché) : un déluge ne
   * monopolise pas l'écran. Au-delà, le toast est écarté — mais TRACÉ (`warn`),
   * jamais en silence, et le succès reste acquis dans le profil (il est
   * consultable sur l'écran des succès).
   *
   * Idempotent par `id` : un succès déjà passé ne se rejoue pas (protège d'un
   * double `commitRun`).
   */
  showAchievement(def: AchievementToast): void {
    if (this.achievementSeen.has(def.id)) {
      return
    }
    if (this.achievementQueue.length >= MAX_ACHIEVEMENT_QUEUE) {
      // Troncature d'AFFICHAGE seulement : le succès reste débloqué côté profil.
      console.warn(
        `[succès] file d'affichage pleine (${MAX_ACHIEVEMENT_QUEUE} en attente) — ` +
          `toast écarté pour « ${def.label} » (${def.id}). Le succès reste acquis.`
      )
      return
    }
    this.achievementSeen.add(def.id)
    this.achievementQueue.push(def)
    this.pumpAchievements()
  }

  /**
   * Défile la file : affiche le trophée suivant si la voie est libre. Ne fait
   * RIEN si un trophée est déjà à l'écran (il finira son temps) ou si le canal
   * est suspendu (modale ouverte) — dans les deux cas, c'est l'expiration ou la
   * levée de suspension qui relancera la pompe. Aucune perte possible.
   */
  private pumpAchievements(): void {
    if (this.achievementSuspended || this.achievementShowing !== null) {
      return
    }
    const next = this.achievementQueue.shift()
    if (next === undefined) {
      return
    }
    this.achievementShowing = next
    clear(this.achievementLayer)
    this.achievementLayer.append(this.trophyNode(next))
    this.achievementTimer = window.setTimeout(() => {
      clear(this.achievementLayer)
      this.achievementShowing = null
      // Battement inter-trophée : deux trophées collés se liraient comme un seul.
      this.achievementTimer = window.setTimeout(() => {
        this.achievementTimer = null
        this.pumpAchievements()
      }, TROPHY_GAP_MS)
    }, TROPHY_VISIBLE_MS)
  }

  /**
   * Suspend/reprend le canal des trophées — MIROIR de `syncBanner`, mais sur son
   * PROPRE état : les deux canaux sont indépendants par construction.
   *
   * L'écran de level-up est modal et vit dans une couche INFÉRIEURE ; un toast
   * par-dessus couvrirait les cartes (bug de z-index déjà survenu ici). Le
   * trophée en cours est REMIS EN TÊTE de file et rejoué ENTIER à la fermeture —
   * pas de trophée mangé à moitié.
   *
   * Volontairement limité à `upgrade` (comme `bannerSuspended`) : l'écran de fin
   * de run doit, lui, pouvoir afficher les succès de la run qui vient de finir.
   */
  private syncAchievements(state: AppViewState): void {
    const suspend = state.screen === 'upgrade'
    if (suspend && !this.achievementSuspended) {
      this.achievementSuspended = true
      if (this.achievementShowing !== null) {
        this.achievementQueue.unshift(this.achievementShowing)
        this.achievementShowing = null
      }
      this.clearAchievementTimer()
      clear(this.achievementLayer)
    } else if (!suspend && this.achievementSuspended) {
      this.achievementSuspended = false
      this.pumpAchievements()
    }
  }

  private clearAchievementTimer(): void {
    if (this.achievementTimer !== null) {
      window.clearTimeout(this.achievementTimer)
      this.achievementTimer = null
    }
  }

  /**
   * Le trophée, façon plaque commémorative 16-bit : socle tramé + icône, plaque
   * gravée « SUCCÈS DÉBLOQUÉ », nom, condition, et le trophée en sceau.
   *
   * Deux niveaux (`.trophy` positionne, `.trophy__panel` glisse) et ce n'est PAS
   * cosmétique : `transform` n'est pas cumulatif. Le glissement est une
   * animation `transform` ; si l'échelle mobile vivait sur le MÊME nœud,
   * l'animation l'écraserait et le panneau se décentrerait (précédent `.bossbar`).
   * Un nœud par transform = zéro collision.
   */
  private trophyNode(def: AchievementToast): HTMLElement {
    const panel = h('div', { className: 'trophy__panel' })
    panel.append(
      this.trophyIcon(def),
      h('div', { className: 'trophy__text' },
        h('div', { className: 'trophy__label', text: 'SUCCÈS DÉBLOQUÉ' }),
        h('div', { className: 'trophy__name', text: def.label }),
        h('div', { className: 'trophy__desc', text: def.description })
      ),
      h('img', {
        className: 'trophy__seal',
        attrs: { src: `${import.meta.env.BASE_URL}ui_trophy.png`, alt: '' }
      })
    )
    // La durée de vie CSS suit la constante JS : une seule source pour les deux.
    panel.style.animationDuration = `${TROPHY_VISIBLE_MS}ms`
    return h('div', { className: 'trophy' }, panel)
  }

  /**
   * Icône du succès. `AchievementDef.icon` porte un chemin COMPLET relatif à
   * `public/` (deux familles cohabitent : `ui_*.png` à la racine et
   * `stage01/ui/icon_*_64.png`) — d'où `iconFromSrc` et non `icon()`, qui, lui,
   * fabrique un chemin `stage01/ui/icon_<id>_64.png` et ne conviendrait qu'à une
   * des deux familles. Pas d'icône déclarée = monogramme (aucun fichier inventé).
   */
  private trophyIcon(def: AchievementToast): HTMLElement {
    if (def.icon === undefined) {
      return h('div', { className: 'trophy__plinth' },
        h('div', { className: 'trophy__mono', text: monogram(def.label) })
      )
    }
    return iconFromSrc(
      `${import.meta.env.BASE_URL}${def.icon}`,
      def.label,
      'trophy__plinth',
      'trophy__img',
      'trophy__mono'
    )
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
   *
   * En CO-OP ce panneau est inerte : chaque joueur (J1 inclus) a ses armes dans SON
   * bloc de coin (`playerBlock`) — sinon l'inventaire de J1 serait affiché deux fois.
   */
  private syncInventory(state: AppViewState): void {
    const inRun =
      (state.screen === 'game' || state.screen === 'paused' || state.screen === 'upgrade') &&
      !state.introActive &&
      state.players.length <= 1
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

  /**
   * Saisie du prénom (fin de run, score qualifiant) — écran arcade.
   *
   * La grille de 8 cases EST le focus de cet écran : aucun item de menu n'est
   * rendu (l'App n'en expose qu'un, invisible, pour porter la validation), et la
   * case courante est mise en avant avec ses chevrons haut/bas. Tout se joue à la
   * manette/au clavier — rien ici n'exige la souris (règle 8).
   */
  private nameEntryPanel(state: AppViewState): HTMLElement {
    const entry = state.nameEntry
    const grid = h('div', { className: 'namegrid' })
    const cursor = entry?.cursor ?? 0
    ;(entry?.chars ?? []).forEach((ch, i) => {
      grid.append(
        h('div', {
          className: i === cursor ? 'namecell namecell--focus' : 'namecell',
          // Case vide (espace) → tiret : une case blanche ne se verrait pas.
          text: ch === ' ' ? '_' : ch
        })
      )
    })
    const panel = h(
      'div',
      { className: 'panel panel--name arc-metal' },
      h('h1', { className: 'panel__title namepanel__title', text: 'TABLEAU D\'HONNEUR' }),
      h('p', { className: 'panel__subtitle', text: `Tu entres au classement — ${entry?.stageTitle ?? ''}` }),
      h('div', { className: 'namepanel__score', text: `SCORE ${formatNumber(entry?.score ?? 0)}` }),
      grid,
      h('p', { className: 'hint-line', text: state.menu?.items[0]?.hint ?? '' })
    )
    return h('div', { className: 'screen' }, panel)
  }

  /**
   * Tableau des scores du stage (top 20), ligne du joueur en surbrillance.
   *
   * Les lignes sont CONSULTATIVES, pas des items de menu : seul « Retour » est
   * focalisable. C'est ce qui permet de tout afficher sans scroll — le récap
   * co-op avait déjà appris qu'un menu poussé sous l'écran devient inatteignable
   * à la manette (cf. la doctrine de compacité dans `styles.ts`).
   */
  private hiScoresPanel(state: AppViewState): HTMLElement {
    const view = state.hiScores
    const entries = view?.entries ?? []
    const rows = h('div', { className: 'hiscores__rows' })
    entries.forEach((e, i) => {
      const row = h('div', {
        className: i === view?.rank ? 'hiscore-row hiscore-row--me' : 'hiscore-row'
      })
      row.append(
        h('span', { className: 'hiscore-row__rank', text: String(i + 1).padStart(2, '0') }),
        h('span', { className: 'hiscore-row__name', text: e.name }),
        h('span', { className: 'hiscore-row__score', text: formatNumber(e.score) }),
        h('span', {
          className: 'hiscore-row__meta',
          text: `${formatNumber(e.kills)} tués · Nv ${e.level} · ${formatTime(e.elapsedMs)}`
        })
      )
      rows.append(row)
    })
    if (entries.length === 0) {
      // Consultable depuis le titre AVANT toute run : sur un profil neuf, aucun
      // stage n'a de score. Un panneau vide passerait pour un bug — on le dit.
      rows.append(h('div', { className: 'hiscore-row hiscore-row--empty', text: 'Aucun score pour ce chantier' }))
    }
    const panel = h(
      'div',
      { className: 'panel panel--hiscores arc-metal' },
      h('h1', { className: 'panel__title hiscores__title', text: 'TABLEAU DES SCORES' }),
      h('p', { className: 'panel__subtitle', text: view?.stageTitle ?? '' }),
      rows,
      this.menuList(state)
    )
    return h('div', { className: 'screen' }, panel)
  }

  /**
   * Écran des succès (consultation depuis le titre).
   *
   * Les succès VERROUILLÉS restent affichés, grisés : c'est la doctrine du repo
   * (cf. `starRow` — « le joueur doit VOIR ce qu'il a raté, sinon la note
   * n'incite à rien »). Cacher les succès non acquis ferait, sur un profil neuf,
   * un écran VIDE — soit exactement l'inverse de l'incitation recherchée.
   *
   * Grille 2 colonnes : les ~10 lignes tiennent à l'écran, donc rien à scroller
   * (même contrainte que le tableau des scores — le jeu est 100 % manette, et
   * seul « Retour » est focalisable ici).
   */
  private achievementsPanel(state: AppViewState): HTMLElement {
    const view = state.achievements
    const entries = view?.entries ?? []
    const grid = h('div', { className: 'ach__grid' })
    for (const e of entries) {
      const row = h('div', { className: e.unlocked ? 'ach-row ach-row--on' : 'ach-row' })
      row.append(
        this.achievementIcon(e),
        h(
          'div',
          { className: 'ach__text' },
          h('div', { className: 'ach__name', text: e.label }),
          h('div', { className: 'ach__desc', text: e.description })
        ),
        // Étoile pleine/vide : le repère « acquis ou non » se lit d'un coup d'œil,
        // sans dépendre de la seule nuance de gris (mêmes assets que `starRow`).
        h('img', {
          className: 'ach__star',
          attrs: { src: e.unlocked ? 'ui_star_on.png' : 'ui_star_off.png', alt: '' }
        })
      )
      grid.append(row)
    }
    const panel = h(
      'div',
      { className: 'panel panel--achievements arc-metal' },
      h('h1', { className: 'panel__title achievements__title', text: 'SUCCÈS' }),
      h('p', {
        className: 'panel__subtitle',
        text: `${view?.unlockedCount ?? 0} / ${entries.length} débloqués`
      }),
      grid,
      this.menuList(state)
    )
    return h('div', { className: 'screen' }, panel)
  }

  /**
   * Icône d'un succès : chemin COMPLET relatif à `public/` (deux familles
   * cohabitent) → `iconFromSrc`, comme le trophée. Pas d'icône déclarée =
   * monogramme, jamais un fichier inventé.
   */
  private achievementIcon(entry: AchievementEntryView): HTMLElement {
    if (entry.icon === null) {
      return h('div', { className: 'ach__plinth' },
        h('div', { className: 'ach__mono', text: monogram(entry.label) })
      )
    }
    return iconFromSrc(
      `${import.meta.env.BASE_URL}${entry.icon}`,
      entry.label,
      'ach__plinth',
      'ach__img',
      'ach__mono'
    )
  }

  /**
   * Écran « Évolutions d'armes » (pause) : croise `EVOLUTIONS` avec l'inventaire
   * courant (résolu dans `App.openEvolutionsView`). Même parti pris que les succès
   * (grille 2 colonnes, consultatif, seul « Retour » focalisable) — mais ici chaque
   * ligne montre une PAIRE d'icônes (arme → catalyseur) plutôt qu'une seule, et
   * l'étoile marque « déjà évoluée cette run » au lieu de « débloqué ».
   */
  private evolutionsPanel(state: AppViewState): HTMLElement {
    const view = state.evolutions
    const entries = view?.entries ?? []
    const grid = h('div', { className: 'ach__grid evo__grid' })
    for (const e of entries) {
      const row = h('div', { className: e.evolved ? 'ach-row ach-row--on' : 'ach-row' })
      row.append(
        h(
          'div',
          { className: 'evo__pair' },
          icon(e.weaponId, e.weaponName, 'ach__plinth', 'ach__img', 'ach__mono'),
          h('div', { className: 'evo__arrow', text: '→' }),
          icon(e.passiveId, e.passiveName, 'ach__plinth', 'ach__img', 'ach__mono')
        ),
        h(
          'div',
          { className: 'ach__text' },
          h('div', { className: 'ach__name', text: e.evolved ? e.evolvedName : e.weaponName }),
          h('div', {
            className: 'ach__desc',
            text: e.evolved
              ? `Évoluée · catalyseur : ${e.passiveName}`
              : `Niveau ${e.weaponLevel}/${e.reqBaseLevel} · catalyseur : ${e.passiveName}`
          })
        ),
        h('img', {
          className: 'ach__star',
          attrs: { src: e.evolved ? 'ui_star_on.png' : 'ui_star_off.png', alt: '' }
        })
      )
      grid.append(row)
    }
    const panel = h(
      'div',
      { className: 'panel panel--achievements panel--evolutions arc-metal' },
      h('h1', { className: 'panel__title achievements__title', text: 'ÉVOLUTIONS D\'ARMES' }),
      h('p', {
        className: 'panel__subtitle',
        text: entries.length === 0
          ? 'Aucune arme à évolution acquise pour l\'instant.'
          : `${view?.evolvedCount ?? 0} / ${entries.length} évoluées`
      }),
      grid,
      this.menuList(state)
    )
    return h('div', { className: 'screen' }, panel)
  }

  /**
   * « Rapport de chantier » — écran de fin UNIQUE pour les deux issues.
   * Même structure (titre / phrase / barre / stats / récap joueurs), la variante
   * `report--victory` porte le ton festif (or + vert, rayons, drapeau atteint) et
   * `report--defeat` le ton sombre. Historiquement la victoire avait un panneau
   * générique séparé, sans phrase, ni barre, ni kills, ni or.
   */
  private reportPanel(state: AppViewState): HTMLElement {
    const report = state.runReport
    // Garde-fou : si le rapport est absent, panneau minimal sans crash.
    if (report === null) {
      return h(
        'div',
        { className: 'screen' },
        h('div', { className: 'panel' }, h('h1', { className: 'panel__title', text: 'RAPPORT DE CHANTIER' }), this.menuList(state))
      )
    }
    const victory = report.outcome === 'victory'
    const hasNext = (state.menu?.items ?? []).some((it) => it.id === 'stage_suivant')

    const title = h('h1', {
      className: 'report__title',
      text: victory ? (hasNext ? 'CHANTIER LIVRÉ !' : 'TOUS LES CHANTIERS LIVRÉS !') : 'CHANTIER INTERROMPU'
    })

    // Défaite : emphase « culte » si mort après 80 % du chantier. Victoire : ton festif.
    const isCult = !victory && report.progressRatio > 0.8
    const quoteEl = h(
      'p',
      { className: isCult ? 'report__quote report__quote--cult' : 'report__quote' },
      `« ${report.quote} »`
    )

    // Barre : marqueur clampé dans [3, 94] pour rester sur le rail. En victoire il
    // atteint le drapeau (100 % → 94) — le chantier est livré.
    const markerPct = Math.max(3, Math.min(report.progressPercent, 94))
    const markerImg = h('img', { className: 'report__marker', attrs: { src: 'ui_death_marker.png', alt: '' } })
    markerImg.style.left = `${markerPct}%`
    // La jauge, elle, n'est PAS clampée : 0 % et 100 % doivent être exacts, sinon
    // « chantier livré » afficherait une barre incomplète.
    const fill = h('div', { className: 'report__fill', attrs: { 'aria-hidden': 'true' } })
    fill.style.width = `${report.progressPercent}%`
    const bar = h(
      'div',
      { className: 'report__bar' },
      fill,
      h('img', { className: 'report__start', attrs: { src: 'ui_death_start.png', alt: '' } }),
      markerImg,
      h('img', { className: 'report__end', attrs: { src: 'ui_death_flag.png', alt: '' } })
    )

    // Stats — MÊMES libellés des deux côtés (avant : « Ennemis tués » vs « Score »
    // pour la même donnée, et ni or ni % côté victoire).
    const stats = h(
      'div',
      { className: 'report__stats' },
      h('span', { text: `Chantier : ${report.stageTitle}` }),
      h('span', { text: `${report.progressPercent} % terminé` }),
      h('span', { text: `Temps : ${formatTime(report.elapsedMs)} / ${formatTime(report.stageDurationMs)}` }),
      h('span', { text: `Ennemis tués : ${formatNumber(report.kills)}` }),
      h('span', { text: `Or ramassé : ${formatNumber(report.coins)}` }),
      h('span', { text: `Niveau atteint : ${report.level}` }),
      // Score de classement : c'est CE nombre qui est comparé au tableau des
      // high scores — le joueur doit le voir avant qu'on lui demande son nom.
      h('span', { className: 'report__score', text: `Score : ${formatNumber(report.runScore)}` })
    )
    // Seule info propre à la défaite : ce qu'il restait à tenir.
    if (!victory) {
      stats.append(h('span', { text: `Plus que ${formatTime(report.remainingSeconds * 1000)} avant validation.` }))
    }

    const panel = h('div', { className: victory ? 'panel report report--victory' : 'panel report report--defeat' })
    if (victory) {
      // Décor festif (rayons tournants) — derrière le contenu, purement cosmétique.
      panel.append(h('div', { className: 'report__rays', attrs: { 'aria-hidden': 'true' } }))
    }
    panel.append(title, this.starRow(report.stars), quoteEl, bar, stats)
    // Co-op : récap par joueur (avant, le détail par joueur n'existait sur AUCUN écran).
    if (report.perPlayer.length > 1) {
      const rows = h('div', { className: 'report__players' })
      const podium = report.podium
      for (const p of report.perPlayer) {
        const row = h('div', { className: p.alive ? 'report__prow' : 'report__prow report__prow--dead' })
        const tag = h('span', { className: 'report__pid', text: `J${p.id}` })
        tag.style.color = playerColor(p.id).hex
        row.append(tag, h('span', { text: `${formatNumber(p.kills)} tués` }), h('span', { text: `Nv ${p.level}` }))
        // Podium : trophée au meilleur tueur, croix au dernier — jamais les deux
        // sur la même ligne (`selectPodium` renvoie null si tout le monde est à
        // égalité, et n'existe pas en solo).
        if (podium !== null && p.id === podium.bestId) {
          row.append(
            h('img', { className: 'report__trophy', attrs: { src: 'ui_trophy.png', alt: 'Meilleur tueur' } }),
            h('span', { className: 'report__verdict report__verdict--praise', text: podium.praise })
          )
        } else if (podium !== null && p.id === podium.worstId) {
          row.append(
            h('img', { className: 'report__cross', attrs: { src: 'ui_cross_red.png', alt: 'Dernier' } }),
            h('span', { className: 'report__verdict report__verdict--mock', text: podium.mock })
          )
        }
        rows.append(row)
      }
      panel.append(rows)
    }
    panel.append(this.menuList(state))
    return h('div', { className: 'screen' }, panel)
  }

  /**
   * Rangée d'étoiles de fin de stage : toujours 3 emplacements, les non gagnées
   * restant visibles en gris — le joueur doit VOIR ce qu'il a raté, sinon la note
   * n'incite à rien.
   */
  private starRow(stars: number): HTMLElement {
    const row = h('div', { className: 'report__stars', attrs: { 'aria-label': `${stars} étoile(s) sur ${STAR_SLOTS}` } })
    for (let i = 0; i < STAR_SLOTS; i++) {
      const earned = i < stars
      row.append(
        h('img', {
          className: earned ? 'report__star report__star--on' : 'report__star',
          attrs: { src: earned ? 'ui_star_on.png' : 'ui_star_off.png', alt: '' }
        })
      )
    }
    return row
  }

  private upgradePanel(state: AppViewState): HTMLElement {
    const items = state.menu?.items ?? []
    const index = state.menu?.index ?? 0
    const cards = h('div', { className: 'cards' })
    items.forEach((item, i) => {
      cards.append(this.card(item, i === index, i))
    })

    // Co-op : la carte appartient à UN joueur — on le dit, et sa couleur habille
    // le panneau. En solo il n'y a pas d'ambiguïté : écran inchangé.
    const owner = state.players.length > 1 ? state.menu?.playerId : undefined
    const panel = h('div', { className: 'panel' })
    if (owner !== undefined) {
      const color = playerColor(owner)
      panel.classList.add('panel--owned')
      // Couleur en inline, comme le HUD (`playerBlock`) : les classes CSS ne
      // portent que la structure, jamais l'identité joueur.
      panel.style.borderColor = color.hex
      const who = h('p', { className: 'upgrade__who', text: `J${owner} CHOISIT` })
      who.style.color = color.hex
      panel.append(who)
    }
    panel.append(
      h('h1', { className: 'panel__title', text: 'Niveau supérieur' }),
      h('p', { className: 'panel__subtitle', text: 'Choisis une amélioration' }),
      cards,
      h('p', {
        className: 'hint-line',
        text:
          owner === undefined
            ? 'Gauche/Droite pour choisir · Valider: A / Entrée'
            : `Gauche/Droite pour choisir · Valider: A / Entrée · manette de J${owner} uniquement`
      })
    )
    return h('div', { className: 'screen' }, panel)
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
    // Saisie du prénom : la grille est un état HORS menu (l'écran n'a qu'un item).
    // Le CURSEUR est indispensable ici : le déplacer ne change ni les lettres ni le
    // libellé de l'item → sans lui, la signature serait identique et la case
    // focalisée ne bougerait pas à l'écran alors que l'état, lui, a changé.
    const nameEntryPart =
      state.screen === 'nameEntry' && state.nameEntry !== null
        ? `${state.nameEntry.chars.join('')}#${state.nameEntry.cursor}`
        : ''
    // Tableau des scores : les lignes sont consultatives (hors menu) → idem.
    const hiScoresPart =
      state.screen === 'hiscores' && state.hiScores !== null
        ? `${state.hiScores.stageId}#${state.hiScores.rank}#${state.hiScores.entries.length}`
        : ''
    // Succès : la grille est un état HORS menu (l'écran n'a que « Retour ») → sans
    // ça, le panneau ne se redessinerait pas. On signe les DRAPEAUX de déblocage,
    // pas leur simple compte : deux profils à 3/10 sur des succès différents
    // partageraient la même signature, et le second afficherait le premier.
    const achievementsPart =
      state.screen === 'achievements' && state.achievements !== null
        ? state.achievements.entries.map((e) => (e.unlocked ? '1' : '0')).join('')
        : ''
    return `${state.screen}|${menuPart}|${statsPart}|${titlePart}|${charSelectPart}|${nameEntryPart}|${hiScoresPart}|${achievementsPart}`
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
  return iconFromSrc(
    `${import.meta.env.BASE_URL}stage01/ui/icon_${id}_64.png`,
    label, boxClass, imgClass, monoClass
  )
}

/**
 * Même repli que `icon()` (monogramme si le fichier manque) mais à partir d'un
 * chemin COMPLET. Nécessaire aux succès, dont l'icône peut vivre à la racine
 * (`ui_trophy.png`) comme dans `stage01/ui/` : `icon()` ne sait fabriquer que la
 * seconde forme. La logique de repli reste ici, en un seul endroit.
 */
function iconFromSrc(
  src: string, label: string, boxClass: string, imgClass: string, monoClass: string
): HTMLElement {
  const box = h('div', { className: boxClass })
  const img = h('img', { className: imgClass, attrs: { src, alt: '' } })
  img.addEventListener('error', () => {
    img.remove()
    box.append(h('div', { className: monoClass, text: monogram(label) }))
  })
  box.append(img)
  return box
}
