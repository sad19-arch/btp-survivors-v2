/**
 * EditorPalette — panneau gauche VISUEL du Stage Composer Editor.
 * Cartes à miniatures, catégories repliables, recherche, sélection claire.
 * DOM natif (pas de framework). Les scènes complètes AVANT les objets isolés.
 */

import { CATEGORIES, activeEntries, kindLabel, type PaletteEntry } from './PrefabCatalog'
import { thumbnailFor } from './PrefabThumbnail'
import type { EditorScene } from './EditorScene'

export class EditorPalette {
  private search = ''
  private collapsed = new Set<string>()
  private readonly listRoot: HTMLElement

  constructor(private readonly root: HTMLElement, private readonly scene: EditorScene) {
    this.root.innerHTML = ''
    const title = document.createElement('div')
    title.className = 'sce-pal-title'
    title.textContent = 'Palette — Scènes & objets'
    this.root.appendChild(title)

    const searchBox = document.createElement('input')
    searchBox.type = 'text'
    searchBox.placeholder = 'Rechercher…'
    searchBox.className = 'sce-search'
    searchBox.addEventListener('input', () => {
      this.search = searchBox.value.trim().toLowerCase()
      this.renderList()
    })
    this.root.appendChild(searchBox)

    this.listRoot = document.createElement('div')
    this.listRoot.className = 'sce-pal-list'
    this.root.appendChild(this.listRoot)

    this.renderList()
  }

  private match(e: PaletteEntry): boolean {
    if (this.search === '') {return true}
    return e.label.toLowerCase().includes(this.search) || e.id.toLowerCase().includes(this.search)
  }

  private renderList(): void {
    this.listRoot.innerHTML = ''
    const activeId = this.scene.active.prefab ?? this.scene.active.marker
    const all = activeEntries()
    for (const cat of CATEGORIES) {
      const entries = all.filter((e) => e.category === cat.id && this.match(e))
      if (entries.length === 0) {continue}

      const section = document.createElement('div')
      section.className = 'sce-cat'

      const header = document.createElement('div')
      header.className = 'sce-cat-head'
      const isCollapsed = this.collapsed.has(cat.id)
      header.textContent = `${isCollapsed ? '▶' : '▼'} ${cat.label} (${entries.length})`
      header.addEventListener('click', () => {
        if (this.collapsed.has(cat.id)) {this.collapsed.delete(cat.id)}
        else {this.collapsed.add(cat.id)}
        this.renderList()
      })
      section.appendChild(header)

      if (!isCollapsed) {
        const grid = document.createElement('div')
        grid.className = 'sce-grid'
        for (const e of entries) {grid.appendChild(this.card(e, activeId))}
        section.appendChild(grid)
      }
      this.listRoot.appendChild(section)
    }
  }

  private card(e: PaletteEntry, activeId: string | null): HTMLElement {
    const card = document.createElement('div')
    card.className = 'sce-card' + (e.id === activeId ? ' sce-card-active' : '')
    card.draggable = true
    card.title = e.id

    const img = document.createElement('img')
    img.className = 'sce-thumb'
    img.width = 96
    img.height = 96
    img.src = thumbnailFor(this.scene, e)
    card.appendChild(img)

    const name = document.createElement('div')
    name.className = 'sce-card-name'
    name.textContent = e.label
    card.appendChild(name)

    const badges = document.createElement('div')
    badges.className = 'sce-card-badges'
    const kind = document.createElement('span')
    kind.className = 'sce-badge sce-badge-kind'
    kind.textContent = kindLabel(e.kind)
    const size = document.createElement('span')
    size.className = 'sce-badge sce-badge-size'
    size.textContent = e.size
    badges.appendChild(kind)
    badges.appendChild(size)
    card.appendChild(badges)

    card.addEventListener('click', () => {
      this.scene.selectPaletteEntry(e)
    })
    card.addEventListener('dblclick', () => {
      this.scene.selectPaletteEntry(e)
      this.scene.placeActiveAtCenter()
    })
    card.addEventListener('dragstart', (ev) => {
      ev.dataTransfer?.setData('text/plain', e.id)
      this.scene.selectPaletteEntry(e)
    })
    return card
  }

  /** Rafraîchit le surlignage de la carte active. */
  refresh(): void {
    this.renderList()
  }
}
