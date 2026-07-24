import { PALETTE } from './palette'

/**
 * Feuille de style de l'UI — refonte « 16-bit premium » (réf. Demon's Crest /
 * SNES / Mega Drive). Conserve TOUS les noms de classes de la version d'origine
 * pour se brancher sur `overlay.ts` sans changement de DOM. Le rendu premium
 * vient de : cadres métal brossé (texture `ui_metal_v.png` + biseaux solides),
 * rivets en relief, titres/logos sculptés (extrusion en rampe), tramage
 * (`ui_dither_light.png`) sur les états actifs, coins carrés, ombres portées
 * décalées — aucun gradient moderne / flou / glow / coin arrondi.
 *
 * ASSETS REQUIS dans `public/` (servis à la racine) :
 *   ui_metal_v.png · ui_dither_light.png · ui_dither_dark.png · ui_bg_dusk.png · ui_casque.png
 * FONTES (à charger dans index.html) : "Jersey 25" (titres) + "Pixelify Sans" (UI).
 *
 * Palette : source de vérité = palette.ts. Les quelques nuances dérivées
 * ci-dessous (acier clair/sombre, rivets, rampe dorée) restent sur les mêmes
 * teintes — indispensables pour les rampes/biseaux 16-bit.
 */

// Nuances dérivées (sur-teintes/sous-teintes de la palette imposée).
const METAL_LIGHT = '#5A4A38'
const METAL_DARK = '#17120E'
const RIVET = '#8A785A'
const RIVET_HI = '#CBB184'
const GOLD_HI = '#FFF4CC'
const GOLD_DK = '#9C440D'
const GOLD_DEEP = '#6E2F08'

const CSS = `
#ui-root {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  font-family: 'Pixelify Sans', 'Jersey 25', monospace;
  color: ${PALETTE.blanc};
  letter-spacing: 0.5px;
  user-select: none;
  --tex: url('${import.meta.env.BASE_URL}ui_metal_v.png');
  --sheen: url('${import.meta.env.BASE_URL}ui_dither_light.png');
}
#ui-root img { image-rendering: pixelated; }

/* Titres sculptés (logo/panneaux) — extrusion en rampe dorée + contour. */
#ui-root .sculpt {
  color: ${PALETTE.jauneSecurite};
  text-shadow:
    -2px -2px 0 ${GOLD_HI},
    2px 0 0 ${PALETTE.contour}, -2px 0 0 ${PALETTE.contour},
    0 2px 0 ${PALETTE.contour}, 0 -2px 0 ${PALETTE.contour},
    4px 4px 0 ${GOLD_DK}, 7px 7px 0 ${GOLD_DEEP}, 10px 10px 0 ${PALETTE.contour};
}

/* ── HUD ──────────────────────────────────────────────────────────────── */
#ui-root .hud {
  position: absolute;
  top: 0; left: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin: 14px;
  padding: 12px 16px;
  font-size: 20px;
  font-weight: 700;
  background: var(--tex);
  background-size: 60px 100%;
  border: 5px solid ${PALETTE.contour};
  box-shadow: 6px 6px 0 rgba(0,0,0,0.55),
    inset 3px 3px 0 rgba(255,255,255,0.14), inset -4px -4px 0 rgba(0,0,0,0.5);
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .hud__row { display: flex; gap: 12px; align-items: center; }
#ui-root .hud__sep { color: ${PALETTE.solSable}; }
#ui-root .hud__hp { color: ${PALETTE.vertBonus}; }
#ui-root .hud__xp { color: ${PALETTE.cyanAccent}; }
#ui-root .hud__bar {
  width: 300px; height: 22px;
  background: #120E0A;
  border: 4px solid ${PALETTE.contour};
  box-shadow: inset 2px 2px 0 #000;
}
#ui-root .hud__bar-fill { height: 100%; }
#ui-root .hud__bar--hp .hud__bar-fill {
  background: ${PALETTE.vertBonus};
  box-shadow: inset 0 3px 0 rgba(255,255,255,0.4), inset 0 -3px 0 rgba(0,80,35,0.5);
}
#ui-root .hud__bar--xp .hud__bar-fill {
  background: ${PALETTE.cyanAccent};
  box-shadow: inset 0 3px 0 rgba(255,255,255,0.4), inset 0 -3px 0 rgba(0,60,80,0.5);
}
@keyframes xp-level-up-flash {
  0%,25%  { box-shadow: inset 2px 2px 0 #000, 0 0 0 3px ${PALETTE.jauneSecurite}; }
  50%,75% { box-shadow: inset 2px 2px 0 #000, 0 0 0 3px ${PALETTE.vertBonus}; }
  100%    { box-shadow: inset 2px 2px 0 #000; }
}
#ui-root .hud__bar--xp-flash { animation: xp-level-up-flash 0.2s steps(2, end); }
#ui-root .hud__stagenum { color: ${PALETTE.jauneSecurite}; }
#ui-root .hud__stagename { color: ${PALETTE.blanc}; font-size: 22px; }
#ui-root .hud__coins { color: ${PALETTE.jauneSecurite}; font-weight: 700; }
#ui-root .hud__players { display: flex; flex-direction: row; gap: 8px; margin-top: 2px; }
#ui-root .hud__pcard {
  display: flex; align-items: center; gap: 6px;
  background: ${PALETTE.brunSombre};
  border: 3px solid ${PALETTE.contour};
  box-shadow: 3px 3px 0 ${PALETTE.contour};
  padding: 4px 6px;
}
#ui-root .hud__pcard--dead { opacity: 0.45; }
#ui-root .hud__pswatch {
  width: 14px; height: 14px; border: 3px solid ${PALETTE.contour}; flex-shrink: 0;
  box-shadow: inset 2px 2px 0 rgba(255,255,255,0.4);
}
#ui-root .hud__pinfo { display: flex; flex-direction: column; gap: 1px; font-size: 15px; line-height: 1.2; }
#ui-root .hud__pid { color: ${PALETTE.jauneSecurite}; font-weight: 700; }
#ui-root .hud__php { color: ${PALETTE.vertBonus}; }
#ui-root .hud__plvl { color: ${PALETTE.blanc}; }

/* ── Feedback combat plein écran (juice) ──────────────────────────────── */
/* Vignette « alerte sécurité » (PV bas) + flash de dégât reçu. Bordures pixel
   SOLIDES (box-shadow inset sans flou), rouge alerte de la palette — pas de
   glow/gradient/coin arrondi. Sous le HUD (z-index 4) : n'obscurcit pas le texte. */
#ui-root .combat-fx { position: absolute; inset: 0; pointer-events: none; z-index: 4; overflow: hidden; }
#ui-root .combat-fx__danger, #ui-root .combat-fx__hurt { position: absolute; inset: 0; opacity: 0; }
/* Vignette PV bas : double anneau rouge/contour INTERNE qui bat comme un témoin d'alerte. */
#ui-root .combat-fx__danger {
  box-shadow: inset 0 0 0 14px ${PALETTE.rougeAlerte}, inset 0 0 0 19px ${PALETTE.contour};
}
#ui-root .combat-fx__danger--on { animation: danger-pulse 0.9s steps(10, end) infinite; }
@keyframes danger-pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 0.92; } }
/* Flash de dégât : voile rouge bref (opacité pilotée en inline, fondu par frame). */
#ui-root .combat-fx__hurt { background: ${PALETTE.rougeAlerte}; }

/* ── CADENCE (combo, juice #7) + palier « N DÉBLAYÉS » (juice #8) ──────── */
/* Panneau pixel compact ; couleur du chiffre + de la barre pilotée en inline
   selon le palier de cadence. Barre qui se vide = fenêtre de combo restante. */
#ui-root .cadence {
  position: absolute; top: 90px; left: 50%; transform: translateX(-50%);
  display: none; flex-direction: column; align-items: center; gap: 4px;
  padding: 5px 14px; background: var(--tex); background-size: 60px 100%;
  border: 4px solid ${PALETTE.contour}; box-shadow: 4px 4px 0 rgba(0,0,0,0.5);
  z-index: 6; pointer-events: none;
}
#ui-root .cadence--on { display: flex; }
#ui-root .cadence__label { font-weight: 700; font-size: 26px; letter-spacing: 1px; text-shadow: 2px 2px 0 ${PALETTE.contour}; }
#ui-root .cadence__bar { width: 130px; height: 8px; background: #120E0A; border: 2px solid ${PALETTE.contour}; box-shadow: inset 1px 1px 0 #000; }
#ui-root .cadence__fill { height: 100%; }
/* Palier : bandeau doré bref, pop pixel (steps), coins carrés. */
#ui-root .milestone {
  position: absolute; top: 150px; left: 50%; transform: translateX(-50%);
  display: none; padding: 8px 22px; background: ${PALETTE.jauneSecurite}; color: ${PALETTE.contour};
  border: 4px solid ${PALETTE.contour}; box-shadow: 5px 5px 0 rgba(0,0,0,0.5);
  font-weight: 700; font-size: 26px; letter-spacing: 2px; z-index: 7; pointer-events: none;
}
#ui-root .milestone--on { display: block; animation: milestone-pop 0.3s steps(3, end); }
@keyframes milestone-pop { from { transform: translateX(-50%) scale(0.4); } to { transform: translateX(-50%) scale(1); } }

/* ── Écran modal + panneau métal ──────────────────────────────────────── */
#ui-root .screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  background: rgba(14,11,8,0.72);
}
#ui-root .panel {
  position: relative;
  background: var(--tex);
  background-size: 90px 100%;
  border: 8px solid ${PALETTE.contour};
  box-shadow: 14px 14px 0 rgba(0,0,0,0.6),
    inset 5px 5px 0 rgba(255,255,255,0.16), inset -6px -6px 0 rgba(0,0,0,0.55);
  padding: 34px 44px;
  min-width: 460px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}
/* Rivets d'angle sur les panneaux. */
#ui-root .panel::before, #ui-root .panel::after {
  content: '';
  position: absolute;
  width: 20px; height: 20px;
  background: ${RIVET};
  box-shadow: inset 3px 3px 0 ${RIVET_HI}, inset -3px -3px 0 ${METAL_DARK};
}
#ui-root .panel::before { top: 12px; left: 12px; box-shadow: inset 3px 3px 0 ${RIVET_HI}, inset -3px -3px 0 ${METAL_DARK}, 660px 0 0 ${RIVET}; }
#ui-root .panel::after  { bottom: 12px; left: 12px; box-shadow: inset 3px 3px 0 ${RIVET_HI}, inset -3px -3px 0 ${METAL_DARK}, 660px 0 0 ${RIVET}; }
#ui-root .panel__title {
  font-family: 'Jersey 25', monospace;
  color: ${PALETTE.jauneSecurite};
  font-size: 64px;
  font-weight: 400;
  letter-spacing: 3px;
  margin: 0;
  text-shadow:
    -2px -2px 0 ${GOLD_HI}, 3px 0 0 ${PALETTE.contour}, -3px 0 0 ${PALETTE.contour},
    0 3px 0 ${PALETTE.contour}, 0 -3px 0 ${PALETTE.contour},
    5px 5px 0 ${GOLD_DK}, 9px 9px 0 ${GOLD_DEEP}, 12px 12px 0 ${PALETTE.contour};
}
#ui-root .panel__subtitle {
  font-family: 'Pixelify Sans', monospace;
  color: ${PALETTE.solSable}; font-size: 30px; font-weight: 600;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}

/* ── Menu (liste de plaques) ──────────────────────────────────────────── */
#ui-root .menu { display: flex; flex-direction: column; gap: 16px; width: 100%; }
#ui-root .menu__item {
  position: relative;
  overflow: hidden;
  pointer-events: auto;
  cursor: pointer;
  padding: 16px 26px 16px 58px;
  background: var(--tex);
  background-size: 50px 100%;
  border: 5px solid ${PALETTE.contour};
  color: #EAD9B8;
  font-family: 'Pixelify Sans', monospace;
  font-size: 30px; font-weight: 600;
  letter-spacing: 1px;
  text-align: center;
  text-shadow: 2px 2px 0 ${METAL_DARK};
  box-shadow: 6px 6px 0 rgba(0,0,0,0.5),
    inset 3px 3px 0 rgba(255,255,255,0.14), inset -4px -4px 0 rgba(0,0,0,0.5);
}
#ui-root .menu__item--focus {
  background: ${PALETTE.jauneSecurite};
  color: #3A1E06;
  text-shadow: none;
  box-shadow: 7px 7px 0 rgba(0,0,0,0.5),
    inset 4px 4px 0 rgba(255,255,255,0.5), inset -5px -5px 0 rgba(160,90,10,0.55);
}
/* Curseur cône de chantier (CSS pur, sans changement DOM) + reflet tramé. */
#ui-root .menu__item--focus::before {
  content: '';
  position: absolute;
  left: 20px; top: 50%; transform: translateY(-50%);
  width: 0; height: 0;
  border-left: 13px solid transparent; border-right: 13px solid transparent;
  border-bottom: 22px solid ${PALETTE.orangeDanger};
  filter: drop-shadow(1.5px 1.5px 0 ${PALETTE.contour});
  animation: cursorbob 0.6s steps(2) infinite;
}
#ui-root .menu__item--focus::after {
  content: '';
  position: absolute; inset: 0;
  background: var(--sheen); background-size: 8px 8px;
  animation: sheen 0.5s steps(2) infinite;
  pointer-events: none;
}
@keyframes cursorbob { 0%,100% { transform: translateY(-50%) translateX(0); } 50% { transform: translateY(-50%) translateX(4px); } }
@keyframes sheen { 0% { background-position: 0 0; } 100% { background-position: 16px 0; } }
/* Curseur cône complet (élément DOM optionnel : <span class="cone"></span> dans
   l'item/carte actif — cône orange + base sombre). Voir overlay-patch.md. */
#ui-root .cone { position: absolute; left: 16px; top: 50%; width: 42px; height: 40px; transform: translateY(-50%); animation: cursorbob 0.6s steps(2) infinite; pointer-events: none; }
#ui-root .cone::before { content:''; position:absolute; left:1px; bottom:9px; width:0; height:0; border-left:19px solid transparent; border-right:19px solid transparent; border-bottom:30px solid ${PALETTE.orangeDanger}; filter: drop-shadow(1px 1px 0 ${PALETTE.contour}); }
#ui-root .cone::after { content:''; position:absolute; left:-1px; bottom:2px; width:42px; height:10px; background:${PALETTE.brunSombre}; border:2px solid ${PALETTE.contour}; box-sizing:border-box; }

/* ── Cartes d'amélioration (level-up) ─────────────────────────────────── */
/* Co-op : plaque ENTIÈRE à la couleur sombre du joueur, bordure noire commune.
   La variable vient de playerColor(owner). En solo, écran historique inchangé. */
#ui-root .panel--owned {
  background: var(--player-panel);
  border-color: ${PALETTE.contour};
}
#ui-root .upgrade__who {
  font-family: 'Pixelify Sans'; font-size: 30px; font-weight: 700; letter-spacing: 2px;
  text-shadow: 2px 2px 0 ${PALETTE.contour}; margin: 0;
}
#ui-root .cards { display: flex; gap: 36px; }
#ui-root .card {
  position: relative;
  overflow: hidden;
  pointer-events: auto;
  cursor: pointer;
  width: 400px;
  background: var(--tex);
  background-size: 90px 100%;
  border: 6px solid ${PALETTE.contour};
  padding: 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 10px 10px 0 rgba(0,0,0,0.55),
    inset 4px 4px 0 rgba(255,255,255,0.14), inset -5px -5px 0 rgba(0,0,0,0.5);
}
#ui-root .card__icon { width: 148px; height: 148px; align-self: center; display: flex; align-items: center; justify-content: center; }
#ui-root .card__img { width: 132px; height: 132px; image-rendering: pixelated; }
#ui-root .card__mono {
  width: 110px; height: 110px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  background: ${PALETTE.brunSombre};
  border: 5px solid ${PALETTE.orangeDanger};
  color: ${PALETTE.jauneSecurite};
  font-family: 'Jersey 25', monospace; font-size: 58px;
  text-shadow: 3px 3px 0 ${PALETTE.contour};
  box-shadow: inset 3px 3px 0 rgba(255,255,255,0.15);
}
#ui-root .card--weapon .card__mono { border-color: ${PALETTE.orangeDanger}; }
#ui-root .card--passive .card__mono { border-color: ${PALETTE.cyanAccent}; color: #7FC0FF; }
#ui-root .card__name {
  font-family: 'Jersey 25', monospace;
  color: ${PALETTE.jauneSecurite}; font-size: 38px; text-align: center; line-height: 1;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .card__hint { color: ${PALETTE.solSable}; font-family: 'Pixelify Sans'; font-size: 22px; }
#ui-root .card--focus {
  background: ${PALETTE.jauneSecurite};
  box-shadow: 12px 12px 0 rgba(0,0,0,0.55),
    inset 4px 4px 0 rgba(255,255,255,0.5), inset -5px -5px 0 rgba(160,90,10,0.5);
}
#ui-root .card--focus::after {
  content: '';
  position: absolute; inset: 0;
  background: var(--sheen); background-size: 8px 8px;
  animation: sheen 0.5s steps(2) infinite; pointer-events: none;
}
#ui-root .card--focus .card__name,
#ui-root .card--focus .card__hint,
#ui-root .card--focus .card__desc,
#ui-root .card--focus .card__lvltext { color: #3A1E06; text-shadow: none; }
#ui-root .card--focus .card__mono { background: #241C16; color: ${PALETTE.jauneSecurite}; }
#ui-root .card__pips { position: relative; display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
#ui-root .pip {
  display: inline-block; width: 20px; height: 20px;
  background: ${PALETTE.brunSombre}; border: 3px solid ${PALETTE.contour};
}
#ui-root .pip.pip--on {
  background: ${PALETTE.jauneSecurite}; border-color: ${PALETTE.contour};
  box-shadow: inset 2px 2px 0 rgba(255,255,255,0.5), inset -2px -2px 0 rgba(160,90,10,0.5);
}
#ui-root .card--passive .pip.pip--on { background: ${PALETTE.cyanAccent}; }
#ui-root .card__lvltext { color: ${PALETTE.blanc}; font-family: 'Pixelify Sans'; font-size: 20px; margin-left: 6px; }
#ui-root .card__desc { position: relative; color: #EAD9B8; font-family: 'Pixelify Sans'; font-size: 26px; text-align: center; line-height: 1.15; text-shadow: 1px 1px 0 ${PALETTE.contour}; }
#ui-root .card__delta { position: relative; color: ${PALETTE.vertBonus}; font-family: 'Pixelify Sans'; font-size: 28px; font-weight: 700; text-shadow: 1px 1px 0 ${PALETTE.contour}; }

#ui-root .stats { display: flex; flex-direction: column; gap: 6px; font-family: 'Pixelify Sans'; font-size: 30px; font-weight: 600; }
#ui-root .hint-line { color: ${PALETTE.solSable}; font-family: 'Pixelify Sans'; font-size: 26px; text-shadow: 2px 2px 0 ${PALETTE.contour}; }
#ui-root .unlock-line { color: ${PALETTE.jauneSecurite}; font-family: 'Pixelify Sans'; font-size: 26px; font-weight: 700; }

/* ── Bandeaux transitoires ────────────────────────────────────────────── */
#ui-root .banner {
  position: absolute;
  top: 42%; right: 28px;
  background: ${PALETTE.orangeDanger};
  color: ${PALETTE.contour};
  border: 6px solid ${PALETTE.contour};
  box-shadow: 8px 8px 0 rgba(0,0,0,0.55);
  padding: 12px 22px;
  font-family: 'Jersey 25', monospace; font-size: 40px; letter-spacing: 2px;
  animation: banner-blink 0.5s steps(1, end) infinite;
}
@keyframes banner-blink { 50% { opacity: 0.2; } }
#ui-root .banner--boss {
  top: 30%; right: auto; left: 50%; transform: translateX(-50%);
  background: ${PALETTE.rougeAlerte}; color: ${PALETTE.blanc}; font-size: 48px;
  text-shadow: 3px 3px 0 ${PALETTE.contour};
}
#ui-root .banner--boss-final {
  top: 30%; right: auto; left: 50%; transform: translateX(-50%);
  background: ${PALETTE.contour}; color: ${PALETTE.orangeDanger};
  border-color: ${PALETTE.orangeDanger}; font-size: 48px;
  text-shadow: 3px 3px 0 ${PALETTE.rougeAlerte};
}
#ui-root .banner--evolution {
  top: 30%; right: auto; left: 50%; transform: translateX(-50%);
  background: ${PALETTE.vertBonus}; color: ${PALETTE.contour};
  border-color: ${PALETTE.jauneSecurite}; font-size: 44px;
  text-shadow: none; animation: none;
}

/* ── Trophée de succès (toast) ────────────────────────────────────────────
   Plaque commémorative qui glisse depuis le bord droit, façon trophée de
   console — mais 16-bit : coins carrés, bordure noire, ombre portée à blur 0,
   biseaux inset, glissement en steps() (jamais d'easing continu).
   Placé SOUS le HUD manettes (.pads, top:26px) pour ne pas le recouvrir.
   z-index 5 : au-dessus du HUD, sous le cadre (15) et le jackpot (20). */
#ui-root .trophy-layer { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
/* Ce nœud POSITIONNE et ne porte AUCUN transform de base : c'est ce qui laisse
   .ui-mobile y poser son scale sans entrer en collision avec l'animation de
   glissement, qui vit sur .trophy__panel. La propriété transform n'est PAS
   cumulative : un seul transform par nœud (cf. le décentrage de .bossbar). */
#ui-root .trophy { position: absolute; top: 108px; right: 28px; }
#ui-root .trophy__panel {
  display: flex; align-items: center; gap: 14px;
  max-width: 520px; padding: 12px 16px;
  background: var(--tex); background-size: 60px 100%;
  border: 5px solid ${PALETTE.contour};
  box-shadow: 8px 8px 0 rgba(0,0,0,0.55),
    inset 3px 3px 0 rgba(255,255,255,0.12), inset -4px -4px 0 rgba(0,0,0,0.5);
  /* Liseré doré : la marque « c'est une récompense », sans glow. */
  border-left: 8px solid ${PALETTE.jauneSecurite};
  animation: trophy-life 3000ms steps(7, end) both;
}
/* Glissement depuis le bord droit, maintien, puis retrait. La DURÉE est posée en
   inline par l'overlay (TROPHY_VISIBLE_MS) : une seule source pour le JS et le CSS. */
@keyframes trophy-life {
  0%   { transform: translateX(115%); }
  12%  { transform: translateX(0); }
  88%  { transform: translateX(0); }
  100% { transform: translateX(115%); }
}
/* Socle tramé de l'icône (ui_dither_dark.png). */
#ui-root .trophy__plinth {
  width: 64px; height: 64px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: ${METAL_DARK} url('${import.meta.env.BASE_URL}ui_dither_dark.png');
  border: 4px solid ${PALETTE.contour};
  box-shadow: inset 2px 2px 0 rgba(255,255,255,0.10), inset -2px -2px 0 rgba(0,0,0,0.6);
}
#ui-root .trophy__img { width: 52px; height: 52px; image-rendering: pixelated; }
#ui-root .trophy__mono {
  font-family: 'Jersey 25', monospace; font-size: 30px;
  color: ${PALETTE.jauneSecurite}; text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .trophy__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
#ui-root .trophy__label {
  font-family: 'Jersey 25', monospace; font-size: 20px; letter-spacing: 2px;
  color: ${PALETTE.jauneSecurite}; text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .trophy__name {
  font-family: 'Jersey 25', monospace; font-size: 34px; letter-spacing: 1px;
  color: ${PALETTE.blanc}; text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .trophy__desc {
  font-family: 'Pixelify Sans', monospace; font-size: 20px;
  color: ${PALETTE.solSable}; text-shadow: 1px 1px 0 ${PALETTE.contour};
}
#ui-root .trophy__seal { width: 40px; height: 40px; flex-shrink: 0; image-rendering: pixelated; }
/* Mouvement réduit : le trophée apparaît/disparaît sans glisser (il reste LU). */
@media (prefers-reduced-motion: reduce) {
  #ui-root .trophy__panel { animation: none; }
}

/* ── Barre de PV de boss ──────────────────────────────────────────────── */
#ui-root .bossbar {
  position: absolute;
  top: 26px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 18px;
  background: var(--tex); background-size: 60px 100%;
  border: 5px solid ${PALETTE.contour};
  box-shadow: 6px 6px 0 rgba(0,0,0,0.55),
    inset 3px 3px 0 rgba(255,255,255,0.12), inset -4px -4px 0 rgba(0,0,0,0.5);
}
#ui-root .bossbar__name {
  font-family: 'Jersey 25', monospace;
  color: ${PALETTE.rougeAlerte}; font-size: 30px; letter-spacing: 2px;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .bossbar__track {
  width: 520px; height: 22px;
  background: #120E0A; border: 4px solid ${PALETTE.contour};
  box-shadow: inset 2px 2px 0 #000;
}
#ui-root .bossbar__fill {
  height: 100%; background: ${PALETTE.rougeAlerte};
  box-shadow: inset 0 3px 0 rgba(255,255,255,0.3), inset 0 -3px 0 rgba(90,10,10,0.6);
}
#ui-root .bossbar--final { border-color: ${PALETTE.orangeDanger}; }
#ui-root .bossbar--final .bossbar__name { color: ${PALETTE.orangeDanger}; }
#ui-root .bossbar--final .bossbar__fill { background: ${PALETTE.orangeDanger}; }
#ui-root .bossbar__icon { width: 40px; height: 40px; image-rendering: pixelated; }

/* ── Carton d'intro de phase ──────────────────────────────────────────── */
#ui-root .stagecard {
  position: absolute;
  top: 30%; left: 50%; transform: translateX(-50%);
  background: var(--tex); background-size: 80px 100%;
  border: 6px solid ${PALETTE.contour};
  box-shadow: 10px 10px 0 rgba(0,0,0,0.55),
    inset 4px 4px 0 rgba(255,255,255,0.16), inset -5px -5px 0 rgba(0,0,0,0.5);
  padding: 26px 60px; text-align: center;
  display: flex; flex-direction: column; gap: 8px;
  animation: stagecard-in 0.35s ease-out;
}
#ui-root .stagecard__num { font-family: 'Pixelify Sans'; color: ${PALETTE.jauneSecurite}; font-size: 30px; font-weight: 700; letter-spacing: 4px; text-shadow: 2px 2px 0 ${PALETTE.contour}; }
#ui-root .stagecard__title {
  font-family: 'Jersey 25', monospace; color: ${PALETTE.blanc}; font-size: 78px; letter-spacing: 2px;
  text-shadow: -2px -2px 0 rgba(255,255,255,0.3), 4px 4px 0 ${PALETTE.contour}, 7px 7px 0 rgba(0,0,0,0.5);
}
#ui-root .stagecard__sub { font-family: 'Pixelify Sans'; color: ${PALETTE.solSable}; font-size: 30px; font-weight: 500; }
@keyframes stagecard-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* ── HUD manettes ─────────────────────────────────────────────────────── */
#ui-root .pads {
  position: absolute; top: 26px; right: 24px;
  display: flex; align-items: center; gap: 10px;
  background: var(--tex); background-size: 60px 100%;
  border: 5px solid ${PALETTE.contour};
  box-shadow: 6px 6px 0 rgba(0,0,0,0.55), inset 3px 3px 0 rgba(255,255,255,0.12);
  padding: 8px 14px;
  font-family: 'Pixelify Sans'; font-size: 24px; font-weight: 600;
  text-shadow: 1px 1px 0 ${PALETTE.contour};
}
#ui-root .pad__label { color: #EAD9B8; }
#ui-root .pad__pips { display: flex; gap: 5px; }
#ui-root .pad__pip { width: 16px; height: 16px; background: ${PALETTE.brunSombre}; border: 3px solid ${PALETTE.contour}; box-sizing: border-box; }

/* ── Inventaire ───────────────────────────────────────────────────────── */
#ui-root .inv {
  position: absolute; top: 300px; left: 24px;
  display: flex; flex-direction: column; gap: 10px;
}
#ui-root .inv__row { display: flex; flex-direction: row; gap: 12px; min-height: 80px; }
#ui-root .inv__row--passives { min-height: 54px; flex-wrap: wrap; gap: 10px; }
#ui-root .inv__tile { position: relative; width: 80px; height: 80px; box-sizing: border-box; }
#ui-root .inv__tile--sm { width: 54px; height: 54px; }
#ui-root .inv__icon { width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; }
#ui-root .inv__img { width: 80px; height: 80px; image-rendering: pixelated; }
#ui-root .inv__mono {
  width: 80px; height: 80px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  background: #241C16; border: 4px solid ${PALETTE.orangeDanger};
  color: ${PALETTE.jauneSecurite}; font-family: 'Jersey 25', monospace; font-size: 42px;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.5), inset 2px 2px 0 rgba(255,255,255,0.12);
}
#ui-root .inv__tile--sm .inv__icon { width: 54px; height: 54px; }
#ui-root .inv__tile--sm .inv__img { width: 54px; height: 54px; }
#ui-root .inv__tile--sm .inv__mono { width: 54px; height: 54px; font-size: 26px; border-color: ${PALETTE.cyanAccent}; color: #7FC0FF; }
#ui-root .inv__lvl {
  position: absolute; bottom: -7px; right: -7px;
  background: ${PALETTE.contour}; border: 2px solid ${PALETTE.jauneSecurite};
  color: ${PALETTE.blanc}; font-family: 'Pixelify Sans'; font-size: 18px; font-weight: 700;
  line-height: 1; padding: 1px 5px;
}
@keyframes inv-evolve-pulse {
  0%   { box-shadow: 3px 3px 0 rgba(0,0,0,0.5), 0 0 0 3px ${PALETTE.vertBonus}; }
  50%  { box-shadow: 3px 3px 0 rgba(0,0,0,0.5), 0 0 0 3px ${PALETTE.jauneSecurite}; }
  100% { box-shadow: 3px 3px 0 rgba(0,0,0,0.5), 0 0 0 3px ${PALETTE.vertBonus}; }
}
#ui-root .inv__tile--evolve-ready .inv__mono { border-color: ${PALETTE.vertBonus}; }
#ui-root .inv__tile--evolve-ready { animation: inv-evolve-pulse 0.6s steps(2, end) infinite; }
#ui-root .inv__evolve-mark {
  position: absolute; top: -7px; right: -7px; width: 14px; height: 14px;
  background: ${PALETTE.vertBonus}; border: 2px solid ${PALETTE.contour};
}

/* ── Machine à sous (casino) — ouverture de coffre ────────────────────── */
#ui-root .jackpot {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: var(--tex); background-size: 80px 100%;
  border: 6px solid ${PALETTE.jauneSecurite};
  box-shadow: 12px 12px 0 rgba(0,0,0,0.55),
    inset 4px 4px 0 rgba(255,255,255,0.16), inset -5px -5px 0 rgba(0,0,0,0.5);
  padding: 20px 34px 26px; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  min-width: 380px; pointer-events: none; z-index: 20;
  animation: jackpot-in 0.18s ease-out;
  /* Retour playtest : panneau x2. Propriété zoom (pas transform: scale) pour ne
     pas entrer en conflit avec les transform: translate(...) des animations
     ci-dessous (centrage + jackpot-in/rainbow) tout en gardant le pixel-art net. */
  zoom: 2;
}
#ui-root .jackpot--super { border-color: ${PALETTE.blanc}; animation: jackpot-in 0.18s ease-out, jackpot-rainbow 0.72s steps(1, end) infinite; }
#ui-root .jackpot__title, #ui-root .jackpot__chest, #ui-root .jackpot__reels, #ui-root .jackpot__reveal { position: relative; z-index: 2; }
/* Coffre PREMIUM (sprite PixelLab doré, ouvert) qui rebondit puis se balance. Le
   super coffre affiche sa variante giga-brillante. image-rendering: pixelated → DA. */
#ui-root .jackpot__chest {
  width: 96px; height: 96px; margin-top: 0;
  background: url('/shared/chest/chest_gold_open.png') center/contain no-repeat;
  image-rendering: pixelated;
  animation: jackpot-chest-pop 0.5s cubic-bezier(0.68,-0.55,0.265,1.55), jackpot-chest-bob 1.1s ease-in-out 0.5s infinite;
}
#ui-root .jackpot--super .jackpot__chest { background-image: url('/shared/chest/chest_super_open.png'); }
#ui-root .jackpot__title {
  font-family: 'Jersey 25', monospace; color: ${PALETTE.jauneSecurite};
  font-size: 46px; letter-spacing: 4px;
  text-shadow: -2px -2px 0 ${GOLD_HI}, 3px 0 0 ${PALETTE.contour}, -3px 0 0 ${PALETTE.contour},
    0 3px 0 ${PALETTE.contour}, 0 -3px 0 ${PALETTE.contour}, 5px 5px 0 ${GOLD_DK}, 8px 8px 0 ${GOLD_DEEP};
}
#ui-root .jackpot__reels { display: flex; gap: 12px; }
#ui-root .jackpot__window {
  width: 108px; height: 96px; overflow: hidden;
  border: 5px solid ${PALETTE.contour}; box-shadow: inset 3px 3px 0 #000;
  background: #120E0A; position: relative;
}
#ui-root .jackpot__window::before, #ui-root .jackpot__window::after {
  content: ''; position: absolute; left: 0; right: 0; height: 5px; background: ${PALETTE.orangeDanger}; z-index: 2; pointer-events: none;
}
#ui-root .jackpot__window::before { top: 0; }
#ui-root .jackpot__window::after { bottom: 0; }
#ui-root .jackpot__reel { display: flex; flex-direction: column; position: absolute; top: 0; left: 0; width: 100%; will-change: transform; }
#ui-root .jackpot__cell { height: 96px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
#ui-root .jackpot__cell--winner { background: ${PALETTE.brunSombre}; box-shadow: inset 0 0 0 3px ${PALETTE.jauneSecurite}; }
#ui-root .jackpot__glyph {
  font-family: 'Jersey 25', monospace; font-size: 62px; line-height: 1; color: ${PALETTE.jauneSecurite};
  text-shadow: 3px 3px 0 ${PALETTE.contour};
}
#ui-root .jackpot__cell--heal .jackpot__glyph { color: ${PALETTE.vertBonus}; }
#ui-root .jackpot__icon { width: 74px; height: 74px; display: flex; align-items: center; justify-content: center; }
#ui-root .jackpot__icon-img { width: 74px; height: 74px; image-rendering: pixelated; }
#ui-root .jackpot__icon-mono {
  font-family: 'Jersey 25', monospace; font-size: 38px; color: ${PALETTE.jauneSecurite}; text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .jackpot__reveal {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  animation: jackpot-reveal-in 0.25s ease-out;
}
#ui-root .jackpot__reveal-name {
  font-family: 'Jersey 25', monospace; color: ${PALETTE.blanc}; font-size: 30px; letter-spacing: 2px;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .jackpot__reveal-desc {
  font-family: 'Pixelify Sans', sans-serif; color: ${GOLD_HI}; font-size: 15px; max-width: 340px;
  text-align: center; line-height: 1.2; text-shadow: 1px 1px 0 ${PALETTE.contour};
}
#ui-root .jackpot__loot {
  font-family: 'Press Start 2P', monospace; color: ${PALETTE.jauneSecurite}; font-size: 12px; letter-spacing: 1px;
  margin-top: 2px; padding: 3px 10px; background: ${PALETTE.contour};
  border: 2px solid ${PALETTE.jauneSecurite}; box-shadow: 3px 3px 0 rgba(0,0,0,0.5);
}
/* Rayons dorés tournants derrière la révélation (reveal arcade P5). */
#ui-root .jackpot__rays {
  position: absolute; top: 50%; left: 50%; width: 200%; height: 200%; z-index: 0; pointer-events: none;
  transform: translate(-50%, -50%);
  background: repeating-conic-gradient(from 0deg, ${GOLD_DK} 0deg 12deg, transparent 12deg 24deg);
  opacity: 0.22; animation: jackpot-rays-spin 9s linear infinite;
}
@keyframes jackpot-rays-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
/* Pluie de pièces pixel (or) derrière les rouleaux. */
#ui-root .jackpot__coins { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 1; }
#ui-root .jackpot__coin {
  position: absolute; top: -16px; width: 12px; height: 12px; background: ${PALETTE.jauneSecurite};
  border: 2px solid ${PALETTE.contour}; box-sizing: border-box;
  animation-name: jackpot-coin-fall; animation-timing-function: linear; animation-iteration-count: infinite;
}
@keyframes jackpot-coin-fall {
  0% { transform: translateY(0) rotate(0deg); opacity: 0; }
  8% { opacity: 1; }
  100% { transform: translateY(360px) rotate(540deg); opacity: 1; }
}
@keyframes jackpot-chest-pop { 0% { transform: scale(0.3); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
@keyframes jackpot-chest-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes jackpot-reveal-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes jackpot-flash {
  0%,40%,80%,100% { box-shadow: 12px 12px 0 rgba(0,0,0,0.55); }
  20% { box-shadow: 12px 12px 0 rgba(0,0,0,0.55), 0 0 0 6px ${PALETTE.blanc}; }
  60% { box-shadow: 12px 12px 0 rgba(0,0,0,0.55), 0 0 0 6px ${PALETTE.jauneSecurite}; }
}
#ui-root .jackpot--flash { animation: jackpot-flash 0.5s steps(2, end); }
@keyframes jackpot-charge {
  0%,100% { transform: translate(-50%, -50%) translate(0,0); }
  25% { transform: translate(-50%, -50%) translate(3px,-3px); }
  75% { transform: translate(-50%, -50%) translate(-3px,3px); }
}
#ui-root .jackpot--charging { animation: jackpot-charge 0.2s steps(2, end) infinite; }
@keyframes jackpot-rainbow {
  0% { border-color: ${PALETTE.rougeAlerte}; }
  17% { border-color: ${PALETTE.orangeDanger}; }
  34% { border-color: ${PALETTE.jauneSecurite}; }
  50% { border-color: ${PALETTE.vertBonus}; }
  67% { border-color: ${PALETTE.cyanAccent}; }
  84% { border-color: ${PALETTE.blanc}; }
  100% { border-color: ${PALETTE.rougeAlerte}; }
}
@keyframes jackpot-in { from { opacity: 0; transform: translate(-50%, calc(-50% - 10px)); } to { opacity: 1; transform: translate(-50%, -50%); } }

/* ── Mini-carte ───────────────────────────────────────────────────────── */
#ui-root .minimap {
  position: absolute; left: 24px; bottom: 24px;
  display: flex; flex-direction: column; gap: 6px;
  background: var(--tex); background-size: 60px 100%;
  border: 5px solid ${PALETTE.contour};
  box-shadow: 6px 6px 0 rgba(0,0,0,0.55), inset 3px 3px 0 rgba(255,255,255,0.12);
  padding: 8px;
}
#ui-root .minimap__counter { font-family: 'Pixelify Sans'; color: ${PALETTE.jauneSecurite}; font-size: 22px; font-weight: 700; text-shadow: 1px 1px 0 ${PALETTE.contour}; }
#ui-root .minimap__field {
  position: relative; background: #0E1A12; border: 4px solid ${PALETTE.contour};
  box-shadow: inset 2px 2px 0 #000; box-sizing: border-box; overflow: hidden;
  background-image: repeating-linear-gradient(0deg, rgba(61,220,132,0.10) 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, rgba(61,220,132,0.10) 0 1px, transparent 1px 22px);
}
#ui-root .minimap__dot { position: absolute; width: 8px; height: 8px; margin-left: -4px; margin-top: -4px; background: ${PALETTE.blanc}; box-sizing: border-box; border: 1px solid ${PALETTE.contour}; }
#ui-root .minimap__player { position: absolute; }
#ui-root .minimap__player__chevron {
  width: 0; height: 0;
  border-left: 7px solid transparent; border-right: 7px solid transparent;
  border-bottom: 12px solid ${PALETTE.jauneSecurite};
  filter: drop-shadow(1px 1px 0 ${PALETTE.contour});
}
#ui-root .minimap__dot--prisoner { background: ${PALETTE.vertBonus}; }
#ui-root .minimap__dot--boss { width: 10px; height: 10px; margin-left: -5px; margin-top: -5px; background: ${PALETTE.rougeAlerte}; }
#ui-root .minimap__dot--coffre { background: ${PALETTE.jauneSecurite}; border-color: ${PALETTE.orangeDanger}; }

/* ── Rapport de chantier (game over) ──────────────────────────────────── */
#ui-root .report__title {
  font-family: 'Jersey 25', monospace; color: ${PALETTE.rougeAlerte};
  font-size: 60px; letter-spacing: 2px; margin: 0;
  text-shadow: -2px -2px 0 #FF9A8E, 3px 0 0 ${PALETTE.contour}, -3px 0 0 ${PALETTE.contour},
    0 3px 0 ${PALETTE.contour}, 0 -3px 0 ${PALETTE.contour}, 5px 5px 0 #6e1008, 9px 9px 0 ${PALETTE.contour};
}
#ui-root .report__quote {
  color: ${PALETTE.solSable}; font-family: 'Pixelify Sans'; font-size: 26px;
  text-align: center; max-width: 640px; line-height: 1.3;
  border: 3px solid ${PALETTE.brunSombre}; padding: 8px 16px;
}
#ui-root .report__quote--cult { color: ${PALETTE.orangeDanger}; font-size: 30px; font-weight: 700; border-color: ${PALETTE.rougeAlerte}; text-shadow: 1px 1px 0 ${PALETTE.contour}; }
#ui-root .report__bar {
  position: relative; width: 100%; max-width: 640px; height: 68px;
  background: ${PALETTE.brunSombre}; border: 4px solid ${PALETTE.contour};
  box-shadow: 4px 4px 0 rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;
}
#ui-root .report__start, #ui-root .report__end { width: 64px; height: 64px; image-rendering: pixelated; flex-shrink: 0; position: relative; z-index: 2; }
#ui-root .report__marker { position: absolute; width: 64px; height: 64px; image-rendering: pixelated; transform: translateX(-50%); z-index: 3; top: 2px; }
/* Jauge de progression : remplit le rail en jaune sécurité jusqu'au point atteint.
   z-index 1 = SOUS le plot/casque/drapeau (z 2-3), sinon elle les recouvrirait. */
#ui-root .report__fill {
  position: absolute; left: 0; top: 0; bottom: 0; z-index: 1;
  background: ${PALETTE.jauneSecurite};
  border-right: 3px solid ${PALETTE.contour};
  box-shadow: inset 0 -6px 0 rgba(0,0,0,0.22);
}
/* Étoiles 0-3 : les 3 emplacements sont TOUJOURS affichés (les vides en gris),
   pour que le joueur voie ce qu'il n'a pas décroché. */
#ui-root .report__stars { display: flex; gap: 10px; justify-content: center; }
#ui-root .report__star { width: 56px; height: 56px; image-rendering: pixelated; }
#ui-root .report__star--on { filter: drop-shadow(0 0 6px ${PALETTE.jauneSecurite}); }
/* Podium (co-op) : trophée / croix + verdict, sur la ligne du joueur concerné. */
#ui-root .report__trophy, #ui-root .report__cross { width: 28px; height: 28px; image-rendering: pixelated; align-self: center; }
#ui-root .report__verdict { font-family: 'Pixelify Sans'; font-size: 18px; }
#ui-root .report__verdict--praise { color: ${PALETTE.jauneSecurite}; }
#ui-root .report__verdict--mock { color: ${PALETTE.orangeDanger}; }
#ui-root .report__stats { display: flex; flex-direction: column; gap: 6px; font-family: 'Pixelify Sans'; font-size: 28px; color: ${PALETTE.blanc}; text-align: center; }
/* ── Compacité du rapport ───────────────────────────────────────────────────
   Le panneau est en overflow:hidden (pour les rayons) : tout ce qui dépasse est
   CLIPPÉ, pas scrollable — et le jeu doit rester 100 % manette, donc on ne peut
   pas compter sur un scroll pour atteindre le menu. Avec le récap par joueur
   (co-op) le menu « Recommencer » tombait 265 px sous l'écran en 1280×720 :
   inatteignable. Tout est donc resserré pour tenir jusqu'à 4 joueurs. */
#ui-root .report { padding: 16px 44px; gap: 8px; }
#ui-root .report .report__stats {
  display: grid; grid-template-columns: repeat(2, auto); gap: 2px 28px;
  font-size: 22px; text-align: left;
}
#ui-root .report .report__title { font-size: 44px; }
#ui-root .report .report__quote { font-size: 20px; padding: 4px 12px; }
#ui-root .report .report__quote--cult { font-size: 22px; }
#ui-root .report .report__bar { height: 52px; }
#ui-root .report .report__start, #ui-root .report .report__end,
#ui-root .report .report__marker { width: 48px; height: 48px; }
#ui-root .report .report__star { width: 44px; height: 44px; }
#ui-root .report .report__prow { font-size: 18px; gap: 10px; }
#ui-root .report .menu__item { font-size: 22px; }
/* Récap par joueur (co-op) — une ligne par joueur, à sa couleur, atténuée s'il est tombé. */
#ui-root .report__players { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
#ui-root .report__prow {
  display: flex; gap: 14px; align-items: baseline; justify-content: center;
  font-family: 'Pixelify Sans'; font-size: 22px; color: ${PALETTE.solSable};
}
#ui-root .report__prow--dead { opacity: 0.5; }
#ui-root .report__pid { font-weight: 700; min-width: 34px; text-shadow: 2px 2px 0 ${PALETTE.contour}; }
/* ── Variante VICTOIRE : même rapport, ton festif (or + vert) ──────────────── */
#ui-root .report { position: relative; overflow: hidden; }
#ui-root .report > * { position: relative; z-index: 2; }
#ui-root .report--victory { border-color: ${PALETTE.jauneSecurite}; }
#ui-root .report--victory .report__title {
  color: ${PALETTE.jauneSecurite};
  text-shadow: -2px -2px 0 #FFF4CC, 3px 0 0 ${PALETTE.contour}, -3px 0 0 ${PALETTE.contour},
    0 3px 0 ${PALETTE.contour}, 0 -3px 0 ${PALETTE.contour}, 5px 5px 0 #C85A12, 9px 9px 0 ${PALETTE.contour};
}
#ui-root .report--victory .report__quote { color: ${PALETTE.vertBonus}; border-color: ${PALETTE.jauneSecurite}; }
/* Rayons dorés tournants derrière le rapport — festif, sans nouvel asset. */
#ui-root .report__rays {
  position: absolute; top: 50%; left: 50%; width: 220%; height: 220%; z-index: 0; pointer-events: none;
  transform: translate(-50%, -50%);
  background: repeating-conic-gradient(from 0deg, ${PALETTE.jauneSecurite} 0deg 10deg, transparent 10deg 20deg);
  opacity: 0.10; animation: report-rays-spin 14s linear infinite;
}
@keyframes report-rays-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { #ui-root .report__rays { animation: none; } }

/* ── Bordure d'écran optionnelle (cadre métal ouvragé) ────────────────── */
/* Ajoute <div class="frame"></div> comme 1er enfant de #ui-root pour encadrer
   l'écran comme sur les maquettes 16-bit premium (Demon's Crest). Purement
   décoratif, pointer-events:none. */
#ui-root .frame { position: absolute; inset: 0; pointer-events: none; z-index: 15; }
#ui-root .frame::before {
  content: ''; position: absolute; inset: 0;
  border: 12px solid ${PALETTE.contour};
  box-shadow: inset 0 0 0 5px ${METAL_LIGHT}, inset 0 0 0 44px transparent;
}
#ui-root .frame__scan {
  position: absolute; inset: 0; pointer-events: none; z-index: 16;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 4px);
}
/* Décor titre (backdrop tramé bg_dusk derrière le panneau du titre). Ajouter
   <img class="title-bg" src=".../ui_bg_dusk.png"> en 1er enfant du .screen du titre,
   et donner au .screen du titre la classe .screen--title. cf. overlay-patch.md */
#ui-root .title-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
#ui-root .screen--title { background: rgba(6,8,16,0.30); }

/* ── Transition d'écran : sas de chantier + gyrophare ────────────────── */
/* Overlay plein écran. Ajoute la classe .is-closed pour fermer le sas (JS), retire
   pour l'ouvrir. cf. overlay-patch.md pour la séquence fermer→swap→ouvrir. */
#ui-root .transition { position: absolute; inset: 0; z-index: 60; pointer-events: none; overflow: hidden; }
#ui-root .transition__door { position: absolute; top: 0; bottom: 0; width: 51%; background: var(--tex); background-size: 120px 100%; image-rendering: pixelated; transition: transform 0.45s steps(6); }
#ui-root .transition__door--l { left: 0; transform: translateX(-101%); border-right: 6px solid ${PALETTE.contour}; box-shadow: inset 6px 0 0 rgba(255,255,255,0.14), inset -10px 0 0 rgba(0,0,0,0.55); }
#ui-root .transition__door--r { right: 0; transform: translateX(101%); border-left: 6px solid ${PALETTE.contour}; box-shadow: inset -6px 0 0 rgba(255,255,255,0.14), inset 10px 0 0 rgba(0,0,0,0.55); }
#ui-root .transition__door--l::after { content: ''; position: absolute; top: 0; bottom: 0; right: 0; width: 20px; background: repeating-linear-gradient(0deg, ${PALETTE.jauneSecurite} 0 18px, ${PALETTE.contour} 18px 36px); border-left: 4px solid ${PALETTE.contour}; }
#ui-root .transition__door--r::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 20px; background: repeating-linear-gradient(0deg, ${PALETTE.jauneSecurite} 0 18px, ${PALETTE.contour} 18px 36px); border-right: 4px solid ${PALETTE.contour}; }
#ui-root .transition.is-closed .transition__door--l, #ui-root .transition.is-closed .transition__door--r { transform: translateX(0); }
#ui-root .transition__hub { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; opacity: 0; transition: opacity 0.2s; }
#ui-root .transition.is-closed .transition__hub { opacity: 1; }
#ui-root .transition__gyro { position: relative; width: 220px; height: 220px; display: flex; align-items: center; justify-content: center; }
#ui-root .transition__gyro::before { content: ''; position: absolute; inset: 0; background: repeating-conic-gradient(from 0deg, rgba(232,111,31,0.5) 0deg 18deg, transparent 18deg 36deg); animation: sweep 1.4s linear infinite; }
#ui-root .transition__beacon { position: relative; width: 110px; height: 64px; background: ${PALETTE.orangeDanger}; border: 6px solid ${PALETTE.contour}; box-shadow: 6px 6px 0 rgba(0,0,0,0.5), inset 4px 4px 0 rgba(255,255,255,0.35); }
#ui-root .transition__label { font-family: 'Jersey 25', monospace; font-size: 48px; letter-spacing: 4px; color: ${PALETTE.jauneSecurite}; background: ${PALETTE.contour}; border: 5px solid ${PALETTE.jauneSecurite}; box-shadow: 8px 8px 0 rgba(0,0,0,0.5); padding: 12px 36px; animation: banner-blink 0.9s steps(1) infinite; }
@keyframes sweep { to { transform: rotate(360deg); } }

/* ── Splash studio (avant le titre) ───────────────────────────────────── */
/* Overlay plein écran joué UNE fois puis retiré par JS (voir overlay-patch.md).
   Ajoute <img class="splash__helmet" src=".../ui_casque.png"> + le nom + PRÉSENTE. */
#ui-root .splash { position: absolute; inset: 0; z-index: 70; background: #08080d; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; }
#ui-root .splash__gyro { position: absolute; top: -240px; left: 50%; width: 1000px; height: 1000px; margin-left: -500px; background: repeating-conic-gradient(from 0deg, rgba(232,111,31,0.07) 0deg 20deg, transparent 20deg 40deg); animation: sweep 9s linear infinite; pointer-events: none; }
#ui-root .splash__flash { position: absolute; inset: 0; background: ${GOLD_HI}; opacity: 0; animation: splash-flash 3.4s steps(2) forwards; pointer-events: none; }
#ui-root .splash__helmet { position: relative; width: 150px; height: auto; image-rendering: pixelated; transform-origin: 50% 100%; animation: splash-drop 3.4s steps(1) forwards; }
#ui-root .splash__name { position: relative; text-align: center; font-family: 'Jersey 25', monospace; font-size: 108px; letter-spacing: 4px; color: ${PALETTE.jauneSecurite}; animation: splash-text 3.4s steps(1) forwards; text-shadow: -2px -2px 0 ${GOLD_HI}, 3px 0 ${PALETTE.contour}, -3px 0 ${PALETTE.contour}, 0 3px ${PALETTE.contour}, 0 -3px ${PALETTE.contour}, 6px 6px 0 ${GOLD_DK}, 10px 10px 0 ${GOLD_DEEP}, 13px 13px 0 ${PALETTE.contour}; }
#ui-root .splash__tag { position: relative; font-family: 'Pixelify Sans', monospace; font-weight: 700; font-size: 34px; letter-spacing: 6px; color: #E8B27A; background: ${PALETTE.contour}; border: 5px solid ${PALETTE.jauneSecurite}; box-shadow: 6px 6px 0 rgba(0,0,0,0.5); padding: 8px 28px; animation: splash-text 3.4s steps(1) forwards; }
@keyframes splash-drop { 0% { transform: translateY(-500px); } 38% { transform: translateY(0) scaleY(1); } 45% { transform: translateY(0) scaleY(0.72) scaleX(1.2); } 55% { transform: translateY(-46px); } 66% { transform: translateY(0) scaleY(0.9); } 74%, 100% { transform: translateY(0) scaleY(1); } }
@keyframes splash-flash { 0%, 40% { opacity: 0; } 43% { opacity: 0.85; } 54%, 100% { opacity: 0; } }
@keyframes splash-text { 0%, 46% { opacity: 0; transform: translateY(10px); } 58%, 100% { opacity: 1; transform: translateY(0); } }
/* Invite « appuie pour commencer » : clignote APRÈS le reveal (le splash persiste jusqu'au 1er input). */
#ui-root .splash__hint { position: relative; margin-top: 6px; font-family: 'Pixelify Sans', monospace; font-weight: 700; font-size: 22px; letter-spacing: 5px; color: #E8B27A; opacity: 0; animation: splash-hint 1.1s steps(2) 3.4s infinite; }
/* Retrait : court fondu piloté par JS (dismissStudioSplash ajoute .splash--out). */
#ui-root .splash.splash--out { animation: splash-out 0.4s ease forwards; pointer-events: none; }
@keyframes splash-hint { 0%, 49% { opacity: 0.18; } 50%, 100% { opacity: 0.95; } }
@keyframes splash-out { to { opacity: 0; } }

/* ── Contrôles tactiles (mobile) : stick zone-gauche dynamique + bouton pause ── */
/* Overlay créé UNIQUEMENT sur device tactile (TouchInput) ; affiché en jeu. Coins carrés, palette imposée. */
#ui-root .touch-layer { position: absolute; inset: 0; z-index: 40; pointer-events: auto; touch-action: none; }
#ui-root .touch-stick { position: absolute; left: max(28px, env(safe-area-inset-left)); bottom: max(28px, env(safe-area-inset-bottom)); width: 132px; height: 132px; box-sizing: border-box; background: ${PALETTE.brunSombre}; border: 4px solid ${PALETTE.contour}; box-shadow: 5px 5px 0 rgba(0,0,0,0.45); opacity: 0.5; }
#ui-root .touch-stick.touch-stick--active { transform: translate(-50%, -50%); opacity: 0.95; }
#ui-root .touch-stick__knob { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 58px; height: 58px; box-sizing: border-box; background: ${PALETTE.solSable}; border: 4px solid ${PALETTE.contour}; box-shadow: 3px 3px 0 rgba(0,0,0,0.5); }
#ui-root .touch-pause { position: absolute; right: max(24px, env(safe-area-inset-right)); bottom: max(28px, env(safe-area-inset-bottom)); width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; pointer-events: auto; font-family: 'Pixelify Sans', monospace; font-weight: 700; font-size: 30px; letter-spacing: 4px; color: ${PALETTE.jauneSecurite}; background: ${PALETTE.contour}; border: 4px solid ${PALETTE.jauneSecurite}; box-shadow: 5px 5px 0 rgba(0,0,0,0.5); }

/* ── Mode compact mobile (#ui-root.ui-mobile) — piloté par --ui-scale ────────── */
/* Posé seulement si viewport étroit / tactile (Overlay.applyResponsive). Desktop → jamais (aucun de ces sélecteurs ne matche). */
#ui-root.ui-mobile .hud { transform: scale(var(--ui-scale, 1)); transform-origin: top left; }
#ui-root.ui-mobile .pads { display: none; }
#ui-root.ui-mobile .inv { transform: scale(var(--ui-scale, 1)); transform-origin: top left; }
#ui-root.ui-mobile .banner { transform: scale(var(--ui-scale, 1)); transform-origin: top right; }
#ui-root.ui-mobile .bossbar { transform: translateX(-50%) scale(var(--ui-scale, 1)); transform-origin: top center; }
#ui-root.ui-mobile .banner--boss, #ui-root.ui-mobile .banner--boss-final, #ui-root.ui-mobile .banner--evolution { transform: translateX(-50%) scale(var(--ui-scale, 1)); transform-origin: top center; }
/* Trophée : le scale se pose sur .trophy, qui n'a AUCUN transform de base — donc
   rien à répéter ici (contrairement à .bossbar, dont le translateX doit être
   redit sous peine de décentrage). Le glissement vit sur .trophy__panel, un
   AUTRE nœud : les deux transforms ne se marchent jamais dessus. */
#ui-root.ui-mobile .trophy { transform: scale(var(--ui-scale, 1)); transform-origin: top right; }
/* Écran étroit : la plaque ne doit pas déborder ni écraser le HUD. */
#ui-root.ui-mobile .trophy__panel { max-width: 380px; }
#ui-root.ui-mobile .stagecard { transform: translateX(-50%) scale(var(--ui-scale, 1)); transform-origin: top center; }
#ui-root.ui-mobile .panel { transform: scale(var(--ui-scale, 1)); transform-origin: center; min-width: 0; max-width: 96vw; }
#ui-root.ui-mobile .jackpot { min-width: 0; max-width: 96vw; }
/* Cartes d'upgrade : pile verticale (choix user), tapables, scroll si débordement (paysage). */
#ui-root.ui-mobile .cards { flex-direction: column; gap: 10px; align-items: center; max-height: 88vh; overflow-y: auto; }
#ui-root.ui-mobile .card { width: min(80vw, 300px); }
/* Minimap : plus petite (JS setCompact) + déplacée en haut-droite (hors zone du pouce/stick). */
#ui-root.ui-mobile .minimap { left: auto; bottom: auto; right: max(12px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); padding: 5px; }

/* ─────────────────────────────────────────────────────────────────────────
   Refonte ARCADE (BTP Carnage) — tokens couleur + cadre métal/CRT + keyframes.
   Couleurs LOCALES (jamais dans palette.ts). Repère : maquette planche 2a.
   ───────────────────────────────────────────────────────────────────────── */
:root {
  --arc-jaune: #FFD24A; --arc-jaune-clair: #FFF4CC; --arc-jaune2: #FFE9A8;
  --arc-orange: #E86F1F; --arc-orange2: #F26A22;
  --arc-ombre1: #C85A12; --arc-ombre2: #9c440d; --arc-ombre3: #6e2f08; --arc-ombre4: #4a1404;
  --arc-rouge: #D83B2D; --arc-contour: #101014;
  --arc-brun1: #2B2018; --arc-brun2: #241C16; --arc-brun3: #17120E;
  --arc-creme: #EAD9B8; --arc-creme2: #E8B27A;
}
#ui-root .arc-metal { background: url('ui_metal_v.png') repeat, var(--arc-brun2); box-shadow: inset 0 2px 0 rgba(255,255,255,.14), inset 0 -3px 0 rgba(0,0,0,.5); }
#ui-root .arc-crt { background-image: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 2px, transparent 2px 4px); }
@keyframes slamIn {
  0% { opacity: 0; transform: scale(5.2) translateY(-90px) rotate(-5deg); }
  9% { opacity: 0; transform: scale(4.6) translateY(-70px) rotate(-4deg); animation-timing-function: cubic-bezier(.75,0,.95,.25); }
  10% { opacity: 1; transform: scale(.74) translateY(12px) rotate(2.4deg); }   /* SLAM — écrasement à l'impact */
  12% { transform: scale(1.18) translateY(-8px) rotate(-1.6deg); }              /* rebond violent */
  13.5% { transform: translateX(-10px) scale(1.02) rotate(1.1deg); }            /* secousses */
  15% { transform: translateX(9px) scale(.97) rotate(-.8deg); }
  16.5% { transform: translateX(-6px) scale(1.015) rotate(.5deg); }
  18% { transform: translateX(4px) scale(.995) rotate(-.3deg); }
  19.5% { transform: translateX(-2px) scale(1.012); }
  21% { transform: scale(.998); }
  24%, 100% { transform: scale(1) translateY(0) rotate(0); }
}
@keyframes impactFlash { 0%, 9% { opacity: 0; } 10% { opacity: .92; } 15% { opacity: 0; } 100% { opacity: 0; } }
@keyframes impactDust { 0%, 9% { opacity: 0; transform: scaleX(.3) scaleY(.5); } 11% { opacity: .95; transform: scaleX(1) scaleY(1); } 22% { opacity: 0; transform: scaleX(1.7) scaleY(1.5); } 100% { opacity: 0; } }
@keyframes blinkSlow { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
/* Logo sculpté BTP / CARNAGE (titre 2a, Metal Slug) — fidèle à la maquette :
   géant, biseau étagé (highlight + contour 4px + 3 couches d'ombre) + slam-in
   qui reboucle. Tailles en clamp() + ombres en em → proportionnel jusqu'au mobile. */
#ui-root .logo { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; will-change: transform; }
/* Slam-in joué UNE fois à l'entrée sur le titre (classe .arc-slam posée par l'overlay). */
#ui-root.arc-slam .logo { animation: slamIn 5s cubic-bezier(.2,.9,.3,1) both; }
#ui-root .logo__topper { display: flex; align-items: center; gap: 14px; font-family: 'Pixelify Sans'; font-weight: 700; font-size: clamp(16px, 3vw, 38px); color: var(--arc-creme2); letter-spacing: 8px; text-shadow: 2px 2px 0 var(--arc-contour); white-space: nowrap; }
#ui-root .logo__topper::before, #ui-root .logo__topper::after { content: ''; height: 5px; width: clamp(40px, 8vw, 120px); }
#ui-root .logo__topper::before { background: linear-gradient(90deg, transparent, var(--arc-creme2)); }
#ui-root .logo__topper::after { background: linear-gradient(90deg, var(--arc-creme2), transparent); }
#ui-root .logo__btp { font-family: 'Jersey 25'; font-size: clamp(52px, 12vw, 150px); line-height: .8; color: var(--arc-jaune); letter-spacing: 6px; text-shadow: -0.02em -0.02em 0 var(--arc-jaune-clair), 0.02em 0 0 var(--arc-contour), -0.02em 0 0 var(--arc-contour), 0 0.02em 0 var(--arc-contour), 0 -0.02em 0 var(--arc-contour), 0.033em 0.033em 0 var(--arc-ombre1), 0.06em 0.06em 0 var(--arc-ombre2), 0.087em 0.087em 0 var(--arc-ombre3), 0.107em 0.107em 0 var(--arc-contour); }
#ui-root .logo__carnage { font-family: 'Jersey 25'; font-size: clamp(88px, 20vw, 250px); line-height: .78; margin-top: -.03em; color: var(--arc-orange2); letter-spacing: 2px; text-shadow: -0.012em -0.012em 0 #FFD08A, 0.016em 0 0 var(--arc-contour), -0.016em 0 0 var(--arc-contour), 0 0.016em 0 var(--arc-contour), 0 -0.016em 0 var(--arc-contour), 0.028em 0.028em 0 #B23A0C, 0.048em 0.048em 0 #7c2408, 0.068em 0.068em 0 var(--arc-ombre4), 0.088em 0.096em 0 rgba(0,0,0,.55); }
#ui-root .logo__dust { width: min(640px, 80vw); height: 40px; margin-top: 6px; background: radial-gradient(ellipse at center, rgba(120,96,64,.95) 0%, rgba(120,96,64,0) 70%); transform-origin: center top; opacity: 0; }
#ui-root.arc-slam .logo__dust { animation: impactDust 5s ease-out both; }
#ui-root .logo__flash { position: absolute; left: 50%; top: 52%; width: 150%; height: 220%; transform: translate(-50%, -50%); z-index: -1; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(255,244,204,.95) 0%, rgba(255,210,74,.45) 34%, rgba(255,210,74,0) 66%); }
#ui-root.arc-slam .logo__flash { animation: impactFlash 5s ease-out both; }

/* ── Habillage arcade de l'écran titre (planche 2a) ───────────────────────── */
@keyframes blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
@keyframes tapeflow { from { background-position: 0 0; } to { background-position: 88px 0; } }
#ui-root .screen--title { position: absolute; inset: 0; }
#ui-root .arcbar { position: absolute; top: max(14px, env(safe-area-inset-top)); left: 24px; right: 24px; display: flex; justify-content: space-between; font-family: 'Press Start 2P'; font-size: clamp(9px, 1.5vw, 15px); color: var(--arc-jaune); text-shadow: 2px 2px 0 var(--arc-contour); letter-spacing: 1px; z-index: 4; }
#ui-root .arcbar__hi { color: var(--arc-jaune-clair); }
#ui-root .arcbar__2up { color: #ff5a5a; }
#ui-root .title-chrome { position: absolute; bottom: max(18px, env(safe-area-inset-bottom)); left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; z-index: 4; }
#ui-root .insertcoin { background: var(--arc-contour); border: 4px solid var(--arc-orange2); box-shadow: 5px 5px 0 rgba(0,0,0,.5); padding: 6px clamp(14px, 4vw, 30px); font-family: 'Press Start 2P'; font-size: clamp(12px, 3vw, 26px); color: var(--arc-jaune); letter-spacing: 3px; animation: blink .9s steps(1, end) infinite; }
#ui-root .pushstart { width: min(600px, 90vw); height: clamp(38px, 8vw, 56px); background: repeating-linear-gradient(45deg, var(--arc-jaune) 0 22px, var(--arc-contour) 22px 44px); background-size: 88px 100%; border: 5px solid var(--arc-contour); box-shadow: 6px 6px 0 rgba(0,0,0,.5); animation: tapeflow 1.2s linear infinite; display: flex; align-items: center; justify-content: center; }
#ui-root .pushstart__label { display: inline-flex; align-items: center; gap: 12px; background: var(--arc-contour); padding: 5px 22px; font-family: 'Press Start 2P'; font-size: clamp(11px, 2.4vw, 22px); color: var(--arc-jaune); letter-spacing: 2px; animation: blink 1s steps(1, end) infinite; }
#ui-root .pushstart__label::before, #ui-root .pushstart__label::after { content: ''; width: 0; height: 0; border-top: .5em solid transparent; border-bottom: .5em solid transparent; }
#ui-root .pushstart__label::before { border-right: .6em solid var(--arc-jaune); }
#ui-root .pushstart__label::after { border-left: .6em solid var(--arc-jaune); }
#ui-root .title-credits { display: flex; justify-content: space-between; width: min(680px, 92vw); font-family: 'VT323'; letter-spacing: 1px; }
#ui-root .credit { font-size: clamp(16px, 2.4vw, 30px); color: var(--arc-creme); }
#ui-root .credit::after { content: ' 00'; color: var(--arc-jaune); }
#ui-root .studio { font-size: clamp(14px, 2.2vw, 28px); color: #B78345; }
/* Ouvriers assombris (frame 0 = face) en silhouette d'ambiance, aux coins bas. */
#ui-root .title-crew { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
#ui-root .crew-fig { position: absolute; bottom: clamp(64px, 13vh, 150px); width: clamp(84px, 12vw, 150px); height: clamp(84px, 12vw, 150px); overflow: hidden; filter: brightness(.5) contrast(1.1) saturate(.8); opacity: .7; }
#ui-root .crew-fig__img { position: absolute; left: 0; top: 0; width: 400%; height: 400%; image-rendering: pixelated; }
#ui-root .crew-fig--left { left: clamp(6px, 6vw, 120px); }
#ui-root .crew-fig--right { right: clamp(6px, 6vw, 120px); transform: scaleX(-1); }
/* --- Sélecteur de personnage (écran « SELECT YOUR CREW » arcade) ---------- */
#ui-root .panel--charsel { width: min(1080px, 96vw); gap: 14px; }
#ui-root .charsel__heading { font-family: 'Press Start 2P'; font-size: clamp(16px, 3.4vw, 34px); color: var(--arc-jaune); letter-spacing: 2px; text-shadow: 3px 3px 0 var(--arc-contour); margin: 0; }
#ui-root .charsel__who { font-family: 'Press Start 2P'; font-size: clamp(9px, 1.6vw, 15px); letter-spacing: 2px; text-shadow: 2px 2px 0 var(--arc-contour); margin: 0; }
#ui-root .charsel-board { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; width: 100%; }
#ui-root .charsel-board--1 { grid-template-columns: minmax(0, 520px); justify-content: center; }
#ui-root .charsel-card { --charsel-player: var(--arc-jaune); position: relative; display: grid; grid-template-columns: clamp(92px, 13vw, 144px) minmax(0, 1fr); grid-template-rows: auto 1fr auto; gap: 8px 12px; align-items: center; min-width: 0; padding: 12px; background: var(--arc-brun3); border: 5px solid var(--charsel-player); box-shadow: 5px 5px 0 var(--arc-contour); }
#ui-root .charsel-card--ready { background: var(--arc-brun2); box-shadow: inset 0 0 0 4px var(--charsel-player), 5px 5px 0 var(--arc-contour); }
#ui-root .charsel-card--ready::after { content: ''; position: absolute; inset: 6px; border: 2px solid var(--charsel-player); pointer-events: none; }
#ui-root .charsel-card .charsel__who { grid-column: 1 / -1; color: var(--charsel-player); }
#ui-root .charsel-card__portrait { grid-column: 1; grid-row: 2 / 4; }
#ui-root .charsel-card__name { grid-column: 2; align-self: end; }
#ui-root .charsel-card__weapon { grid-column: 2; align-self: start; min-width: 0; flex-wrap: wrap; }
#ui-root .charsel__stage { display: flex; align-items: center; gap: clamp(14px, 3vw, 30px); width: 100%; }
#ui-root .charsel-portrait { position: relative; flex: 0 0 auto; width: clamp(140px, 26vw, 208px); height: clamp(140px, 26vw, 208px); overflow: hidden; background: var(--arc-brun3); border: 5px solid var(--arc-contour); box-shadow: inset 0 0 0 3px var(--arc-orange2), 6px 6px 0 rgba(0,0,0,.5); image-rendering: pixelated; }
#ui-root .charsel-card__portrait { width: clamp(92px, 13vw, 144px); height: clamp(92px, 13vw, 144px); border-color: var(--charsel-player); box-shadow: inset 0 0 0 3px var(--arc-contour); }
#ui-root .charsel-portrait__img { position: absolute; left: 0; top: 0; width: 400%; height: 400%; image-rendering: pixelated; }
#ui-root .charsel__info { flex: 1 1 auto; display: flex; flex-direction: column; gap: 8px; text-align: left; min-width: 0; }
#ui-root .charsel__name { font-family: 'Jersey 25'; font-size: clamp(34px, 7vw, 62px); line-height: .9; color: var(--arc-jaune); letter-spacing: 2px; text-shadow: 0.03em 0.03em 0 var(--arc-ombre2), 0.06em 0.06em 0 var(--arc-contour); }
#ui-root .charsel-card__name { font-size: clamp(24px, 3.5vw, 42px); color: var(--charsel-player); overflow-wrap: anywhere; }
#ui-root .charsel__weapon { display: flex; align-items: baseline; gap: 10px; font-family: 'Pixelify Sans'; }
#ui-root .charsel__weapon-label { font-family: 'Press Start 2P'; font-size: clamp(8px, 1.3vw, 12px); color: var(--arc-creme2); letter-spacing: 1px; }
#ui-root .charsel__weapon-name { font-size: clamp(18px, 3vw, 28px); font-weight: 700; color: var(--arc-orange2); text-shadow: 2px 2px 0 var(--arc-contour); }
#ui-root .charsel__desc { font-family: 'Pixelify Sans'; font-size: clamp(13px, 2vw, 18px); color: var(--arc-creme); margin: 0; line-height: 1.25; }
#ui-root .charsel__punch { font-family: 'Pixelify Sans'; font-style: italic; font-size: clamp(13px, 2vw, 19px); color: var(--arc-jaune-clair); margin: 2px 0 0; line-height: 1.2; }
#ui-root .charsel-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px; width: 100%; }
#ui-root .charsel-cell { position: relative; aspect-ratio: 1; overflow: hidden; background: var(--arc-brun3); border: 3px solid var(--arc-contour); filter: brightness(.62) saturate(.8); }
#ui-root .charsel-cell--active { filter: none; border-color: var(--arc-jaune); box-shadow: 0 0 0 3px var(--arc-orange2), 0 0 14px rgba(255,210,74,.6); }
#ui-root .charsel-cell__img { position: absolute; left: 0; top: 0; width: 400%; height: 400%; image-rendering: pixelated; }
@media (max-width: 720px) {
  #ui-root .charsel-board { gap: 8px; }
  #ui-root .charsel-card { grid-template-columns: clamp(64px, 18vw, 92px) minmax(0, 1fr); gap: 5px 8px; padding: 8px; border-width: 3px; }
  #ui-root .charsel-card__portrait { width: clamp(64px, 18vw, 92px); height: clamp(64px, 18vw, 92px); }
  #ui-root .charsel-card__name { font-size: clamp(19px, 5vw, 28px); }
  #ui-root .charsel-card__weapon .charsel__weapon-label { display: none; }
  #ui-root .charsel-card__weapon .charsel__weapon-name { font-size: clamp(13px, 3.5vw, 18px); }
}

/* --- Saisie du prénom + tableau des scores (fin de run) -------------------
   Largeur 720px en border-box : le padding box fait alors 704px, soit
   EXACTEMENT ce qu'attend l'offset de rivet codé en dur (12 + 660 + 20 + 12)
   dans .panel::before/::after — les 4 rivets retombent symétriques sans
   toucher à la règle partagée. Toute autre largeur les décale (cf. .panel--charsel). */
#ui-root .panel--name { box-sizing: border-box; width: min(720px, 94vw); gap: 12px; padding: 24px 24px; }
/* Titre/sous-titre/indice resserrés : aux tailles par défaut du panneau (64/30/26 px)
   le titre débordait des rivets et les deux lignes de texte passaient sur 2 lignes. */
#ui-root .panel--name .panel__title { font-size: 42px; letter-spacing: 2px; }
#ui-root .panel--name .panel__subtitle { font-size: 21px; }
#ui-root .panel--name .hint-line { font-size: 17px; margin: 0; }
#ui-root .namepanel__score {
  font-family: 'Press Start 2P'; font-size: clamp(12px, 2vw, 20px);
  color: ${PALETTE.vertBonus}; letter-spacing: 2px; text-shadow: 2px 2px 0 ${PALETTE.contour};
}
/* Marges verticales = la place des chevrons de la case focalisée (ils débordent
   de ~36 px au-dessus et en dessous) : sans elles, le chevron bas chevauche la
   ligne d'indice. */
#ui-root .namegrid { display: flex; gap: 9px; justify-content: center; margin: 16px 0 26px; }
#ui-root .namecell {
  position: relative; box-sizing: border-box;
  width: 62px; height: 76px;
  display: flex; align-items: center; justify-content: center;
  background: ${PALETTE.brunSombre};
  border: 4px solid ${PALETTE.contour};
  box-shadow: 4px 4px 0 rgba(0,0,0,0.5),
    inset 3px 3px 0 rgba(255,255,255,0.12), inset -3px -3px 0 rgba(0,0,0,0.5);
  font-family: 'Jersey 25', monospace; font-size: 50px; line-height: 1;
  color: ${PALETTE.solSable}; text-shadow: 2px 2px 0 ${PALETTE.contour};
}
/* Case focalisée = le focus VISIBLE de cet écran (il n'y a aucun item de menu ici). */
#ui-root .namecell--focus {
  background: ${PALETTE.jauneSecurite}; color: #3A1E06; text-shadow: none;
  box-shadow: 5px 5px 0 rgba(0,0,0,0.5),
    inset 4px 4px 0 rgba(255,255,255,0.5), inset -4px -4px 0 rgba(160,90,10,0.55);
}
/* Chevrons haut/bas : disent que Haut/Bas font défiler la lettre. Triangles CSS — pas d'emoji. */
#ui-root .namecell--focus::before, #ui-root .namecell--focus::after {
  content: ''; position: absolute; left: 50%; margin-left: -11px;
  width: 0; height: 0;
  border-left: 11px solid transparent; border-right: 11px solid transparent;
  filter: drop-shadow(1.5px 1.5px 0 ${PALETTE.contour});
  animation: namecellbob 0.6s steps(2) infinite;
}
#ui-root .namecell--focus::before { top: -21px; border-bottom: 15px solid ${PALETTE.orangeDanger}; }
#ui-root .namecell--focus::after { bottom: -21px; border-top: 15px solid ${PALETTE.orangeDanger}; }
@keyframes namecellbob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }

/* Tableau des scores : les 20 lignes DOIVENT tenir sans scroll (même doctrine que
   la compacité du rapport plus haut — le jeu est 100 % manette, un menu poussé
   hors écran est inatteignable). D'où les lignes serrées et l'unique plaque. */
#ui-root .panel--hiscores { box-sizing: border-box; width: min(720px, 94vw); padding: 14px 24px; gap: 6px; }
#ui-root .panel--hiscores .panel__title { font-size: 38px; }
#ui-root .panel--hiscores .panel__subtitle { font-size: 20px; }
#ui-root .panel--hiscores .menu { width: auto; }
#ui-root .panel--hiscores .menu__item { font-size: 20px; padding: 8px 24px 8px 48px; }
#ui-root .hiscores__rows { display: flex; flex-direction: column; gap: 1px; width: 100%; }
#ui-root .hiscore-row {
  display: grid; grid-template-columns: 34px 118px 88px 1fr; gap: 10px; align-items: baseline;
  font-family: 'Pixelify Sans', monospace; font-size: 17px; line-height: 1.1;
  color: ${PALETTE.solSable}; padding: 1px 6px;
}
#ui-root .hiscore-row__rank { color: ${PALETTE.orangeDanger}; font-weight: 700; }
#ui-root .hiscore-row__name { color: #EAD9B8; letter-spacing: 1px; }
#ui-root .hiscore-row__score { color: ${PALETTE.jauneSecurite}; font-weight: 700; text-align: right; }
#ui-root .hiscore-row__meta { font-size: 14px; opacity: 0.75; }
/* La ligne du joueur : c'est TOUT l'intérêt de l'écran → elle doit sauter aux yeux. */
#ui-root .hiscore-row--me {
  background: ${PALETTE.jauneSecurite}; color: #3A1E06;
  box-shadow: inset 3px 3px 0 rgba(255,255,255,0.45), inset -3px -3px 0 rgba(160,90,10,0.5);
  animation: hiscoremeblink 0.9s steps(2) infinite;
}
#ui-root .hiscore-row--me .hiscore-row__rank,
#ui-root .hiscore-row--me .hiscore-row__name,
#ui-root .hiscore-row--me .hiscore-row__score { color: #3A1E06; }
#ui-root .hiscore-row--me .hiscore-row__meta { color: #5A3410; opacity: 1; }
#ui-root .hiscore-row--empty { display: block; text-align: center; }
@keyframes hiscoremeblink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.82; } }

/* Écran des succès : le catalogue ENTIER doit tenir sans scroll (même doctrine
   que le tableau des scores et le rapport — seul « Retour » est focalisable).
   D'où la grille 2 colonnes : ~10 succès = 5 rangées, pas une de plus à l'écran. */
#ui-root .panel--achievements { box-sizing: border-box; width: min(880px, 96vw); padding: 14px 24px; gap: 6px; }
#ui-root .panel--achievements .panel__title { font-size: 38px; }
#ui-root .panel--achievements .panel__subtitle { font-size: 20px; }
#ui-root .panel--achievements .menu { width: auto; }
#ui-root .panel--achievements .menu__item { font-size: 20px; padding: 8px 24px 8px 48px; }
#ui-root .ach__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 14px; width: 100%; }
#ui-root .ach-row {
  display: grid; grid-template-columns: 40px 1fr 18px; gap: 8px; align-items: center;
  padding: 4px 6px; border: 3px solid ${PALETTE.contour};
  background: rgba(0,0,0,0.28);
  /* Ombre portée DÉCALÉE, blur 0 (DA 16-bit) — jamais de halo. */
  box-shadow: 3px 3px 0 rgba(0,0,0,0.5);
}
/* Verrouillé = l'état PAR DÉFAUT de la règle ci-dessus (grisé), débloqué = la
   variante qui s'allume. Le succès acquis doit se distinguer, mais le raté doit
   rester LISIBLE : c'est sa description qui dit quoi faire. */
#ui-root .ach-row--on { background: rgba(61,220,132,0.10); border-color: ${PALETTE.contour}; }
#ui-root .ach__plinth {
  width: 40px; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: ${METAL_DARK} url('${import.meta.env.BASE_URL}ui_dither_dark.png');
  border: 3px solid ${PALETTE.contour}; box-sizing: border-box;
}
#ui-root .ach__img { width: 30px; height: 30px; image-rendering: pixelated; }
#ui-root .ach__mono {
  font-family: 'Pixelify Sans', monospace; font-size: 15px; font-weight: 700;
  color: ${PALETTE.jauneSecurite};
}
/* Le verrou se lit en un coup d'œil : icône désaturée + texte en retrait. */
#ui-root .ach-row:not(.ach-row--on) .ach__img { filter: grayscale(1) brightness(0.45); }
#ui-root .ach-row:not(.ach-row--on) .ach__mono { color: ${PALETTE.solSable}; opacity: 0.5; }
#ui-root .ach__text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
#ui-root .ach__name {
  font-family: 'Pixelify Sans', monospace; font-size: 17px; font-weight: 700;
  color: ${PALETTE.jauneSecurite}; line-height: 1.1;
}
#ui-root .ach__desc {
  font-family: 'Pixelify Sans', monospace; font-size: 13px;
  color: ${PALETTE.solSable}; opacity: 0.8; line-height: 1.1;
}
#ui-root .ach-row:not(.ach-row--on) .ach__name { color: ${PALETTE.solSable}; opacity: 0.55; }
#ui-root .ach-row:not(.ach-row--on) .ach__desc { opacity: 0.5; }
#ui-root .ach__star { width: 18px; height: 18px; image-rendering: pixelated; flex-shrink: 0; }

/* Écran « Évolutions d'armes » (pause) : réutilise TOUT le look des succès
   (.panel--achievements/.ach__*, mêmes classes appliquées en DOM) — seule la
   ligne diffère, une PAIRE d'icônes (arme → catalyseur) au lieu d'une seule, donc
   la 1re colonne de .ach-row s'élargit ICI, scopée à cet écran uniquement. */
#ui-root .evo__grid .ach-row { grid-template-columns: 92px 1fr 18px; }
#ui-root .evo__pair { display: flex; align-items: center; gap: 4px; }
#ui-root .evo__pair .ach__plinth { width: 32px; height: 32px; }
#ui-root .evo__pair .ach__img { width: 24px; height: 24px; }
#ui-root .evo__arrow {
  font-family: 'Pixelify Sans', monospace; font-size: 14px; font-weight: 700;
  color: ${PALETTE.solSable}; flex-shrink: 0;
}
@media (prefers-reduced-motion: reduce) {
  #ui-root .hiscore-row--me,
  #ui-root .namecell--focus::before, #ui-root .namecell--focus::after { animation: none; }
}
/* --- Invite « tourne l'appareil » (P6 : tactile + portrait) --------------- */
/* --- HUD par joueur (co-op ≥2) : un bloc à chaque coin, façon borne ---------
   Solo : la couche reste vide et AUCUNE de ces règles ne s'applique (pas de .coop). */
#ui-root .phud-layer { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
#ui-root .phud {
  position: absolute; display: flex; gap: 8px; align-items: flex-start;
  padding: 8px; background: var(--tex); background-size: 60px 100%;
  border: 4px solid ${PALETTE.contour};
  box-shadow: 5px 5px 0 rgba(0,0,0,0.55), inset 2px 2px 0 rgba(255,255,255,0.12), inset -3px -3px 0 rgba(0,0,0,0.5);
}
#ui-root .phud--dead { opacity: 0.45; filter: saturate(0.3); }
/* Les 4 coins : J1 haut-gauche · J2 haut-droite · J3 bas-gauche · J4 bas-droite. */
#ui-root .phud--p1 { top: 14px; left: 14px; }
#ui-root .phud--p2 { top: 14px; right: 14px; }
#ui-root .phud--p3 { bottom: 14px; left: 14px; }
#ui-root .phud--p4 { bottom: 14px; right: 14px; }
#ui-root .phud__portrait {
  position: relative; width: 56px; height: 56px; overflow: hidden; flex-shrink: 0;
  background: ${PALETTE.brunSombre}; border: 3px solid ${PALETTE.contour}; box-sizing: border-box;
}
#ui-root .phud__portrait-img { position: absolute; left: 0; top: 0; width: 400%; height: 400%; image-rendering: pixelated; }
#ui-root .phud__col { display: flex; flex-direction: column; gap: 4px; }
#ui-root .phud__top { display: flex; align-items: baseline; gap: 8px; font-size: 15px; line-height: 1; text-shadow: 2px 2px 0 ${PALETTE.contour}; }
#ui-root .phud__id { font-weight: 700; }
#ui-root .phud__lvl { color: ${PALETTE.jauneSecurite}; }
#ui-root .phud__hp { color: ${PALETTE.vertBonus}; }
/* Barres compactes : on surcharge .hud__bar DANS le bloc (spécificité supérieure). */
#ui-root .phud .hud__bar { width: 148px; height: 12px; border-width: 3px; }
#ui-root .phud__inv { display: flex; flex-direction: row; flex-wrap: wrap; gap: 4px; max-width: 148px; }
/* Tuiles d'inventaire miniatures dans le bloc joueur. */
#ui-root .phud .inv__tile, #ui-root .phud .inv__tile--sm { width: 34px; height: 34px; }
#ui-root .phud .inv__icon, #ui-root .phud .inv__img, #ui-root .phud .inv__mono { width: 34px; height: 34px; }
#ui-root .phud .inv__mono { font-size: 16px; }
#ui-root .phud .inv__lvl { font-size: 11px; padding: 0 2px; }
/* Co-op : le HUD central ne garde que l'info de run → il passe en haut-centre pour
   libérer les coins ; la barre de boss descend sous lui ; la mini-carte va en bas-centre.
   (Le HUD « Manettes » est masqué côté JS : son display est inline, cf. syncPads.) */
#ui-root.coop .hud { left: 50%; transform: translateX(-50%); margin: 14px 0; }
#ui-root.coop .bossbar { top: 104px; }
/* Co-op : le bloc J2 occupe le coin haut-droit et la barre de boss descend à
   104px — le trophée passe SOUS les deux (sinon il les chevauche). */
#ui-root.coop .trophy { top: 200px; }
#ui-root.coop .minimap { left: 50%; transform: translateX(-50%); bottom: 14px; }

#ui-root .rotate-hint { display: none; position: fixed; inset: 0; z-index: 90; background: var(--arc-brun3, #17120E);
  flex-direction: column; align-items: center; justify-content: center; gap: 22px; text-align: center; padding: 24px; }
#ui-root .rotate-hint--show { display: flex; }
#ui-root .rotate-hint__icon { width: 84px; height: 132px; border: 6px solid var(--arc-jaune, #FFD24A); box-sizing: border-box;
  box-shadow: inset 0 0 0 4px var(--arc-contour, #101014); animation: rotate-hint-turn 1.8s ease-in-out infinite; }
#ui-root .rotate-hint__title { font-family: 'Press Start 2P', monospace; font-size: clamp(14px, 5vw, 24px); color: var(--arc-jaune, #FFD24A);
  letter-spacing: 2px; text-shadow: 3px 3px 0 var(--arc-contour, #101014); }
#ui-root .rotate-hint__sub { font-family: 'Pixelify Sans', sans-serif; font-size: clamp(13px, 3.6vw, 18px); color: var(--arc-creme, #EAD9B8); }
@keyframes rotate-hint-turn { 0%, 30% { transform: rotate(0deg); } 60%, 100% { transform: rotate(90deg); } }
`

let injected = false

/** Injecte la feuille de style de l'UI une seule fois. */
export function injectStyles(): void {
  if (injected) {
    return
  }
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)
  injected = true
}
