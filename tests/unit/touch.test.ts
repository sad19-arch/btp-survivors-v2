import { afterEach, describe, expect, it } from 'vitest'
import { TouchInput } from '@input/touch'

function pointer(type: string, x: number, y: number, pointerId = 7): Event {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('TouchInput — stick P1 et pause one-shot', () => {
  it('transforme un glissement à droite en mouvement puis revient au neutre', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const input = new TouchInput(parent)
    const layer = parent.querySelector<HTMLElement>('.touch-layer')
    if (layer === null) {
      throw new Error('touch-layer absent')
    }
    layer.setPointerCapture = () => {}
    layer.hasPointerCapture = () => false

    layer.dispatchEvent(pointer('pointerdown', 100, 200))
    layer.dispatchEvent(pointer('pointermove', 155, 200))
    expect(input.readFrame().move.x).toBeCloseTo(1)
    expect(input.readFrame().move.y).toBeCloseTo(0)

    layer.dispatchEvent(pointer('pointerup', 155, 200))
    expect(input.readFrame().move).toEqual({ x: 0, y: 0 })
    input.dispose()
  })

  it('le bouton pause produit exactement un front', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const input = new TouchInput(parent)
    const pause = parent.querySelector<HTMLElement>('.touch-pause')
    if (pause === null) {
      throw new Error('touch-pause absent')
    }
    pause.dispatchEvent(pointer('pointerdown', 900, 600))
    expect(input.readFrame().pressed).toEqual(['pause'])
    expect(input.readFrame().pressed).toEqual([])
    input.dispose()
  })

  it('masquer l’overlay annule mouvement et pause en attente', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const input = new TouchInput(parent)
    const layer = parent.querySelector<HTMLElement>('.touch-layer')
    const pause = parent.querySelector<HTMLElement>('.touch-pause')
    if (layer === null || pause === null) {
      throw new Error('contrôles tactiles absents')
    }
    layer.setPointerCapture = () => {}
    layer.hasPointerCapture = () => false
    input.setVisible(true)
    layer.dispatchEvent(pointer('pointerdown', 100, 200))
    layer.dispatchEvent(pointer('pointermove', 155, 200))
    pause.dispatchEvent(pointer('pointerdown', 900, 600, 8))

    input.setVisible(false)
    expect(input.readFrame()).toEqual({
      move: { x: 0, y: 0 },
      pressed: [],
      action: false,
    })
    input.dispose()
  })
})
