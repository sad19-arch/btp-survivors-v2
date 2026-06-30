# BTP Survivors v2

Jeu web type *Vampire Survivors* dans un monde de chantier/BTP. Reconstruction propre : cœur de simulation TypeScript déterministe + rendu Phaser, pensé pour être **testable en « jouant »** (sim headless + Playwright).

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3000
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev (hot reload) |
| `npm run build` | Type-check + build de prod |
| `npm run type-check` | Vérification TypeScript |
| `npm run lint` | ESLint strict |
| `npm run test` | Tests unitaires (Vitest) du cœur |
| `npm run test:e2e` | Tests end-to-end (Playwright) |
| `npm run sim` | Simulation headless déterministe |

## Architecture

```
src/core      cœur de simulation (TS pur, déterministe — zéro Phaser/DOM)
src/content   données de jeu typées et validées (armes, ennemis, phases…)
src/render    couche Phaser (observe le World, dessine)
src/input     adaptateurs d'entrée → intents
src/ui        overlay DOM componentisé (HUD, menus)
src/platform  services derrière interfaces (storage, scores, analytics)
tools/sim     harness de simulation headless
tests         unit (Vitest) + e2e (Playwright)
```

Voir [`CLAUDE.md`](./CLAUDE.md) pour les règles d'architecture et la méthodo de validation.
