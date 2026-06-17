/*
 * NIMBLADE -- Weekly Gauntlet scene.
 *
 * Reached from the lobby (GAUNTLET button under TRY DEMO). This is the home of
 * the competitive, wallet-gated mode:
 *
 *   PHASE 1 (shipped):
 *     - Explains what the Weekly Gauntlet is.
 *     - NIM -> gem exchange (ONE WAY). Buying gems calls wallet.sendNim() to the
 *       project wallet. Gems are credited to meta.gems ONLY on a confirmed tx.
 *
 *   PHASE 2 (shipped):
 *     - Weekly shared-seed Gauntlet run. Every player faces the same monsters,
 *       relics, events, and enemy move-rolls that week. Seed auto-derives from
 *       the Monday-aligned week number.
 *     - ENTER GAUNTLET: spend 2 gems -> start a gauntlet-mode run on the weekly
 *       seed -> weapon select -> play all 3 chapters.
 *     - Your Best This Week: locally stored personal best (progress + HP).
 *       Resets automatically when the week rolls over.
 *     - Ranking: progress (chapter*100 + floor) -> HP remaining -> earliest
 *       submission time.
 *
 *   PHASE 3 (this version):
 *     - Supabase weekly leaderboard (top 20, highlights own scores).
 *     - Auto-submit gauntlet scores to Supabase from battle.js.
 *     - Move log recording for future anti-cheat replay.
 *     - Prize pool system: entry gems fund the weekly pool, top 3 split it.
 *     - Reward claim: winners see a claim banner and receive gems.
 *
 * IMPORTANT: NIM transactions only work INSIDE the Nimiq Pay host. In a plain
 * browser (Vercel preview) connectWallet()/sendNim() fail gracefully with a
 * friendly message -- buying gems can only be verified inside Nimiq Pay.
 *
 * gem -> NIM cash-out is deliberately NOT built here. It is held until Nimiq
 * gives compliance greenlight (+ KYC/geo), because letting gems convert back to
 * real NIM would re-introduce a cash prize (gambling/money-transmitter risk).
 */

import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import {
  warmupWallet,
  connectWallet,
  sendNim,
  isConnected,
  getAddress,
} from "../data/wallet.js";
import { freshRun } from "./lobby.js";
import {
  fetchWeeklyLeaderboard,
  incrementPool,
  fetchPool,
  fetchMyReward,
  claimReward,
  calculateAndInsertRewards,
  fetchRewards,
} from "../data/gauntletLeaderboard.js";
import { getDeviceId } from "../data/leaderboard.js";


// --- Config -------------------------------------------------------------
const GAUNTLET_WALLET = "NQ35 BMRD H1CX 91AY 7XKE EAXU HNH6 1906 S9DX";
const GEM_PER_NIM = 2;
const ENTRY_COST = 2;
const BUNDLES = [
  { nim: 1, gem: 1 * GEM_PER_NIM },
  { nim: 5, gem: 5 * GEM_PER_NIM },
  { nim: 10, gem: 10 * GEM_PER_NIM },
];

// --- Weekly seed (exported for use by battle.js / gauntletLeaderboard) ---
const WEEK_EPOCH = new Date("2026-01-05T00:00:00Z").getTime();
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Current week number (0-indexed from epoch). Rotates Monday 00:00 UTC. */
export function getWeekNumber() {
  return Math.floor((Date.now() - WEEK_EPOCH) / MS_PER_WEEK);
}

/** Deterministic seed for the current week. Same for every player. */
export function getWeeklySeed() {
  const weekNum = getWeekNumber();
  return (weekNum * 2654435761) >>> 0;
}

/** Human-readable week label. */
function getWeekLabel() {
  const weekNum = getWeekNumber();
  const weekStart = new Date(WEEK_EPOCH + weekNum * MS_PER_WEEK);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `Week ${weekNum} · ${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

// --- Local best storage -------------------------------------------------
const LS_BEST_KEY = "nimblade.gauntlet_best.v1";

/** Gauntlet progress score: chapter * 100 + floor. Higher = better. */
export function gauntletProgress(run) {
  if (!run) return 0;
  const ch = parseInt(String(run.chapter || "CH1").replace(/\D/g, ""), 10) || 1;
  return ch * 100 + (Number(run.floor) || 1);
}

function progressLabel(progress) {
  const ch = Math.floor(progress / 100);
  const fl = progress % 100;
  return `CH${ch} Floor ${fl}`;
}

function loadBest() {
  try {
    const raw = localStorage.getItem(LS_BEST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.weekNum !== getWeekNumber()) {
      localStorage.removeItem(LS_BEST_KEY);
      return null;
    }
    return data;
  } catch (_) { return null; }
}

export function saveBestIfNew(run) {
  if (!run || run.mode !== "gauntlet") return false;
  const progress = gauntletProgress(run);
  const hp = Math.max(0, Number(run.playerHp) || 0);
  const weekNum = getWeekNumber();
  const now = Date.now();

  const current = loadBest();
  if (current) {
    if (progress < current.progress) return false;
    if (progress === current.progress && hp <= current.hp) return false;
  }

  const best = {
    weekNum,
    progress,
    hp,
    chapter: run.chapter || "CH1",
    floor: Number(run.floor) || 1,
    timestamp: now,
    completed: Boolean(run.completed),
  };

  try {
    localStorage.setItem(LS_BEST_KEY, JSON.stringify(best));
  } catch (_) {}

  return true;
}

// --- Scene state (reset on every mount) ---------------------------------
let busyBundle = null;
let connecting = false;
let status = null;
let leaderboardData = [];   // Phase 3: array of top scores
let leaderboardLoading = true;
let myDeviceId = null;      // Phase 3: for highlighting own scores
let poolGems = 0;           // Prize pool: current week's total gems
let lastWeekRewards = [];   // Last week's reward winners
let myUnclaimedReward = null; // { rank, gems_won } if current device won last week
let claimingReward = false;

function escapeHTML(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</, "&lt;")
    .replace(/>/, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortAddr(addr) {
  if (!addr) return "";
  const clean = String(addr);
  return clean.length > 14 ? `${clean.slice(0, 8)}...${clean.slice(-4)}` : clean;
}

function gemBalance() {
  return Math.max(0, Math.floor(Number(getState()?.meta?.gems) || 0));
}

export function gauntletScene(root) {
  busyBundle = null;
  connecting = false;
  status = null;
  leaderboardData = [];
  leaderboardLoading = true;
  myDeviceId = null;
  poolGems = 0;
  lastWeekRewards = [];
  myUnclaimedReward = null;
  claimingReward = false;

  warmupWallet();

  const weekNum = getWeekNumber();
  const lastWeekNum = weekNum - 1;

  // Parallel data fetch: leaderboard, device ID, pool, last week rewards + claim check.
  Promise.all([
    fetchWeeklyLeaderboard(weekNum, 20),
    getDeviceId(),
    fetchPool(weekNum),
    // Only calculate last week rewards if lastWeekNum >= 0.
    lastWeekNum >= 0 ? calculateAndInsertRewards(lastWeekNum) : Promise.resolve([]),
  ]).then(async ([scores, deviceId, pool, rewards]) => {
    leaderboardData = scores || [];
    myDeviceId = deviceId;
    poolGems = pool;
    lastWeekRewards = rewards || [];
    leaderboardLoading = false;

    // Check if current device has an unclaimed reward from last week.
    if (lastWeekNum >= 0 && lastWeekRewards.length > 0) {
      const myReward = await fetchMyReward(lastWeekNum);
      if (myReward && !myReward.claimed && myReward.gems_won > 0) {
        myUnclaimedReward = { weekNum: lastWeekNum, rank: myReward.rank, gems_won: myReward.gems_won };
      }
    }

    render(root);
  }).catch(() => {
    leaderboardLoading = false;
    render(root);
  });

  render(root);

  const onClick = async (e) => {
    const target = e.target.closest("[data-action]");
    const action = target && target.dataset.action;
    if (!action) return;

    if (action === "gauntlet-back") {
      mountScene("lobby", root);
      return;
    }

    if (action === "gauntlet-connect") {
      if (connecting) return;
      connecting = true;
      status = null;
      render(root);
      const res = await connectWallet();
      connecting = false;
      if (!res.ok) {
        status = { kind: "err", text: res.error || "Wallet connect failed." };
      }
      render(root);
      return;
    }

    if (action === "buy-gem") {
      if (busyBundle != null) return;
      const nim = Number(target.dataset.nim);
      const gem = Number(target.dataset.gem);
      if (!nim || !gem) return;

      if (!isConnected()) {
        status = { kind: "err", text: "Connect your wallet first." };
        render(root);
        return;
      }

      busyBundle = nim;
      status = null;
      render(root);

      const res = await sendNim(GAUNTLET_WALLET, nim, "Nimblade gems");
      busyBundle = null;

      if (res.ok) {
        const meta = getState().meta || {};
        setState({ meta: { ...meta, gems: (Number(meta.gems) || 0) + gem } });
        status = { kind: "ok", text: `+${gem} gem added! (paid ${nim} NIM)` };
        console.log("[gauntlet] gem purchase ok:", { nim, gem, txHash: res.txHash });
      } else {
        status = { kind: "err", text: res.error || "Payment failed or was cancelled. No gems charged." };
        console.warn("[gauntlet] gem purchase failed:", res.error);
      }
      render(root);
      return;
    }

    if (action === "enter-gauntlet") {
      const gems = gemBalance();
      if (gems < ENTRY_COST) {
        status = { kind: "err", text: `Not enough gems. Need ${ENTRY_COST}, have ${gems}.` };
        render(root);
        return;
      }
      if (!isConnected()) {
        status = { kind: "err", text: "Connect your wallet first." };
        render(root);
        return;
      }

      const meta = getState().meta || {};
      setState({ meta: { ...meta, gems: Math.max(0, (Number(meta.gems) || 0) - ENTRY_COST) } });

      // Increment prize pool (fire-and-forget).
      incrementPool(getWeekNumber(), ENTRY_COST);

      const weeklySeed = getWeeklySeed();
      setState({ run: freshRun("gauntlet", weeklySeed) });
      console.log("[gauntlet] entering gauntlet run, seed:", weeklySeed, "week:", getWeekNumber());

      mountScene("weaponSelect", root);
      return;
    }

    // Phase 3: refresh leaderboard + pool
    if (action === "refresh-lb") {
      leaderboardLoading = true;
      render(root);
      try {
        const [scores, pool] = await Promise.all([
          fetchWeeklyLeaderboard(getWeekNumber(), 20),
          fetchPool(getWeekNumber()),
        ]);
        leaderboardData = scores;
        poolGems = pool;
      } catch (_) {}
      leaderboardLoading = false;
      render(root);
      return;
    }

    // Claim reward
    if (action === "claim-reward") {
      if (claimingReward || !myUnclaimedReward) return;
      claimingReward = true;
      render(root);
      const gemsWon = await claimReward(myUnclaimedReward.weekNum);
      claimingReward = false;
      if (gemsWon > 0) {
        // Credit gems to player.
        const meta = getState().meta || {};
        setState({ meta: { ...meta, gems: (Number(meta.gems) || 0) + gemsWon } });
        status = { kind: "ok", text: `🎉 Claimed ${gemsWon} gems! (Rank #${myUnclaimedReward.rank} last week)` };
        myUnclaimedReward = null;
        console.log(`[gauntlet] claimed ${gemsWon} gems reward`);
      } else {
        status = { kind: "err", text: "Reward already claimed or not found." };
        myUnclaimedReward = null;
      }
      render(root);
      return;
    }
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

// --- Rendering helpers --------------------------------------------------

/** Weapon emoji for compact leaderboard display. */
function weaponEmoji(w) {
  const map = { sword: "⚔️", spear: "🔱", axe: "🪓", staff: "🪄" };
  return map[w] || "⚔️";
}

/** Rank badge for top 3. */
function rankBadge(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}`;
}

/** Render a leaderboard row. */
function lbRow(entry, rank, isMe) {
  const prog = progressLabel(entry.progress);
  const meClass = isMe ? "gaunt__lb-row--me" : "";
  const name = escapeHTML(entry.display_name || "Anonymous");
  const wep = weaponEmoji(entry.weapon);
  return `
    <div class="gaunt__lb-row ${meClass}">
      <span class="gaunt__lb-rank">${rankBadge(rank)}</span>
      <span class="gaunt__lb-name">${wep} ${name}</span>
      <span class="gaunt__lb-prog">${prog}</span>
      <span class="gaunt__lb-hp">❤️${entry.hp}</span>
    </div>`;
}

function render(root) {
  const connected = isConnected();
  const addr = getAddress();
  const gems = gemBalance();
  const weeklySeed = getWeeklySeed();
  const seedDisplay = String(weeklySeed).slice(-6);
  const weekLabel = getWeekLabel();
  const best = loadBest();

  // --- Unclaimed reward banner ---
  let rewardBanner = "";
  if (myUnclaimedReward) {
    rewardBanner = `
      <section class="gaunt__card gaunt__card--reward">
        <h2 class="gaunt__card-title">🎉 You Won Last Week!</h2>
        <p class="gaunt__reward-text">
          You placed <strong>#${myUnclaimedReward.rank}</strong> and won
          <strong>${myUnclaimedReward.gems_won} 💎</strong> from the prize pool!
        </p>
        <button class="btn btn--primary gaunt__claim-btn" data-action="claim-reward"
                ${claimingReward ? "disabled" : ""}>
          ${claimingReward ? "Claiming..." : `CLAIM ${myUnclaimedReward.gems_won} 💎`}
        </button>
      </section>`;
  }

  // --- Wallet block ---
  const walletBlock = connected
    ? `<div class="gaunt__wallet gaunt__wallet--on">
         <span class="gaunt__wallet-dot"></span>
         <span>Wallet: ${escapeHTML(shortAddr(addr))}</span>
       </div>`
    : `<div class="gaunt__wallet">
         <p class="gaunt__wallet-note">Connect your Nimiq wallet to buy gems and enter the Gauntlet.</p>
         <button class="btn btn--primary" data-action="gauntlet-connect" ${connecting ? "disabled" : ""}>
           ${connecting ? "Connecting..." : "CONNECT WALLET"}
         </button>
       </div>`;

  // --- Gem bundles ---
  const bundlesBlock = BUNDLES.map((b) => {
    const loading = busyBundle === b.nim;
    const disabled = !connected || busyBundle != null;
    return `
      <button class="gaunt__bundle ${loading ? "gaunt__bundle--loading" : ""}"
              data-action="buy-gem" data-nim="${b.nim}" data-gem="${b.gem}"
              ${disabled ? "disabled" : ""}>
        <span class="gaunt__bundle-gem">${b.gem} 💎</span>
        <span class="gaunt__bundle-price">${loading ? "Paying..." : `${b.nim} NIM`}</span>
      </button>`;
  }).join("");

  // --- Status banner ---
  const statusBlock = status
    ? `<div class="gaunt__status gaunt__status--${status.kind}">${escapeHTML(status.text)}</div>`
    : "";

  // --- Best score this week ---
  let bestBlock = "";
  if (best) {
    const dateStr = new Date(best.timestamp).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    bestBlock = `
      <div class="gaunt__best">
        <div class="gaunt__best-row">
          <span class="gaunt__best-label">Progress</span>
          <span class="gaunt__best-value">${escapeHTML(progressLabel(best.progress))}${best.completed ? " ✨ COMPLETE" : ""}</span>
        </div>
        <div class="gaunt__best-row">
          <span class="gaunt__best-label">HP Remaining</span>
          <span class="gaunt__best-value">${best.hp}</span>
        </div>
        <div class="gaunt__best-row">
          <span class="gaunt__best-label">Submitted</span>
          <span class="gaunt__best-value">${escapeHTML(dateStr)}</span>
        </div>
      </div>`;
  } else {
    bestBlock = `<p class="gaunt__hint">No runs yet this week. Enter the Gauntlet to set your score!</p>`;
  }

  // --- Enter button ---
  let enterBtn;
  if (!connected) {
    enterBtn = `<button class="btn btn--primary gaunt__enter-btn" disabled>CONNECT WALLET FIRST</button>`;
  } else if (gems < ENTRY_COST) {
    enterBtn = `<button class="btn btn--primary gaunt__enter-btn" disabled>NOT ENOUGH GEMS (need ${ENTRY_COST} 💎)</button>`;
  } else {
    enterBtn = `<button class="btn btn--primary gaunt__enter-btn" data-action="enter-gauntlet">⚔️ ENTER GAUNTLET — ${ENTRY_COST} 💎</button>`;
  }

  // --- Entry count display (pool tracked internally, UI shows entries) ---
  const totalEntries = ENTRY_COST > 0 ? Math.floor(poolGems / ENTRY_COST) : 0;
  const poolDisplay = `
    <div class="gaunt__pool">
      <span class="gaunt__pool-label">Entries This Week</span>
      <span class="gaunt__pool-value">🎮 ${totalEntries}</span>
    </div>
    <p class="gaunt__pool-info">Top 3 split the entry pool: 50% / 30% / 20%</p>`;

  // --- Phase 3: Leaderboard card ---
  let leaderboardBlock;
  if (leaderboardLoading) {
    leaderboardBlock = `<p class="gaunt__hint gaunt__lb-loading">Loading leaderboard...</p>`;
  } else if (leaderboardData.length === 0) {
    leaderboardBlock = `<p class="gaunt__hint">No scores submitted yet this week. Be the first!</p>`;
  } else {
    // Deduplicate: keep only the best score per device_id.
    const seen = new Set();
    const deduped = [];
    for (const entry of leaderboardData) {
      if (!seen.has(entry.device_id)) {
        seen.add(entry.device_id);
        deduped.push(entry);
      }
    }
    const rows = deduped.map((entry, i) => {
      const isMe = myDeviceId && entry.device_id === myDeviceId;
      return lbRow(entry, i + 1, isMe);
    }).join("");
    leaderboardBlock = `
      <div class="gaunt__lb-header">
        <span class="gaunt__lb-hcol">Rank</span>
        <span class="gaunt__lb-hcol gaunt__lb-hcol--name">Player</span>
        <span class="gaunt__lb-hcol">Progress</span>
        <span class="gaunt__lb-hcol">HP</span>
      </div>
      <div class="gaunt__lb-rows">${rows}</div>`;
  }

  // --- Last week's winners ---
  let lastWeekBlock = "";
  if (lastWeekRewards.length > 0) {
    const winnerRows = lastWeekRewards.map((r) => `
      <div class="gaunt__lw-row">
        <span class="gaunt__lw-rank">${rankBadge(r.rank)}</span>
        <span class="gaunt__lw-name">${escapeHTML(r.display_name || "Anonymous")}</span>
        <span class="gaunt__lw-gems">${r.gems_won} 💎</span>
      </div>`).join("");
    lastWeekBlock = `
      <section class="gaunt__card">
        <h2 class="gaunt__card-title">🏅 Last Week's Winners</h2>
        ${winnerRows}
      </section>`;
  }

  root.innerHTML = `
    <div class="gaunt">
      <div class="gaunt__top">
        <button class="gaunt__back" data-action="gauntlet-back" aria-label="Back to lobby">←</button>
        <h1 class="gaunt__title">⚔️ WEEKLY GAUNTLET</h1>
        <div class="gaunt__gembal" aria-label="Gem balance">${gems} 💎</div>
      </div>

      <p class="gaunt__intro">
        A weekly <strong>skill</strong> tournament. Every player faces the
        <strong>same monsters, relics and events</strong> that week (a shared seed),
        so the leaderboard is decided by skill &mdash; not luck. Spend <strong>gems</strong>
        to enter; climb the board. <strong>Top 3</strong> split the prize pool!
      </p>

      ${rewardBanner}

      <section class="gaunt__card">
        <h2 class="gaunt__card-title">This Week's Gauntlet</h2>
        <div class="gaunt__week-info">
          <span class="gaunt__week-label">${escapeHTML(weekLabel)}</span>
          <span class="gaunt__week-seed">Seed #${escapeHTML(seedDisplay)}</span>
        </div>
        ${poolDisplay}
        ${enterBtn}
        <p class="gaunt__hint">Entry: ${ENTRY_COST} gems (= ${ENTRY_COST / GEM_PER_NIM} NIM). Unlimited retries — chase your best score!</p>
      </section>

      <section class="gaunt__card">
        <h2 class="gaunt__card-title">🏆 Your Best This Week</h2>
        ${bestBlock}
      </section>

      <section class="gaunt__card">
        <h2 class="gaunt__card-title">🏆 This Week's Leaderboard</h2>
        ${leaderboardBlock}
        <button class="btn btn--secondary gaunt__lb-refresh" data-action="refresh-lb"
                ${leaderboardLoading ? "disabled" : ""}>
          ${leaderboardLoading ? "Loading..." : "↻ Refresh"}
        </button>
      </section>

      ${lastWeekBlock}

      <section class="gaunt__card">
        <h2 class="gaunt__card-title">Ranking</h2>
        <p class="gaunt__hint">
          <strong>1.</strong> Progress (chapter + floor)<br>
          <strong>2.</strong> HP remaining<br>
          <strong>3.</strong> Earliest submission
        </p>
      </section>

      <section class="gaunt__card">
        <h2 class="gaunt__card-title">Exchange</h2>
        ${walletBlock}
        <p class="gaunt__rate">Rate: <strong>1 NIM = ${GEM_PER_NIM} gem</strong></p>
        <div class="gaunt__bundles">${bundlesBlock}</div>
        ${statusBlock}
        <p class="gaunt__hint">Payments go through Nimiq Pay. Gems are added only after the transaction confirms.</p>
        <p class="gaunt__locked">🔒 Cash-out (gem → NIM) coming after Nimiq compliance approval.</p>
      </section>
    </div>
  `;
}
