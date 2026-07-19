---
name: dispatch-brief
description: Use BEFORE dispatching any Agent() subagent on this repo — prepend these standing constraints to the brief instead of retyping them from memory each time. Encodes git safety in a shared tree, gate discipline, PixelLab/asset priority, and the license to refuse a bad brief. Read CLAUDE.md first for anything project-specific that has changed since this was written (forbidden files, current stage, etc).
---

# Brief de dispatch — le socle à coller dans chaque agent délégué

Ce texte existe parce que le même bloc de contraintes a été retapé à la main dans presque chaque brief d'agent le 2026-07-17, avec le risque d'oubli que ça implique. Colle (ou adapte) ce qui est pertinent dans le prompt de l'Agent tool — ne le reconstruis pas de mémoire.

⚠️ **Ce bloc peut devenir périmé** (ex. la liste des fichiers interdits au commit a changé au moins deux fois en une journée). **Toujours vérifier contre le `CLAUDE.md` actuel** avant de coller ce qui suit tel quel — en particulier la section « Discipline multi-agents ».

## Le socle

```
## Contraintes standing (arbre partagé, plusieurs agents)

- `src/core` n'importe jamais Phaser ni le DOM. Déterminisme : pas de
  Math.random()/Date.now()/new Date() dans src/core ni src/content.
- 🚫 GameScene N'EST PAS UNE POUBELLE. Toute responsabilité de rendu va
  dans un module dédié de src/render/ que GameScene instancie et délègue.
- Typage strict, zéro `any`, ESLint 0 warning. Texte in-game en français.
- ⚠️ `git add <fichier>` prend TOUT le fichier — lis `git diff --cached`
  AVANT de committer dans cet arbre partagé. Jamais `git add -A`/`.`/
  `--all` : chemins explicites uniquement. NE STASHE JAMAIS.
- ⚠️ Vérifie `git status` avant d'écrire dans un fichier qu'un autre agent
  pourrait toucher — si un fichier bouge sous toi, dis-le, ne clobbe pas.
- NE COMMITTE JAMAIS les fichiers listés dans CLAUDE.md § contraintes
  (vérifie la liste actuelle — elle change).
- Pour tout visuel/son : PixelLab/ElevenLabs sont PRIORITAIRES. Demande
  la source avant de générer. JAMAIS de génération silencieuse (quota).
  Golden d'abord, jamais toute la production d'un coup.
- Gates : tsc --noEmit · eslint (0) · vitest · build. Playwright SEULEMENT
  si demandé, avec CI=1 obligatoire (sinon reuseExistingServer ment) et
  JAMAIS pendant que d'autres agents écrivent encore dans l'arbre.
- Tu as le droit de conclure « rien d'objectif à corriger » ou « je
  refuse de deviner, voilà pourquoi » — ce n'est pas un échec de la
  tâche. Si applicable, arrête après N tentatives et rapporte plutôt que
  de fabriquer un correctif pour justifier le mandat.
- Signale tout écart entre ce brief et le code réel — vérifie, n'applique
  pas mécaniquement. Les briefs de contrôleur se sont trompés de
  nombreuses fois ; presque tous les écarts ont été rattrapés par des
  agents qui ont mesuré au lieu de suivre à la lettre.
```

## Ce qui reste à écrire par tâche (jamais dans ce socle)

- Le mandat précis, le contexte produit (pourquoi cette tâche existe).
- Les fichiers/chemins concernés, les décisions déjà prises par l'utilisateur.
- La preuve exigée (mesure, gate, avant/après) — spécifique à la tâche.
- Le format du rapport attendu.

## Quand NE PAS utiliser ce socle

Sur une tâche solo (pas de dispatch d'agent), ces règles vivent déjà dans
`CLAUDE.md` et s'appliquent directement — pas besoin de les recopier ici.
