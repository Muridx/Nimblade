// src/scenes/map.js
// 2.7d M2-polish -- Visual map with PNG assets + bezier-curved edges.
//
// Renders the proc-gen graph from run.map as a vertical StS-style map.
// Player starts at run.map.startId. Tap a connected node -> moves player there.
// No actual scene routing yet (battle/shop/etc) -- that's M3.
// On clicking the BOSS node, shows a placeholder modal explaining M3 will hook real scenes.

import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import monstersData from "../data/monsters.json";
import { hasRelic, trailRationsHeal } from "../data/relicEffects.js";

// 2.7d batch4: boss intel text per `special` mechanic id (data-driven).
// When player taps the boss node, the travel-confirm modal shows this so they
// can prep HP / energy / potions before entering. CH2 / CH3 stubs ready for
// future builds.
const BOSS_MECHANIC_TEXT = {
  war_cry: {
    label: "WAR CRY",
    desc: "Every 3rd turn the boss roars (free hit for you, no boss attack). The very next turn he goes ENRAGED -- attacks deal +50% AND his shown intent may LIE (60% honest). Bring HP and energy."
  },
  freeze: {
    label: "FREEZE",
    desc: "The boss can freeze your weapon for a turn, locking you out of your strongest action. Plan around losing a key option."
  },
  dracula_phase2: {
    label: "PHASE 2",
    desc: "At ~50% HP the boss transforms. Damage profile and intent honesty shift mid-fight. Don't run dry on resources before the swap."
  },
};

const TYPE_ICON = {
  start: "/assets/map_node_start.png",
  normal: "/assets/map_node_normal.png",
  elite: "/assets/map_node_elite.png",
  shop: "/assets/map_node_shop.png",
  campfire: "/assets/map_node_campfire.png",
  treasure: "/assets/map_node_treasure.png",
  // M9: mystery reuses the treasure sprite for now -- visual distinction via
  // CSS hue-rotate + "?" badge on the .map__node--mystery class. Murid can
  // drop a dedicated map_node_mystery.png later and we'll just point here.
  mystery: "/assets/map_node_treasure.png",
  // R7 (M2b): no dedicated art yet -- reuse existing sprites; CSS classes
  // .map__node--crystal_shrine / --blood_altar / --miniboss can tint/badge.
  crystal_shrine: "/assets/map_node_treasure.png", // relic shrine -> treasure sprite
  blood_altar: "/assets/map_node_elite.png",       // risky altar -> elite sprite
  miniboss: "/assets/map_node_elite.png",          // tough fight -> elite sprite
  // boss handled separately (per-chapter)
};

const TYPE_LABEL = {
  start: "Start",
  normal: "Battle",
  elite: "Elite",
  shop: "Shop",
  campfire: "Campfire",
  treasure: "Treasure",
  mystery: "Mystery",
  crystal_shrine: "Crystal Shrine",
  blood_altar: "Blood Altar",
  miniboss: "Miniboss",
  boss: "Boss",
};

// Layout constants (mobile-first; container caps at 420px wide).
const FLOOR_GAP = 96;
const NODE_SIZE = 60;
const SVG_TOP_PAD = 48;
const SVG_BOTTOM_PAD = 48;

function iconForNode(node, chapter) {
  if (node.type === "boss") {
    // R7 (M2b): only ch1 boss art exists today. Use it for CH2/CH3 until
    // dedicated map_node_boss_ch2/ch3.png are added, then this picks them up.
    const bossArt = chapter <= 1 ? 1 : 1;
    return `/assets/map_node_boss_ch${bossArt}.png`;
  }
  return TYPE_ICON[node.type] || "/assets/map_node_normal.png";
}

export function mapScene(root) {
  const run = getState().run;
  if (!run || !run.map) {
    root.innerHTML = `<div class="map__error">No active map. Start a new run.</div>`;
    return () => {};
  }

  // Ensure player is somewhere on the map. Default = start.
  if (!run.currentNodeId) {
    run.currentNodeId = run.map.startId;
    run.visitedNodeIds = [run.map.startId];
    setState({ run });
  }

  // run.chapter is a string like "CH1" -- extract numeric for asset filenames.
  const chapterRaw = run.chapter || "CH1";
  const chapter = parseInt(String(chapterRaw).replace(/\D/g, ""), 10) || 1;
  // R7 (M2b): only map_bg_ch1.png exists today -> reuse it for CH2/CH3 until
  // dedicated backgrounds are added (then widen this set).
  const mapBgChapter = [1].includes(chapter) ? chapter : 1;

  // Local UI state -- pending node selection (waiting for player confirmation).
  let pendingNodeId = null;

  const render = () => {
    const map = run.map;
    // R7 (M2b): floor count is chapter-dependent (CH1=9, CH2=11, CH3=13).
    const totalFloors = map.nodes.reduce((mx, n) => Math.max(mx, n.floor), 0)
      || run.floorMax || 9;
    const containerHeight = SVG_TOP_PAD + SVG_BOTTOM_PAD + (totalFloors - 1) * FLOOR_GAP + NODE_SIZE;

    // For each node, compute (xPct, y) in container coords.
    const posMap = {};
    for (const n of map.nodes) {
      posMap[n.id] = nodePos(n, totalFloors);
    }

    // Determine reachable (next-pick) node ids from current node.
    const currentNode = map.nodes.find((nd) => nd.id === run.currentNodeId);
    const reachableIds = new Set(currentNode ? currentNode.edges : []);

    // SVG edges (drawn behind nodes), now curved bezier.
    const edgeSvg = renderEdges(map.nodes, posMap, run, reachableIds, containerHeight);

    // Node DOM.
    const nodesHtml = map.nodes.map((n) => {
      const pos = posMap[n.id];
      const isCurrent = n.id === run.currentNodeId;
      const isVisited = run.visitedNodeIds.includes(n.id);
      const isReachable = reachableIds.has(n.id);
      const isPending = n.id === pendingNodeId;
      let stateClass = isCurrent ? "map__node--current"
        : isReachable ? "map__node--reachable"
        : isVisited ? "map__node--visited"
        : "map__node--dim";
      if (isPending) stateClass += " map__node--pending";
      const label = TYPE_LABEL[n.type] || n.type;
      const action = isReachable ? `data-action="pick" data-node-id="${n.id}"` : "";
      const iconSrc = iconForNode(n, chapter);
      return `
        <button class="map__node map__node--${n.type} ${stateClass}"
          style="left: ${pos.xPct}%; top: ${pos.y}px;"
          ${action}
          aria-label="${label} floor ${n.floor}">
          <img class="map__node-icon" src="${iconSrc}" alt="${label}" draggable="false" />
        </button>`;
    }).join("");

    // Confirm modal (only when pendingNodeId set).
    let confirmHtml = "";
    if (pendingNodeId) {
      const pendNode = map.nodes.find((nd) => nd.id === pendingNodeId);
      if (pendNode) {
        const label = TYPE_LABEL[pendNode.type] || pendNode.type;
        // 2.7d batch4: boss node -> show boss intel (name, HP/DMG, mechanic) BEFORE confirm.
        let bossIntelHtml = "";
        if (pendNode.type === "boss") {
          const chKey = `ch${chapter}`;
          const bossDef = (monstersData[chKey] && monstersData[chKey].boss) || null;
          if (bossDef) {
            const mech = BOSS_MECHANIC_TEXT[bossDef.special];
            const mechBlock = mech ? `
              <div class="map__confirm-mech">
                <div class="map__confirm-mech-label">MECHANIC -- ${mech.label}</div>
                <div class="map__confirm-mech-desc">${mech.desc}</div>
              </div>` : "";
            bossIntelHtml = `
              <div class="map__confirm-boss">
                <div class="map__confirm-boss-name">${bossDef.name}</div>
                <div class="map__confirm-boss-stats">HP ${bossDef.hp} -- DMG ${bossDef.dmg}</div>
                ${mechBlock}
              </div>`;
          }
        }
        confirmHtml = `
          <div class="map__confirm-backdrop" data-action="cancel-travel"></div>
          <div class="map__confirm ${pendNode.type === "boss" ? "map__confirm--boss" : ""}">
            <div class="map__confirm-label">TRAVEL TO</div>
            <div class="map__confirm-type">${label}</div>
            <div class="map__confirm-floor">Floor ${pendNode.floor}</div>
            ${bossIntelHtml}
            <div class="map__confirm-actions">
              <button class="map__confirm-btn map__confirm-btn--cancel" data-action="cancel-travel">Cancel</button>
              <button class="map__confirm-btn map__confirm-btn--go" data-action="confirm-travel">Travel</button>
            </div>
          </div>`;
      }
    }

    // Player avatar overlay on current node.
    let playerHtml = "";
    if (currentNode) {
      const p = posMap[currentNode.id];
      playerHtml = `
        <img class="map__player-marker"
             src="/assets/map_player.png"
             style="left: ${p.xPct}%; top: ${p.y - 46}px;"
             alt="Player" draggable="false" />`;
    }

    root.innerHTML = `
      <div class="map">
        <div class="map__topbar">
          <button class="map__back" data-action="leave-run">&larr; Leave Run</button>
          <div class="map__title">CHAPTER ${chapter} -- MINES</div>
          <div class="map__stats">
            <span>HP ${run.playerHp}/${run.playerMaxHp}</span>
            <span>GOLD ${run.gold}</span>
          </div>
        </div>
        <div class="map__scroll" id="mapScroll">
          <div class="map__canvas" style="height: ${containerHeight}px; background-image: linear-gradient(180deg, rgba(13,7,16,0.55) 0%, rgba(13,7,16,0) 12%, rgba(13,7,16,0) 88%, rgba(13,7,16,0.55) 100%), url('/assets/map_bg_ch${mapBgChapter}.png');">
            ${edgeSvg}
            ${nodesHtml}
            ${playerHtml}
          </div>
        </div>
        ${confirmHtml}
      </div>`;

    // Auto-scroll so player is roughly centered (or just above center).
    const scrollEl = document.getElementById("mapScroll");
    if (scrollEl && currentNode) {
      const pos = posMap[currentNode.id];
      const target = pos.y - scrollEl.clientHeight * 0.6;
      scrollEl.scrollTop = Math.max(0, target);
    }
  };

  const onClick = (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "leave-run") {
      if (!confirm("Leave this run? Progress will be lost.")) return;
      setState({ run: null });
      mountScene("lobby", root);
      return;
    }
    if (action === "pick") {
      // Stage selection; show confirm modal. Don't travel yet.
      pendingNodeId = btn.dataset.nodeId;
      render();
      return;
    }
    if (action === "cancel-travel") {
      pendingNodeId = null;
      render();
      return;
    }
    if (action === "confirm-travel") {
      const nodeId = pendingNodeId;
      pendingNodeId = null;
      const node = run.map.nodes.find((nd) => nd.id === nodeId);
      if (!node) { render(); return; }
      // Phase 3: log map node selection.
      if (run.moveLog) {
        run.moveLog.push({ t: "map", floor: node.floor, v: nodeId });
      }
      run.currentNodeId = nodeId;
      run.visitedNodeIds.push(nodeId);
      run.floor = node.floor;
      // R9: Trail Rations -- heal a few HP each time you enter a new floor.
      if (hasRelic(run, "trail_rations")) {
        const __mx = run.playerMaxHp || 100;
        const __h = Math.min(trailRationsHeal(run), Math.max(0, __mx - (run.playerHp || 0)));
        if (__h > 0) { run.playerHp = (run.playerHp || 0) + __h; console.log(`[relic] Trail Rations +${__h} HP (floor ${node.floor})`); }
      }
      setState({ run });
      console.log(`[map] traveled ${nodeId} (${node.type}, floor ${node.floor})`);

      // 2.7d M3: route to the scene matching the node type.
      const sceneByType = {
        normal: "battle",
        elite: "battle",
        boss: "battle",
        miniboss: "battle",        // R7: standard battle, isMiniboss via node.type
        shop: "shop",
        campfire: "campfire",
        treasure: "treasure",
        mystery: "mystery",
        crystal_shrine: "crystal_shrine", // R7: CH2 F7 (scene added in M2c)
        blood_altar: "blood_altar",       // R7: CH3 F7 (scene added in M2c)
      };
      const targetScene = sceneByType[node.type];
      if (targetScene) {
        mountScene(targetScene, root);
      } else {
        // start node or unknown -- stay on map.
        render();
      }
      return;
    }
  };

  root.addEventListener("click", onClick);
  render();
  return () => root.removeEventListener("click", onClick);
}

// ---------- Layout helpers ----------

function nodePos(node, maxFloor = 9) {
  // y: top floor (boss) near top, floor 1 near bottom. maxFloor varies by
  // chapter (CH1=9, CH2=11, CH3=13).
  const fromTop = SVG_TOP_PAD + (maxFloor - node.floor) * FLOOR_GAP;
  // R7 (M2b): prefer the node-carried colCount (set by mapGen); fall back to
  // the CH1 lookup for any legacy/in-progress map saved before this update.
  const colCount = node.colCount || colCountForFloor(node.floor);
  let xPct;
  if (colCount === 1) xPct = 50;
  else if (colCount === 2) xPct = node.col === 0 ? 32 : 68;
  else xPct = [18, 50, 82][node.col];
  return { xPct, y: fromTop };
}

function colCountForFloor(floor) {
  if (floor === 1 || floor === 9) return 1;
  if (floor === 8) return 2;
  return 3;
}

function renderEdges(nodes, posMap, run, reachableIds, containerHeight) {
  // viewBox uses xPct (0-100) horizontally and px vertically.
  // Edges drawn as cubic bezier curves so they don't visually pass through unrelated nodes.
  // Control points: (x1, midY) -> (x2, midY). Creates a soft S-curve that exits/enters nodes vertically.
  const nodeRadius = NODE_SIZE / 2;

  const dimPaths = [];
  const traveledPaths = [];
  const livePaths = [];

  for (const src of nodes) {
    const srcPos = posMap[src.id];
    for (const dstId of src.edges) {
      const dst = nodes.find((n) => n.id === dstId);
      if (!dst) continue;
      const dstPos = posMap[dst.id];
      const isLive = src.id === run.currentNodeId && reachableIds.has(dstId);
      const isTraveled = run.visitedNodeIds.includes(src.id) && run.visitedNodeIds.includes(dstId);

      const x1 = srcPos.xPct;
      const y1 = srcPos.y + nodeRadius - 4;
      const x2 = dstPos.xPct;
      const y2 = dstPos.y + nodeRadius + 4;
      const midY = (y1 + y2) / 2;
      const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

      if (isLive) livePaths.push(`<path class="map__edge map__edge--live" d="${d}" />`);
      else if (isTraveled) traveledPaths.push(`<path class="map__edge map__edge--traveled" d="${d}" />`);
      else dimPaths.push(`<path class="map__edge map__edge--dim" d="${d}" />`);
    }
  }

  // Draw order: dim (back) -> traveled (mid) -> live (top).
  return `
    <svg class="map__edges" viewBox="0 0 100 ${containerHeight}" preserveAspectRatio="none"
         width="100%" height="${containerHeight}"
         style="position:absolute; left:0; top:0; pointer-events:none;">
      ${dimPaths.join("\n      ")}
      ${traveledPaths.join("\n      ")}
      ${livePaths.join("\n      ")}
    </svg>`;
}
