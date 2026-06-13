/**
 * NIMBLADE -- FORGE EFFECTS ENGINE (M5)
 *
 * Central API that reads `meta.forge[node_key]` and converts each owned node
 * into a concrete in-run modifier. Everything that touches gameplay funnels
 * through here so the upgrade tree (lobby.js) and the simulation (battle.js,
 * shop.js, treasure.js, campfire.js) stay decoupled.
 *
 * 12 nodes from Design Doc v1.1 \u00a77.2:
 *
 *   SURVIVAL
 *     survival_t1  -- +5 max HP                         [RUN INIT]   (M5a \u2713)
 *     survival_t2  -- Campfire REST 60% (was 40%)       [CAMPFIRE]   (M5b)
 *     survival_t3  -- Free starter relic                [RUN INIT]   (M5a \u2713)
 *
 *   ECONOMY
 *     economy_t1   -- +10g start                        [RUN INIT]   (M5a \u2713)
 *     economy_t2   -- Shop -10%                         [SHOP]       (M5b)
 *     economy_t3   -- Treasure x2                       [TREASURE]   (M5b)
 *
 *   COMBAT
 *     combat_t1    -- SLASH +1 dmg                      [BATTLE]     (M5b)
 *     combat_t2    -- Combo @ 2 wins (was 3)            [BATTLE]     (M5b)
 *     combat_t3    -- Counter loss -2 (take +1, not +3) [BATTLE]     (M5b)
 *
 *   ABILITIES
 *     abilities_t1 -- Wild Strike costs 30e (was 40)    [BATTLE]     (M5b)
 *     abilities_t2 -- Start +20 energy                  [RUN INIT]   (M5a \u2713)
 *     abilities_t3 -- All Ultimates -10 energy          [BATTLE]     (M5b)
 *
 * M5a wires the RUN-INIT layer (4 nodes).
 * M5b adds the in-scene helpers (battle/shop/treasure/campfire = 8 nodes).
 */

import relicsData from "./relics.json" assert { type: "json" };

/** Read forge ownership safely from a meta object. */
export function ownsForge(meta, key) {
  if (!meta || !meta.forge) return false;
  return !!meta.forge[key];
}

/* ---------- RUN-INIT EFFECTS (M5a) ---------- */

/**
 * +5 max HP if survival_t1 is forged. Returns the bonus HP to add to BOTH
 * playerHp and playerMaxHp in freshRun.
 */
export function forgeMaxHpBonus(meta) {
  return ownsForge(meta, "survival_t1") ? 5 : 0;
}

/**
 * +10 starting gold if economy_t1 is forged.
 * Returns the bonus to add to BOTH `gold` and `totalGoldEarned`
 * (totalGoldEarned counts every positive gold gain for shard payout, so
 * starter gold counts too -- it was earned via meta progression).
 */
export function forgeStartGoldBonus(meta) {
  return ownsForge(meta, "economy_t1") ? 10 : 0;
}

/**
 * +20 starting energy if abilities_t2 is forged. Set on run.energy at
 * freshRun -- carries over into the first battle's player.energy via the
 * existing carry-over plumbing in battle.js setUpPlayer().
 */
export function forgeStartEnergyBonus(meta) {
  return ownsForge(meta, "abilities_t2") ? 20 : 0;
}

/**
 * Pick a random common relic ID for the survival_t3 starter-relic bonus.
 * Uses weighted random over the commons pool (same weights as treasure).
 * Returns relic id string, or null if survival_t3 isn't owned.
 *
 * Note: this is a PURE picker -- caller is responsible for pushing the id
 * into run.relics via acquireRelic() so any on-acquire effect (e.g. dusty
 * tome's +3 max HP) is applied through the standard relic engine.
 */
export function forgeStarterRelicId(meta) {
  if (!ownsForge(meta, "survival_t3")) return null;
  const pool = (relicsData && relicsData.commons) || [];
  if (pool.length === 0) return null;
  const total = pool.reduce((s, r) => s + (r.weight || 1), 0);
  let roll = Math.random() * total;
  for (const r of pool) {
    roll -= (r.weight || 1);
    if (roll <= 0) return r.id;
  }
  return pool[pool.length - 1].id;
}

/**
 * Convenience snapshot of all run-init effects -- callable by lobby.js
 * freshRun to log what was applied (useful for debug + a future toast).
 */
export function describeRunInitEffects(meta) {
  const out = [];
  if (forgeMaxHpBonus(meta))      out.push("+5 max HP (Survival T1)");
  if (forgeStartGoldBonus(meta))  out.push("+10 gold (Economy T1)");
  if (forgeStartEnergyBonus(meta)) out.push("+20 starting energy (Abilities T2)");
  if (ownsForge(meta, "survival_t3")) out.push("Free starter relic (Survival T3)");
  return out;
}

/* ---------- IN-SCENE EFFECTS (M5b) ---------- */

/**
 * COMBAT T1 -- bonus damage added to every SLASH WIN. Stacks ADDITIVELY with
 * existing relic SLASH bonuses (broken_dagger, whetstone, etc).
 */
export function forgeSlashBonus(meta) {
  return ownsForge(meta, "combat_t1") ? 1 : 0;
}

/**
 * COMBAT T2 -- combo bonus trigger threshold. Default 3, drops to 2 when
 * forged so the +10% combo bonus kicks in one win earlier.
 */
export function forgeComboThreshold(meta) {
  return ownsForge(meta, "combat_t2") ? 2 : 3;
}

/**
 * COMBAT T3 -- on RPS loss while COUNTER-ing, you currently take base + 3
 * extra. This returns the REDUCTION amount (2 if forged, 0 otherwise) so
 * caller does `Math.max(0, S.counter_loss_dmg_taken - reduction)`.
 */
export function forgeCounterLossReduction(meta) {
  return ownsForge(meta, "combat_t3") ? 2 : 0;
}

/**
 * ECONOMY T2 -- discount fraction. 0.10 = 10% off. Caller does
 * `Math.ceil(basePrice * (1 - discount))`. Ceil to avoid 0g exploits on
 * 1g items.
 */
export function forgeShopDiscount(meta) {
  return ownsForge(meta, "economy_t2") ? 0.10 : 0;
}

/**
 * ECONOMY T3 -- number of relic picks granted by a treasure node. Default
 * 1, becomes 2 when forged. Treasure scene still rolls 3 cards but lets the
 * player claim up to N of them.
 */
export function forgeTreasurePicks(meta) {
  return ownsForge(meta, "economy_t3") ? 2 : 1;
}

/**
 * SURVIVAL T2 -- Campfire REST bonus HP on top of the existing +35 base.
 * +25 bonus means an upgraded REST on a 100-HP run heals 60 HP total
 * (mirrors the design doc "REST 60%" language).
 */
export function forgeRestHealBonus(meta) {
  return ownsForge(meta, "survival_t2") ? 25 : 0;
}

/**
 * ABILITIES T1 -- Wild Strike energy cost reduction. -10 when forged.
 * Returns the REDUCTION; caller does `Math.max(0, S.ws_cost - reduction)`.
 */
export function forgeWildStrikeCostReduction(meta) {
  return ownsForge(meta, "abilities_t1") ? 10 : 0;
}

/**
 * ABILITIES T3 -- Ultimate energy cost reduction. -10 when forged.
 * Returns the REDUCTION; caller does `Math.max(0, S.ult_cost - reduction)`.
 */
export function forgeUltCostReduction(meta) {
  return ownsForge(meta, "abilities_t3") ? 10 : 0;
}
