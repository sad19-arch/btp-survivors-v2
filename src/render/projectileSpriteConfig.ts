export interface ProjectileSpriteConfig {
  key: string
  scale: number
  spin: boolean
  faceVel: boolean
}

/**
 * Configuration pure des sprites de projectiles.
 * Partagée par le renderer et l'extracteur d'audit pour éviter toute recopie
 * des facteurs d'échelle utilisés dans les mesures visuelles.
 */
export const PROJECTILE_SPRITE_CONFIG: Readonly<Record<string, ProjectileSpriteConfig>> = {
  scie: { key: 'proj_scie', scale: 0.8, spin: true, faceVel: false },
  cloueur: { key: 'proj_cloueur', scale: 0.8, spin: false, faceVel: true },
  mitrailleuse_clous: { key: 'proj_cloueur', scale: 0.8, spin: false, faceVel: true },
  boulons: { key: 'proj_boulons', scale: 0.68, spin: false, faceVel: true },
  tempete_boulons: { key: 'proj_boulons', scale: 0.68, spin: false, faceVel: true },
  cle_molette: { key: 'proj_cle', scale: 0.52, spin: true, faceVel: false },
  cle_choc: { key: 'proj_cle', scale: 0.58, spin: true, faceVel: false },
  brouette: { key: 'proj_brouette', scale: 0.62, spin: false, faceVel: false },
  transpalette: { key: 'proj_brouette', scale: 0.82, spin: false, faceVel: false },
  boule_feu: { key: 'proj_boule_feu', scale: 0.9, spin: true, faceVel: false },
  bonbonne_chantier: { key: 'proj_boule_feu', scale: 1.15, spin: true, faceVel: false },
  detonation_chaine: { key: 'proj_boule_feu', scale: 1.4, spin: true, faceVel: false },
  tronconneuse_chantier: { key: 'proj_scie', scale: 1.3, spin: true, faceVel: false }
}
