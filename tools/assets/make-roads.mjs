import { PNG } from 'pngjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * KIT DE ROUTES 256 px — compose les tuiles depuis la MATIÈRE PixelLab.
 *
 * ── Pourquoi ce script existe (et pourquoi les tuiles ne sont PAS générées
 *    directement par PixelLab, une pièce = une génération) ────────────────────
 *
 * Un kit de routes n'a qu'une seule exigence dure : le RACCORD. Deux pièces
 * voisines doivent présenter au bord partagé EXACTEMENT le même profil
 * (largeur de chaussée, largeur d'accotement, couleurs). Mesuré sur deux
 * générations `create_map_object` 256×256 lancées avec le MÊME préfixe de
 * prompt (2026-07-17) :
 *
 *   droite  : chaussée x48..208 (~160 px) · enrobé rgb(95,96,110)  · accotement
 *             gravier pâle rgb(228,215,182)
 *   « virage » : chaussée x82..172 (~90 px) · enrobé rgb(84,86,91) · accotement
 *             HERBE VERTE rgb(122,158,67)
 *
 * → 78 % d'écart de largeur, enrobé et accotement différents : AUCUN raccord
 *   possible. Le générateur rend l'ARCHÉTYPE « route » et ignore la topologie
 *   demandée (on demandait un virage 90° nord→est, il a rendu un carrefour).
 *   `create_topdown_tileset` ne répond pas non plus au besoin : c'est un Wang
 *   set À COINS (16 tuiles, 32 px max hors mode pro) — il donne une RÉGION
 *   d'enrobé, et la topologie à coins ne peut PAS porter de ligne axiale
 *   (une ligne centrale dépend de la DIRECTION de la route, pas de ses coins).
 *
 * La parade : PixelLab fournit la MATIÈRE (enrobé, gravier, terre — les vrais
 * pixels, la vraie palette), la GÉOMÉTRIE est exacte. Le raccord devient vrai
 * PAR CONSTRUCTION, pas par chance : chaque pièce est un champ de distance à un
 * axe qui traverse le bord de tuile PERPENDICULAIREMENT et CENTRÉ (x=128 ou
 * y=128). Tous les profils de bord sont donc identiques par construction.
 *
 * ── Pourquoi il n'y a PAS de pièce « diagonale » ─────────────────────────────
 * Le raccord exige une traversée perpendiculaire. À 45°, l'empreinte de la
 * chaussée sur le bord vaut 2*HALF/sin(45°) = 203,6 px au lieu de 144 : le
 * voisin ne peut pas la recevoir. Et une diagonale coin-à-coin PINCE : près du
 * coin partagé, des pixels de chaussée tombent dans les deux tuiles latérales,
 * qui sont vides → encoche en nœud papillon. Une vraie diagonale 45° demande
 * une pièce de 2 cellules, hors périmètre de ce kit.
 *
 * ── Matière ─────────────────────────────────────────────────────────────────
 * Les deux planches sources vivent dans `tools/assets/roads-src/` (hors
 * `public/` : ce sont des SOURCES, pas des assets de jeu) pour que le kit reste
 * reproductible — les objets PixelLab EXPIRENT en 8 h.
 *
 * Usage: node tools/assets/make-roads.mjs
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'roads-src')
const OUT = join(HERE, '..', '..', 'public', 'palette', 'routes')

const TILE = 256
const C = TILE / 2 // 128 — l'axe traverse toujours le bord au milieu
const ROAD_HALF = 72 // chaussée 144 px = deux voies de 72
const SHOULDER = 20 // accotement de part et d'autre
const OUTER = ROAD_HALF + SHOULDER // 92 — au-delà : transparent (le sol du stage)

// ── échantillonnage de matière ────────────────────────────────────────────────

/**
 * Miroir : évite la couture visible quand on pave un patch plus petit que la
 * tuile. À NE PAS utiliser sur une matière DÉJÀ raccordable (`seamless`) — le
 * miroir y ajouterait une SYMÉTRIE, qui se lit comme des planches.
 */
function mirrorIdx(v, n) {
  const m = ((v % (2 * n)) + 2 * n) % (2 * n)
  return m < n ? m : 2 * n - 1 - m
}

function wrapIdx(v, n) {
  return ((v % n) + n) % n
}

function loadPatch(file, x0, y0, w, h, seamless = false) {
  // Une matière peut venir du dépôt (`public/…` : les tuiles de sol du jeu, qui
  // sont raccordables PAR CONSTRUCTION) ou des sources PixelLab (`roads-src/`).
  const path = file.startsWith('public/') ? join(HERE, '..', '..', file) : join(SRC, file)
  const p = PNG.sync.read(readFileSync(path))
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y + y0) * p.width + (x + x0)) * 4
      const d = (y * w + x) * 4
      data[d] = p.data[s]
      data[d + 1] = p.data[s + 1]
      data[d + 2] = p.data[s + 2]
      data[d + 3] = 255
    }
  }
  return { w, h, data, seamless }
}

function sample(patch, x, y) {
  const idx = patch.seamless ? wrapIdx : mirrorIdx
  const i = (idx(y, patch.h) * patch.w + idx(x, patch.w)) * 4
  return [patch.data[i], patch.data[i + 1], patch.data[i + 2]]
}

/**
 * Éclaircit/assombrit SANS dérive de teinte : les 3 canaux bougent du MÊME
 * facteur. C'est la parade directe à la dérive violette de PixelLab, qui vient
 * d'une rampe d'ombre (les bruns foncés partent vers le violet) : ici, un ton
 * compacté reste EXACTEMENT la même teinte, en plus sombre.
 */
function scaleRgb(c, k) {
  const q = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  return [q(c[0]), q(c[1]), q(c[2])]
}

// ── primitives d'axe (segment / arc) ─────────────────────────────────────────
// distAndT renvoie la distance à l'axe ET l'abscisse curviligne (phase des tirets).

function seg(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  return {
    len,
    distAndT(x, y) {
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (len * len)))
      const px = x1 + t * dx
      const py = y1 + t * dy
      return { d: Math.hypot(x - px, y - py), t: t * len }
    }
  }
}

/**
 * Arc de `a0` (DÉBUT) vers `a1` (fin). L'abscisse curviligne `t` se mesure depuis
 * `a0`, PAS depuis min(a0,a1) : c'est `a0` qui porte le sens de parcours.
 *
 * Mesuré : avec `t` compté depuis min(), le virage arrivait au bord nord avec une
 * phase de 201 px au lieu de 0 — ses tirets ne tombaient pas en face de ceux
 * d'une droite voisine. Le test `roadKit` l'a attrapé (6 px d'écart sur le bord),
 * là où l'œil ne voyait qu'un virage correct.
 */
function arc(cx, cy, r, a0, a1) {
  const len = r * Math.abs(a1 - a0)
  const lo = Math.min(a0, a1)
  const hi = Math.max(a0, a1)
  return {
    len,
    distAndT(x, y) {
      const dx = x - cx
      const dy = y - cy
      const rp = Math.hypot(dx, dy)
      let a = Math.atan2(dy, dx)
      // ramène l'angle dans la fenêtre de l'arc
      while (a < lo - Math.PI) { a += 2 * Math.PI }
      while (a > lo + Math.PI) { a -= 2 * Math.PI }
      if (a >= lo && a <= hi) {
        return { d: Math.abs(rp - r), t: r * Math.abs(a - a0) }
      }
      // hors secteur : distance à l'extrémité la plus proche
      const e0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)]
      const e1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)]
      const d0 = Math.hypot(x - e0[0], y - e0[1])
      const d1 = Math.hypot(x - e1[0], y - e1[1])
      return d0 < d1 ? { d: d0, t: 0 } : { d: d1, t: len }
    }
  }
}

/**
 * Période de tirets AJUSTÉE pour qu'un nombre ENTIER de tirets tienne dans la
 * primitive : sinon les tirets ne retombent pas en face d'une tuile à l'autre
 * (256/52 n'est pas entier — le défaut invisible qui trahit un kit).
 */
function dashPeriod(len, nominal) {
  const n = Math.max(1, Math.round(len / nominal))
  return len / n
}

// ── pièces (axes) ────────────────────────────────────────────────────────────
// Toutes traversent le bord à x=128 ou y=128, perpendiculairement → raccord.

const PIECES = {
  droite: { prims: [seg(C, 0, C, TILE)] },
  // arc centré sur le coin (256,0), r=128 : tangente VERTICALE en (128,0) et
  // HORIZONTALE en (256,128) → perpendiculaire aux deux bords traversés.
  virage: { prims: [arc(TILE, 0, C, Math.PI, Math.PI / 2)] },
  te: { prims: [seg(C, 0, C, TILE), seg(C, C, TILE, C)], junction: true },
  croisement: { prims: [seg(C, 0, C, TILE), seg(0, C, TILE, C)], junction: true },
  // Cul-de-sac. La chaussée s'arrête à 150 et NON à 170 : la calotte arrondie
  // porte encore l'accotement sur OUTER (92 px), donc un axe finissant à 170
  // débordait par le bord sud (mesuré : opacité 94..161 à y=255) — la tuile
  // aurait montré un moignon de route au raccord. 150 + 92 = 242 < 256.
  fin: { prims: [seg(C, 0, C, 150)], stopBar: 138 }
}

// ── matières ─────────────────────────────────────────────────────────────────

const SURFACES = {
  // Planche PixelLab `16d0b814` : enrobé x60..124 (hors ligne axiale x126..129
  // et hors rives x48..51 / x203..208), gravier pâle x0..28.
  goudron: {
    src: 'tarmac_straight.png',
    surface: [60, 0, 64, TILE],
    shoulder: [0, 0, 28, TILE],
    // ⚠️ LARGEURS PAIRES OBLIGATOIRES — cf. `dashPeriod`/`scaleRgb` : les
    // distances à l'axe aux CENTRES de pixels sont toujours des demi-entiers
    // (0,5 · 1,5 … 64,5). Une largeur IMPAIRE met le seuil (w/2) exactement SUR
    // un centre de pixel : le trait n'existe plus qu'à la précision du flottant.
    // Mesuré : rive en w=3 (seuil 1,5) → la droite donnait d=64,5000 (trait
    // dessiné), le virage d=64,5006 (trait perdu) — 2 px d'écart au raccord pour
    // 6 dix-millièmes de pixel de courbure. En w=4 (seuil 2), les centres
    // tombent STRICTEMENT à l'intérieur : le profil est déterministe.
    marks: {
      edge: { color: [161, 160, 173], w: 4, inset: 9 },
      center: { color: [238, 237, 243], w: 4, dash: 32, on: 0.62 }
    }
  },
  // Planche PixelLab `98d2c334` : terre nue ensoleillée (cf. §3ter du manifest —
  // toute mention de « piste/route/ornière/roue » faisait rendre une VOIE FERRÉE,
  // 3 fois sur 3 ; et les tons SOMBRES virent au violet. On a donc demandé de la
  // TERRE CLAIRE, sans un seul mot de circulation).
  // Conséquence : la matière est uniforme — accotement et ornières ne peuvent pas
  // être échantillonnés, ils sont DÉRIVÉS de la surface en l'assombrissant du
  // MÊME facteur sur les 3 canaux (aucune dérive de teinte → aucun violet).
  // C'est aussi la seule façon correcte : une ornière échantillonnée serait figée
  // à la verticale, donc fausse dès le premier virage.
  // La matière fait DÉJÀ 256×256 : on l'échantillonne 1:1 (aucune répétition,
  // donc aucune couture ni symétrie de miroir — un patch de 64 px répété en
  // miroir produisait des bandes verticales qui se lisaient comme des PLANCHES).
  // Lecture d'une piste de chantier : la CHAUSSÉE est compactée (plus sombre,
  // lisse), les ACCOTEMENTS sont de la poussière meuble (plus clairs). L'inverse
  // — accotement assombri — se lisait à l'envers.
  // MATIÈRE = la tuile de SOL DU JEU (`public/stage01/ground/tile_0.png`).
  //
  // Pourquoi pas PixelLab ici, alors que le goudron en vient : 3 générations de
  // terre, 3 échecs distincts et REPRODUCTIBLES (cf. manifest §3ter) —
  // ornières VIOLETTES · VOIE FERRÉE (3 fois : « piste/ornière/roue » y mène) ·
  // ORANGE saturé. Et surtout : une piste de chantier EST la terre du site,
  // compactée. La prendre au sol du jeu garantit l'accord de palette avec le
  // terrain sur lequel elle est posée — ce qu'aucune génération séparée ne peut
  // promettre. La tuile de sol est raccordable par construction (TileSprite) →
  // `seamless: true`, pavage direct, sans miroir.
  //
  // Lecture : chaussée COMPACTÉE (assombrie) + 2 ornières, accotements en terre
  // meuble laissée CLAIRE. Le contraste vient du compactage, pas d'une teinte
  // rapportée — donc aucune dérive violette possible.
  piste: {
    src: 'public/stage01/ground/tile_0.png',
    surface: [0, 0, 64, 64],
    seamless: true,
    // Contraste RELEVÉ après planche en contexte : à 0,82/1,06 la piste se lisait
    // comme une OMBRE portée sur le sol, pas comme une voie (la DA exige une
    // lecture en 2 s). Le compactage plus marqué + une berme plus claire lui
    // donnent une silhouette propre, sans rien changer à la teinte.
    roadK: 0.78,
    shoulderK: 1.12,
    // w PAIRE (cf. la note sur les rives) : en w=9, le seuil tombait à 4,5 —
    // pile sur un centre de pixel.
    marks: { ruts: { offset: 34, w: 10, k: 0.74 } }
  }
}

// ── rendu ────────────────────────────────────────────────────────────────────

function field(prims, x, y) {
  let best = { d: Infinity, t: 0, len: 1 }
  for (const p of prims) {
    const r = p.distAndT(x, y)
    if (r.d < best.d) { best = { d: r.d, t: r.t, len: p.len } }
  }
  return best
}

function compose(pieceName, surfName, surfaceOverride) {
  const piece = PIECES[pieceName]
  const png = new PNG({ width: TILE, height: TILE })

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const o = (y * TILE + x) * 4
      // `surfaceOverride` : tuile de transition — la matière dépend de y.
      const cfg = SURFACES[surfaceOverride ? surfaceOverride(y) : surfName]
      const { d, t, len } = field(piece.prims, x + 0.5, y + 0.5)

      let rgb = null
      if (d <= ROAD_HALF) {
        rgb = scaleRgb(sample(cfg.tex.surface, x, y), cfg.roadK ?? 1)
      } else if (d <= OUTER) {
        // Accotement : soit une matière ÉCHANTILLONNÉE distincte (gravier du
        // goudron), soit la même terre laissée plus claire (piste).
        rgb = cfg.tex.shoulder !== undefined
          ? sample(cfg.tex.shoulder, x, y)
          : scaleRgb(sample(cfg.tex.surface, x, y), cfg.shoulderK ?? 1)
      } else {
        png.data[o + 3] = 0
        continue
      }

      const m = cfg.marks
      if (d <= ROAD_HALF) {
        // rives (goudron) : trait plein, continu — il suit la chaussée partout.
        if (m.edge && Math.abs(d - (ROAD_HALF - m.edge.inset)) <= m.edge.w / 2) {
          rgb = m.edge.color
        }
        // ornières (piste) : d est NON signé → une seule condition dessine les
        // DEUX ornières, symétriques par construction.
        if (m.ruts && Math.abs(d - m.ruts.offset) <= m.ruts.w / 2) {
          rgb = scaleRgb(rgb, m.ruts.k)
        }
        // ligne axiale (goudron) : tiretée, effacée dans le carrefour — comme
        // une vraie route (et sinon les deux axes se croiseraient en croix).
        if (m.center && d <= m.center.w / 2) {
          const inJunction = piece.junction === true &&
            Math.hypot(x + 0.5 - C, y + 0.5 - C) < ROAD_HALF + 10
          const per = dashPeriod(len, m.center.dash)
          if (!inJunction && (t % per) / per < m.center.on) {
            rgb = m.center.color
          }
        }
        // barre d'arrêt (cul-de-sac goudronné)
        if (piece.stopBar && m.center && Math.abs(y + 0.5 - piece.stopBar) <= 3 && d <= ROAD_HALF - 12) {
          rgb = m.center.color
        }
      }

      png.data[o] = rgb[0]
      png.data[o + 1] = rgb[1]
      png.data[o + 2] = rgb[2]
      png.data[o + 3] = 255
    }
  }
  return png
}

// ── main ─────────────────────────────────────────────────────────────────────

for (const cfg of Object.values(SURFACES)) {
  cfg.tex = {
    surface: loadPatch(cfg.src, ...cfg.surface, cfg.seamless === true),
    shoulder: cfg.shoulder !== undefined ? loadPatch(cfg.src, ...cfg.shoulder, cfg.seamless === true) : undefined
  }
}

mkdirSync(OUT, { recursive: true })
const written = []
for (const surf of Object.keys(SURFACES)) {
  for (const piece of Object.keys(PIECES)) {
    const png = compose(piece, surf)
    const file = join(OUT, `${surf}_${piece}.png`)
    writeFileSync(file, PNG.sync.write(png))
    written.push(`${surf}_${piece}.png`)
  }
}

// Tuile de JONCTION goudron→piste : le chantier commence là où l'enrobé s'arrête.
// Elle raccorde des deux côtés parce que les deux matières partagent le MÊME
// profil (ROAD_HALF/SHOULDER communs) — c'est tout l'intérêt d'un profil unique.
{
  const png = compose('droite', 'goudron', (y) => (y < C ? 'goudron' : 'piste'))
  writeFileSync(join(OUT, 'jonction_goudron_piste.png'), PNG.sync.write(png))
  written.push('jonction_goudron_piste.png')
}

console.log(`kit routes : ${written.length} tuiles ${TILE}×${TILE} -> public/palette/routes/`)
for (const w of written) { console.log('  ' + w) }
