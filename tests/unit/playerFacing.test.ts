import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

/**
 * Visée manuelle (retour user) : la « bonbonne de chantier » tire dans la DERNIÈRE
 * direction cardinale que le joueur a pressée (haut/bas/gauche/droite), PAS vers
 * l'ennemi le plus proche comme toutes les autres armes. La direction doit
 * PERSISTER après que le joueur relâche/arrête de bouger.
 *
 * Test de bout en bout via l'API publique de `Simulation` (setInput/advanceTime/
 * getState) — pas de réimplémentation de `applyPlayerInputs`/`tickProjectile`,
 * le vrai chemin de prod.
 */
describe('Simulation — visée manuelle (facing)', () => {
  function bonbonneProjectiles(sim: Simulation): { vx: number; vy: number }[] {
    return sim.getState().projectiles.filter((p) => p.type === 'bonbonne_chantier')
  }

  it('tire vers l\'EST après une pression à droite, même sans ennemi', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    sim.debugGrant({ weapons: [{ id: 'bonbonne_chantier', level: 1 }] })
    sim.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    // Cooldown de base 900ms — avance assez pour garantir un tir.
    sim.advanceTime(950)
    const shots = bonbonneProjectiles(sim)
    expect(shots.length).toBeGreaterThan(0)
    for (const s of shots) {
      expect(s.vx).toBeGreaterThan(0)
      expect(Math.abs(s.vy)).toBeLessThan(1e-6) // cardinal pur, pas de diagonale
    }
  })

  it('la direction PERSISTE : relâcher la touche ne réoriente PAS le tir suivant', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    sim.debugGrant({ weapons: [{ id: 'bonbonne_chantier', level: 1 }] })
    // Presse vers le HAUT (nord, -y) quelques pas fixes (STEP_MS≈16,67 — il faut
    // dépasser ce seuil pour garantir qu'au moins un pas RÉEL traite la pression,
    // sinon `advanceTime` n'a fait qu'accumuler du reste sans exécuter `step()`),
    // puis RELÂCHE (immobile) pour le reste.
    sim.setInput(1, { move: { x: 0, y: -1 }, attack: false })
    sim.advanceTime(50)
    sim.setInput(1, { move: { x: 0, y: 0 }, attack: false })
    sim.advanceTime(950) // le tir survient PENDANT l'immobilité
    const shots = bonbonneProjectiles(sim)
    expect(shots.length).toBeGreaterThan(0)
    for (const s of shots) {
      expect(s.vy).toBeLessThan(0) // toujours nord, malgré le relâchement
      expect(Math.abs(s.vx)).toBeLessThan(1e-6)
    }
  })

  it('une pression en diagonale est snappée sur la cardinale dominante (sud-est → est)', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    sim.debugGrant({ weapons: [{ id: 'bonbonne_chantier', level: 1 }] })
    sim.setInput(1, { move: { x: 1, y: 0.3 }, attack: false }) // majoritairement est
    sim.advanceTime(950)
    const shots = bonbonneProjectiles(sim)
    expect(shots.length).toBeGreaterThan(0)
    expect(shots[0]?.vx ?? 0).toBeGreaterThan(0)
    expect(Math.abs(shots[0]?.vy ?? 1)).toBeLessThan(1e-6)
  })

  it('les armes auto-aim existantes (cloueur) visent la vague d’ouverture', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    const before = sim.getState()
    const player = before.players[0]
    const enemy = before.enemies[0]
    expect(player).toBeDefined()
    expect(enemy).toBeDefined()
    sim.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    sim.advanceTime(50)
    const cloueurShots = sim.getState().projectiles.filter((p) => p.type === 'cloueur')
    expect(cloueurShots.length).toBeGreaterThan(0)
    const shot = cloueurShots[0]
    const towardEnemy = (shot?.vx ?? 0) * ((enemy?.x ?? 0) - (player?.x ?? 0)) +
      (shot?.vy ?? 0) * ((enemy?.y ?? 0) - (player?.y ?? 0))
    expect(towardEnemy).toBeGreaterThan(0)
  })
})
