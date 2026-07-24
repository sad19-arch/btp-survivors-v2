# Plan — Solde de tout compte

> Mandat user (2026-07-17) : « tu vas faire toutes les tâches jamais complétées,
> tu as mon accord. Fais toi un plan mais fais TOUT. je ne veux plus de tâche qui
> traine ou incomplète. »

## Ce que « tout » ne peut pas inclure — à dire, pas à cacher

Trois familles de tâches **ne traînent pas par négligence** : elles attendent
l'utilisateur par construction. Les cocher sans lui serait mentir.

- **Gates DA** (métiers, trophée, engins) — son œil est l'oracle. Le navigateur
  intégré NE PEINT PAS (`requestAnimationFrame` ne se déclenche jamais) : il ne
  peut valider ni canvas ni animation. Deux faux verdicts rendus aujourd'hui.
- **Gametests** (collisions, `keepSitePlan`, scores, succès) — Vitest ne fait pas
  tourner Phaser.
- **Playtest d'équilibrage** — l'oracle final du feel.

Elles restent ouvertes. C'est le bon état.

## Corrections apportées à l'inventaire (vérifiées, pas supposées)

1. **`GameScene` n'est PAS un god object de 1900 lignes** : il fait **966
   lignes**, la découpe a été faite (tâche #149). Mon ledger répétait une info
   périmée. **Rayé de la dette.**
2. **`feat/stage-intro-cinematics` = 7 commits d'une fonctionnalité COMPLÈTE**
   (spec, séquenceur déterministe, primitives caméra cut/zoomTo/punchIn/whipPan,
   CinemaStage zéro-fuite, câblage + skip + seam e2e, golden terrassement).
   Jamais mergée depuis le 2026-07-08. **C'est le plus gros travail fini qui
   dort.**

---

## Vague 1 — Sauver ce qui expire (EN COURS)

**Assets PixelLab, expiration 8 h.** Intégration de 6 engins + 11 métiers :
télécharger, packer (règle du raccord mesuré), déclarer, QA.
**Cible : 2 métiers `kind:'trade'` par stage** (aujourd'hui 8 pour 10 stages).
Puis créer les 2 derniers métiers (conducteur d'engins, technicien) et les
6 engins restants (mini-pelle st04, nacelle st06, crane_truck st07, crochet st05,
2e toupie st05).

## Vague 2 — Récupérer le travail fini qui dort

- **`feat/stage-intro-cinematics`** : revue whole-branch → gates complets →
  `sim:check` → merge. 7 commits d'une feature testée.
- **Trajets tâche 2** (`b68c704`) : committée, **jamais revue**.

## Vague 3 — Finir les lots à moitié faits

- **Trajets T3-T7** : N marcheurs par chemin · inspecteur de chemin (éditeur) ·
  **renommage Zinedine / Marius / Erling** (avec alias de compat : 19 PNJ posés
  dans la compo user) · camion 4 directions · gates.
- **Palette Étape 2** : kit de routes 256 px (droite, virage 90°, T, croisement,
  fin, diagonale × goudron/piste) + pas de grille 256 + snap.
- **Palette Étape 4** : ~110 items PixelLab (verdure, mobilier urbain, réseaux &
  stockage, engins statiques, vie de chantier, marquages, nature). **Golden batch
  par famille + gate DA AVANT production de masse** (le skill `assets` l'impose).
- **Palette Étape 5** : ~10 sections, toutes sur les 10 stages.
- **SP-T4** (assets golden manquants) · **SP-T6** (réseaux enterrés sur le plan)
  · **SP-T7** (réplication des 8 autres stages) · **SP-T8** (livraison).

## Vague 4 — La dette technique

| Dette | Nature |
|---|---|
| `carnage.spec` [mobile] **FLAKY** | Diagnostiquer. Un test intermittent érode la confiance dans toute la suite. B4 l'a vu rouge, B5 et moi verts. |
| `musicForState` retombe sur `default` | `characterSelect` / `options` gardent la faille (corrigée seulement pour `nameEntry`/`hiscores`). |
| `regenerateRegistry` sans hook Vite | La garde A5 **signale** ; un `buildStart` **supprimerait la classe de bug**. |
| `simulation.ts:713` **ment** | « terrain_vierge (obstacles=[]) → flowField null » : FAUX depuis les clusters st01. `clusters.ts:790` corrige déjà en commentaire. Induit en erreur sur le déterminisme. |
| Perf e2e élevée | Médiane 27-34 ms vs 16 de référence, p95 108-117 vs 18.8. Suspect : overlay scanlines plein écran. Seuils relâchés (`12d63ef`) pour débloquer, **jamais investigué**. |
| ~33 planches PNJ ancien format | 4 frames / 256 px, bonhomme minuscule. User : « les refaire progressivement ». |
| `MOB-LATER` | Zoom adaptatif sur petit écran PC (pointer). |
| Mix audio à l'oreille | Jamais fait. |
| `stage09/painter_work.png` | 256×256 = **1 seule frame**, inutilisable. À supprimer. |
| Double validation fin de run | A → saisie → Retour → A. Prix assumé du correctif « ne pas masquer le rapport ». **Point de playtest.** |
| `rank: -1` depuis le titre | Aucune ligne surlignée en consultation. Pas de repère visuel. |

## Vague 5 — Décision + livraison

- **Re-baseline `sim:check`** (le `+40 s` du lot collisions a une cause
  identifiée : le champ de flux fait contourner les nouveaux obstacles solides).
- Gates complets + merge `feat/editor-palette` → `main`.

---

## Contraintes permanentes (rappel)

- **Ne JAMAIS committer** : `src/content/layouts/terrain_vierge.json` ·
  `src/content/composedLayouts.ts` · `.claude/launch.json` · les `.zip` ·
  `Écran de mort.docx` · `docs/narrative/`. **`git add` par chemin explicite.**
- **`sim:check` = FAUX ROUGE** si `terrain_vierge.json` est en place → le
  déplacer + `git checkout -- composedLayouts.ts` avant, en tâche de fond (~4 min).
- **PixelLab prioritaire** pour tout visuel. **Demander la source** avant toute
  génération. **Max 10 jobs concurrents** (429). Canvas 256 ⇒ **frame_count ≤ 8**.
- **Ouvrir les PNG** — les noms de fichiers mentent (`mobile_crane.png` = une
  toupie). Vérifié 2 fois aujourd'hui.
- **Mes briefs se sont trompés 10 fois** ce jour, tous rattrapés par des agents
  qui ont vérifié au lieu d'appliquer. La consigne « signale-moi tout écart »
  vaut plus que le reste du brief.

## Ordre

Vague 1 (expire) → 2 (dort) → 4 (dette, rapide) → 3 (long : ~110 générations) → 5.

La vague 3 est la plus longue (~une demi-journée de four PixelLab). Elle passe
après la dette parce que la dette est **rapide et bloque la confiance** dans les
gates.
