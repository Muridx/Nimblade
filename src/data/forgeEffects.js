/**
 * NIMBLADE — FORGE EFFECTS ENGINE (Bible v3.0 Appendix C)
 *
 * Central API that reads `meta.forge[node_key]` and converts each owned node
 * into a concrete in-run modifier. Everything that touches gameplay funnels
 * through here so the upgrade tree (lobby.js) and the simulation (battle.js,
 * shop.js, etc.) stay decoupled.
 *
 * 12 nodes — 4 branches × 3 tiers. Cost: T1=40, T2=120, T3=250 shards.
 *
 *   SURVIVAL
 *     survival_t1  — +5 max HP                        [RUN INIT]
 *     survival_t2  — +10 max HP                       [RUN INIT]
 *     survival_t3  — Free starter common relic         [RUN INIT]
 *
 *   ECONOMY
 *     economy_t1   — +10g start                       [RUN INIT]
 *     economy_t2   — +5g per battle win                [BATTLE]
 *     economy_t3   — Shop prices −20%                  [SHOP]
 *
 *   COMBAT
 *     combat_t1    — +2 base dmg (all attacks)         [BATTLE]
 *     combat_t2    — +5 energy regen per round         [BATTLE]
 *     combat_t3    — Start each battle with 30 energy  [BATTLE]
 *
 *   LUCK (replaces old Abilities branch)
 *     luck_t1      — +10% rare relic chance            [SHOP/DROPS]
 *     luck_t2      — +1 option at elite relic picks    [ELITE REWARD]
 *     luck_t3      — Start run with 1 random rare      [RUN INIT]
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
 * SURVIVAL T1 + T2 — total max HP bonus to add to playerHp & playerMaxHp.
 * T1 = +5, T2 = +10 (stacks additively: up to +15).
 */
export function forgeMaxHpBonus(meta) {
  let bonus = 0;
  if (ownsForge(meta, "survival_t1")) bonus += 5;
  if (ownsForge(meta, "survival_t2")) bonus += 10;
  return bonus;
}

/**
 * ECONOMY T1 — +10 starting gold.
 * Added to both `gold` and `totalGoldEarned` at run init.
 */
export function forgeStartGoldBonus(meta) {
  return ownsForge(meta, "economy_t1") ? 10 : 0;
}

/**
 * SURVIVAL T3 — pick a random common relic ID for the free starter relic.
 * Uses weighted random over the commons pool.
 * Returns relic id string, or null if survival_t3 isn't owned.
 *
 * Caller must push the id into run.relics via acquireRelic() so on-acquire
 * effects are applied through the standard relic engine.
 */
export function forgeStarterRelicId(meta) {
  if (!ownsForge(meta, "survival_t3")) return null;
  const pool = (relicsData && relicsData.commons) || [];
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
 * LUCK T3 — pick a random rare relic ID for the starting rare bonus.
 * Returns relic id string, or null if luck_t3 isn't owned.
 * Same weighted-random logic as starterRelicId but over the rares pool.
 */
export function forgeLuckStarterRareId(meta) {
  if (!ownsForge(meta, "luck_t3")) return null;
  const pool = (relicsData && relicsData.rares) || [];
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
 * Convenience snapshot of all run-init effects — useful for lobby.js
 * freshRun logging and future toast notifications.
 */
export function describeRunInitEffects(meta) {
  const out = [];
  const hpBonus = forgeMaxHpBonus(meta);
  if (hpBonus > 0) out.push(`+${hpBonus} max HP (Survival)`);
  if (forgeStartGoldBonus(meta))          out.push("+10 gold (Economy T1)");
  if (ownsForge(meta, "survival_t3"))     out.push("Free starter relic (Survival T3)");
  if (ownsForge(meta, "luck_t3"))         out.push("Random rare relic (Luck T3)");
  return out;
}

// ── IN-BATTLE EFFECTS ────────────────────────────────────────────────────────

/**
 * COMBAT T1 — +2 base damage added to ALL attacks (SLASH, COUNTER, WS, ULT).
 * Stacks additively with relic bonuses.
 */
export function forgeDmgBonus(meta) {
  return ownsForge(meta, "combat_t1") ? 2 : 0;
}

/**
 * COMBAT T2 — +5 energy regen per round.
 * Added to the per-turn energy regen value in battle loop.
 */
export function forgeEnergyRegenBonus(meta) {
  return ownsForge(meta, "combat_t2") ? 5 : 0;
}

/**
 * COMBAT T3 — +30 starting energy per battle.
 * Applied at the start of each battle (setUpPlayer).
 */
export function forgeBattleStartEnergy(meta) {
  return ownsForge(meta, "combat_t3") ? 30 : 0;
}

/**
 * ECONOMY T2 — +5 gold per battle win.
 * Added to gold reward after each battle victory.
 */
export function forgeBattleGoldBonus(meta) {
  return ownsForge(meta, "economy_t2") ? 5 : 0;
}

// ── SHOP EFFECTS ─────────────────────────────────────────────────────────────

/**
 * ECONOMY T3 — shop discount fraction. 0.20 = 20% off.
 * Caller does `Math.ceil(basePrice * (1 - discount))`.
 */
export function forgeShopDiscount(meta) {
  return ownsForge(meta, "economy_t3") ? 0.20 : 0;
}

// ── LUCK EFFECTS ─────────────────────────────────────────────────────────────

/**
 * LUCK T1 — +10% rare relic chance at shops and drops.
 * Returns the bonus percentage (0.10) or 0.
 * Caller adds this to base rare-tier probability when rolling relic drops.
 */
export function forgeLuckRareBonus(meta) {
  return ownsForge(meta, "luck_t1") ? 0.10 : 0;
}

/**
 * LUCK T2 — +1 option at elite relic picks.
 * Returns the extra choice count (0 or 1).
 */
export function forgeLuckExtraChoice(meta) {
  return ownsForge(meta, "luck_t2") ? 1 : 0;
}

// ---------------------------------------------------------------------------
// LEGACY SHIMS (old "Abilities" forge branch, replaced by Luck branch in store.js).
// These node types no longer exist in FORGE_NODES, so the bonuses are inert.
// Kept as exports so lobby.js / campfire.js / treasure.js keep importing cleanly.
// ---------------------------------------------------------------------------
export function forgeStartEnergyBonus(meta) {
  // No run-start energy node in the current design (combat_t3 covers battle-start).
  return 0;
}

export function forgeRestHealBonus(meta) {
  // No campfire heal-bonus node in the current design.
  return 0;
}

export function forgeTreasurePicks(meta) {
  // No treasure extra-pick node in the current design -> default to 1 pick.
  return 1;
}
