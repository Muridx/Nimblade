// src/data/supabase.js
//
// M8: Supabase client init.
//
// Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from import.meta.env.
// If either is missing we fall back to a NULL client and every leaderboard
// call becomes a no-op so the game still runs offline (e.g. local Cursor
// preview before .env.local is set, or first-time clone).
//
// Wallet/account integration is intentionally separate -- this module only
// owns the leaderboard data layer.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _client = null;
let _configured = false;

if (url && anonKey) {
  try {
    _client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _configured = true;
    console.log("[supabase] client ready");
  } catch (e) {
    console.warn("[supabase] init failed:", e);
  }
} else {
  console.warn("[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing -- leaderboard disabled");
}

export function isSupabaseReady() {
  return _configured && !!_client;
}

export function getSupabase() {
  return _client;
}
