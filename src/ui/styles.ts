import { PALETTE } from './palette'

/**
 * Feuille de style de l'UI (style 16-bit : panneaux pixel, coins carrés,
 * bordures noires, ombre portée décalée, aucune transparence décorative, aucun
 * flou/gradient/glow). Injectée une seule fois ; pas d'`innerHTML` de données.
 */
const CSS = `
#ui-root {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  font-family: 'Courier New', monospace;
  color: ${PALETTE.blanc};
  text-transform: uppercase;
  letter-spacing: 1px;
  user-select: none;
}
#ui-root .hud {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 14px;
  font-size: 16px;
  font-weight: bold;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .hud__row { display: flex; gap: 12px; align-items: center; }
#ui-root .hud__sep { color: ${PALETTE.solSable}; }
#ui-root .hud__hp { color: ${PALETTE.vertBonus}; }
#ui-root .hud__xp { color: ${PALETTE.cyanAccent}; }
#ui-root .hud__bar {
  width: 110px; height: 12px;
  background: ${PALETTE.brunSombre};
  border: 2px solid ${PALETTE.contour};
  box-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .hud__bar-fill { height: 100%; }
#ui-root .hud__bar--hp .hud__bar-fill { background: ${PALETTE.vertBonus}; }
#ui-root .hud__bar--xp .hud__bar-fill { background: ${PALETTE.cyanAccent}; }
#ui-root .hud__players {
  display: flex;
  flex-direction: row;
  gap: 8px;
  margin-top: 2px;
}
#ui-root .hud__pcard {
  display: flex;
  align-items: center;
  gap: 6px;
  background: ${PALETTE.brunSombre};
  border: 2px solid ${PALETTE.contour};
  box-shadow: 3px 3px 0 ${PALETTE.contour};
  padding: 4px 6px;
}
#ui-root .hud__pcard--dead { opacity: 0.45; }
#ui-root .hud__pswatch {
  width: 12px;
  height: 12px;
  border: 2px solid ${PALETTE.contour};
  flex-shrink: 0;
}
#ui-root .hud__pinfo {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 11px;
  line-height: 1.2;
}
#ui-root .hud__pid { color: ${PALETTE.jauneSecurite}; font-weight: bold; }
#ui-root .hud__php { color: ${PALETTE.vertBonus}; }
#ui-root .hud__plvl { color: ${PALETTE.blanc}; }
#ui-root .screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(16, 16, 20, 0.82);
}
#ui-root .panel {
  background: ${PALETTE.brunSombre};
  border: 4px solid ${PALETTE.contour};
  box-shadow: 6px 6px 0 ${PALETTE.contour};
  padding: 22px 28px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
#ui-root .panel__title {
  color: ${PALETTE.jauneSecurite};
  font-size: 30px;
  font-weight: bold;
  margin: 0;
  text-shadow: 3px 3px 0 ${PALETTE.contour};
}
#ui-root .panel__subtitle { color: ${PALETTE.solSable}; font-size: 14px; }
#ui-root .menu { display: flex; flex-direction: column; gap: 8px; width: 100%; }
#ui-root .menu__item {
  pointer-events: auto;
  cursor: pointer;
  padding: 10px 16px;
  background: ${PALETTE.contour};
  border: 3px solid ${PALETTE.contour};
  color: ${PALETTE.blanc};
  font-size: 18px;
  text-align: center;
}
#ui-root .menu__item--focus {
  background: ${PALETTE.jauneSecurite};
  color: ${PALETTE.contour};
  border-color: ${PALETTE.blanc};
  box-shadow: 4px 4px 0 ${PALETTE.contour};
}
#ui-root .cards { display: flex; gap: 16px; }
#ui-root .card {
  pointer-events: auto;
  cursor: pointer;
  width: 200px;
  background: ${PALETTE.contour};
  border: 3px solid ${PALETTE.brunSombre};
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
#ui-root .card--focus { border-color: ${PALETTE.jauneSecurite}; box-shadow: 5px 5px 0 ${PALETTE.contour}; }
#ui-root .card__icon { width: 56px; height: 56px; align-self: center; display: flex; align-items: center; justify-content: center; }
#ui-root .card__img { width: 56px; height: 56px; image-rendering: pixelated; }
#ui-root .card__mono {
  width: 56px; height: 56px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  background: ${PALETTE.brunSombre};
  border: 2px solid ${PALETTE.contour};
  color: ${PALETTE.jauneSecurite};
  font-size: 22px; font-weight: bold;
}
#ui-root .card__name { color: ${PALETTE.jauneSecurite}; font-size: 16px; font-weight: bold; text-align: center; }
#ui-root .card__hint { color: ${PALETTE.blanc}; font-size: 13px; text-transform: none; letter-spacing: 0; }
#ui-root .card--weapon { border-color: ${PALETTE.orangeDanger}; }
#ui-root .card--passive { border-color: ${PALETTE.cyanAccent}; }
#ui-root .card__pips { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; }
#ui-root .pip { display: inline-block; width: 8px; height: 8px; background: ${PALETTE.brunSombre}; border: 1px solid ${PALETTE.contour}; }
#ui-root .pip.pip--on { background: ${PALETTE.jauneSecurite}; border-color: ${PALETTE.contour}; }
#ui-root .card__lvltext { color: ${PALETTE.blanc}; font-size: 11px; margin-left: 4px; text-transform: none; letter-spacing: 0; }
#ui-root .card__desc { color: ${PALETTE.blanc}; font-size: 12px; text-transform: none; letter-spacing: 0; line-height: 1.3; }
#ui-root .card__delta { color: ${PALETTE.vertBonus}; font-size: 12px; font-weight: bold; text-transform: none; letter-spacing: 0; line-height: 1.3; }
#ui-root .stats { display: flex; flex-direction: column; gap: 4px; font-size: 16px; }
#ui-root .hint-line { color: ${PALETTE.solSable}; font-size: 12px; }
#ui-root .unlock-line { color: ${PALETTE.jauneSecurite}; font-size: 12px; font-weight: bold; }
#ui-root .banner {
  position: absolute;
  top: 42%;
  right: 28px;
  background: ${PALETTE.orangeDanger};
  color: ${PALETTE.contour};
  border: 4px solid ${PALETTE.contour};
  box-shadow: 6px 6px 0 ${PALETTE.contour};
  padding: 10px 18px;
  font-size: 22px;
  font-weight: bold;
  animation: banner-blink 0.5s steps(1, end) infinite;
}
@keyframes banner-blink { 50% { opacity: 0.2; } }
#ui-root .banner--boss {
  top: 30%;
  right: auto;
  left: 50%;
  transform: translateX(-50%);
  background: ${PALETTE.rougeAlerte};
  color: ${PALETTE.blanc};
  font-size: 26px;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .banner--boss-final {
  top: 30%;
  right: auto;
  left: 50%;
  transform: translateX(-50%);
  background: ${PALETTE.contour};
  color: ${PALETTE.orangeDanger};
  border-color: ${PALETTE.orangeDanger};
  font-size: 26px;
  text-shadow: 2px 2px 0 ${PALETTE.rougeAlerte};
}
#ui-root .banner--evolution {
  top: 30%;
  right: auto;
  left: 50%;
  transform: translateX(-50%);
  background: ${PALETTE.vertBonus};
  color: ${PALETTE.contour};
  border-color: ${PALETTE.jauneSecurite};
  font-size: 24px;
  text-shadow: none;
  animation: none;
}
#ui-root .bossbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: ${PALETTE.brunSombre};
  border: 3px solid ${PALETTE.contour};
  box-shadow: 4px 4px 0 ${PALETTE.contour};
}
#ui-root .bossbar__name {
  color: ${PALETTE.rougeAlerte};
  font-size: 14px;
  font-weight: bold;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .bossbar__track {
  width: 260px;
  height: 14px;
  background: ${PALETTE.contour};
  border: 2px solid ${PALETTE.contour};
}
#ui-root .bossbar__fill { height: 100%; background: ${PALETTE.rougeAlerte}; }
#ui-root .bossbar--final { border-color: ${PALETTE.orangeDanger}; }
#ui-root .bossbar--final .bossbar__name { color: ${PALETTE.orangeDanger}; }
#ui-root .bossbar--final .bossbar__fill { background: ${PALETTE.orangeDanger}; }
#ui-root .hud__stage { font-size: 16px; }
#ui-root .hud__stagenum { color: ${PALETTE.jauneSecurite}; }
#ui-root .hud__stagename { color: ${PALETTE.blanc}; font-size: 18px; text-shadow: 2px 2px 0 ${PALETTE.contour}; }
#ui-root .stagecard {
  position: absolute;
  top: 34%;
  left: 50%;
  transform: translateX(-50%);
  background: ${PALETTE.brunSombre};
  border: 4px solid ${PALETTE.contour};
  box-shadow: 8px 8px 0 ${PALETTE.contour};
  padding: 24px 48px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: stagecard-in 0.35s ease-out;
}
#ui-root .stagecard__num { color: ${PALETTE.jauneSecurite}; font-size: 18px; font-weight: bold; letter-spacing: 2px; }
#ui-root .stagecard__title { color: ${PALETTE.blanc}; font-size: 52px; font-weight: bold; text-shadow: 4px 4px 0 ${PALETTE.contour}; letter-spacing: 1px; }
#ui-root .stagecard__sub { color: ${PALETTE.solSable}; font-size: 15px; text-transform: none; letter-spacing: 0; }
@keyframes stagecard-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
#ui-root .pads {
  position: absolute;
  top: 10px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(43, 32, 24, 0.85);
  border: 3px solid ${PALETTE.contour};
  box-shadow: 4px 4px 0 ${PALETTE.contour};
  padding: 5px 8px;
  font-size: 12px;
  font-weight: bold;
  text-shadow: 2px 2px 0 ${PALETTE.contour};
}
#ui-root .pad__label { color: ${PALETTE.blanc}; text-transform: none; letter-spacing: 0; }
#ui-root .pad__pips { display: flex; gap: 3px; }
#ui-root .pad__pip { width: 10px; height: 10px; background: ${PALETTE.brunSombre}; border: 2px solid ${PALETTE.contour}; box-sizing: border-box; }
#ui-root .pad__pip.pad__pip--on { border-color: ${PALETTE.contour}; }
#ui-root .inv {
  position: absolute;
  /* Bandeau haut-gauche, aligné sur le padding-left du .hud (14px).
     top=104px : valeur empirique pour se loger sous les 3 lignes du HUD
     (phase+timer+PV/XP = ~90px de contenu + padding-top 10px = ~104px).
     Ce magic-number est documenté ici ; si la hauteur du HUD change,
     ajuster cette valeur en conséquence. */
  top: 104px;
  left: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(43, 32, 24, 0.85);
  border: 3px solid ${PALETTE.contour};
  box-shadow: 4px 4px 0 ${PALETTE.contour};
  padding: 6px;
}
/* Rangée armes : horizontale, tuiles 96×96 */
#ui-root .inv__row { display: flex; flex-direction: row; gap: 8px; min-height: 96px; }
/* Rangée passifs : horizontale, tuiles réduites (~56×56), flex-wrap si nombreux */
#ui-root .inv__row--passives { min-height: 56px; flex-wrap: wrap; }
#ui-root .inv__tile {
  position: relative;
  width: 96px;
  height: 96px;
  box-sizing: border-box;
}
/* Tuile petite pour la rangée passifs */
#ui-root .inv__tile--sm {
  width: 56px;
  height: 56px;
}
#ui-root .inv__icon { width: 96px; height: 96px; display: flex; align-items: center; justify-content: center; }
#ui-root .inv__img { width: 96px; height: 96px; image-rendering: pixelated; }
#ui-root .inv__mono {
  width: 96px; height: 96px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  background: ${PALETTE.brunSombre};
  border: 2px solid ${PALETTE.contour};
  color: ${PALETTE.jauneSecurite};
  font-size: 40px; font-weight: bold;
}
/* Tuile petite : icône/mono réduits */
#ui-root .inv__tile--sm .inv__icon { width: 56px; height: 56px; }
#ui-root .inv__tile--sm .inv__img { width: 56px; height: 56px; }
#ui-root .inv__tile--sm .inv__mono { width: 56px; height: 56px; font-size: 22px; }
#ui-root .inv__lvl {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: ${PALETTE.contour};
  border: 2px solid ${PALETTE.jauneSecurite};
  color: ${PALETTE.blanc};
  font-size: 18px;
  font-weight: bold;
  line-height: 1;
  padding: 3px 5px;
}
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
