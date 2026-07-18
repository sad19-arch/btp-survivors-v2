import { describe, it, expect, beforeEach } from 'vitest'
import {
  IntroSequencer,
  scriptDurationMs,
  type CinemaStage,
  type IntroCommand,
} from '../../src/render/scenes/introSequencer'

// ---------------------------------------------------------------------------
// Façade fake — journal des appels
// ---------------------------------------------------------------------------

class FakeStage implements CinemaStage {
  readonly log: string[] = []
  actorCount = 0

  banner(text: string): void { this.log.push(`banner:${text}`) }
  voice(key: string): void { this.log.push(`voice:${key}`) }
  sfx(key: string): void { this.log.push(`sfx:${key}`) }
  flash(): void { this.log.push('flash') }
  shake(intensity: number): void { this.log.push(`shake:${intensity}`) }
  camCut(cx: number, cy: number, zoom: number): void { this.log.push(`cut:${cx},${cy},${zoom}`) }
  camZoomTo(cx: number, cy: number, zoom: number, ms: number, ease: string): void {
    this.log.push(`zoomTo:${cx},${cy},${zoom},${ms},${ease}`)
  }
  camPunchIn(cx: number, cy: number, zoom: number, ms: number): void {
    this.log.push(`punchIn:${cx},${cy},${zoom},${ms}`)
  }
  camWhipPan(cx: number, cy: number, ms: number): void {
    this.log.push(`whipPan:${cx},${cy},${ms}`)
  }
  camSlowmo(scale: number, ms: number): void { this.log.push(`slowmo:${scale},${ms}`) }
  actor(id: string, key: string, x: number, y: number, scale: number): void {
    this.log.push(`actor:${id},${key},${x},${y},${scale}`)
    this.actorCount++
  }
  preview(key: string, x: number, y: number, count: number): void {
    this.log.push(`preview:${key},${x},${y},${count}`)
    this.actorCount += count
  }
  play(id: string, anim: string): void { this.log.push(`play:${id},${anim}`) }
  move(id: string, x: number, y: number, ms: number): void {
    this.log.push(`move:${id},${x},${y},${ms}`)
  }
  clearAll(): void {
    this.log.push('clearAll')
    this.actorCount = 0
  }
}

// Script de base réutilisé dans plusieurs tests :
// cut@0, banner@200, flash@500
const BASE_SCRIPT: readonly IntroCommand[] = [
  { kind: 'cut', cx: 0, cy: 0, zoom: 1 },
  { kind: 'wait', ms: 200 },
  { kind: 'banner', text: 'X' },
  { kind: 'wait', ms: 300 },
  { kind: 'flash' },
]

// ---------------------------------------------------------------------------
// 1. Ordre & timing
// ---------------------------------------------------------------------------

describe('IntroSequencer — ordre & timing', () => {
  let fake: FakeStage
  let seq: IntroSequencer

  beforeEach(() => {
    fake = new FakeStage()
    seq = new IntroSequencer(fake)
    seq.load(BASE_SCRIPT)
  })

  it('update(0) déclenche uniquement cut', () => {
    seq.update(0)
    expect(fake.log).toContain('cut:0,0,1')
    expect(fake.log.some(e => e.startsWith('banner'))).toBe(false)
    expect(fake.log.some(e => e === 'flash')).toBe(false)
  })

  it('update(199) ne déclenche pas encore banner', () => {
    seq.update(0)
    seq.update(199)
    expect(fake.log.some(e => e.startsWith('banner'))).toBe(false)
  })

  it('update(200) déclenche banner', () => {
    seq.update(0)
    seq.update(200)
    expect(fake.log.some(e => e.startsWith('banner'))).toBe(true)
    expect(fake.log.some(e => e === 'flash')).toBe(false)
  })

  it('update(500) déclenche flash', () => {
    seq.update(0)
    seq.update(200)
    seq.update(500)
    expect(fake.log.some(e => e === 'flash')).toBe(true)
  })

  it('ordre final = [cut, banner, flash]', () => {
    seq.update(0)
    seq.update(200)
    seq.update(500)
    const relevant = fake.log.filter(e =>
      e.startsWith('cut') || e.startsWith('banner') || e === 'flash'
    )
    expect(relevant).toEqual(['cut:0,0,1', 'banner:X', 'flash'])
  })

  it('done === true après la dernière commande', () => {
    seq.update(500)
    expect(seq.done).toBe(true)
  })

  it('done === false avant la fin', () => {
    seq.update(0)
    expect(seq.done).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Déterminisme
// ---------------------------------------------------------------------------

describe('IntroSequencer — déterminisme', () => {
  it('deux séquenceurs, même script, mêmes updates → journaux identiques', () => {
    const fakeA = new FakeStage()
    const fakeB = new FakeStage()
    const seqA = new IntroSequencer(fakeA)
    const seqB = new IntroSequencer(fakeB)

    seqA.load(BASE_SCRIPT)
    seqB.load(BASE_SCRIPT)

    for (const t of [0, 200, 500]) {
      seqA.update(t)
      seqB.update(t)
    }

    expect(fakeA.log).toEqual(fakeB.log)
  })
})

// ---------------------------------------------------------------------------
// 3. skip
// ---------------------------------------------------------------------------

describe('IntroSequencer — skip', () => {
  it('skip() joue toutes les commandes dans l\'ordre + done === true', () => {
    const fake = new FakeStage()
    const seq = new IntroSequencer(fake)
    seq.load(BASE_SCRIPT)

    seq.skip()

    expect(seq.done).toBe(true)
    const relevant = fake.log.filter(e =>
      e.startsWith('cut') || e.startsWith('banner') || e === 'flash'
    )
    expect(relevant).toEqual(['cut:0,0,1', 'banner:X', 'flash'])
  })

  it('skip() après un update partiel joue uniquement les commandes restantes', () => {
    const fake = new FakeStage()
    const seq = new IntroSequencer(fake)
    seq.load(BASE_SCRIPT)

    seq.update(0)    // joue cut
    seq.skip()       // joue banner + flash

    expect(seq.done).toBe(true)
    // cut ne doit apparaître qu'une seule fois
    expect(fake.log.filter(e => e.startsWith('cut')).length).toBe(1)
    expect(fake.log.filter(e => e.startsWith('banner')).length).toBe(1)
    expect(fake.log.filter(e => e === 'flash').length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 4. cleanup (actor + preview + dispose)
// ---------------------------------------------------------------------------

describe('IntroSequencer — cleanup', () => {
  it('actor + preview comptabilisés ; dispose appelle clearAll', () => {
    const fake = new FakeStage()
    const seq = new IntroSequencer(fake)

    const script: readonly IntroCommand[] = [
      { kind: 'actor', id: 'w', key: 'k', x: 0, y: 0 },
      { kind: 'preview', key: 'm', x: 0, y: 0, count: 40 },
    ]

    seq.load(script)
    seq.update(0)

    // 1 actor + 40 preview = 41
    expect(fake.actorCount).toBe(41)

    seq.dispose()

    expect(fake.log).toContain('clearAll')
    // clearAll remet actorCount à 0 dans le fake
    expect(fake.actorCount).toBe(0)
  })

  it('load + update puis dispose ×2 → toujours propre', () => {
    const fake = new FakeStage()
    const seq = new IntroSequencer(fake)

    const script: readonly IntroCommand[] = [
      { kind: 'actor', id: 'w', key: 'k', x: 0, y: 0 },
      { kind: 'preview', key: 'm', x: 0, y: 0, count: 40 },
    ]

    // Premier cycle
    seq.load(script)
    seq.update(0)
    seq.dispose()
    expect(fake.actorCount).toBe(0)

    // Deuxième cycle
    seq.load(script)
    seq.update(0)
    seq.dispose()
    expect(fake.actorCount).toBe(0)

    // clearAll appelé 2 fois
    expect(fake.log.filter(e => e === 'clearAll').length).toBe(2)
  })

  it('scale par défaut = 1 quand non fourni dans actor', () => {
    const fake = new FakeStage()
    const seq = new IntroSequencer(fake)
    seq.load([{ kind: 'actor', id: 'x', key: 'k', x: 10, y: 20 }])
    seq.update(0)
    expect(fake.log).toContain('actor:x,k,10,20,1')
  })
})

// ---------------------------------------------------------------------------
// 5. scriptDurationMs
// ---------------------------------------------------------------------------

describe('scriptDurationMs', () => {
  it('somme les wait uniquement', () => {
    const script: readonly IntroCommand[] = [
      { kind: 'wait', ms: 200 },
      { kind: 'flash' },
      { kind: 'wait', ms: 300 },
    ]
    expect(scriptDurationMs(script)).toBe(500)
  })

  it('script sans wait = 0', () => {
    expect(scriptDurationMs([{ kind: 'flash' }])).toBe(0)
  })

  it('script vide = 0', () => {
    expect(scriptDurationMs([])).toBe(0)
  })
})
