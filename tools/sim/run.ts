/**
 * Harness de simulation headless — « Claude joue pour valider ».
 *
 * Fait tourner le VRAI cœur de jeu (Simulation) SANS Phaser ni navigateur, de
 * façon déterministe (seed). Un bot joue, on imprime des métriques et on vérifie
 * des invariants. Sort en code 1 si un invariant casse.
 *
 * Usage:
 *   npm run sim -- --seed 42 --duration 300 --bot kite
 *   bots: greedy (ramasse/engage) | kite (esquive) | idle (immobile)
 */
import { Simulation } from '@core/simulation'
import type { GameState } from '@core/types'

interface SimArgs {
  seed: number
  durationSec: number
  bot: string
}

function parseArgs(argv: string[]): SimArgs {
  const get = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag)
    return i >= 0 && i + 1 < argv.length ? (argv[i + 1] ?? fallback) : fallback
  }
  return {
    seed: Number.parseInt(get('--seed', '42'), 10),
    durationSec: Number.parseInt(get('--duration', '120'), 10),
    bot: get('--bot', 'kite')
  }
}

/** Calcule le vecteur de déplacement du bot pour la frame courante. */
function botMove(bot: string, s: GameState): { x: number; y: number } {
  const p = s.players[0]
  if (p === undefined) {
    return { x: 0, y: 0 }
  }
  if (bot === 'idle') {
    return { x: 0, y: 0 }
  }
  if (bot === 'greedy') {
    const targets = s.pickups.length > 0 ? s.pickups : s.enemies
    let tx = p.x
    let ty = p.y
    let bd = Infinity
    for (const t of targets) {
      const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2
      if (d < bd) {
        bd = d
        tx = t.x
        ty = t.y
      }
    }
    return { x: tx - p.x, y: ty - p.y }
  }
  // kite : fuit l'ennemi le plus proche, se recentre près des bords.
  let nx = 0
  let ny = 0
  let bd = Infinity
  for (const e of s.enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d < bd) {
      bd = d
      nx = p.x - e.x
      ny = p.y - e.y
    }
  }
  const cx = 800 - p.x
  const cy = 600 - p.y
  const edge = Math.hypot(cx, cy) > 500 ? 2 : 0
  return { x: nx + cx * edge, y: ny + cy * edge }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const sim = new Simulation({ seed: args.seed, mode: 'solo' })
  const targetMs = args.durationSec * 1000
  const stepMs = 100

  let minHp = Infinity
  let maxEnemies = 0
  let levelUps = 0
  let deathMs = -1
  let nanSeen = false
  let bossSeen = false

  for (let t = 0; t < targetMs; t += stepMs) {
    const s = sim.getState()
    if (s.scene === 'gameover') {
      deathMs = s.elapsedMs
      break
    }
    if (s.pendingLevelUp !== null) {
      levelUps += 1
      sim.chooseUpgrade(0)
      continue
    }
    const p = s.players[0]
    if (p !== undefined) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp)) {
        nanSeen = true
      }
      minHp = Math.min(minHp, p.hp)
    }
    maxEnemies = Math.max(maxEnemies, s.enemies.length)
    if (s.enemies.some((e) => e.isBoss)) {
      bossSeen = true
    }
    sim.setInput(1, { move: botMove(args.bot, s), attack: false })
    sim.advanceTime(stepMs)
  }

  const final = sim.getState()
  const fp = final.players[0]
  console.log('[sim] seed=%d duration=%ds bot=%s', args.seed, args.durationSec, args.bot)
  console.log(
    '[sim] t=%dms score=%d niveau=%d level-ups=%d ennemis_max=%d boss=%s mort=%s',
    final.elapsedMs,
    final.score,
    fp?.level ?? 0,
    levelUps,
    maxEnemies,
    bossSeen ? 'oui' : 'non',
    deathMs >= 0 ? `${deathMs}ms` : 'survie'
  )

  // --- invariants ---
  const failures: string[] = []
  if (nanSeen) {
    failures.push('position/HP NaN détecté')
  }
  if (minHp < 0) {
    failures.push(`HP négatif silencieux (min=${minHp})`)
  }
  if (maxEnemies > 220) {
    failures.push(`plafond d'ennemis dépassé (${maxEnemies})`)
  }

  if (failures.length > 0) {
    console.error('[sim] INVARIANTS ROUGES:\n - ' + failures.join('\n - '))
    process.exit(1)
  }
  console.log('[sim] invariants verts ✓')
}

main()
