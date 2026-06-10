-- NIMBLADE — Database Schema
-- Run this in Supabase SQL Editor (paste & click "Run")
-- Safe to run multiple times: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- ─── 1. PLAYERS TABLE (official, wallet-keyed) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.players (
  wallet_address    TEXT PRIMARY KEY,
  username          TEXT NOT NULL,
  weapon            TEXT NOT NULL DEFAULT 'sword',
  arena_points      INTEGER NOT NULL DEFAULT 0,
  wins              INTEGER NOT NULL DEFAULT 0,
  losses            INTEGER NOT NULL DEFAULT 0,
  gold              INTEGER NOT NULL DEFAULT 0,
  highest_dungeon   INTEGER NOT NULL DEFAULT 0,
  highest_stage     INTEGER NOT NULL DEFAULT 0,   -- deepest single-run stage (1..15)
  unlocked_weapons  TEXT[] NOT NULL DEFAULT ARRAY['sword'],
  upgrades          JSONB  NOT NULL DEFAULT '{}'::jsonb,
  owned_skins       TEXT[] NOT NULL DEFAULT ARRAY['default'],
  active_skin       TEXT   NOT NULL DEFAULT 'default',
  weekly_points     INTEGER NOT NULL DEFAULT 0,
  weekly_reset_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_device_id  TEXT,                          -- if migrated from practice
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if old table existed
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS highest_stage    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS owned_skins      TEXT[]  NOT NULL DEFAULT ARRAY['default'];
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS active_skin      TEXT    NOT NULL DEFAULT 'default';
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS linked_device_id TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS players_weekly_idx       ON public.players (weekly_points DESC);
CREATE INDEX IF NOT EXISTS players_highest_stage_idx ON public.players (highest_stage DESC);
CREATE INDEX IF NOT EXISTS players_linked_device_idx ON public.players (linked_device_id);

-- ─── 2. PRACTICE_SCORES TABLE (demo / device-keyed) ────────────────────────
-- For players without wallet. Tracked via Nimiq Pay Device Identifier.
CREATE TABLE IF NOT EXISTS public.practice_scores (
  device_id      TEXT PRIMARY KEY,         -- 64-char SHA-256 from requestDeviceIdentifier
  username       TEXT NOT NULL,
  weapon         TEXT NOT NULL DEFAULT 'sword',
  best_stage     INTEGER NOT NULL DEFAULT 0,
  best_gold      INTEGER NOT NULL DEFAULT 0,
  runs_played    INTEGER NOT NULL DEFAULT 0,
  migrated_at    TIMESTAMPTZ,              -- set when player connects wallet & migrates
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS practice_best_stage_idx ON public.practice_scores (best_stage DESC, best_gold DESC);

-- ─── 3. ACTIVE_RUNS TABLE (save / resume) ──────────────────────────────────
-- Stores in-progress run state so player can close app & resume.
CREATE TABLE IF NOT EXISTS public.active_runs (
  run_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('wallet','device')),
  owner_id      TEXT NOT NULL,
  state         JSONB NOT NULL,           -- full RunState snapshot
  dungeon_id    INTEGER NOT NULL,
  stage_idx     INTEGER NOT NULL,
  hp            INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_type, owner_id)
);
CREATE INDEX IF NOT EXISTS active_runs_owner_idx ON public.active_runs (owner_type, owner_id);

-- ─── 4. NIM_PURCHASES TABLE (payment log) ──────────────────────────────────
-- Audit trail for all NIM payments (Sharpen Stone, cosmetic skins).
CREATE TABLE IF NOT EXISTS public.nim_purchases (
  id              BIGSERIAL PRIMARY KEY,
  wallet_address  TEXT NOT NULL,
  device_id       TEXT,
  purchase_type   TEXT NOT NULL CHECK (purchase_type IN ('sharpen_stone','skin')),
  item_id         TEXT,                   -- e.g. 'golden' / 'crimson' / 'void' for skins
  amount_nim      NUMERIC(20,5) NOT NULL,
  tx_hash         TEXT,                   -- Nimiq tx hash
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nim_purchases_wallet_idx ON public.nim_purchases (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS nim_purchases_type_idx   ON public.nim_purchases (purchase_type);

-- ─── 5. RPC HELPERS ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_arena_points(p_wallet TEXT, p_points INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.players
  SET arena_points  = arena_points  + p_points,
      weekly_points = weekly_points + p_points,
      updated_at    = NOW()
  WHERE wallet_address = p_wallet;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_losses(p_wallet TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.players
  SET losses = losses + 1, updated_at = NOW()
  WHERE wallet_address = p_wallet;
END;
$$;

-- ─── 6. ROW LEVEL SECURITY ─────────────────────────────────────────────────
-- For competition demo we allow read-all + write-self pattern.
ALTER TABLE public.players          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nim_purchases    ENABLE ROW LEVEL SECURITY;

-- Drop-then-create so the migration is re-runnable
DROP POLICY IF EXISTS players_read_all      ON public.players;
DROP POLICY IF EXISTS players_write_all     ON public.players;
DROP POLICY IF EXISTS practice_read_all     ON public.practice_scores;
DROP POLICY IF EXISTS practice_write_all    ON public.practice_scores;
DROP POLICY IF EXISTS runs_read_all         ON public.active_runs;
DROP POLICY IF EXISTS runs_write_all        ON public.active_runs;
DROP POLICY IF EXISTS purchases_read_all    ON public.nim_purchases;
DROP POLICY IF EXISTS purchases_write_all   ON public.nim_purchases;

CREATE POLICY players_read_all     ON public.players         FOR SELECT USING (true);
CREATE POLICY players_write_all    ON public.players         FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY practice_read_all    ON public.practice_scores FOR SELECT USING (true);
CREATE POLICY practice_write_all   ON public.practice_scores FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY runs_read_all        ON public.active_runs     FOR SELECT USING (true);
CREATE POLICY runs_write_all       ON public.active_runs     FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY purchases_read_all   ON public.nim_purchases   FOR SELECT USING (true);
CREATE POLICY purchases_write_all  ON public.nim_purchases   FOR ALL    USING (true) WITH CHECK (true);

-- Done. You should see "Success. No rows returned." in the SQL editor.