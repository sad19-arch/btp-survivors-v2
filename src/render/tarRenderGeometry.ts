export interface TarRenderGeometry {
  spriteScale: number
  boundaryRadius: number
  opaqueWidth: number
  opaqueHeight: number
}

// Mesures des pixels opaques de public/stage01/weapons/vfx_goudron.png.
const TAR_OPAQUE_WIDTH = 139
const TAR_OPAQUE_HEIGHT = 121

/**
 * Géométrie pure du Goudron : le sprite conserve son ratio et sa mise à
 * l'échelle historique, tandis que la frontière rend le rayon de simulation
 * exact. Les dimensions opaques servent de preuve mesurable de la marge.
 */
export function tarRenderGeometry(radius: number, textureWidth: number): TarRenderGeometry {
  if (radius <= 0 || textureWidth <= 0) {
    throw new Error('Tar render geometry requires positive dimensions')
  }
  const spriteScale = (radius * 2) / textureWidth
  return {
    spriteScale,
    boundaryRadius: radius,
    opaqueWidth: TAR_OPAQUE_WIDTH * spriteScale,
    opaqueHeight: TAR_OPAQUE_HEIGHT * spriteScale
  }
}
