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

const SHARD_RATIO = 0.20; // §7.1

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
  if (run.shardsPaidOut) {
    return { shardsEarned: 0, ascMultiplier: 1.0, ch1Unlocked: false };
  }
  const ascLevel = Math.max(0, Math.min(5, Number(run.ascension) || 0));
  const ascMult = ASCENSION_MULT[ascLevel] || 1.0;
  const totalEarned = Math.max(0, Number(run.totalGoldEarned) || 0);
  const shardsEarned = Math.floor(totalEarned * SHARD_RATIO * ascMult);

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
