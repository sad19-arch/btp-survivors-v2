/**
 * Phrases de mort affichées dans l'écran « Rapport de chantier ».
 *
 * Data PURE — aucun Math.random(), Date.now() ici. Le roll est fourni par
 * l'appelant (issu du Rng à seed). Sélection déterministe garantie.
 */

/** Phrase culte : affichée quand le joueur meurt après >80 % de la durée du stage. */
export const CULT_DEATH_QUOTE = 'Pas ça, pas aujourd’hui, pas après tout ce que tu as fait.'

/** Pools de phrases par palier temporel (minutes écoulées). */
export const DEATH_QUOTES: Record<
  '0_1' | '1_3' | '3_5' | '5_10' | '10_15' | '15_18',
  readonly string[]
> = {
  '0_1': [
    'Même le panneau «chantier interdit au public» a tenu plus longtemps que toi.',
    'Tu es arrivé, tu as cligné des yeux, le chantier t’a licencié.',
    'On cherchait un chef de chantier, pas une décoration de sol.',
    'Le casque était obligatoire. Le talent aussi, apparemment.',
    'Ton CDD aura duré moins longtemps qu’une pause café.',
    'Le béton n’était même pas encore sec que tu étais déjà au sol.',
    'Tu as confondu prise de poste et accident du travail.',
    'Le briefing sécurité était trop long pour toi ?',
    'Même la brouette attendait plus de toi.',
    'Le chantier a demandé ton badge. Il ne compte pas te le rendre.',
    'On note une belle entrée en scène. Dommage qu’elle soit terminée.',
    'Tu as été neutralisé avant même que les ennemis comprennent pourquoi.',
  ],
  '1_3': [
    'Trois ennemis et une pelle plus tard, te voilà légende administrative.',
    'Tu as tenu assez longtemps pour regretter d’être venu.',
    'La visite médicale va être intéressante.',
    'Le chef de chantier a vu pire. Mais pas souvent.',
    'Ton plus grand exploit : avoir lancé la partie.',
    'Le chantier t’a testé. Le chantier a rigolé.',
    'Tu as transformé une mission simple en constat d’assurance.',
    'Les ennemis n’étaient pas nombreux, mais visiblement suffisants.',
    'C’était une tentative ou une démonstration de fragilité ?',
    'Même les plots orange ont l’air plus menaçants que toi.',
    'Tu as survécu plus longtemps que prévu. Bon, on avait prévu peu.',
    'On a déjà vu des sacs de ciment plus mobiles.',
  ],
  '3_5': [
    'Tu commençais presque à ressembler à quelqu’un d’utile.',
    'Belle progression : cette fois, le chantier a dû faire un effort.',
    'Tu n’as pas gagné, mais tu as au moins sali tes chaussures.',
    'Le chantier reconnaît une tentative. Pas une réussite, une tentative.',
    'Le niveau de panique était bon. Le niveau de maîtrise, moins.',
    'Tu as dépassé l’échauffement. Pas le ridicule.',
    'Quelques ennemis neutralisés, beaucoup de dignité perdue.',
    'Le devis était prometteur. L’exécution beaucoup moins.',
    'Tu as tenu presque cinq minutes. On appelle ça un début de CV.',
    'Ton chantier avance. Ton espérance de vie, moins.',
    'Tu as fait illusion. Brièvement.',
    'On sentait une stratégie. Elle était mauvaise, mais elle existait.',
  ],
  '5_10': [
    'Là, on peut parler d’une vraie tentative. Ratée, mais vraie.',
    'Tu as passé le premier cap. Le chantier ne t’applaudit pas, mais il note.',
    'Les ennemis ont commencé à te respecter. Puis ils t’ont marché dessus.',
    'Tu as tenu assez longtemps pour que ta chute soit visible sur le planning.',
    'Pas mal. Pas bien non plus, mais pas mal.',
    'Le chantier avançait. Puis tu as servi de ralentisseur.',
    'Tu as survécu à la première vague de honte. Pas à la suivante.',
    'Le contremaître a levé un sourcil. C’est déjà beaucoup.',
    'Tu avais presque l’air compétent. Grave erreur d’interprétation.',
    'Les fondations de ta défaite sont solides.',
    'Tu as neutralisé du monde. Malheureusement, pas assez.',
    'Le chantier ne t’a pas rejeté tout de suite. C’est un progrès.',
    'On commence à voir le potentiel. Sous les gravats.',
    'Tu as fait mieux que les stagiaires. Certains stagiaires.',
    'Ce n’était plus un accident. C’était une tendance.',
  ],
  '10_15': [
    'Là, ça devient sérieux. Ta mort aussi.',
    'Tu as passé la moitié du chantier. Le respect est en cours de validation.',
    'Tu étais dans le rythme. Puis le rythme t’a quitté.',
    'Belle résistance. Dommage que le chantier ait plus d’endurance.',
    'Tu as suffisamment progressé pour rendre la défaite agaçante.',
    'On ne va pas mentir : il y avait quelque chose. Puis plus rien.',
    'Les ennemis ont dû se mettre à plusieurs. C’est presque flatteur.',
    'Tu as gagné le droit d’être déçu de toi-même.',
    'Le chantier était prenable. Pas par toi, visiblement.',
    'Ta performance mérite une mention. Pas une bonne, mais une mention.',
    'Tu as tenu assez longtemps pour que l’échec fasse mal. Excellent signe.',
    'Le chef de chantier allait presque arrêter de soupirer. Presque.',
    'Tu avais le casque, les outils, l’élan… il manquait la fin.',
    'Ce n’est plus de la nullité. C’est de la tragédie organisée.',
    'Le chantier t’a laissé espérer. Cruel, mais efficace.',
  ],
  '15_18': [
    'Ah, là c’est sale. Tu commençais vraiment à y croire.',
    'Tu as vu la ligne d’arrivée. Elle t’a vu tomber.',
    'Le chantier était presque validé. Puis tu as signé ton échec.',
    'Plus que quelques minutes. C’est précisément ce qui rend ça drôle.',
    'Tu étais proche de la gloire. Le sol aussi était proche.',
    'Là, même les ennemis ont eu un petit moment de silence.',
    'Tu n’as pas perdu tôt. Tu as perdu douloureusement.',
    'Le rapport dira : «presque compétent».',
    'Tu as construit l’espoir, puis tu l’as livré en morceaux.',
    'À ce stade, mourir devient presque artistique.',
    'Tu pouvais finir. Tu as préféré faire une démonstration de chute.',
    'Le chantier n’était plus un obstacle. C’était un test de nerfs. Raté.',
    'Tu avais fait le plus dur. C’est ça qui est magnifique.',
    'Le contremaître préparait les félicitations. Il a rangé le papier.',
    'Tu n’étais pas loin. C’est le genre de phrase qui énerve, non ?',
  ],
} as const

type PalierKey = '0_1' | '1_3' | '3_5' | '5_10' | '10_15' | '15_18'

/**
 * Sélectionne une phrase de mort de façon déterministe.
 *
 * @param elapsedSeconds     Temps écoulé en secondes dans le stage.
 * @param stageDurationSeconds Durée totale du stage en secondes.
 * @param roll               Valeur dans [0, 1[ fournie par le Rng à seed.
 * @returns La phrase sélectionnée.
 */
export function selectDeathQuote({
  elapsedSeconds,
  stageDurationSeconds,
  roll,
}: {
  elapsedSeconds: number
  stageDurationSeconds: number
  roll: number
}): string {
  const progressRatio = Math.max(0, Math.min(elapsedSeconds / stageDurationSeconds, 1))

  // Règle culte : >80 % de progression → phrase unique invariante.
  if (progressRatio > 0.8) {
    return CULT_DEATH_QUOTE
  }

  const minutes = elapsedSeconds / 60

  let key: PalierKey
  if (minutes < 1) {
    key = '0_1'
  } else if (minutes < 3) {
    key = '1_3'
  } else if (minutes < 5) {
    key = '3_5'
  } else if (minutes < 10) {
    key = '5_10'
  } else if (minutes < 15) {
    key = '10_15'
  } else {
    key = '15_18'
  }

  const pool = DEATH_QUOTES[key]
  const rawIdx = Math.floor(roll * pool.length)
  const idx = Math.max(0, Math.min(rawIdx, pool.length - 1))
  const q = pool[idx]
  if (q === undefined) {
    throw new Error(`deathQuotes: pool '${key}' index ${idx} out of bounds`)
  }
  return q
}
