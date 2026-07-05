import { describe, it, expect } from 'vitest'
import { playZzfx, createWhirLoop } from '@/audio/zzfx'

/** Mock minimal d'AudioContext : enregistre les `source.start()` déclenchés. */
function makeMockCtx(): { ctx: AudioContext; started: number[] } {
  const started: number[] = []
  const node = {
    type: '',
    frequency: { value: 0 },
    gain: { value: 0 },
    connect: (): void => {},
    disconnect: (): void => {},
    start: (): void => {},
    stop: (): void => {}
  }
  const ctx = {
    destination: {},
    createBuffer: (_ch: number, length: number): { getChannelData: () => Float32Array } => ({
      getChannelData: (): Float32Array => new Float32Array(length)
    }),
    createBufferSource: () => ({ ...node, buffer: null, start: (): void => { started.push(1) } }),
    createGain: () => ({ ...node }),
    createOscillator: () => ({ ...node }),
    createBiquadFilter: () => ({ ...node })
  }
  return { ctx: ctx as unknown as AudioContext, started }
}

describe('zzfx', () => {
  it('playZzfx synthétise et démarre une source pour des params valides', () => {
    const { ctx, started } = makeMockCtx()
    playZzfx(ctx, 0.8, [0.5, 0.05, 220, 0, 0.1, 0.2])
    expect(started.length).toBe(1)
  })

  it('playZzfx ne joue RIEN si masterVolume <= 0 (mute)', () => {
    const { ctx, started } = makeMockCtx()
    playZzfx(ctx, 0, [0.5, 0.05, 220, 0, 0.1, 0.2])
    expect(started.length).toBe(0)
  })

  it('playZzfx ne jette pas sur des params variés (shapes/noise/pitchJump)', () => {
    const { ctx } = makeMockCtx()
    expect(() => {
      playZzfx(ctx, 0.5, [0.4, 0.1, 440, 0.01, 0.05, 0.15, 2, 1, 0, 0, 200, 0.05, 0, 0.3])
      playZzfx(ctx, 0.5, [0.4, 0, 90, 0, 0, 0.2, 4, 1, 0, 0, 0, 0, 0, 1]) // bruit pur
      playZzfx(ctx, 0.5, [0.3]) // params minimaux (défauts)
    }).not.toThrow()
  })

  it('createWhirLoop : setVolume/stop sans erreur, stop idempotent', () => {
    const { ctx } = makeMockCtx()
    const loop = createWhirLoop(ctx)
    expect(() => {
      loop.setVolume(0.3)
      loop.setVolume(0)
      loop.stop()
      loop.stop() // idempotent
      loop.setVolume(0.5) // no-op après stop
    }).not.toThrow()
  })
})
