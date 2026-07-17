import { describe, it, expect } from 'vitest'
import { applyEase, lerpCam, type CamPose, type Ease } from '@render/cameraTrajectory'

const EASES: Ease[] = ['linear', 'easeOut', 'snap']

describe('applyEase', () => {
  it('retourne 0 pour t=0 pour tous les eases (sauf snap qui est 0 exact)', () => {
    for (const ease of EASES) {
      expect(applyEase(0, ease)).toBe(0)
    }
  })

  it('retourne 1 pour t=1 pour tous les eases', () => {
    for (const ease of EASES) {
      expect(applyEase(1, ease)).toBe(1)
    }
  })

  it('easeOut à t=0.5 donne > 0.5 (démarre vite, freine après)', () => {
    expect(applyEase(0.5, 'easeOut')).toBeGreaterThan(0.5)
  })

  it('snap: t=0.01 → 1, t=0 → 0', () => {
    expect(applyEase(0.01, 'snap')).toBe(1)
    expect(applyEase(0, 'snap')).toBe(0)
  })

  it('linear: retourne t exactement', () => {
    expect(applyEase(0.3, 'linear')).toBeCloseTo(0.3)
    expect(applyEase(0.7, 'linear')).toBeCloseTo(0.7)
  })

  it('clamp : t hors [0,1] reste dans [0,1]', () => {
    for (const ease of EASES) {
      const lo = applyEase(-5, ease)
      const hi = applyEase(99, ease)
      expect(lo).toBeGreaterThanOrEqual(0)
      expect(lo).toBeLessThanOrEqual(1)
      expect(hi).toBeGreaterThanOrEqual(0)
      expect(hi).toBeLessThanOrEqual(1)
    }
  })
})

describe('lerpCam', () => {
  const from: CamPose = { cx: 0, cy: 0, zoom: 1 }
  const to: CamPose = { cx: 400, cy: 300, zoom: 2 }

  it('à t=0 retourne from (pour tous les eases)', () => {
    for (const ease of EASES) {
      const result = lerpCam(from, to, 0, ease)
      expect(result.cx).toBeCloseTo(from.cx)
      expect(result.cy).toBeCloseTo(from.cy)
      expect(result.zoom).toBeCloseTo(from.zoom)
    }
  })

  it('à t=1 retourne to (pour tous les eases)', () => {
    for (const ease of EASES) {
      const result = lerpCam(from, to, 1, ease)
      expect(result.cx).toBeCloseTo(to.cx)
      expect(result.cy).toBeCloseTo(to.cy)
      expect(result.zoom).toBeCloseTo(to.zoom)
    }
  })

  it('à t=0.5, easeOut donne un zoom plus proche de to.zoom que linear', () => {
    const easeOutResult = lerpCam(from, to, 0.5, 'easeOut')
    const linearResult = lerpCam(from, to, 0.5, 'linear')
    // easeOut démarre vite → à t=0.5 on est plus avancé qu'en linear
    expect(easeOutResult.zoom).toBeGreaterThan(linearResult.zoom)
  })

  it('déterministe : mêmes entrées → même sortie', () => {
    const r1 = lerpCam(from, to, 0.42, 'easeOut')
    const r2 = lerpCam(from, to, 0.42, 'easeOut')
    expect(r1.cx).toBe(r2.cx)
    expect(r1.cy).toBe(r2.cy)
    expect(r1.zoom).toBe(r2.zoom)
  })

  it('ne modifie pas les objets from/to passés', () => {
    const origFrom = { ...from }
    const origTo = { ...to }
    lerpCam(from, to, 0.5, 'easeOut')
    expect(from).toEqual(origFrom)
    expect(to).toEqual(origTo)
  })
})
