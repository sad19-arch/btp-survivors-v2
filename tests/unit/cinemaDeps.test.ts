/**
 * La façade cinématique (`createCinemaDeps`) route ses cues cosmétiques
 * bandeau/voix/SFX sur le bus d'événements (= `app.events`). Ce test prouve que
 * ces trois cues — les ex-« no-ops » — DISPATCHENT bien un événement typé, que
 * `main.ts` relaie ensuite vers l'overlay et l'AudioDirector.
 *
 * On n'a besoin ni de Phaser ni de la caméra : banner/voice/sfx ne touchent que
 * le bus. Les stubs scene/camera ne sont jamais déréférencés pour ces cues.
 */

import { describe, it, expect } from 'vitest'
import type Phaser from 'phaser'
import { createCinemaDeps } from '../../src/render/scenes/cinemaDeps'
import { CinemaBannerEvent, CinemaSfxEvent, CinemaVoiceEvent } from '../../src/render/cinemaEvents'
import type { CameraController } from '../../src/render/scenes/cameraController'

const stubScene = {} as unknown as Phaser.Scene
const stubCamera = {} as unknown as CameraController

describe('createCinemaDeps — routage des cues cosmétiques', () => {
  it('banner(text) dispatche un CinemaBannerEvent avec le texte', () => {
    const bus = new EventTarget()
    let received: string | null = null
    bus.addEventListener('cinemaBanner', (e) => { received = (e as CinemaBannerEvent).text })

    createCinemaDeps(stubScene, stubCamera, bus).banner('TERRASSEMENT')
    expect(received).toBe('TERRASSEMENT')
  })

  it('sfx(cue) dispatche un CinemaSfxEvent avec le cue', () => {
    const bus = new EventTarget()
    let received: string | null = null
    bus.addEventListener('cinemaSfx', (e) => { received = (e as CinemaSfxEvent).cue })

    createCinemaDeps(stubScene, stubCamera, bus).sfx('clonk')
    expect(received).toBe('clonk')
  })

  it('voice(key) dispatche un CinemaVoiceEvent avec la clé', () => {
    const bus = new EventTarget()
    let received: string | null = null
    bus.addEventListener('cinemaVoice', (e) => { received = (e as CinemaVoiceEvent).key })

    createCinemaDeps(stubScene, stubCamera, bus).voice('voice_go_go_go')
    expect(received).toBe('voice_go_go_go')
  })

  it('aucun cue n\'est émis tant qu\'on n\'appelle pas la façade (pas d\'effet au montage)', () => {
    const bus = new EventTarget()
    let count = 0
    for (const name of ['cinemaBanner', 'cinemaSfx', 'cinemaVoice']) {
      bus.addEventListener(name, () => { count++ })
    }
    createCinemaDeps(stubScene, stubCamera, bus)
    expect(count).toBe(0)
  })
})
