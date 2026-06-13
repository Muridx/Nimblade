/**
  * NIMBLADE -- global store (pub/sub)
  *
  * run shape (post 2.7a):
  * {
  *   mode: "demo" | "full",
  *   weapon: "sword" | "spear" | "axe" | "staff",
  *   chapter: "CH1",
  *   floor: 1..9,            // current floor number
  *   floorMax: 9,            // CH1 has 9 floors
  *   gold: number,           // accumulated gold this run (current balance, can decrease via shop)
  *   totalGoldEarned: number,// CUMULATIVE gold earned, never decreases -> shard payout source (§7.1)
  *   relics: [relicId, ...], // owned relics (effects engine in 2.7c)
  *   playerHp: number,       // carryover HP between battles
  *   playerMaxHp: number,    // max HP (can be modified by relics later)
  *   sharpenStones: number,  // NIM-purchased SLASH+COUNTER buffs (Step 2.9)
  *   // 2.7a-patch carry-over (persist between floors, reset on new run):
  *   energy: number,         // current energy / ULT charge
  *   momentumStacks: number, // sword passive stacks
  *   berserkTurns: number,   // axe ULT remaining duration
  *   readUses: number,       // STUDY action uses remaining this run (start 3)
  *   ascension: number,      // 0..5 -- difficulty multiplier applied to this run (§7.4 + §8.5)
  * }
  *
  * meta shape (3.0a -- Forge / Ascension foundation):
  * {
  *   wallet: { address, connectedAt } | null,
  *   shards: number,                        // §7.1 currency, accumulates across runs
  *   forge: { [nodeKey]: boolean },         // 12 nodes, see FORGE_NODES below
  *   ascension: number,                     // 0..5 -- current selected ascension level for next run
  *   ch1Cleared: boolean,                   // unlocked once player beats Goblin King -> gates Ascension UI
  * }
  *
  * `meta` is persisted to localStorage under META_STORAGE_KEY on every setState
  * that touches meta. `run` is in-memory only (active_runs save system lives in
  * §1.4 save plan -- localStorage for demo, Supabase later).
  */

const META_STORAGE_KEY = "nimblade.meta.v1";

/**
 * Forge tree node keys per Design Doc v1.1 §7.2.
 * 4 branches x 3 tiers = 12 nodes. Each branch has prereq chain T1 -> T2 -> T3.
 * Cost: T1 = 40 shards, T2 = 100 shards, T3 = 250 shards.
 *
 * Keep this list authoritative -- forge UI + run-init effect application both
 * read from here. If you add a node, also wire its effect in src/data/forgeEffects.js
 * (will be created in M5).
 */
export const FORGE_NODES = [
  // Survival branch -- HP & healing
  { key: "survival_t1",   branch: "survival",  tier: 1, cost: 40,  name: "+5 max HP",                desc: "Start every run with 5 extra max HP." },
  { key: "survival_t2",   branch: "survival",  tier: 2, cost: 100, name: "Campfire REST 60%",         desc: "REST campfire heals 60% max HP (was 40%)." },
  { key: "survival_t3",   branch: "survival",  tier: 3, cost: 250, name: "Free starter relic",        desc: "Start every run with 1 free common relic." },
  // Economy branch -- gold & shop
  { key: "economy_t1",    branch: "economy",   tier: 1, cost: 40,  name: "+10g start",                desc: "Start every run with 10 extra gold." },
  { key: "economy_t2",    branch: "economy",   tier: 2, cost: 100, name: "Shop -10%",                  desc: "Shop prices reduced by 10%." },
  { key: "economy_t3",    branch: "economy",   tier: 3, cost: 250, name: "Treasure x2",                desc: "Treasure nodes grant 2 relics instead of 1." },
  // Combat branch -- damage & RPS
  { key: "combat_t1",     branch: "combat",    tier: 1, cost: 40,  name: "SLASH +1 dmg",               desc: "SLASH win deals +1 damage permanently." },
  { key: "combat_t2",     branch: "combat",    tier: 2, cost: 100, name: "Combo @ 2",                  desc: "Combo bonus triggers at 2 wins (was 3)." },
  { key: "combat_t3",     branch: "combat",    tier: 3, cost: 250, name: "Counter loss -2",            desc: "COUNTER loss penalty -2 (player takes +1 instead of +3)." },
  // Abilities branch -- energy & ult
  { key: "abilities_t1",  branch: "abilities", tier: 1, cost: 40,  name: "Wild Strike 30e",            desc: "Wild Strike costs 30 energy (was 40)." },
  { key: "abilities_t2",  branch: "abilities", tier: 2, cost: 100, name: "Start +20 energy",           desc: "Start every battle with 20 energy." },
  { key: "abilities_t3",  branch: "abilities", tier: 3, cost: 250, name: "Ult -10e",                   desc: "All weapon Ultimate costs reduced by 10 energy." },
];

/** Empty forge map -- all 12 nodes locked. */
function emptyForge() {
  const out = {};
  for (const node of FORGE_NODES) out[node.key] = false;
  return out;
}

/**
 * Default meta -- used on first boot or if localStorage parse fails.
 * Wallet is null so the lobby falls back to "Connect Wallet" UI.
 */
function defaultMeta() {
  return {
    wallet: null,
    shards: 0,
    forge: emptyForge(),
    ascension: 0,
    ch1Cleared: false,
    // P4: list of weapon ids the player has permanently unlocked. Sword is
    // the free starter. Others (axe/spear/staff) get added here when the
    // player pays the shard cost in Weapon Select.
    weaponsUnlocked: ["sword"],
  };
}

/**
 * Load meta from localStorage. If anything is malformed, log + return default.
 * Merges with defaultMeta() so new fields added in future versions don't crash
 * users on old saves.
 */
function loadMeta() {
  if (typeof localStorage === "undefined") return defaultMeta();
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return defaultMeta();
    const parsed = JSON.parse(raw);
    const base = defaultMeta();
    const merged = { ...base, ...parsed };
    // Ensure forge map has every current node key (handles new nodes added later)
    merged.forge = { ...emptyForge(), ...(parsed.forge || {}) };
    // Clamp ascension into valid range
    merged.ascension = Math.max(0, Math.min(5, Number(merged.ascension) || 0));
    merged.shards = Math.max(0, Math.floor(Number(merged.shards) || 0));
    merged.ch1Cleared = Boolean(merged.ch1Cleared);
    // P4: ensure weaponsUnlocked is a clean array w/ sword guaranteed.
    // Old saves (pre-P4) won't have this field -- default to sword only.
    const allowedWeapons = ["sword", "spear", "axe", "staff"];
    const rawList = Array.isArray(parsed.weaponsUnlocked) ? parsed.weaponsUnlocked : ["sword"];
    const cleaned = rawList.filter((w) => allowedWeapons.includes(w));
    if (!cleaned.includes("sword")) cleaned.unshift("sword");
    merged.weaponsUnlocked = [...new Set(cleaned)];
    return merged;
  } catch (err) {
    console.warn("[store] meta load failed, using default:", err);
    return defaultMeta();
  }
}

/**
 * Persist meta to localStorage. Best-effort -- failures (quota, private mode)
 * are warned, not thrown, so the game keeps running in-memory.
 */
function saveMeta(meta) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch (err) {
    console.warn("[store] meta save failed:", err);
  }
}

const listeners = new Set();

const state = {
  scene: "splash",
  run: null,
  meta: loadMeta(),
};

export function getState() {
  return state;
}

/**
 * setState merges `patch` into state and notifies listeners. If `patch.meta`
 * is present, the new meta is persisted to localStorage automatically.
 */
export function setState(patch) {
  const metaChanged = patch && Object.prototype.hasOwnProperty.call(patch, "meta");
  Object.assign(state, patch);
  if (metaChanged) saveMeta(state.meta);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Convenience: reset meta back to default and persist. Useful for "Reset
 * progress" debug button (not yet exposed in UI, but referenced in tests).
 */
export function resetMeta() {
  setState({ meta: defaultMeta() });
}
