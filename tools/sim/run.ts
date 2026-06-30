/**
 * Harness de simulation headless — « Claude joue pour valider ».
 *
 * Fait tourner le cœur de jeu SANS Phaser ni navigateur, à vitesse maximale,
 * de façon déterministe (seed). Imprime des métriques et vérifie des invariants.
 *
 * Usage:
 *   npm run sim -- --seed 42 --duration 300 --bot greedy
 *
 * Milestone 0: squelette qui prouve la chaîne tsx → cœur. Les vraies métriques
 * (kills, DPS, survie) et les bots arrivent avec le World au slice 1.
 */
import { Rng } from '@core/rng'
import { FixedClock } from '@core/clock'

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
    durationSec: Number.parseInt(get('--duration', '60'), 10),
    bot: get('--bot', 'greedy')
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const rng = new Rng(args.seed)
  const clock = new FixedClock()

  // Boucle headless: on avance le temps logique par pas fixes jusqu'à la durée cible.
  const targetMs = args.durationSec * 1000
  let ticks = 0
  while (clock.elapsed < targetMs) {
    const steps = clock.accumulate(clock.dt)
    ticks += steps
    // TODO(slice-1): sim.step(world, botController.intents(world), clock.dt)
  }

  // Placeholder de métriques: prouve seulement le déterminisme du RNG.
  const sample = Array.from({ length: 3 }, () => rng.next().toFixed(4))
  console.log('[sim] seed=%d duration=%ds bot=%s', args.seed, args.durationSec, args.bot)
  console.log('[sim] ticks logiques: %d (dt=%dms)', ticks, clock.dt)
  console.log('[sim] échantillon rng déterministe: %s', sample.join(', '))
  console.log('[sim] OK (squelette — invariants & métriques à venir au slice 1)')
}

main()
