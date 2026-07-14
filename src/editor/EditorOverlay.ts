/**
 * EditorOverlay — barre d'outils + inspecteur + warnings + import/export du
 * Stage Composer Editor. DOM natif. Le canvas Phaser reste cliquable : seuls
 * les panneaux capturent la souris (pointer-events auto sur .sce-panel).
 */

import { paletteEntry, STAGE_LIST } from './PrefabCatalog'
import type { EditorScene } from './EditorScene'
import { saveUserLayout } from '@ui/userLayouts'

function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'sce-btn ' + cls
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

/** Groupe étiqueté de la barre d'outils (Fichier / Vue / Édition / Avancé). */
function group(label: string): HTMLElement {
  const g = document.createElement('div')
  g.className = 'sce-group'
  const lab = document.createElement('span')
  lab.className = 'sce-group-label'
  lab.textContent = label
  g.appendChild(lab)
  return g
}

/** Télécharge une chaîne comme fichier (Blob + <a download>). */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Ouvre un sélecteur de fichier .json et renvoie son texte. */
function pickFile(onText: (text: string) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file === undefined) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result
      onText(typeof res === 'string' ? res : '')
    }
    reader.readAsText(file)
  })
  input.click()
}

export class EditorOverlay {
  private readonly toolbar: HTMLElement
  private readonly inspector: HTMLElement
  private readonly warns: HTMLElement
  private readonly modal: HTMLElement
  private readonly modalText: HTMLTextAreaElement
  private readonly gridBtn: HTMLButtonElement
  private readonly snapBtn: HTMLButtonElement

  constructor(
    private readonly root: HTMLElement,
    private readonly scene: EditorScene,
    private readonly switchStage: (stageId: string) => void
  ) {
    const state = scene.state

    // ── Barre d'outils (haut), groupée : Fichier · Vue · Édition · Avancé ──
    this.toolbar = document.createElement('div')
    this.toolbar.className = 'sce-panel sce-toolbar'
    const title = document.createElement('span')
    title.className = 'sce-title'
    title.textContent = 'Stage Composer'
    this.toolbar.appendChild(title)

    // Sélecteur de stage.
    const sel = document.createElement('select')
    sel.className = 'sce-select'
    for (const s of STAGE_LIST) {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = s.label
      if (s.id === scene.stage) { opt.selected = true }
      sel.appendChild(opt)
    }
    sel.addEventListener('change', () => this.switchStage(sel.value))
    this.toolbar.appendChild(sel)

    // Groupe FICHIER : base vierge/existante, sauver (jouable), télécharger, charger.
    const gFile = group('Fichier')
    gFile.appendChild(btn('🗋 Nouveau (vierge)', () => {
      if (window.confirm('Repartir d\'un stage VIERGE ? (efface la compo courante de ce niveau)')) { state.reset() }
    }))
    gFile.appendChild(btn('🏗 Partir du niveau existant', () => {
      if (window.confirm('Charger le niveau EXISTANT comme base éditable ? (remplace la compo courante ; les engins deviennent bloquants)')) { state.importGenerated() }
    }))
    gFile.appendChild(btn('💾 Sauver (jouable)', () => {
      saveUserLayout(scene.stage, state.exportGameJson())
      window.alert('Sauvé ✓ — jouable depuis le menu titre (niveau : ' + scene.stage + ').')
    }, 'sce-btn-primary'))
    gFile.appendChild(btn('⬇ Télécharger', () => downloadText('stage_' + scene.stage + '.json', state.exportGameJson())))
    gFile.appendChild(btn('⬆ Charger un fichier', () => pickFile((text) => {
      const res = state.importJson(text)
      if (!res.ok) { window.alert('Fichier invalide : ' + (res.error ?? 'JSON')) }
    })))
    this.toolbar.appendChild(gFile)

    // Groupe VUE.
    const gView = group('Vue')
    gView.appendChild(btn('Vue jeu (1.2×)', () => scene.fitGameZoom()))
    gView.appendChild(btn('Vue d\'ensemble', () => scene.fitOverview()))
    gView.appendChild(btn('Parcourir (P)', () => scene.toggleWalk()))
    this.toolbar.appendChild(gView)

    // Groupe ÉDITION.
    const gEdit = group('Édition')
    gEdit.appendChild(btn('↶ Annuler', () => state.undo()))
    gEdit.appendChild(btn('↷ Rétablir', () => state.redo()))
    this.gridBtn = btn('Grille', () => state.toggleGrid())
    this.snapBtn = btn('Snap', () => state.toggleSnap())
    gEdit.appendChild(this.gridBtn)
    gEdit.appendChild(this.snapBtn)
    gEdit.appendChild(btn('⧉ Copier', () => state.copySelection()))
    gEdit.appendChild(btn('⧈ Coller', () => state.paste()))
    gEdit.appendChild(btn('Effacer sélection', () => { state.clearSelection(); scene.clearActive() }))
    this.toolbar.appendChild(gEdit)

    // Groupe AVANCÉ : baker au repo (dev), export/import texte.
    const gAdv = group('Avancé')
    gAdv.appendChild(btn('Sauver au repo (dev)', () => {
      void fetch('/__save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: scene.stage, json: state.exportGameJson() })
      })
        .then(async (r) => {
          const t = await r.text()
          window.alert(r.ok ? `Sauvé au repo ✓ (${t})` : `Échec : ${t}`)
        })
        .catch(() => window.alert('Endpoint indisponible : « Sauver au repo » ne marche qu\'en dev (npm run dev).'))
    }))
    gAdv.appendChild(btn('Export JSON', () => this.openModal(state.exportJson(), 'export')))
    gAdv.appendChild(btn('Export code', () => this.openModal(state.exportCode(), 'export')))
    gAdv.appendChild(btn('Import JSON', () => this.openModal('', 'import')))
    this.toolbar.appendChild(gAdv)
    this.root.appendChild(this.toolbar)

    // ── Inspecteur + warnings (droite) ──
    const side = document.createElement('div')
    side.className = 'sce-panel sce-side'
    this.inspector = document.createElement('div')
    this.inspector.className = 'sce-inspector'
    this.warns = document.createElement('div')
    this.warns.className = 'sce-warns'
    side.appendChild(this.inspector)
    side.appendChild(this.warns)
    this.root.appendChild(side)

    // ── Modal import/export ──
    this.modal = document.createElement('div')
    this.modal.className = 'sce-modal sce-hidden'
    const box = document.createElement('div')
    box.className = 'sce-modal-box'
    this.modalText = document.createElement('textarea')
    this.modalText.className = 'sce-modal-text'
    this.modalText.spellcheck = false
    box.appendChild(this.modalText)
    const modalBtns = document.createElement('div')
    modalBtns.className = 'sce-modal-btns'
    box.appendChild(modalBtns)
    this.modal.appendChild(box)
    this.root.appendChild(this.modal)
    this.modalBtns = modalBtns

    this.refresh()
  }

  private modalBtns: HTMLElement

  private openModal(content: string, mode: 'export' | 'import'): void {
    this.modalText.value = content
    this.modalText.readOnly = mode === 'export'
    this.modalBtns.innerHTML = ''
    if (mode === 'export') {
      this.modalBtns.appendChild(btn('Copier', () => {
        this.modalText.select()
        void navigator.clipboard?.writeText(this.modalText.value).catch(() => document.execCommand('copy'))
      }))
    } else {
      this.modalBtns.appendChild(btn('Importer', () => {
        const res = this.scene.state.importJson(this.modalText.value)
        if (res.ok) {this.closeModal()}
        else {window.alert('Import échoué : ' + (res.error ?? 'JSON invalide'))}
      }, 'sce-btn-primary'))
    }
    this.modalBtns.appendChild(btn('Fermer', () => this.closeModal()))
    this.modal.classList.remove('sce-hidden')
  }
  private closeModal(): void {
    this.modal.classList.add('sce-hidden')
  }

  refresh(): void {
    const state = this.scene.state
    this.gridBtn.classList.toggle('sce-btn-on', state.grid)
    this.snapBtn.classList.toggle('sce-btn-on', state.snap)

    // Inspecteur.
    const active = this.scene.active
    const selCount = state.selectionCount
    // Détails mono uniquement quand un seul objet est sélectionné.
    const inst = selCount <= 1 ? state.selectedInstance() : null
    const parts: string[] = []
    if (active.prefab !== null) {parts.push(`<div class="sce-tool">Outil : <b>${paletteEntry(active.prefab)?.label ?? active.prefab}</b> — clique pour poser (Échap pour annuler)</div>`)}
    if (active.marker !== null) {parts.push(`<div class="sce-tool">Marqueur : <b>${active.marker}</b> — clique sur la map (Échap pour annuler)</div>`)}
    if (selCount > 1) {
      parts.push(
        `<div class="sce-insp-title">${selCount} objets sélectionnés</div>` +
        '<div class="sce-insp-row">Glisser = déplacer le groupe · Ctrl+C copier · Ctrl+V coller · Suppr</div>'
      )
    } else if (inst !== null) {
      const label = paletteEntry(inst.prefab)?.label ?? inst.prefab
      parts.push(
        `<div class="sce-insp-title">${label}${inst.locked ? ' 🔒' : ''}</div>` +
        `<div class="sce-insp-row">x: ${Math.round(inst.x)} · y: ${Math.round(inst.y)} · flip: ${inst.flipX ? 'oui' : 'non'} · rot: ${inst.rotation}° · taille: ${Math.round((inst.scale ?? 1) * 100)}% · var: ${inst.variant}</div>`
      )
    } else if (active.prefab === null && active.marker === null) {
      parts.push('<div class="sce-insp-hint">Clique une carte de la palette, puis clique la map pour poser. Clique/lasso pour sélectionner (Maj = ajouter).</div>')
    }
    this.inspector.innerHTML = parts.join('')

    if (selCount > 1) {
      const row = document.createElement('div')
      row.className = 'sce-insp-actions'
      row.appendChild(btn('Copier (Ctrl+C)', () => state.copySelection()))
      row.appendChild(btn('Dupliquer (Ctrl+D)', () => state.duplicateSelected()))
      row.appendChild(btn('Supprimer (Suppr)', () => state.deleteSelected(), 'sce-btn-danger'))
      this.inspector.appendChild(row)
    } else if (inst !== null) {
      const row = document.createElement('div')
      row.className = 'sce-insp-actions'
      row.appendChild(btn('Flip (F)', () => state.flipSelected()))
      row.appendChild(btn('Pivoter (R)', () => state.rotateSelected(15)))
      row.appendChild(btn('Réduire (−)', () => state.nudgeSelectedScale(-0.1)))
      row.appendChild(btn('Agrandir (+)', () => state.nudgeSelectedScale(0.1)))
      row.appendChild(btn('Taille 100%', () => state.setSelectedScale(1)))
      row.appendChild(btn(inst.locked ? 'Déverrouiller (L)' : 'Verrouiller (L)', () => state.toggleLockSelected(), inst.locked ? 'sce-btn-on' : ''))
      row.appendChild(btn('Devant (])', () => state.bringSelectedToFront()))
      row.appendChild(btn('Derrière ([)', () => state.sendSelectedToBack()))
      row.appendChild(btn('Dupliquer (Ctrl+D)', () => state.duplicateSelected()))
      row.appendChild(btn('Supprimer (Suppr)', () => state.deleteSelected(), 'sce-btn-danger'))
      this.inspector.appendChild(row)
    }

    // Warnings.
    const ws = state.warnings()
    this.warns.innerHTML = '<div class="sce-warns-title">Validation (' + ws.length + ')</div>'
    if (ws.length === 0) {
      const ok = document.createElement('div')
      ok.className = 'sce-warn sce-warn-ok'
      ok.textContent = '✓ Aucun problème.'
      this.warns.appendChild(ok)
    }
    for (const w of ws) {
      const el = document.createElement('div')
      el.className = 'sce-warn ' + (w.level === 'error' ? 'sce-warn-err' : 'sce-warn-warn')
      el.textContent = (w.level === 'error' ? '✕ ' : '⚠ ') + w.message
      this.warns.appendChild(el)
    }
  }
}
