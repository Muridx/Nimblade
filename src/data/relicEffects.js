// 2.7c-1 + 2.7c-2 + 2.7c-3 Relic effects helper (commons + rares + epics).
// All effects read from `run.relics` (array of relic id strings).
// Pure functions: take run/state, return numeric/boolean bonuses.

export function hasRelic(run, id) {
  if (!run || !Array.isArray(run.relics)) return false;
  return run.relics.includes(id);
}

// ---- Damage bonuses (added to dmg AFTER SHARPEN buff, BEFORE weapon perks) ----
export function slashDmgBonus(run) {
  let b = 0;
  if (hasRelic(run, "broken_dagger")) b += 1;
  if (hasRelic(run, "whetstone")) b += 2;
  // 2.7c-2 rare: Berserker Stone -- under 30% HP, SLASH dmg +3
  if (hasRelic(run, "berserker_stone")) {
    const maxHp = run?.playerMaxHp || 100;
    const hp = run?.playerHp ?? maxHp;
    if (maxHp > 0 && hp / maxHp < 0.30) b += 3;
  }
  return b;
}

// Iron Buckler: extra dmg absorbed when GUARD blocks an incoming hit.
// Returned as additional reduction (flat dmg subtracted from `taken` after weapon GUARD %).
export function guardExtraBlock(run) {
  return hasRelic(run, "iron_buckler") ? 3 : 0;
}

// ---- Economy ----
// Flat bonus gold added to base reward gold for any battle win.
export function bonusGoldOnBattleWin(run) {
  let g = 0;
  if (hasRelic(run, "old_coin")) g += 2;
  if (hasRelic(run, "lucky_coin")) g += 5;
  return g;
}

// Per SLASH win, += this gold (paid mid-battle into run.gold).
export function goldPerSlashWin(run) {
  return hasRelic(run, "crow_feather") ? 2 : 0;
}

// ---- Tempo ----
// Extra energy regen per turn (added to S.energy_regen_per_turn).
export function bonusEnergyPerTurn(run) {
  let bonus = hasRelic(run, "quick_boots") ? 5 : 0;
  // M9: Ancient Rune mystery event grants +1 regen / turn per attune
  // (stacks if player ever hits multiple Rune events in one run).
  if (run && run.runeEnergyBonus) bonus += run.runeEnergyBonus;
  return bonus;
}

// ---- HP / sustain ----
// Acquire-time max HP bonus (applied ONCE per relic acquisition).
export function maxHpOnAcquire(relicId) {
  if (relicId === "dusty_tome") return 3;
  return 0;
}

// Healing herb: HP healed at the end of every battle won.
export function healOnBattleWin(run) {
  let h = 0;
  if (hasRelic(run, "healing_herb")) h += 3;
  return h;
}

// 2.7c-2: Vampire Fang -- heal per SLASH win (mid-battle)
export function healPerSlashWin(run) {
  return hasRelic(run, "vampire_fang") ? 2 : 0;
}

// ---- Info / intent ----
// Insight Charm: turn 1 honest. Time Glass: turn 1 + turn 2 honest.
// 2.7c-3: Eye of Omniscience also forces honest on turns 1 + 2.
export function honestIntentTurn(run, turn) {
  if (turn === 1 && hasRelic(run, "insight_charm")) return true;
  if (hasRelic(run, "time_glass") && (turn === 1 || turn === 2)) return true;
  if (hasRelic(run, "eye_of_omniscience") && (turn === 1 || turn === 2)) return true;
  return false;
}
// kept for backward compat with 2.7c-1 hook name
export function insightCharmActive(run, turn) {
  return honestIntentTurn(run, turn);
}

// Torch: reveal exact enemy HP number (vs % default).
export function hasTorch(run) {
  return hasRelic(run, "torch");
}

// ---- 2.7c-2 RARES ----------------------------------------------------------

// Cleansing Bell: +20 energy at battle start.
export function bonusEnergyOnBattleStart(run) {
  return hasRelic(run, "cleansing_bell") ? 20 : 0;
}

// Gambler's Dice: roll once at battle start. Returns { gold:+15 } or { hp:-10 } or null.
export function rollGamblersDice(run) {
  if (!hasRelic(run, "gamblers_dice")) return null;
  return Math.random() < 0.5 ? { gold: 15 } : { hp: -10 };
}

// Frostbite Shard: 15% chance on SLASH win to freeze enemy (skip next turn).
export function rollFrostbiteFreeze(run) {
  if (!hasRelic(run, "frostbite_shard")) return false;
  return Math.random() < 0.15;
}

// Mirror Shield: % of blocked dmg reflected back on GUARD win (0..1).
export function mirrorReflectFrac(run) {
  return hasRelic(run, "mirror_shield") ? 0.5 : 0;
}

// Holy Water: flat enemy dmg reduction at elite/boss only (anti-elite tax).
export function holyWaterReduction(run, isEliteOrBoss) {
  if (!isEliteOrBoss) return 0;
  return hasRelic(run, "holy_water") ? 2 : 0;
}

// Iron Will: when player takes a "big hit" (>=25% maxHp in one strike),
// permanently +10 maxHp for the run. Returns true if it triggered (caller mutates).
export function ironWillTriggers(run, dmgTaken) {
  if (!hasRelic(run, "iron_will")) return false;
  const maxHp = run?.playerMaxHp || 100;
  return dmgTaken >= Math.ceil(maxHp * 0.25);
}

// Chained Grimoire: on COUNTER win, +1 SLASH dmg (permanent for run), cap 3 stacks.
// Returns the stack count to add (0 or 1) given current stored stacks.
export function grimoireGainOnCounterWin(run) {
  if (!hasRelic(run, "chained_grimoire")) return 0;
  const cur = run?.grimoireStacks || 0;
  return cur < 3 ? 1 : 0;
}

// Phoenix Ember: one-shot revive at 30 HP. Caller checks run.phoenixUsed.
export function canPhoenixRevive(run) {
  return hasRelic(run, "phoenix_ember") && !run?.phoenixUsed;
}

// Runic Compass: passive flag for upcoming map UI (no gameplay effect yet).
export function hasRunicCompass(run) {
  return hasRelic(run, "runic_compass");
}

// ---- 2.7c-3 EPICS -----------------------------------------------------------

// Devil's Bargain: +30 maxHp at acquire (one-time), -2 self-dmg per SLASH win.
export function devilsBargainSelfDmgPerSlashWin(run) {
  return hasRelic(run, "devils_bargain") ? 2 : 0;
}

// Echo Stone: +25% dmg when basic RPS WIN streak (same action) >= 2.
// Streak state lives on battle `state` (echoLastAction, echoStreak).
// This helper just gates whether the relic is owned.
export function hasEchoStone(run) {
  return hasRelic(run, "echo_stone");
}

// Serpent Belt: every 5th turn -> take 0 dmg AND deal 2x dmg.
export function serpentBeltActive(run, turn) {
  return hasRelic(run, "serpent_belt") && turn > 0 && turn % 5 === 0;
}

// Golden Chalice: start each battle at 50% maxHp, double gold from all sources.
export function goldenChaliceStartHpFrac(run) {
  return hasRelic(run, "golden_chalice") ? 0.5 : null;
}
export function goldenChaliceGoldMult(run) {
  return hasRelic(run, "golden_chalice") ? 2 : 1;
}

// Crown of Decision: every 3rd turn = "Crown Turn".
// All dmg both sides x1.5. Intent uses chapter honesty (overrides honest-forcing).
export function crownTurnActive(run, turn) {
  return hasRelic(run, "crown_of_decision") && turn > 0 && turn % 3 === 0;
}

// Eye of Omniscience: enemy dmg +10% whole battle (honest turns 1+2 handled in honestIntentTurn).
export function eyeOmniscienceEnemyDmgMult(run) {
  return hasRelic(run, "eye_of_omniscience") ? 1.1 : 1.0;
}

// Void Crown: READ cost -20 energy, queue 2 honest reveals, +10% on next attack
// if win RPS exchange. Flags live on battle state (voidCrownPendingBonus).
export function voidCrownReadCostDelta(run) {
  return hasRelic(run, "void_crown") ? -20 : 0;
}
export function voidCrownExtraHonestReveals(run) {
  // Default READ already locks NEXT intent honest. Void Crown adds 1 MORE.
  return hasRelic(run, "void_crown") ? 1 : 0;
}
export function hasVoidCrown(run) {
  return hasRelic(run, "void_crown");
}

// Heart of Nimblade: 1x per run revive at 30 HP. Caller checks run.heartUsed.
// Stacks with Phoenix Ember (each consumes its own charge).
export function canHeartRevive(run) {
  return hasRelic(run, "heart_of_nimblade") && !run?.heartUsed;
}

// ---- Acquire helper ----
// Centralized "give relic to player" mutation. Adds id to relics[] and
// applies one-time stat bumps. Returns a NEW run object.
export function acquireRelic(run, relicId) {
  if (!run || !relicId) return run;
  const newRun = { ...run, relics: [...(run.relics || []), relicId] };
  const hpBump = maxHpOnAcquire(relicId);
  if (hpBump > 0) {
    newRun.playerMaxHp = (newRun.playerMaxHp || 100) + hpBump;
    newRun.playerHp = Math.min((newRun.playerHp || newRun.playerMaxHp) + hpBump, newRun.playerMaxHp);
  }
  // 2.7c-2: Phoenix Ember marks revive available exactly once per run.
  if (relicId === "phoenix_ember" && typeof newRun.phoenixUsed === "undefined") {
    newRun.phoenixUsed = false;
  }
  // Chained Grimoire stack counter initialised.
  if (relicId === "chained_grimoire" && typeof newRun.grimoireStacks === "undefined") {
    newRun.grimoireStacks = 0;
  }
  // 2.7c-3 EPIC: Devil's Bargain -- +30 maxHp on acquire (one-time).
  if (relicId === "devils_bargain") {
    newRun.playerMaxHp = (newRun.playerMaxHp || 100) + 30;
    newRun.playerHp = Math.min((newRun.playerHp || newRun.playerMaxHp) + 30, newRun.playerMaxHp);
  }
  // 2.7c-3 EPIC: Heart of Nimblade -- one-shot revive (parallel to phoenix).
  if (relicId === "heart_of_nimblade" && typeof newRun.heartUsed === "undefined") {
    newRun.heartUsed = false;
  }
  return newRun;
}
