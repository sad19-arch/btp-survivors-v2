/** Ce dont le podium a besoin d'un joueur — volontairement minimal. */
export interface PodiumEntry {
  id: number
  kills: number
}

export interface Podium {
  /** Joueur au plus grand nombre de kills (trophée). */
  bestId: number
  /** Joueur au plus petit nombre de kills (croix rouge). */
  worstId: number
}

/**
 * Désigne le meilleur et le pire tueur de la run.
 *
 * Renvoie `null` — donc ni trophée ni croix — dans deux cas :
 * - moins de 2 joueurs : en solo, le même joueur serait à la fois le meilleur
 *   et le pire ;
 * - **égalité parfaite** : si tout le monde a le même score, désigner un « pire »
 *   reviendrait à se moquer d'un joueur aussi bon que le gagnant.
 *
 * Les ex æquo sont départagés par id croissant (J1 avant J2), ce qui rend la
 * fonction déterministe quel que soit l'ordre du tableau d'entrée.
 *
 * Pure : ne trie pas le tableau reçu, ne lit ni horloge ni aléa.
 */
export function selectPodium(entries: readonly PodiumEntry[]): Podium | null {
  if (entries.length < 2) {
    return null
  }

  let best = entries[0]
  let worst = entries[0]
  if (best === undefined || worst === undefined) {
    return null
  }

  for (const entry of entries) {
    // `>` / `<` stricts + parcours par id croissant : le premier id gagne les ex æquo.
    if (entry.kills > best.kills || (entry.kills === best.kills && entry.id < best.id)) {
      best = entry
    }
    if (entry.kills < worst.kills || (entry.kills === worst.kills && entry.id < worst.id)) {
      worst = entry
    }
  }

  if (best.kills === worst.kills) {
    return null
  }
  return { bestId: best.id, worstId: worst.id }
}
