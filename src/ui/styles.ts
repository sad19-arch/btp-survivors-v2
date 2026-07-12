import { PALETTE } from './palette'

/**
 * Feuille de style de l'UI — refonte « 16-bit premium » (réf. Demon's Crest /
 * SNES / Mega Drive). Conserve TOUS les noms de classes de la version d'origine
 * pour se brancher sur `overlay.ts` sans changement de DOM. Le rendu premium
 * vient de : cadres métal brossé (texture `metal_v.png` + biseaux solides),
 * rivets en relief, titres/logos sculptés (extrusion en rampe), tramage
 * (`dither_light.png`) sur les états actifs, coins carrés, ombres portées
 * décalées — aucun gradient moderne / flou / glow / coin arrondi.
 *
 * ASSETS REQUIS dans `public/` (servis à la racine) :
 *   metal_v.png · dither_light.png · dither_dark.png · bg_dusk.png · casque.png
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
  --tex: url('${import.meta.env.BASE_URL}metal_v.png');
  --sheen: url('${import.meta.env.BASE_URL}dither_light.png');
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
#ui-root .cards { display: flex; gap: 36px; }
#ui-root .card {
  position: relative;
  overflow: hidden;
  pointer-events: auto;
  cursor: pointer;
  width: 340px;
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
#ui-root .card__icon { width: 110px; height: 110px; align-self: center; display: flex; align-items: center; justify-content: center; }
#ui-root .card__img { width: 96px; height: 96px; image-rendering: pixelated; }
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

/* ── Panneau jackpot (évolution) ──────────────────────────────────────── */
#ui-root .jackpot {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: var(--tex); background-size: 80px 100%;
  border: 6px solid ${PALETTE.jauneSecurite};
  box-shadow: 12px 12px 0 rgba(0,0,0,0.55),
    inset 4px 4px 0 rgba(255,255,255,0.16), inset -5px -5px 0 rgba(0,0,0,0.5);
  padding: 26px 40px;
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  min-width: 640px; pointer-events: none; z-index: 20;
  animation: jackpot-in 0.18s ease-out;
}
#ui-root .jackpot__title {
  font-family: 'Jersey 25', monospace; color: ${PALETTE.jauneSecurite};
  font-size: 52px; letter-spacing: 4px;
  text-shadow: -2px -2px 0 ${GOLD_HI}, 3px 0 0 ${PALETTE.contour}, -3px 0 0 ${PALETTE.contour},
    0 3px 0 ${PALETTE.contour}, 0 -3px 0 ${PALETTE.contour}, 5px 5px 0 ${GOLD_DK}, 8px 8px 0 ${GOLD_DEEP};
}
#ui-root .jackpot__window {
  width: 560px; height: 96px; overflow: hidden;
  border: 5px solid ${PALETTE.contour}; box-shadow: inset 3px 3px 0 #000;
  background: #120E0A; position: relative;
}
#ui-root .jackpot__reel { display: flex; flex-direction: column; position: absolute; top: 0; left: 0; width: 100%; will-change: transform; }
#ui-root .jackpot__item {
  height: 96px; display: flex; align-items: center; justify-content: center;
  font-family: 'Jersey 25', monospace; font-size: 40px; letter-spacing: 2px;
  color: ${PALETTE.blanc}; text-shadow: 2px 2px 0 ${PALETTE.contour};
  padding: 0 8px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 560px;
}
#ui-root .jackpot__item--winner { color: ${PALETTE.jauneSecurite}; background: ${PALETTE.brunSombre}; }
#ui-root .jackpot__window::before, #ui-root .jackpot__window::after {
  content: ''; position: absolute; left: 0; right: 0; height: 5px; background: ${PALETTE.orangeDanger}; z-index: 2; pointer-events: none;
}
#ui-root .jackpot__window::before { top: 0; }
#ui-root .jackpot__window::after { bottom: 0; }
@keyframes jackpot-flash {
  0%,40%,80%,100% { box-shadow: 12px 12px 0 rgba(0,0,0,0.55); }
  20%,60% { box-shadow: 12px 12px 0 rgba(0,0,0,0.55), 0 0 0 5px ${PALETTE.vertBonus}; }
}
#ui-root .jackpot--flash { animation: jackpot-flash 0.5s steps(2, end); }
@keyframes jackpot-charge {
  0%,100% { transform: translate(-50%, -50%) translate(0,0); }
  25% { transform: translate(-50%, -50%) translate(3px,-3px); }
  75% { transform: translate(-50%, -50%) translate(-3px,3px); }
}
#ui-root .jackpot--charging { animation: jackpot-charge 0.2s steps(2, end) infinite; }
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
#ui-root .report__stats { display: flex; flex-direction: column; gap: 6px; font-family: 'Pixelify Sans'; font-size: 28px; color: ${PALETTE.blanc}; text-align: center; }

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
   <img class="title-bg" src=".../bg_dusk.png"> en 1er enfant du .screen du titre,
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
   Ajoute <img class="splash__helmet" src=".../casque.png"> + le nom + PRÉSENTE. */
#ui-root .splash { position: absolute; inset: 0; z-index: 70; background: #08080d; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; }
#ui-root .splash__gyro { position: absolute; top: -240px; left: 50%; width: 1000px; height: 1000px; margin-left: -500px; background: repeating-conic-gradient(from 0deg, rgba(232,111,31,0.07) 0deg 20deg, transparent 20deg 40deg); animation: sweep 9s linear infinite; pointer-events: none; }
#ui-root .splash__flash { position: absolute; inset: 0; background: ${GOLD_HI}; opacity: 0; animation: splash-flash 3.4s steps(2) forwards; pointer-events: none; }
#ui-root .splash__helmet { position: relative; width: 150px; height: auto; image-rendering: pixelated; transform-origin: 50% 100%; animation: splash-drop 3.4s steps(1) forwards; }
#ui-root .splash__name { position: relative; text-align: center; font-family: 'Jersey 25', monospace; font-size: 108px; letter-spacing: 4px; color: ${PALETTE.jauneSecurite}; animation: splash-text 3.4s steps(1) forwards; text-shadow: -2px -2px 0 ${GOLD_HI}, 3px 0 ${PALETTE.contour}, -3px 0 ${PALETTE.contour}, 0 3px ${PALETTE.contour}, 0 -3px ${PALETTE.contour}, 6px 6px 0 ${GOLD_DK}, 10px 10px 0 ${GOLD_DEEP}, 13px 13px 0 ${PALETTE.contour}; }
#ui-root .splash__tag { position: relative; font-family: 'Pixelify Sans', monospace; font-weight: 700; font-size: 34px; letter-spacing: 6px; color: #E8B27A; background: ${PALETTE.contour}; border: 5px solid ${PALETTE.jauneSecurite}; box-shadow: 6px 6px 0 rgba(0,0,0,0.5); padding: 8px 28px; animation: splash-text 3.4s steps(1) forwards; }
@keyframes splash-drop { 0% { transform: translateY(-500px); } 38% { transform: translateY(0) scaleY(1); } 45% { transform: translateY(0) scaleY(0.72) scaleX(1.2); } 55% { transform: translateY(-46px); } 66% { transform: translateY(0) scaleY(0.9); } 74%, 100% { transform: translateY(0) scaleY(1); } }
@keyframes splash-flash { 0%, 40% { opacity: 0; } 43% { opacity: 0.85; } 54%, 100% { opacity: 0; } }
@keyframes splash-text { 0%, 46% { opacity: 0; transform: translateY(10px); } 58%, 100% { opacity: 1; transform: translateY(0); } }
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
