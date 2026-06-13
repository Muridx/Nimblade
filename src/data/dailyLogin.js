// src/data/dailyLogin.js
//
// P3b: Daily Login Claim -- wallet-connected only, server-authoritative.
//
// Talks to Supabase functions defined in 002_daily_login.sql:
//   - daily_status(p_wallet)  -> { ok, has_record, can_claim, current_streak,
//                                  streak_alive, next_day, next_reward,
//                                  last_claim_date, today }
//   - claim_daily(p_wallet)   -> { ok, status, streak_day, shards_earned,
//                                  last_claim_date, next_day, next_reward }
//
// Server uses UTC date + server clock, so changing phone clock doesn't help.
// Reward formula MUST stay in sync with daily_login_reward() in the SQL file.

import { getSupabase, isSupabaseReady } from "./supabase.js";

// Day 1..7 -> shard reward. Index 0 unused.
export const DAILY_REWARDS = [0, 1, 2, 3, 4, 5, 7, 10];

// Total per cycle (sum of days 1..7) -- used in UI hint text.
export const DAILY_CYCLE_TOTAL = DAILY_REWARDS.slice(1).reduce((a, b) => a + b, 0);

export function rewardForDay(day) {
  const d = Math.max(1, Math.min(7, Number(day) || 1));
  return DAILY_REWARDS[d];
}

// Returns null if supabase not ready / no wallet, else the JSON payload from RPC.
export async function fetchDailyStatus(walletAddress) {
  if (!isSupabaseReady() || !walletAddress) return null;
  const sb = getSupabase();
  try {
    const { data, error } = await sb.rpc("daily_status", { p_wallet: walletAddress });
    if (error) {
      console.warn("[daily] status rpc error:", error);
      return null;
    }
    return data || null;
  } catch (e) {
    console.warn("[daily] status threw:", e);
    return null;
  }
}

// Returns the RPC payload (success or fail). Caller inspects `.ok`.
// If `.ok===true`, payload has `shards_earned` to credit + new streak day.
// If `.ok===false`, payload has `.error` (e.g. 'already_claimed').
export async function claimDaily(walletAddress) {
  if (!isSupabaseReady()) return { ok: false, error: "supabase_offline" };
  if (!walletAddress)    return { ok: false, error: "wallet_required" };
  const sb = getSupabase();
  try {
    const { data, error } = await sb.rpc("claim_daily", { p_wallet: walletAddress });
    if (error) {
      console.warn("[daily] claim rpc error:", error);
      return { ok: false, error: error.message || "rpc_failed" };
    }
    return data || { ok: false, error: "empty_response" };
  } catch (e) {
    console.warn("[daily] claim threw:", e);
    return { ok: false, error: String(e?.message || e) };
  }
}
