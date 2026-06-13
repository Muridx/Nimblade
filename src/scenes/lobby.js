import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import { generateMap } from "../data/mapGen.js";
import { connectWallet } from "../data/wallet.js";
import { FORGE_NODES } from "../state/store.js";
import {
  forgeMaxHpBonus,
  forgeStartGoldBonus,
  forgeStartEnergyBonus,
  forgeStarterRelicId,
  describeRunInitEffects,
} from "../data/forgeEffects.js";
import { acquireRelic } from "../data/relicEffects.js";
import {
  ASCENSION_LEVELS,
  ascensionMaxHpPenalty,
  describeAscensionRunEffects,
  clampAsc,
} from "../data/ascensionEffects.js";
import { fetchTopRuns, getDisplayName, setDisplayName } from "../data/leaderboard.js";
import { isSupabaseReady } from "../data/supabase.js";

// 2.7e P0: Nimiq Pay wallet now wired via @nimiq/mini-app-sdk.
// `Connect Wallet` button calls connectWallet() which init()s the SDK,
// listAccounts(), and writes the address to state.meta.wallet. Outside the
// Nimiq Pay host (e.g. plain browser preview) it returns a friendly error
// and the player can still use DEMO mode to play CH1 without a wallet.
//
// M3 (meta header): top bar now shows three meta chips alongside the wallet
// button -- SHARDS (count), FORGE (opens upgrade tree), and ASCENSION
// (run difficulty selector, M6).
//
// M4 (forge modal): clicking SHARDS chip or FORGE button opens the upgrade
// tree -- 4 branches x 3 tiers, prereq chain T1->T2->T3, costs 40/100/250.
// Selection is two-tap (tap card -> PURCHASE button) to prevent misclick on
// mobile. Once unlocked, nodes show GET emerald check. Effects engine that
// reads meta.forge during run-init lands in M5.

let connecting = false;
// M4: forge modal local UI state.
//   forgeOpen          -> modal visible?
//   forgeSelectedKey   -> which node card is currently highlighted (detail
//                         panel shown, PURCHASE button enabled). null = no
//                         selection (detail panel shows hint text).
let forgeOpen = false;
let forgeSelectedKey = null;

// M6: ascension picker modal state.
//   ascOpen     -> modal visible
//   ascSelected -> hovered/tapped level (0..5), null = none
let ascOpen = false;
let ascSelected = null;

// M8: leaderboard modal state.
let lbOpen = false;
let lbRows = null;     // null = loading, [] = empty, [...] = loaded
let lbError = null;

// M4: branch metadata for forge modal layout. Ordered left->right.
const FORGE_BRANCHES = [
  { key: "survival",  icon: "\u2764\ufe0f", label: "SURVIVAL"  },
  { key: "economy",   icon: "\ud83d\udcb0", label: "ECONOMY"   },
  { key: "combat",    icon: "\u2694\ufe0f", label: "COMBAT"    },
  { key: "abilities", icon: "\u26a1",       label: "ABILITIES" },
];

export function lobbyScene(root) {
  forgeOpen = false;
  forgeSelectedKey = null;
  ascOpen = false;
  ascSelected = null;
  lbOpen = false;
  lbRows = null;
  lbError = null;
  render(root);

  const onClick = async (e) => {
    const target = e.target.closest("[data-action]");
    const action = target && target.dataset.action;
    if (!action) return;

    if (action === "wallet") {
      if (connecting) return;
      const wallet = getState().meta.wallet;
      if (wallet) {
        if (confirm(`Disconnect wallet ${shortAddr(wallet.address)}?`)) {
          const meta = getState().meta || {};
          setState({ meta: { ...meta, wallet: null } });
          render(root);
        }
        return;
      }
      connecting = true;
      setBtnText(root, "Connecting...");
      const res = await connectWallet();
      connecting = false;
      if (res.ok) render(root);
      else { alert(res.error || "Wallet connect failed."); render(root); }
      return;
    }
    if (action === "start-run") {
      if (!getState().meta.wallet) {
        alert("Connect your Nimiq wallet to start a full run, or try DEMO mode.");
        return;
      }
      setState({ run: freshRun("full") });
      mountScene("weaponSelect", root);
      return;
    }
    if (action === "try-demo") {
      setState({ run: freshRun("demo") });
      mountScene("weaponSelect", root);
      return;
    }
    // M4: open forge modal (real upgrade tree, no more stub).
    if (action === "open-forge") {
      forgeOpen = true;
      forgeSelectedKey = null;
      render(root);
      return;
    }
    // M4: forge node tap -> select (highlight + show desc + enable purchase if affordable).
    if (action === "forge-select") {
      const key = target.dataset.key;
      forgeSelectedKey = (forgeSelectedKey === key) ? null : key;
      render(root);
      return;
    }
    // M4: purchase confirm -- deduct shards, mark node owned, persist.
    if (action === "forge-buy") {
      const meta = getState().meta || {};
      const node = FORGE_NODES.find((n) => n.key === forgeSelectedKey);
      if (!node) return;
      const status = nodeStatus(node, meta);
      if (status !== "affordable") return; // ignore if not actually buyable
      const newForge = { ...(meta.forge || {}), [node.key]: true };
      const newShards = Math.max(0, (Number(meta.shards) || 0) - node.cost);
      setState({ meta: { ...meta, shards: newShards, forge: newForge } });
      // Stay in modal so player can see updated state + buy next tier.
      render(root);
      return;
    }
    // M4: close forge modal (X button or backdrop).
    if (action === "forge-close") {
      forgeOpen = false;
      forgeSelectedKey = null;
      render(root);
      return;
    }
    if (action === "forge-stop") {
      return; // swallow clicks inside modal card
    }
    // M6: Ascension picker. Opens a modal listing levels 0-5 with the
    // cumulative effects each adds + shard multiplier. Selected level is
    // saved to meta.ascension and consumed by freshRun() / battle.js /
    // mapGen.js on the very next run.
    if (action === "open-ascension") {
      const meta = getState().meta || {};
      if (!meta.ch1Cleared) {
        showToast(root, "\uD83D\uDD12 ASCENSION locked", "Beat the Goblin King (CH1 boss) once to unlock harder runs with bonus shard payouts.");
        return;
      }
      ascOpen = true;
      ascSelected = clampAsc(meta.ascension);
      render(root);
      return;
    }
    if (action === "asc-select") {
      const lvl = clampAsc(parseInt(t.dataset.level, 10));
      ascSelected = lvl;
      render(root);
      return;
    }
    if (action === "asc-confirm") {
      const lvl = clampAsc(ascSelected);
      const cur = getState().meta || {};
      setState({ meta: { ...cur, ascension: lvl } });
      ascOpen = false;
      ascSelected = null;
      render(root);
      showToast(
        root,
        lvl === 0 ? "Ascension reset" : `\uD83C\uDF1F ASCENSION ${lvl}/5 locked`,
        lvl === 0
          ? "Next run plays at standard difficulty."
          : `Next run starts at Ascension ${lvl}. Shard payout x${ASCENSION_LEVELS[lvl].shardMult.toFixed(2)}.`
      );
      return;
    }
    if (action === "asc-close") {
      ascOpen = false;
      ascSelected = null;
      render(root);
      return;
    }
    if (action === "asc-stop") {
      return; // swallow clicks inside the modal card
    }

    // M8: Leaderboard modal handlers.
    if (action === "open-leaderboard") {
      lbOpen = true;
      lbRows = null;
      lbError = null;
      render(root);
      // Kick off fetch; re-render when it lands.
      fetchTopRuns(10).then((rows) => {
        lbRows = rows;
        if (!isSupabaseReady()) lbError = "Leaderboard not configured (env vars missing).";
        if (lbOpen) render(root);
      }).catch((e) => {
        lbRows = [];
        lbError = String(e && e.message || e);
        if (lbOpen) render(root);
      });
      return;
    }
    if (action === "lb-close") {
      lbOpen = false;
      render(root);
      return;
    }
    if (action === "lb-stop") {
      return; // swallow clicks inside modal card
    }
    if (action === "lb-save-name") {
      const input = root.querySelector(".lb__name-input");
      const newName = input ? input.value : "";
      const saved = setDisplayName(newName);
      showToast(root, "Name saved", saved ? `Display name: <strong>${escapeHTML(saved)}</strong>` : "Display name cleared (will show as Anonymous).");
      render(root);
      return;
    }
    if (action === "toast-close") {
      const t = root.querySelector(".lobby__toast");
      if (t) t.remove();
      return;
    }
    if (action === "toast-stop") return;
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/**
 * M4: compute forge-node state given current meta.
 *   "owned"        -> player has already bought it
 *   "locked"       -> prereq tier in same branch not owned yet
 *   "affordable"   -> prereq met, not owned, shards >= cost
 *   "unaffordable" -> prereq met, not owned, shards < cost
 */
function nodeStatus(node, meta) {
  const forge = meta.forge || {};
  const shards = Number(meta.shards) || 0;
  if (forge[node.key]) return "owned";
  if (node.tier > 1) {
    const prereqKey = `${node.branch}_t${node.tier - 1}`;
    if (!forge[prereqKey]) return "locked";
  }
  return shards >= node.cost ? "affordable" : "unaffordable";
}

function render(root) {
  const meta = getState().meta || {};
  const wallet = meta.wallet;
  const walletLabel = wallet ? shortAddr(wallet.address) : "Connect Wallet";

  const shards = Number(meta.shards) || 0;
  const ch1Cleared = !!meta.ch1Cleared;
  const ascLevel = Math.max(0, Math.min(5, Number(meta.ascension) || 0));
  const ascLabel = ch1Cleared ? `ASC ${ascLevel}` : "ASC \uD83D\uDD12";
  const ascClass = ch1Cleared ? "lobby__chip lobby__chip--asc" : "lobby__chip lobby__chip--asc lobby__chip--locked";

  // M4: forge modal HTML appended at end of lobby (covers screen when forgeOpen).
  const forgeModalHTML = forgeOpen ? renderForgeModalHTML(meta) : "";
  // M6: ascension picker modal -- same overlay pattern as forge.
  const ascModalHTML = ascOpen ? renderAscensionModalHTML(meta) : "";
  // M8: leaderboard modal.
  const lbModalHTML = lbOpen ? renderLeaderboardModalHTML() : "";

  root.innerHTML = `
    <div class="lobby">
      <div class="lobby__header">
        <div class="lobby__header-left">
          <button class="lobby__chip lobby__chip--shards" data-action="open-forge" aria-label="Shards (${shards})">
            <span class="lobby__chip-icon">\uD83D\uDC8E</span>
            <span class="lobby__chip-val">${shards}</span>
          </button>
          <button class="lobby__chip lobby__chip--forge" data-action="open-forge">FORGE</button>
          <button class="${ascClass}" data-action="open-ascension">${ascLabel}</button>
          <button class="lobby__chip lobby__chip--lb" data-action="open-leaderboard" aria-label="Leaderboard">\ud83c\udfc6</button>
        </div>
        <button class="lobby__wallet" data-action="wallet">${walletLabel}</button>
      </div>
      <div class="lobby__title">NIMBLADE</div>
      <div class="lobby__spacer"></div>
      <div class="lobby__actions">
        <button class="btn btn--primary" data-action="start-run">START RUN</button>
        <button class="btn btn--secondary" data-action="try-demo">TRY DEMO</button>
        <p class="lobby__hint">Demo runs Chapter 1 only, no wallet needed</p>
      </div>
      ${forgeModalHTML}
      ${ascModalHTML}
      ${lbModalHTML}
    </div>
  `;
}

/**
 * M8: Render the LEADERBOARD modal. Shows top 10 by gold_earned + a small
 * display-name input the player can edit. Uses the same forge__overlay
 * scaffolding so we keep CSS surface small.
 */
function renderLeaderboardModalHTML() {
  const name = getDisplayName();
  const configured = isSupabaseReady();
  let bodyHTML = "";
  if (!configured) {
    bodyHTML = `
      <div class="lb__empty">
        Leaderboard offline. Set <code>VITE_SUPABASE_URL</code> + <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code> and on Vercel, then redeploy.
      </div>`;
  } else if (lbRows === null) {
    bodyHTML = `<div class="lb__empty">Loading...</div>`;
  } else if (lbError) {
    bodyHTML = `<div class="lb__empty">Error: ${escapeHTML(lbError)}</div>`;
  } else if (lbRows.length === 0) {
    bodyHTML = `<div class="lb__empty">No runs yet. Be the first to clear Ch1!</div>`;
  } else {
    const rows = lbRows.map((r, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? "lb__rank--1" : rank === 2 ? "lb__rank--2" : rank === 3 ? "lb__rank--3" : "";
      const asc = (Number(r.ascension) || 0) > 0 ? ` \u00b7 A${r.ascension}` : "";
      const wep = String(r.weapon || "?").slice(0, 8);
      return `
        <div class="lb__row">
          <div class="lb__rank ${rankClass}">#${rank}</div>
          <div class="lb__name">${escapeHTML(r.display_name || "Anonymous")}</div>
          <div class="lb__meta">${escapeHTML(wep)}${asc}</div>
          <div class="lb__gold">\ud83d\udcb0 ${r.gold_earned}</div>
        </div>
      `;
    }).join("");
    bodyHTML = `<div class="lb__list">${rows}</div>`;
  }

  return `
    <div class="lobby__toast forge__overlay" data-action="lb-close">
      <div class="forge__card lb__card" data-action="lb-stop">
        <div class="forge__header">
          <div class="forge__title">\ud83c\udfc6 LEADERBOARD</div>
          <button class="forge__close" data-action="lb-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="lb__name-row">
          <label class="lb__name-label">Your name:</label>
          <input class="lb__name-input" type="text" maxlength="24" placeholder="Anonymous" value="${escapeHTML(name)}" />
          <button class="btn btn--secondary lb__name-save" data-action="lb-save-name">SAVE</button>
        </div>
        ${bodyHTML}
        <div class="lb__footer">Top 10 by gold earned per chapter clear. Updates live after each boss kill.</div>
      </div>
    </div>
  `;
}

/**
 * M6: Render the ASCENSION picker modal. Lists levels 0-5 with effect text
 * + shard multiplier. Tap a row to highlight, tap CONFIRM to save into
 * meta.ascension (consumed by freshRun on next run start).
 *
 * Reuses forge__overlay/forge__card scaffolding so we don't ship a new pile
 * of CSS classes -- only adds `.asc__*` selectors for the row list.
 */
function renderAscensionModalHTML(meta) {
  const currentLvl = clampAsc(meta.ascension);
  const selectedLvl = clampAsc(ascSelected);
  const ch1Cleared = !!meta.ch1Cleared;

  const rows = ASCENSION_LEVELS.map((lv) => {
    const isCurrent = lv.level === currentLvl;
    const isSelected = lv.level === selectedLvl;
    const stateClasses = [
      isSelected ? "asc__row--selected" : "",
      isCurrent ? "asc__row--current" : "",
    ].join(" ");
    const effectsHTML = lv.effectLines.length === 0
      ? `<div class="asc__row-effect asc__row-effect--none">No modifiers</div>`
      : lv.effectLines.map((e) => `<div class="asc__row-effect">\u2022 ${escapeHTML(e)}</div>`).join("");
    const multLabel = `x${lv.shardMult.toFixed(2)}`;
    const currentTag = isCurrent ? `<span class="asc__row-current-tag">CURRENT</span>` : "";
    return `
      <button class="asc__row ${stateClasses}" data-action="asc-select" data-level="${lv.level}">
        <div class="asc__row-head">
          <div class="asc__row-name">${escapeHTML(lv.name)} ${currentTag}</div>
          <div class="asc__row-mult">\ud83d\udc8e ${multLabel}</div>
        </div>
        <div class="asc__row-summary">${escapeHTML(lv.summary)}</div>
        <div class="asc__row-effects">${effectsHTML}</div>
      </button>
    `;
  }).join("");

  const confirmDisabled = selectedLvl === currentLvl;
  const confirmLabel = selectedLvl === 0
    ? "RESET TO STANDARD"
    : `LOCK ASCENSION ${selectedLvl}`;
  const confirmBtn = confirmDisabled
    ? `<button class="btn btn--secondary asc__confirm" disabled>${confirmLabel}</button>`
    : `<button class="btn btn--primary asc__confirm" data-action="asc-confirm">${confirmLabel}</button>`;

  const helperLine = ch1Cleared
    ? "Effects apply to your NEXT run. Setting persists across deaths."
    : "Beat the Ch1 boss to unlock.";

  return `
    <div class="lobby__toast forge__overlay" data-action="asc-close">
      <div class="forge__card asc__card" data-action="asc-stop">
        <div class="forge__header">
          <div class="forge__title">\ud83c\udf1f ASCENSION</div>
          <div class="forge__shards"><span>Current</span> <strong>${currentLvl}/5</strong></div>
          <button class="forge__close" data-action="asc-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="asc__list">${rows}</div>
        <div class="asc__footer">
          <div class="asc__helper">${helperLine}</div>
          ${confirmBtn}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the FORGE upgrade-tree modal.
 * Layout: 4 branch columns x 3 tier rows. Each cell = node card.
 * Below the grid: detail panel (long desc for selected node) + PURCHASE button.
 *
 * Cards show:
 *   - branch icon (header row)
 *   - tier label (left margin label)
 *   - node name + cost
 *   - state badge: \u2705 owned / \ud83d\udd12 locked / \ud83d\udc8e cost
 */
function renderForgeModalHTML(meta) {
  const shards = Number(meta.shards) || 0;

  // Header row (branch icons + labels)
  const headerCells = FORGE_BRANCHES.map((b) => `
    <div class="forge__col-head">
      <div class="forge__col-icon">${b.icon}</div>
      <div class="forge__col-label">${b.label}</div>
    </div>
  `).join("");

  // 3 tier rows, each row has 4 node cards (one per branch).
  const rows = [1, 2, 3].map((tier) => {
    const rowCells = FORGE_BRANCHES.map((b) => {
      const node = FORGE_NODES.find((n) => n.branch === b.key && n.tier === tier);
      if (!node) return `<div class="forge__cell"></div>`;
      const status = nodeStatus(node, meta);
      const isSelected = forgeSelectedKey === node.key;
      const stateClass = `forge__cell--${status}`;
      const selClass = isSelected ? "forge__cell--selected" : "";
      let badge = "";
      if (status === "owned") badge = `<div class="forge__badge forge__badge--owned">\u2705</div>`;
      else if (status === "locked") badge = `<div class="forge__badge forge__badge--locked">\ud83d\udd12</div>`;
      const costLine = status === "owned" ? "OWNED" : `\ud83d\udc8e ${node.cost}`;
      return `
        <button class="forge__cell ${stateClass} ${selClass}" data-action="forge-select" data-key="${node.key}">
          ${badge}
          <div class="forge__cell-name">${escapeHTML(node.name)}</div>
          <div class="forge__cell-cost">${costLine}</div>
        </button>
      `;
    }).join("");
    return `
      <div class="forge__row">
        <div class="forge__row-label">T${tier}</div>
        ${rowCells}
      </div>
    `;
  }).join("");

  // Detail panel for selected node.
  const selectedNode = FORGE_NODES.find((n) => n.key === forgeSelectedKey);
  let detailHTML = "";
  if (selectedNode) {
    const status = nodeStatus(selectedNode, meta);
    let actionHTML = "";
    if (status === "owned") {
      actionHTML = `<div class="forge__detail-state forge__detail-state--owned">\u2705 Already forged -- effect applies to every new run.</div>`;
    } else if (status === "locked") {
      const prereqKey = `${selectedNode.branch}_t${selectedNode.tier - 1}`;
      const prereqNode = FORGE_NODES.find((n) => n.key === prereqKey);
      actionHTML = `<div class="forge__detail-state forge__detail-state--locked">\ud83d\udd12 Forge <strong>${escapeHTML(prereqNode ? prereqNode.name : "previous tier")}</strong> first.</div>`;
    } else if (status === "unaffordable") {
      const need = selectedNode.cost - shards;
      actionHTML = `
        <div class="forge__detail-state forge__detail-state--poor">Need <strong>${need}</strong> more shards.</div>
        <button class="btn btn--secondary forge__buy" disabled>\ud83d\udc8e ${selectedNode.cost} -- INSUFFICIENT</button>
      `;
    } else {
      // affordable
      actionHTML = `<button class="btn btn--primary forge__buy" data-action="forge-buy">\ud83d\udc8e ${selectedNode.cost} -- PURCHASE</button>`;
    }
    detailHTML = `
      <div class="forge__detail">
        <div class="forge__detail-name">${escapeHTML(selectedNode.name)} <span class="forge__detail-tier">T${selectedNode.tier}</span></div>
        <div class="forge__detail-desc">${escapeHTML(selectedNode.desc)}</div>
        ${actionHTML}
      </div>
    `;
  } else {
    detailHTML = `<div class="forge__detail forge__detail--empty">Tap a node to inspect. Upgrades persist across every run.</div>`;
  }

  return `
    <div class="lobby__toast forge__overlay" data-action="forge-close">
      <div class="forge__card" data-action="forge-stop">
        <div class="forge__header">
          <div class="forge__title">\ud83d\udd28 FORGE</div>
          <div class="forge__shards"><span>\ud83d\udc8e</span> <strong>${shards}</strong></div>
          <button class="forge__close" data-action="forge-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="forge__grid">
          <div class="forge__row forge__row--head">
            <div class="forge__row-label"></div>
            ${headerCells}
          </div>
          ${rows}
        </div>
        ${detailHTML}
      </div>
    </div>
  `;
}

function escapeHTML(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setBtnText(root, text) {
  const btn = root.querySelector('[data-action="wallet"]');
  if (btn) btn.textContent = text;
}

function showToast(root, title, body) {
  const existing = root.querySelector(".lobby__toast:not(.forge__overlay)");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "lobby__toast";
  el.setAttribute("data-action", "toast-close");
  el.innerHTML = `
    <div class="lobby__toast-card" data-action="toast-stop">
      <div class="lobby__toast-title">${title}</div>
      <div class="lobby__toast-body">${body}</div>
      <button class="btn btn--secondary lobby__toast-btn" data-action="toast-close">OK</button>
    </div>
  `;
  const lobby = root.querySelector(".lobby");
  (lobby || root).appendChild(el);
}

function freshRun(mode) {
  // M5a: read meta forge ownership and bake the 4 run-init bonuses in.
  // We do this BEFORE constructing the run object so HP/gold/energy already
  // reflect the upgrade tree the first time freshRun's value is read.
  const meta = getState().meta || {};
  const hpBonus     = forgeMaxHpBonus(meta);       // survival_t1 -> +5
  const goldBonus   = forgeStartGoldBonus(meta);   // economy_t1  -> +10
  const energyBonus = forgeStartEnergyBonus(meta); // abilities_t2 -> +20
  // M6: Asc 3+ -- start with -10 max HP. Applied AFTER forge bonus so the
  // two stack predictably (e.g. Survival T1 + Asc 3 = +5 - 10 = -5 net).
  const ascLevel = clampAsc(meta.ascension);
  const ascHpPenalty = ascensionMaxHpPenalty(ascLevel);
  const startMaxHp = Math.max(10, 100 + hpBonus - ascHpPenalty);

  let run = {
    mode,
    weapon: null,
    chapter: "CH1",
    floor: 1,
    floorMax: 9,
    gold: 0 + goldBonus,
    totalGoldEarned: 0 + goldBonus, // M2: starter gold counts toward shard payout
    ascension: ascLevel,
    relics: [],
    playerHp: startMaxHp,
    playerMaxHp: startMaxHp,
    sharpenStones: 0,
    energy: 0 + energyBonus,
    momentumStacks: 0,
    berserkTurns: 0,
    readUses: 3,
    normalQueue: null,
    normalQueueChapter: null,
    map: generateMap(undefined, ascLevel),
    currentNodeId: null,
    visitedNodeIds: [],
  };

  // M5a: survival_t3 -- free starter relic. Pick a weighted-random common
  // and route through the standard acquireRelic engine so on-acquire effects
  // (e.g. dusty_tome's +3 max HP) apply correctly. acquireRelic returns a
  // NEW run object (immutable-style), so reassign.
  const starterId = forgeStarterRelicId(meta);
  if (starterId) {
    run = acquireRelic(run, starterId);
  }

  // Debug: log applied effects to console so QA can verify wiring.
  const applied = describeRunInitEffects(meta);
  if (applied.length > 0) {
    console.log("[forge] run-init effects applied:", applied.join(", "), starterId ? `(starter relic: ${starterId})` : "");
  }
  const ascApplied = describeAscensionRunEffects(ascLevel);
  if (ascApplied.length > 0) {
    console.log(`[ascension] Asc ${ascLevel} run-init effects:`, ascApplied.join(" | "));
  }

  return run;
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}
