import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

// Rend transparent le FOND opaque connexe aux bords (certaines générations de
// gros objets peignent une dalle grise sous le véhicule). Flood-fill 4-connexe
// depuis tous les pixels de bord dont la couleur ≈ la couleur de coin (0,0),
// tolérance `tol`. L'intérieur de l'objet (couleurs différentes ou non connexes
// au bord) est préservé.
//
// Usage: node dekey-bg.mjs <in.png> <out.png> [tol=28]
const [, , inp, outp, tolArg] = process.argv
const tol = Number(tolArg ?? 28)
const png = PNG.sync.read(readFileSync(inp))
const { width: W, height: H, data } = png

const br = data[0]
const bg = data[1]
const bb = data[2]
const near = (i) => {
  const dr = data[i] - br
  const dg = data[i + 1] - bg
  const db = data[i + 2] - bb
  return dr * dr + dg * dg + db * db <= tol * tol
}

const seen = new Uint8Array(W * H)
const stack = []
const push = (x, y) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const p = y * W + x
  if (seen[p]) return
  seen[p] = 1
  stack.push(p)
}
for (let x = 0; x < W; x++) {
  push(x, 0)
  push(x, H - 1)
}
for (let y = 0; y < H; y++) {
  push(0, y)
  push(W - 1, y)
}
let cleared = 0
while (stack.length > 0) {
  const p = stack.pop()
  const i = p * 4
  if (data[i + 3] === 0) continue
  if (!near(i)) continue
  data[i + 3] = 0
  cleared++
  const x = p % W
  const y = (p - x) / W
  push(x - 1, y)
  push(x + 1, y)
  push(x, y - 1)
  push(x, y + 1)
}
writeFileSync(outp, PNG.sync.write(png))
console.log(`${outp}: fond retiré (${cleared} px, bg=${br},${bg},${bb}, tol=${tol})`)
