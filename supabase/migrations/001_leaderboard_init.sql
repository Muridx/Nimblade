-- =============================================================================
-- NIMBLADE -- Leaderboard schema (M8)
-- Project ref: ykflzevvomdvtjunzgtr
-- Run this entire file ONCE in Supabase SQL Editor.
-- Safe to re-run: every CREATE/POLICY/INDEX uses IF NOT EXISTS / drop-recreate.
-- =============================================================================

-- 1) Completed runs table -- one row per chapter-clear (used for leaderboard).
create table if not exists public.runs (
  id              uuid primary key default gen_random_uuid(),
  device_id       text not null,
  display_name    text,
  weapon          text not null,
  chapter         int  not null default 1,
  ascension       int  not null default 0,
  gold_earned     int  not null default 0,
  floor_reached   int  not null default 9,
  victory         boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Index for top-N leaderboard query (highest gold first, newest tiebreak).
create index if not exists runs_score_idx
  on public.runs (gold_earned desc, created_at desc);

-- Index for "my runs" lookup.
create index if not exists runs_device_idx
  on public.runs (device_id, created_at desc);

-- 2) RLS: anon key may read all rows and insert new rows. No updates/deletes.
alter table public.runs enable row level security;

drop policy if exists "runs_anon_select" on public.runs;
create policy "runs_anon_select"
  on public.runs for select
  using (true);

drop policy if exists "runs_anon_insert" on public.runs;
create policy "runs_anon_insert"
  on public.runs for insert
  with check (true);

-- 3) Optional profiles table -- not required for v1 leaderboard but reserved.
create table if not exists public.profiles (
  device_id    text primary key,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_anon_select" on public.profiles;
create policy "profiles_anon_select"
  on public.profiles for select
  using (true);

drop policy if exists "profiles_anon_upsert" on public.profiles;
create policy "profiles_anon_upsert"
  on public.profiles for insert
  with check (true);

-- =============================================================================
-- DONE. Now:
--   1. Settings -> API -> copy `Project URL` + `anon public` key
--   2. In repo root, create `.env.local`:
--        VITE_SUPABASE_URL=https://ykflzevvomdvtjunzgtr.supabase.co
--        VITE_SUPABASE_ANON_KEY=<anon-key-here>
--   3. On Vercel: Project Settings -> Environment Variables -> add both keys
--      for Production + Preview, then redeploy.
-- =============================================================================
