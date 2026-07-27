/**
 * Calcule l'échelle purement visuelle d'un projectile.
 *
 * Les armes orbitales suivent exactement leur hitbox. La Brouette suit
 * partiellement son rayon : sa silhouette progresse sans grossir aussi vite
 * que sa collision.
 */
export function projectileRenderScale(type: string, radius: number | undefined, configuredScale: number): number {
  const orbitalBaseRadius = type === 'scie'
    ? 22
    : type === 'tronconneuse_chantier'
      ? 26
      : undefined
  if (orbitalBaseRadius !== undefined && radius !== undefined && radius > 0) {
    return configuredScale * (radius / orbitalBaseRadius)
  }
  if (type !== 'brouette' || radius === undefined || radius <= 0) {
    return configuredScale
  }
  return configuredScale * Math.pow(radius / 26, 0.32)
}
