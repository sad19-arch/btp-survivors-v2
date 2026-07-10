/**
 * bootEditor — point d'entrée du Stage Composer Editor (activé par ?editor=true).
 *
 * Crée un Phaser DÉDIÉ (aucun App/sim/audio du jeu normal → gameplay intact),
 * monte la scène de carte + la palette DOM + la barre d'outils, câble le
 * drag-drop palette→map, et gère le CHANGEMENT DE STAGE (redémarre la scène avec
 * le catalogue de la phase choisie).
 */

import Phaser from 'phaser'
import { EditorScene, type EditorSceneData } from './EditorScene'
import { EditorState } from './EditorState'
import { EditorPalette } from './EditorPalette'
import { EditorOverlay } from './EditorOverlay'
import { setActiveStage } from './PrefabCatalog'
import { clearThumbnailCache } from './PrefabThumbnail'

const OFFSET_X = 5120
const OFFSET_Y = 3840
const START_STAGE = 'terrain_vierge'

const CSS = `
.sce-overlay{position:fixed;inset:0;z-index:9998;pointer-events:none;font-family:'Courier New',monospace;color:#f0e6d2}
.sce-panel{pointer-events:auto;background:#1c150e;border:3px solid #000;box-shadow:4px 4px 0 rgba(0,0,0,.5)}
.sce-toolbar{position:absolute;top:0;left:0;right:0;height:44px;display:flex;align-items:center;gap:6px;padding:0 10px;background:#241b12;border-bottom:3px solid #000;font-weight:bold;font-size:13px;overflow-x:auto}
.sce-select{background:#0d0a07;color:#f0e6d2;border:2px solid #000;padding:5px;font-family:inherit;font-size:12px}
.sce-btn{background:#3a2c1c;color:#f0e6d2;border:2px solid #000;padding:5px 9px;font-family:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.sce-btn:hover{background:#513c26}
.sce-btn-on{background:#c8892f;color:#1c150e}
.sce-btn-danger{background:#7a2f22}
.sce-btn-primary{background:#2f7a55}
.sce-palette{position:absolute;top:52px;left:8px;bottom:8px;width:340px;display:flex;flex-direction:column;overflow:hidden}
.sce-pal-title{padding:8px 10px;font-weight:bold;color:#ffb424;border-bottom:2px solid #000;font-size:13px}
.sce-search{margin:8px;padding:6px;background:#0d0a07;border:2px solid #000;color:#f0e6d2;font-family:inherit;font-size:13px}
.sce-pal-list{overflow-y:auto;padding:0 6px 10px}
.sce-cat-head{cursor:pointer;padding:7px 6px;margin-top:6px;color:#ffb424;font-size:12px;font-weight:bold;border-bottom:1px solid #000;user-select:none}
.sce-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:6px 2px}
.sce-card{background:#2a2016;border:2px solid #000;padding:5px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px}
.sce-card:hover{border-color:#ffb424}
.sce-card-active{border-color:#ffb424;background:#4a3620;box-shadow:0 0 0 2px #ffb424 inset}
.sce-thumb{width:96px;height:96px;image-rendering:pixelated;background:#0d0a07;border:1px solid #000}
.sce-card-name{font-size:11px;text-align:center;line-height:1.1}
.sce-card-badges{display:flex;gap:3px;flex-wrap:wrap;justify-content:center}
.sce-badge{font-size:9px;padding:1px 4px;border:1px solid #000}
.sce-badge-kind{background:#3f5f8f}
.sce-badge-size{background:#5f4e8f}
.sce-side{position:absolute;top:52px;right:8px;width:300px;max-height:calc(100vh - 60px);overflow-y:auto;padding:8px}
.sce-inspector{border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px;font-size:12px}
.sce-tool{background:#3a2c1c;padding:5px;margin-bottom:6px;border:2px solid #ffb424;font-size:11px}
.sce-insp-title{font-weight:bold;color:#ffb424;font-size:14px}
.sce-insp-row{opacity:.85;margin-top:3px}
.sce-insp-hint{opacity:.7;font-size:11px;line-height:1.4}
.sce-insp-actions{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}
.sce-warns-title{font-weight:bold;color:#ffb424;font-size:12px;margin-bottom:5px}
.sce-warn{font-size:11px;padding:4px 6px;margin-bottom:3px;border:1px solid #000}
.sce-warn-ok{background:#24401c;color:#8fe07a}
.sce-warn-warn{background:#4a3a12;color:#ffd166}
.sce-warn-err{background:#4a1c12;color:#ff8f7a}
.sce-modal{position:absolute;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;pointer-events:auto}
.sce-hidden{display:none}
.sce-modal-box{width:min(760px,90vw);height:min(70vh,600px);display:flex;flex-direction:column;background:#1c150e;border:3px solid #000;padding:10px}
.sce-modal-text{flex:1;background:#0d0a07;color:#8fe07a;border:2px solid #000;font-family:monospace;font-size:12px;padding:8px;resize:none}
.sce-modal-btns{display:flex;gap:6px;margin-top:8px}
.sce-walk .sce-palette,.sce-walk .sce-side{display:none}
`

let booted = false

export function bootEditor(): void {
  if (booted) {
    return
  }
  booted = true

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const overlayRoot = document.createElement('div')
  overlayRoot.className = 'sce-overlay'
  document.body.appendChild(overlayRoot)

  let currentStage = START_STAGE
  let state = new EditorState(currentStage)
  let curScene: EditorScene | null = null
  setActiveStage(currentStage)

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: '#241b12',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: '100%', height: '100%' },
    scene: []
  })

  // Drag-drop palette → carte (une seule fois : le canvas persiste entre stages).
  const canvas = game.canvas
  canvas.addEventListener('dragover', (e) => e.preventDefault())
  canvas.addEventListener('drop', (e) => {
    e.preventDefault()
    const id = e.dataTransfer?.getData('text/plain')
    if (id === undefined || id === '' || curScene === null) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    const w = curScene.cameras.main.getWorldPoint(e.clientX - rect.left, e.clientY - rect.top)
    const s = state.applySnap(w.x - OFFSET_X, w.y - OFFSET_Y)
    state.addInstance(id, s.x, s.y)
  })

  // Fonctions hoisted (référence mutuelle buildDom ↔ switchStage).
  function makeData(): EditorSceneData {
    return { state, stageId: currentStage, onReady: buildDom }
  }
  function buildDom(scene: EditorScene): void {
    curScene = scene
    overlayRoot.innerHTML = ''
    const paletteDiv = document.createElement('div')
    paletteDiv.className = 'sce-panel sce-palette'
    overlayRoot.appendChild(paletteDiv)
    const palette = new EditorPalette(paletteDiv, scene)
    const overlay = new EditorOverlay(overlayRoot, scene, switchStage)
    scene.onUiRefresh(() => {
      palette.refresh()
      overlay.refresh()
    })
    overlay.refresh()
  }
  function switchStage(newStage: string): void {
    if (newStage === currentStage) {
      return
    }
    currentStage = newStage
    document.body.classList.remove('sce-walk')
    setActiveStage(newStage)
    clearThumbnailCache()
    state = new EditorState(newStage)
    game.scene.remove('editor')
    game.scene.add('editor', EditorScene, true, makeData())
  }

  game.scene.add('editor', EditorScene, true, makeData())

  // eslint-disable-next-line no-console
  console.log('[Stage Composer] prêt — ?editor=true')
}
