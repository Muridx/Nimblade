/**
 * NIMBLADE -- run-state helpers.
 *
 * Centralized utilities for run mutations that need to touch multiple fields
 * at once, or that interact with the meta layer.
 *
 *   addRunGold(run, amount)
 *     Increment current `run.gold` AND cumulative `run.totalGoldEarned`.
 *     Always use this when crediting gold to the player (battle reward,
 *     campfire SMOKE, boss SKIP bonus, etc.). Shop spending must NOT use
 *     this -- shop decreases gold balance only, never reduces totalGoldEarned.
 *
 *   payoutShards({ run, isCh1BossClear })
 *     Convert run.gold (REMAINING BALANCE) into shards:
 *       shards = floor(run.gold * 0.20 * ascensionMultiplier * shrineMult)
 *
 *     Uses remaining gold balance (not cumulative totalGoldEarned) so that
 *     shop spending reduces shard payout. This creates decision tension:
 *     spend gold for power now vs save gold for shards later.
 *
 *     If wallet is connected & Supabase is online, shards are credited
 *     SERVER-SIDE via economy.creditRunShards() (anti-cheat). The local
 *     meta.shards is only a display cache; server is source of truth.
 *
 *     Ascension multiplier (§8.5):
 *       Asc 0 -> 1.00   Asc 1 -> 1.10   Asc 2 -> 1.20
 *       Asc 3 -> 1.35   Asc 4 -> 1.50   Asc 5 -> 1.70
 *     Multiplier is read from `run.ascension` (set at run start from
 *     meta.ascension). Default 0 if unset -- safe for pre-M6 runs.
 */

import { getState, setState } from "../state/store.js";
import { NODE_LAYOUTS } from "./floorMap.js";
import { generateMap } from "./mapGen.js";
import { creditRunShards, generateRunId } from "./economy.js";
import { getAddress } from "./wallet.js";

const SHARD_RATIO = 0.20; // §7.1

const CHAPTER_ORDER = ["CH1", "CH2", "CH3"];

/**
 * v3.0 R0: Advance the run to the next chapter after a boss clear.
 *
 * Mutates and returns the run. Does NOT commit to state — caller does that.
 *
 * What it does (per Bible §5 + Design Lock F7):
 *   1. chapter++ (CH1→CH2, CH2→CH3)
 *   2. floorMax = NODE_LAYOUTS[newChapter].length
 *   3. floor = 1
 *   4. playerHp = CARRIED OVER (persistent across the whole run, STS-style)
 *   5. energy   = CARRIED OVER (persistent across the whole run)
 *   6. map = generateMap() (fresh DAG for new chapter)
 *   7. currentNodeId / visitedNodeIds reset
 *   8. normalQueue reset (new chapter pool)
 *
 * Returns null if already on CH3 (no next chapter — run is complete).
 */
export function advanceChapter(run) {
  if (!run) return null;
  const curIdx = CHAPTER_ORDER.indexOf((run.chapter || "CH1").toUpperCase());
  if (curIdx < 0 || curIdx >= CHAPTER_ORDER.length - 1) return null; // already final chapter

  const nextCh = CHAPTER_ORDER[curIdx + 1];
  const layout = NODE_LAYOUTS[nextCh];

  run.chapter = nextCh;
  run.floor = 1;
  run.floorMax = layout ? layout.length : 9;
  // HP and energy are NOT touched here -- they persist across the whole run
  // (carried over from the run state, STS-style). Death is the only reset.
  run.map = generateMap(undefined, run.ascension || 0, nextCh);
  run.currentNodeId = null;
  run.visitedNodeIds = [];
  run.normalQueue = null;
  run.normalQueueChapter = null;

  return run;
}

const ASCENSION_MULT = {
  0: 1.0,
  1: 1.10,
  2: 1.20,
  3: 1.35,
  4: 1.50,
  5: 1.70,
};

/**
 * Add gold to a run. Mutates and returns the run for chaining.
 * Safe to call with negative amounts (e.g. cheat console) -- totalGoldEarned
 * only increases on positive deltas so balance can go up and down independently.
 */
export function addRunGold(run, amount) {
  if (!run) return run;
  const delta = Number(amount) || 0;
  run.gold = (run.gold || 0) + delta;
  if (delta > 0) {
    run.totalGoldEarned = (run.totalGoldEarned || 0) + delta;
  }
  return run;
}

/**
 * Compute shard payout for a run.
 *
 * Uses run.gold (REMAINING BALANCE) — not totalGoldEarned — so shop spending
 * reduces shard output. Creates decision tension: spend for power now vs
 * save gold for shards later.
 *
 * SYNCHRONOUS for caller convenience (battle.js assigns the return value
 * immediately). Server-side credit fires as a background promise — callers
 * don't need to await it.
 *
 * Returns { shardsEarned, ascMultiplier, ch1Unlocked }:
 *   - shardsEarned: integer shards added this call (local estimate)
 *   - ascMultiplier: the multiplier used (display-only)
 *   - ch1Unlocked: true if this call flipped meta.ch1Cleared 0->1
 *
 * Idempotent on client via `run.shardsPaidOut`. Server-side idempotency
 * via run.runId (credited_runs table).
 */
export function payoutShards({ run, isCh1BossClear = false } = {}) {
  if (!run) return { shardsEarned: 0, ascMultiplier: 1.0, ch1Unlocked: false };
  // DEMO & GAUNTLET: no shard payout.
  //   - demo: wallet-free trials, must NEVER earn shards (farm prevention).
  //   - gauntlet: competitive tournament mode. Reward = NIM prizes (top 3),
  //     NOT shards. Free entry + shard payout = infinite shard farm exploit.
  if (run.mode === "demo" || run.mode === "gauntlet") {
    run.shardsPaidOut = true;
    return { shardsEarned: 0, ascMultiplier: 1.0, ch1Unlocked: false, noPayoutMode: true };
  }
  if (run.shardsPaidOut) {
    return { shardsEarned: 0, ascMultiplier: 1.0, ch1Unlocked: false };
  }
  const ascLevel = Math.max(0, Math.min(5, Number(run.ascension) || 0));
  const ascMult = ASCENSION_MULT[ascLevel] || 1.0;
  // >>> CHANGED: use run.gold (remaining balance) instead of totalGoldEarned
  const goldBalance = Math.max(0, Number(run.gold) || 0);
  // R7 Crystal Shrine option C: +50% shard bonus at run end. Stored on the
  // run as `shardBonusMult` (additive, e.g. 0.5 => x1.5 final payout).
  const shrineMult = 1 + Math.max(0, Number(run.shardBonusMult) || 0);
  const shardsEarned = Math.floor(goldBalance * SHARD_RATIO * ascMult * shrineMult);

  // --- Server-side credit (anti-cheat, fire-and-forget) ---
  const walletAddr = getAddress();
  if (walletAddr) {
    // Generate or reuse run ID for idempotency
    if (!run.runId) run.runId = generateRunId(walletAddr);
    // Fire as background promise — server is source of truth, local is cache.
    creditRunShards(walletAddr, goldBalance, ascLevel, shrineMult, run.runId)
      .then((res) => {
        if (res?.ok) {
          console.log(`[shards] server credited ${res.shards_earned} shards (run ${run.runId})`);
        } else {
          console.warn("[shards] server credit failed:", res?.error);
        }
      })
      .catch((err) => console.warn("[shards] server credit threw:", err));
  }

  // --- Local meta update (display cache for immediate UI feedback) ---
  const meta = getState().meta || {};
  let ch1Unlocked = false;
  const patchedMeta = {
    ...meta,
    shards: (Number(meta.shards) || 0) + shardsEarned,
  };
  if (isCh1BossClear && !meta.ch1Cleared) {
    patchedMeta.ch1Cleared = true;
    ch1Unlocked = true;
  }
  setState({ meta: patchedMeta });
  run.shardsPaidOut = true;
  return { shardsEarned, ascMultiplier: ascMult, ch1Unlocked };
}
