/**
 * Fonctions PURES pour les PNJ d'ambiance non-hostiles (vie du chantier).
 * Aucun RNG runtime, aucun import Phaser, aucun import src/core → reproductible
 * et testable en Vitest sans DOM. Phase B2 de la feature « vie du chantier ».
 *
 * Historique : ce module portait aussi l'errance Lissajous (`ambientOffset`) et
 * les répliques de râlerie (`pickPhrase`/`NAG_PHRASES`) du PREMIER système de
 * PNJ. Ce système a été retiré (un seul système de PNJ par plan de chantier :
 * les SiteWorkers) et les répliques sont passées à `@content/npcDialogues` :
 * les trois exports étaient morts (zéro appelant hors tests) et ont été
 * supprimés. Ne subsiste que le test de proximité des bulles.
 */

/** Renvoie true si le joueur est assez proche pour déclencher une bulle de râlerie. */
export function shouldBubble(playerDist: number): boolean {
  return playerDist <= 150
}
