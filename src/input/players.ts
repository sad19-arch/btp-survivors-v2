import type { FrameInput, NavAction } from './intents'

const EMPTY: FrameInput = { move: { x: 0, y: 0 }, pressed: [], action: false }

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
 * Map par-joueur : joueur 1 = clavier ⊕ pad0 (jouable clavier OU manette 0, comme le solo actuel) ;
 * joueur k≥2 = pad(k-1) (FrameInput vide si absent). Boucle 1..max(playerCount, 1) pour que P1
 * existe TOUJOURS (même hors partie, au titre où playerCount vaut 0) → la nav menu reste dispo.
 */
export function buildPlayerInputs(
  keyboard: FrameInput,
  pads: ReadonlyArray<FrameInput>,
  playerCount: number
): Map<number, FrameInput> {
  const map = new Map<number, FrameInput>()
  for (let id = 1; id <= Math.max(playerCount, 1); id++) {
    if (id === 1) {
      map.set(id, mergeFrames(keyboard, pads[0] ?? EMPTY))
    } else {
      map.set(id, pads[id - 1] ?? EMPTY)
    }
  }
  return map
}
