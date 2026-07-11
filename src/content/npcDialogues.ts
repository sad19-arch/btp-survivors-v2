/**
 * Dialogues PNJ — humour rétro-râleur (sans grossièreté).
 *
 * Contenu PUR + sélecteur déterministe : aucun import Phaser/DOM, aucun
 * `Math.random`/`Date.now` (règle déterminisme `src/content`). Deux familles :
 *  - `npcJobDialogues`      : PNJ métiers (blasés, moqueurs, obsédés par le planning)
 *  - `npcCivilianDialogues` : PNJ lambda (panique, accident du travail, méta rétro)
 *
 * Le rendu (bulles) vit côté `src/render` et n'utilise que `pickNpcLine`.
 */

export type NpcDialogueType = 'job' | 'civilian'
export type NpcDialogueMood = 'mocking' | 'busy' | 'panic' | 'absurd' | 'bureaucratic' | 'retro'
export type NpcDialogueTrigger = 'near_player' | 'monster_near' | 'idle' | 'running_away' | 'stage_start'

/** Une réplique PNJ filtrable par type / stage / trigger / mood. */
export interface NpcDialogueLine {
  readonly id: string
  readonly text: string
  readonly npcType: NpcDialogueType
  /** Stages concernés (ids de phase). Absent = réplique globale (tous stages). */
  readonly stages?: readonly string[]
  readonly mood?: NpcDialogueMood
  /** Contexte de déclenchement. Absent = utilisable sur n'importe quel trigger. */
  readonly trigger?: NpcDialogueTrigger
  readonly weight?: number
}

// Builders internes (réduisent le bruit ; ne changent pas la structure exposée).
type Opts = Omit<NpcDialogueLine, 'id' | 'text' | 'npcType'>
const job = (id: string, text: string, o: Opts = {}): NpcDialogueLine => ({ id, text, npcType: 'job', ...o })
const civ = (id: string, text: string, o: Opts = {}): NpcDialogueLine => ({ id, text, npcType: 'civilian', ...o })

// Ids de stage (source : src/audio/manifest.ts STAGE_MUSIC), pour typo-safety.
const S = {
  terrain: 'terrain_vierge',
  terrassement: 'terrassement',
  fondations: 'fondations',
  reseaux: 'reseaux_enterres',
  grosOeuvre: 'gros_oeuvre',
  echafaudages: 'echafaudages',
  charpente: 'charpente_toiture',
  secondOeuvre: 'second_oeuvre',
  finitions: 'finitions',
  livraison: 'livraison_audit'
} as const

// ─────────────────────────────────────────────────────────────────────────────
// PNJ métiers
// ─────────────────────────────────────────────────────────────────────────────

const JOB_GLOBAL: readonly NpcDialogueLine[] = [
  job('job_g1', 'Tu appelles ça un monstre ? Moi j’appelle ça une réunion debout.', { mood: 'mocking' }),
  job('job_g2', 'Attention, tu vas transpirer. Dommage, on n’a pas prévu le budget.', { mood: 'mocking' }),
  job('job_g3', 'J’ai vu des plannings plus dangereux que ces bestioles.', { mood: 'mocking' }),
  job('job_g4', 'Le vrai boss final, c’est toujours le délai.', { mood: 'busy' }),
  job('job_g5', 'Si tu pouvais survivre en silence, j’ai un chantier à finir.', { mood: 'busy' }),
  job('job_g6', 'Encore une pause ? On va finir par te mettre dans le mobilier urbain.', { mood: 'mocking' }),
  job('job_g7', 'Ce monstre a le pathfinding d’une brouette sans roue.', { mood: 'retro' }),
  job('job_g8', 'Tu paniques beaucoup pour quelqu’un qui a une barre de vie.', { mood: 'retro' }),
  job('job_g9', 'Moi aussi je combats des monstres : ça s’appelle les imprévus.', { mood: 'busy' }),
  job('job_g10', 'Si ça te paraît dur, attends de voir le compte rendu de chantier.', { mood: 'bureaucratic' }),
  job('job_g11', 'On n’arrête pas un chantier pour trois pixels agressifs.', { mood: 'retro' }),
  job('job_g12', 'Bouge un peu, tu fais de l’ombre à la productivité.', { mood: 'mocking' }),
  job('job_g13', 'Ce n’est pas un niveau difficile, c’est juste mal expliqué.', { mood: 'retro' }),
  job('job_g14', 'Je travaille, moi. Je ne fais pas une démo jouable.', { mood: 'retro' }),
  job('job_g15', 'Le bouton facile ? Il est dans un autre corps de métier.', { mood: 'mocking' }),
  job('job_g16', 'J’ai survécu à des réunions de coordination. Tes monstres me font sourire.', { mood: 'mocking' }),
  job('job_g17', 'La peur, c’est comme le béton : mal dosée, ça fissure.', { mood: 'absurd' }),
  job('job_g18', 'Reviens quand tu auras débloqué la compétence “ponctualité”.', { mood: 'retro' }),
  job('job_g19', 'Des monstres ? Parfait, ils porteront peut-être les charges.', { mood: 'absurd' }),
  job('job_g20', 'On dirait un vieux jeu dont le manuel a fui à la pause café.', { mood: 'retro' }),
  job('job_g21', 'Si tu veux aider, tiens au moins le mètre droit.', { mood: 'busy' }),
  job('job_g22', 'Même le panneau de chantier a l’air plus concentré que toi.', { mood: 'mocking' }),
  job('job_g23', 'Ce chantier avance plus vite que ta prise de décision.', { mood: 'mocking' }),
  job('job_g24', 'Ce monstre ? Je lui donne deux jours avant de demander un badge.', { mood: 'bureaucratic' }),
  job('job_g25', 'Si je m’arrête à chaque attaque, on livre en 2048.', { mood: 'busy' }),
  job('job_g26', 'Ça court, ça crie... On dirait une livraison de matériaux.', { mood: 'absurd' }),
  job('job_g27', 'Tes esquives ont le charme d’une notice traduite trop vite.', { mood: 'retro' }),
  job('job_g28', 'L’héroïsme, c’est bien. Le port des EPI, c’est mieux.', { mood: 'bureaucratic' }),
  job('job_g29', 'Un survivant ? Va survivre près du stock, ça m’arrange.', { mood: 'busy' }),
  job('job_g30', 'Le chantier ne se finira pas avec des commentaires dramatiques.', { mood: 'mocking' })
]

const JOB_STAGE: readonly NpcDialogueLine[] = [
  // Stage 01 — terrain vierge
  job('job_s01_1', 'Le terrain est vierge, pas ton emploi du temps. Va bosser.', { stages: [S.terrain] }),
  job('job_s01_2', 'Je borne le terrain. Toi, tu bornes ma patience.', { stages: [S.terrain] }),
  job('job_s01_3', 'Un monstre ? Il tiendra peut-être la mire plus droit que toi.', { stages: [S.terrain] }),
  job('job_s01_4', 'Le vrai danger ici, c’est de mal planter un piquet.', { stages: [S.terrain] }),
  job('job_s01_5', 'Tu veux aider ? Commence par ne pas marcher sur les repères.', { stages: [S.terrain] }),
  job('job_s01_6', 'J’ai vu des terrains vagues avec plus d’initiative.', { stages: [S.terrain] }),
  job('job_s01_7', 'On n’a pas commencé et tu prends déjà une pause héroïque.', { stages: [S.terrain] }),
  job('job_s01_8', 'Le permis est affiché. Ton courage, lui, est en attente.', { stages: [S.terrain] }),
  job('job_s01_9', 'Si le géomètre tremble, c’est à cause de tes trajectoires.', { stages: [S.terrain] }),
  job('job_s01_10', 'Les monstres peuvent attendre, j’ai une implantation à finir.', { stages: [S.terrain] }),
  job('job_s01_11', 'Ce terrain a plus de potentiel que ton sens de l’orientation.', { stages: [S.terrain] }),
  job('job_s01_12', 'Ne touche pas aux piquets, c’est le seul truc aligné du niveau.', { stages: [S.terrain] }),
  // Stage 02 — terrassement
  job('job_s02_1', 'Un trou, ça se respecte. Contrairement à ta gestion du danger.', { stages: [S.terrassement] }),
  job('job_s02_2', 'La pelleteuse creuse mieux que toi tu réfléchis.', { stages: [S.terrassement] }),
  job('job_s02_3', 'Les déblais ? C’est là que finissent les mauvaises idées.', { stages: [S.terrassement] }),
  job('job_s02_4', 'Même le camion-benne sait où il va. Inspire-toi.', { stages: [S.terrassement] }),
  job('job_s02_5', 'Ce monstre ? On le met dans le remblai, personne ne verra rien.', { stages: [S.terrassement] }),
  job('job_s02_6', 'Le sol s’affaisse moins vite que ton moral.', { stages: [S.terrassement] }),
  job('job_s02_7', 'On appelle ça du terrassement, pas une chorégraphie de panique.', { stages: [S.terrassement] }),
  job('job_s02_8', 'Si tu tombes dans la fosse, je note ça comme un test terrain.', { stages: [S.terrassement] }),
  job('job_s02_9', 'J’ai vu des gravats avec plus de coordination.', { stages: [S.terrassement] }),
  job('job_s02_10', 'La boue ralentit tout le monde. Toi, tu étais déjà équipé.', { stages: [S.terrassement] }),
  job('job_s02_11', 'Reste hors de la trajectoire du camion et de tes bévues.', { stages: [S.terrassement] }),
  job('job_s02_12', 'Le chantier avance. Toi, tu fais des cercles.', { stages: [S.terrassement] }),
  // Stage 03 — fondations
  job('job_s03_1', 'Les fondations doivent être solides. Contrairement à ton mental.', { stages: [S.fondations] }),
  job('job_s03_2', 'Le béton prend plus vite que tes décisions.', { stages: [S.fondations] }),
  job('job_s03_3', 'Ne marche pas dans le béton frais, même le monstre a compris.', { stages: [S.fondations] }),
  job('job_s03_4', 'La pompe coule droit. Toi, tu cours en zigzag.', { stages: [S.fondations] }),
  job('job_s03_5', 'Le coffrage tient mieux la pression que toi.', { stages: [S.fondations] }),
  job('job_s03_6', 'On coule une dalle, pas une larme. Concentre-toi.', { stages: [S.fondations] }),
  job('job_s03_7', 'Si tu veux être utile, vibre moins que la règle.', { stages: [S.fondations] }),
  job('job_s03_8', 'Le ferraillage est organisé. C’est possible, tu vois ?', { stages: [S.fondations] }),
  job('job_s03_9', 'Le vrai monstre, c’est une fondation mal alignée.', { stages: [S.fondations] }),
  job('job_s03_10', 'La toupie tourne, le chantier avance, et toi tu commentes.', { stages: [S.fondations] }),
  job('job_s03_11', 'Même la fissure a l’air plus stable que ton plan.', { stages: [S.fondations] }),
  job('job_s03_12', 'Tu appelles ça une invasion ? J’appelle ça un aléa de coulage.', { stages: [S.fondations] }),
  // Stage 04 — réseaux enterrés
  job('job_s04_1', 'Ne coupe pas les câbles. Ils sont plus utiles que tes conseils.', { stages: [S.reseaux] }),
  job('job_s04_2', 'Une tranchée, ça se suit. Pas comme tes trajectoires.', { stages: [S.reseaux] }),
  job('job_s04_3', 'Eau et électricité mélangées ? Même le jeu lève un sourcil.', { stages: [S.reseaux] }),
  job('job_s04_4', 'Le réseau est enterré, pas ton sens pratique. J’espère.', { stages: [S.reseaux] }),
  job('job_s04_5', 'Ce touret a plus de charisme que ton esquive.', { stages: [S.reseaux] }),
  job('job_s04_6', 'Les gaines vont dans la tranchée, les héros loin des ennuis.', { stages: [S.reseaux] }),
  job('job_s04_7', 'Ne saute pas dans le regard. Ce n’est pas un passage secret.', { stages: [S.reseaux] }),
  job('job_s04_8', 'J’ai vu des câbles emmêlés avec une meilleure stratégie.', { stages: [S.reseaux] }),
  job('job_s04_9', 'Le boss réseaux ? C’est toujours celui qui a perdu le plan.', { stages: [S.reseaux] }),
  job('job_s04_10', 'Tu veux aider ? Tiens la gaine, pas un discours.', { stages: [S.reseaux] }),
  job('job_s04_11', 'Ce monstre avance comme un câble qu’on tire trop vite.', { stages: [S.reseaux] }),
  job('job_s04_12', 'Le chantier est souterrain. Ta panique, elle, est bien visible.', { stages: [S.reseaux] }),
  // Stage 05 — gros œuvre
  job('job_s05_1', 'Les murs montent. Ton utilité cherche encore l’escalier.', { stages: [S.grosOeuvre] }),
  job('job_s05_2', 'Le parpaing est plus stable émotionnellement que toi.', { stages: [S.grosOeuvre] }),
  job('job_s05_3', 'Attention au crochet, il vise mieux que ton plan de survie.', { stages: [S.grosOeuvre] }),
  job('job_s05_4', 'La grue travaille. Toi, tu fais la météo des problèmes.', { stages: [S.grosOeuvre] }),
  job('job_s05_5', 'On empile des blocs, pas des excuses.', { stages: [S.grosOeuvre] }),
  job('job_s05_6', 'Ce mur a plus de tenue que ta stratégie.', { stages: [S.grosOeuvre] }),
  job('job_s05_7', 'Une palette, ce n’est pas un bouclier. Ne confonds pas.', { stages: [S.grosOeuvre] }),
  job('job_s05_8', 'Le mortier colle. Tes décisions, beaucoup moins.', { stages: [S.grosOeuvre] }),
  job('job_s05_9', 'Le gros œuvre, c’est lourd. Mais moins que ton improvisation.', { stages: [S.grosOeuvre] }),
  job('job_s05_10', 'Même la poussière de béton sait où se poser.', { stages: [S.grosOeuvre] }),
  job('job_s05_11', 'On construit un bâtiment, pas une collection de détours.', { stages: [S.grosOeuvre] }),
  job('job_s05_12', 'Le boss final ici, c’est l’aplomb. Et il te juge.', { stages: [S.grosOeuvre] }),
  // Stage 06 — échafaudages
  job('job_s06_1', 'Ne secoue pas l’échafaudage, il a déjà assez vu.', { stages: [S.echafaudages] }),
  job('job_s06_2', 'Tu as peur du vide ? Regarde le planning, c’est pire.', { stages: [S.echafaudages] }),
  job('job_s06_3', 'Les boulons tiennent mieux leur rôle que certains survivants.', { stages: [S.echafaudages] }),
  job('job_s06_4', 'L’échelle monte. Toi, tu descends en crédibilité.', { stages: [S.echafaudages] }),
  job('job_s06_5', 'Les garde-corps protègent ceux qui ne testent pas la gravité.', { stages: [S.echafaudages] }),
  job('job_s06_6', 'Un monstre grimpe ? Qu’il respecte le sens de circulation.', { stages: [S.echafaudages] }),
  job('job_s06_7', 'Le tube est droit. Fais-en une philosophie.', { stages: [S.echafaudages] }),
  job('job_s06_8', 'Si tu tombes, je note : test de charge dynamique.', { stages: [S.echafaudages] }),
  job('job_s06_9', 'Même le platelage a moins de jeu que cette interface.', { stages: [S.echafaudages] }),
  job('job_s06_10', 'La hauteur, ça se prépare. La panique, apparemment non.', { stages: [S.echafaudages] }),
  job('job_s06_11', 'Je monte l’échafaudage, toi tu montes la tension.', { stages: [S.echafaudages] }),
  job('job_s06_12', 'Ce niveau a plus de verticalité que ton plan.', { stages: [S.echafaudages] }),
  // Stage 07 — charpente / toiture
  job('job_s07_1', 'Les chevrons sont alignés. C’est beau, quelque chose d’aligné.', { stages: [S.charpente] }),
  job('job_s07_2', 'Les tuiles rouges, c’est pour le toit, pas tes regrets.', { stages: [S.charpente] }),
  job('job_s07_3', 'La charpente tient. J’aimerais en dire autant de ton sang-froid.', { stages: [S.charpente] }),
  job('job_s07_4', 'Ne passe pas sous la charge suspendue, même le monstre hésite.', { stages: [S.charpente] }),
  job('job_s07_5', 'Le bois travaille. Toi, tu négocies avec la panique.', { stages: [S.charpente] }),
  job('job_s07_6', 'Si tu entends craquer, espère que ce n’est pas ton plan.', { stages: [S.charpente] }),
  job('job_s07_7', 'Le couvreur couvre. Le héros découvre les problèmes.', { stages: [S.charpente] }),
  job('job_s07_8', 'Une gouttière a une direction. C’est inspirant, non ?', { stages: [S.charpente] }),
  job('job_s07_9', 'Le toit avance. Tes chances aussi, mais dans l’autre sens.', { stages: [S.charpente] }),
  job('job_s07_10', 'J’ai vu des chevrons mieux préparés au combat.', { stages: [S.charpente] }),
  job('job_s07_11', 'Le boss toiture ? La gravité avec une barre de vie.', { stages: [S.charpente] }),
  job('job_s07_12', 'La sciure vole, mais au moins elle sait pourquoi.', { stages: [S.charpente] }),
  // Stage 08 — second œuvre
  job('job_s08_1', 'La cloison sépare les pièces. Pas les bonnes idées des mauvaises.', { stages: [S.secondOeuvre] }),
  job('job_s08_2', 'Les câbles passent dans les gaines, pas dans ton champ de vision.', { stages: [S.secondOeuvre] }),
  job('job_s08_3', 'Le placo est fragile, mais moins que ton plan d’attaque.', { stages: [S.secondOeuvre] }),
  job('job_s08_4', 'Je tire des câbles, toi tu tires la situation vers le bas.', { stages: [S.secondOeuvre] }),
  job('job_s08_5', 'Le tableau électrique a plus de logique que ce niveau.', { stages: [S.secondOeuvre] }),
  job('job_s08_6', 'Les tuyaux PVC ont une meilleure trajectoire que toi.', { stages: [S.secondOeuvre] }),
  job('job_s08_7', 'Ne pose pas les plaques sur les monstres. Tentant, mais non.', { stages: [S.secondOeuvre] }),
  job('job_s08_8', 'Le second œuvre, c’est précis. Le chaos, c’est ton option.', { stages: [S.secondOeuvre] }),
  job('job_s08_9', 'Si ça clignote, ce n’est pas forcément une bonne nouvelle.', { stages: [S.secondOeuvre] }),
  job('job_s08_10', 'Ce mur en placo a l’air plus confiant que toi.', { stages: [S.secondOeuvre] }),
  job('job_s08_11', 'Je cloisonne. Toi, tu décloisonnes les catastrophes.', { stages: [S.secondOeuvre] }),
  job('job_s08_12', 'Le vrai danger ici, c’est un câble non repéré. Et toi.', { stages: [S.secondOeuvre] }),
  // Stage 09 — finitions
  job('job_s09_1', 'Attention à la peinture fraîche, elle a plus de dignité que cette fuite.', { stages: [S.finitions] }),
  job('job_s09_2', 'Les finitions, c’est quand on voit toutes les erreurs. Toutes.', { stages: [S.finitions] }),
  job('job_s09_3', 'Ne marche pas sur la bâche, elle n’a rien demandé.', { stages: [S.finitions] }),
  job('job_s09_4', 'Le rouleau avance plus droit que ton courage.', { stages: [S.finitions] }),
  job('job_s09_5', 'Ce carrelage est presque droit. Ne respire pas trop fort.', { stages: [S.finitions] }),
  job('job_s09_6', 'On pose du propre. Essaie de ne pas importer le chaos.', { stages: [S.finitions] }),
  job('job_s09_7', 'Les gouttes de peinture sont les ennemis naturels du devis.', { stages: [S.finitions] }),
  job('job_s09_8', 'Le coin fini est plus fini que ton tutoriel.', { stages: [S.finitions] }),
  job('job_s09_9', 'Si tu taches le mur, je te classe en malfaçon mobile.', { stages: [S.finitions] }),
  job('job_s09_10', 'Les finitions, c’est calme. Enfin, c’était l’idée.', { stages: [S.finitions] }),
  job('job_s09_11', 'Le pinceau sait ce qu’il fait. C’est agréable à voir.', { stages: [S.finitions] }),
  job('job_s09_12', 'Le boss finitions ? Une trace au mur que personne n’assume.', { stages: [S.finitions] }),
  // Stage 10 — livraison / audit
  job('job_s10_1', 'L’audit arrive. Les monstres peuvent prendre un ticket.', { stages: [S.livraison] }),
  job('job_s10_2', 'Le bâtiment est livré, mais ta méthode est encore en chantier.', { stages: [S.livraison] }),
  job('job_s10_3', 'La conformité, c’est comme l’esquive : ça se prépare avant.', { stages: [S.livraison] }),
  job('job_s10_4', 'Ne touche pas au ruban, il est plus officiel que toi.', { stages: [S.livraison] }),
  job('job_s10_5', 'Ce fourgon d’inspection a senti le problème à 300 mètres.', { stages: [S.livraison] }),
  job('job_s10_6', 'Une fissure orange ? Non, je n’ai rien vu. Enfin presque.', { stages: [S.livraison] }),
  job('job_s10_7', 'Le vrai boss final, c’est le procès-verbal.', { stages: [S.livraison] }),
  job('job_s10_8', 'Souris, on est en réception. Même les monstres font semblant.', { stages: [S.livraison] }),
  job('job_s10_9', 'Le panneau conforme tremble un peu, mais il fait son travail.', { stages: [S.livraison] }),
  job('job_s10_10', 'Si l’auditeur demande, tu étais une animation de prévention.', { stages: [S.livraison] }),
  job('job_s10_11', 'On livre aujourd’hui. Les créatures, c’est dans les réserves.', { stages: [S.livraison] }),
  job('job_s10_12', 'Le chantier est fini. Ta panique fait des heures sup.', { stages: [S.livraison] })
]

const JOB_SHORT: readonly NpcDialogueLine[] = [
  job('job_sh1', 'Retourne bosser.', { weight: 2 }),
  job('job_sh2', 'Pas le temps.', { weight: 2 }),
  job('job_sh3', 'J’ai un chantier, moi.', { weight: 2 }),
  job('job_sh4', 'Ça passe large.', { weight: 2 }),
  job('job_sh5', 'Fragile, va.', { weight: 2 }),
  job('job_sh6', 'Respire moins fort.', { weight: 2 }),
  job('job_sh7', 'Le planning d’abord.', { weight: 2 }),
  job('job_sh8', 'Même pas peur.', { weight: 2 }),
  job('job_sh9', 'Pas mon lot.', { weight: 2 }),
  job('job_sh10', 'Je facture l’attente.', { weight: 2 }),
  job('job_sh11', 'Bel essai. Non.', { weight: 2 }),
  job('job_sh12', 'Tu gênes la vue.', { weight: 2 }),
  job('job_sh13', 'Travail en cours.', { weight: 2 }),
  job('job_sh14', 'Gaffe au marquage.', { weight: 2 }),
  job('job_sh15', 'Tu dramatises.', { weight: 2 }),
  job('job_sh16', 'J’ai vu pire.', { weight: 2 }),
  job('job_sh17', 'Ça manque d’aplomb.', { weight: 2 }),
  job('job_sh18', 'On avance. Toi aussi ?', { weight: 2 }),
  job('job_sh19', 'Le chantier juge.', { weight: 2 }),
  job('job_sh20', 'Très artistique. Inutile.', { weight: 2 })
]

const JOB_MONSTER: readonly NpcDialogueLine[] = [
  job('job_m1', 'Il est derrière toi. Et moi je suis derrière mon planning.', { trigger: 'monster_near' }),
  job('job_m2', 'Ce monstre n’a pas de badge, donc il attend dehors.', { trigger: 'monster_near' }),
  job('job_m3', 'Dis-lui de ne pas marcher sur mes repères.', { trigger: 'monster_near' }),
  job('job_m4', 'S’il casse le coffrage, je le classe en sous-traitant.', { trigger: 'monster_near' }),
  job('job_m5', 'Même son attaque n’est pas aux normes.', { trigger: 'monster_near' }),
  job('job_m6', 'Il grogne beaucoup pour quelqu’un sans bon de commande.', { trigger: 'monster_near' }),
  job('job_m7', 'Il arrive ? Très bien, qu’il prenne un casque.', { trigger: 'monster_near' }),
  job('job_m8', 'Je ne bouge pas. J’ai presque fini cette animation.', { trigger: 'monster_near' }),
  job('job_m9', 'Un monstre sans plan de prévention ? Audacieux.', { trigger: 'monster_near' }),
  job('job_m10', 'Il peut attaquer après ma pause réglementaire.', { trigger: 'monster_near' })
]

/** PNJ métiers — pool complet (globales + par stage + courtes + monstre proche). */
export const npcJobDialogues: readonly NpcDialogueLine[] = [
  ...JOB_GLOBAL,
  ...JOB_STAGE,
  ...JOB_SHORT,
  ...JOB_MONSTER
]

// ─────────────────────────────────────────────────────────────────────────────
// PNJ lambda
// ─────────────────────────────────────────────────────────────────────────────

const CIV_GLOBAL: readonly NpcDialogueLine[] = [
  civ('civ_g1', 'Pourquoi il y a une barre de vie sur mon chantier ?', { mood: 'absurd' }),
  civ('civ_g2', 'Je n’ai pas signé pour un mode survie !', { mood: 'panic' }),
  civ('civ_g3', 'Je veux parler au responsable du tutoriel !', { mood: 'retro' }),
  civ('civ_g4', 'Si ça, ce n’est pas un accident du travail, je mange le registre !', { mood: 'bureaucratic' }),
  civ('civ_g5', 'Je vais me mettre en sécurité... très loin... dans un autre jeu.', { mood: 'retro' }),
  civ('civ_g6', 'Quelqu’un a coché “monstres” dans le PPSPS ?', { mood: 'bureaucratic' }),
  civ('civ_g7', 'Je suis venu visiter, pas débloquer un succès secret !', { mood: 'retro' }),
  civ('civ_g8', 'La sortie, elle est où ? Et pourquoi elle bouge ?', { mood: 'panic' }),
  civ('civ_g9', 'Ce n’était pas dans la fiche de poste !', { mood: 'bureaucratic' }),
  civ('civ_g10', 'À l’aide ! Je suis décoratif mais pas invincible !', { mood: 'panic' }),
  civ('civ_g11', 'Je vais remplir un formulaire de panique en trois exemplaires !', { mood: 'bureaucratic' }),
  civ('civ_g12', 'Il y a un protocole pour les créatures qui bavent ?', { mood: 'absurd' }),
  civ('civ_g13', 'Je refuse d’être un PNJ de démonstration !', { mood: 'retro' }),
  civ('civ_g14', 'Ça clignote, ça grogne, ça court... je rentre chez moi.', { mood: 'panic' }),
  civ('civ_g15', 'Qui a laissé entrer le contenu téléchargeable hostile ?', { mood: 'retro' }),
  civ('civ_g16', 'Je viens de perdre confiance dans le plan de circulation.', { mood: 'bureaucratic' }),
  civ('civ_g17', 'On peut mettre pause ? Non ? Même pas une petite ?', { mood: 'retro' }),
  civ('civ_g18', 'Mon assurance va adorer cette capture d’écran.', { mood: 'absurd' }),
  civ('civ_g19', 'Je ne suis pas un consommable de chantier !', { mood: 'panic' }),
  civ('civ_g20', 'C’est quoi ce niveau ? Même la panique est mal balisée !', { mood: 'retro' }),
  civ('civ_g21', 'Pourquoi le danger a une animation d’attaque ?', { mood: 'retro' }),
  civ('civ_g22', 'Je me cache derrière ce panneau, il a l’air plus solide que moi.', { mood: 'panic' }),
  civ('civ_g23', 'Je demande une réunion de crise, mais sans la crise dedans !', { mood: 'bureaucratic' }),
  civ('civ_g24', 'Est-ce que fuir compte comme une formation sécurité ?', { mood: 'absurd' }),
  civ('civ_g25', 'Je découvre une nouvelle émotion : le devis intérieur.', { mood: 'absurd' }),
  civ('civ_g26', 'On dirait que le chantier a téléchargé un problème.', { mood: 'retro' }),
  civ('civ_g27', 'Je veux une issue de secours avec des flèches énormes !', { mood: 'panic' }),
  civ('civ_g28', 'Ça ne ressemble pas à une visite de conformité !', { mood: 'bureaucratic' }),
  civ('civ_g29', 'Quelqu’un peut sauvegarder avant que ça empire ?', { mood: 'retro' }),
  civ('civ_g30', 'Je suis trop jeune pour devenir un élément de décor interactif !', { mood: 'absurd' })
]

const CIV_STAGE: readonly NpcDialogueLine[] = [
  // Stage 01
  civ('civ_s01_1', 'Je pensais visiter un terrain, pas un vieux jeu difficile !', { stages: [S.terrain] }),
  civ('civ_s01_2', 'Les piquets bougent ou c’est moi qui perds le plan ?', { stages: [S.terrain] }),
  civ('civ_s01_3', 'Pourquoi le terrain vierge a déjà des ennemis ?', { stages: [S.terrain] }),
  civ('civ_s01_4', 'On peut annuler le chantier avant qu’il commence ?', { stages: [S.terrain] }),
  civ('civ_s01_5', 'Je vais me cacher derrière le panneau de permis !', { stages: [S.terrain] }),
  civ('civ_s01_6', 'Ce n’est pas un bornage, c’est une introduction au stress.', { stages: [S.terrain] }),
  civ('civ_s01_7', 'Je ne suis pas géomètre, mais je mesure très bien le danger !', { stages: [S.terrain] }),
  civ('civ_s01_8', 'Le terrain était plus calme sans gameplay.', { stages: [S.terrain] }),
  civ('civ_s01_9', 'Est-ce que fuir compte comme une implantation dynamique ?', { stages: [S.terrain] }),
  civ('civ_s01_10', 'Un monstre près du bungalow ! Je démissionne symboliquement !', { stages: [S.terrain] }),
  civ('civ_s01_11', 'Même les herbes sèches ont l’air inquiètes !', { stages: [S.terrain] }),
  civ('civ_s01_12', 'Pourquoi le tutoriel commence par une invasion ?', { stages: [S.terrain] }),
  // Stage 02
  civ('civ_s02_1', 'Des trous partout ! C’est un niveau ou un piège à assurance ?', { stages: [S.terrassement] }),
  civ('civ_s02_2', 'Je refuse de finir comme matériau de remblai !', { stages: [S.terrassement] }),
  civ('civ_s02_3', 'La pelleteuse est calme. Pourquoi moi non ?', { stages: [S.terrassement] }),
  civ('civ_s02_4', 'Ce camion-benne me regarde comme une cinématique de fin.', { stages: [S.terrassement] }),
  civ('civ_s02_5', 'La boue ralentit ma dignité !', { stages: [S.terrassement] }),
  civ('civ_s02_6', 'Je viens de glisser dans une métaphore très concrète.', { stages: [S.terrassement] }),
  civ('civ_s02_7', 'On peut mettre une barrière autour de ma panique ?', { stages: [S.terrassement] }),
  civ('civ_s02_8', 'La fosse est immense et mon courage est en basse résolution !', { stages: [S.terrassement] }),
  civ('civ_s02_9', 'Je ne suis pas contre le terrassement, mais loin de moi !', { stages: [S.terrassement] }),
  civ('civ_s02_10', 'Le sol tremble ou c’est mon avenir proche ?', { stages: [S.terrassement] }),
  civ('civ_s02_11', 'S’il y a un trou, je vais le trouver malgré moi !', { stages: [S.terrassement] }),
  civ('civ_s02_12', 'Qui a validé ce plan masse avec des monstres ?', { stages: [S.terrassement] }),
  // Stage 03
  civ('civ_s03_1', 'Je reste loin du béton frais et du reste de cette aventure !', { stages: [S.fondations] }),
  civ('civ_s03_2', 'La pompe à béton pointe vers moi ou je dramatise ?', { stages: [S.fondations] }),
  civ('civ_s03_3', 'Si je tombe dans la dalle, dites que c’était de l’art.', { stages: [S.fondations] }),
  civ('civ_s03_4', 'Le coffrage a l’air solide. Moi, beaucoup moins.', { stages: [S.fondations] }),
  civ('civ_s03_5', 'Pourquoi les fondations ont des ennemis ? Elles ont rien demandé !', { stages: [S.fondations] }),
  civ('civ_s03_6', 'Je ne veux pas être intégré au ferraillage !', { stages: [S.fondations] }),
  civ('civ_s03_7', 'C’est donc ça, couler sous la pression. Très littéral.', { stages: [S.fondations] }),
  civ('civ_s03_8', 'Je refuse d’être un additif béton expérimental !', { stages: [S.fondations] }),
  civ('civ_s03_9', 'Le béton prend, moi je pars !', { stages: [S.fondations] }),
  civ('civ_s03_10', 'Je sens venir le rapport d’incident en béton armé.', { stages: [S.fondations] }),
  civ('civ_s03_11', 'Même la toupie tourne moins en rond que moi !', { stages: [S.fondations] }),
  civ('civ_s03_12', 'J’aimerais une fondation pour ma stabilité émotionnelle.', { stages: [S.fondations] }),
  // Stage 04
  civ('civ_s04_1', 'Je ne sais pas quel câble fait quoi, donc je fuis tout !', { stages: [S.reseaux] }),
  civ('civ_s04_2', 'Une tranchée ouverte, c’est déjà stressant sans monstres dedans !', { stages: [S.reseaux] }),
  civ('civ_s04_3', 'Si je tombe dans un regard, dites que je suis en télétravail.', { stages: [S.reseaux] }),
  civ('civ_s04_4', 'Les câbles au sol me jugent, je le sens.', { stages: [S.reseaux] }),
  civ('civ_s04_5', 'Pourquoi il y a un boss dans les réseaux ? C’est un routeur ?', { stages: [S.reseaux] }),
  civ('civ_s04_6', 'Je vais me prendre les pieds dans la moindre gaine, c’est écrit.', { stages: [S.reseaux] }),
  civ('civ_s04_7', 'Le plan des réseaux était déjà illisible avant l’attaque !', { stages: [S.reseaux] }),
  civ('civ_s04_8', 'Je ne veux pas découvrir l’assainissement par immersion !', { stages: [S.reseaux] }),
  civ('civ_s04_9', 'Ça fuit, ça grogne, ça clignote : très mauvais combo !', { stages: [S.reseaux] }),
  civ('civ_s04_10', 'Quelqu’un peut couper l’alimentation du cauchemar ?', { stages: [S.reseaux] }),
  civ('civ_s04_11', 'Je ne suis pas enterrable réglementairement !', { stages: [S.reseaux] }),
  civ('civ_s04_12', 'La sortie est-elle raccordée au bon réseau ?', { stages: [S.reseaux] }),
  // Stage 05
  civ('civ_s05_1', 'Les murs montent, mes chances descendent !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_2', 'Si un parpaing vole, je ne suis pas disponible pour le rattraper !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_3', 'La grue bouge comme un boss final administratif !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_4', 'Je refuse d’être maçonné dans l’histoire du chantier !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_5', 'Les palettes de blocs ont plus de sang-froid que moi !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_6', 'Je vois un crochet. Je n’aime pas les crochets narratifs.', { stages: [S.grosOeuvre] }),
  civ('civ_s05_7', 'Le gros œuvre porte bien son nom : gros stress, grosse fuite !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_8', 'On peut construire un abri à panique ?', { stages: [S.grosOeuvre] }),
  civ('civ_s05_9', 'Les murs protégeaient, ils n’invitaient pas les monstres !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_10', 'Même la poussière de béton sait où aller, pas moi !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_11', 'Je vais déposer une réserve sur l’ambiance générale !', { stages: [S.grosOeuvre] }),
  civ('civ_s05_12', 'Le bâtiment monte, mon enthousiasme reste au rez-de-chaussée.', { stages: [S.grosOeuvre] }),
  // Stage 06
  civ('civ_s06_1', 'Pourquoi tout est en hauteur ? J’avais commandé un niveau plat !', { stages: [S.echafaudages] }),
  civ('civ_s06_2', 'Les boulons tombent ? Très bien, moi aussi je pars !', { stages: [S.echafaudages] }),
  civ('civ_s06_3', 'Je ne suis pas compatible avec la gravité scénarisée !', { stages: [S.echafaudages] }),
  civ('civ_s06_4', 'L’échelle mène-t-elle à une zone sans panique ?', { stages: [S.echafaudages] }),
  civ('civ_s06_5', 'Je demande un garde-corps autour de ma dignité !', { stages: [S.echafaudages] }),
  civ('civ_s06_6', 'Je n’aime pas les plateformes qui font semblant d’être sûres.', { stages: [S.echafaudages] }),
  civ('civ_s06_7', 'Ce n’est plus un chantier, c’est un test d’équilibre émotionnel !', { stages: [S.echafaudages] }),
  civ('civ_s06_8', 'Si je regarde en bas, je vois mes regrets !', { stages: [S.echafaudages] }),
  civ('civ_s06_9', 'Le boss échafaudage a sûrement une attaque “vis manquante”.', { stages: [S.echafaudages] }),
  civ('civ_s06_10', 'Je reste au sol, merci, j’ai déjà assez de hauteur dans le stress.', { stages: [S.echafaudages] }),
  civ('civ_s06_11', 'Ce tube vient de bouger ou mon âme a glissé ?', { stages: [S.echafaudages] }),
  civ('civ_s06_12', 'On peut installer un ascenseur pour fuir ?', { stages: [S.echafaudages] }),
  // Stage 07
  civ('civ_s07_1', 'Le toit n’est pas fini, mais mon envie de partir oui !', { stages: [S.charpente] }),
  civ('civ_s07_2', 'Les tuiles rouges me donnent un signal clair : danger !', { stages: [S.charpente] }),
  civ('civ_s07_3', 'Pourquoi la charge suspendue a l’air de choisir une cible ?', { stages: [S.charpente] }),
  civ('civ_s07_4', 'Je refuse de finir en décoration de gouttière !', { stages: [S.charpente] }),
  civ('civ_s07_5', 'La charpente craque ou c’est mon esprit d’équipe ?', { stages: [S.charpente] }),
  civ('civ_s07_6', 'Je ne suis pas fait pour les niveaux avec ombre menaçante !', { stages: [S.charpente] }),
  civ('civ_s07_7', 'Le bois travaille, moi je fuis en contrat court !', { stages: [S.charpente] }),
  civ('civ_s07_8', 'Une tuile tombe et je deviens un exemple de prévention !', { stages: [S.charpente] }),
  civ('civ_s07_9', 'Le couvreur a l’air calme. Je veux son patch de mise à jour.', { stages: [S.charpente] }),
  civ('civ_s07_10', 'Le toit est au-dessus de moi, les problèmes aussi !', { stages: [S.charpente] }),
  civ('civ_s07_11', 'Je ne veux pas tester la résistance des chevrons en personne !', { stages: [S.charpente] }),
  civ('civ_s07_12', 'La sciure vole. Moi aussi, mentalement.', { stages: [S.charpente] }),
  // Stage 08
  civ('civ_s08_1', 'Les cloisons bougent ou c’est le niveau qui me provoque ?', { stages: [S.secondOeuvre] }),
  civ('civ_s08_2', 'Coincé entre un câble, un tuyau et une mauvaise décision !', { stages: [S.secondOeuvre] }),
  civ('civ_s08_3', 'Le placo est fragile, mais mon calme est en option.', { stages: [S.secondOeuvre] }),
  civ('civ_s08_4', 'Pourquoi le tableau électrique a l’air plus serein que moi ?', { stages: [S.secondOeuvre] }),
  civ('civ_s08_5', 'Je ne veux pas découvrir ce câble par contact direct !', { stages: [S.secondOeuvre] }),
  civ('civ_s08_6', 'Les plaques de plâtre sont empilées comme mes inquiétudes.', { stages: [S.secondOeuvre] }),
  civ('civ_s08_7', 'Le second œuvre ? Moi j’appelle ça le deuxième acte du chaos.', { stages: [S.secondOeuvre] }),
  civ('civ_s08_8', 'Je demande une cloison entre moi et tout ce qui bouge !', { stages: [S.secondOeuvre] }),
  civ('civ_s08_9', 'On peut couper le courant de la situation ?', { stages: [S.secondOeuvre] }),
  civ('civ_s08_10', 'Le plombier a fui ? Mauvais signe, très mauvais signe !', { stages: [S.secondOeuvre] }),
  civ('civ_s08_11', 'Je vais me cacher dans une pièce pas encore codée !', { stages: [S.secondOeuvre] }),
  civ('civ_s08_12', 'Le plan intérieur est plus labyrinthique que mon assurance.', { stages: [S.secondOeuvre] }),
  // Stage 09
  civ('civ_s09_1', 'Attention, peinture fraîche et panique ancienne !', { stages: [S.finitions] }),
  civ('civ_s09_2', 'Je refuse de mourir juste après les finitions, mal livré !', { stages: [S.finitions] }),
  civ('civ_s09_3', 'Les bâches glissent, les monstres courent, tout va bien.', { stages: [S.finitions] }),
  civ('civ_s09_4', 'J’ai marché dans la peinture. C’est donc ma signature finale.', { stages: [S.finitions] }),
  civ('civ_s09_5', 'Le carrelage est neuf, mes nerfs beaucoup moins.', { stages: [S.finitions] }),
  civ('civ_s09_6', 'Je demande une finition sur ma peur, s’il vous plaît !', { stages: [S.finitions] }),
  civ('civ_s09_7', 'Pourquoi les gouttes de peinture ont une intention hostile ?', { stages: [S.finitions] }),
  civ('civ_s09_8', 'Ce niveau est presque propre, sauf ce qui veut m’attraper !', { stages: [S.finitions] }),
  civ('civ_s09_9', 'Je vais laisser une trace, mais pas celle prévue.', { stages: [S.finitions] }),
  civ('civ_s09_10', 'Le rouleau de peinture me paraît plus armé que moi.', { stages: [S.finitions] }),
  civ('civ_s09_11', 'On ne fuit pas sur une bâche, c’est une trahison textile !', { stages: [S.finitions] }),
  civ('civ_s09_12', 'Si je tache le mur, ce sera une réserve à la réception !', { stages: [S.finitions] }),
  // Stage 10
  civ('civ_s10_1', 'Je refuse d’être noté dans le rapport final !', { stages: [S.livraison] }),
  civ('civ_s10_2', 'Pourquoi l’audit a des points de vie ?', { stages: [S.livraison] }),
  civ('civ_s10_3', 'Le portail avec ruban ne me protège pas du tout !', { stages: [S.livraison] }),
  civ('civ_s10_4', 'On livre le bâtiment ou on livre mon stress ?', { stages: [S.livraison] }),
  civ('civ_s10_5', 'Une fissure orange ? Très rassurant, vraiment très subtil !', { stages: [S.livraison] }),
  civ('civ_s10_6', 'Le fourgon d’inspection devrait m’inspecter le courage.', { stages: [S.livraison] }),
  civ('civ_s10_7', 'Je vais émettre une réserve sur l’existence des monstres !', { stages: [S.livraison] }),
  civ('civ_s10_8', 'La commission arrive ? Parfait, qu’elle commence par fuir !', { stages: [S.livraison] }),
  civ('civ_s10_9', 'Si ça passe en conformité, je mange le procès-verbal !', { stages: [S.livraison] }),
  civ('civ_s10_10', 'On peut réceptionner ma démission ?', { stages: [S.livraison] }),
  civ('civ_s10_11', 'Le panneau “conforme” clignote dans ma tête, pas dans le bon sens.', { stages: [S.livraison] }),
  civ('civ_s10_12', 'C’est la livraison finale, pas la scène bonus de la panique !', { stages: [S.livraison] })
]

const CIV_SHORT: readonly NpcDialogueLine[] = [
  civ('civ_sh1', 'À l’aide !', { weight: 2 }),
  civ('civ_sh2', 'Je pars !', { weight: 2 }),
  civ('civ_sh3', 'Pas prévu !', { weight: 2 }),
  civ('civ_sh4', 'C’est hostile !', { weight: 2 }),
  civ('civ_sh5', 'Je panique proprement !', { weight: 2 }),
  civ('civ_sh6', 'Où est la sortie ?', { weight: 2 }),
  civ('civ_sh7', 'Mauvais panneau !', { weight: 2 }),
  civ('civ_sh8', 'Trop tard, je fuis !', { weight: 2 }),
  civ('civ_sh9', 'Pas formé !', { weight: 2 }),
  civ('civ_sh10', 'Je refuse !', { weight: 2 }),
  civ('civ_sh11', 'Accident du travail !', { weight: 2 }),
  civ('civ_sh12', 'Je veux un adulte !', { weight: 2 }),
  civ('civ_sh13', 'Sauvegarde vite !', { weight: 2 }),
  civ('civ_sh14', 'Ça bouge trop !', { weight: 2 }),
  civ('civ_sh15', 'Je ne suis pas prêt !', { weight: 2 }),
  civ('civ_sh16', 'Pourquoi moi ?', { weight: 2 }),
  civ('civ_sh17', 'Je cours réglementairement !', { weight: 2 }),
  civ('civ_sh18', 'Rapport d’incident !', { weight: 2 }),
  civ('civ_sh19', 'Très mauvaise ambiance !', { weight: 2 }),
  civ('civ_sh20', 'Je rentre chez moi !', { weight: 2 })
]

const CIV_MONSTER: readonly NpcDialogueLine[] = [
  civ('civ_m1', 'Il me suit ! Je suis officiellement un objectif secondaire !', { trigger: 'monster_near' }),
  civ('civ_m2', 'Pourquoi il accélère ? Qui a équilibré ce niveau ?', { trigger: 'monster_near' }),
  civ('civ_m3', 'Il arrive, il arrive, en très mauvaise qualité humaine !', { trigger: 'monster_near' }),
  civ('civ_m4', 'Je retire tout ce que j’ai dit sur les chantiers calmes !', { trigger: 'monster_near' }),
  civ('civ_m5', 'Je veux un panneau “monstre prioritaire à droite” !', { trigger: 'monster_near' }),
  civ('civ_m6', 'Il a une animation d’attaque, je n’aime pas ça du tout !', { trigger: 'monster_near' }),
  civ('civ_m7', 'Il me regarde comme un bug qui a trouvé sa mission !', { trigger: 'monster_near' }),
  civ('civ_m8', 'Je ne suis pas prévu pour le contact rapproché !', { trigger: 'monster_near' }),
  civ('civ_m9', 'Ce n’est plus une visite, c’est une poursuite pédagogique !', { trigger: 'monster_near' }),
  civ('civ_m10', 'Je vais déposer une réserve sur sa présence !', { trigger: 'monster_near' })
]

/** PNJ lambda — pool complet (globales + par stage + courtes + monstre proche). */
export const npcCivilianDialogues: readonly NpcDialogueLine[] = [
  ...CIV_GLOBAL,
  ...CIV_STAGE,
  ...CIV_SHORT,
  ...CIV_MONSTER
]

// ─────────────────────────────────────────────────────────────────────────────
// Sélecteur PUR
// ─────────────────────────────────────────────────────────────────────────────

/** Contexte de sélection d'une réplique. */
export interface NpcDialogueQuery {
  readonly npcType: NpcDialogueType
  /** Stage courant (id de phase). Les répliques du stage sont prioritaires. */
  readonly stage?: string
  /** Contexte : idle / near_player / monster_near / running_away / stage_start. */
  readonly trigger?: NpcDialogueTrigger
  /** Ids déjà dits récemment (anti-répétition) — le caller borne la fenêtre. */
  readonly recentIds?: ReadonlySet<string>
}

/** Renvoie true si la ligne est compatible avec le trigger demandé. */
function triggerMatches(line: NpcDialogueLine, trigger: NpcDialogueTrigger | undefined): boolean {
  // Une ligne SANS trigger est passe-partout. Une ligne AVEC trigger n'apparaît
  // que sur ce trigger précis (ex : monstre proche).
  if (line.trigger === undefined) {
    return true
  }
  return line.trigger === trigger
}

/**
 * Choisit une réplique de façon DÉTERMINISTE (seed) dans le bon pool, en :
 *  1. filtrant par trigger (les lignes « monstre proche » n'apparaissent que là) ;
 *  2. écartant les ids récents (anti-répétition) ;
 *  3. priorisant les répliques SPÉCIFIQUES au stage sur les globales ;
 *  4. tirant selon le seed (pondéré par `weight`, défaut 1).
 *
 * Renvoie `null` si aucune ligne n'est disponible (le caller n'affiche rien).
 */
export function pickNpcLine(query: NpcDialogueQuery, seed: number): NpcDialogueLine | null {
  const pool = query.npcType === 'job' ? npcJobDialogues : npcCivilianDialogues
  const recent = query.recentIds ?? EMPTY_SET

  const eligible = pool.filter(
    (l) => triggerMatches(l, query.trigger) && !recent.has(l.id)
  )
  if (eligible.length === 0) {
    // Repli : ignore l'anti-répétition plutôt que de rester muet.
    const fallback = pool.filter((l) => triggerMatches(l, query.trigger))
    return weightedPick(fallback, seed)
  }

  // Priorité stage : si des lignes du stage courant existent, on tire dedans.
  if (query.stage !== undefined) {
    const stageLines = eligible.filter((l) => l.stages?.includes(query.stage as string))
    if (stageLines.length > 0) {
      return weightedPick(stageLines, seed)
    }
  }

  // Sinon : les lignes globales (sans `stages`) — pas les lignes d'AUTRES stages.
  const globalLines = eligible.filter((l) => l.stages === undefined)
  const draw = globalLines.length > 0 ? globalLines : eligible
  return weightedPick(draw, seed)
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>()

/** Tirage pondéré déterministe (weight défaut 1) à partir d'un seed entier. */
function weightedPick(lines: readonly NpcDialogueLine[], seed: number): NpcDialogueLine | null {
  if (lines.length === 0) {
    return null
  }
  let total = 0
  for (const l of lines) {
    total += l.weight ?? 1
  }
  // Seed → position dans [0, total). Modulo entier stable (pas de flottant).
  const s = ((Math.trunc(seed) % total) + total) % total
  let acc = 0
  for (const l of lines) {
    acc += l.weight ?? 1
    if (s < acc) {
      return l
    }
  }
  return lines[lines.length - 1] ?? null
}
