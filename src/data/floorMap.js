/**
 * NIMBLADE -- floor-node routing
 *
 * 2.7b: each floor in a chapter is one of:
 *   "normal"         -> normal battle (gold-only reward)
 *   "elite"          -> elite battle (3-pick relic reward, 60c/40r)
 *   "boss"           -> boss battle (auto-1 relic reward, 60r/40e), run complete
 *   "campfire"       -> heal vs smoke gamble
 *   "shop"           -> 3 commons for sale
 *   "treasure"       -> free common from chest
 *   "mystery"        -> random event (§8)
 *   "crystal_shrine" -> spend gold for buffs (CH2 F7, §6.6)
 *   "blood_altar"    -> sacrifice HP for buffs (CH3 F7, §6.7)
 *   "miniboss"       -> miniboss battle (epic relic reward)
 *
 * v3.0 R0: Populate CH2 (11 floors) + CH3 (13 floors) per Bible §5.2.
 *
 * CH1 — Goblin Cave (9 floors):
 *   F1-3 normal, F4 campfire, F5 shop, F6 treasure,
 *   F7 elite, F8 campfire, F9 boss
 *
 * CH2 — Frozen Mine (11 floors):
 *   F1-3 normal, F4 campfire, F5 shop, F6 treasure,
 *   F7 crystal_shrine, F8 elite, F9 mystery, F10 miniboss, F11 boss
 *
 * CH3 — Dracula's Castle (13 floors):
 *   F1-3 normal, F4 campfire, F5 shop, F6 normal,
 *   F7 blood_altar, F8 elite, F9 treasure, F10 mystery,
 *   F11 campfire, F12 miniboss, F13 boss
 */
export const NODE_LAYOUTS = {
  CH1: ["normal", "normal", "normal", "campfire", "shop", "treasure", "elite", "campfire", "boss"],
  CH2: ["normal", "normal", "normal", "campfire", "shop", "treasure", "crystal_shrine", "elite", "mystery", "miniboss", "boss"],
  CH3: ["normal", "normal", "normal", "campfire", "shop", "normal", "blood_altar", "elite", "treasure", "mystery", "campfire", "miniboss", "boss"],
};

export function nodeTypeFor(chapter, floor) {
  const layout = NODE_LAYOUTS[(chapter || "CH1").toUpperCase()] || NODE_LAYOUTS.CH1;
  const idx = Math.max(0, Math.min(layout.length - 1, (floor || 1) - 1));
  return layout[idx];
}

// Map a node type to the scene that handles it.
// Battles (normal/elite/boss/miniboss) all use the same battle.js scene,
// it switches enemy pool + reward distribution based on nodeType internally.
export function sceneForNodeType(nodeType) {
  if (nodeType === "normal" || nodeType === "elite" || nodeType === "boss" || nodeType === "miniboss") return "battle";
  return nodeType; // "campfire" / "shop" / "treasure" / "mystery" / "crystal_shrine" / "blood_altar"
}

// Helper: route the player from a finished node to the next floor's scene.
// Mutates run.floor +1 (if not final) and mounts the correct scene.
// If we're at the last floor and it was a boss, caller marks run.completed.
// v3.0: chapter-aware (uses run.chapter instead of hardcoded CH1).
export function routeAfterFloor(currentFloor, floorMax, mountFn, chapter) {
  const nextFloor = currentFloor + 1;
  if (nextFloor > floorMax) {
    mountFn("lobby"); // safety fallback
    return null;
  }
  const ch = (chapter || "CH1").toUpperCase();
  const nodeType = nodeTypeFor(ch, nextFloor);
  const scene = sceneForNodeType(nodeType);
  mountFn(scene);
  return { nextFloor, nodeType, scene };
}
