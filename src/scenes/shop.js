import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import { nodeTypeFor, sceneForNodeType } from "../data/floorMap.js";
import relicsData from "../data/relics.json" assert { type: "json" };
import { acquireRelic } from "../data/relicEffects.js";
import { renderRunInfoModalHTML } from "../ui/runInfoModal.js";

/**
 * Shop scene (2.7b-3 v2): 2 commons + 1 rare + heal potion stepper.
 *
 * Commons (2 slots): weighted random without replacement, sorted strong > standard > junk.
 *   Pricing: junk = 25g, standard = 30g, strong = 40g.
 * Rare (1 slot): weighted random from rares pool.
 *   Pricing by rarity weight: w4 (utility) = 60g, w3 (most rares) = 75g, w1 (anti_heal) = 90g.
 * Heal Potion: 3g per 1 HP, scalable. Stepper + FILL TO MAX. Cap at maxHp.
 *
 * NIM Sharpen Stone slot: TBD P7d.
 */

const COMMON_SUBTIER_RANK = { strong: 3, standard: 2, junk: 1 };
const COMMON_PRICE = { strong: 40, standard: 30, junk: 25 };
const RARE_PRICE_BY_WEIGHT = { 4: 60, 3: 75, 2: 85, 1: 90 };
const POTION_GOLD_PER_HP = 3;

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

function rollShopRelics() {
  const commons = relicsData.commons || [];
  const rares = relicsData.rares || [];
  const commonPicks = weightedPickWithoutReplacement(commons, 2);
  commonPicks.sort((a, b) => (COMMON_SUBTIER_RANK[b.subtier] || 0) - (COMMON_SUBTIER_RANK[a.subtier] || 0));
  const rarePicks = weightedPickWithoutReplacement(rares, 1);
  const items = [
    ...commonPicks.map((r) => ({ kind: "relic", relic: r, price: COMMON_PRICE[r.subtier] || 30, sold: false })),
    ...rarePicks.map((r) => ({ kind: "relic", relic: r, price: RARE_PRICE_BY_WEIGHT[r.weight] || 75, sold: false })),
  ];
  return items;
}

export function shopScene(root) {
  const sceneState = {
    items: rollShopRelics(),
    selectedIdx: null,
    potionHp: 0, // current stepper value
    showRunInfo: false, // 2.7d batch4: custom modal flag
  };

  const advance = () => {
    // 2.7d M3: return to map. Floor is set by map node, not incremented here.
    mountScene("map", root);
  };

  const buyRelic = (idx) => {
    const item = sceneState.items[idx];
    if (!item || item.sold) return;
    const cur = getState().run || {};
    const gold = cur.gold || 0;
    if (gold < item.price) return;
    let newRun = { ...cur, gold: gold - item.price };
    newRun = acquireRelic(newRun, item.relic.id);
    setState({ run: newRun });
    item.sold = true;
    sceneState.selectedIdx = null;
    render();
  };

  const buyPotion = () => {
    const cur = getState().run || {};
    const hp = cur.playerHp || 0;
    const maxHp = cur.playerMaxHp || 100;
    const gold = cur.gold || 0;
    const want = sceneState.potionHp;
    if (want <= 0) return;
    const cost = want * POTION_GOLD_PER_HP;
    if (gold < cost) return;
    const newHp = Math.min(maxHp, hp + want);
    const actuallyHealed = newHp - hp;
    const actualCost = actuallyHealed * POTION_GOLD_PER_HP;
    const newRun = { ...cur, playerHp: newHp, gold: gold - actualCost };
    setState({ run: newRun });
    sceneState.potionHp = 0;
    render();
  };

  const adjustPotion = (delta) => {
    const cur = getState().run || {};
    const hp = cur.playerHp || 0;
    const maxHp = cur.playerMaxHp || 100;
    const gold = cur.gold || 0;
    const maxNeeded = Math.max(0, maxHp - hp);
    const maxAffordable = Math.floor(gold / POTION_GOLD_PER_HP);
    const cap = Math.min(maxNeeded, maxAffordable);
    sceneState.potionHp = Math.max(0, Math.min(cap, sceneState.potionHp + delta));
    render();
  };

  const setPotionMax = () => {
    const cur = getState().run || {};
    const hp = cur.playerHp || 0;
    const maxHp = cur.playerMaxHp || 100;
    const gold = cur.gold || 0;
    const maxNeeded = Math.max(0, maxHp - hp);
    const maxAffordable = Math.floor(gold / POTION_GOLD_PER_HP);
    sceneState.potionHp = Math.min(maxNeeded, maxAffordable);
    render();
  };

  const render = () => {
    const cur = getState().run || {};
    const floor = cur.floor || 1;
    const floorMax = cur.floorMax || 9;
    const hp = cur.playerHp || cur.playerMaxHp || 100;
    const maxHp = cur.playerMaxHp || 100;
    const gold = cur.gold || 0;

    const cards = sceneState.items.map((it, idx) => {
      const r = it.relic;
      const tierClass = `b-shop__card--${r.tier}`;
      const subClass = `b-shop__card--${r.subtier}`;
      const canAfford = gold >= it.price && !it.sold;
      const sel = sceneState.selectedIdx === idx ? "b-shop__card--selected" : "";
      const stateCls = it.sold ? "b-shop__card--sold" : (canAfford ? "" : "b-shop__card--locked");
      const priceLabel = it.sold ? "SOLD" : `${it.price}g`;
      const tierBadge = r.tier === "rare" ? "RARE" : r.subtier.toUpperCase();
      return `
        <button class="b-shop__card ${tierClass} ${subClass} ${sel} ${stateCls}" data-action="pick" data-idx="${idx}" ${it.sold ? "disabled" : ""}>
          <div class="b-shop__card-tier">${tierBadge}</div>
          <div class="b-shop__card-name">${r.name}</div>
          <div class="b-shop__card-desc">${r.description}</div>
          <div class="b-shop__card-price">${priceLabel}</div>
        </button>`;
    }).join("");

    const selected = sceneState.selectedIdx !== null ? sceneState.items[sceneState.selectedIdx] : null;
    const canBuy = selected && !selected.sold && gold >= selected.price;
    const buyLabel = !selected
      ? "PICK A RELIC"
      : selected.sold
        ? "SOLD"
        : gold < selected.price
          ? `NEED ${selected.price - gold}g MORE`
          : `BUY (${selected.price}g)`;

    // Potion stepper state
    const potionHp = sceneState.potionHp;
    const potionCost = potionHp * POTION_GOLD_PER_HP;
    const maxNeeded = Math.max(0, maxHp - hp);
    const atMin = potionHp <= 0;
    const atMax = potionHp >= Math.min(maxNeeded, Math.floor(gold / POTION_GOLD_PER_HP));
    const potionDisabledAll = maxNeeded === 0;
    const potionBuyLabel = potionDisabledAll
      ? "HP FULL"
      : potionHp === 0
        ? "PICK AMOUNT"
        : `BUY +${potionHp} HP (${potionCost}g)`;
    const potionBuyDisabled = potionDisabledAll || potionHp === 0 || gold < potionCost;

    // 2.7c-1 fix: preserve scroll position of .b-shop__body across re-renders so
    // tapping the potion stepper doesn't jump the view back to the top on mobile.
    const prevBody = root.querySelector(".b-shop__body");
    const prevScrollTop = prevBody ? prevBody.scrollTop : 0;

    // 2.7d batch4: RUN INFO modal (same shell as battle scene).
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
      <div class="b-screen node-stub node-stub--shop">
        <div class="b-header">
          <button class="b-icon-btn" data-action="surrender">LEAVE</button>
          <div class="b-stage">CH1 - FLOOR ${floor}/${floorMax}</div>
          <button class="b-icon-btn b-runinfo" data-action="run-info">RUN INFO</button>
        </div>
        <div class="node-stub__body b-shop__body">
          <div class="node-stub__icon">\u{1F4B0}</div>
          <div class="node-stub__title">SHOP</div>
          <div class="node-stub__desc">A traveling merchant. 2 commons, 1 rare, and healing potions.</div>

          <div class="b-shop__section-label">RELICS</div>
          <div class="b-shop__grid">${cards}</div>
          <div class="b-shop__action-row">
            <button class="btn btn--primary" data-action="buy" ${canBuy ? "" : "disabled"}>${buyLabel}</button>
          </div>

          <div class="b-shop__section-label">HEAL POTION (${POTION_GOLD_PER_HP}g / HP)</div>
          <div class="b-shop__potion ${potionDisabledAll ? "b-shop__potion--full" : ""}">
            <div class="b-shop__potion-row">
              <button class="b-shop__step" data-action="potion-minus" ${atMin || potionDisabledAll ? "disabled" : ""}>-</button>
              <div class="b-shop__potion-amt">
                <div class="b-shop__potion-hp">+${potionHp} HP</div>
                <div class="b-shop__potion-cost">${potionCost}g</div>
              </div>
              <button class="b-shop__step" data-action="potion-plus" ${atMax || potionDisabledAll ? "disabled" : ""}>+</button>
            </div>
            <div class="b-shop__potion-row b-shop__potion-row--max">
              <button class="btn btn--secondary" data-action="potion-max" ${potionDisabledAll ? "disabled" : ""}>FILL TO MAX</button>
              <button class="btn btn--primary" data-action="buy-potion" ${potionBuyDisabled ? "disabled" : ""}>${potionBuyLabel}</button>
            </div>
          </div>

          <div class="b-shop__action-row b-shop__action-row--leave">
            <button class="btn btn--secondary" data-action="leave">LEAVE SHOP</button>
          </div>
        </div>
        <div class="b-footer">
          <div class="b-hpgold">HP ${hp}/${maxHp} - Gold ${gold}</div>
        </div>
        ${runInfoModal}
      </div>
    `;

    // Restore scroll after DOM swap.
    if (prevScrollTop > 0) {
      const newBody = root.querySelector(".b-shop__body");
      if (newBody) newBody.scrollTop = prevScrollTop;
    }
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "pick") {
      const idx = parseInt(t.dataset.idx, 10);
      if (sceneState.items[idx] && !sceneState.items[idx].sold) {
        sceneState.selectedIdx = idx;
        render();
      }
    } else if (a === "buy") {
      if (sceneState.selectedIdx !== null) buyRelic(sceneState.selectedIdx);
    } else if (a === "potion-plus") {
      adjustPotion(+1);
    } else if (a === "potion-minus") {
      adjustPotion(-1);
    } else if (a === "potion-max") {
      setPotionMax();
    } else if (a === "buy-potion") {
      buyPotion();
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
