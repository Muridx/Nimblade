/**
 * NIMBLADE -- run-state helpers.
 *
 * Centralized utilities for run mutations that need to touch multiple fields
 * at once, or that interact with the meta layer. Today (M2) the focus is:
 *
 *   addRunGold(run, amount)
 *     Increment current `run.gold` AND cumulative `run.totalGoldEarned`.
 *     Always use this when crediting gold to the player (battle reward,
 *     campfire SMOKE, boss SKIP bonus, etc.). Shop spending must NOT use
 *     this -- shop decreases gold balance only, never reduces totalGoldEarned.
 *
 *   payoutShards({ run, isCh1BossClear })
 *     Convert run.totalGoldEarned into meta.shards per Design Doc v1.1 §7.1:
 *       shards = floor(totalGoldEarned * 0.20 * ascensionMultiplier)
 *     Commits the new shard balance to meta and (if isCh1BossClear) flips
 *     meta.ch1Cleared = true so the lobby unlocks Ascension UI. Returns
 *     `{ shardsEarned, ascMultiplier, ch1Unlocked }` so the run-end screen
 *     can display it.
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
 * Compute shard payout for a run and commit to meta.
 *
 * Returns { shardsEarned, ascMultiplier, ch1Unlocked }:
 *   - shardsEarned: integer shards added to meta this call
 *   - ascMultiplier: the multiplier used (display-only)
 *   - ch1Unlocked: true if this call flipped meta.ch1Cleared 0->1
 *
 * Idempotent? NO -- caller must only invoke once per run end. We mark the
 * run with `run.shardsPaidOut = true` and refuse to double-pay if called
 * again with the same run object.
 */
export function payoutShards({ run, isCh1BossClear = false } = {}) {
  if (!run) return { shardsEarned: 0, ascMultiplier: 1.0, ch1Unlocked: false };
  // DEMO MODE: demo runs are wallet-free trials and must NEVER earn shards or
  // unlock progression -- otherwise players farm shards in demo with OP weapons.
  // Real (wallet-connected) runs use mode "full". Gate here = single source of truth.
  if (run.mode === "demo") {
    run.shardsPaidOut = true;
    return { shardsEarned: 0, ascMultiplier: 1.0, ch1Unlocked: false, demo: true };
  }
  if (run.shardsPaidOut) {
    return { shardsEarned: 0, ascMultiplier: 1.0, ch1Unlocked: false };
  }
  const ascLevel = Math.max(0, Math.min(5, Number(run.ascension) || 0));
  const ascMult = ASCENSION_MULT[ascLevel] || 1.0;
  const totalEarned = Math.max(0, Number(run.totalGoldEarned) || 0);
  // R7 Crystal Shrine option C: +50% shard bonus at run end. Stored on the
  // run as `shardBonusMult` (additive, e.g. 0.5 => x1.5 final payout).
  const shrineMult = 1 + Math.max(0, Number(run.shardBonusMult) || 0);
  const shardsEarned = Math.floor(totalEarned * SHARD_RATIO * ascMult * shrineMult);

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
