/**
  * NIMBLADE — global store (pub/sub)
  * Single source of truth for scene, run state, meta.
 */
const listeners = new Set();

const state = {
  scene: "splash",
  run: null,
  meta: null,
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