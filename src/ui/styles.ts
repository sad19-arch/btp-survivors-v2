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
#ui-root .hud__stage { font-size: 14px; }
#ui-root .hud__stagenum { color: ${PALETTE.jauneSecurite}; }
#ui-root .hud__stagename { color: ${PALETTE.blanc}; }
#ui-root .stagecard {
  position: absolute;
  top: 34%;
  left: 50%;
  transform: translateX(-50%);
  background: ${PALETTE.brunSombre};
  border: 4px solid ${PALETTE.contour};
  box-shadow: 6px 6px 0 ${PALETTE.contour};
  padding: 18px 34px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: stagecard-in 0.35s ease-out;
}
#ui-root .stagecard__num { color: ${PALETTE.jauneSecurite}; font-size: 15px; font-weight: bold; }
#ui-root .stagecard__title { color: ${PALETTE.blanc}; font-size: 30px; font-weight: bold; text-shadow: 3px 3px 0 ${PALETTE.contour}; }
#ui-root .stagecard__sub { color: ${PALETTE.solSable}; font-size: 13px; text-transform: none; letter-spacing: 0; }
@keyframes stagecard-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
#ui-root .inv {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(43, 32, 24, 0.85);
  border: 3px solid ${PALETTE.contour};
  box-shadow: 4px 4px 0 ${PALETTE.contour};
  padding: 6px;
}
#ui-root .inv__row { display: flex; gap: 6px; min-height: 32px; }
#ui-root .inv__tile {
  position: relative;
  width: 32px;
  height: 32px;
  box-sizing: border-box;
}
#ui-root .inv__icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
#ui-root .inv__img { width: 32px; height: 32px; image-rendering: pixelated; }
#ui-root .inv__mono {
  width: 32px; height: 32px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  background: ${PALETTE.brunSombre};
  border: 2px solid ${PALETTE.contour};
  color: ${PALETTE.jauneSecurite};
  font-size: 13px; font-weight: bold;
}
#ui-root .inv__lvl {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: ${PALETTE.contour};
  border: 2px solid ${PALETTE.jauneSecurite};
  color: ${PALETTE.blanc};
  font-size: 9px;
  font-weight: bold;
  line-height: 1;
  padding: 2px 3px;
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
