/**
  * NIMBLADE — entry point
  * v1.1 — Step 2.3: scene framework + splash
  * 2.7c-2: global cheat console (gold/relic/etc persists across scenes)
  */
import "./styles/global.css";
import { mountScene } from "./scenes/sceneManager.js";
import { getState, setState } from "./state/store.js";
import relicsData from "./data/relics.json" assert { type: "json" };
import { acquireRelic } from "./data/relicEffects.js";
import { printMapAscii } from "./data/mapGen.js";

const app = document.getElementById("app");
mountScene("splash", app);

// ---- Global cheat console (works in ANY scene) ----
// v3.0 CHT: Only expose in dev mode (Vite strips this block in production builds).
if (import.meta.env.DEV) {
window.cheat = {
  gold: (n) => {
    const run = getState().run;
    if (!run) return console.warn("[cheat] no active run");
    run.gold = n;
    setState({ run });
    console.log(`[cheat] gold=${n}`);
  },
  addGold: (n) => {
    const run = getState().run;
    if (!run) return console.warn("[cheat] no active run");
    run.gold = (run.gold || 0) + n;
    // M2: keep cumulative totalGoldEarned in sync for shard payout testing.
    if (n > 0) run.totalGoldEarned = (run.totalGoldEarned || 0) + n;
    setState({ run });
    console.log(`[cheat] gold+=${n} -> ${run.gold} (totalEarned ${run.totalGoldEarned})`);
  },
  shards: (n) => {
    const meta = getState().meta || {};
    meta.shards = n;
    setState({ meta });
    console.log(`[cheat] shards=${n}`);
  },
  hp: (n) => {
    const run = getState().run;
    if (!run) return console.warn("[cheat] no active run");
    run.playerHp = n;
    setState({ run });
    console.log(`[cheat] hp=${n} (next battle / scene refresh)`);
  },
  maxhp: (n) => {
    const run = getState().run;
    if (!run) return console.warn("[cheat] no active run");
    run.playerMaxHp = n;
    if ((run.playerHp || 0) > n) run.playerHp = n;
    setState({ run });
    console.log(`[cheat] maxhp=${n}`);
  },
  relic: (id) => {
    const run = getState().run;
    if (!run) return console.warn("[cheat] no active run");
    const pool = [
      ...(relicsData.commons || []),
      ...(relicsData.rares || []),
      ...(relicsData.epics || []),
      ...(relicsData.specials || []),
    ];
    const exists = pool.find((r) => r.id === id);
    if (!exists) return console.warn(`[cheat] unknown relic id "${id}". Use cheat.listRelics()`);
    if ((run.relics || []).includes(id)) return console.warn(`[cheat] already owned: ${id}`);
    const newRun = acquireRelic(run, id);
    setState({ run: newRun });
    console.log(`[cheat] +relic ${id}`);
  },
  listRelics: () => {
    const pool = [
      ...(relicsData.commons || []),
      ...(relicsData.rares || []),
      ...(relicsData.epics || []),
      ...(relicsData.specials || []),
    ];
    const ids = pool.map((r) => `${r.tier.padEnd(6)} ${r.id.padEnd(20)} ${r.name}`);
    console.log("[cheat] relic pool:\n" + ids.join("\n"));
  },
  // 2.7d M1: print proc-gen map ASCII to console.
  printMap: () => {
    const run = getState().run;
    if (!run) return console.warn("[cheat] no active run");
    printMapAscii(run.map);
  },
  help: () => console.log(
    "GLOBAL: cheat.gold(n) | cheat.addGold(n) | cheat.shards(n) | cheat.hp(n) | cheat.maxhp(n) | cheat.relic(id) | cheat.listRelics() | cheat.printMap()\n" +
    "BATTLE-ONLY (mid-battle): cheat.energy(n) | cheat.enemyHp(n) | cheat.playerHp(n) | cheat.win() | cheat.lose()"
  ),
};
console.log("[NIMBLADE] booted -- cheat.help()");
} // end DEV-only cheat block
