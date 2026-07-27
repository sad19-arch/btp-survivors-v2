import { spawnSync } from 'node:child_process'

const PROTECTED_UNRELATED = new Set([
  'docs/game-overview-ai.md',
  'src/content/layouts/terrain_vierge.json',
  'src/content/passives.ts',
  'tests/unit/signaturePassives.test.ts'
])

const WEAPON_FILES = new Set([
  'docs/weapon-audit.md',
  'package.json',
  'src/app/app.ts',
  'src/app/seam.ts',
  'src/content/effectiveStats.ts',
  'src/content/weapons.ts',
  'src/core/events.ts',
  'src/core/simulation.ts',
  'src/core/systems/boomerang.ts',
  'src/core/systems/collision.ts',
  'src/core/systems/weapon.ts',
  'src/core/types.ts',
  'src/render/projectileRenderScale.ts',
  'src/render/projectileSpriteConfig.ts',
  'src/render/tarRenderGeometry.ts',
  'src/render/scenes/GameScene.ts',
  'src/render/scenes/hordeRenderer.ts',
  'src/render/scenes/vfxManager.ts',
  'tests/unit/knockback.test.ts',
  'tests/unit/pierce.test.ts',
  'tests/unit/projectileMods.test.ts',
  'tests/unit/weapon.test.ts',
  'tests/unit/weaponEffective.test.ts',
  'tests/unit/weaponGrid.test.ts',
  'tests/unit/weaponKinds.test.ts',
  'tests/unit/bonbonneExplosion.test.ts',
  'tests/unit/boulonsFeedback.test.ts',
  'tests/unit/brouetteRenderScale.test.ts',
  'tests/unit/cleFeedback.test.ts',
  'tests/unit/cloueurFeedback.test.ts',
  'tests/unit/coneContactFeedback.test.ts',
  'tests/unit/tarRenderGeometry.test.ts',
  'tests/unit/weaponAuditExtract.test.ts',
  'tests/unit/weaponAuditScope.test.ts',
  'tests/e2e/bonbonneExplosion.spec.ts',
  'tests/e2e/boulonsFeedback.spec.ts',
  'tests/e2e/brouetteRenderScale.spec.ts',
  'tests/e2e/cleFeedback.spec.ts',
  'tests/e2e/cloueurFeedback.spec.ts',
  'tests/e2e/coneContactFeedback.spec.ts',
  'tests/e2e/courtCircuitOwner.spec.ts',
  'tests/e2e/hammerImpactRing.spec.ts',
  'tests/e2e/piedDeBiche.spec.ts',
  'tests/e2e/sawContactFeedback.spec.ts',
  'tests/e2e/tarBoundary.spec.ts',
  'tests/e2e/weaponAuditMatrix.spec.ts',
  'tools/weapon-audit/model.ts',
  'tools/weapon-audit/run.ts',
  'tools/weapon-audit/scope.ts'
])

export interface WeaponAuditScope {
  weaponFiles: string[]
  protectedUnrelatedFiles: string[]
  unclassifiedFiles: string[]
}

export function classifyWeaponAuditScope(paths: readonly string[]): WeaponAuditScope {
  const unique = [...new Set(paths)].sort()
  return {
    weaponFiles: unique.filter((path) => WEAPON_FILES.has(path)),
    protectedUnrelatedFiles: unique.filter((path) => PROTECTED_UNRELATED.has(path)),
    unclassifiedFiles: unique.filter((path) => !WEAPON_FILES.has(path) && !PROTECTED_UNRELATED.has(path))
  }
}

function changedPaths(): string[] {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8',
    shell: false
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || 'git status a échoué')
  }
  return result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.length >= 4)
    .map((line) => line.slice(3).replaceAll('\\', '/'))
}

if (process.argv[1]?.endsWith('scope.ts') === true) {
  const scope = classifyWeaponAuditScope(changedPaths())
  process.stdout.write(`${JSON.stringify(scope, null, 2)}\n`)
  if (scope.unclassifiedFiles.length > 0) {
    process.exitCode = 1
  }
}
