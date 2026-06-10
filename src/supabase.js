// ─────────────────────────────────────────────────────────────────────────────
// NIMBLADE — Supabase wrapper
// All DB calls live here. Game code (main.js / game.js) never imports
// @supabase/supabase-js directly — always goes through this module.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
// Supabase renamed "anon key" → "publishable key" (sb_publishable_...).
// We accept either name so older .env files keep working.
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY

// Lazy client: null if env vars are missing → callers can detect offline mode.
export const supabase =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

export function isSupabaseConfigured() {
  return supabase !== null
}

// ─── PLAYERS (wallet-keyed, official tier) ──────────────────────────────────

export async function getPlayer(walletAddress) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single()
  if (error) return null
  return data
}

export async function createPlayer(walletAddress, username, weapon = 'sword') {
  if (!supabase) return { data: null, error: new Error('offline') }
  const { data, error } = await supabase
    .from('players')
    .insert({
      wallet_address: walletAddress,
      username,
      weapon,
      arena_points: 0,
      wins: 0,
      losses: 0,
      gold: 0,
      highest_dungeon: 0,
      highest_stage: 0,
      unlocked_weapons: ['sword'],
      upgrades: {},
      owned_skins: ['default'],
      active_skin: 'default',
      weekly_points: 0,
      weekly_reset_at: new Date().toISOString(),
    })
    .select()
    .single()
  return { data, error }
}

export async function updatePlayerWeapon(walletAddress, weapon) {
  if (!supabase) return { error: new Error('offline') }
  const { error } = await supabase
    .from('players')
    .update({ weapon })
    .eq('wallet_address', walletAddress)
  return { error }
}

export async function syncProgress(walletAddress, { gold, highestDungeon, highestStage, unlockedWeapons, upgrades }) {
  if (!supabase) return { error: new Error('offline') }
  const patch = { gold, highest_dungeon: highestDungeon, unlocked_weapons: unlockedWeapons, upgrades }
  if (typeof highestStage === 'number') patch.highest_stage = highestStage
  const { error } = await supabase
    .from('players')
    .update(patch)
    .eq('wallet_address', walletAddress)
  return { error }
}

export async function recordDungeonClear(walletAddress, dungeonId, goldEarned) {
  if (!supabase) return
  const player = await getPlayer(walletAddress)
  if (!player) return
  const newHighest = Math.max(player.highest_dungeon || 0, dungeonId)
  const newGold = (player.gold || 0) + goldEarned
  const { error } = await supabase
    .from('players')
    .update({
      highest_dungeon: newHighest,
      gold: newGold,
      wins: (player.wins || 0) + 1,
    })
    .eq('wallet_address', walletAddress)
  await supabase.rpc('add_arena_points', { p_wallet: walletAddress, p_points: 10 })
  return { error }
}

export async function recordRunFailed(walletAddress) {
  if (!supabase) return
  await supabase.rpc('increment_losses', { p_wallet: walletAddress })
}

export async function purchaseUpgradeDB(walletAddress, upgradeId, newGold, newUpgrades) {
  if (!supabase) return { error: new Error('offline') }
  const { error } = await supabase
    .from('players')
    .update({ gold: newGold, upgrades: newUpgrades })
    .eq('wallet_address', walletAddress)
  return { error }
}

export async function unlockWeaponDB(walletAddress, newGold, newUnlockedWeapons) {
  if (!supabase) return { error: new Error('offline') }
  const { error } = await supabase
    .from('players')
    .update({ gold: newGold, unlocked_weapons: newUnlockedWeapons })
    .eq('wallet_address', walletAddress)
  return { error }
}

export async function checkWeeklyReset(walletAddress) {
  if (!supabase) return
  const player = await getPlayer(walletAddress)
  if (!player) return
  const now = new Date()
  const lastReset = new Date(player.weekly_reset_at)
  const monday = new Date(now)
  monday.setUTCHours(0, 0, 0, 0)
  const day = monday.getUTCDay()
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1))
  if (lastReset < monday) {
    await supabase
      .from('players')
      .update({ weekly_points: 0, weekly_reset_at: monday.toISOString() })
      .eq('wallet_address', walletAddress)
  }
}

// ─── OFFICIAL LEADERBOARD (wallet tier) ─────────────────────────────────────

export async function getLeaderboard() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('players')
    .select('username, weapon, weekly_points, arena_points, highest_dungeon, highest_stage, active_skin')
    .order('highest_stage', { ascending: false })
    .order('weekly_points', { ascending: false })
    .limit(20)
  if (error) return []
  return data
}

// ─── PRACTICE LEADERBOARD (device-ID tier) ──────────────────────────────────
// Anonymous players (no wallet). Identified via Nimiq Pay Device Identifier.

export async function getPracticeScore(deviceId) {
  if (!supabase || !deviceId) return null
  const { data, error } = await supabase
    .from('practice_scores')
    .select('*')
    .eq('device_id', deviceId)
    .single()
  if (error) return null
  return data
}

/**
 * Upsert a practice score. Only overwrites best_stage / best_gold if the new
 * run is better (deeper, or same stage with more gold).
 */
export async function submitPracticeScore(deviceId, { username, weapon, bestStage, bestGold }) {
  if (!supabase || !deviceId) return { error: new Error('offline') }
  const existing = await getPracticeScore(deviceId)
  const prevBestStage = existing?.best_stage || 0
  const prevBestGold = existing?.best_gold || 0
  const prevRuns = existing?.runs_played || 0

  const newBestStage = Math.max(prevBestStage, bestStage || 0)
  const newBestGold =
    bestStage > prevBestStage
      ? bestGold || 0
      : Math.max(prevBestGold, bestGold || 0)

  const payload = {
    device_id: deviceId,
    username,
    weapon,
    best_stage: newBestStage,
    best_gold: newBestGold,
    runs_played: prevRuns + 1,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('practice_scores')
    .upsert(payload, { onConflict: 'device_id' })
  return { error }
}

export async function getPracticeLeaderboard(limit = 20) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('practice_scores')
    .select('username, weapon, best_stage, best_gold, runs_played')
    .order('best_stage', { ascending: false })
    .order('best_gold', { ascending: false })
    .limit(limit)
  if (error) return []
  return data
}

// ─── ACTIVE RUNS (save / resume) ────────────────────────────────────────────
// ownerType: 'wallet' | 'device'

export async function saveActiveRun(ownerType, ownerId, runState) {
  if (!supabase || !ownerId) return { error: new Error('offline') }
  const payload = {
    owner_type: ownerType,
    owner_id: ownerId,
    state: runState,
    dungeon_id: runState?.dungeonId ?? 0,
    stage_idx: runState?.stageIdx ?? 0,
    hp: runState?.hp ?? 0,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('active_runs')
    .upsert(payload, { onConflict: 'owner_type,owner_id' })
  return { error }
}

export async function loadActiveRun(ownerType, ownerId) {
  if (!supabase || !ownerId) return null
  const { data, error } = await supabase
    .from('active_runs')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .single()
  if (error) return null
  return data
}

export async function clearActiveRun(ownerType, ownerId) {
  if (!supabase || !ownerId) return
  await supabase
    .from('active_runs')
    .delete()
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
}

// ─── NIM PURCHASES (audit log) ──────────────────────────────────────────────

export async function logNimPurchase({ walletAddress, deviceId, purchaseType, itemId, amountNim, txHash }) {
  if (!supabase) return { error: new Error('offline') }
  const { error } = await supabase
    .from('nim_purchases')
    .insert({
      wallet_address: walletAddress || '',
      device_id: deviceId || null,
      purchase_type: purchaseType,   // 'sharpen_stone' | 'skin'
      item_id: itemId || null,       // e.g. 'golden' | 'crimson' | 'void'
      amount_nim: amountNim,
      tx_hash: txHash || null,
    })
  return { error }
}

// ─── MIGRATION (practice → official) ────────────────────────────────────────
// When a player who was playing anonymously connects a wallet, copy their best
// practice run into their official player record + link the device.

export async function migratePracticeToWallet(deviceId, walletAddress) {
  if (!supabase || !deviceId || !walletAddress) return { migrated: false }
  const practice = await getPracticeScore(deviceId)
  if (!practice) return { migrated: false }

  const player = await getPlayer(walletAddress)
  if (!player) return { migrated: false }

  const patch = {
    highest_stage: Math.max(player.highest_stage || 0, practice.best_stage || 0),
    gold: Math.max(player.gold || 0, practice.best_gold || 0),
    linked_device_id: deviceId,
    updated_at: new Date().toISOString(),
  }
  await supabase.from('players').update(patch).eq('wallet_address', walletAddress)
  await supabase
    .from('practice_scores')
    .update({ migrated_at: new Date().toISOString() })
    .eq('device_id', deviceId)

  return { migrated: true, fromStage: practice.best_stage, fromGold: practice.best_gold }
}