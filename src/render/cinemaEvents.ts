/**
 * Cues cosmétiques émis par la cinématique d'intro (render → ui/audio).
 *
 * La cinématique tourne côté rendu (GameScene / IntroSequencer) mais ses effets
 * bandeau/voix/SFX vivent ailleurs : le bandeau dans l'overlay DOM, les sons dans
 * l'AudioDirector. On les découple par le bus `app.events` (comme `menuMove`,
 * `launchEditor`, `achievementUnlocked`) : la façade Phaser DISPATCHE, `main.ts`
 * ROUTE vers l'overlay et l'audio. Aucun de ces cues ne touche la simulation —
 * ils sont purement cosmétiques et n'existent que pendant le gel d'intro.
 *
 * On sous-classe `Event` (et non `CustomEvent`, indisponible sous Node) pour
 * transporter un payload typé ; `Event`/`EventTarget` sont globaux partout.
 */

/** Carton titre de cinématique (ex. « TERRASSEMENT ») → overlay.showCinemaBanner. */
export class CinemaBannerEvent extends Event {
  constructor(readonly text: string) {
    super('cinemaBanner')
  }
}

/** SFX ponctuel d'un temps fort de cinématique (ex. le « clonk » de la pelle). */
export class CinemaSfxEvent extends Event {
  constructor(readonly cue: string) {
    super('cinemaSfx')
  }
}

/** Réplique d'annonceur jouée pendant une cinématique (clé de voix du manifeste). */
export class CinemaVoiceEvent extends Event {
  constructor(readonly key: string) {
    super('cinemaVoice')
  }
}
