// src/data/leaderboard.js
//
// M8: Leaderboard data layer.
//
// - `getDeviceId()` returns a stable per-device string. Prefers Nimiq Pay's
//   requestDeviceIdentifier (cross-app stable inside the host) and falls
//   back to a crypto.randomUUID() persisted in localStorage for plain
//   browsers / dev preview. Cached after first resolution.
//
// - `submitRun(run, meta)` writes one row to `public.runs` on chapter clear.
//   Called from battle.js after the player accepts/skips the boss reward
//   (so the gold + relic decisions are baked into the snapshot).
//
// - `fetchTopRuns(limit)` reads top-N by gold_earned desc for the lobby
//   leaderboard modal.
//
// Every call is a safe no-op when supabase isn't configured (env missing).

import { getSupabase, isSupabaseReady } from "./supabase.js";

const LS_DEVICE_KEY = "nimblade.device_id.v1";
const LS_DISPLAY_KEY = "nimblade.display_name.v1";

let _deviceCache = null;

function localRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Last-resort fallback (older mobile browsers).
  return "d_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Resolve a stable device identifier. Uses Nimiq SDK when available,
 * localStorage otherwise. Result is cached for the page lifetime.
 */
export async function getDeviceId() {
  if (_deviceCache) return _deviceCache;
  // Try cached localStorage value first -- avoids a second SDK roundtrip and
  // gives instant deterministic IDs in dev.
  let existing = null;
  try { existing = localStorage.getItem(LS_DEVICE_KEY); } catch (_) {}
  if (existing) { _deviceCache = existing; return existing; }

  // Try Nimiq SDK requestDeviceIdentifier when running inside Nimiq Pay host.
  try {
    const mod = await import("@nimiq/mini-app-sdk");
    if (mod && typeof mod.requestDeviceIdentifier === "function") {
      const id = await mod.requestDeviceIdentifier({ timeout: 1500 }).catch(() => null);
      if (id && typeof id === "string" && id.length > 0) {
        _deviceCache = id;
        try { localStorage.setItem(LS_DEVICE_KEY, id); } catch (_) {}
        return id;
      }
    }
  } catch (_) {
    // SDK not present or host rejected -- fall through to local id.
  }

  const fresh = localRandomId();
  _deviceCache = fresh;
  try { localStorage.setItem(LS_DEVICE_KEY, fresh); } catch (_) {}
  return fresh;
}

/** Player-chosen display name (lobby input). Defaults to "Anonymous". */
export function getDisplayName() {
  try {
    return localStorage.getItem(LS_DISPLAY_KEY) || "";
  } catch (_) { return ""; }
}

export function setDisplayName(name) {
  const trimmed = (name || "").toString().slice(0, 24).trim();
  try { localStorage.setItem(LS_DISPLAY_KEY, trimmed); } catch (_) {}
  return trimmed;
}

/**
 * Submit a completed run to the leaderboard.
 * Returns { ok, row?, error? }. Never throws -- caller can fire-and-forget.
 */
export async function submitRun(run, meta) {
  if (!isSupabaseReady()) {
    return { ok: false, error: "supabase_not_configured" };
  }
  if (!run || !run.completed) {
    return { ok: false, error: "run_not_completed" };
  }
  try {
    const deviceId = await getDeviceId();
    const display = getDisplayName() || "Anonymous";
    const payload = {
      device_id: deviceId,
      display_name: display,
      weapon: run.weapon || "unknown",
      chapter: parseInt(String(run.chapter || "CH1").replace(/\D/g, ""), 10) || 1,
      ascension: Math.max(0, Math.min(5, Number(run.ascension) || 0)),
      gold_earned: Math.max(0, Number(run.totalGoldEarned) || 0),
      floor_reached: Math.max(1, Number(run.floor) || 9),
      victory: true,
    };
    const sb = getSupabase();
    const { data, error } = await sb.from("runs").insert(payload).select().single();
    if (error) {
      console.warn("[leaderboard] submitRun failed:", error.message);
      return { ok: false, error: error.message };
    }
    console.log("[leaderboard] run submitted:", data.id);
    return { ok: true, row: data };
  } catch (e) {
    console.warn("[leaderboard] submitRun threw:", e);
    return { ok: false, error: String(e && e.message || e) };
  }
}

/**
 * Fetch top-N runs (highest gold_earned). Returns array (possibly empty).
 */
export async function fetchTopRuns(limit = 10) {
  if (!isSupabaseReady()) return [];
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("runs")
      .select("id, display_name, weapon, chapter, ascension, gold_earned, floor_reached, created_at")
      .order("gold_earned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(100, limit)));
    if (error) {
      console.warn("[leaderboard] fetchTopRuns failed:", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn("[leaderboard] fetchTopRuns threw:", e);
    return [];
  }
}
