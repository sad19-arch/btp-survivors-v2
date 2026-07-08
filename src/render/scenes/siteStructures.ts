/**
 * SiteStructures — STRUCTURES BÂTIES streamées à l'échelle du monde (refonte cohérence).
 *
 * Problème résolu : le décor était des props ÉPARS posés sur un sol vide, et le
 * monde est immense (10240×7680) : où qu'aille le joueur, il retrouvait du vide.
 * Un vrai chantier, c'est de la STRUCTURE partout — ici, un RÉSEAU de tranchées
 * continues avec les tuyaux dedans, des regards aux nœuds, des déblais le long
 * des berges, des engins au front de fouille. On la STREAME par chunks (comme le
 * DecorStreamer) : chaque chunk dessine la portion du réseau mondial qui le
 * traverse → le joueur est TOUJOURS dans un lieu construit, sans coût mémoire.
 *
 * CONTRAINTE ARCHITECTURE (règle 🔴) : rendu observateur PUR. `GameScene`
 * instancie et délègue (`setPlan`/`update`/`dispose`). Aucune dépendance src/core.
 * Déterministe : réseau sur grille mondiale + jitter par-ligne haché (aucun
 * Math.random). Un chunk revisité est identique.
 *
 * Profondeurs (sol −10, décalques streamés −9, props streamés −6) :
 *   −8.6 tranchée (pits tuilés → chenal continu) · −8.5 déblais ·
 *   −8.4 tuyaux/regards/jonctions posés dans la tranchée · −6.2 engins au bord.
 */

import Phaser from 'phaser'

// ── Profondeurs DA ───────────────────────────────────────────────────────────
const DEPTH_TRENCH_FILL = -8.6
const DEPTH_SPOIL = -8.5
const DEPTH_TRENCH_LINE = -8.4
const DEPTH_MACHINE = -6.2

const CHUNK = 1024
/** Pas de rejet du décor autour du spawn (comme le DecorStreamer). */
const CENTER_EXCLUSION = 260

// ── Réseau : pas de la grille mondiale ───────────────────────────────────────
const GRID_H = 380 // espacement des tranchées horizontales (toujours ≥1 en vue)
const GRID_V = 1040 // espacement des connecteurs verticaux
const TRENCH_STEP = 46 // recouvrement fort des pits → chenal continu
const TRENCH_SCALE = 1.02
const PIPE_STEP = 158 // sections de tuyau espacées (fouille ouverte visible entre elles)
const PIPE_SCALE = 0.82
const SPOIL_OFFSET = 96 // décalage des déblais depuis l'axe de tranchée
const SPOIL_EVERY = 4 // 1 déblai tous les N pas de tranchée

/** Assets d'un réseau de stage (tous les stages « souterrains » partagent le schéma). */
interface NetworkPlan {
  trenchKey: string
  pipeKey: string
  manholeKey: string
  spoilKey: string
  junctionKey?: string
  machineKey?: string
}

const RESEAUX_PLAN: NetworkPlan = {
  trenchKey: 'decal_stage04_trench',
  pipeKey: 'prop_stage04_pipes',
  manholeKey: 'prop_stage04_regard',
  spoilKey: 'decal_stage04_mud',
  junctionKey: 'struct_stage04_trench',
  machineKey: 'struct_stage04_excavator',
}

const STAGE_PLANS: Record<string, NetworkPlan> = {
  reseaux_enterres: RESEAUX_PLAN,
}

/** True si le stage a un réseau bâti (golden en déploiement). GameScene atténue le scatter. */
export function hasStructurePlan(stageId: string): boolean {
  return STAGE_PLANS[stageId] !== undefined
}

/** Hash déterministe 32-bit d'un entier (jitter par-ligne, aucun Math.random). */
function hash1(n: number): number {
  let h = (n ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}
/** Jitter borné [-amp, amp] déterministe pour une ligne d'index i (salé par axe). */
function jitter(i: number, salt: number, amp: number): number {
  const h = hash1(i * 73856093 + salt * 19349663)
  return ((h / 0xffffffff) * 2 - 1) * amp
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

  /** Streame les chunks structurels autour de la caméra (charge les visibles, décharge le reste). */
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
    // Décharge les chunks hors vue.
    for (const [key, sprites] of this.chunks) {
      if (!wanted.has(key)) {
        for (const sp of sprites) {
          sp.destroy()
        }
        this.chunks.delete(key)
      }
    }
  }

  /** Compose la portion du réseau mondial qui traverse le chunk (cx,cy). */
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

    const inWorld = (x: number, y: number): boolean =>
      x >= 0 && x < this.worldW && y >= 0 && y < this.worldH
    const farFromSpawn = (x: number, y: number): boolean => {
      const dx = x - wcx
      const dy = y - wcy
      return dx * dx + dy * dy >= excl2
    }
    const put = (key: string, x: number, y: number, scale: number, rot: number, depth: number): void => {
      if (!inWorld(x, y) || !farFromSpawn(x, y) || !this.scene.textures.exists(key)) {
        return
      }
      const sp = this.scene.add.image(x, y, key).setScale(scale).setDepth(depth)
      if (rot !== 0) {
        sp.setRotation(rot)
      }
      out.push(sp)
    }
    // Aligne un pas global (pas de couture entre chunks).
    const stepStart = (lo: number, step: number): number => Math.ceil(lo / step) * step

    // ── Tranchées HORIZONTALES traversant ce chunk ────────────────────────────
    const h0 = Math.floor(y0 / GRID_H)
    const h1 = Math.floor(y1 / GRID_H)
    for (let h = h0; h <= h1; h++) {
      const yh = h * GRID_H + jitter(h, 1, 70)
      if (yh < y0 || yh >= y1) {
        continue
      }
      // Pits du chenal (aligné globalement → continu d'un chunk à l'autre).
      for (let x = stepStart(x0, TRENCH_STEP); x < x1; x += TRENCH_STEP) {
        put(plan.trenchKey, x, yh, TRENCH_SCALE, 0, DEPTH_TRENCH_FILL)
      }
      // Tuyaux bout à bout dans la tranchée.
      for (let x = stepStart(x0, PIPE_STEP); x < x1; x += PIPE_STEP) {
        put(plan.pipeKey, x, yh, PIPE_SCALE, 0, DEPTH_TRENCH_LINE)
      }
      // Déblais le long de la berge nord.
      let s = 0
      for (let x = stepStart(x0, TRENCH_STEP); x < x1; x += TRENCH_STEP, s++) {
        if (s % SPOIL_EVERY === 0) {
          put(plan.spoilKey, x, yh - SPOIL_OFFSET, 0.95, 0, DEPTH_SPOIL)
        }
      }
    }

    // ── Tranchées VERTICALES traversant ce chunk ──────────────────────────────
    const v0 = Math.floor(x0 / GRID_V)
    const v1 = Math.floor(x1 / GRID_V)
    for (let v = v0; v <= v1; v++) {
      const xv = v * GRID_V + jitter(v, 2, 90)
      if (xv < x0 || xv >= x1) {
        continue
      }
      for (let y = stepStart(y0, TRENCH_STEP); y < y1; y += TRENCH_STEP) {
        put(plan.trenchKey, xv, y, TRENCH_SCALE, Math.PI / 2, DEPTH_TRENCH_FILL)
      }
      for (let y = stepStart(y0, PIPE_STEP); y < y1; y += PIPE_STEP) {
        put(plan.pipeKey, xv, y, PIPE_SCALE, Math.PI / 2, DEPTH_TRENCH_LINE)
      }
      let s = 0
      for (let y = stepStart(y0, TRENCH_STEP); y < y1; y += TRENCH_STEP, s++) {
        if (s % SPOIL_EVERY === 0) {
          put(plan.spoilKey, xv + SPOIL_OFFSET, y, 0.95, 0, DEPTH_SPOIL)
        }
      }
    }

    // ── Nœuds : regards + jonctions + engins aux intersections tombant ici ────
    for (let h = h0; h <= h1; h++) {
      const yh = h * GRID_H + jitter(h, 1, 70)
      for (let v = v0; v <= v1; v++) {
        const xv = v * GRID_V + jitter(v, 2, 90)
        if (xv < x0 || xv >= x1 || yh < y0 || yh >= y1) {
          continue
        }
        const r = hash1(h * 40503 + v * 20903) % 6
        if (r === 0 && plan.machineKey !== undefined) {
          // Engin au front de fouille, décalé du croisement.
          put(plan.machineKey, xv - 150, yh - 40, 1.05, 0, DEPTH_MACHINE)
          put(plan.manholeKey, xv, yh, 0.58, 0, DEPTH_TRENCH_LINE)
        } else if (r <= 2 && plan.junctionKey !== undefined) {
          put(plan.junctionKey, xv, yh, 0.85, 0, DEPTH_TRENCH_LINE)
        } else {
          put(plan.manholeKey, xv, yh, 0.6, 0, DEPTH_TRENCH_LINE)
        }
      }
      // Regards intermédiaires le long de la tranchée horizontale (entre nœuds).
      const yh2 = h * GRID_H + jitter(h, 1, 70)
      if (yh2 >= y0 && yh2 < y1) {
        for (let x = stepStart(x0, 620); x < x1; x += 620) {
          put(plan.manholeKey, x, yh2, 0.5, 0, DEPTH_TRENCH_LINE)
        }
      }
    }

    return out
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
