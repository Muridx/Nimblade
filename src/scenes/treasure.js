import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import { nodeTypeFor, sceneForNodeType } from "../data/floorMap.js";
import relicsData from "../data/relics.json" assert { type: "json" };
import { acquireRelic } from "../data/relicEffects.js";
import { renderRunInfoModalHTML } from "../ui/runInfoModal.js";

/**
 * Treasure scene (2.7b-4):
 *   - 3 common relics revealed, weighted random (without replacement).
 *   - Player picks EXACTLY ONE for free.
 *   - Tap card -> highlight -> CLAIM button.
 *   - After claim: 2 other cards faded "PASSED", CLAIM gone, LEAVE prominent.
 *   - Decision tension: 3 visible options, only 1 free pick. Real tradeoff.
 */

const SUBTIER_RANK = { strong: 3, standard: 2, junk: 1 };

function weightedPickWithoutReplacement(pool, n) {
  const remaining = [...pool];
  const picks = [];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const total = remaining.reduce((s, r) => s + (r.weight || 1), 0);
    let roll = Math.random() * total;
    let idx = 0;
    for (let j = 0; j < remaining.length; j++) {
      roll -= (remaining[j].weight || 1);
      if (roll <= 0) { idx = j; break; }
    }
    picks.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picks;
}

function rollTreasureRelics() {
  const commons = relicsData.commons || [];
  const picks = weightedPickWithoutReplacement(commons, 3);
  picks.sort((a, b) => (SUBTIER_RANK[b.subtier] || 0) - (SUBTIER_RANK[a.subtier] || 0));
  return picks;
}

export function treasureScene(root) {
  const sceneState = {
    relics: rollTreasureRelics(),
    selectedIdx: null,
    claimedIdx: null, // -1..2 once claimed; null = not yet
    showRunInfo: false, // 2.7d batch4: custom modal flag
  };

  const advance = () => {
    // 2.7d M3: return to map.
    mountScene("map", root);
  };

  const claim = (idx) => {
    if (sceneState.claimedIdx !== null) return;
    const r = sceneState.relics[idx];
    if (!r) return;
    const cur = getState().run || {};
    const newRun = acquireRelic(cur, r.id);
    setState({ run: newRun });
    sceneState.claimedIdx = idx;
    sceneState.selectedIdx = null;
    render();
  };

  const render = () => {
    const cur = getState().run || {};
    const floor = cur.floor || 1;
    const floorMax = cur.floorMax || 9;
    const hp = cur.playerHp || cur.playerMaxHp || 100;
    const maxHp = cur.playerMaxHp || 100;
    const gold = cur.gold || 0;

    const claimed = sceneState.claimedIdx !== null;
    const cards = sceneState.relics.map((r, idx) => {
      const subClass = `b-shop__card--${r.subtier}`;
      const isClaimed = sceneState.claimedIdx === idx;
      const isPassed = claimed && sceneState.claimedIdx !== idx;
      const sel = sceneState.selectedIdx === idx ? "b-shop__card--selected" : "";
      const stateCls = isClaimed ? "b-treasure__card--claimed" : (isPassed ? "b-treasure__card--passed" : "");
      const badge = isClaimed ? "CLAIMED" : isPassed ? "PASSED" : r.subtier.toUpperCase();
      return `
        <button class="b-shop__card ${subClass} ${sel} ${stateCls}" data-action="pick" data-idx="${idx}" ${claimed ? "disabled" : ""}>
          <div class="b-shop__card-tier">${badge}</div>
          <div class="b-shop__card-name">${r.name}</div>
          <div class="b-shop__card-desc">${r.description}</div>
          <div class="b-shop__card-price">FREE</div>
        </button>`;
    }).join("");

    const canClaim = !claimed && sceneState.selectedIdx !== null;
    const claimLabel = claimed
      ? "RELIC CLAIMED"
      : sceneState.selectedIdx === null
        ? "PICK A RELIC"
        : "CLAIM (FREE)";

    // 2.7d batch4: RUN INFO custom modal (same shell as battle scene).
    const buffsObj = cur.actionBuffs || {};
    const buffStr = Object.entries(buffsObj).filter(([,v]) => v > 0)
      .map(([k,v]) => `${k.toUpperCase()} +${v}`).join(", ") || "none";
    const runInfoModal = sceneState.showRunInfo ? renderRunInfoModalHTML({
      sections: [
        { rows: [
          ["Mode", cur.mode || "demo"],
          ["Floor", `${floor}/${floorMax}`],
          ["Gold", gold],
        ]},
        { title: "CARRY-OVER (LIVE)", rows: [
          ["HP", `${hp}/${maxHp}`],
          ["Energy", cur.energy || 0],
          ["SHARPEN buffs", buffStr],
          ["STUDY uses left", `${cur.readUses || 0}/3`],
        ]},
      ],
      relicIds: cur.relics || [],
    }) : "";

    root.innerHTML = `
      <div class="b-screen node-stub node-stub--treasure">
        <div class="b-header">
          <button class="b-icon-btn" data-action="surrender">LEAVE</button>
          <div class="b-stage">CH1 - FLOOR ${floor}/${floorMax}</div>
          <button class="b-icon-btn b-runinfo" data-action="run-info">RUN INFO</button>
        </div>
        <div class="node-stub__body b-shop__body">
          <div class="node-stub__icon">\u{1F4E6}</div>
          <div class="node-stub__title">TREASURE</div>
          <div class="node-stub__desc">An old chest. 3 relics inside. You may take only ONE.</div>

          <div class="b-shop__section-label">CHOOSE ONE</div>
          <div class="b-shop__grid">${cards}</div>
          <div class="b-shop__action-row">
            <button class="btn btn--primary" data-action="claim" ${canClaim ? "" : "disabled"}>${claimLabel}</button>
          </div>

          <div class="b-shop__action-row b-shop__action-row--leave">
            <button class="btn ${claimed ? "btn--primary" : "btn--secondary"}" data-action="leave">${claimed ? "LEAVE" : "LEAVE EMPTY-HANDED"}</button>
          </div>
        </div>
        <div class="b-footer">
          <div class="b-hpgold">HP ${hp}/${maxHp} - Gold ${gold}</div>
        </div>
        ${runInfoModal}
      </div>
    `;
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "pick") {
      if (sceneState.claimedIdx !== null) return;
      const idx = parseInt(t.dataset.idx, 10);
      if (sceneState.relics[idx]) {
        sceneState.selectedIdx = idx;
        render();
      }
    } else if (a === "claim") {
      if (sceneState.selectedIdx !== null) claim(sceneState.selectedIdx);
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
