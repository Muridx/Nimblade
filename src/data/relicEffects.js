// 2.7c-1 + 2.7c-2 + 2.7c-3 Relic effects helper (commons + rares + epics).
// All effects read from `run.relics` (array of relic id strings).
// Pure functions: take run/state, return numeric/boolean bonuses.

import { next as rngNext } from "./rng.js";
export function hasRelic(run, id) {
  if (!run || !Array.isArray(run.relics)) return false;
  return run.relics.includes(id);
}

// ---- Damage bonuses (added to dmg AFTER SHARPEN buff, BEFORE weapon perks) ----
export function slashDmgBonus(run) {
  let b = 0;
  if (hasRelic(run, "broken_dagger")) b += 1;
  if (hasRelic(run, "whetstone")) b += 2;
  // Berserker Stone (tooltip): SLASH dmg +5 unconditional. Self-dmg downside
  // (+2/round first 5 rounds) handled via berserkerStoneSelfDmg() at turn start.
  if (hasRelic(run, "berserker_stone")) b += 5;
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

// Cleansing Bell (tooltip): 1x/battle clear all curse/DoT. Owned-check only;
// battle.js calls clearPlayerDebuffs() once when a debuff is present.
export function hasCleansingBell(run) {
  return hasRelic(run, "cleansing_bell");
}

// Gambler's Dice (tooltip): +30 energy at every battle start (-10 maxHp for the
// run applied once at acquire in acquireRelic).
export function gamblersDiceEnergyOnStart(run) {
  return hasRelic(run, "gamblers_dice") ? 30 : 0;
}

// Frostbite Shard (tooltip): 10% chance on SLASH win to freeze enemy next turn.
export function rollFrostbiteFreeze(run) {
  if (!hasRelic(run, "frostbite_shard")) return false;
  return rngNext() < 0.10;
}

// Mirror Shield: % of blocked dmg reflected back on GUARD win (0..1).
export function mirrorReflectFrac(run) {
  return hasRelic(run, "mirror_shield") ? 0.5 : 0;
}

// Holy Water (tooltip): 1x/battle disable monster healing for 3 turns. Owned-check
// only; battle.js arms the charge and gates healEnemy() for a 3-turn window.
export function hasHolyWater(run) {
  return hasRelic(run, "holy_water");
}

// Iron Will (tooltip): 1x/battle ignore one boss SCHEME (treat as honest).
// Owned-check only; battle.js consumes a per-battle charge to cancel the first
// scheme / enraged feint and force the displayed intent honest that turn.
export function hasIronWill(run) {
  return hasRelic(run, "iron_will");
}

// Chained Grimoire (tooltip): COUNTER win dmg +6, BUT lose 5 energy per turn.
export function grimoireCounterBonus(run) {
  return hasRelic(run, "chained_grimoire") ? 6 : 0;
}
export function grimoireEnergyDrain(run) {
  return hasRelic(run, "chained_grimoire") ? 5 : 0;
}

// Phoenix Ember (tooltip): 1x/battle, when HP drops below 20% maxHp, heal 15 HP.
// Owned-check + threshold; battle.js tracks a per-battle charge (state).
export function hasPhoenixEmber(run) {
  return hasRelic(run, "phoenix_ember");
}
export function phoenixHealAmount() { return 15; }
export function phoenixThresholdFrac() { return 0.20; }

// Berserker Stone (tooltip downside): +2 self-dmg per round for the first 5 rounds.
export function berserkerStoneSelfDmg(run, turn) {
  if (!hasRelic(run, "berserker_stone")) return 0;
  return (turn >= 1 && turn <= 5) ? 2 : 0;
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

// ---- R9 RELICS (commons + rares + epics, set expansion 32->42) -------------

// Counterweight (common): COUNTER win dmg +2.
export function counterDmgBonus(run) {
  return hasRelic(run, "counterweight") ? 2 : 0;
}

// Parry Stud (common): GUARD win dmg +2 (bash back on a successful guard).
export function guardWinDmgBonus(run) {
  return hasRelic(run, "parry_stud") ? 2 : 0;
}

// Coin Pouch (common): +3 gold per battle won (folded into bonusGoldOnBattleWin caller).
export function coinPouchGold(run) {
  return hasRelic(run, "coin_pouch") ? 3 : 0;
}

// Trail Rations (common): heal this many HP each time the player enters a new floor.
export function trailRationsHeal(run) {
  return hasRelic(run, "trail_rations") ? 4 : 0;
}

// Momentum Coil (rare): +1 dmg per consecutive RPS win this battle, cap +5.
// `comboCount` is the live battle streak (resets on draw/loss already).
export function momentumCoilBonus(run, comboCount) {
  if (!hasRelic(run, "momentum_coil")) return 0;
  return Math.min(Math.max(0, comboCount || 0), 5);
}

// Frost Lattice (rare): 20% chance on GUARD win to freeze enemy next turn.
export function rollFrostLatticeFreeze(run) {
  if (!hasRelic(run, "frost_lattice")) return false;
  return rngNext() < 0.20;
}

// Ethereal Edge (rare): fraction of enemy armor ignored by player attacks (0..1).
export function etherealArmorPenFrac(run) {
  return hasRelic(run, "ethereal_edge") ? 0.5 : 0;
}

// Soul Harvest (epic): +1 permanent dmg to ALL attacks per elite/miniboss/boss kill.
// Stacks stored on run.soulHarvestStacks; incremented by reward handler.
export function soulHarvestDmgBonus(run) {
  if (!hasRelic(run, "soul_harvest")) return 0;
  return run?.soulHarvestStacks || 0;
}
// Tiers that count as a "kill" for Soul Harvest.
export function soulHarvestKillTier(tier) {
  return tier === "elite" || tier === "miniboss" || tier === "boss";
}

// Glass Cannon (epic): +6 flat dmg to ALL attacks (maxHp -25 handled at acquire).
export function glassCannonDmgBonus(run) {
  return hasRelic(run, "glass_cannon") ? 6 : 0;
}

// Arcane Conduit (epic): Weapon Skill & ULT +30%, basic RPS-win dmg -15%.
export function arcaneConduitAbilityMult(run) {
  return hasRelic(run, "arcane_conduit") ? 1.30 : 1.0;
}
export function arcaneConduitBasicMult(run) {
  return hasRelic(run, "arcane_conduit") ? 0.85 : 1.0;
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
  // Gambler's Dice (tooltip): -10 max HP for the run, applied once at acquire.
  if (relicId === "gamblers_dice") {
    newRun.playerMaxHp = Math.max(1, (newRun.playerMaxHp || 100) - 10);
    newRun.playerHp = Math.min(newRun.playerHp ?? newRun.playerMaxHp, newRun.playerMaxHp);
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
  // R9 EPIC: Glass Cannon -- -25 max HP on acquire (one-time, floor at 1 HP).
  if (relicId === "glass_cannon") {
    newRun.playerMaxHp = Math.max(1, (newRun.playerMaxHp || 100) - 25);
    newRun.playerHp = Math.min(newRun.playerHp ?? newRun.playerMaxHp, newRun.playerMaxHp);
  }
  // R9 EPIC: Soul Harvest -- kill-counter for permanent dmg scaling.
  if (relicId === "soul_harvest" && typeof newRun.soulHarvestStacks === "undefined") {
    newRun.soulHarvestStacks = 0;
  }
  return newRun;
}
