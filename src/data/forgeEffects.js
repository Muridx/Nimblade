/**
 * NIMBLADE — FORGE EFFECTS ENGINE (v2 — T1→T5 rebalance)
 *
 * Central API: reads `meta.forge[node_key]` → concrete in-run modifiers.
 * Everything gameplay-touching funnels through here so the upgrade tree
 * (lobby.js) and simulation (battle.js, shop.js) stay decoupled.
 *
 * 20 nodes — 4 branches × 5 tiers.
 * Cost curve: T1=40, T2=100, T3=200, T4=400, T5=800 shards.
 * Exception: survival_t5 (+1 Revive) = 1,600 shards (2×).
 *
 *   COMBAT
 *     combat_t1  — +2 base dmg                          [BATTLE]
 *     combat_t2  — +3 energy regen/turn                  [BATTLE]
 *     combat_t3  — +5 energy regen/turn (stack=+8)       [BATTLE]
 *     combat_t4  — Start each battle with 20 energy      [BATTLE]
 *     combat_t5  — +4 base dmg (stack=+6)                [BATTLE]
 *
 *   SURVIVAL
 *     survival_t1 — +5 max HP                            [RUN INIT]
 *     survival_t2 — +10 max HP (stack=+15)               [RUN INIT]
 *     survival_t3 — Heal 5 HP after boss kill            [BATTLE]
 *     survival_t4 — Free starter common relic            [RUN INIT]
 *     survival_t5 — +1 revive per run (20 HP)            [BATTLE]
 *
 *   ECONOMY
 *     economy_t1  — +5g start                            [RUN INIT]
 *     economy_t2  — +3g per battle win                   [BATTLE]
 *     economy_t3  — +5g per battle win (stack=+8)        [BATTLE]
 *     economy_t4  — Shop prices −15%                     [SHOP]
 *     economy_t5  — Potion cost 2g/HP (base 4g/HP)       [SHOP]
 *
 *   LUCK
 *     luck_t1     — +5% rare relic chance                [SHOP/DROPS]
 *     luck_t2     — +1 option at elite relic picks       [ELITE REWARD]
 *     luck_t3     — +3% epic relic chance                [SHOP/DROPS]
 *     luck_t4     — Start with 1 random common relic     [RUN INIT]
 *     luck_t5     — Start with 1 random rare relic       [RUN INIT]
 */

import relicsData from "./relics.json" assert { type: "json" };
import { next as rngNext } from "./rng.js";

// ── Core ─────────────────────────────────────────────────────────────────────

/** Read forge ownership safely from a meta object. */
export function ownsForge(meta, key) {
  if (!meta || !meta.forge) return false;
  return !!meta.forge[key];
}

// ── RUN-INIT EFFECTS (applied once when a new run starts) ────────────────────

/**
 * SURVIVAL T1+T2 — total max HP bonus. T1=+5, T2=+10, stacks to +15.
 */
export function forgeMaxHpBonus(meta) {
  let bonus = 0;
  if (ownsForge(meta, "survival_t1")) bonus += 5;
  if (ownsForge(meta, "survival_t2")) bonus += 10;
  return bonus;
}

/**
 * ECONOMY T1 — +5 starting gold.
 */
export function forgeStartGoldBonus(meta) {
  return ownsForge(meta, "economy_t1") ? 5 : 0;
}

/**
 * SURVIVAL T4 — random common relic ID for the free starter relic.
 * Returns relic id string, or null if not owned.
 */
export function forgeStarterRelicId(meta) {
  if (!ownsForge(meta, "survival_t4")) return null;
  return _pickRandomFromPool("commons");
}

/**
 * LUCK T4 — random common relic ID for starter common.
 * Returns relic id string, or null if not owned.
 */
export function forgeLuckStarterCommonId(meta) {
  if (!ownsForge(meta, "luck_t4")) return null;
  return _pickRandomFromPool("commons");
}

/**
 * LUCK T5 — random rare relic ID for starter rare.
 * Returns relic id string, or null if not owned.
 */
export function forgeLuckStarterRareId(meta) {
  if (!ownsForge(meta, "luck_t5")) return null;
  return _pickRandomFromPool("rares");
}

/** Internal: pick a weighted-random relic from a pool ("commons" or "rares"). */
function _pickRandomFromPool(poolKey) {
  const pool = (relicsData && relicsData[poolKey]) || [];
  if (pool.length === 0) return null;
  const total = pool.reduce((s, r) => s + (r.weight || 1), 0);
  let roll = rngNext() * total;
  for (const r of pool) {
    roll -= r.weight || 1;
    if (roll <= 0) return r.id;
  }
  return pool[pool.length - 1].id;
}

/**
 * SURVIVAL T5 — revive enabled flag + HP amount.
 * Returns { enabled: boolean, hp: number }.
 */
export const FORGE_REVIVE_HP = 20;
export function forgeReviveEnabled(meta) {
  return ownsForge(meta, "survival_t5");
}

/**
 * Convenience snapshot of all run-init effects — for freshRun logging.
 */
export function describeRunInitEffects(meta) {
  const out = [];
  const hpBonus = forgeMaxHpBonus(meta);
  if (hpBonus > 0) out.push(`+${hpBonus} max HP (Survival)`);
  if (forgeStartGoldBonus(meta)) out.push("+5 gold (Economy T1)");
  if (ownsForge(meta, "survival_t4")) out.push("Free starter common relic (Survival T4)");
  if (ownsForge(meta, "luck_t4")) out.push("Random common relic (Luck T4)");
  if (ownsForge(meta, "luck_t5")) out.push("Random rare relic (Luck T5)");
  if (forgeReviveEnabled(meta)) out.push("+1 Revive (Survival T5)");
  return out;
}

// ── IN-BATTLE EFFECTS ────────────────────────────────────────────────────────

/**
 * COMBAT T1+T5 — total base damage bonus. T1=+2, T5=+4, stacks to +6.
 */
export function forgeDmgBonus(meta) {
  let bonus = 0;
  if (ownsForge(meta, "combat_t1")) bonus += 2;
  if (ownsForge(meta, "combat_t5")) bonus += 4;
  return bonus;
}

/**
 * COMBAT T2+T3 — total energy regen bonus. T2=+3, T3=+5, stacks to +8.
 */
export function forgeEnergyRegenBonus(meta) {
  let bonus = 0;
  if (ownsForge(meta, "combat_t2")) bonus += 3;
  if (ownsForge(meta, "combat_t3")) bonus += 5;
  return bonus;
}

/**
 * COMBAT T4 — starting energy per battle.
 */
export function forgeBattleStartEnergy(meta) {
  return ownsForge(meta, "combat_t4") ? 20 : 0;
}

/**
 * ECONOMY T2+T3 — total gold bonus per battle win. T2=+3, T3=+5, stacks to +8.
 */
export function forgeBattleGoldBonus(meta) {
  let bonus = 0;
  if (ownsForge(meta, "economy_t2")) bonus += 3;
  if (ownsForge(meta, "economy_t3")) bonus += 5;
  return bonus;
}

/**
 * SURVIVAL T3 — HP healed after boss kill. Returns 0 if not owned.
 */
export function forgeBossHealBonus(meta) {
  return ownsForge(meta, "survival_t3") ? 5 : 0;
}

// ── SHOP EFFECTS ─────────────────────────────────────────────────────────────

/** Baseline potion cost (nerfed from 3 to 4 in v2). */
export const BASE_POTION_GOLD_PER_HP = 4;

/**
 * ECONOMY T5 — effective potion cost per HP. Returns 2 if owned, else BASE (4).
 */
export function forgePotionCostPerHp(meta) {
  return ownsForge(meta, "economy_t5") ? 2 : BASE_POTION_GOLD_PER_HP;
}

/**
 * ECONOMY T4 — shop relic discount fraction. 0.15 = 15% off.
 */
export function forgeShopDiscount(meta) {
  return ownsForge(meta, "economy_t4") ? 0.15 : 0;
}

// ── LUCK EFFECTS ─────────────────────────────────────────────────────────────

/**
 * LUCK T1 — +5% rare relic chance at shops and drops.
 */
export function forgeLuckRareBonus(meta) {
  return ownsForge(meta, "luck_t1") ? 0.05 : 0;
}

/**
 * LUCK T3 — +3% epic relic chance at shops and drops.
 */
export function forgeLuckEpicBonus(meta) {
  return ownsForge(meta, "luck_t3") ? 0.03 : 0;
}

/**
 * LUCK T2 — +1 option at elite relic picks.
 */
export function forgeLuckExtraChoice(meta) {
  return ownsForge(meta, "luck_t2") ? 1 : 0;
}

// ---------------------------------------------------------------------------
// LEGACY SHIMS — kept for backward-compatibility with imports in other files.
// ---------------------------------------------------------------------------
export function forgeStartEnergyBonus(meta) { return 0; }
export function forgeRestHealBonus(meta) { return 0; }
export function forgeTreasurePicks(meta) { return 1; }
