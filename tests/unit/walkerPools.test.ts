/**
 * Pools de feuilles par rôle de marche (`buildWalkerPools` / `pickWalkerSkin`).
 *
 * Ce sont les deux fonctions PURES qui ont sorti 19 feuilles PNJ de l'orphelinat :
 * les jobs de marche piochent dans un pool par rôle au lieu de partager l'unique
 * feuille que l'ancien `_resolveKey` retenait par indice de nom.
 *
 * Le comptage d'atteignabilité RÉEL (mondes construits) vit dans
 * `ambientReachability.test.ts` ; ici on épingle les règles de construction.
 */
import { describe, it, expect } from 'vitest'
import { buildWalkerPools, pickWalkerSkin, type WalkerSheet } from '@render/workerBehavior'

const sheet = (key: string, behavior: 'work' | 'patrol', kind?: 'trade' | 'worker'): WalkerSheet =>
  kind === undefined ? { key, behavior } : { key, behavior, kind }

describe('buildWalkerPools', () => {
  it('range les feuilles par BEHAVIOR, pas par nom', () => {
    // `porteur_blocs` est déclaré `patrol` : son NOM dit porteur, sa DONNÉE dit
    // patrouille. C'est la donnée qui gagne — sinon un flagman nommé « porteur »
    // irait pousser des brouettes.
    const pools = buildWalkerPools([
      sheet('npc_s5_parpaingueur', 'work'),
      sheet('npc_s5_porteur_blocs', 'patrol'),
      sheet('npc_s5_grutier', 'work')
    ])
    expect(pools.porteur).toEqual(['npc_s5_parpaingueur', 'npc_s5_grutier'])
    expect(pools.signaleur).toEqual(['npc_s5_porteur_blocs'])
  })

  it('exclut les feuilles kind:trade des deux pools de marche', () => {
    // Elles sont déjà atteignables via l'auto-placement `npc_trade`, et leur
    // échelle est calibrée par feuille. Régression épinglée : le repli d'indice
    // de `_resolveKey` faisait marcher `npc_stage05_grutier_trade` en signaleur.
    const pools = buildWalkerPools([
      sheet('npc_s5', 'work', 'trade'),
      sheet('npc_s5_grutier_trade', 'work', 'trade'),
      sheet('npc_s5_parpaingueur', 'work'),
      sheet('npc_s5_porteur_blocs', 'patrol')
    ])
    expect(pools.porteur).not.toContain('npc_s5_grutier_trade')
    expect(pools.signaleur).not.toContain('npc_s5_grutier_trade')
    expect(pools.porteur).toEqual(['npc_s5_parpaingueur'])
    expect(pools.signaleur).toEqual(['npc_s5_porteur_blocs'])
  })

  it('conserve l’ordre de DÉCLARATION (le premier job garde sa texture)', () => {
    const pools = buildWalkerPools([
      sheet('a', 'work'), sheet('b', 'work'), sheet('c', 'work')
    ])
    expect(pools.porteur).toEqual(['a', 'b', 'c'])
  })

  it('un rôle sans feuille dédiée emprunte à l’autre (cas echafaudages : que des patrol)', () => {
    const pools = buildWalkerPools([
      sheet('npc_s6_monteur_tube', 'patrol'),
      sheet('npc_s6_porteur_planche', 'patrol')
    ])
    expect(pools.signaleur).toEqual(['npc_s6_monteur_tube', 'npc_s6_porteur_planche'])
    // Aucune feuille `work` → les porteurs empruntent les feuilles `patrol`
    // plutôt que de ne rien afficher.
    expect(pools.porteur).toEqual(['npc_s6_monteur_tube', 'npc_s6_porteur_planche'])
  })

  it('sans AUCUNE feuille ouvrier, retombe sur les feuilles métier (reste total)', () => {
    const pools = buildWalkerPools([sheet('npc_s1_trade', 'work', 'trade')])
    expect(pools.porteur).toEqual(['npc_s1_trade'])
    expect(pools.signaleur).toEqual(['npc_s1_trade'])
  })

  it('aucune feuille → pools vides (aucun ouvrier créé, jamais de texture fantôme)', () => {
    const pools = buildWalkerPools([])
    expect(pools.porteur).toEqual([])
    expect(pools.signaleur).toEqual([])
  })
})

describe('pickWalkerSkin', () => {
  it('fait tourner le pool de façon cyclique et déterministe', () => {
    const pool = ['a', 'b', 'c']
    expect([0, 1, 2, 3, 4, 5].map((i) => pickWalkerSkin(pool, i))).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
  })

  it('un pool à UNE feuille rend toujours cette feuille (comportement historique)', () => {
    expect([0, 7, 23].map((i) => pickWalkerSkin(['solo'], i))).toEqual(['solo', 'solo', 'solo'])
  })

  it('pool vide → null (le job n’est pas créé)', () => {
    expect(pickWalkerSkin([], 3)).toBeNull()
  })

  it('index négatif → reste dans le pool (jamais undefined)', () => {
    expect(pickWalkerSkin(['a', 'b'], -1)).toBe('b')
  })
})
