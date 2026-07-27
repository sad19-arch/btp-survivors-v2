import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { HITBOX } from '@content/config'
import { EVOLUTIONS } from '@content/evolutions'
import { WEAPONS, type WeaponDef, type WeaponLevel } from '@content/weapons'
import { PROJECTILE_SPRITE_CONFIG } from '@render/projectileSpriteConfig'

const ASSET_PATHS: Readonly<Record<string, string>> = {
  proj_cloueur: 'public/stage01/weapons/proj_cloueur.png',
  proj_scie: 'public/stage01/weapons/proj_scie.png',
  proj_boulons: 'public/stage01/weapons/proj_boulons.png',
  proj_cle: 'public/stage01/weapons/proj_cle.png',
  proj_brouette: 'public/stage01/weapons/proj_brouette.png',
  proj_boule_feu: 'public/shared/boule_feu.png',
  vfx_goudron: 'public/stage01/vfx/vfx_goudron.png',
  vfx_foam_cone: 'public/stage01/weapons/vfx_foam_cone.png',
  vfx_flame_cone: 'public/stage01/vfx/vfx_flame_cone.png',
  vfx_flame_lance: 'public/stage01/vfx/vfx_flame_lance.png',
  vfx_shockwave: 'public/stage01/vfx/shockwave.png',
  vfx_slash: 'public/stage01/vfx/vfx_slash.png'
}

interface OpaqueBounds {
  width: number
  height: number
}

function opaqueBounds(data: Buffer, alphaThreshold = 8): { nativeWidth: number; nativeHeight: number; opaque: OpaqueBounds } {
  const png = PNG.sync.read(data)
  let minX = png.width
  let minY = png.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(y * png.width + x) * 4 + 3] ?? 0
      if (alpha <= alphaThreshold) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return {
    nativeWidth: png.width,
    nativeHeight: png.height,
    opaque: {
      width: maxX < minX ? 0 : maxX - minX + 1,
      height: maxY < minY ? 0 : maxY - minY + 1
    }
  }
}

function derivedGeometry(def: WeaponDef, level: WeaponLevel): Record<string, number | string | undefined> {
  const projectileRadius = level.projectileRadius ?? HITBOX.projectile
  switch (def.kind) {
    case 'projectile':
      return {
        collisionRadius: projectileRadius,
        maxTravelPx: level.projectileSpeed !== undefined && level.projectileLifeMs !== undefined
          ? (level.projectileSpeed * level.projectileLifeMs) / 1000
          : undefined,
        outboundTravelPx: level.projectileSpeed !== undefined && level.boomerangOutMs !== undefined
          ? (level.projectileSpeed * level.boomerangOutMs) / 1000
          : undefined
      }
    case 'orbital':
      return {
        orbitRadius: level.orbitRadius,
        collisionRadius: level.orbitHitRadius
      }
    case 'aura':
    case 'sweep':
    case 'cone':
    case 'hazard':
      return {
        effectiveRadius: level.area + HITBOX.enemy
      }
    case 'strike':
      return {
        targetRange: level.area
      }
  }
}

function auditLevel(def: WeaponDef, level: WeaponLevel, levelNumber: number): object {
  return {
    level: levelNumber,
    ...level,
    derived: derivedGeometry(def, level)
  }
}

export function buildWeaponAuditData(workspace = process.cwd()): object {
  const bases = EVOLUTIONS.map((evolution) => {
    const base = WEAPONS[evolution.base]
    const evolved = WEAPONS[evolution.evolved]
    if (base === undefined || evolved === undefined) {
      throw new Error(`Évolution invalide : ${evolution.base} -> ${evolution.evolved}`)
    }
    if (base.levels.length !== base.maxLevel) {
      throw new Error(`${base.id}: ${base.levels.length} niveaux pour maxLevel=${base.maxLevel}`)
    }
    return {
      id: base.id,
      name: base.name,
      kind: base.kind,
      knockback: base.knockback,
      evolution: evolved.id,
      levels: base.levels.map((level, index) => auditLevel(base, level, index + 1)),
      evolvedLevel: auditLevel(evolved, evolved.levels[0] as WeaponLevel, 1)
    }
  })
  if (bases.length !== 12 || new Set(bases.map((weapon) => weapon.id)).size !== 12) {
    throw new Error(`L'audit attend 12 armes de base uniques, reçu ${bases.length}`)
  }

  const scalesByKey = new Map<string, Set<number>>()
  for (const config of Object.values(PROJECTILE_SPRITE_CONFIG)) {
    const scales = scalesByKey.get(config.key) ?? new Set<number>()
    scales.add(config.scale)
    scalesByKey.set(config.key, scales)
  }

  const assets = Object.entries(ASSET_PATHS).map(([key, relativePath]) => {
    const measured = opaqueBounds(readFileSync(resolve(workspace, relativePath)))
    return {
      key,
      path: relativePath,
      ...measured,
      configuredScales: [...(scalesByKey.get(key) ?? [])].sort((a, b) => a - b)
    }
  })

  return {
    sources: [
      'src/content/weapons.ts',
      'src/content/evolutions.ts',
      'src/content/config.ts',
      'src/render/projectileSpriteConfig.ts'
    ],
    baseWeaponCount: bases.length,
    scenarioCount: bases.length * 3,
    weapons: bases,
    assets
  }
}
