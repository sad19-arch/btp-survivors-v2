import { describe, it, expect } from 'vitest'
import {
  musicForState, MUSIC, SFX, VOICE, voiceStage, SFX_FILES, MUSIC_FILES_SHARED, VOICE_FILES,
  WEAPON_SFX_IDS, WEAPON_SFX_FILES_REJETES, WEAPON_FILE_TRIM, WEAPON_FILE_VOLUME,
  WEAPON_FILE_BANDE_LUFS, weaponFileGain, CARNAGE_GORE_IDS, CARNAGE_GORE_IDS_REJETES
} from '@/audio/manifest'
import { WEAPON_ZZFX } from '@/audio/weaponSfx'
import { clamp01, musicGain, sfxGain, duckedGain, type AudioLevels } from '@/audio/settings'
import { Simulation } from '@core/simulation'
import type { Screen } from '@/app/appState'
import { WEAPONS } from '@content/weapons'
import { AudioDirector } from '@/audio/audioDirector'
import { EvolvedEvent, BossSpawnedEvent, EnemyDiedEvent } from '@core/events'
import type { AppViewState } from '@/app/appState'

describe('audio — musique par état (pure)', () => {
  const g = (screen: Screen, stageId: string, bossPresent = false): string | null =>
    musicForState({ screen, stageId, bossPresent })

  /**
   * LA faille de classe : `musicForState` retombait sur `default` pour tout écran
   * qu'il ne nommait pas — et `default` rend la musique DU STAGE. Résultat : ouvrir
   * les Options ou la sélection de perso depuis le titre lançait la musique de
   * chantier par-dessus un menu, et l'écran des succès la relançait sur une run finie.
   *
   * On énumère ici TOUS les écrans hors-jeu. La liste est dérivée du type `Screen` :
   * `SCREENS_HORS_JEU` + `SCREENS_DE_JEU` doivent couvrir l'union — si un écran est
   * ajouté sans être classé, le `switch` exhaustif de `musicForState` casse le BUILD.
   */
  const SCREENS_HORS_JEU: readonly Screen[] = [
    'characterSelect',
    'options',
    'achievements',
    'nameEntry',
    'hiscores',
    'paused'
  ]

  it('AUCUN écran hors-jeu ne joue la musique du stage', () => {
    for (const screen of SCREENS_HORS_JEU) {
      // Le stage est renseigné (comme en vrai : le flag survit à la run) et un boss
      // est présent : les deux chemins qui menaient à une musique de jeu.
      expect(g(screen, 'finitions', true), `écran ${screen}`).toBe(MUSIC.menu)
      expect(g(screen, 'finitions', false), `écran ${screen}`).toBe(MUSIC.menu)
    }
  })

  it('titre → titre ; pause → menu ; victoire/gameover → leur thème', () => {
    expect(g('title', 'terrain_vierge')).toBe(MUSIC.title)
    expect(g('paused', 'terrain_vierge')).toBe(MUSIC.menu)
    expect(g('victory', 'terrain_vierge')).toBe(MUSIC.victory)
    expect(g('gameover', 'terrain_vierge')).toBe(MUSIC.gameover)
  })

  it('boss présent → musique boss (prioritaire)', () => {
    expect(g('game', 'finitions', true)).toBe(MUSIC.boss)
  })

  it('musique dédiée par phase (10 pistes)', () => {
    expect(g('game', 'terrain_vierge')).toBe(MUSIC.stage_01)
    expect(g('game', 'fondations')).toBe(MUSIC.stage_03)
    expect(g('game', 'gros_oeuvre')).toBe(MUSIC.stage_05)
    expect(g('game', 'livraison_audit')).toBe(MUSIC.stage_10)
    expect(g('game', 'charpente_toiture')).toBe(MUSIC.stage_07)
    expect(g('game', 'finitions')).toBe(MUSIC.stage_09)
  })

  it("l'upgrade garde la musique de jeu (pas de switch à chaque niveau)", () => {
    expect(g('upgrade', 'terrain_vierge')).toBe(MUSIC.stage_01)
  })
})

describe('audio — cohérence manifeste ↔ préchargement', () => {
  it('chaque cue SFX ne référence que des clés préchargées', () => {
    const loaded = new Set(SFX_FILES.map(([k]) => k))
    for (const [name, cue] of Object.entries(SFX)) {
      expect(cue.keys.length, name).toBeGreaterThan(0)
      for (const key of cue.keys) {
        expect(loaded.has(key), `${name} → ${key} non préchargé`).toBe(true)
      }
    }
  })

  it('chaque musique partagée référencée est dans MUSIC_FILES_SHARED', () => {
    // Les pistes de stage sont lazy-loadées (non préchargées au boot) — seules les
    // musiques partagées (titre/menu/boss/victoire/gameover/ambiance) doivent être dans SHARED.
    const sharedLoaded = new Set(MUSIC_FILES_SHARED.map(([k]) => k))
    const sharedKeys = [MUSIC.title, MUSIC.menu, MUSIC.boss, MUSIC.victory, MUSIC.gameover] as const
    for (const key of sharedKeys) {
      expect(sharedLoaded.has(key), `${key} non préchargé`).toBe(true)
    }
  })

  it('chaque pool de VOIX (+ annonces de stage) ne référence que des clés préchargées', () => {
    const loaded = new Set(VOICE_FILES.map(([k]) => k))
    for (const [name, pool] of Object.entries(VOICE)) {
      expect(pool.length, name).toBeGreaterThan(0)
      for (const key of pool) {
        expect(loaded.has(key), `${name} → ${key} non préchargé`).toBe(true)
      }
    }
    for (let order = 1; order <= 10; order++) {
      expect(loaded.has(voiceStage(order)), `stage ${order}`).toBe(true)
    }
  })
})

/**
 * Niveaux des SFX d'armes en fichier.
 *
 * Un mix se juge à l'oreille — mais un fichier livré 22 à 53 dB sous ses voisines
 * ne relève pas du goût, il ne s'entend simplement JAMAIS. C'est ce que ces tests
 * verrouillent : pas « le mix est bon », mais « aucun son n'est objectivement
 * hors-jeu, et aucune correction n'est appliquée à l'aveugle ».
 *
 * Les mesures citées viennent de `npm run audio:qa` (EBU R128, max momentané).
 */
describe('audio — niveaux des SFX d\'armes (fichier)', () => {
  it('une arme sans trim joue au gain commun de la famille', () => {
    expect(weaponFileGain('cloueur')).toBe(WEAPON_FILE_VOLUME)
    expect(weaponFileGain('extincteur')).toBe(WEAPON_FILE_VOLUME)
    expect(weaponFileGain('arme_inconnue')).toBe(WEAPON_FILE_VOLUME) // repli, jamais 0
  })

  it('la brouette (fichier 22 dB sous sa famille) est remontée au-dessus du gain commun', () => {
    // +17 dB → ×7.08. Sans ça elle jouait à ≈ −43 dBFS, 25 dB sous la musique.
    expect(weaponFileGain('brouette')).toBeCloseTo(WEAPON_FILE_VOLUME * 7.079, 2)
    expect(weaponFileGain('brouette')).toBeGreaterThan(weaponFileGain('cloueur'))
  })

  it('AUCUN trim ne fait clipper sa source (pic mesuré + gain ≤ −0.5 dBFS)', () => {
    // LA garde de ce mécanisme : remonter un fichier est sûr tant que son pic
    // reste sous 0 dBFS. C'est ce qui interdit de viser la médiane de la famille
    // pour la brouette (+22 dB l'aurait posée à +4 dBFS).
    for (const [id, trim] of Object.entries(WEAPON_FILE_TRIM)) {
      expect(trim.picDbfs + trim.gainDb, `${id} clipperait`).toBeLessThanOrEqual(-0.5)
    }
  })

  it('tout trim atterrit DANS la bande mesurée de la famille (il aligne, il ne mixe pas)', () => {
    for (const [id, trim] of Object.entries(WEAPON_FILE_TRIM)) {
      const apres = trim.mesureLufs + trim.gainDb
      expect(apres, `${id} sous la famille`).toBeGreaterThanOrEqual(WEAPON_FILE_BANDE_LUFS.min)
      expect(apres, `${id} au-dessus de la famille`).toBeLessThanOrEqual(WEAPON_FILE_BANDE_LUFS.max)
    }
  })

  it('tout trim porte sur une arme réellement jouée en fichier (pas de trim mort)', () => {
    for (const id of Object.keys(WEAPON_FILE_TRIM)) {
      expect(WEAPON_SFX_IDS, `trim ${id} sans fichier déclaré`).toContain(id)
    }
  })

  it('une arme au fichier rejeté n\'est PAS déclarée, et garde un zzfx pour la couvrir', () => {
    // Le rejet n'a de sens que si le repli existe : sinon on remplace un son
    // inaudible par du silence, ce qui est pire.
    for (const id of WEAPON_SFX_FILES_REJETES) {
      expect(WEAPON_SFX_IDS, `${id} encore déclaré en fichier`).not.toContain(id)
      expect(WEAPON_ZZFX[id], `${id} sans repli zzfx`).toBeDefined()
    }
  })

  it('goudron et coulee_bitume, régénérés, sont rebranchés SANS trim', () => {
    // Ces deux-là ont été livrés morts puis régénérés (−11.5 et −12.2 LUFS,
    // dans la bande de la famille). Le fait qu'ils ne demandent AUCUN trim est
    // le signe que la source est bonne : un trim ici voudrait dire qu'on
    // rattrape au gain un fichier qu'il fallait refaire — l'erreur d'origine.
    for (const id of ['goudron', 'coulee_bitume']) {
      expect(WEAPON_SFX_IDS, `${id} pas rebranché`).toContain(id)
      expect(WEAPON_SFX_FILES_REJETES, `${id} encore en quarantaine`).not.toContain(id)
      expect(WEAPON_FILE_TRIM[id], `${id} rattrapé au gain au lieu d'être sain`).toBeUndefined()
    }
  })
})

describe('audio — pool de gore du Mode Carnage', () => {
  it('aucune variante écartée ne reste dans le pool tiré au sort', () => {
    // Liste vide aujourd'hui — gore_2, longtemps 20 dB sous ses pairs, a été
    // régénérée (−12.1 LUFS) et a rejoint le pool. L'invariant, lui, tient :
    // une variante écartée pour son niveau ne doit JAMAIS être tirée au sort,
    // car sous le même volume elle s'entendrait comme un trou.
    for (const rejete of CARNAGE_GORE_IDS_REJETES) {
      expect(CARNAGE_GORE_IDS, `gore_${rejete} écarté mais encore dans le pool`).not.toContain(rejete)
    }
  })

  it('les 5 variantes livrées sont toutes dans le pool (aucune n\'est en quarantaine)', () => {
    // Le pendant du test ci-dessus : il interdit de tirer une variante écartée,
    // celui-ci interdit d'en OUBLIER une en quarantaine après régénération —
    // c'est exactement l'état dans lequel gore_2 a dormi.
    expect(CARNAGE_GORE_IDS).toEqual([1, 2, 3, 4, 5])
    expect(CARNAGE_GORE_IDS_REJETES).toEqual([])
  })

  it('le pool garde plusieurs variantes (une seule saoulerait à une mort/seconde)', () => {
    expect(CARNAGE_GORE_IDS.length).toBeGreaterThanOrEqual(3)
  })

  it('le cue carnageGore est throttlé bien plus haut que le cue de kill', () => {
    // Son gras et sale à cadence de horde → bouillie s'il suit `enemyKilled`.
    const gore = SFX['carnageGore']?.throttleMs ?? 0
    const kill = SFX['enemyKilled']?.throttleMs ?? 0
    expect(gore).toBeGreaterThan(kill * 3)
  })
})

describe('audio — réglages (gains)', () => {
  const base: AudioLevels = { master: 0.5, music: 0.8, sfx: 0.6, muted: false }
  it('gain = master × canal ; muet → 0', () => {
    expect(musicGain(base)).toBeCloseTo(0.4)
    expect(sfxGain(base)).toBeCloseTo(0.3)
    expect(musicGain({ ...base, muted: true })).toBe(0)
    expect(sfxGain({ ...base, muted: true })).toBe(0)
  })
  it('clamp01 borne 0..1', () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(0.3)).toBe(0.3)
  })
  it('duckedGain : voix active → gain rabattu ; sinon inchangé', () => {
    expect(duckedGain(0.44, false, 0.28)).toBeCloseTo(0.44) // pas de voix → plein
    expect(duckedGain(0.44, true, 0.28)).toBeCloseTo(0.1232) // voix → ducké à 28 %
    expect(duckedGain(0, true, 0.28)).toBe(0) // base nulle (muet) reste nulle
  })
})

describe('audio — SFX de tir couvre toute arme projectile (pas seulement cloueur)', () => {
  it('cloueur ET son évolution mitrailleuse_clous sont de type projectile', () => {
    // AudioDirector.weaponFired joue le SFX de tir pour WEAPONS[kind]?.kind === 'projectile' —
    // vérifie ici que l'évoluée qualifie bien (sinon elle tirerait en silence).
    expect(WEAPONS['cloueur']?.kind).toBe('projectile')
    expect(WEAPONS['mitrailleuse_clous']?.kind).toBe('projectile')
  })
})

describe('audio — évolution (arme évoluée) déclenche voix triomphante', () => {
  /** Fake minimal du sous-ensemble de `BaseSoundManager` que l'AudioDirector consomme. */
  function fakeSoundManager(): { manager: Phaser.Sound.BaseSoundManager; addedKeys: string[] } {
    const addedKeys: string[] = []
    const manager = {
      locked: false,
      play: () => true,
      add: (key: string) => { addedKeys.push(key); return { play: () => true, stop: () => true, destroy: () => {}, once: () => {}, volume: 0, isPlaying: false } },
      game: { cache: { audio: { exists: () => true } } }
    } as unknown as Phaser.Sound.BaseSoundManager
    return { manager, addedKeys }
  }

  it('un EvolvedEvent dispatché sur le bus déclenche la voix bonus (fanfare zzfx + triomphe)', () => {
    // B5 : evolved → playChestFanfare (zzfx procédural, sans cue Phaser) + playVoice(VOICE.bonus).
    // Le cue 'bonus' n'est plus joué directement (remplacé par la fanfare zzfx) ;
    // la voix VOICE.bonus (voice_bonus) est toujours lancée via `add()`.
    const events = new EventTarget()
    const { manager, addedKeys } = fakeSoundManager()
    const settings: AudioLevels = { master: 1, music: 1, sfx: 1, muted: false }
    const director = new AudioDirector(manager, events, () => settings)
    expect(director).toBeInstanceOf(AudioDirector) // construit pour son effet de bord (bindEvents s'abonne au bus)
    events.dispatchEvent(new EvolvedEvent('mitrailleuse_clous', 1))
    // La voix d'évolution est ajoutée via add() (pool VOICE.evolved : bonus OU clou-douken).
    expect(addedKeys.length).toBe(1)
    expect(VOICE.evolved).toContain(addedKeys[0])
  })
})

describe('audio — le boss final déclenche une réplique dédiée (distincte du mid-boss)', () => {
  /** Fake minimal du sous-ensemble de `BaseSoundManager` que l'AudioDirector consomme. */
  function fakeSoundManager(): { manager: Phaser.Sound.BaseSoundManager; addedKeys: string[] } {
    const addedKeys: string[] = []
    const manager = {
      locked: false,
      play: () => true,
      add: (key: string) => {
        addedKeys.push(key)
        return { play: () => true, stop: () => true, destroy: () => {}, once: () => {}, volume: 0, isPlaying: false }
      },
      game: { cache: { audio: { exists: () => true } } }
    } as unknown as Phaser.Sound.BaseSoundManager
    return { manager, addedKeys }
  }

  it("BossSpawnedEvent('final') joue une réplique du pool VOICE.bossFinal", () => {
    const events = new EventTarget()
    const { manager, addedKeys } = fakeSoundManager()
    const settings: AudioLevels = { master: 1, music: 1, sfx: 1, muted: false }
    const director = new AudioDirector(manager, events, () => settings)
    expect(director).toBeInstanceOf(AudioDirector)
    events.dispatchEvent(new BossSpawnedEvent('final'))
    expect(addedKeys.length).toBe(1)
    expect(VOICE.bossFinal).toContain(addedKeys[0])
  })

  it("BossSpawnedEvent('mid') joue une réplique du pool VOICE.boss (pas nécessairement final)", () => {
    const events = new EventTarget()
    const { manager, addedKeys } = fakeSoundManager()
    const settings: AudioLevels = { master: 1, music: 1, sfx: 1, muted: false }
    const director = new AudioDirector(manager, events, () => settings)
    expect(director).toBeInstanceOf(AudioDirector)
    events.dispatchEvent(new BossSpawnedEvent('mid'))
    expect(addedKeys.length).toBe(1)
    expect(VOICE.boss).toContain(addedKeys[0])
  })
})

/**
 * Le commit du Mode Carnage (6f1650a) annonce « chaque ennemi tué laisse une
 * gerbe […] avec un bruit de chair broyée » : les 5 fichiers ont été livrés, le
 * cue `carnageGore` entièrement spécifié… et jamais appelé. Le son n'existait
 * que sur le papier. Ces tests verrouillent les deux sens du branchement.
 */
describe('audio — bruit de chair du Mode Carnage', () => {
  /** Fake capturant les cues joués (`sound.play`), pas seulement les voix (`add`). */
  function fakeSoundManager(): { manager: Phaser.Sound.BaseSoundManager; playedKeys: string[] } {
    const playedKeys: string[] = []
    const manager = {
      locked: false,
      play: (key: string) => { playedKeys.push(key); return true },
      add: () => ({ play: () => true, stop: () => true, destroy: () => {}, once: () => {}, volume: 0, isPlaying: false }),
      game: { cache: { audio: { exists: () => true } }, scene: { getScene: () => null } }
    } as unknown as Phaser.Sound.BaseSoundManager
    return { manager, playedKeys }
  }

  /** État minimal suffisant pour `observe()` — seul `carnage` nous intéresse ici. */
  function fakeState(carnage: boolean): AppViewState {
    return {
      screen: 'game', stageId: 'terrain_vierge', stageOrder: 1,
      enemies: [], players: [], carnage
    } as unknown as AppViewState
  }

  function mort(): EnemyDiedEvent {
    return new EnemyDiedEvent(10, 20, 'imp', false, undefined, 'cloueur', 1, 0)
  }

  const settings: AudioLevels = { master: 1, music: 1, sfx: 1, muted: false }

  it('HORS Mode Carnage, une mort ne produit AUCUN bruit de chair', () => {
    const events = new EventTarget()
    const { manager, playedKeys } = fakeSoundManager()
    const director = new AudioDirector(manager, events, () => settings)
    director.observe(fakeState(false))
    playedKeys.length = 0 // ignore les cues d'entrée d'écran
    events.dispatchEvent(mort())
    expect(playedKeys.filter((k) => k.startsWith('sfx_gore_'))).toEqual([])
  })

  it('EN Mode Carnage, une mort produit une variante de gore du pool', () => {
    const events = new EventTarget()
    const { manager, playedKeys } = fakeSoundManager()
    const director = new AudioDirector(manager, events, () => settings)
    director.observe(fakeState(true))
    playedKeys.length = 0
    events.dispatchEvent(mort())
    const gores = playedKeys.filter((k) => k.startsWith('sfx_gore_'))
    expect(gores.length).toBe(1)
    expect(CARNAGE_GORE_IDS.map((n) => `sfx_gore_${n}`)).toContain(gores[0])
  })

  it('le Mode Carnage coupé en cours de run refait taire les morts', () => {
    const events = new EventTarget()
    const { manager, playedKeys } = fakeSoundManager()
    const director = new AudioDirector(manager, events, () => settings)
    director.observe(fakeState(true))
    director.observe(fakeState(false)) // le Konami rebascule → le son doit suivre
    playedKeys.length = 0
    events.dispatchEvent(mort())
    expect(playedKeys.filter((k) => k.startsWith('sfx_gore_'))).toEqual([])
  })
})

describe('audio — la sim émet les événements sémantiques', () => {
  it('enemyKilled et weaponFired sont émis en jeu réel', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    let killed = 0
    let fired = 0
    sim.events.addEventListener('enemyKilled', () => { killed += 1 })
    sim.events.addEventListener('weaponFired', () => { fired += 1 })
    for (let t = 0; t < 60000 && killed < 1; t += 100) {
      sim.advanceTime(100)
    }
    expect(fired).toBeGreaterThan(0) // le cloueur tire automatiquement
    expect(killed).toBeGreaterThan(0) // des ennemis meurent → SFX
  })
})
