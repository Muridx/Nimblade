// src/data/gauntletLeaderboard.js
//
// Phase 3: Gauntlet weekly leaderboard — submit, fetch, pool & rewards.
//
// ANTI-CHEAT v2:
//   - submitGauntletScore → server RPC (no direct table insert)
//   - calculateAndInsertRewards → server RPC (no direct table insert)
//   - All writes go through SECURITY DEFINER functions
//   - Server validates progress, HP, move_log, 1-per-device-per-week
//
// Uses the same Supabase client and device-id system as leaderboard.js.
// Every call is a safe no-op when Supabase isn't configured.

import { getSupabase, isSupabaseReady } from "./supabase.js";
import { getDeviceId, getDisplayName } from "./leaderboard.js";

/**
 * Submit a gauntlet run score via server RPC.
 * Server validates: progress cap, HP cap, move_log required,
 * 1 best score per device per week (upserts if better).
 */
export async function submitGauntletScore(opts) {
  if (!isSupabaseReady()) {
    return { ok: false, error: "supabase_not_configured" };
  }
  try {
    const deviceId = await getDeviceId();
    const display = getDisplayName() || "Anonymous";
    const sb = getSupabase();

    const { data, error } = await sb.rpc("submit_gauntlet_score", {
      p_device_id:    deviceId,
      p_wallet_addr:  opts.walletAddr || null,
      p_display_name: display,
      p_week_num:     opts.weekNum || 0,
      p_week_seed:    opts.weekSeed || null,
      p_progress:     Math.max(0, opts.progress || 0),
      p_hp:           Math.max(0, opts.hp || 0),
      p_weapon:       opts.weapon || "unknown",
      p_move_log:     opts.moveLog || null,
    });

    if (error) {
      console.warn("[gauntlet-lb] submit RPC failed:", error.message);
      return { ok: false, error: error.message };
    }

    // data is JSONB returned by the RPC
    const result = (typeof data === "object") ? data : {};
    if (result.ok === false) {
      console.warn("[gauntlet-lb] submit rejected:", result.error);
      return { ok: false, error: result.error || "rejected" };
    }

    if (result.kept_existing) {
      console.log("[gauntlet-lb] existing score kept (was better)");
    } else {
      console.log("[gauntlet-lb] score submitted:", result.id);
    }
    return { ok: true, ...result };
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
 * Uses a Supabase RPC for atomic upsert. Server caps at 100 per call.
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
      .maybeSingle();
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
 * Claim a gem reward for the current device.
 * Server credits gems to player_balances (wallet required).
 * Returns { ok, gems } — gems > 0 on success.
 */
export async function claimReward(weekNum, walletAddr) {
  if (!isSupabaseReady()) return { ok: false, gems: 0, error: "supabase_not_configured" };
  if (!walletAddr) return { ok: false, gems: 0, error: "wallet_required" };
  try {
    const deviceId = await getDeviceId();
    const sb = getSupabase();
    const { data, error } = await sb.rpc("claim_gauntlet_reward", {
      p_week_num: weekNum,
      p_device_id: deviceId,
      p_wallet_addr: walletAddr,
    });
    if (error) {
      console.warn("[gauntlet-rewards] claim failed:", error.message);
      return { ok: false, gems: 0, error: error.message };
    }
    const result = (typeof data === "object") ? data : {};
    const gems = Number(result.gems) || 0;
    if (result.ok && gems > 0) {
      console.log(`[gauntlet-rewards] claimed ${gems} gems for week ${weekNum} → wallet ${walletAddr}`);
    }
    return { ok: !!result.ok, gems, error: result.error || null };
  } catch (e) {
    console.warn("[gauntlet-rewards] claim threw:", e);
    return { ok: false, gems: 0, error: String(e && e.message || e) };
  }
}

/**
 * Calculate and insert rewards for a completed week via server RPC.
 * Idempotent — server checks if rewards already exist.
 *
 * @param {number} weekNum - The completed week number
 * @returns {Promise<Array>} - The rewards (existing or newly created)
 */
export async function calculateAndInsertRewards(weekNum) {
  if (!isSupabaseReady()) return [];
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("calculate_gauntlet_rewards", {
      p_week_num: weekNum,
    });
    if (error) {
      console.warn("[gauntlet-rewards] calculate RPC failed:", error.message);
      // Fallback: try fetching existing rewards
      return await fetchRewards(weekNum);
    }
    const result = (typeof data === "object") ? data : {};
    if (result.rewards && Array.isArray(result.rewards)) {
      console.log(`[gauntlet-rewards] week ${weekNum}:`, result.rewards.length, "rewards");
      return result.rewards;
    }
    return [];
  } catch (e) {
    console.warn("[gauntlet-rewards] calculate threw:", e);
    return [];
  }
}
