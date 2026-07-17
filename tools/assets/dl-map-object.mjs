import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { homedir } from 'node:os'

/**
 * Télécharge un `map_object` PixelLab (MCP) vers un PNG, trimé à sa bounding box.
 *
 * Pourquoi ce script existe (manifest §17.5) : les URLs `api.pixellab.ai/mcp/...`
 * exigent `Authorization: Bearer <clé>` (contrairement aux URLs backblaze des
 * rotations/animations, qui sont publiques et échouent SI on ajoute le header).
 *
 * La clé n'est PAS écrite dans le dépôt : elle est lue depuis la config MCP locale
 * (`~/.claude.json`), là où l'utilisateur l'a déjà configurée. Un secret dans
 * `tools/` finirait dans git.
 *
 * Usage: node tools/assets/dl-map-object.mjs <object_id> <out.png> [pad=2]
 */

const [, , id, out, padArg] = process.argv
if (id === undefined || out === undefined) {
  console.error('usage: node dl-map-object.mjs <object_id> <out.png> [pad]')
  process.exit(2)
}
const pad = Number(padArg ?? 2)

/** Clé PixelLab depuis la config MCP locale (jamais depuis le dépôt). */
function apiKey() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'))
  for (const proj of Object.values(cfg.projects ?? {})) {
    const auth = proj?.mcpServers?.pixellab?.headers?.Authorization
    if (typeof auth === 'string' && auth.length > 0) {
      return auth
    }
  }
  throw new Error('clé PixelLab introuvable dans ~/.claude.json (mcpServers.pixellab)')
}

const r = await fetch(`https://api.pixellab.ai/mcp/map-objects/${id}/download`, {
  headers: { Authorization: apiKey() }
})
if (!r.ok) {
  console.error(`${id} -> HTTP ${r.status}`)
  process.exit(1)
}
const png = PNG.sync.read(Buffer.from(await r.arrayBuffer()))

// Trim : PixelLab centre l'art dans le canevas avec du transparent autour. Sans
// recadrage, l'échelle en jeu porte sur du vide → l'objet paraît trop petit
// (piège n°1 du golden batch, manifest §17.1).
let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 8) {
      if (x < x0) { x0 = x }
      if (x > x1) { x1 = x }
      if (y < y0) { y0 = y }
      if (y > y1) { y1 = y }
    }
  }
}
if (x1 < 0) {
  console.error(`vide (tout transparent): ${id}`)
  process.exit(1)
}
x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad)
x1 = Math.min(png.width - 1, x1 + pad); y1 = Math.min(png.height - 1, y1 + pad)
const w = x1 - x0 + 1
const h = y1 - y0 + 1

const dst = new PNG({ width: w, height: h })
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const s = ((y + y0) * png.width + (x + x0)) * 4
    const d = (y * w + x) * 4
    dst.data[d] = png.data[s]
    dst.data[d + 1] = png.data[s + 1]
    dst.data[d + 2] = png.data[s + 2]
    dst.data[d + 3] = png.data[s + 3]
  }
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, PNG.sync.write(dst))
console.log(`wrote ${out} ${w}x${h} (source ${png.width}x${png.height})`)
