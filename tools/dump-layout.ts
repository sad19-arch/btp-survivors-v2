import { buildSiteLayout } from '../src/core/siteLayout'
const l = buildSiteLayout(1, 10240, 7680, 'terrassement')
console.log(`clusters=${l.clusters.length} obstacles=${l.obstacles.length}`)
for (const c of l.clusters) {
  console.log(`${c.defId}\t${Math.round(c.x)}\t${Math.round(c.y)}`)
}
