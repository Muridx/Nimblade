// src/data/mapGen.js
// 2.7d M1 -- Proc-gen branching map for NIMBLADE CH1.
//
// Generates a 9-floor StS-style graph each run:
//   F1 = single START
//   F2-F7 = 3 nodes each (mixed types)
//   F8 = 2 campfire nodes (rest before boss)
//   F9 = single BOSS
//
// Node shape: { id, floor, col, type, edges: [destId, ...] }
// type in: "start" | "normal" | "elite" | "shop" | "campfire" | "treasure" | "boss"
//
// Edge rules:
//   - Source col X can only connect to target col in [X-1, X, X+1] of next floor.
//   - No edge crossing within the same floor pair (visually clean).
//   - Every node on F2+ must have >=1 incoming edge.
//   - F1 start must reach F9 boss via at least 1 path.
//
// Determinism: takes optional seed for repro/testing. Default = Math.random.

const FLOOR_COLS = {
  1: 1, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2, 9: 1,
};

// Pool per floor -- array of 3 type slots (shuffled by gen).
// Some slots are RANDOM picks from a sub-pool for run variance.
function pickFloorTypes(floor, rnd) {
  switch (floor) {
    case 1: return ["start"];
    case 2: return shuffle(["normal", "normal", "normal"], rnd);
    case 3: {
      const wild = pick(["elite", "shop"], rnd);
      return shuffle(["normal", "normal", wild], rnd);
    }
    case 4: return shuffle(["normal", "shop", "campfire"], rnd);
    case 5: {
      const wild = pick(["shop", "campfire"], rnd);
      return shuffle(["normal", "treasure", wild], rnd);
    }
    case 6: {
      const wild = pick(["campfire", "shop"], rnd);
      return shuffle(["normal", "elite", wild], rnd);
    }
    case 7: {
      const wild = pick(["treasure", "normal"], rnd);
      return shuffle(["elite", "elite", wild], rnd);
    }
    case 8: return ["campfire", "campfire"];
    case 9: return ["boss"];
    default: return [];
  }
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
  const dstCols = FLOOR_COLS[dstNodes[0].floor];
  const srcCols = FLOOR_COLS[srcNodes[0].floor];
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
  const srcMaxCol = FLOOR_COLS[src.floor] - 1;
  const dstMaxCol = FLOOR_COLS[dstNodes[0].floor] - 1;
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
  const srcMaxCol = FLOOR_COLS[srcNodes[0].floor] - 1;
  const dstMaxCol = FLOOR_COLS[dst.floor] - 1;
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

function buildOneMap(rnd) {
  const nodes = [];
  const nodesByFloor = {};

  for (let floor = 1; floor <= 9; floor++) {
    const types = pickFloorTypes(floor, rnd);
    const floorNodes = types.map((type, col) => ({
      id: `f${floor}_c${col}`,
      floor,
      col,
      type,
      edges: [],
    }));
    floorNodes.forEach((n) => nodes.push(n));
    nodesByFloor[floor] = floorNodes;
  }

  for (let floor = 1; floor <= 8; floor++) {
    genEdgesBetween(nodesByFloor[floor], nodesByFloor[floor + 1], rnd);
  }

  return nodes;
}

/**
 * generateMap -- main entry.
 * Returns { nodes, startId, bossId } or throws if no valid map after 20 retries.
 */
export function generateMap(seed) {
  const rnd = seed != null ? mulberry32(seed) : Math.random;

  for (let attempt = 0; attempt < 20; attempt++) {
    const nodes = buildOneMap(rnd);
    if (reachableToBoss(nodes)) {
      const start = nodes.find((n) => n.type === "start");
      const boss = nodes.find((n) => n.type === "boss");
      return {
        nodes,
        startId: start.id,
        bossId: boss.id,
      };
    }
  }
  // Failsafe: should never hit with our gen rules, but log if so.
  console.warn("[mapGen] failed to generate reachable map after 20 attempts");
  const nodes = buildOneMap(rnd);
  return {
    nodes,
    startId: nodes.find((n) => n.type === "start").id,
    bossId: nodes.find((n) => n.type === "boss").id,
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
    campfire: "[F]", treasure: "[?]", boss: "[B]",
  };
  console.log("[map] CH1 graph (F9 top -> F1 bottom):");
  for (let f = 9; f >= 1; f--) {
    const row = map.nodes.filter((n) => n.floor === f);
    const maxCols = 3;
    const pad = "  ".repeat(maxCols - row.length); // visual centering
    const line = row.map((n) => TYPE_GLYPH[n.type] || "[?]").join(" ");
    console.log(`F${f}: ${pad}${line}`);
  }
  console.log("\n[map] Edges:");
  for (const n of map.nodes) {
    if (n.edges.length === 0) continue;
    console.log(`  ${n.id}(${n.type}) -> ${n.edges.join(", ")}`);
  }
}
