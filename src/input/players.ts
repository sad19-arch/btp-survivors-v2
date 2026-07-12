import { EMPTY_FRAME, type FrameInput, type NavAction } from './intents'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Fusionne deux FrameInput : move sommé+clampé [-1,1], pressed en union dédupliquée. */
export function mergeFrames(a: FrameInput, b: FrameInput): FrameInput {
  const move = {
    x: clamp(a.move.x + b.move.x, -1, 1),
    y: clamp(a.move.y + b.move.y, -1, 1),
  }
  const pressed: NavAction[] = [...new Set([...a.pressed, ...b.pressed])]
  const action = a.action || b.action
  return { move, pressed, action }
}

/**
 * Map par-joueur : joueur 1 = clavier ⊕ pad0 ⊕ tactile (jouable clavier OU manette 0
 * OU stick tactile, comme le solo actuel) ; joueur k≥2 = pad(k-1) (FrameInput vide si
 * absent). Boucle 1..max(playerCount, 1) pour que P1 existe TOUJOURS (même hors partie,
 * au titre où playerCount vaut 0) → la nav menu reste dispo. Le tactile n'alimente QUE P1.
 */
export function buildPlayerInputs(
  keyboard: FrameInput,
  pads: ReadonlyArray<FrameInput>,
  playerCount: number,
  touch: FrameInput = EMPTY_FRAME
): Map<number, FrameInput> {
  const map = new Map<number, FrameInput>()
  for (let id = 1; id <= Math.max(playerCount, 1); id++) {
    if (id === 1) {
      map.set(id, mergeFrames(mergeFrames(keyboard, pads[0] ?? EMPTY_FRAME), touch))
    } else {
      map.set(id, pads[id - 1] ?? EMPTY_FRAME)
    }
  }
  return map
}
