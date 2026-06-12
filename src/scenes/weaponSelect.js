import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import weaponsData from "../data/weapons.json";

export function weaponSelectScene(root) {
  const run = getState().run || { mode: "demo" };
  const isDemo = run.mode === "demo";
  const weapons = Object.values(weaponsData);
  let selected = "sword";

  const isUnlocked = (w) => isDemo || w.unlock === "starter";

  const render = () => {
    const w = weaponsData[selected];
    const cards = weapons.map((weapon) => {
      const unlocked = isUnlocked(weapon);
      const sel = selected === weapon.id ? "ws__card--selected" : "";
      const lock = !unlocked ? "ws__card--locked" : "";
      const lockBadge = !unlocked ? `<span class="ws__lock">LOCKED</span>` : "";
      const disabled = !unlocked ? "disabled" : "";
      return `
        <button class="ws__card ${sel} ${lock}" data-action="select" data-weapon="${weapon.id}" ${disabled}>
          <span class="ws__icon">${weapon.icon}</span>
          <span class="ws__name">${weapon.name}</span>
          <span class="ws__identity">${weapon.identity}</span>
          ${lockBadge}
        </button>`;
    }).join("");

    root.innerHTML = `
      <div class="weapon-select">
        <button class="ws__back" data-action="back">&larr; Back</button>
        <div class="ws__title">CHOOSE YOUR WEAPON</div>
        <p class="ws__mode">${isDemo ? "DEMO MODE - all weapons unlocked" : "FULL RUN"}</p>
        <div class="ws__grid">${cards}</div>
        <div class="ws__panel">
          <div class="ws__stats">
            <span>SLASH</span><strong>${w.stats.slash_dmg}</strong>
            <span>COUNTER</span><strong>${w.stats.counter_win_dmg}</strong>
            <span>GUARD</span><strong>${w.stats.guard_dmg_reduction_pct}%</strong>
            <span>WS</span><strong>${w.stats.ws_dmg}/${w.stats.ws_cost}</strong>
          </div>
          <div class="ws__passive"><strong>${w.passive.name}:</strong> ${w.passive.description}</div>
          <div class="ws__ult"><strong>ULT - ${w.ultimate.name} (${w.ultimate.cost}):</strong> ${w.ultimate.description}</div>
        </div>
        <button class="btn btn--primary ws__begin" data-action="begin">BEGIN RUN</button>
      </div>`;
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    if (action === "back") {
      mountScene("lobby", root);
    } else if (action === "select") {
      const id = t.dataset.weapon;
      if (!isUnlocked(weaponsData[id])) return;
      selected = id;
      render();
    } else if (action === "begin") {
      setState({ run: { ...getState().run, weapon: selected } });
      console.log(`[run] start mode=${run.mode} weapon=${selected}`);
      mountScene("map", root);
    }
  };

  root.addEventListener("click", onClick);
  render();
  return () => root.removeEventListener("click", onClick);
}