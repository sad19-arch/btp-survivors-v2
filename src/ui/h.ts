/**
 * Helper de composant minimal : construit des nœuds DOM par API (jamais
 * d'`innerHTML` interpolé → pas de surface XSS, conforme aux règles UI).
 */
export interface HProps {
  className?: string
  text?: string
  dataset?: Record<string, string>
  /** Attributs bruts (ex. `src`, `alt` pour une img). Valeurs contrôlées, pas de données utilisateur. */
  attrs?: Record<string, string>
  onClick?: (() => void) | undefined
}

type Child = Node | string

export function h(tag: string, props: HProps = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag)
  if (props.className !== undefined) {
    el.className = props.className
  }
  if (props.text !== undefined) {
    el.textContent = props.text
  }
  if (props.dataset !== undefined) {
    for (const [k, v] of Object.entries(props.dataset)) {
      el.dataset[k] = v
    }
  }
  if (props.attrs !== undefined) {
    for (const [k, v] of Object.entries(props.attrs)) {
      el.setAttribute(k, v)
    }
  }
  if (props.onClick !== undefined) {
    el.addEventListener('click', props.onClick)
  }
  for (const child of children) {
    el.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return el
}

/** Vide un élément de tous ses enfants. */
export function clear(el: HTMLElement): void {
  while (el.firstChild !== null) {
    el.removeChild(el.firstChild)
  }
}
