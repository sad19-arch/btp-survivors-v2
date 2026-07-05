import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Télécharge une icône PixelLab (URL de rotation 64×64) vers un fichier, en
// vérifiant dimensions + transparence. Usage: node dl-icon.mjs <url> <out.png>
const [, , url, out] = process.argv
if (url === undefined || out === undefined) {
  console.error('usage: node dl-icon.mjs <url> <out.png>')
  process.exit(2)
}
const r = await fetch(url)
if (!r.ok) {
  console.error(`${url} -> ${r.status}`)
  process.exit(1)
}
const buf = Buffer.from(await r.arrayBuffer())
const png = PNG.sync.read(buf)
let hasAlpha = false
for (let i = 3; i < png.data.length; i += 4) {
  if (png.data[i] < 250) { hasAlpha = true; break }
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, buf)
console.log(`wrote ${out} ${png.width}x${png.height} alpha=${hasAlpha}`)
