/**
 * PrefabThumbnail — génère une miniature (128²) d'une entrée de palette à partir
 * des VRAIS sprites chargés dans le Phaser de l'éditeur. Calcule les bounds du
 * prefab, centre + scale pour rentrer dans la vignette, met en cache le dataURL.
 *
 * Fallbacks (jamais de carte vide) :
 *   1. rendu exact des éléments ;
 *   2. si aucun élément dessinable → icône générique par catégorie (carré + lettre).
 */

import type Phaser from 'phaser'
import { editorAsset, type PaletteEntry } from './PrefabCatalog'

const SIZE = 128
const PAD = 12

const cache = new Map<string, string>()

const CATEGORY_COLOR: Record<string, string> = {
  scenes: '#c8892f',
  stocks: '#5f8f4e',
  routes: '#7a6f57',
  workers: '#3f7fa8',
  safety: '#b0492f',
  decor: '#6a5b8f',
  objects: '#8a8a8a',
  markers: '#2f8f6f'
}

interface DrawElem {
  img: CanvasImageSource
  cutX: number
  cutY: number
  cutW: number
  cutH: number
  dx: number
  dy: number
  scale: number
  flipX: boolean
}

function resolveElements(scene: Phaser.Scene, entry: PaletteEntry): DrawElem[] {
  const out: DrawElem[] = []
  for (const el of entry.elements ?? []) {
    if (!scene.textures.exists(el.assetKey)) {continue}
    const asset = editorAsset(el.assetKey)
    const tex = scene.textures.get(el.assetKey)
    const frameName = asset?.sheet === true ? 0 : '__BASE'
    let frame
    try {
      frame = tex.get(frameName)
    } catch {
      continue
    }
    if (frame === undefined || frame === null) {continue}
    const src = frame.source.image as CanvasImageSource
    out.push({
      img: src,
      cutX: frame.cutX,
      cutY: frame.cutY,
      cutW: frame.cutWidth,
      cutH: frame.cutHeight,
      dx: el.dx,
      dy: el.dy,
      scale: el.scale,
      flipX: el.flipX === true
    })
  }
  return out
}

function fallbackIcon(entry: PaletteEntry): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (ctx === null) {return ''}
  const color = CATEGORY_COLOR[entry.category] ?? '#666'
  ctx.fillStyle = '#1c150e'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = color
  ctx.fillRect(16, 16, SIZE - 32, SIZE - 32)
  ctx.fillStyle = '#000'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#000'
  ctx.strokeRect(16, 16, SIZE - 32, SIZE - 32)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 52px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText((entry.label[0] ?? '?').toUpperCase(), SIZE / 2, SIZE / 2 + 2)
  return canvas.toDataURL('image/png')
}

/** Renvoie le dataURL de la miniature (généré une fois puis mis en cache). */
export function thumbnailFor(scene: Phaser.Scene, entry: PaletteEntry): string {
  const hit = cache.get(entry.id)
  if (hit !== undefined) {return hit}

  const elems = resolveElements(scene, entry)
  if (elems.length === 0) {
    const fb = fallbackIcon(entry)
    cache.set(entry.id, fb)
    return fb
  }

  // Bounds (origine sprite = centre 0.5).
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const e of elems) {
    const hw = (e.cutW * e.scale) / 2
    const hh = (e.cutH * e.scale) / 2
    minX = Math.min(minX, e.dx - hw)
    maxX = Math.max(maxX, e.dx + hw)
    minY = Math.min(minY, e.dy - hh)
    maxY = Math.max(maxY, e.dy + hh)
  }
  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const fit = (SIZE - 2 * PAD) / Math.max(bw, bh)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    const fb = fallbackIcon(entry)
    cache.set(entry.id, fb)
    return fb
  }
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#1c150e'
  ctx.fillRect(0, 0, SIZE, SIZE)

  for (const e of elems) {
    const canvasX = SIZE / 2 + (e.dx - cx) * fit
    const canvasY = SIZE / 2 + (e.dy - cy) * fit
    const dw = e.cutW * e.scale * fit
    const dh = e.cutH * e.scale * fit
    ctx.save()
    ctx.translate(canvasX, canvasY)
    if (e.flipX) {ctx.scale(-1, 1)}
    try {
      ctx.drawImage(e.img, e.cutX, e.cutY, e.cutW, e.cutH, -dw / 2, -dh / 2, dw, dh)
    } catch {
      /* image pas prête : on saute cet élément */
    }
    ctx.restore()
  }

  const url = canvas.toDataURL('image/png')
  cache.set(entry.id, url)
  return url
}

export function clearThumbnailCache(): void {
  cache.clear()
}
