export const FULLSCREEN_SETTINGS_KEY = 'btp:fullscreen_settings_v1'

export type FullscreenPreference = 'unset' | 'fullscreen' | 'windowed'
export type FullscreenFeedback = 'REFUSÉ' | 'INDISPONIBLE' | null

export interface FullscreenState {
  supported: boolean
  active: boolean
  preference: FullscreenPreference
  feedback: FullscreenFeedback
  authorizationRequired: boolean
}

export interface FullscreenStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export interface FullscreenDom {
  document: Pick<Document, 'addEventListener' | 'removeEventListener'>
  root: HTMLElement
  screen: { orientation?: { lock?: (orientation: string) => Promise<void> } }
  requestFullscreen?: (() => Promise<void>) | undefined
  exitFullscreen?: (() => Promise<void>) | undefined
  getFullscreenElement(): Element | null
  isStandalone: boolean
}

export function loadFullscreenPreference(storage: Pick<FullscreenStorage, 'get'>): FullscreenPreference {
  const raw = storage.get(FULLSCREEN_SETTINGS_KEY)
  if (raw === null) {
    return 'unset'
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return 'unset'
    }
    const preference = (parsed as { preference?: unknown }).preference
    return preference === 'fullscreen' || preference === 'windowed' ? preference : 'unset'
  } catch {
    return 'unset'
  }
}

export function saveFullscreenPreference(
  preference: Exclude<FullscreenPreference, 'unset'>,
  storage: Pick<FullscreenStorage, 'set'>
): void {
  storage.set(FULLSCREEN_SETTINGS_KEY, JSON.stringify({ preference }))
}

/**
 * Isolated owner of the browser Fullscreen API. App/core only consume snapshots
 * and emit intents; this controller is invoked exclusively from trusted DOM events.
 */
export class FullscreenController {
  private preference: FullscreenPreference
  private active: boolean
  private feedback: FullscreenFeedback
  private authorizationRequired = false
  private rejectedThisSession = false
  private requestInFlight: Promise<boolean> | null = null
  private readonly subscribers = new Set<(state: FullscreenState) => void>()
  private readonly onChange = (): void => { this.syncActive() }

  constructor(
    private readonly dom: FullscreenDom,
    private readonly storage?: FullscreenStorage
  ) {
    this.preference = storage === undefined ? 'unset' : loadFullscreenPreference(storage)
    this.active = this.isActive()
    this.feedback = this.supported ? null : 'INDISPONIBLE'
    this.dom.document.addEventListener('fullscreenchange', this.onChange)
  }

  get supported(): boolean {
    return this.dom.requestFullscreen !== undefined && this.dom.exitFullscreen !== undefined
  }

  state(): FullscreenState {
    return {
      supported: this.supported,
      active: this.active,
      preference: this.preference,
      feedback: this.feedback,
      authorizationRequired: this.authorizationRequired
    }
  }

  /** Observe native fullscreen changes, including the browser's Escape shortcut. */
  subscribe(listener: (state: FullscreenState) => void): () => void {
    this.subscribers.add(listener)
    return () => { this.subscribers.delete(listener) }
  }

  selectPreference(preference: Exclude<FullscreenPreference, 'unset'>, armCurrentRequest = true): void {
    this.preference = preference
    this.storage?.set(FULLSCREEN_SETTINGS_KEY, JSON.stringify({ preference }))
    this.feedback = this.supported ? null : 'INDISPONIBLE'
    this.authorizationRequired = armCurrentRequest && preference === 'fullscreen' && !this.active && this.supported
  }

  /** Arms a saved startup preference; calling this method never invokes the API. */
  armStartupRequest(): boolean {
    if (this.preference !== 'fullscreen' || !this.supported || this.active || this.rejectedThisSession) {
      return false
    }
    this.authorizationRequired = true
    return true
  }

  /** Arms an in-session request without changing the startup preference. */
  armRequest(): boolean {
    if (!this.supported || this.active || this.rejectedThisSession) {
      return false
    }
    this.authorizationRequired = true
    return true
  }

  /** Must be called synchronously inside a click/touch/keydown trusted event. */
  requestFromTrustedGesture(): Promise<boolean> {
    if (!this.supported) {
      this.feedback = 'INDISPONIBLE'
      return Promise.resolve(false)
    }
    if (this.active) {
      this.authorizationRequired = false
      return Promise.resolve(true)
    }
    if (this.rejectedThisSession) {
      return Promise.resolve(false)
    }
    if (this.requestInFlight !== null) {
      return this.requestInFlight
    }
    this.authorizationRequired = false
    const request = this.dom.requestFullscreen
    if (request === undefined) {
      this.feedback = 'INDISPONIBLE'
      return Promise.resolve(false)
    }
    this.requestInFlight = request()
      .then(async () => {
        this.syncActive()
        this.feedback = null
        if (this.active) {
          await this.lockLandscapeBestEffort()
        }
        return this.active
      })
      .catch(() => {
        this.rejectedThisSession = true
        this.feedback = 'REFUSÉ'
        return false
      })
      .finally(() => { this.requestInFlight = null })
    return this.requestInFlight
  }

  async exit(): Promise<boolean> {
    if (!this.supported || !this.active) {
      return false
    }
    const exit = this.dom.exitFullscreen
    if (exit === undefined) {
      this.feedback = 'INDISPONIBLE'
      return false
    }
    try {
      await exit()
      this.syncActive()
      return !this.active
    } catch {
      this.feedback = 'REFUSÉ'
      return false
    }
  }

  dispose(): void {
    this.dom.document.removeEventListener('fullscreenchange', this.onChange)
  }

  private isActive(): boolean {
    return this.dom.isStandalone || this.dom.getFullscreenElement() === this.dom.root
  }

  private syncActive(): void {
    this.active = this.isActive()
    if (this.active) {
      this.authorizationRequired = false
    }
    const state = this.state()
    for (const subscriber of this.subscribers) {
      subscriber(state)
    }
  }

  private async lockLandscapeBestEffort(): Promise<void> {
    try {
      await this.dom.screen.orientation?.lock?.('landscape')
    } catch {
      // Orientation locking is optional and unsupported on several browsers.
    }
  }
}

export function browserFullscreenDom(root: HTMLElement): FullscreenDom {
  const doc = document
  return {
    document: doc,
    root,
    screen: window.screen as unknown as { orientation?: { lock?: (orientation: string) => Promise<void> } },
    requestFullscreen: root.requestFullscreen === undefined ? undefined : () => root.requestFullscreen(),
    exitFullscreen: doc.exitFullscreen === undefined ? undefined : () => doc.exitFullscreen(),
    getFullscreenElement: () => doc.fullscreenElement,
    isStandalone: window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true
  }
}

export function browserFullscreenStorage(): FullscreenStorage {
  return {
    get: (key) => {
      try { return window.localStorage.getItem(key) } catch { return null }
    },
    set: (key, value) => {
      try { window.localStorage.setItem(key, value) } catch { /* persistence is best-effort */ }
    }
  }
}

export interface FullscreenGestureConsumer {
  onKeyboard(): boolean
  onPointer(): boolean
}

type GestureTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

/**
 * Captures only privileged Enter/Space and pointer gestures before Phaser can
 * turn them into a deferred frame input. Consumed events stop there, preventing
 * the same key from confirming twice in `routeInput`.
 */
export class FullscreenGestureBridge {
  private readonly keydown = (event: KeyboardEvent): void => {
    if ((event.key !== 'Enter' && event.key !== ' ') || !this.consumer.onKeyboard()) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  private readonly pointerdown = (event: PointerEvent): void => {
    if (!this.consumer.onPointer()) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  constructor(private readonly target: GestureTarget, private readonly consumer: FullscreenGestureConsumer) {
    target.addEventListener('keydown', this.keydown, true)
    target.addEventListener('pointerdown', this.pointerdown, true)
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.keydown, true)
    this.target.removeEventListener('pointerdown', this.pointerdown, true)
  }
}

/** Returns null only when the host page does not expose the required game root. */
export function createBrowserFullscreenController(): FullscreenController | null {
  const root = document.getElementById('game-root')
  return root instanceof HTMLElement
    ? new FullscreenController(browserFullscreenDom(root), browserFullscreenStorage())
    : null
}
