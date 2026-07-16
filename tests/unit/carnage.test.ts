import { describe, it, expect } from 'vitest'
import {
  splatterFor,
  poolKey,
  splatterKey,
  dropClusterKey,
  selectCarnageOnQuote,
  selectCriticalText,
  paintedSurfaceM2,
  POOL_KEYS,
  SPLATTER_KEYS,
  CARNAGE,
  CARNAGE_ON_QUOTES,
  CRITICAL_TEXTS,
  type CarnageSize
} from '@content/carnage'

describe('splatterFor — forme de projection selon l’arme et le gabarit', () => {
  it('la scie et les projectiles lourds giclent en LONG (coup directionnel)', () => {
    expect(splatterFor('scie', 'medium')).toBe('long')
    expect(splatterFor('brouette', 'medium')).toBe('long')
    expect(splatterFor('mitrailleuse_clous', 'small')).toBe('long')
  })

  it('les armes de zone et de percussion giclent en RADIAL', () => {
    expect(splatterFor('marteau', 'medium')).toBe('radial')
    expect(splatterFor('chalumeau', 'small')).toBe('radial')
    expect(splatterFor('coulee_bitume', 'medium')).toBe('radial')
  })

  it('une arme inconnue ou absente retombe sur COURT (pas de crash, pas de cas spécial)', () => {
    expect(splatterFor('arme_qui_nexiste_pas', 'medium')).toBe('short')
    expect(splatterFor(undefined, 'small')).toBe('short')
  })

  it('un gros gabarit force le RADIAL, même avec une arme directionnelle', () => {
    // Le brief §4.2 lie la gerbe radiale au POIDS de l'ennemi autant qu'au coup.
    expect(splatterFor('scie', 'large')).toBe('radial')
    expect(splatterFor('scie', 'boss')).toBe('radial')
  })

  it('une mort critique force le RADIAL', () => {
    expect(splatterFor('scie', 'small', true)).toBe('radial')
  })
})

describe('clés d’assets — variantes', () => {
  it('chaque gabarit a bien 2 variantes de flaque, et le roll choisit entre elles', () => {
    const sizes: CarnageSize[] = ['small', 'medium', 'large', 'boss']
    for (const s of sizes) {
      expect(POOL_KEYS[s].length).toBe(2)
      expect(poolKey(s, 0)).toBe(POOL_KEYS[s][0])
      expect(poolKey(s, 0.99)).toBe(POOL_KEYS[s][1])
    }
  })

  it('les clés de flaque suivent le nommage du brief', () => {
    expect(poolKey('medium', 0)).toBe('blood_pool_medium_01')
    expect(poolKey('boss', 0.99)).toBe('blood_pool_boss_02')
  })

  it('roll = 1 ne déborde pas du tableau', () => {
    // Math.floor(1 * n) === n → hors bornes sans le clamp.
    expect(poolKey('small', 1)).toBe(POOL_KEYS.small[1])
    expect(splatterKey('radial', 1)).toBe(SPLATTER_KEYS.radial[1])
    expect(dropClusterKey(1)).toBe('blood_drop_cluster_03')
  })

  it('ne rend jamais une clé vide', () => {
    for (let i = 0; i <= 10; i++) {
      expect(poolKey('medium', i / 10).length).toBeGreaterThan(0)
      expect(splatterKey('short', i / 10).length).toBeGreaterThan(0)
      expect(dropClusterKey(i / 10).length).toBeGreaterThan(0)
    }
  })
})

describe('textes', () => {
  it('sous-phrase d’activation : déterministe, bornée, jamais vide', () => {
    expect(selectCarnageOnQuote({ roll: 0.5 })).toBe(selectCarnageOnQuote({ roll: 0.5 }))
    expect(selectCarnageOnQuote({ roll: 0 })).toBe(CARNAGE_ON_QUOTES[0])
    expect(selectCarnageOnQuote({ roll: 1 })).toBe(CARNAGE_ON_QUOTES[CARNAGE_ON_QUOTES.length - 1])
  })

  it('texte de mort critique : déterministe, borné, jamais vide', () => {
    expect(selectCriticalText({ roll: 0.3 })).toBe(selectCriticalText({ roll: 0.3 }))
    expect(selectCriticalText({ roll: 1 })).toBe(CRITICAL_TEXTS[CRITICAL_TEXTS.length - 1])
    for (let i = 0; i <= 10; i++) {
      expect(selectCriticalText({ roll: i / 10 }).length).toBeGreaterThan(0)
    }
  })
})

describe('réglages', () => {
  it('les morts critiques restent RARES (le brief dit 3 à 5 %)', () => {
    expect(CARNAGE.criticalChance).toBeGreaterThanOrEqual(0.03)
    expect(CARNAGE.criticalChance).toBeLessThanOrEqual(0.05)
  })

  it('le plafond mobile est plus bas que le plafond PC', () => {
    // Le mobile est une cible perf requise : il ne doit pas hériter du budget PC.
    expect(CARNAGE.maxPoolsMobile).toBeLessThan(CARNAGE.maxPoolsDesktop)
  })

  it('les débits par frame sont bornés (une vague tue en paquet)', () => {
    expect(CARNAGE.maxPoolsPerFrame).toBeGreaterThan(0)
    // La gerbe coûte plus cher que la flaque : son budget doit être plus serré,
    // c'est elle qu'on sacrifie en premier sous charge.
    expect(CARNAGE.maxSplattersPerFrame).toBeLessThan(CARNAGE.maxPoolsPerFrame)
  })

  it('la taille de flaque croît avec le gabarit', () => {
    const s = CARNAGE.scaleBySize
    expect(s.small).toBeLessThan(s.medium)
    expect(s.medium).toBeLessThan(s.large)
    expect(s.large).toBeLessThan(s.boss)
  })
})

describe('paintedSurfaceM2 — surface repeinte (stat de fin, humoristique)', () => {
  it('vaut 0 sans aucune flaque', () => {
    expect(paintedSurfaceM2({ small: 0, medium: 0, large: 0, boss: 0 })).toBe(0)
  })

  it('croît avec le nombre de flaques', () => {
    const a = paintedSurfaceM2({ small: 0, medium: 10, large: 0, boss: 0 })
    const b = paintedSurfaceM2({ small: 0, medium: 20, large: 0, boss: 0 })
    expect(b).toBeGreaterThan(a)
  })

  it('pondère par le gabarit : un boss repeint plus que dix petits', () => {
    const tenSmall = paintedSurfaceM2({ small: 10, medium: 0, large: 0, boss: 0 })
    const oneBoss = paintedSurfaceM2({ small: 0, medium: 0, large: 0, boss: 1 })
    expect(oneBoss).toBeGreaterThan(tenSmall)
  })
})
