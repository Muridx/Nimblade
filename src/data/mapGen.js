// src/data/mapGen.js
// 2.7d M1 -- Proc-gen branching map for NIMBLADE.
// v3.0 R7 (M2a) -- now CHAPTER-AWARE.
//
// CH1 (unchanged): hand-tuned 9-floor StS-style graph via pickFloorTypes().
//   F1 = single START, F2-F7 = 3 nodes each (mixed types),
//   F8 = 2 campfire nodes, F9 = single BOSS.
//
// CH2 / CH3 (NEW): generated from floorMap.js NODE_LAYOUTS so the encounter
//   sequence matches Bible Section 5.2 exactly (no economy drift):
//   - F1 is always a single START node (shadows layout[0]).
//   - Floors typed "normal" / "elite" are widened to 3 parallel nodes
//     (branching SHAPE + path choice) -- the player still traverses exactly ONE
//     per floor, so the encounter economy is identical to the linear layout.
//   - Curated single-stop floors (shop / campfire / treasure / mystery /
//     crystal_shrine / blood_altar / miniboss / boss) stay 1 node = everyone
//     hits the same mandatory stop.
//   CH2 = 11 floors (F7 crystal_shrine, F10 miniboss, F11 boss).
//   CH3 = 13 floors (F7 blood_altar, F12 miniboss, F13 boss).
//
// Node shape: { id, floor, col, colCount, type, edges: [destId, ...] }
// type in: "start" | "normal" | "elite" | "shop" | "campfire" | "treasure" |
//          "mystery" | "crystal_shrine" | "blood_altar" | "miniboss" | "boss"
//
// Edge rules:
//   - Source col X can only connect to a target col within +/-1 of X (scaled by
//     each floor's node count).
//   - No edge crossing within the same floor pair (visually clean).
//   - Every node on F2+ must have >=1 incoming edge.
//   - F1 start must reach the final BOSS via at least 1 path.
//
// Determinism: takes optional seed for repro/testing. Default = rngNext.

import { NODE_LAYOUTS } from "./floorMap.js";
import { next as rngNext } from "./rng.js";

const FLOOR_COLS = {
  1: 1, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2, 9: 1,
};

// CH2/CH3: which node types get widened into a branching (multi-node) floor.
const BRANCH_TYPES = new Set(["normal", "elite"]);
const BRANCH_WIDTH = 3;

// Pool per floor -- array of 3 type slots (shuffled by gen). CH1 ONLY.
// Some slots are RANDOM picks from a sub-pool for run variance.
function pickFloorTypes(floor, rnd) {
  switch (floor) {
    case 1: return ["start"];
    case 2: return shuffle(["normal", "normal", "normal"], rnd);
    case 3: {
      const wild = pick(["elite", "shop"], rnd);
      return shuffle(["normal", "normal", wild], rnd);
    }
    case 4: {
      // M9: mystery placement per design doc Section 6.3. Floor 4 swaps the
      // campfire slot for a mystery/campfire pick (50/50) so the player gets
      // an extra "gamble" decision early in the run.
      const wild = pick(["mystery", "campfire"], rnd);
      return shuffle(["normal", "shop", wild], rnd);
    }
    case 5: {
      const wild = pick(["shop", "campfire"], rnd);
      return shuffle(["normal", "treasure", wild], rnd);
    }
    case 6: {
      const wild = pick(["campfire", "shop"], rnd);
      return shuffle(["normal", "elite", wild], rnd);
    }
    case 7: {
      // M9: mystery/elite choice per design Section 6.3 -- floor 7 gives a 3-way
      // wild slot (mystery|treasure|normal) on top of the 2 guaranteed elites.
      const wild = pick(["mystery", "treasure", "normal"], rnd);
      return shuffle(["elite", "elite", wild], rnd);
    }
    case 8: return ["campfire", "campfire"];
    case 9: return ["boss"];
    default: return [];
  }
}

// CH2/CH3: derive each floor's node-type slots from NODE_LAYOUTS.
// Returns an array indexed by (floor-1); each entry is an array of type strings.
function pickChapterFloorTypes(chapter, ascLevel) {
  const layout = NODE_LAYOUTS[(chapter || "CH1").toUpperCase()] || NODE_LAYOUTS.CH1;
  const floors = [];
  for (let f = 1; f <= layout.length; f++) {
    if (f === 1) {
      // F1 is always START (shadows layout[0], same convention as CH1).
      floors.push(["start"]);
      continue;
    }
    const base = layout[f - 1];
    const width = BRANCH_TYPES.has(base) ? BRANCH_WIDTH : 1;
    floors.push(Array.from({ length: width }, () => base));
  }
  // Asc 2+: elite spawn rate boost -- convert the middle slot of the LAST
  // "normal" branching floor into an elite (mirrors CH1 asc>=2 behavior).
  const asc = Math.max(0, Math.min(5, Number(ascLevel) || 0));
  if (asc >= 2) {
    for (let i = floors.length - 1; i >= 1; i--) {
      if (floors[i].length === BRANCH_WIDTH && floors[i][0] === "normal") {
        floors[i][Math.floor(BRANCH_WIDTH / 2)] = "elite";
        break;
      }
    }
  }
  return floors;
}

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

// Generate edges from floor N -> floor N+1.
// Each source node picks 1-2 valid targets (col diff <= 1, no cross with sibling edges).
function genEdgesBetween(srcNodes, dstNodes, rnd) {
  const edges = []; // { srcCol, dstCol }

  // First pass: each source picks 1 target (mandatory) -- ensures every src has outgoing.
  for (const src of srcNodes) {
    const target = pickTarget(src, dstNodes, edges, rnd);
    if (target) {
      edges.push({ srcCol: src.col, dstCol: target.col });
      src.edges.push(target.id);
    }
  }

  // Second pass: ~50% chance each src adds a 2nd edge (if no-cross & col-range allow).
  for (const src of srcNodes) {
    if (rnd() < 0.5) {
      const target = pickTarget(src, dstNodes, edges, rnd, src.edges);
      if (target) {
        edges.push({ srcCol: src.col, dstCol: target.col });
        src.edges.push(target.id);
      }
    }
  }

  // Third pass: ensure every dst has >=1 incoming. If not, add edge from nearest src.
  for (const dst of dstNodes) {
    const hasIncoming = srcNodes.some((s) => s.edges.includes(dst.id));
    if (!hasIncoming) {
      const bestSrc = nearestSrcForDst(dst, srcNodes, edges);
      if (bestSrc) {
        edges.push({ srcCol: bestSrc.col, dstCol: dst.col });
        bestSrc.edges.push(dst.id);
      }
    }
  }
}

function pickTarget(src, dstNodes, existingEdges, rnd, excludeIds = []) {
  // Map src col to dst col-space (since floors can have different col counts).
  const srcMaxCol = (src.colCount || 1) - 1;
  const dstMaxCol = (dstNodes[0].colCount || 1) - 1;
  const srcColScaled = srcMaxCol === 0 ? dstMaxCol / 2 : (src.col / srcMaxCol) * dstMaxCol;

  const candidates = dstNodes.filter((dst) => {
    if (excludeIds.includes(dst.id)) return false;
    // Col range: dst col within rounded scaledSrcCol +/- 1.
    if (Math.abs(dst.col - srcColScaled) > 1.01) return false;
    // No-cross: check against existing edges from same src floor.
    return !wouldCross(src.col, dst.col, existingEdges);
  });

  if (candidates.length === 0) return null;
  return candidates[Math.floor(rnd() * candidates.length)];
}

function wouldCross(srcCol, dstCol, existingEdges) {
  // Edge A->B crosses C->D if (A<C && B>D) || (A>C && B<D)
  return existingEdges.some((e) => {
    if (e.srcCol === srcCol && e.dstCol === dstCol) return false; // dupe, not cross
    return (srcCol < e.srcCol && dstCol > e.dstCol) ||
           (srcCol > e.srcCol && dstCol < e.dstCol);
  });
}

function nearestSrcForDst(dst, srcNodes, existingEdges) {
  const srcMaxCol = (srcNodes[0].colCount || 1) - 1;
  const dstMaxCol = (dst.colCount || 1) - 1;
  const sorted = srcNodes.slice().sort((a, b) => {
    const aCol = srcMaxCol === 0 ? dstMaxCol / 2 : (a.col / srcMaxCol) * dstMaxCol;
    const bCol = srcMaxCol === 0 ? dstMaxCol / 2 : (b.col / srcMaxCol) * dstMaxCol;
    return Math.abs(aCol - dst.col) - Math.abs(bCol - dst.col);
  });
  for (const src of sorted) {
    if (!wouldCross(src.col, dst.col, existingEdges)) return src;
  }
  return sorted[0]; // fallback: accept cross if no clean option
}

// BFS reachability: start -> boss.
function reachableToBoss(nodes) {
  const start = nodes.find((n) => n.type === "start");
  const boss = nodes.find((n) => n.type === "boss");
  if (!start || !boss) return false;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const seen = new Set([start.id]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    if (cur.id === boss.id) return true;
    for (const eId of cur.edges) {
      if (!seen.has(eId)) { seen.add(eId); q.push(byId[eId]); }
    }
  }
  return false;
}

// Shared: turn a per-floor array of type-slots into a connected node graph.
function buildFromFloorTypes(floorTypeRows, rnd) {
  const nodes = [];
  const nodesByFloor = {};
  const floorCount = floorTypeRows.length;

  for (let floor = 1; floor <= floorCount; floor++) {
    const types = floorTypeRows[floor - 1] || [];
    const floorNodes = types.map((type, col) => ({
      id: `f${floor}_c${col}`,
      floor,
      col,
      colCount: types.length,
      type,
      edges: [],
    }));
    floorNodes.forEach((n) => nodes.push(n));
    nodesByFloor[floor] = floorNodes;
  }

  for (let floor = 1; floor < floorCount; floor++) {
    genEdgesBetween(nodesByFloor[floor], nodesByFloor[floor + 1], rnd);
  }

  return nodes;
}

// CH1 builder -- hand-tuned 9-floor layout (unchanged behavior).
function buildOneMap(rnd, ascLevel) {
  const asc = Math.max(0, Math.min(5, Number(ascLevel) || 0));
  const floorTypeRows = [];
  for (let floor = 1; floor <= 9; floor++) {
    let types = pickFloorTypes(floor, rnd);
    // M6 (Asc 2+): elite spawn rate +50%. Inject ONE extra guaranteed elite by
    // swapping a "normal" slot for "elite" on floor 4 (normally zero elites).
    if (asc >= 2 && floor === 4) {
      const idx = types.indexOf("normal");
      if (idx !== -1) {
        types = types.slice();
        types[idx] = "elite";
      }
    }
    floorTypeRows.push(types);
  }
  return buildFromFloorTypes(floorTypeRows, rnd);
}

// CH2/CH3 builder -- NODE_LAYOUTS-driven, branching normal/elite floors.
function buildChapterMap(chapter, rnd, ascLevel) {
  const floorTypeRows = pickChapterFloorTypes(chapter, ascLevel);
  return buildFromFloorTypes(floorTypeRows, rnd);
}

/**
 * generateMap -- main entry.
 * @param {number} [seed]      optional seed for deterministic gen.
 * @param {number} [ascLevel]  ascension level (0-5).
 * @param {string} [chapter]   "CH1" (default) | "CH2" | "CH3".
 * Returns { nodes, startId, bossId, chapter } or a failsafe map after 20 retries.
 */
export function generateMap(seed, ascLevel, chapter) {
  const rnd = seed != null ? mulberry32(seed) : rngNext;
  const ch = (chapter || "CH1").toUpperCase();
  const build = ch === "CH1"
    ? () => buildOneMap(rnd, ascLevel)
    : () => buildChapterMap(ch, rnd, ascLevel);

  for (let attempt = 0; attempt < 20; attempt++) {
    const nodes = build();
    if (reachableToBoss(nodes)) {
      const start = nodes.find((n) => n.type === "start");
      const boss = nodes.find((n) => n.type === "boss");
      return {
        nodes,
        startId: start.id,
        bossId: boss.id,
        chapter: ch,
      };
    }
  }
  // Failsafe: should never hit with our gen rules, but log if so.
  console.warn(`[mapGen] failed to generate reachable ${ch} map after 20 attempts`);
  const nodes = build();
  return {
    nodes,
    startId: nodes.find((n) => n.type === "start").id,
    bossId: nodes.find((n) => n.type === "boss").id,
    chapter: ch,
  };
}

// Simple seeded RNG -- mulberry32 (for deterministic testing).
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * printMapAscii -- cheat helper. Prints map to console as ASCII.
 */
export function printMapAscii(map) {
  if (!map || !map.nodes) {
    console.log("[map] no map");
    return;
  }
  const TYPE_GLYPH = {
    start: "[S]", normal: "[N]", elite: "[E]", shop: "[$]",
    campfire: "[F]", treasure: "[T]", mystery: "[?]",
    crystal_shrine: "[C]", blood_altar: "[A]", miniboss: "[M]", boss: "[B]",
  };
  const maxFloor = map.nodes.reduce((m, n) => Math.max(m, n.floor), 0);
  console.log(`[map] ${map.chapter || "CH1"} graph (F${maxFloor} top -> F1 bottom):`);
  for (let f = maxFloor; f >= 1; f--) {
    const row = map.nodes.filter((n) => n.floor === f).sort((a, b) => a.col - b.col);
    const line = row.map((n) => TYPE_GLYPH[n.type] || "[?]").join(" ");
    console.log(`F${f}: ${line}`);
  }
  console.log("\n[map] Edges:");
  for (const n of map.nodes) {
    if (n.edges.length === 0) continue;
    console.log(`  ${n.id}(${n.type}) -> ${n.edges.join(", ")}`);
  }
}
