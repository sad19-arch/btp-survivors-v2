import type Phaser from 'phaser'
import type { CinemaDeps } from '@render/scenes/cinemaStageImpl'
import type { CameraController } from '@render/scenes/cameraController'
import { CinemaBannerEvent, CinemaSfxEvent, CinemaVoiceEvent } from '@render/cinemaEvents'

/**
 * Construit la façade Phaser du séquenceur d'intro (les `CinemaDeps` injectées
 * dans `CinemaStageImpl`). Extrait de `GameScene` — c'est du CÂBLAGE, pas une
 * responsabilité de la scène : GameScene ne fait qu'appeler ce factory et
 * déléguer (règle « GameScene n'est pas une poubelle »).
 *
 * - Caméra : délègue au `CameraController` (cut / zoom / punch / whip).
 * - slowmo / flash / shake / acteurs : effets Phaser purement cosmétiques,
 *   dépilés dans cette scène.
 * - banner / voice / sfx : DISPATCHÉS sur le bus `events` (= `app.events`) car
 *   leurs consommateurs (overlay DOM, AudioDirector) vivent hors du rendu ;
 *   `main.ts` route ces cues. En test/headless (audio coupé, pas de wiring) ils
 *   sont inertes — la cinématique reste cosmétique et sans effet sur la sim.
 */
export function createCinemaDeps(
  scene: Phaser.Scene,
  camera: CameraController,
  events: EventTarget
): CinemaDeps {
  return {
    camCut: (cx, cy, z) => camera.camCut(cx, cy, z),
    camZoomTo: (cx, cy, z, ms, ease) => camera.camZoomTo(cx, cy, z, ms, ease),
    camPunchIn: (cx, cy, z, ms) => camera.camPunchIn(cx, cy, z, ms),
    camWhipPan: (cx, cy, ms) => camera.camWhipPan(cx, cy, ms),
    slowmo: (scale, ms) => {
      scene.tweens.timeScale = scale
      scene.time.delayedCall(ms, () => {
        scene.tweens.timeScale = 1
      })
    },
    banner: (text) => {
      events.dispatchEvent(new CinemaBannerEvent(text))
    },
    voice: (key) => {
      events.dispatchEvent(new CinemaVoiceEvent(key))
    },
    sfx: (cue) => {
      events.dispatchEvent(new CinemaSfxEvent(cue))
    },
    flash: () => {
      // Flash plein écran blanc bref (cosmétique) : rectangle blanc centré sur le monde.
      const cam = scene.cameras.main
      const w = cam.width / cam.zoom
      const h = cam.height / cam.zoom
      const cx = cam.scrollX + w / 2
      const cy = cam.scrollY + h / 2
      const rect = scene.add.rectangle(cx, cy, w * 4, h * 4, 0xffffff, 1).setDepth(70)
      scene.tweens.add({ targets: rect, alpha: 0, duration: 180, onComplete: () => { rect.destroy() } })
    },
    shake: (intensity) => {
      scene.cameras.main.shake(200, intensity * 0.01)
    },
    makeActor: (key, x, y, scale) => {
      const spr = scene.add.sprite(x, y, key).setScale(scale).setDepth(60)
      return {
        setPosition: (nx, ny) => { spr.setPosition(nx, ny) },
        moveTo: (nx, ny, ms) => { scene.tweens.add({ targets: spr, x: nx, y: ny, duration: ms }) },
        play: (anim) => {
          if (scene.textures.exists(key)) {
            try { spr.play(anim) } catch { /* anim absente : no-op */ }
          }
        },
        destroy: () => { spr.destroy() },
      }
    },
  }
}
