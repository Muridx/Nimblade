import { mountScene } from "./sceneManager.js";
import { next as rngNext } from "../data/rng.js";
import { getState, setState } from "../state/store.js";
import relicsData from "../data/relics.json" assert { type: "json" };
import { acquireRelic } from "../data/relicEffects.js";
import { renderRunInfoModalHTML } from "../ui/runInfoModal.js";

/**
 * Blood Altar scene -- Bible v3.0 §6.7 (CH3 F7).
 *
 * Cost: 25g + 15 HP. Player pays once and chooses ONE option, or SKIPS (free):
 *   A) 1 guaranteed EPIC relic (power spike)
 *   B) +15 maxHP permanent for the rest of the run (defensive durability)
 *
 * Design note: the 25g + 15 HP entry cost applies to BOTH options and is a
 * REAL sacrifice (Bible §6.7 balance rationale: "15 HP = 1.5 CH3 hits. Real
 * sacrifice"). Option B does NOT heal the 15 back -> you pay 15 current HP and
 * gain a permanent +15 maxHP ceiling (durability vs Option A's power spike).
 * This keeps decision tension (north star); refunding the HP made B a no-brainer.
 *
 * Requirement to use: gold >= 25 AND playerHp > 15 (so paying HP can't kill you).
 */

const GOLD_COST = 25;
const HP_COST = 15;
const MAXHP_GAIN = 15;

function pickRelic(pool, ownedIds) {
  const avail = (pool || []).filter((r) => !ownedIds.includes(r.id));
  const from = avail.length > 0 ? avail : (pool || []);
  if (from.length === 0) return null;
  const total = from.reduce((s, r) => s + (r.weight || 1), 0);
  let roll = rngNext() * total;
  for (const r of from) {
    roll -= (r.weight || 1);
    if (roll <= 0) return r;
  }
  return from[from.length - 1];
}

export function bloodAltarScene(root) {
  const sceneState = {
    selected: null,    // "A" | "B"
    resolved: false,
    resultText: "",
    showRunInfo: false,
  };

  const OPTIONS = [
    { key: "A", cardClass: "b-shop__card--strong", tag: "EPIC",
      name: "Guaranteed Epic", desc: "Gain 1 guaranteed epic relic. A real power spike." },
    { key: "B", cardClass: "b-shop__card--standard", tag: "VITALITY",
      name: `+${MAXHP_GAIN} Max HP`, desc: `+${MAXHP_GAIN} max HP permanently. The blood is a real sacrifice.` },
  ];

  const advance = () => mountScene("map", root);

  const canPay = (cur) => (cur.gold || 0) >= GOLD_COST && (cur.playerHp || 0) > HP_COST;

  const resolve = () => {
    if (sceneState.resolved || sceneState.selected === null) return;
    const cur = getState().run || {};
    if (!canPay(cur)) return;
    // Pay entry cost (applies to both options).
    let newRun = {
      ...cur,
      gold: (cur.gold || 0) - GOLD_COST,
      playerHp: (cur.playerHp || 0) - HP_COST,
    };
    const owned = newRun.relics || [];
    let text = "";
    if (sceneState.selected === "A") {
      const r = pickRelic(relicsData.epics, owned);
      if (r) { newRun = acquireRelic(newRun, r.id); text = `Claimed EPIC relic: ${r.name}. (-${HP_COST} HP)`; }
      else text = "No relic available.";
    } else if (sceneState.selected === "B") {
      newRun.playerMaxHp = (newRun.playerMaxHp || 100) + MAXHP_GAIN;
      // No heal-back: the 15 HP entry cost stays paid (Bible: "real sacrifice").
      // Current HP stays lowered; you gain a permanent +15 maxHP ceiling.
      text = `+${MAXHP_GAIN} max HP permanently. (-${HP_COST} HP paid)`;
    }
    setState({ run: newRun });
    sceneState.resolved = true;
    sceneState.resultText = text;
    render();
  };

  const render = () => {
    const cur = getState().run || {};
    const floor = cur.floor || 1;
    const floorMax = cur.floorMax || 13;
    const hp = cur.playerHp || cur.playerMaxHp || 100;
    const maxHp = cur.playerMaxHp || 100;
    const gold = cur.gold || 0;
    const affordable = canPay(cur);

    const cards = OPTIONS.map((o) => {
      const sel = sceneState.selected === o.key ? "b-shop__card--selected" : "";
      const dim = sceneState.resolved && sceneState.selected !== o.key ? "b-treasure__card--passed" : "";
      const disabled = sceneState.resolved ? "disabled" : "";
      return `
        <button class="b-shop__card ${o.cardClass} ${sel} ${dim}" data-action="pick" data-key="${o.key}" ${disabled}>
          <div class="b-shop__card-tier">${o.tag}</div>
          <div class="b-shop__card-name">${o.name}</div>
          <div class="b-shop__card-desc">${o.desc}</div>
          <div class="b-shop__card-price">${GOLD_COST}g + ${HP_COST} HP</div>
        </button>`;
    }).join("");

    const canConfirm = !sceneState.resolved && sceneState.selected !== null && affordable;
    let confirmLabel;
    if (sceneState.resolved) confirmLabel = "DONE";
    else if (sceneState.selected === null) confirmLabel = `CHOOSE A RITE (${GOLD_COST}g + ${HP_COST} HP)`;
    else if (gold < GOLD_COST) confirmLabel = `NEED ${GOLD_COST - gold}g MORE`;
    else if (hp <= HP_COST) confirmLabel = `NEED MORE HP (>${HP_COST})`;
    else confirmLabel = `PAY ${GOLD_COST}g + ${HP_COST} HP`;

    const leaveLabel = sceneState.resolved ? "LEAVE" : "SKIP (KEEP GOLD & HP)";
    const leavePrimary = sceneState.resolved ? "btn--primary" : "btn--secondary";

    const buffsObj = cur.actionBuffs || {};
    const buffStr = Object.entries(buffsObj).filter(([, v]) => v > 0)
      .map(([k, v]) => `${k.toUpperCase()} +${v}`).join(", ") || "none";
    const runInfoModal = sceneState.showRunInfo ? renderRunInfoModalHTML({
      sections: [
        { rows: [["Mode", cur.mode || "demo"], ["Floor", `${floor}/${floorMax}`], ["Gold", gold]] },
        { title: "CARRY-OVER (LIVE)", rows: [
          ["HP", `${hp}/${maxHp}`], ["Energy", cur.energy || 0],
          ["SHARPEN buffs", buffStr], ["STUDY uses left", `${cur.readUses || 0}/4`],
        ] },
      ],
      relicIds: cur.relics || [],
    }) : "";

    const resultHtml = sceneState.resolved
      ? `<div class="node-stub__desc" style="margin-top:8px;color:#f0a0a0;">${sceneState.resultText}</div>`
      : "";

    root.innerHTML = `
      <div class="b-screen node-stub node-stub--treasure">
        <div class="b-header">
          <button class="b-icon-btn" data-action="surrender">LEAVE</button>
          <div class="b-stage">CH3 - FLOOR ${floor}/${floorMax}</div>
          <button class="b-icon-btn b-runinfo" data-action="run-info">RUN INFO</button>
        </div>
        <div class="node-stub__body b-shop__body">
          <div class="node-stub__icon">\u{1FA78}</div>
          <div class="node-stub__title">BLOOD ALTAR</div>
          <div class="node-stub__desc">A stone altar slick with old blood. Pay ${GOLD_COST} gold and ${HP_COST} HP for one rite \u2014 or walk away.</div>

          <div class="b-shop__section-label">CHOOSE ONE RITE</div>
          <div class="b-shop__grid">${cards}</div>
          ${resultHtml}
          <div class="b-shop__action-row">
            <button class="btn btn--primary" data-action="confirm" ${canConfirm ? "" : "disabled"}>${confirmLabel}</button>
          </div>
          <div class="b-shop__action-row b-shop__action-row--leave">
            <button class="btn ${leavePrimary}" data-action="leave">${leaveLabel}</button>
          </div>
        </div>
        <div class="b-footer">
          <div class="b-hpgold">HP ${hp}/${maxHp} - Gold ${gold}</div>
        </div>
        ${runInfoModal}
      </div>`;
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "pick") {
      if (sceneState.resolved) return;
      sceneState.selected = t.dataset.key;
      render();
    } else if (a === "confirm") {
      resolve();
    } else if (a === "leave") {
      advance();
    } else if (a === "surrender") {
      if (confirm("Leave run and return to lobby?")) {
        setState({ run: null });
        mountScene("lobby", root);
      }
    } else if (a === "run-info") {
      sceneState.showRunInfo = true;
      render();
    } else if (a === "runinfo-close") {
      sceneState.showRunInfo = false;
      render();
    } else if (a === "runinfo-stop") {
      // swallow clicks inside modal card
    }
  };

  render();
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}
