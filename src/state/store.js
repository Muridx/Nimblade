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
  *   gold: number,           // accumulated gold this run
  *   relics: [relicId, ...], // owned relics (effects engine in 2.7c)
  *   playerHp: number,       // carryover HP between battles
  *   playerMaxHp: number,    // max HP (can be modified by relics later)
  *   sharpenStones: number,  // NIM-purchased SLASH+COUNTER buffs (Step 2.9)
  *   // 2.7a-patch carry-over (persist between floors, reset on new run):
  *   energy: number,         // current energy / ULT charge
  *   momentumStacks: number, // sword passive stacks
  *   berserkTurns: number,   // axe ULT remaining duration
  *   readUses: number,       // STUDY action uses remaining this run (start 3)
  * }
  */
const listeners = new Set();

const state = {
  scene: "splash",
  run: null,
  meta: {
    wallet: null,
  },
};

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
