/**
 * SiteStructures — STRUCTURES BÂTIES streamées à l'échelle du monde (refonte cohérence).
 *
 * Le monde est immense (10240×7680) et rien ne posait de structure continue : que
 * du scatter → « objets posés sur un sol vide ». Ce module STREAME un vrai RÉSEAU
 * de chantier par chunks autour de la caméra (comme le DecorStreamer, mais de la
 * STRUCTURE). Pour réseaux enterrés : un réseau ORGANIQUE de tranchées — des nœuds
 * irréguliers reliés par des segments à angles variés (pas un damier), avec tuyaux
 * posés dedans, regards/jonctions aux nœuds, engins au front de fouille, déblais le
 * long des berges. Où qu'aille le joueur, il est dans un vrai chantier.
 *
 * CONTRAINTE ARCHITECTURE (règle 🔴) : rendu observateur PUR. `GameScene` délègue
 * (`setPlan`/`update`/`dispose`). Aucune dépendance src/core. Déterministe : nœuds
 * et arêtes dérivés d'un hash de coordonnées de grille (zéro Math.random) → un chunk
 * revisité est identique et les segments se raccordent sans couture.
 *
 * Profondeurs (sol −10, décalques streamés −9, props streamés −6) :
 *   −8.6 tranchée (pits tuilés) · −8.5 déblais · −8.4 tuyaux/regards/jonctions ·
 *   −6.2 engins au bord.
 */

import Phaser from 'phaser'

// ── Profondeurs DA ───────────────────────────────────────────────────────────
const DEPTH_TRENCH_FILL = -8.6
const DEPTH_SPOIL = -8.5
const DEPTH_TRENCH_LINE = -8.4
const DEPTH_MACHINE = -6.2

const CHUNK = 1024
/** Rejet du décor autour du spawn (le joueur a de l'air pour bouger/combattre). */
const CENTER_EXCLUSION = 300

// ── Réseau organique : nœuds jitterés + arêtes à angles variés ───────────────
const NODE = 640 // pas de la grille de nœuds
const JIT = 250 // amplitude de jitter d'un nœud (irrégularité)
const EDGE_PROMILLE = 640 // ~64 % des arêtes candidates existent → toile irrégulière
/** Directions candidates d'arête depuis un nœud (vers voisins bas/droite → pas de doublon). */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]
const TRENCH_STEP = 46
const TRENCH_SCALE = 1.02
const PIPE_STEP = 152 // sections de tuyau espacées (fouille ouverte entre elles)
const PIPE_SCALE = 0.82
const PIPE_MARGIN = 130 // bouts d'arête laissés ouverts
const SPOIL_EVERY = 4
const SPOIL_OFFSET = 92

interface NetworkPlan {
  trenchKey: string
  pipeKey: string
  manholeKey: string
  spoilKey: string
  junctionKey?: string
  machineKey?: string
  /** Matériel de poste de travail (touret, gaine…) posé à côté des engins. */
  gearKeys?: readonly string[]
}

const RESEAUX_PLAN: NetworkPlan = {
  trenchKey: 'decal_stage04_trench',
  pipeKey: 'prop_stage04_pipes',
  manholeKey: 'prop_stage04_regard',
  spoilKey: 'decal_stage04_mud',
  junctionKey: 'struct_stage04_trench',
  machineKey: 'struct_stage04_excavator',
  gearKeys: ['prop_stage04_cable', 'prop_stage04_trencher'],
}

const STAGE_PLANS: Record<string, NetworkPlan> = {
  reseaux_enterres: RESEAUX_PLAN,
}

/** True si le stage a un réseau bâti (golden en déploiement). GameScene atténue le scatter. */
export function hasStructurePlan(stageId: string): boolean {
  return STAGE_PLANS[stageId] !== undefined
}

/** Hash déterministe 32-bit d'un couple d'entiers + sel (zéro Math.random). */
function hash2(i: number, j: number, salt: number): number {
  let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(salt, 83492791)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}
/** Réel déterministe [0,1) pour (i,j,salt). */
function rnd(i: number, j: number, salt: number): number {
  return hash2(i, j, salt) / 4294967296
}

export class SiteStructures {
  /** Sprites par chunk chargé ("cx,cy" → images). Streamés avec la caméra. */
  private chunks = new Map<string, Phaser.GameObjects.Image[]>()
  private plan: NetworkPlan | null = null
  private worldW = 0
  private worldH = 0

  constructor(private readonly scene: Phaser.Scene) {}

  /** Configure le réseau du stage (ou aucun). À appeler au (re)démarrage de la scène. */
  setPlan(worldW: number, worldH: number, stageId: string): void {
    this.dispose()
    this.worldW = worldW
    this.worldH = worldH
    this.plan = STAGE_PLANS[stageId] ?? null
  }

  /** Streame les chunks structurels autour de la caméra (charge visibles, décharge le reste). */
  update(camera: Phaser.Cameras.Scene2D.Camera): void {
    if (this.plan === null) {
      return
    }
    const view = camera.worldView
    const margin = CHUNK
    const cx0 = Math.max(0, Math.floor((view.x - margin) / CHUNK))
    const cy0 = Math.max(0, Math.floor((view.y - margin) / CHUNK))
    const cx1 = Math.floor((view.x + view.width + margin) / CHUNK)
    const cy1 = Math.floor((view.y + view.height + margin) / CHUNK)
    const wanted = new Set<string>()
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cy}`
        wanted.add(key)
        if (!this.chunks.has(key)) {
          this.chunks.set(key, this.buildChunk(cx, cy))
        }
      }
    }
    for (const [key, sprites] of this.chunks) {
      if (!wanted.has(key)) {
        for (const sp of sprites) {
          sp.destroy()
        }
        this.chunks.delete(key)
      }
    }
  }

  /** Position monde (jitterée) du nœud de grille (i,j). */
  private nodePos(i: number, j: number): { x: number; y: number } {
    return {
      x: (i + 0.5) * NODE + (rnd(i, j, 7) * 2 - 1) * JIT,
      y: (j + 0.5) * NODE + (rnd(i, j, 11) * 2 - 1) * JIT,
    }
  }

  /** L'arête (i,j)→(i+di,j+dj) existe-t-elle ? (dir = index dans DIRS) */
  private edge(i: number, j: number, dir: number): boolean {
    return hash2(i, j, 40503 + dir) % 1000 < EDGE_PROMILLE
  }

  /** Degré d'un nœud = arêtes sortantes + entrantes (pour choisir regard vs jonction). */
  private degree(i: number, j: number): number {
    let d = 0
    for (let k = 0; k < DIRS.length; k++) {
      if (this.edge(i, j, k)) {
        d++
      }
    }
    // entrantes : arêtes des voisins pointant vers (i,j).
    if (this.edge(i - 1, j, 0)) { d++ }
    if (this.edge(i, j - 1, 1)) { d++ }
    if (this.edge(i - 1, j - 1, 2)) { d++ }
    if (this.edge(i - 1, j + 1, 3)) { d++ }
    return d
  }

  /** Compose la portion du réseau qui traverse le chunk (cx,cy). */
  private buildChunk(cx: number, cy: number): Phaser.GameObjects.Image[] {
    const out: Phaser.GameObjects.Image[] = []
    const plan = this.plan
    if (plan === null) {
      return out
    }
    const x0 = cx * CHUNK
    const y0 = cy * CHUNK
    const x1 = x0 + CHUNK
    const y1 = y0 + CHUNK
    const wcx = this.worldW / 2
    const wcy = this.worldH / 2
    const excl2 = CENTER_EXCLUSION * CENTER_EXCLUSION

    const ok = (x: number, y: number): boolean => {
      if (x < 0 || x >= this.worldW || y < 0 || y >= this.worldH) { return false }
      if (x < x0 || x >= x1 || y < y0 || y >= y1) { return false }
      const dx = x - wcx
      const dy = y - wcy
      return dx * dx + dy * dy >= excl2
    }
    const put = (key: string, x: number, y: number, scale: number, rot: number, depth: number): void => {
      if (!ok(x, y) || !this.scene.textures.exists(key)) { return }
      const sp = this.scene.add.image(x, y, key).setScale(scale).setDepth(depth)
      if (rot !== 0) { sp.setRotation(rot) }
      out.push(sp)
    }

    // Nœuds de grille dont une arête peut toucher ce chunk (portée ≈ NODE + 2·JIT).
    const i0 = Math.floor(x0 / NODE) - 2
    const i1 = Math.floor(x1 / NODE) + 2
    const j0 = Math.floor(y0 / NODE) - 2
    const j1 = Math.floor(y1 / NODE) + 2

    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const a = this.nodePos(i, j)
        // Marqueur de nœud (dans ce chunk) : jonction si vrai carrefour, sinon regard/engin.
        if (a.x >= x0 && a.x < x1 && a.y >= y0 && a.y < y1) {
          const deg = this.degree(i, j)
          const r = hash2(i, j, 999) % 6
          if (r === 0 && plan.machineKey !== undefined) {
            // Engin au nœud : posé AU BORD de la fouille (pas dessus), regard au centre.
            put(plan.machineKey, a.x + 128, a.y - 60, 1.05, 0, DEPTH_MACHINE)
            put(plan.manholeKey, a.x, a.y, 0.6, 0, DEPTH_TRENCH_LINE)
          } else if (deg >= 3 && plan.junctionKey !== undefined) {
            put(plan.junctionKey, a.x, a.y, 0.85, 0, DEPTH_TRENCH_LINE)
          } else {
            put(plan.manholeKey, a.x, a.y, 0.6, 0, DEPTH_TRENCH_LINE)
          }
        }
        // Arêtes sortantes → tranchée + tuyaux + déblais (portion tombant dans le chunk).
        for (let d = 0; d < DIRS.length; d++) {
          if (!this.edge(i, j, d)) { continue }
          const dir = DIRS[d]
          if (dir === undefined) { continue }
          const b = this.nodePos(i + dir[0], j + dir[1])
          this.drawEdge(i, j, d, a, b, plan, put)
        }
      }
    }
    return out
  }

  /** Trace une arête (pits + tuyaux + déblais + poste de travail) — chaque pas n'est posé que s'il tombe dans le chunk. */
  private drawEdge(
    i: number,
    j: number,
    d: number,
    a: { x: number; y: number },
    b: { x: number; y: number },
    plan: NetworkPlan,
    put: (key: string, x: number, y: number, scale: number, rot: number, depth: number) => void,
  ): void {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 1) { return }
    const ang = Math.atan2(dy, dx)
    const ux = dx / len
    const uy = dy / len
    // perpendiculaire (pour déblais / matériel au bord).
    const px = -uy
    const py = ux

    // Chenal : pits tuilés fort recouvrement.
    const nT = Math.max(1, Math.round(len / TRENCH_STEP))
    for (let k = 0; k <= nT; k++) {
      const t = (k / nT) * len
      const x = a.x + ux * t
      const y = a.y + uy * t
      put(plan.trenchKey, x, y, TRENCH_SCALE, ang, DEPTH_TRENCH_FILL)
      if (k % SPOIL_EVERY === 0) {
        put(plan.spoilKey, x + px * SPOIL_OFFSET, y + py * SPOIL_OFFSET, 0.95, 0, DEPTH_SPOIL)
      }
    }
    // Tuyaux : sections espacées, bouts laissés ouverts.
    for (let t = PIPE_MARGIN; t <= len - PIPE_MARGIN; t += PIPE_STEP) {
      put(plan.pipeKey, a.x + ux * t, a.y + uy * t, PIPE_SCALE, ang, DEPTH_TRENCH_LINE)
    }

    // ── POSTE DE TRAVAIL le long de la tranchée (~55 % des arêtes) ────────────
    // Un chantier qui VIT : engin au front de pose + tuyaux STOCKÉS en attente
    // (parallèles à la fouille) + touret/gaine. Déterministe par (i,j,d) → même
    // arête = même poste, raccord sans couture entre chunks.
    if (hash2(i + 31 * d, j - 17 * d, 555) % 100 < 55) {
      const side = hash2(i, j, 556 + d) % 2 === 0 ? 1 : -1
      const tW = len * (0.35 + rnd(i, j, 557 + d) * 0.3)
      const wx = a.x + ux * tW
      const wy = a.y + uy * tW
      const ox = px * side
      const oy = py * side
      // Engin au bord de la fouille (2/3 des postes), sinon poste matériel seul.
      if (plan.machineKey !== undefined && hash2(i, j, 558 + d) % 3 !== 0) {
        put(plan.machineKey, wx + ox * 118, wy + oy * 118, 1.0, 0, DEPTH_MACHINE)
      }
      // Tuyaux stockés en attente de pose : 2 sections parallèles à la tranchée.
      put(plan.pipeKey, wx + ox * 78 + ux * 55, wy + oy * 78 + uy * 55, 0.78, ang, DEPTH_SPOIL)
      put(plan.pipeKey, wx + ox * 100 + ux * 175, wy + oy * 100 + uy * 175, 0.78, ang, DEPTH_SPOIL)
      // Matériel (touret, gaine…) autour du poste.
      const gear = plan.gearKeys ?? []
      for (let g = 0; g < gear.length; g++) {
        const key = gear[g]
        if (key === undefined) { continue }
        const gi = hash2(i + g, j, 559 + d)
        const gx = wx + ox * (135 + (gi % 40)) - ux * (60 + (gi % 70))
        const gy = wy + oy * (135 + ((gi >> 4) % 40)) - uy * (60 + ((gi >> 6) % 70))
        put(key, gx, gy, 0.8, 0, DEPTH_MACHINE)
      }
      // Boue de piétinement autour du poste.
      put(plan.spoilKey, wx + ox * 60 - ux * 30, wy + oy * 60 - uy * 30, 1.05, 0, DEPTH_SPOIL)
    }
  }

  /** Sync de frame — no-op (le streaming se fait via `update`). */
  sync(): void {
    // rien — voir update()
  }

  dispose(): void {
    for (const sprites of this.chunks.values()) {
      for (const sp of sprites) {
        sp.destroy()
      }
    }
    this.chunks.clear()
  }

  /** Nombre total de sprites structurels actifs (sonde de test). */
  get spriteCount(): number {
    let n = 0
    for (const s of this.chunks.values()) {
      n += s.length
    }
    return n
  }
}
