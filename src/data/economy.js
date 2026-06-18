// src/data/economy.js
//
// Server-authoritative economy layer.
//
// ALL shard/gem balances live in Supabase (player_balances table).
// Client localStorage is a display cache only — never trust it for writes.
//
// Every mutation goes through an RPC function that validates inputs server-side.
// This prevents cheating: players cannot edit localStorage to give themselves
// free shards/gems/NIM.
//
// Rates (hardcoded in server SQL, mirrored here for UI display only):
//   Gold balance × 20% = shards       (run end)
//   100 shards         = 1 gem        (conversion)
//   2 gems             = 1 NIM        (cashout)
//   1 NIM              = 1 gem        (buy)
//
// Functions:
//   fetchBalances(wallet)                    -> { ok, shards, gems }
//   creditRunShards(wallet, goldBal, asc, shrine, runId) -> { ok, shards_earned, ... }
//   convertShardsToGems(wallet, shardAmt)    -> { ok, gems_earned, shards_spent }
//   cashoutGems(wallet, gemAmt)              -> { ok, nim_amount, ... }
//   buyGemsCredit(wallet, nimPaid, txHash)    -> { ok, gems_credited, ... }
//   spendShards(wallet, amount, reason)       -> { ok, shards_spent }

import { getSupabase, isSupabaseReady } from "./supabase.js";
import { getState, setState } from "../state/store.js";

// ── Display-only constants (actual rates enforced server-side) ──────────────
export const SHARD_RATIO       = 0.20;  // 20% of gold balance
export const SHARDS_PER_GEM    = 100;   // 100 shards = 1 gem
export const GEMS_PER_NIM_OUT  = 2;     // cashout: 2 gems = 1 NIM
export const GEMS_PER_NIM_IN   = 1;     // buy: 1 NIM = 1 gem

// ── Helper: sync server balances → meta (display cache) ────────────────────
function _syncToMeta(shards, gems) {
  const meta = getState().meta || {};
  setState({
    meta: {
      ...meta,
      shards: shards ?? meta.shards ?? 0,
      gems:   gems   ?? meta.gems   ?? 0,
    },
  });
}

// ── Helper: safe RPC call ──────────────────────────────────────────────────
async function _rpc(fnName, params) {
  if (!isSupabaseReady()) {
    return { ok: false, error: "supabase_offline" };
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc(fnName, params);
    if (error) {
      console.warn(`[economy] ${fnName} rpc error:`, error);
      return { ok: false, error: error.message || "rpc_failed" };
    }
    return data || { ok: false, error: "empty_response" };
  } catch (e) {
    console.warn(`[economy] ${fnName} threw:`, e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// ── 1. Fetch balances ──────────────────────────────────────────────────────
/**
 * Get current shard/gem balances from server.
 * Also syncs to meta for UI display.
 * Returns { ok, shards, gems }.
 */
export async function fetchBalances(walletAddr) {
  if (!walletAddr) return { ok: false, error: "wallet_required" };
  const result = await _rpc("get_balances", { p_wallet: walletAddr });
  if (result.ok) {
    _syncToMeta(result.shards, result.gems);
  }
  return result;
}

// ── 2. Credit run shards ───────────────────────────────────────────────────
/**
 * Called at run end. Server calculates and credits shards from gold balance.
 * Idempotent via runId — safe to retry.
 *
 * @param {string} walletAddr - Player wallet address
 * @param {number} goldBalance - run.gold (remaining balance, NOT totalGoldEarned)
 * @param {number} ascension - Ascension level (0-5)
 * @param {number} shrineMult - Crystal Shrine bonus multiplier (default 1.0)
 * @param {string} runId - Unique run identifier for idempotency
 * @returns {{ ok, shards_earned, ... }}
 */
export async function creditRunShards(walletAddr, goldBalance, ascension = 0, shrineMult = 1.0, runId = null) {
  if (!walletAddr) return { ok: false, error: "wallet_required" };
  const result = await _rpc("credit_run_shards", {
    p_wallet:   walletAddr,
    p_gold:     Math.max(0, Math.floor(goldBalance || 0)),
    p_ascension: Math.max(0, Math.min(5, ascension || 0)),
    p_shrine:   Math.max(1.0, shrineMult || 1.0),
    p_run_id:   runId,
  });
  if (result.ok) {
    // Refresh balances to sync display
    await fetchBalances(walletAddr);
  }
  return result;
}

// ── 3. Convert shards → gems ───────────────────────────────────────────────
/**
 * Convert shards to gems. Rate: 100 shards = 1 gem.
 * Amount must be a multiple of 100.
 *
 * @param {string} walletAddr
 * @param {number} shardAmount - Shards to convert (multiple of 100)
 * @returns {{ ok, gems_earned, shards_spent }}
 */
export async function convertShardsToGems(walletAddr, shardAmount) {
  if (!walletAddr) return { ok: false, error: "wallet_required" };
  const result = await _rpc("convert_shards_to_gems", {
    p_wallet: walletAddr,
    p_shards: shardAmount,
  });
  if (result.ok) {
    await fetchBalances(walletAddr);
  }
  return result;
}

// ── 4. Cashout gems → NIM ──────────────────────────────────────────────────
/**
 * Request NIM cashout. Rate: 2 gems = 1 NIM.
 * Amount must be a multiple of 2.
 * This deducts gems server-side. Actual NIM transfer is separate.
 *
 * @param {string} walletAddr
 * @param {number} gemAmount - Gems to cash out (multiple of 2)
 * @returns {{ ok, gems_spent, nim_amount, status }}
 */
export async function cashoutGems(walletAddr, gemAmount) {
  if (!walletAddr) return { ok: false, error: "wallet_required" };
  const result = await _rpc("cashout_gems", {
    p_wallet: walletAddr,
    p_gems:   gemAmount,
  });
  if (result.ok) {
    await fetchBalances(walletAddr);
  }
  return result;
}

// ── 5. Buy gems (verified on-chain via Edge Function) ──────────────────────
/**
 * Credit gems after NIM payment. Calls verify-purchase Edge Function which:
 *   1. Queries the Nimiq blockchain to verify the tx exists
 *   2. Validates recipient = purchase wallet, amount > 0, confirmed
 *   3. Credits gems server-side (service_role only)
 *
 * tx_hash is REQUIRED — no more client-trusted credit.
 *
 * @param {string} walletAddr
 * @param {number} nimPaid - NIM amount paid (display only, server verifies on-chain)
 * @param {string} txHash - Blockchain transaction hash (REQUIRED)
 * @returns {{ ok, gems_credited, nim_paid }}
 */
export async function buyGemsCredit(walletAddr, nimPaid, txHash) {
  if (!walletAddr) return { ok: false, error: "wallet_required" };
  if (!txHash) return { ok: false, error: "tx_hash_required" };

  if (!isSupabaseReady()) {
    return { ok: false, error: "supabase_offline" };
  }

  try {
    const sb = getSupabase();
    const { data, error } = await sb.functions.invoke("verify-purchase", {
      body: { tx_hash: txHash, wallet_addr: walletAddr },
    });

    if (error) {
      console.warn("[economy] verify-purchase error:", error);
      return { ok: false, error: error.message || "verification_failed" };
    }

    const result = data || { ok: false, error: "empty_response" };
    if (result.ok) {
      await fetchBalances(walletAddr);
    }
    return result;
  } catch (e) {
    console.warn("[economy] verify-purchase threw:", e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// ── 6. Spend shards (forge upgrades) ───────────────────────────────────────
/**
 * Deduct shards for forge upgrades (server-validated).
 *
 * @param {string} walletAddr
 * @param {number} amount - Shards to spend
 * @param {string} reason - What the spend is for (default: 'forge')
 * @returns {{ ok, shards_spent }}
 */
export async function spendShards(walletAddr, amount, reason = "forge") {
  if (!walletAddr) return { ok: false, error: "wallet_required" };
  const result = await _rpc("spend_shards", {
    p_wallet: walletAddr,
    p_amount: amount,
    p_reason: reason,
  });
  if (result.ok) {
    await fetchBalances(walletAddr);
  }
  return result;
}

// ── 7. Purchase forge node (server-validated) ──────────────────────────────
/**
 * Purchase a forge upgrade node. Server validates:
 *  - wallet has enough shards
 *  - prerequisite tier is owned
 *  - node isn't already owned
 * Deducts shards atomically.
 *
 * @param {string} walletAddr
 * @param {string} nodeKey - e.g. "combat_t1", "survival_t3"
 * @returns {{ ok, node_key, shards_spent } | { ok: false, error }}
 */
export async function purchaseForgeNode(walletAddr, nodeKey) {
  if (!walletAddr) return { ok: false, error: "wallet_required" };
  const result = await _rpc("purchase_forge_node", {
    p_wallet: walletAddr,
    p_node_key: nodeKey,
  });
  if (result.ok) {
    await fetchBalances(walletAddr);
  }
  return result;
}

// ── 8. Fetch forge state (server-side ownership) ───────────────────────────
/**
 * Get all forge nodes owned by this wallet from server.
 * Returns { ok, forge: { combat_t1: true, survival_t1: true, ... } }
 * Also syncs to meta.forge for local display.
 */
export async function fetchForgeState(walletAddr) {
  if (!walletAddr) return { ok: false, error: "wallet_required" };
  const result = await _rpc("get_forge_state", { p_wallet: walletAddr });
  if (result.ok && result.forge) {
    const meta = getState().meta || {};
    // Merge server forge state with empty forge (so missing keys = false)
    const currentForge = meta.forge || {};
    const serverForge = {};
    for (const key of Object.keys(currentForge)) {
      serverForge[key] = Boolean(result.forge[key]);
    }
    setState({ meta: { ...meta, forge: serverForge } });
  }
  return result;
}

// ── 9. Process cashout via Edge Function ────────────────────────────────────
/**
 * After cashout_gems deducts gems and creates a pending request,
 * call the Edge Function to actually send NIM to the player.
 *
 * @param {string} requestId - UUID from cashout_gems response
 * @param {string} walletAddr - Player's wallet address (recipient)
 * @returns {{ ok, tx_hash } | { ok: false, error }}
 */
export async function processCashoutTransfer(requestId, walletAddr) {
  if (!isSupabaseReady()) {
    return { ok: false, error: "supabase_offline" };
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb.functions.invoke("cashout-nim", {
      body: { request_id: requestId, recipient: walletAddr },
    });
    if (error) {
      console.warn("[economy] cashout-nim edge fn error:", error);
      return { ok: false, error: error.message || "edge_function_failed" };
    }
    return data || { ok: false, error: "empty_response" };
  } catch (e) {
    console.warn("[economy] cashout-nim threw:", e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// ── 10. Generate unique run ID ─────────────────────────────────────────────
/**
 * Generate a unique run ID for idempotency.
 * Format: wallet_timestamp_random
 */
export function generateRunId(walletAddr) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const w = (walletAddr || "anon").slice(-8);
  return `${w}_${ts}_${rand}`;
}
