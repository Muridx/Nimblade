// src/data/gauntletLeaderboard.js
//
// Phase 3: Gauntlet weekly leaderboard — submit, fetch, pool & rewards.
//
// Uses the same Supabase client and device-id system as leaderboard.js.
// Every call is a safe no-op when Supabase isn't configured.

import { getSupabase, isSupabaseReady } from "./supabase.js";
import { getDeviceId, getDisplayName } from "./leaderboard.js";

// --- Prize pool split config ---
// 50/30/20 for top 3. Edge cases: 1 player = 100%, 2 players = 60/40.
const SPLITS_3 = [50, 30, 20];
const SPLITS_2 = [60, 40];

/**
 * Submit a gauntlet run score.
 * Called from battle.js when a gauntlet run ends (death or run complete).
 */
export async function submitGauntletScore(opts) {
  if (!isSupabaseReady()) {
    return { ok: false, error: "supabase_not_configured" };
  }
  try {
    const deviceId = await getDeviceId();
    const display = getDisplayName() || "Anonymous";
    const payload = {
      device_id:    deviceId,
      wallet_addr:  opts.walletAddr || null,
      display_name: display,
      week_num:     opts.weekNum,
      week_seed:    opts.weekSeed,
      progress:     Math.max(0, Math.min(999, opts.progress || 0)),
      hp:           Math.max(0, opts.hp || 0),
      weapon:       opts.weapon || "unknown",
      move_log:     opts.moveLog || null,
      verified:     false,
    };
    const sb = getSupabase();
    const { data, error } = await sb
      .from("gauntlet_scores")
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.warn("[gauntlet-lb] submit failed:", error.message);
      return { ok: false, error: error.message };
    }
    console.log("[gauntlet-lb] score submitted:", data.id);
    return { ok: true, row: data };
  } catch (e) {
    console.warn("[gauntlet-lb] submit threw:", e);
    return { ok: false, error: String(e && e.message || e) };
  }
}

/**
 * Fetch the weekly leaderboard — top N scores for a given week.
 * Ordered by: progress DESC → hp DESC → created_at ASC (earliest wins).
 */
export async function fetchWeeklyLeaderboard(weekNum, limit = 20) {
  if (!isSupabaseReady()) return [];
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("gauntlet_scores")
      .select("id, device_id, display_name, weapon, progress, hp, created_at")
      .eq("week_num", weekNum)
      .order("progress", { ascending: false })
      .order("hp", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(Math.max(1, Math.min(100, limit)));
    if (error) {
      console.warn("[gauntlet-lb] fetch failed:", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn("[gauntlet-lb] fetch threw:", e);
    return [];
  }
}

/**
 * Fetch the current player's best score for a given week.
 * Returns null if no score found.
 */
export async function fetchMyBest(weekNum) {
  if (!isSupabaseReady()) return null;
  try {
    const deviceId = await getDeviceId();
    const sb = getSupabase();
    const { data, error } = await sb
      .from("gauntlet_scores")
      .select("id, progress, hp, weapon, created_at")
      .eq("week_num", weekNum)
      .eq("device_id", deviceId)
      .order("progress", { ascending: false })
      .order("hp", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) {
      console.warn("[gauntlet-lb] fetchMyBest failed:", error.message);
      return null;
    }
    return (data && data.length > 0) ? data[0] : null;
  } catch (e) {
    console.warn("[gauntlet-lb] fetchMyBest threw:", e);
    return null;
  }
}

// =========================================================================
// Prize Pool
// =========================================================================

/**
 * Increment the weekly prize pool by `gems` (called on gauntlet entry).
 * Uses a Supabase RPC for atomic upsert.
 */
export async function incrementPool(weekNum, gems) {
  if (!isSupabaseReady()) return;
  try {
    const sb = getSupabase();
    const { error } = await sb.rpc("increment_gauntlet_pool", {
      p_week_num: weekNum,
      p_gems: gems,
    });
    if (error) console.warn("[gauntlet-pool] increment failed:", error.message);
    else console.log(`[gauntlet-pool] +${gems} gems → week ${weekNum}`);
  } catch (e) {
    console.warn("[gauntlet-pool] increment threw:", e);
  }
}

/**
 * Fetch the current prize pool for a given week.
 * Returns total_gems (integer) or 0.
 */
export async function fetchPool(weekNum) {
  if (!isSupabaseReady()) return 0;
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("gauntlet_pools")
      .select("total_gems")
      .eq("week_num", weekNum)
      .single();
    if (error || !data) return 0;
    return data.total_gems || 0;
  } catch (_) { return 0; }
}

// =========================================================================
// Rewards
// =========================================================================

/**
 * Fetch rewards for a given week (populated or empty).
 * Returns array of { rank, device_id, display_name, gems_won, claimed }.
 */
export async function fetchRewards(weekNum) {
  if (!isSupabaseReady()) return [];
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("gauntlet_rewards")
      .select("rank, device_id, display_name, gems_won, claimed")
      .eq("week_num", weekNum)
      .order("rank", { ascending: true });
    if (error) {
      console.warn("[gauntlet-rewards] fetch failed:", error.message);
      return [];
    }
    return data || [];
  } catch (_) { return []; }
}

/**
 * Check if current device has an unclaimed reward for a given week.
 * Returns { rank, gems_won } or null.
 */
export async function fetchMyReward(weekNum) {
  if (!isSupabaseReady()) return null;
  try {
    const deviceId = await getDeviceId();
    const sb = getSupabase();
    const { data, error } = await sb
      .from("gauntlet_rewards")
      .select("rank, gems_won, claimed")
      .eq("week_num", weekNum)
      .eq("device_id", deviceId)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0];
  } catch (_) { return null; }
}

/**
 * Claim a gem reward for the current device. Returns gems_won (> 0) on
 * success, or 0 if already claimed / not found.
 */
export async function claimReward(weekNum) {
  if (!isSupabaseReady()) return 0;
  try {
    const deviceId = await getDeviceId();
    const sb = getSupabase();
    const { data, error } = await sb.rpc("claim_gauntlet_reward", {
      p_week_num: weekNum,
      p_device_id: deviceId,
    });
    if (error) {
      console.warn("[gauntlet-rewards] claim failed:", error.message);
      return 0;
    }
    const gems = Number(data) || 0;
    if (gems > 0) console.log(`[gauntlet-rewards] claimed ${gems} gems for week ${weekNum}`);
    return gems;
  } catch (_) { return 0; }
}

/**
 * Calculate and insert rewards for a completed week.
 * Should only be called once per week (idempotent — checks if rewards already exist).
 *
 * @param {number} weekNum - The completed week number
 * @returns {Promise<Array>} - The rewards that were inserted (or existing ones)
 */
export async function calculateAndInsertRewards(weekNum) {
  if (!isSupabaseReady()) return [];

  // Check if rewards already exist for this week.
  const existing = await fetchRewards(weekNum);
  if (existing.length > 0) return existing;

  // Fetch pool.
  const pool = await fetchPool(weekNum);
  if (pool <= 0) return [];

  // Fetch leaderboard — top scores, deduped per device.
  const raw = await fetchWeeklyLeaderboard(weekNum, 100);
  const seen = new Set();
  const top = [];
  for (const entry of raw) {
    if (!seen.has(entry.device_id)) {
      seen.add(entry.device_id);
      top.push(entry);
    }
    if (top.length >= 3) break;
  }

  if (top.length === 0) return [];

  // Determine split ratios.
  let splits;
  if (top.length === 1) splits = [100];
  else if (top.length === 2) splits = SPLITS_2;
  else splits = SPLITS_3;

  // Calculate gem amounts (floor, so total might be ≤ pool; remainder is tiny).
  const rewards = top.map((entry, i) => ({
    week_num:     weekNum,
    rank:         i + 1,
    device_id:    entry.device_id,
    display_name: entry.display_name || "Anonymous",
    gems_won:     Math.floor(pool * splits[i] / 100),
    claimed:      false,
  }));

  // Insert rewards.
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("gauntlet_rewards")
      .insert(rewards)
      .select();
    if (error) {
      console.warn("[gauntlet-rewards] insert failed:", error.message);
      // Might be a race condition — rewards already inserted by another client.
      return await fetchRewards(weekNum);
    }
    console.log(`[gauntlet-rewards] week ${weekNum} rewards inserted:`, data);
    return data || rewards;
  } catch (e) {
    console.warn("[gauntlet-rewards] insert threw:", e);
    return [];
  }
}
