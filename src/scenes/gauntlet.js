/*
 * NIMBLADE -- Weekly Gauntlet scene.
 *
 * FREE weekly skill tournament with developer-funded gem prizes.
 *
 * Economy (all server-authoritative via src/data/economy.js):
 *   - Entry: FREE (no gem cost)
 *   - NIM → gem exchange: 1 NIM = 1 gem (buy rate)
 *   - Gem → NIM cashout:  2 gems = 1 NIM (sell rate, 2x spread)
 *   - Shard → gem conversion: 100 shards = 1 gem
 *   - Weekly top 3 prizes: 1200/720/480 gems (funded by developer)
 *
 * Anti-cheat: ALL balances tracked server-side in Supabase (player_balances).
 *   - Gem purchases credit via buy_gems_credit() RPC with tx_hash dedup.
 *   - Shard credits via credit_run_shards() RPC with run_id dedup.
 *   - Cashout via cashout_gems() RPC with server balance validation.
 *   - Client meta.gems / meta.shards are display cache only.
 *
 * NIM transactions only work INSIDE the Nimiq Pay host. In a plain
 * browser (Vercel preview) connectWallet()/sendNim() fail gracefully.
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
  fetchMyReward,
  claimReward,
  calculateAndInsertRewards,
  fetchRewards,
} from "../data/gauntletLeaderboard.js";
import { getDeviceId } from "../data/leaderboard.js";
import {
  buyGemsCredit,
  cashoutGems,
  fetchBalances,
  convertShardsToGems,
  GEMS_PER_NIM_IN,
  GEMS_PER_NIM_OUT,
  SHARDS_PER_GEM,
} from "../data/economy.js";


// --- Config -------------------------------------------------------------
const GAUNTLET_WALLET = "NQ35 BMRD H1CX 91AY 7XKE EAXU HNH6 1906 S9DX";
const GEM_PER_NIM = GEMS_PER_NIM_IN; // 1 NIM = 1 gem (buy rate, server-enforced)
const ENTRY_COST = 0; // FREE entry (no gem cost)
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

  // Sync server balances on mount (anti-cheat: server is source of truth)
  if (isConnected()) {
    fetchBalances(getAddress()).catch(() => {});
  }

  const weekNum = getWeekNumber();
  const lastWeekNum = weekNum - 1;

  // Parallel data fetch: leaderboard, device ID, last week rewards + claim check.
  Promise.all([
    fetchWeeklyLeaderboard(weekNum, 20),
    getDeviceId(),
    Promise.resolve(0), // pool no longer used (free entry)
    // Only calculate last week rewards if lastWeekNum >= 0.
    lastWeekNum >= 0 ? calculateAndInsertRewards(lastWeekNum) : Promise.resolve([]),
  ]).then(async ([scores, deviceId, pool, rewards]) => {
    leaderboardData = scores || [];
    myDeviceId = deviceId;
    poolGems = pool;
    lastWeekRewards = rewards || [];
    leaderboardLoading = false;

    // Check if current player has an unclaimed reward from last week.
    // Uses wallet_addr (secure) with device_id fallback for legacy rewards.
    if (lastWeekNum >= 0 && lastWeekRewards.length > 0) {
      const walletAddr = getAddress();
      const myReward = await fetchMyReward(lastWeekNum, walletAddr);
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

      // Step 1: NIM payment via wallet
      const res = await sendNim(GAUNTLET_WALLET, nim, "Nimblade gems");
      busyBundle = null;

      if (res.ok) {
        // Step 2: Credit gems SERVER-SIDE (anti-cheat, prevents double-credit via tx_hash)
        const walletAddr = getAddress();
        const creditRes = await buyGemsCredit(walletAddr, nim, res.txHash || null);
        if (creditRes.ok) {
          status = { kind: "ok", text: `+${creditRes.gems_credited} gem added! (paid ${nim} NIM)` };
          console.log("[gauntlet] gem purchase ok (server-credited):", { nim, gems: creditRes.gems_credited, txHash: res.txHash });
        } else {
          // Server credit failed but payment went through — update local as fallback
          const meta = getState().meta || {};
          setState({ meta: { ...meta, gems: (Number(meta.gems) || 0) + gem } });
          status = { kind: "ok", text: `+${gem} gem added! (paid ${nim} NIM) — sync pending` };
          console.warn("[gauntlet] server credit failed, local fallback:", creditRes.error);
        }
      } else {
        status = { kind: "err", text: res.error || "Payment failed or was cancelled. No gems charged." };
        console.warn("[gauntlet] gem purchase failed:", res.error);
      }
      render(root);
      return;
    }

    if (action === "enter-gauntlet") {
      if (!isConnected()) {
        status = { kind: "err", text: "Connect your wallet first." };
        render(root);
        return;
      }

      // ENTRY_COST is 0 (free entry). No gem deduction needed.
      // If ENTRY_COST > 0 in the future, add gem check + server-side deduction here.

      const weeklySeed = getWeeklySeed();
      setState({ run: freshRun("gauntlet", weeklySeed) });
      console.log("[gauntlet] entering gauntlet run (free), seed:", weeklySeed, "week:", getWeekNumber());

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

    // Claim reward (server credits gems to player_balances)
    if (action === "claim-reward") {
      if (claimingReward || !myUnclaimedReward) return;
      const walletAddr = getAddress();
      if (!walletAddr) {
        status = { kind: "err", text: "Connect your wallet first to claim gems." };
        render(root);
        return;
      }
      claimingReward = true;
      render(root);
      const res = await claimReward(myUnclaimedReward.weekNum, walletAddr);
      claimingReward = false;
      if (res.ok && res.gems > 0) {
        // Update local meta cache for immediate UI feedback
        const meta = getState().meta || {};
        setState({ meta: { ...meta, gems: (Number(meta.gems) || 0) + res.gems } });
        // Also refresh server balances in background
        fetchBalances(walletAddr).catch(() => {});
        status = { kind: "ok", text: `🎉 Claimed ${res.gems} 💎! (Rank #${myUnclaimedReward.rank} last week)` };
        myUnclaimedReward = null;
        console.log(`[gauntlet] claimed ${res.gems} gems reward (server-credited)`);
      } else {
        status = { kind: "err", text: res.error === "wallet_required"
          ? "Connect your wallet first to claim gems."
          : "Reward already claimed or not found." };
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

  // --- Enter button (FREE entry) ---
  let enterBtn;
  if (!connected) {
    enterBtn = `<button class="btn btn--primary gaunt__enter-btn" disabled>CONNECT WALLET FIRST</button>`;
  } else {
    enterBtn = `<button class="btn btn--primary gaunt__enter-btn" data-action="enter-gauntlet">⚔️ ENTER GAUNTLET — FREE</button>`;
  }

  // --- Tournament prize display (developer-funded, hardcoded) ---
  const poolDisplay = `
    <div class="gaunt__pool">
      <span class="gaunt__pool-label">Weekly Gem Prizes</span>
      <span class="gaunt__pool-value">🏆 2,400 💎 / week</span>
    </div>
    <p class="gaunt__pool-info">🥇 1,200 💎 · 🥈 720 💎 · 🥉 480 💎 — funded by the developer</p>`;

  // --- Phase 3: Leaderboard card ---
  let leaderboardBlock;
  if (leaderboardLoading) {
    leaderboardBlock = `<p class="gaunt__hint gaunt__lb-loading">Loading leaderboard...</p>`;
  } else if (leaderboardData.length === 0) {
    leaderboardBlock = `<p class="gaunt__hint">No scores submitted yet this week. Be the first!</p>`;
  } else {
    // Deduplicate: keep only the best score per wallet_addr (or id fallback).
    // NOTE: gauntlet_leaderboard view does NOT expose device_id, so we use
    // wallet_addr for dedup. Server-side submit already upserts 1-per-device,
    // so this is a safety net for edge cases.
    const seen = new Set();
    const deduped = [];
    for (const entry of leaderboardData) {
      const key = entry.wallet_addr || entry.id;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry);
      }
    }
    const rows = deduped.map((entry, i) => {
      const isMe = addr && entry.wallet_addr === addr;
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
        A <strong>free</strong> weekly skill tournament. Every player faces the
        <strong>same monsters, relics and events</strong> that week (a shared seed),
        so the leaderboard is decided by skill &mdash; not luck. <strong>Top 3</strong>
        win GEMS prizes every week, funded by the developer!
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
        <p class="gaunt__hint">Free entry! Unlimited retries — chase your best score!</p>
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
        <p class="gaunt__hint" style="text-align:center">Buy gems, convert shards, or cash out? Visit the <strong>Exchange</strong> from the lobby.</p>
      </section>
    </div>
  `;
}
