/**
  * NIMBLADE -- global store (pub/sub)
 */
const listeners = new Set();

const state = {
  scene: "splash",
  run: null,  // { mode: "full" | "demo", weapon: "sword", ... }
  meta: {
    wallet: null,  // { address: string } | null
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