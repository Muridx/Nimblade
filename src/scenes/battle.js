import { mountScene } from "./sceneManager.js";
import { getState } from "../state/store.js";
import monstersData from "../data/monsters.json";
import weaponsData from "../data/weapons.json";

const BASE_PLAYER_HP = 100;
const MAX_ENERGY = 100;
const INTENT_ICON = { SLASH: "⚔", GUARD: "🛡", COUNTER: "↩" };
const BEATS = { SLASH: "COUNTER", GUARD: "SLASH", COUNTER: "GUARD" };
const RPS = ["SLASH","GUARD","COUNTER"];

export function battleScene(root, opts) {
  opts = opts || {};
  const run = getState().run || { mode: "demo", weapon: "sword" };
  const weapon = weaponsData[run.weapon] || weaponsData.sword;
  const S = weapon.stats;
  const enemyDef = opts.enemy || monstersData.ch1.normals[0];
  const spriteId = enemyDef.sprite_id || enemyDef.id;

  const state = {
    turn: 1, floor: opts.floor || 1, floorMax: 5, chapter: opts.chapter || "CH1",
    player: { hp: BASE_PLAYER_HP, maxHp: BASE_PLAYER_HP, energy: 0, maxEnergy: MAX_ENERGY, comboCount: 0, momentumStacks: 0 },
    enemy: { hp: enemyDef.hp, maxHp: enemyDef.hp, buffs: [] },
    log: [`-- Battle start --`, `${enemyDef.name} appears (HP ${enemyDef.hp})`],
    pendingAction: null, ended: null, intent: null,
  };

  const rollIntent = () => {
    if (Array.isArray(enemyDef.pattern)) return enemyDef.pattern[(state.turn - 1) % enemyDef.pattern.length];
    return RPS[Math.floor(Math.random()*3)];
  };
  state.intent = rollIntent();

  const intentDmgDisplay = (intent) => intent === "GUARD" ? 0 : (intent === "COUNTER" ? (enemyDef.dmg + 3) : enemyDef.dmg);

  const lossDmgTaken = (action, baseDmg) => {
    if (action === "GUARD") return Math.floor(baseDmg * (1 - S.guard_dmg_reduction_pct/100));
    if (action === "COUNTER") return baseDmg + S.counter_loss_dmg_taken;
    return baseDmg;
  };

  const resolve = (action) => {
    const intent = state.intent;
    let line = `T${state.turn}: You ${action} vs ${intent} → `;

    if (action === "WILD") {
      state.player.energy -= S.ws_cost;
      state.enemy.hp -= S.ws_dmg;
      const taken = enemyDef.dmg; // full hit, ignores RPS
      state.player.hp -= taken;
      line += `WILD ${S.ws_dmg} dmg, took ${taken}`;
      state.player.comboCount = 0;
      state.player.momentumStacks = 0;
    } else if (action === "ULT") {
      state.player.energy -= S.ult_cost;
      if (weapon.id === "sword") {
        state.enemy.hp -= 25;
        const taken = enemyDef.dmg;
        state.player.hp -= taken;
        line += `BLADE RUSH 25 dmg, took ${taken}`;
      } else {
        state.enemy.hp -= 20;
        line += `ULT 20 dmg (stub, weapon-specific = 2.5c)`;
      }
      state.player.comboCount = 0;
      state.player.momentumStacks = 0;
    } else {
      // RPS resolve
      if (action === intent) {
        line += "DRAW (0/0)";
        state.player.comboCount = 0;
        state.player.momentumStacks = 0;
        state.player.energy += Math.floor(S.energy_regen_per_turn / 2);
      } else if (BEATS[action] === intent) {
        // player wins
        state.player.comboCount++;
        let dmg = action === "SLASH" ? S.slash_dmg : action === "COUNTER" ? S.counter_win_dmg : S.guard_win_dmg;
        // Sword Momentum: +1 stack per SLASH/COUNTER win (cap 5), each stack = +1 dmg this and future wins
        if (weapon.id === "sword" && (action === "SLASH" || action === "COUNTER")) {
          state.player.momentumStacks = Math.min(5, state.player.momentumStacks + 1);
        }
        dmg += (weapon.id === "sword" ? state.player.momentumStacks : 0);
        // Combo 3-streak: +50%
        if (state.player.comboCount >= 3) dmg = Math.floor(dmg * 1.5);
        state.enemy.hp -= dmg;
        line += `WIN deal ${dmg}`;
        state.player.energy += S.energy_regen_per_turn;
      } else {
        // player loses
        const base = enemyDef.dmg;
        const taken = lossDmgTaken(action, base);
        state.player.hp -= taken;
        line += `LOSS took ${taken}`;
        state.player.comboCount = 0;
        state.player.momentumStacks = 0;
        state.player.energy += S.energy_regen_per_turn;
      }
    }

    state.player.energy = Math.max(0, Math.min(state.player.maxEnergy, state.player.energy));
    state.player.hp = Math.max(0, state.player.hp);
    state.enemy.hp = Math.max(0, state.enemy.hp);
    state.log.push(line);
    console.log(`[battle] ${line}`);

    if (state.enemy.hp <= 0) { state.ended = "win"; state.log.push("✦ VICTORY ✦"); }
    else if (state.player.hp <= 0) { state.ended = "lose"; state.log.push("✗ DEFEAT ✗"); }
    else { state.turn++; state.intent = rollIntent(); }
  };

  // Cheat keys for testing
  window.cheat = {
    energy: (n) => { state.player.energy = n; render(); console.log(`[cheat] energy=${n}`); },
    enemyHp: (n) => { state.enemy.hp = n; render(); console.log(`[cheat] enemyHp=${n}`); },
    playerHp: (n) => { state.player.hp = n; render(); console.log(`[cheat] playerHp=${n}`); },
    win: () => { state.enemy.hp = 0; state.ended = "win"; state.log.push("✦ CHEAT VICTORY ✦"); render(); },
    lose: () => { state.player.hp = 0; state.ended = "lose"; state.log.push("✗ CHEAT DEFEAT ✗"); render(); },
    help: () => console.log("cheat.energy(n) | cheat.enemyHp(n) | cheat.playerHp(n) | cheat.win() | cheat.lose()"),
  };
  console.log("[cheat] available: cheat.help()");

  const render = () => {
    const intent = state.intent;
    const intentIcon = INTENT_ICON[intent] || "?";
    const idmg = intentDmgDisplay(intent);
    const ultCost = S.ult_cost;
    const canUlt = !state.ended && state.player.energy >= ultCost;
    const canWild = !state.ended && state.player.energy >= S.ws_cost;
    const enemyBuffsHtml = state.enemy.buffs.length
      ? state.enemy.buffs.map(b => `<span class="b-chip">${b}</span>`).join("")
      : `<span class="b-chip b-chip--none">none</span>`;
    const pHpPct = (state.player.hp/state.player.maxHp)*100;
    const pEngPct = (state.player.energy/state.player.maxEnergy)*100;
    const eHpPct = (state.enemy.hp/state.enemy.maxHp)*100;
    const ultPct = Math.min(100, (state.player.energy/ultCost)*100);

    const action = (act, label, dmg, beats) => {
      const pending = state.pendingAction === act ? "b-act--pending" : "";
      const disabled = state.ended ? "disabled" : "";
      return `<button class="b-act ${pending}" data-action="action" data-act="${act}" ${disabled}>
        <div class="b-act__main">${label} <strong>${dmg}</strong></div>
        <div class="b-act__sub">Beats ${beats}</div>
      </button>`;
    };
    const logHtml = state.log.slice(-5).map(l => `<div>${l}</div>`).join("");
    const confirmBar = state.pendingAction ? `
      <div class="b-confirm">
        <span>Confirm <strong>${state.pendingAction}</strong>?</span>
        <button class="btn btn--primary b-confirm__yes" data-action="confirm">CONFIRM</button>
        <button class="btn btn--secondary b-confirm__no" data-action="cancel">CANCEL</button>
      </div>` : "";
    const endOverlay = state.ended ? `
      <div class="b-end b-end--${state.ended}">
        <div class="b-end__title">${state.ended === "win" ? "✦ VICTORY ✦" : "✗ DEFEAT ✗"}</div>
        <div class="b-end__sub">${state.ended === "win" ? `${enemyDef.name} defeated in ${state.turn} turns` : `You fell to ${enemyDef.name}`}</div>
        <div class="b-end__stats">HP ${state.player.hp}/${state.player.maxHp} · Combo max ${state.player.comboCount}</div>
        <button class="btn btn--primary b-end__btn" data-action="end-back">BACK TO LOBBY</button>
      </div>` : "";
    const actionsBlock = state.ended ? "" : (state.pendingAction ? confirmBar : `
      <div class="b-acts-row">
        ${action("SLASH", "⚔ SLASH", S.slash_dmg, "COUNTER")}
        ${action("GUARD", "🛡 GUARD", S.guard_dmg_reduction_pct + "%", "SLASH")}
        ${action("COUNTER", "↩ COUNTER", S.counter_win_dmg, "GUARD")}
      </div>
      <button class="b-wild ${canWild ? "" : "b-wild--off"}" data-action="action" data-act="WILD" ${canWild ? "" : "disabled"}>
        💥 WILD STRIKE - <strong>${S.ws_dmg} dmg</strong>, ignores RPS · ⚡${S.ws_cost}
      </button>`);

    root.innerHTML = `
      <div class="b-screen">
        <div class="b-header">
          <button class="b-icon-btn" data-action="settings">⚙</button>
          <div class="b-stage">${state.chapter} · FLOOR ${state.floor}/${state.floorMax}</div>
          <button class="b-icon-btn b-runinfo" data-action="runinfo">RUN INFO</button>
        </div>
        <div class="b-zone">
          <div class="b-side b-side--player">
            <div class="b-side__label">YOU</div>
            <div class="b-bar"><div class="b-bar__fill b-bar__fill--hp" style="width:${pHpPct}%"></div><span class="b-bar__text">HP ${state.player.hp}/${state.player.maxHp}</span></div>
            <div class="b-bar"><div class="b-bar__fill b-bar__fill--eng" style="width:${pEngPct}%"></div><span class="b-bar__text">⚡ ${state.player.energy}/${state.player.maxEnergy}</span></div>
            <div class="b-sprite" style="background-image:url('/assets/${weapon.id}_idle.png')"></div>
          </div>
          <div class="b-side b-side--enemy">
            <div class="b-side__label">${enemyDef.name.toUpperCase()}</div>
            <div class="b-bar"><div class="b-bar__fill b-bar__fill--enemyhp" style="width:${eHpPct}%"></div><span class="b-bar__text">HP ${state.enemy.hp}/${state.enemy.maxHp}</span></div>
            <div class="b-intent">INTENT: ${intentIcon} ${intent}${idmg ? ` <strong>${idmg}</strong>` : ""}</div>
            <div class="b-buffs">BUFFS: ${enemyBuffsHtml}</div>
            <div class="b-sprite" style="background-image:url('/assets/${spriteId}.png')"></div>
          </div>
        </div>
        <div class="b-mid">
          <div class="b-card">
            <div class="b-card__title">${weapon.icon} ${weapon.name.toUpperCase()}</div>
            <div class="b-card__small"><strong>${weapon.passive.name}</strong></div>
            <div class="b-card__small">Stacks: ${state.player.momentumStacks}</div>
            <div class="b-card__small">Combo: x${state.player.comboCount}</div>
          </div>
          <button class="b-card b-card--ult ${canUlt ? "b-card--ready" : ""}" data-action="ult" ${!canUlt ? "disabled" : ""}>
            <div class="b-card__title">✦ ${weapon.ultimate.name.toUpperCase()}</div>
            <div class="b-bar b-bar--ult"><div class="b-bar__fill b-bar__fill--ult" style="width:${ultPct}%"></div><span class="b-bar__text">${state.player.energy}/${ultCost}</span></div>
            <div class="b-card__small">${canUlt ? "TAP TO USE" : weapon.ultimate.description.slice(0,38)}</div>
          </button>
          <div class="b-card">
            <div class="b-card__title">ROUND ${state.turn}</div>
            <div class="b-card__log">${logHtml}</div>
          </div>
        </div>
        <div class="b-prompt">CHOOSE YOUR MOVE</div>
        ${actionsBlock}
        ${state.ended ? "" : `<button class="b-surrender" data-action="flee">SURRENDER</button>`}
        <div class="b-relics">
          <span class="b-relics__label">RELICS:</span>
          <div class="b-relics__slot"></div>
          <div class="b-relics__slot"></div>
          <div class="b-relics__slot"></div>
          <div class="b-relics__slot"></div>
          <div class="b-relics__slot"></div>
        </div>
        ${endOverlay}
      </div>`;
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    if (action === "flee") { if (confirm("Surrender this battle?")) mountScene("lobby", root); }
    else if (action === "end-back") { mountScene("lobby", root); }
    else if (action === "settings") { alert("Settings coming Step 2.10"); }
    else if (action === "runinfo") { alert(`RUN INFO\n\nMode: ${run.mode}\nWeapon: ${weapon.name}\nFloor: ${state.floor}/${state.floorMax}\nGold + Relics: Step 2.7`); }
    else if (action === "ult") { if (state.ended) return; state.pendingAction = "ULT"; render(); }
    else if (action === "action") { if (state.ended) return; state.pendingAction = t.dataset.act; render(); }
    else if (action === "cancel") { state.pendingAction = null; render(); }
    else if (action === "confirm") {
      const act = state.pendingAction;
      state.pendingAction = null;
      resolve(act);
      render();
    }
  };
  root.addEventListener("click", onClick);
  render();
  return () => { root.removeEventListener("click", onClick); delete window.cheat; };
}
