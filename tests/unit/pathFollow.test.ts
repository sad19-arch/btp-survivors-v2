import { describe, it, expect } from 'vitest'
import { pathFollow } from '@render/workerBehavior'

/**
 * `pathFollow` — position sur une polyligne, en fonction PURE du temps.
 *
 * Le raisonnement est passé de la DISTANCE au TEMPS : une pause est du temps,
 * pas de la distance. Sans ça, « s'arrêter 2 s au bout » est inexprimable.
 */

/** Ligne droite horizontale de 100 px : 10 px/s → 10 s pour la parcourir. */
const LINE = [{ x: 0, y: 0 }, { x: 100, y: 0 }]

describe('pathFollow — non-régression (sans opts)', () => {
  it('sans opts, se comporte EXACTEMENT comme avant : aller-retour continu', () => {
    // t=0 → départ ; t=5s → milieu ; t=10s → bout ; t=15s → milieu au retour.
    expect(pathFollow(LINE, 0, 10).x).toBeCloseTo(0)
    expect(pathFollow(LINE, 5000, 10).x).toBeCloseTo(50)
    expect(pathFollow(LINE, 10000, 10).x).toBeCloseTo(100)
    expect(pathFollow(LINE, 15000, 10).x).toBeCloseTo(50)
    // Et le cycle boucle : t=20s = t=0.
    expect(pathFollow(LINE, 20000, 10).x).toBeCloseTo(0)
  })

  it('sans opts, toujours visible (le champ est neuf, le défaut ne cache rien)', () => {
    for (const t of [0, 3000, 7000, 12000, 19000]) {
      expect(pathFollow(LINE, t, 10).visible, `t=${t}`).toBe(true)
    }
  })

  it('sens de marche : aller vers +x, retour vers -x', () => {
    expect(pathFollow(LINE, 2000, 10).dirX).toBeCloseTo(1)
    expect(pathFollow(LINE, 12000, 10).dirX).toBeCloseTo(-1)
  })

  // Non-régression `atEnd` : commit 06415cf a réécrit la sémantique en « vrai
  // seulement dans la fenêtre de pause ». Sans opts, pauseMs=0 ⇒ fenêtre de
  // largeur nulle ⇒ atEnd JAMAIS vrai. L'ancienne sémantique (commit 296f6db,
  // `commutePos`) est une PROXIMITÉ : vrai à moins de AT_END_THRESHOLD (24px)
  // d'une extrémité, à l'aller comme au retour. Ce test doit échouer avant fix.
  it('atEnd (sans opts) : proximité d\'une extrémité, à l\'aller ET au retour', () => {
    // t=0 : départ en A → atEnd vrai (dist=0).
    expect(pathFollow(LINE, 0, 10).atEnd).toBe(true)
    // t=9s : aller, dist=90, à 10px de B (<24) → atEnd vrai.
    expect(pathFollow(LINE, 9000, 10).atEnd).toBe(true)
    // t=9.9s : aller, dist=99, à 1px de B → atEnd vrai.
    expect(pathFollow(LINE, 9900, 10).atEnd).toBe(true)
    // t=5s : milieu de l'aller, dist=50 → atEnd faux.
    expect(pathFollow(LINE, 5000, 10).atEnd).toBe(false)
    // t=10s : pile en B (repli sur le retour, back=0, dist=100) → atEnd vrai.
    expect(pathFollow(LINE, 10000, 10).atEnd).toBe(true)
    // t=11s : retour, à 10px de B (dist=90) → atEnd vrai (le retour aussi !).
    expect(pathFollow(LINE, 11000, 10).atEnd).toBe(true)
    // t=15s : milieu du retour, dist=50 → atEnd faux.
    expect(pathFollow(LINE, 15000, 10).atEnd).toBe(false)
    // t=19s : retour, à 10px de A (dist=10) → atEnd vrai.
    expect(pathFollow(LINE, 19000, 10).atEnd).toBe(true)
    // t=19.9s : retour, à 1px de A (dist=1) → atEnd vrai.
    expect(pathFollow(LINE, 19900, 10).atEnd).toBe(true)
  })
})

describe('pathFollow — polyligne à 3 points (multi-segments)', () => {
  // A(0,0) → B(100,0) → C(100,100). Segment 0 = 100px, segment 1 = 100px,
  // total = 200px @ 10px/s = 20s de trajet. Couvre le repli `d -= l` et le
  // dernier segment de `pointAtDistance`, non exercés par une ligne à 2 points.
  const ELBOW = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]

  it('progresse le long du 1er segment (seg=0), puis du 2e (seg=1)', () => {
    // t=5s : dist=50, encore sur A→B.
    const midSeg0 = pathFollow(ELBOW, 5000, 10)
    expect(midSeg0.seg).toBe(0)
    expect(midSeg0.x).toBeCloseTo(50)
    expect(midSeg0.y).toBeCloseTo(0)

    // t=10s : dist=100, jonction B — encore rendu comme fin du segment 0.
    const atB = pathFollow(ELBOW, 10000, 10)
    expect(atB.x).toBeCloseTo(100)
    expect(atB.y).toBeCloseTo(0)

    // t=15s : dist=150, 50px dans le 2e segment B→C.
    const midSeg1 = pathFollow(ELBOW, 15000, 10)
    expect(midSeg1.seg).toBe(1)
    expect(midSeg1.x).toBeCloseTo(100)
    expect(midSeg1.y).toBeCloseTo(50)

    // t=20s : dist=200, bout du parcours en C.
    const atC = pathFollow(ELBOW, 20000, 10)
    expect(atC.x).toBeCloseTo(100)
    expect(atC.y).toBeCloseTo(100)
  })

  it('le retour parcourt aussi les deux segments, en sens inverse', () => {
    // t=25s : repli, back=5s → dist=200-50=150 → milieu du 2e segment (retour).
    const backSeg1 = pathFollow(ELBOW, 25000, 10)
    expect(backSeg1.seg).toBe(1)
    expect(backSeg1.y).toBeCloseTo(50)

    // t=35s : back=15s → dist=200-150=50 → milieu du 1er segment (retour).
    const backSeg0 = pathFollow(ELBOW, 35000, 10)
    expect(backSeg0.seg).toBe(0)
    expect(backSeg0.x).toBeCloseTo(50)
    expect(backSeg0.y).toBeCloseTo(0)
  })
})

describe('pathFollow — pause aux extrémités (aller-retour)', () => {
  // 100px @ 10px/s = 10s de trajet ; pause 2s ⇒ cycle = 10+2+10+2 = 24s.
  const OPTS = { pauseMs: 2000 }

  it('s arrête au bout pendant la pause, visible', () => {
    // t=10s : arrivée en B. t=10..12s : figé en B.
    expect(pathFollow(LINE, 10000, 10, OPTS).x).toBeCloseTo(100)
    expect(pathFollow(LINE, 11000, 10, OPTS).x).toBeCloseTo(100)
    expect(pathFollow(LINE, 11900, 10, OPTS).x).toBeCloseTo(100)
    // La pause est un arrêt VISIBLE (livraison), pas une disparition.
    expect(pathFollow(LINE, 11000, 10, OPTS).visible).toBe(true)
  })

  it('repart APRÈS la pause', () => {
    // t=12s : la pause finit, le retour démarre. t=17s : milieu.
    expect(pathFollow(LINE, 12000, 10, OPTS).x).toBeCloseTo(100)
    expect(pathFollow(LINE, 17000, 10, OPTS).x).toBeCloseTo(50)
    expect(pathFollow(LINE, 22000, 10, OPTS).x).toBeCloseTo(0)
  })

  it('s arrête AUSSI au départ (les deux extrémités)', () => {
    // t=22..24s : figé en A.
    expect(pathFollow(LINE, 23000, 10, OPTS).x).toBeCloseTo(0)
    // t=24s : nouveau cycle.
    expect(pathFollow(LINE, 24000, 10, OPTS).x).toBeCloseTo(0)
    expect(pathFollow(LINE, 29000, 10, OPTS).x).toBeCloseTo(50)
  })
})

describe('pathFollow — sens unique', () => {
  // 100px @ 10px/s = 10s ; pause 5s d'INVISIBILITÉ ⇒ cycle = 15s.
  const OPTS = { oneWay: true, pauseMs: 5000 }

  it('parcourt A→B, visible', () => {
    expect(pathFollow(LINE, 0, 10, OPTS).x).toBeCloseTo(0)
    expect(pathFollow(LINE, 5000, 10, OPTS).x).toBeCloseTo(50)
    expect(pathFollow(LINE, 9900, 10, OPTS).visible).toBe(true)
  })

  it('DISPARAÎT après le bout (pause = temps invisible, pas un arrêt)', () => {
    // En sens unique, `pauseMs` est l'espacement du flux : le marcheur est SORTI.
    expect(pathFollow(LINE, 10500, 10, OPTS).visible).toBe(false)
    expect(pathFollow(LINE, 14900, 10, OPTS).visible).toBe(false)
  })

  it('RÉAPPARAÎT au départ, jamais à mi-chemin (pas de téléportation à vue)', () => {
    const r = pathFollow(LINE, 15000, 10, OPTS)
    expect(r.visible).toBe(true)
    expect(r.x).toBeCloseTo(0)
    // Ne repart JAMAIS en arrière : toujours vers +x.
    expect(pathFollow(LINE, 16000, 10, OPTS).dirX).toBeCloseTo(1)
  })

  it('sans pause, le flux est continu (réapparition immédiate)', () => {
    const noPause = { oneWay: true }
    expect(pathFollow(LINE, 10000, 10, noPause).x).toBeCloseTo(0)
    expect(pathFollow(LINE, 10000, 10, noPause).visible).toBe(true)
  })
})

describe('pathFollow — cas dégénérés (aucun NaN, aucune division par zéro)', () => {
  it('0 point → origine, sans planter', () => {
    const r = pathFollow([], 1234, 10)
    expect(Number.isFinite(r.x)).toBe(true)
    expect(r.atEnd).toBe(true)
  })

  it('1 point → immobile dessus', () => {
    const r = pathFollow([{ x: 7, y: 9 }], 1234, 10)
    expect(r.x).toBe(7)
    expect(r.y).toBe(9)
  })

  it('longueur nulle (points confondus) → immobile, pas de /0', () => {
    const r = pathFollow([{ x: 5, y: 5 }, { x: 5, y: 5 }], 1234, 10)
    expect(Number.isFinite(r.x)).toBe(true)
    expect(r.x).toBe(5)
  })

  it('vitesse 0 ou négative → immobile au départ, PAS de division par zéro', () => {
    // tTrajet = longueur / vitesse : une vitesse nulle ferait exploser le calcul.
    for (const v of [0, -5]) {
      const r = pathFollow(LINE, 5000, v)
      expect(Number.isFinite(r.x), `v=${v}`).toBe(true)
      expect(r.x, `v=${v}`).toBe(0)
    }
  })

  it('pause démesurée → pas de boucle infinie, résultat fini', () => {
    const r = pathFollow(LINE, 1000, 10, { pauseMs: 30000 })
    expect(Number.isFinite(r.x)).toBe(true)
  })
})
