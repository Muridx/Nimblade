import { mountScene } from "./sceneManager.js";
import { next as rngNext } from "../data/rng.js";
import { getState, setState } from "../state/store.js";
import relicsData from "../data/relics.json" assert { type: "json" };
import { acquireRelic } from "../data/relicEffects.js";
import { renderRunInfoModalHTML } from "../ui/runInfoModal.js";

/**
 * Crystal Shrine scene -- Bible v3.0 §6.6 (CH2 F7).
 *
 * Cost: 40g. Player pays once and chooses ONE option, or SKIPS (free, keep gold):
 *   A) 1 random COMMON relic  (safe, reliable)
 *   B) 1 random RARE relic    (greedy, high-upside)
 *   C) +50% shard bonus at end of run (long-term investment)
 *
 * Decision tension: one transaction, three very different payoffs + a free skip.
 * Pattern mirrors treasure.js (acquireRelic -> setState -> mountScene("map")).
 */

const COST = 40;

// Weighted random relic from a pool, excluding ids the run already owns.
function pickRelic(pool, ownedIds) {
  const avail = (pool || []).filter((r) => !ownedIds.includes(r.id));
  const from = avail.length > 0 ? avail : (pool || []); // fall back if somehow all owned
  if (from.length === 0) return null;
  const total = from.reduce((s, r) => s + (r.weight || 1), 0);
  let roll = rngNext() * total;
  for (const r of from) {
    roll -= (r.weight || 1);
    if (roll <= 0) return r;
  }
  return from[from.length - 1];
}

export function crystalShrineScene(root) {
  const sceneState = {
    selected: null,     // "A" | "B" | "C"
    resolved: false,    // true after paying + applying
    resultText: "",     // shown after resolve
    showRunInfo: false,
  };

  const OPTIONS = [
    { key: "A", cardClass: "b-shop__card--standard", tag: "COMMON",
      name: "Common Relic", desc: "Gain 1 random common relic. Safe, reliable." },
    { key: "B", cardClass: "b-shop__card--rare", tag: "RARE",
      name: "Rare Relic", desc: "Gain 1 random rare relic. Greedy, high-upside." },
    { key: "C", cardClass: "b-shop__card--strong", tag: "SHARDS",
      name: "+50% Shards", desc: "+50% shard bonus at the end of this run." },
  ];

  const advance = () => mountScene("map", root);

  const resolve = () => {
    if (sceneState.resolved || sceneState.selected === null) return;
    const cur = getState().run || {};
    const gold = cur.gold || 0;
    if (gold < COST) return; // can't afford
    // Phase 3: log shrine choice.
    if (cur.moveLog) {
      cur.moveLog.push({ t: "shrine", floor: cur.floor || 1, v: sceneState.selected });
    }
    let newRun = { ...cur, gold: gold - COST };
    const owned = newRun.relics || [];
    let text = "";
    if (sceneState.selected === "A") {
      const r = pickRelic(relicsData.commons, owned);
      if (r) { newRun = acquireRelic(newRun, r.id); text = `Claimed common relic: ${r.name}.`; }
      else text = "No relic available.";
    } else if (sceneState.selected === "B") {
      const r = pickRelic(relicsData.rares, owned);
      if (r) { newRun = acquireRelic(newRun, r.id); text = `Claimed rare relic: ${r.name}.`; }
      else text = "No relic available.";
    } else if (sceneState.selected === "C") {
      newRun.shardBonusMult = (Number(newRun.shardBonusMult) || 0) + 0.5;
      text = "+50% shard bonus active for this run.";
    }
    setState({ run: newRun });
    sceneState.resolved = true;
    sceneState.resultText = text;
    render();
  };

  const render = () => {
    const cur = getState().run || {};
    const floor = cur.floor || 1;
    const floorMax = cur.floorMax || 11;
    const hp = cur.playerHp || cur.playerMaxHp || 100;
    const maxHp = cur.playerMaxHp || 100;
    const gold = cur.gold || 0;
    const canAfford = gold >= COST;

    const cards = OPTIONS.map((o) => {
      const sel = sceneState.selected === o.key ? "b-shop__card--selected" : "";
      const dim = sceneState.resolved && sceneState.selected !== o.key ? "b-treasure__card--passed" : "";
      const disabled = sceneState.resolved ? "disabled" : "";
      return `
        <button class="b-shop__card ${o.cardClass} ${sel} ${dim}" data-action="pick" data-key="${o.key}" ${disabled}>
          <div class="b-shop__card-tier">${o.tag}</div>
          <div class="b-shop__card-name">${o.name}</div>
          <div class="b-shop__card-desc">${o.desc}</div>
          <div class="b-shop__card-price">${COST}g</div>
        </button>`;
    }).join("");

    const canConfirm = !sceneState.resolved && sceneState.selected !== null && canAfford;
    let confirmLabel;
    if (sceneState.resolved) confirmLabel = "DONE";
    else if (sceneState.selected === null) confirmLabel = `CHOOSE AN OFFERING (${COST}g)`;
    else if (!canAfford) confirmLabel = `NEED ${COST - gold}g MORE`;
    else confirmLabel = `OFFER ${COST}g`;

    const leaveLabel = sceneState.resolved ? "LEAVE" : "SKIP (KEEP GOLD)";
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
      ? `<div class="node-stub__desc" style="margin-top:8px;color:#9fe6c8;">${sceneState.resultText}</div>`
      : "";

    root.innerHTML = `
      <div class="b-screen node-stub node-stub--treasure">
        <div class="b-header">
          <button class="b-icon-btn" data-action="surrender">LEAVE</button>
          <div class="b-stage">CH2 - FLOOR ${floor}/${floorMax}</div>
          <button class="b-icon-btn b-runinfo" data-action="run-info">RUN INFO</button>
        </div>
        <div class="node-stub__body b-shop__body">
          <div class="node-stub__icon">\u{1F48E}</div>
          <div class="node-stub__title">CRYSTAL SHRINE</div>
          <div class="node-stub__desc">A humming crystal altar. Offer ${COST} gold for one boon \u2014 or walk past and keep your coin.</div>

          <div class="b-shop__section-label">CHOOSE ONE OFFERING</div>
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
