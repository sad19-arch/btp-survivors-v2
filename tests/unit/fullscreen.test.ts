import { describe, expect, it, vi } from 'vitest'
import {
  FullscreenController,
  FULLSCREEN_SETTINGS_KEY,
  loadFullscreenPreference,
  saveFullscreenPreference,
  FullscreenGestureBridge,
  type FullscreenDom
} from '@/platform/fullscreen'

function fakeDom(supported = true): FullscreenDom & {
  request: ReturnType<typeof vi.fn>
  exit: ReturnType<typeof vi.fn>
  fullscreenElement: HTMLElement | null
} {
  const root = document.createElement('div')
  root.id = 'game-root'
  document.body.append(root)
  const dom = {
    document,
    root,
    screen: {},
    requests: 0,
    exits: 0,
    fullscreenElement: null as HTMLElement | null,
    isStandalone: false,
    request: vi.fn(() => {
      dom.requests++
      dom.fullscreenElement = root
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    }),
    exit: vi.fn(() => {
      dom.exits++
      dom.fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    })
  }
  return {
    ...dom,
    requestFullscreen: supported ? dom.request : undefined,
    exitFullscreen: supported ? dom.exit : undefined,
    getFullscreenElement: () => dom.fullscreenElement
  }
}

describe('fullscreen platform', () => {
  it('lit unset pour une préférence absente ou corrompue', () => {
    const storage = new Map<string, string>()
    const get = (key: string): string | null => storage.get(key) ?? null
    expect(loadFullscreenPreference({ get })).toBe('unset')
    storage.set(FULLSCREEN_SETTINGS_KEY, '{oops')
    expect(loadFullscreenPreference({ get })).toBe('unset')
    storage.set(FULLSCREEN_SETTINGS_KEY, JSON.stringify({ preference: 'other' }))
    expect(loadFullscreenPreference({ get })).toBe('unset')
  })

  it('persiste seulement fullscreen ou windowed dans la clé versionnée', () => {
    const storage = new Map<string, string>()
    const set = (key: string, value: string): void => { storage.set(key, value) }
    saveFullscreenPreference('fullscreen', { set })
    expect(storage.get(FULLSCREEN_SETTINGS_KEY)).toBe('{"preference":"fullscreen"}')
    expect(loadFullscreenPreference({ get: (key) => storage.get(key) ?? null })).toBe('fullscreen')
    saveFullscreenPreference('windowed', { set })
    expect(loadFullscreenPreference({ get: (key) => storage.get(key) ?? null })).toBe('windowed')
  })

  it('peut mémoriser le démarrage fullscreen sans armer une demande dans la session courante', () => {
    const dom = fakeDom()
    const controller = new FullscreenController(dom)
    controller.selectPreference('fullscreen', false)
    expect(controller.state()).toMatchObject({ preference: 'fullscreen', authorizationRequired: false })
    expect(dom.request).not.toHaveBeenCalled()
  })

  it('ne demande jamais le plein écran avant un geste de confiance', async () => {
    const dom = fakeDom()
    const controller = new FullscreenController(dom)
    controller.selectPreference('fullscreen')
    expect(dom.request).not.toHaveBeenCalled()
    expect(controller.state().authorizationRequired).toBe(true)
    await controller.requestFromTrustedGesture()
    expect(dom.request).toHaveBeenCalledTimes(1)
    expect(dom.getFullscreenElement()).toBe(dom.root)
  })

  it('demande une seule fois #game-root, synchronise fullscreenchange et peut quitter', async () => {
    const dom = fakeDom()
    const controller = new FullscreenController(dom)
    controller.selectPreference('fullscreen')
    await controller.requestFromTrustedGesture()
    await controller.requestFromTrustedGesture()
    expect(dom.request).toHaveBeenCalledTimes(1)
    expect(controller.state().active).toBe(true)
    await controller.exit()
    expect(dom.exit).toHaveBeenCalledTimes(1)
    expect(controller.state().active).toBe(false)
  })

  it('publie un changement fullscreen natif, y compris une sortie par Échap', async () => {
    const dom = fakeDom()
    const controller = new FullscreenController(dom)
    const states: boolean[] = []
    controller.subscribe((state) => { states.push(state.active) })
    controller.selectPreference('fullscreen')
    await controller.requestFromTrustedGesture()
    await dom.exit()
    expect(states.at(-1)).toBe(false)
  })

  it('reste jouable et conserve la préférence après un refus ou une API indisponible', async () => {
    const rejected = fakeDom()
    rejected.request.mockRejectedValueOnce(new Error('denied'))
    const controller = new FullscreenController(rejected)
    controller.selectPreference('fullscreen')
    await expect(controller.requestFromTrustedGesture()).resolves.toBe(false)
    expect(controller.state()).toMatchObject({ preference: 'fullscreen', feedback: 'REFUSÉ' })

    const unsupported = new FullscreenController(fakeDom(false))
    expect(unsupported.state()).toMatchObject({ supported: false, feedback: 'INDISPONIBLE' })
    await expect(unsupported.requestFromTrustedGesture()).resolves.toBe(false)
  })

  it('arme la demande après un choix manette puis l’exécute au geste tactile ou clavier', async () => {
    const dom = fakeDom()
    const controller = new FullscreenController(dom)
    controller.selectPreference('fullscreen')
    expect(controller.state()).toMatchObject({ authorizationRequired: true, active: false })
    await controller.requestFromTrustedGesture()
    expect(dom.request).toHaveBeenCalledTimes(1)
    expect(controller.state().authorizationRequired).toBe(false)
  })

  it('resetPreference remet le choix à unset, le persiste et désarme la demande', () => {
    const dom = fakeDom()
    const store = new Map<string, string>()
    const storage = {
      get: (key: string): string | null => store.get(key) ?? null,
      set: (key: string, value: string): void => { store.set(key, value) }
    }
    const controller = new FullscreenController(dom, storage)
    controller.selectPreference('fullscreen') // choix persisté + demande armée
    expect(controller.state()).toMatchObject({ preference: 'fullscreen', authorizationRequired: true })

    controller.resetPreference()
    expect(controller.state()).toMatchObject({ preference: 'unset', authorizationRequired: false })
    expect(store.get(FULLSCREEN_SETTINGS_KEY)).toBe('{"preference":"unset"}')
    // Relu au prochain boot → unset → l'invite se reproposera.
    expect(loadFullscreenPreference({ get: storage.get })).toBe('unset')
  })

  it('le pont clavier consomme Entrée une fois sans doubler le confirm Phaser', () => {
    const keyboard = new EventTarget()
    const calls: string[] = []
    const bridge = new FullscreenGestureBridge(keyboard, {
      onKeyboard: () => { calls.push('keyboard'); return true },
      onPointer: () => { calls.push('pointer'); return false }
    })
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    keyboard.dispatchEvent(event)
    expect(calls).toEqual(['keyboard'])
    expect(event.defaultPrevented).toBe(true)
    bridge.dispose()
  })
})
