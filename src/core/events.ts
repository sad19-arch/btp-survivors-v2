/**
 * Événements de simulation observables (sim → app → rendu).
 *
 * On sous-classe `Event` (et non `CustomEvent`, indisponible sous Node) pour
 * transporter des données typées ; `Event`/`EventTarget` sont globaux côté Node
 * comme navigateur.
 */

/** Données d'une pulsation d'aura (onde de choc du marteau/pied-de-biche/court-circuit). */
export interface AuraPulse {
  x: number
  y: number
  radius: number
  /** Sorte d'arme à l'origine de l'impulsion (`aura` | `sweep` | `strike` | `cone`) — pour teinter le VFX. */
  kind: string
  /** Direction du cône (vecteur unitaire) — uniquement pour `kind === 'cone'`, undefined sinon. */
  dirX?: number
  dirY?: number
}

/** Émis à chaque impulsion d'une arme d'aura/sweep/strike/cone (pour un VFX d'onde de choc). */
export class AuraPulseEvent extends Event {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly radius: number,
    readonly kind: string = 'aura',
    readonly dirX?: number,
    readonly dirY?: number
  ) {
    super('auraPulse')
  }
}

/** Émis quand un ouvrier prisonnier est libéré (pour étincelles + bulle « Merci ! »). */
export class PrisonerFreedEvent extends Event {
  constructor(
    readonly x: number,
    readonly y: number
  ) {
    super('prisonerFreed')
  }
}

// --- Événements sémantiques pour l'AUDIO (observés par la couche audio) --------
// Purement observationnels : dispatchés en fin de pas, ils N'ALTÈRENT PAS l'état
// de la simulation (déterminisme préservé ; aucun écouteur en headless/tests).

/** Un ou plusieurs ennemis sont morts ce pas (pour un SFX d'explosion). */
export class EnemyKilledEvent extends Event {
  constructor(readonly count: number) {
    super('enemyKilled')
  }
}

/** Un joueur a perdu des PV ce pas (pour un SFX de dégât). */
export class PlayerHurtEvent extends Event {
  constructor() {
    super('playerHurt')
  }
}

/** Un joueur vient de monter de niveau (carte d'upgrade proposée). */
export class LevelUpEvent extends Event {
  constructor() {
    super('levelUp')
  }
}

/** Une arme vient de tirer (kind = id de l'arme : cloueur, scie, marteau). */
export class WeaponFiredEvent extends Event {
  constructor(readonly kind: string) {
    super('weaponFired')
  }
}

/** Un pickup vient d'être ramassé (kind : xp, heal, magnet, chest). */
export class PickupCollectedEvent extends Event {
  constructor(readonly kind: string) {
    super('pickupCollected')
  }
}

/** Le boss vient d'apparaître (pour SFX + bascule musique). */
export class BossSpawnedEvent extends Event {
  constructor(readonly role: 'mid' | 'final') {
    super('bossSpawned')
  }
}

/** Une arme vient d'évoluer (coffre ramassé + conditions réunies), pour le joueur `playerId` (le ramasseur réel du coffre). */
export class EvolvedEvent extends Event {
  constructor(readonly weaponId: string, readonly playerId: number) {
    super('evolved')
  }
}
