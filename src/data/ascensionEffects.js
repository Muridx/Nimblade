// src/data/ascensionEffects.js
//
// Bible v3.0 §10 — Ascension system.
//
// Symmetric HP×DMG multiplier per level. No other modifiers.
// Replaces the old cumulative-piecemeal system (elite spawn, HP penalty,
// honesty reduction) with a single clean multiplier.
//
//   Asc 0: 1.00x HP / 1.00x DMG  (default)
//   Asc 1: 1.10x HP / 1.10x DMG
//   Asc 2: 1.20x HP / 1.20x DMG
//   Asc 3: 1.35x HP / 1.35x DMG
//   Asc 4: 1.50x HP / 1.50x DMG
//   Asc 5: 1.70x HP / 1.70x DMG
//
// Unlock rules (§10.2):
//   Asc 0 = always available.
//   Asc N+1 unlocks after completing a CH3 full clear at Asc N.
//   Persists in meta.ascension.
//
// Shard payout multiplier uses the same values (handled by runHelpers.js).

export const ASCENSION_LEVELS = [
  {
    level: 0,
    name: "Standard",
    hpMult: 1.0,
    dmgMult: 1.0,
    shardMult: 1.0,
    summary: "Default difficulty. No modifiers.",
    effectLines: [],
  },
  {
    level: 1,
    name: "Ascension 1",
    hpMult: 1.1,
    dmgMult: 1.1,
    shardMult: 1.1,
    summary: "Monsters are tougher and hit harder.",
    effectLines: ["Monster HP ×1.10", "Monster DMG ×1.10"],
  },
  {
    level: 2,
    name: "Ascension 2",
    hpMult: 1.2,
    dmgMult: 1.2,
    shardMult: 1.2,
    summary: "Monsters grow significantly stronger.",
    effectLines: ["Monster HP ×1.20", "Monster DMG ×1.20"],
  },
  {
    level: 3,
    name: "Ascension 3",
    hpMult: 1.35,
    dmgMult: 1.35,
    shardMult: 1.35,
    summary: "Prepare for a real challenge.",
    effectLines: ["Monster HP ×1.35", "Monster DMG ×1.35"],
  },
  {
    level: 4,
    name: "Ascension 4",
    hpMult: 1.5,
    dmgMult: 1.5,
    shardMult: 1.5,
    summary: "Only the skilled survive.",
    effectLines: ["Monster HP ×1.50", "Monster DMG ×1.50"],
  },
  {
    level: 5,
    name: "Ascension 5",
    hpMult: 1.7,
    dmgMult: 1.7,
    shardMult: 1.7,
    summary: "God-run territory. ~1:1000 odds.",
    effectLines: ["Monster HP ×1.70", "Monster DMG ×1.70"],
  },
];

/** Clamp ascension input to [0, 5]. */
export function clampAsc(lvl) {
  const n = Number(lvl) || 0;
  return Math.max(0, Math.min(5, Math.floor(n)));
}

/**
 * Patch an enemyDef in-flight to reflect ascension difficulty.
 * Returns a SHALLOW-CLONED copy so we never mutate monsters.json data.
 *
 * Bible v3.0 §10: symmetric HP×DMG mult. No honesty changes, no boss-specific
 * bonuses — just straight multiplication.
 *
 * @param {object}  enemyDef  — monster definition from monsters.json
 * @param {number}  ascLevel  — 0..5
 * @param {boolean} _isBoss   — unused (kept for API compat, may be used later)
 */
export function applyAscensionToEnemy(enemyDef, ascLevel, _isBoss) {
  const asc = clampAsc(ascLevel);
  if (asc <= 0) return enemyDef;
  const lvl = ASCENSION_LEVELS[asc];
  const patched = { ...enemyDef };
  patched.hp = Math.max(1, Math.round((enemyDef.hp || 1) * lvl.hpMult));
  patched.dmg = Math.max(1, Math.round((enemyDef.dmg || 1) * lvl.dmgMult));
  return patched;
}

/**
 * Starting max HP penalty from ascension.
 * Bible v3.0 has NO ascension HP penalty — returns 0 always.
 * Kept for lobby.js backward compatibility; will be cleaned up in lobby.js update.
 */
export function ascensionMaxHpPenalty(_ascLevel) {
  return 0;
}

/** Console-log / UI helper — returns effectLines for the given level. */
export function describeAscensionRunEffects(ascLevel) {
  const lvl = clampAsc(ascLevel);
  if (lvl === 0) return [];
  return ASCENSION_LEVELS[lvl].effectLines.slice();
}
