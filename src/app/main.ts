import Phaser from 'phaser'
import { App } from './app'
import { GameScene, type GameSceneData } from '@render/scenes/GameScene'
import { BootScene } from '@render/scenes/BootScene'
import { Overlay } from '@ui/overlay'
import { wireAchievementToasts } from './achievementBridge'
import { AudioDirector } from '@/audio/audioDirector'
import { parseBootOptions, type BootOptions } from './bootOptions'
import { applyUserLayouts } from './userLayoutBoot'
import { phaseIdFromLevel } from '@content/phases'
import { createSeam, installSeam } from './seam'
import { PerfOverlay } from '@render/perf/perfOverlay'
import { ViewportBus } from '@ui/viewport'
import { CinemaBannerEvent, CinemaSfxEvent, CinemaVoiceEvent } from '@render/cinemaEvents'

/**
 * Point d'entrée (couche rendu). Lit les options de boot, instancie l'App (qui
 * orchestre la simulation et les écrans), publie le seam en dev/test, puis
 * démarre la scène. Le cœur (`src/core`) ignore tout de ce fichier.
 */
const opts = parseBootOptions(window.location.search)

// ── Stage Composer Editor (?editor=true) : remplace INTÉGRALEMENT le jeu normal.
// Chargé dynamiquement (code-split) → aucun octet ni logique d'éditeur dans le
// chemin de jeu sans le flag. Gameplay strictement inchangé quand editor=false.
if (opts.editor) {
  void import('../editor/bootEditor').then((m) => m.bootEditor())
} else {
  bootGame(opts)
}

function bootGame(opts: BootOptions): void {
// Réinjecte les stages édités par le joueur (localStorage) AVANT de créer la sim,
// pour que le stage choisi joue sa version sauvée. No-op si aucun (test/e2e/défaut).
applyUserLayouts()
const mode = opts.autostart ?? 'solo'
const app = new App({
  seed: opts.seed,
  mode,
  autostart: opts.autostart !== null,
  phaseId: phaseIdFromLevel(opts.level),
  // Intro cosmétique pour le vrai joueur ; jamais en test/e2e/capture (seam).
  // Exception : ?intro=1 force l'intro même en test (e2e de la plomberie cinéma).
  intro: opts.intro || !opts.test
})
const seam = createSeam(app)

// Item « Éditeur de niveaux » du menu titre → bascule vers le boot éditeur
// (`?editor=true`, recharge la page). L'App reste pure ; l'effet de bord vit ici.
app.events.addEventListener('launchEditor', () => {
  window.location.search = '?editor=true'
})

// Gating: jamais en prod (sauf ?test=1). Pas de process.env (undefined sous Vite).
if (import.meta.env.DEV || opts.test) {
  installSeam(seam)
}

// Panneau de debug tactile (`?debug=1`) : mêmes garde-fous que le seam (dev/test).
// Import dynamique → code-split, zéro octet dans le chemin de jeu normal.
if (opts.debug && (import.meta.env.DEV || opts.test)) {
  void import('@ui/debugPanel').then((m) => m.mountDebugPanel(app))
}

// Source de vérité responsive UNIQUE (P3/P4) : créée AVANT la scène — GameScene
// TIRE `current().cameraZoom` à chaque frame, l'overlay s'y ABONNE plus bas.
const viewport = new ViewportBus()

const data: GameSceneData = { app, testMode: opts.test, seam, lite: opts.lite, viewport }

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#1a1a1a',
  // DA 16-bit : rendu net des pixels (antialias off + roundPixels). Refonte mobile P3.
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%'
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  input: {
    gamepad: true // manette Xbox (PRD : 100 % jouable manette)
  },
  scene: []
})

// BootScene précharge l'audio puis lance 'game' (GameScene n'auto-démarre plus).
game.scene.add('game', GameScene, false, data)
game.scene.add('boot', BootScene, true, data)

// Diagnostic (test/dev uniquement, comme le seam) : expose le jeu Phaser pour
// que l'e2e mesure le nombre d'objets de scène et garde contre la fuite au
// restart (les sprites/VFX ne doivent pas s'accumuler d'une partie à l'autre).
if (opts.test) {
  ;(window as unknown as { __PHASER_GAME__?: Phaser.Game }).__PHASER_GAME__ = game
}

// AudioDirector : créé une fois, coupé en test/headless. Lit les niveaux via l'App.
const audio = opts.test ? null : new AudioDirector(game.sound, app.events, () => app.getAudioLevels())

// Overlay DOM des écrans (HUD, menus) — observe l'état de l'App à chaque frame.
const uiRoot = document.getElementById('ui-root')
if (uiRoot !== null) {
  // Clic souris sur un item de menu → sélection+validation via l'App.
  // 3e arg : voix du studio « AIL Entertainment presents » câblée SUR le splash
  // (début → joue/arme la voix ; fin → ferme la fenêtre). Plus jamais sur le titre.
  const overlay = new Overlay(
    uiRoot,
    (i) => app.clickItem(i),
    (phase) => { if (phase === 'start') { audio?.beginStudioPresents() } else { audio?.endStudioPresents() } }
  )
  // L'overlay CONSOMME la source de vérité responsive (émission immédiate à
  // l'abonnement → HUD correct dès le boot ; recalculs coalescés ensuite).
  viewport.subscribe((v) => overlay.applyResponsive(v))
  // Succès → trophée. L'App émet un `achievementUnlocked` par id NOUVELLEMENT
  // acquis (une fois par run, cf. sa garde one-shot) ; le pont résout le
  // libellé/l'icône dans le catalogue et le passe à la file d'affichage.
  wireAchievementToasts(app.events, overlay)
  // Overlay de diagnostic perf (`?perf=1`) : mesure sur vrai device, gated par le
  // flag seul (indépendant de l'audio, actif même en `?test=1&perf=1` pour l'e2e).
  const perfOverlay = opts.perf ? new PerfOverlay(uiRoot) : null
  // Splash studio : PERSISTE jusqu'au 1er geste → garantit que la voix « presents » l'accompagne.
  // - clavier/souris/tactile → déverrouille WebAudio (`unlocked`) → la voix joue, puis retrait (tail) ;
  // - manette (ne déverrouille PAS l'audio, limite navigateur) → retrait quand même (voix impossible) ;
  // - filet anti-blocage si aucune interaction ; en test (audio null) → retrait ~3.4s (inchangé e2e).
  const dismissSplash = (): void => { overlay.dismissStudioSplash() }
  if (audio !== null && game.sound.locked) {
    // clavier/souris/tactile → déverrouille WebAudio (`unlocked`) → la voix joue, puis retrait (tail).
    game.sound.once('unlocked', () => { window.setTimeout(dismissSplash, 2600) })
    // Filet anti-blocage : sans geste qui déverrouille l'audio (AFK, ou MANETTE SEULE — le
    // navigateur ne déverrouille pas l'audio sur les boutons de manette), retrait après un délai.
    window.setTimeout(dismissSplash, 12000)
  } else {
    window.setTimeout(dismissSplash, 3400)
  }
  // Cinématique d'intro : la façade Phaser DISPATCHE ses cues cosmétiques sur
  // `app.events` (elle ne connaît ni l'overlay ni l'audio) ; on les route ici.
  // - bandeau → carton titre 16-bit de l'overlay ;
  // - SFX/voix → AudioDirector (null en test → inerte, la sim reste intacte).
  app.events.addEventListener('cinemaBanner', (e) => {
    overlay.showCinemaBanner((e as CinemaBannerEvent).text)
  })
  app.events.addEventListener('cinemaSfx', (e) => {
    audio?.playNamedCue((e as CinemaSfxEvent).cue)
  })
  app.events.addEventListener('cinemaVoice', (e) => {
    audio?.playNamedVoice((e as CinemaVoiceEvent).key)
  })
  // B5 — Jackpot coffre + bandeau d'évolution : câblés dans overlay.sync via
  // state.justEvolvedWeaponName (flag transitoire, one-shot). Plus d'event ad hoc ici.
  const tick = (): void => {
    const state = app.getStateForFrame(app.frameId)
    overlay.sync(state)
    audio?.observe(state) // musique par écran/phase/boss (crossfade)
    if (perfOverlay !== null) {
      const snap = seam.debugPerfProfile?.() ?? null
      if (snap !== null) {
        perfOverlay.update(snap, game.loop.actualFps)
      }
    }
    window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}
}
