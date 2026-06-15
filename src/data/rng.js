/**
 * NIMBLADE — Seeded PRNG module (xoshiro128**)
 *
 * v3.0 Phase A: Create deterministic RNG for anti-cheat / replay.
 *
 * Exports:
 *   seed(s)            — seed the PRNG with a 32-bit integer (or auto-generate)
 *   next()             — returns next float in [0, 1) (replaces Math.random())
 *   nextInt(min, max)  — returns integer in [min, max] inclusive
 *   nextFloat()        — alias for next()
 *   getSeed()          — returns the initial seed value (for storing in run.seed)
 *
 * Usage:
 *   import { seed, next, nextInt, nextFloat, getSeed } from "./rng.js";
 *   seed(12345);           // or seed() for auto
 *   const roll = next();   // 0..1
 *   const dmg = nextInt(5, 10); // 5..10
 *
 * Phase B will migrate Math.random() → next() across all game files.
 * Phase C adds server-side seed replay verification.
 */

// Internal state — four 32-bit values for xoshiro128**
let s = new Uint32Array(4);
let _initialSeed = 0;

/**
 * Seed the PRNG. Pass a number or omit for Date.now()-based seed.
 * Uses splitmix32 to expand a single 32-bit seed into 4-word state.
 */
export function seed(val) {
  _initialSeed = val != null ? (val >>> 0) : (Date.now() >>> 0);
  // splitmix32 to fill state from a single seed
  let z = _initialSeed;
  for (let i = 0; i < 4; i++) {
    z += 0x9e3779b9;
    let t = z ^ (z >>> 16);
    t = Math.imul(t, 0x85ebca6b);
    t ^= t >>> 13;
    t = Math.imul(t, 0xc2b2ae35);
    t ^= t >>> 16;
    s[i] = t >>> 0;
  }
  // Ensure state is never all-zero (xoshiro requirement)
  if (s[0] === 0 && s[1] === 0 && s[2] === 0 && s[3] === 0) {
    s[0] = 1;
  }
}

/**
 * Get the initial seed value (for storing in run.seed).
 */
export function getSeed() {
  return _initialSeed;
}

/**
 * xoshiro128** core — returns a 32-bit unsigned integer.
 */
function xoshiro128ss() {
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;

  s[2] ^= s[0];
  s[3] ^= s[1];
  s[1] ^= s[2];
  s[0] ^= s[3];

  s[2] ^= t;
  s[3] = rotl(s[3], 11);

  return result;
}

function rotl(x, k) {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Returns next float in [0, 1). Drop-in replacement for Math.random().
 */
export function next() {
  return (xoshiro128ss() >>> 0) / 4294967296;
}

/**
 * Alias for next().
 */
export function nextFloat() {
  return next();
}

/**
 * Returns a random integer in [min, max] inclusive.
 */
export function nextInt(min, max) {
  return min + Math.floor(next() * (max - min + 1));
}

// Auto-seed on import so the module is always usable
// (new code can call next() immediately; run init will re-seed with run.seed).
seed();
