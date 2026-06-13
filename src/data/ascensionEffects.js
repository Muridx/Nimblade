// src/data/ascensionEffects.js
//
// M6: Ascension system -- per design doc Section 7.4 + 8.5.
//
// Ascension is the post-game difficulty knob. Unlocked once the player beats
// the Ch1 boss for the first time (meta.ch1Cleared). Levels 0-5, cumulative
// effects, with a shard payout multiplier on top (handled by runHelpers.js
// payoutShards via ASCENSION_MULT).
//
// Effects (cumulative, each level ADDS to all lower):
//   Asc 1 -- Enemy dmg +10%
//   Asc 2 -- Elite spawn rate +50% (extra elite injected into the map)
//   Asc 3 -- Player starts with -10 max HP
//   Asc 4 -- Intent honesty -10% across all chapters
//   Asc 5 -- Ch1 boss extra phase: +30% HP and starts ENRAGED-prone
//           (v1 placeholder for the "extra phase mechanic" line in the doc)
//
// Shard multiplier (applied separately in runHelpers.payoutShards):
//   Asc 1=x1.10 / Asc 2=x1.20 / Asc 3=x1.35 / Asc 4=x1.50 / Asc 5=x1.70

export const ASCENSION_LEVELS = [
  {
    level: 0,
    name: "Standard",
    shardMult: 1.0,
    summary: "Default difficulty. No modifiers.",
    effectLines: [],
  },
  {
    level: 1,
    name: "Ascension 1",
    shardMult: 1.10,
    summary: "Enemies hit harder.",
    effectLines: ["Enemy damage +10%"],
  },
  {
    level: 2,
    name: "Ascension 2",
    shardMult: 1.20,
    summary: "More elite encounters per run.",
    effectLines: ["Enemy damage +10%", "Elite spawn rate +50%"],
  },
  {
    level: 3,
    name: "Ascension 3",
    shardMult: 1.35,
    summary: "Less HP to work with.",
    effectLines: [
      "Enemy damage +10%",
      "Elite spawn rate +50%",
      "Starting max HP -10",
    ],
  },
  {
    level: 4,
    name: "Ascension 4",
    shardMult: 1.50,
    summary: "Enemies feint more often.",
    effectLines: [
      "Enemy damage +10%",
      "Elite spawn rate +50%",
      "Starting max HP -10",
      "Intent honesty -10% (all chapters)",
    ],
  },
  {
    level: 5,
    name: "Ascension 5",
    shardMult: 1.70,
    summary: "Boss becomes a true endgame fight.",
    effectLines: [
      "Enemy damage +10%",
      "Elite spawn rate +50%",
      "Starting max HP -10",
      "Intent honesty -10%",
      "Boss HP +30%",
    ],
  },
];

/** Clamp ascension input to [0, 5]. */
export function clampAsc(lvl) {
  const n = Number(lvl) || 0;
  return Math.max(0, Math.min(5, Math.floor(n)));
}

/** Asc 3+ -- starting max HP penalty (returns POSITIVE number to subtract). */
export function ascensionMaxHpPenalty(ascLevel) {
  return clampAsc(ascLevel) >= 3 ? 10 : 0;
}

/** Asc 2+ -- elite spawn rate buff is applied inside mapGen.js. */
export function ascensionElitesBoosted(ascLevel) {
  return clampAsc(ascLevel) >= 2;
}

/**
 * Patch an enemyDef in-flight to reflect ascension difficulty.
 * Returns a SHALLOW-CLONED copy so we never mutate monsters.json data.
 *
 *   Asc 1+ -> enemyDef.dmg x1.10 (rounded)
 *   Asc 4+ -> enemyDef.honest_pct -10 (clamped to >=0)
 *   Asc 5 + isBoss -> enemyDef.hp x1.30 (rounded)
 */
export function applyAscensionToEnemy(enemyDef, ascLevel, isBoss) {
  const asc = clampAsc(ascLevel);
  if (asc <= 0) return enemyDef;
  const patched = { ...enemyDef };
  if (asc >= 1) {
    patched.dmg = Math.max(1, Math.round((enemyDef.dmg || 1) * 1.10));
  }
  if (asc >= 4) {
    const base = (typeof enemyDef.honest_pct === "number") ? enemyDef.honest_pct : 100;
    patched.honest_pct = Math.max(0, base - 10);
  }
  if (asc >= 5 && isBoss) {
    patched.hp = Math.max(1, Math.round((enemyDef.hp || 1) * 1.30));
  }
  return patched;
}

/** Console-log helper -- mirrors describeRunInitEffects(meta) for parity. */
export function describeAscensionRunEffects(ascLevel) {
  const lvl = clampAsc(ascLevel);
  if (lvl === 0) return [];
  return ASCENSION_LEVELS[lvl].effectLines.slice();
}
