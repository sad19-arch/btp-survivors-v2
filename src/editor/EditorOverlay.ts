/**
 * EditorOverlay — barre d'outils + inspecteur + warnings + import/export du
 * Stage Composer Editor. DOM natif. Le canvas Phaser reste cliquable : seuls
 * les panneaux capturent la souris (pointer-events auto sur .sce-panel).
 */

import { paletteEntry, STAGE_LIST, walkerSkinsFor } from './PrefabCatalog'
import type { EditorScene } from './EditorScene'
import { saveUserLayout, deleteUserLayout } from '@ui/userLayouts'
import { SITE_PROGRAMS } from '@content/sitePrograms'
import { ZONE_BY_TYPE } from './zones'
import { PATH_DEFAULT_SPEED, PATH_LIMITS, type LayoutPath } from '@content/stageLayout'

/**
 * Un stage n'a un plan de chantier PROCÉDURAL que s'il a un `SiteProgram`
 * (aujourd'hui : terrassement + fondations). Ailleurs, la case « Garder le plan
 * de chantier de base » ne piloterait rien : on ne l'affiche pas plutôt que de
 * proposer un interrupteur mort. Dérivé du registre — pas d'une liste recopiée —
 * pour qu'un 3ᵉ programme apparaisse tout seul.
 */
export function stageHasSitePlan(stage: string): boolean {
  return SITE_PROGRAMS[stage] !== undefined
}

/**
 * Case à cocher étiquetée de la barre d'outils (l'éditeur est souris-OK).
 * Renvoie AUSSI l'`input` : l'appelant doit pouvoir resynchroniser `checked`
 * quand l'état bouge sans passer par la case (annuler/rétablir, import JSON).
 */
function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): { el: HTMLLabelElement; input: HTMLInputElement } {
  const el = document.createElement('label')
  el.className = 'sce-check'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = checked
  input.addEventListener('change', () => onChange(input.checked))
  el.appendChild(input)
  const span = document.createElement('span')
  span.textContent = label
  el.appendChild(span)
  return { el, input }
}

/**
 * Ligne « étiquette + champ » de l'inspecteur, en NŒUDS DOM et non en HTML
 * interpolé : le nom d'un chemin est du texte libre, et un `<` dans une chaîne
 * interpolée casserait l'UI. `createElement` échappe par construction.
 */
function field(label: string, input: HTMLElement): HTMLLabelElement {
  const l = document.createElement('label')
  l.className = 'sce-insp-row'
  const span = document.createElement('span')
  span.textContent = label + ' '
  l.appendChild(span)
  l.appendChild(input)
  return l
}

/** `<input type="number">` borné de l'inspecteur. */
function numberInput(id: string, value: number, min: number, max: number, onChange: (v: number) => void): HTMLInputElement {
  const el = document.createElement('input')
  el.className = 'sce-search'
  el.id = id
  el.type = 'number'
  el.min = String(min)
  el.max = String(max)
  el.value = String(value)
  el.addEventListener('change', () => onChange(Number(el.value)))
  return el
}

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
  /** `null` sur les stages sans plan de chantier procédural (case non affichée). */
  private keepSitePlanInput: HTMLInputElement | null = null

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
    if (scene.stage === 'terrain_vierge') {
      gFile.appendChild(btn('🏗 Partir du niveau existant', () => {
        if (window.confirm('Charger le niveau EXISTANT comme base éditable ? (remplace la compo courante ; les engins deviennent bloquants)')) { state.importGenerated() }
      }))
    } else {
      const manualStage = document.createElement('span')
      manualStage.className = 'sce-file-note'
      manualStage.textContent = 'Stage manuel : utiliser Charger un fichier'
      gFile.appendChild(manualStage)
    }
    gFile.appendChild(btn('💾 Sauver (jouable)', () => {
      saveUserLayout(scene.stage, state.exportGameJson())
      window.alert('Sauvé ✓ — jouable depuis le menu titre (niveau : ' + scene.stage + ').')
    }, 'sce-btn-primary'))
    // Plan de chantier procédural : uniquement là où il en existe un.
    if (stageHasSitePlan(scene.stage)) {
      const cb = checkbox('Garder le plan de chantier de base', state.keepSitePlan, (v) => state.setKeepSitePlan(v))
      this.keepSitePlanInput = cb.input
      gFile.appendChild(cb.el)
    }
    // Retour arrière : sans ça, « Sauver (jouable) » enferme sur la compo custom.
    gFile.appendChild(btn('↺ Restaurer le niveau d\'origine', () => {
      const ok = window.confirm(
        'Le niveau d\'origine sera régénéré. Ta composition sauvegardée pour ce stage sera supprimée. ' +
        'Le brouillon de l\'éditeur est conservé.'
      )
      if (!ok) { return }
      // deleteUserLayout ne touche QUE `btp:userLayouts` (sauvegarde jouable) ;
      // le brouillon `stageComposer:<stage>` est un store distinct → l'utilisateur
      // garde son travail en cours et peut re-sauver derrière.
      deleteUserLayout(scene.stage)
      window.alert('Niveau d\'origine restauré ✓ (niveau : ' + scene.stage + '). Le brouillon de l\'éditeur est intact.')
    }, 'sce-btn-danger'))
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

  /**
   * Réglages d'un chemin : nom · qui · combien · vitesse · pause · sens unique.
   *
   * Tout est en nœuds DOM (pas d'`innerHTML` interpolé) : le nom est libre.
   * Les écouteurs sont (ré)installés à chaque `refresh` — l'inspecteur est
   * reconstruit à chaque émission d'état.
   */
  private buildPathInspector(p: LayoutPath): void {
    const state = this.scene.state
    const isTruck = p.type === 'truck_path'
    const skins = walkerSkinsFor(this.scene.stage, p.type)

    const title = document.createElement('div')
    title.className = 'sce-insp-title'
    title.textContent = p.name ?? (isTruck ? 'Chemin camion' : 'Chemin ouvrier')
    this.inspector.appendChild(title)

    const info = document.createElement('div')
    info.className = 'sce-insp-row'
    const oneWay = p.oneWay === true
    info.textContent = `${p.points.length} points · ${oneWay ? 'sens unique' : 'aller-retour'}`
    this.inspector.appendChild(info)

    // Nom.
    const name = document.createElement('input')
    name.className = 'sce-search'
    name.id = 'path-name'
    name.value = p.name ?? ''
    name.placeholder = 'ex. Livraison béton'
    name.addEventListener('change', () => state.updatePath(p.id, { name: name.value }))
    this.inspector.appendChild(field('Nom', name))

    // Qui parcourt — FILTRÉ par la famille : un skin de camion sur un chemin
    // d'ouvrier produirait un camion qui « marche ».
    const skinSel = document.createElement('select')
    skinSel.className = 'sce-select'
    skinSel.id = 'path-skin'
    const def = document.createElement('option')
    def.value = ''
    def.textContent = '(défaut)'
    skinSel.appendChild(def)
    for (const s of skins) {
      const o = document.createElement('option')
      o.value = s.key
      o.textContent = s.label
      if (p.skin === s.key) {o.selected = true}
      skinSel.appendChild(o)
    }
    skinSel.addEventListener('change', () => state.updatePath(p.id, { skin: skinSel.value }))
    this.inspector.appendChild(field('Qui', skinSel))

    // Combien · vitesse · pause. Défaut de vitesse lu à la SOURCE, jamais recopié
    // en dur : sinon l'inspecteur afficherait une valeur et le jeu en jouerait une autre.
    this.inspector.appendChild(field('Combien', numberInput(
      'path-count', p.count ?? 1, PATH_LIMITS.count.min, PATH_LIMITS.count.max,
      (v) => state.updatePath(p.id, { count: v })
    )))
    this.inspector.appendChild(field('Vitesse (px/s)', numberInput(
      'path-speed', p.speed ?? PATH_DEFAULT_SPEED[p.type], PATH_LIMITS.speed.min, PATH_LIMITS.speed.max,
      (v) => state.updatePath(p.id, { speed: v })
    )))
    this.inspector.appendChild(field('Pause (ms)', numberInput(
      'path-pause', p.pauseMs ?? 0, PATH_LIMITS.pauseMs.min, PATH_LIMITS.pauseMs.max,
      (v) => state.updatePath(p.id, { pauseMs: v })
    )))

    const ow = checkbox('Sens unique (disparaît au bout, réapparaît au départ)', oneWay,
      (v) => state.updatePath(p.id, { oneWay: v }))
    ow.input.id = 'path-oneway'
    this.inspector.appendChild(ow.el)

    // Ce que fait la pause change de SENS selon le mode : arrêt visible en
    // aller-retour, temps d'absence en sens unique. Sans un mot, on règle 2000 ms
    // et on ne comprend pas ce qu'on obtient.
    const help = document.createElement('div')
    help.className = 'sce-insp-row'
    help.textContent = oneWay
      ? 'Pause = temps INVISIBLE entre la sortie et la réapparition (espace le flux).'
      : 'Pause = arrêt VISIBLE à chaque extrémité (livraison, chargement).'
    this.inspector.appendChild(help)

    if (p.count === 0) {
      const none = document.createElement('div')
      none.className = 'sce-warn sce-warn-warn'
      none.textContent = 'Combien = 0 : ce chemin est un simple repère de conception, personne ne le parcourt.'
      this.inspector.appendChild(none)
    }

    // Ici vivait un avertissement « ce niveau n'a pas de sprite de camion ». Il
    // signalait un `continue` MUET côté rendu : seul le stage 02 déclarait un
    // camion, donc un chemin camion tracé sur les 9 autres ne produisait RIEN.
    // C'était un pansement sur la panne, pas un correctif. La cause est supprimée
    // (`CAMION_SKIN` partagé, chargé par `GameScene.preload` sur les 10 stages) :
    // `walkerSkinsFor(_, 'truck_path')` ne peut plus rendre une liste vide, la
    // condition était donc DÉFINITIVEMENT morte. Un chemin camion est rendu partout.
    const row = document.createElement('div')
    row.className = 'sce-insp-actions'
    row.appendChild(btn('Supprimer le chemin (Suppr)', () => state.deletePath(p.id), 'sce-btn-danger'))
    this.inspector.appendChild(row)
  }

  refresh(): void {
    const state = this.scene.state
    this.gridBtn.classList.toggle('sce-btn-on', state.grid)
    this.snapBtn.classList.toggle('sce-btn-on', state.snap)
    // Resynchro : annuler/rétablir et l'import JSON changent le layout sous la
    // case sans la notifier — sans ça elle mentirait sur l'état réel.
    if (this.keepSitePlanInput !== null) {
      this.keepSitePlanInput.checked = state.keepSitePlan
    }

    // Inspecteur.
    const active = this.scene.active
    const selCount = state.selectionCount
    // Détails mono uniquement quand un seul objet est sélectionné.
    const inst = selCount <= 1 ? state.selectedInstance() : null
    // Un chemin sélectionné ouvre SON inspecteur (« le chemin porte ses
    // marcheurs » : c'est le seul endroit où l'on règle qui / combien / vitesse).
    const path = selCount <= 1 ? state.selectedPath() : null
    const parts: string[] = []
    if (active.prefab !== null) {parts.push(`<div class="sce-tool">Outil : <b>${paletteEntry(active.prefab)?.label ?? active.prefab}</b> — clique pour poser (Échap pour annuler)</div>`)}
    if (active.marker !== null) {
      const isPath = active.marker === 'worker_path' || active.marker === 'truck_path'
      if (isPath) {
        // LA cause du « je ne comprends pas comment faire » : le tracé n'est
        // validé QUE par Entrée, et Entrée n'était écrit NULLE PART — l'indice
        // disait seulement « clique sur la map ». On posait des points et il ne
        // se passait jamais rien. Le compteur montre que les clics comptent.
        const n = this.scene.pathDraftCount
        const quoi = active.marker === 'truck_path' ? 'chemin camion' : 'chemin ouvrier'
        const pts = `${n} point${n > 1 ? 's' : ''} posé${n > 1 ? 's' : ''}`
        const reste = n < 2 ? ' — il en faut au moins 2' : ''
        parts.push(
          `<div class="sce-tool">Tracé : <b>${quoi}</b> — ${pts}${reste}<br>` +
          'clique pour poser les points · <b>Entrée</b> pour valider · ' +
          'Retour arrière annule le dernier · Échap abandonne</div>'
        )
      } else {
        parts.push(`<div class="sce-tool">Marqueur : <b>${active.marker}</b> — clique sur la map (Échap pour annuler)</div>`)
      }
    }
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
    } else if (active.prefab === null && active.marker === null && state.selectedZone === null && path === null) {
      parts.push('<div class="sce-insp-hint">Clique une carte de la palette, puis clique la map pour poser. Clique/lasso pour sélectionner (Maj = ajouter).</div>')
    }
    this.inspector.innerHTML = parts.join('')

    // ── Inspecteur de CHEMIN ────────────────────────────────────────────────
    // Construit en nœuds DOM APRÈS l'affectation d'innerHTML : celle-ci détruit
    // les nœuds précédents, donc tout écouteur posé avant pointerait dans le vide.
    if (path !== null) {
      this.buildPathInspector(path)
    }

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

    // Panneau macro-zone (outil de conception) — indépendant de la sélection d'objets.
    const zoneType = state.selectedZone
    if (zoneType !== null) {
      const z = state.zoneOf(zoneType)
      const def = ZONE_BY_TYPE.get(zoneType)
      if (z !== null && def !== undefined) {
        const title = document.createElement('div')
        title.className = 'sce-insp-title'
        title.textContent = 'Zone : ' + def.label
        this.inspector.appendChild(title)
        const info = document.createElement('div')
        info.className = 'sce-insp-row'
        info.textContent = `${Math.round(z.w)} × ${Math.round(z.h)} px · glisser = déplacer · poignée de coin = redimensionner`
        this.inspector.appendChild(info)
        const zrow = document.createElement('div')
        zrow.className = 'sce-insp-actions'
        zrow.appendChild(btn('Réduire (−)', () => state.scaleZone(zoneType, 0.9)))
        zrow.appendChild(btn('Agrandir (+)', () => state.scaleZone(zoneType, 1.1)))
        zrow.appendChild(btn('Taille par défaut', () => state.resetZoneSize(zoneType)))
        zrow.appendChild(btn('Supprimer', () => state.deleteZone(zoneType), 'sce-btn-danger'))
        this.inspector.appendChild(zrow)
      }
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
