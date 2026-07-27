/**
 * Calcule l'échelle purement visuelle d'un projectile.
 *
 * La Brouette suit partiellement son rayon de collision : l'exposant inférieur
 * à 1 rend la progression perceptible sans faire croître le sprite aussi vite
 * que la hitbox. Le N1 (rayon 26) et tous les autres projectiles conservent
 * exactement leur échelle configurée.
 */
export function projectileRenderScale(type: string, radius: number | undefined, configuredScale: number): number {
  if (type !== 'brouette' || radius === undefined || radius <= 0) {
    return configuredScale
  }
  return configuredScale * Math.pow(radius / 26, 0.32)
}
