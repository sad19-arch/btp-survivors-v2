# Collisions des engins et barrières — spec

**Consigne user (2026-07-16)** : « tous les engins et barrières du jeu devront
avoir des collisions ».

**⚠️ Ce lot TOUCHE LA SIMULATION.** Contrairement au reste de la journée (rendu
pur, diff 0 par construction), les collisions sont lues par `src/core`. Le jeu
change : re-baseline `sim:check` obligatoire, cibles à re-vérifier VERTES.

## Le vrai défaut : une propriété DÉDUITE au lieu d'être DÉCLARÉE

`EditorState.ts:594` :

```ts
const block = role === 'landmark' || role === 'structure' || role === 'column'
```

Le `role` vient du préfixe de la clé (`prop_` / `struct_`). Or **le préfixe
n'encode pas la solidité**. Résultat mesuré — l'éditeur se trompe sur 4 cas / 4 :

| Asset | Ce que c'est | Rôle | Éditeur déduit | Vérité (clusters.ts) |
|---|---|---|---|---|
| `prop_s2_excavator` | pelleteuse 12 t | `prop` | **passe** ❌ | `both` (circle r56) |
| `prop_s2_truck` | camion benne | `prop` | **passe** ❌ | `both` (circle r48) |
| `prop_s2_dozer` | bulldozer | `prop` | **passe** ❌ | `both` (circle r48) |
| `struct_stage03_mixer` | toupie | `structure` | **bloque** ❌ | `none` |
| `fence_panel` | clôture | `prop` | **passe** ❌ | `both` (segment) |
| `site_gate` | l'ENTRÉE | `structure` | **bloque** ❌ | `none` (voulu) |

C'est **exactement la même classe de bug** que le match de sous-chaîne
`road`/`decal` qui décidait la profondeur (corrigé ce matin par `RenderLayer`).
Même cause, même correctif : **déclarer la donnée, ne pas la deviner du nom.**

Second défaut : l'éditeur **fabrique** la forme de collision depuis l'échelle
(`EditorState.ts:607` : `r = max(16, scale*40)`) au lieu de transporter la forme
écrite. La clôture en dur est un `segment` — l'éditeur en fait un cercle.

## Incohérences dans les niveaux écrits à la main

⚠️ **Les deux tableaux ci-dessus et ci-dessous DIAGNOSTIQUENT l'état actuel — ils
ne décrivent PAS la cible.** La colonne « vérité » dit ce que `clusters.ts`
raconte aujourd'hui, y compris quand c'est faux. La cible, c'est la section
« Cible » et elle seule. Ambiguïté relevée à l'implémentation sur la toupie
(`struct_stage03_mixer`, donnée `none` par le tableau) : une toupie **est un
engin**, elle **bloque**. **Seul `site_gate` est déclaré traversable.**

La même clé se contredit d'un cluster à l'autre (mesuré) :

| Clé | État |
|---|---|
| `prop_s2_excavator` | `both`×2, **`none`×1** |
| `prop_s2_truck` | `both`×3, **`none`×1** |
| `prop_s2_dozer` | `both`×2, **`none`×1** |
| `prop_stage03_concrete_mixer` | `both`×1, **`none`×1** |
| `struct_stage03_mixer` | **`none`×2** (ne bloque jamais) |
| `fence_post` | **`none`×6** |
| `fence_panel` | `both`×10 ✅ (le seul correct) |

## Décision user : LE PORTAIL RESTE OUVERT

`site_gate` est traversable **exprès** — commentaire `clusters.ts:48` :
« anneau fence_panel (both, 5 segments, **gate sud**) ». Le portail n'est pas
une barrière oubliée, c'est **le trou** par lequel on entre dans la zone
clôturée.

**Retenu** : clôtures et engins bloquent, le portail reste le passage. Sceller
l'anneau rendrait le décor intérieur inutile et aggraverait le pile-up d'ennemis
aux clôtures (point de surveillance déjà connu).

`site_gate` est donc le **cas-test** du correctif : il prouve qu'on déclare la
solidité au lieu de la déduire — un `structure` qui NE bloque PAS.

## Cible

1. **Solidité déclarée par asset**, pas déduite du rôle ni du préfixe. Source
   unique lue par les DEUX chemins (clusters écrits à la main ET export éditeur)
   → l'éditeur ne peut plus diverger des niveaux en dur.
2. **Tous les engins bloquent** — toutes leurs occurrences, tous les stages.
3. **Toutes les barrières bloquent** — `fence_panel`, `fence_post`.
   **Sauf `site_gate`** (décision user).
4. **La forme écrite est transportée**, plus synthétisée depuis l'échelle. Une
   clôture reste un `segment`.
5. **Défaut sûr** : un asset sans déclaration garde le comportement actuel — pas
   de collision surprise sur les ~200 autres assets.

## Vérification

- **Vitest** : pour chaque clé d'engin/barrière, `collide !== 'none'` sur TOUTES
  ses occurrences (le test qu'aucune contradiction ne repasse) · `site_gate`
  reste `none` (le cas-test de la déclaration) · l'export éditeur et le cluster
  en dur donnent la MÊME solidité pour la même clé (le test qui aurait attrapé
  les 4 inversions) · la forme `segment` d'une clôture survit à l'export.
- **Gates** : tsc · lint 0 · Vitest · build · e2e (2 projets) ·
  **`sim:check` re-baseliné, cibles VERTES** (PAS diff 0 — le jeu change).
- **Oracle** : gametest user — foncer dans une pelleteuse (elle arrête), longer
  une clôture posée DANS L'ÉDITEUR (elle arrête), franchir un portail (il laisse
  passer).

## Piège connu (rappel)

`sim:check` = FAUX ROUGE si `src/content/layouts/terrain_vierge.json` (custom,
non committé) est en place. Le déplacer + `git checkout -- src/content/composedLayouts.ts`
AVANT de lancer, en tâche de fond (~4 min).
