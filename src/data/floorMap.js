/**
 * NIMBLADE -- floor-node routing
 *
 * 2.7b: each floor in a chapter is one of:
 *   "normal"   -> normal battle (gold-only reward)
 *   "elite"    -> elite battle (3-pick relic reward, 60c/40r)
 *   "boss"     -> boss battle (auto-1 relic reward, 60r/40e), run complete
 *   "campfire" -> heal vs smoke gamble
 *   "shop"     -> 3 commons for sale
 *   "treasure" -> free common from chest
 *
 * CH1 fixed layout (Design Doc v1.1 + 2.7b plan):
 *   F1-3 normal, F4 campfire, F5 shop, F6 treasure,
 *   F7 elite, F8 campfire, F9 boss
 *
 * CH2/CH3 placeholders for now (deferred to post-demo).
 */
export const NODE_LAYOUTS = {
  CH1: ["normal", "normal", "normal", "campfire", "shop", "treasure", "elite", "campfire", "boss"],
  // CH2/CH3 default to all-normal until designed.
};

export function nodeTypeFor(chapter, floor) {
  const layout = NODE_LAYOUTS[(chapter || "CH1").toUpperCase()] || NODE_LAYOUTS.CH1;
  const idx = Math.max(0, Math.min(layout.length - 1, (floor || 1) - 1));
  return layout[idx];
}

// Map a node type to the scene that handles it.
// Battles (normal/elite/boss) all use the same battle.js scene,
// it switches enemy pool + reward distribution based on nodeType internally.
export function sceneForNodeType(nodeType) {
  if (nodeType === "normal" || nodeType === "elite" || nodeType === "boss") return "battle";
  return nodeType; // "campfire" / "shop" / "treasure"
}

// Helper: route the player from a finished node to the next floor's scene.
// Mutates run.floor +1 (if not final) and mounts the correct scene.
// If we're at the last floor and it was a boss, caller marks run.completed.
export function routeAfterFloor(currentFloor, floorMax, mountFn) {
  const nextFloor = currentFloor + 1;
  if (nextFloor > floorMax) {
    mountFn("lobby"); // safety fallback
    return null;
  }
  const nodeType = nodeTypeFor("CH1", nextFloor);
  const scene = sceneForNodeType(nodeType);
  mountFn(scene);
  return { nextFloor, nodeType, scene };
}
