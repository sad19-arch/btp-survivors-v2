---
name: play-to-validate
description: Use BEFORE claiming any gameplay task is done — validate by "playing" the game. Runs the deterministic headless sim, Vitest, and/or Playwright depending on what changed, checks invariants, and reproduces issues by seed. Mandatory for any change touching src/core, src/content, src/render, or src/ui.
---

# Play to Validate

Une tâche de gameplay n'est **terminée** que lorsqu'elle est validée *en jouant*, preuve à l'appui. Jamais de « ça devrait marcher ».

🔴 **Des gates préexistants qui restent verts ne prouvent RIEN sur le code neuf** — ils testaient ce qui existait AVANT. Une feature n'est « complète » (dans un ledger, une mémoire, un rapport à l'utilisateur) que si elle a été **exercée sur SON PROPRE chemin neuf** : un sim/e2e qui touche spécifiquement le code ajouté, pas juste « la suite passe toujours ». (Incident vécu : `feat/stage-intro-cinematics` cataloguée « feature complète, 7 commits », gates tous verts — parce qu'ils prouvaient la plomberie (le séquenceur, le typage), jamais le jeu. Restée non jouée ~10 jours, elle contenait 2 bugs bloquants visibles en 2 secondes de jeu réel.)

## Choisir l'outil selon ce qui a changé

```
Logique / équilibrage / contenu (src/core, src/content)
  → npm run sim -- --seed 42 --duration 300 --bot greedy   (déterministe, rapide)
  → npm run test                                            (systèmes isolés)

Rendu / HUD / inputs / UX (src/render, src/ui, src/input)
  → npm run test:e2e                                        (vrai jeu, screenshots)

Toujours
  → npm run type-check && npm run lint
```

## Procédure

1. **Reproduire / observer l'état initial.** Si bug, fixer une **seed** et lancer le sim pour le rejouer à l'identique. Noter la seed dans le rapport.
2. **Appliquer le changement** (en TDD quand c'est de la logique : test rouge → code → vert).
3. **Rejouer.** Relancer la même commande/seed. Comparer aux invariants et métriques attendus.
4. **Vérifier les invariants** (le harness les imprime). Tout invariant rouge = non validé :
   - HP ne devient jamais négatif silencieusement ; pas de NaN dans les dégâts/stats.
   - Le nombre d'entités reste sous le plafond.
   - Survie minimale attendue selon le scénario (ex. joueur niveau 1 immobile ≥ X s).
   - Déterminisme : deux runs même seed ⇒ même hash d'état final.
5. **Pour le rendu**, lancer Playwright : booter le jeu, mettre l'état via les hooks debug (`window.__btp`: `spawn`, `giveWeapon`, `setTime`, `seed`, `godMode`, `fastForward`), capturer l'écran, asserter le DOM du HUD.
6. **Rapporter la preuve** : commande exacte lancée + sortie clé (métriques, invariants verts, capture). Pas d'affirmation sans sortie observée.

## Le seam de test (`window.__GAME__`) — comment piloter le vrai jeu

Playwright ne voit pas l'intérieur du canvas. On pilote le jeu via le seam JSON, **pas** par pixels. Boucle d'auto-test type :

```js
await page.goto('/?autostart=solo&seed=42&test=1')
await page.waitForFunction(() => window.__GAME__?.ready)
for (let step = 0; step < N; step++) {
  const s = await page.evaluate(() => window.__GAME__.getState())
  const action = decide(s)              // viser l'ennemi le plus proche, ramasser, etc.
  await page.evaluate((a) => window.__GAME__.setInput(1, a), action)
  await page.evaluate(() => window.__GAME__.advanceTime(100))  // déterministe, pas de sleep
}
const final = await page.evaluate(() => window.__GAME__.getState())
// assertions sur l'ÉTAT: a survécu X s ? a level-up ? boss spawné à 90s ?
```

Règles : attendre des **marqueurs** (`ready`, events) jamais des `sleep` ; asserter sur `getState()` jamais sur les pixels ; fixer la **seed** pour reproduire.

## Anti-patterns

- ❌ « J'ai changé la formule de dégâts, ça devrait équilibrer. » → ✅ `npm run sim` avant/après, comparer le DPS/survie.
- ❌ Modifier le rendu et ne lancer que les tests unitaires. → ✅ Playwright voit le vrai canvas/HUD.
- ❌ Bug non reproductible « parfois ». → ✅ Trouver la seed qui le déclenche, l'ajouter en test de régression.
- ❌ Cataloguer une branche « feature complète » parce que ses gates sont verts. → ✅ La jouer (sim/e2e sur son chemin neuf) avant de la déclarer prête à merger — surtout si elle attend depuis plusieurs jours (`npm run branch:health` la signalera si elle dérive trop de `main`).
