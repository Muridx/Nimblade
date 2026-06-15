import { mountScene } from "./sceneManager.js";
import { next as rngNext } from "../data/rng.js";
import { getState, setState } from "../state/store.js";
import monstersData from "../data/monsters.json";
import weaponsData from "../data/weapons.json";
import relicsData from "../data/relics.json";
import { nodeTypeFor, sceneForNodeType } from "../data/floorMap.js";
import { addRunGold, payoutShards, advanceChapter } from "../data/runHelpers.js";
import { submitRun as leaderboardSubmitRun } from "../data/leaderboard.js";
import {
  forgeDmgBonus,
  forgeEnergyRegenBonus,
  forgeBattleStartEnergy,
  forgeBattleGoldBonus,
} from "../data/forgeEffects.js";
import { applyAscensionToEnemy, clampAsc } from "../data/ascensionEffects.js";
import {
  initSpecials,
  isSchemeThisTurn,
  executeScheme,
  onMonsterHit,
  tickEffects,
  getEnemyDmgBonus,
  isEnragedThisTurn,
  consumeEnraged,
  getEnemyArmor,
  getEnemyArmorInfo,
  getEnemyDodgeChance,
  getEnemyHonestMod,
  getPlayerExtraDmgTaken,
  absorbShield,
  isPlayerFrozen,
  hasPassive,
  schemeSkipsAttack,
  schemeHitsPlayer,
  specialName,
  activeEffectLabels,
} from "../data/monsterSpecials.js";
import { rollMysteryRelicTier, pickMysteryRelic } from "../data/mysteryEvents.js";
import {
  hasRelic,
  slashDmgBonus,
  guardExtraBlock,
  bonusGoldOnBattleWin,
  goldPerSlashWin,
  bonusEnergyPerTurn,
  healOnBattleWin,
  insightCharmActive,
  honestIntentTurn,
  hasTorch,
  acquireRelic,
  // 2.7c-2 rares
  healPerSlashWin,
  hasCleansingBell,
  gamblersDiceEnergyOnStart,
  rollFrostbiteFreeze,
  mirrorReflectFrac,
  hasHolyWater,
  hasIronWill,
  grimoireCounterBonus,
  grimoireEnergyDrain,
  hasPhoenixEmber,
  phoenixHealAmount,
  phoenixThresholdFrac,
  berserkerStoneSelfDmg,
  // 2.7c-3 epics
  devilsBargainSelfDmgPerSlashWin,
  hasEchoStone,
  serpentBeltActive,
  goldenChaliceStartHpFrac,
  goldenChaliceGoldMult,
  crownTurnActive,
  eyeOmniscienceEnemyDmgMult,
  voidCrownReadCostDelta,
  voidCrownExtraHonestReveals,
  hasVoidCrown,
  canHeartRevive,
  // R9 relics
  counterDmgBonus,
  guardWinDmgBonus,
  coinPouchGold,
  momentumCoilBonus,
  rollFrostLatticeFreeze,
  etherealArmorPenFrac,
  soulHarvestDmgBonus,
  soulHarvestKillTier,
  glassCannonDmgBonus,
  arcaneConduitAbilityMult,
  arcaneConduitBasicMult,
} from "../data/relicEffects.js";

const BASE_PLAYER_HP = 100;
const MAX_ENERGY = 100;
const INTENT_ICON = { SLASH: "\u2694\uFE0F", GUARD: "\u{1F6E1}\uFE0F", COUNTER: "\u{1F504}" };
const BEATS = { SLASH: "COUNTER", GUARD: "SLASH", COUNTER: "GUARD" };
const RPS = ["SLASH", "GUARD", "COUNTER"];

// --- 2.7a Reward helpers ----------------------------------------------------
// Gold drop ranges per enemy tier (Locks §8.1 Layer 1)
const GOLD_RANGE = {
  normal: [6, 10],
  elite:  [16, 24],
  boss:   [36, 44],
};
function randInRange(lo, hi) { return lo + Math.floor(rngNext() * (hi - lo + 1)); }

// Weighted sampler: pick N distinct relics from a single pool.
// Excludes already-owned ids so player never sees a duplicate offer.
function pickFromPool(pool, ownedIds, count) {
  const working = (pool || []).filter((r) => !ownedIds.includes(r.id));
  const picks = [];
  for (let i = 0; i < count && working.length > 0; i++) {
    const totalWeight = working.reduce((s, r) => s + (r.weight || 1), 0);
    let roll = rngNext() * totalWeight;
    let idx = 0;
    for (let j = 0; j < working.length; j++) {
      roll -= (working[j].weight || 1);
      if (roll <= 0) { idx = j; break; }
    }
    picks.push(working[idx]);
    working.splice(idx, 1);
  }
  return picks;
}

// 2.7b: tier-weighted picker for elite (60c/40r) and boss (60r/40e) drops.
// tierWeights example: { common: 0.6, rare: 0.4 }
function pickRelicChoicesByTier(ownedIds, count, tierWeights) {
  const tierPools = {
    common: relicsData.commons || [],
    rare:   relicsData.rares   || [],
    epic:   relicsData.epics   || [],
  };
  const tiers = Object.keys(tierWeights);
  const picks = [];
  const owned = ownedIds.slice();
  for (let i = 0; i < count; i++) {
    // Roll a tier per slot
    const totalW = tiers.reduce((s, t) => s + tierWeights[t], 0);
    let roll = rngNext() * totalW;
    let chosenTier = tiers[0];
    for (const t of tiers) {
      roll -= tierWeights[t];
      if (roll <= 0) { chosenTier = t; break; }
    }
    // Pick 1 from that tier
    const one = pickFromPool(tierPools[chosenTier], owned, 1);
    if (one.length) {
      picks.push(one[0]);
      owned.push(one[0].id);
    }
  }
  return picks;
}

// Back-compat alias: original placeholder API used commons-only sampling.
function pickRelicChoices(ownedIds, count) {
  return pickFromPool(relicsData.commons || [], ownedIds, count);
}
// ----------------------------------------------------------------------------

export function battleScene(root, opts) {
  opts = opts || {};
  const run = getState().run || { mode: "demo", weapon: "sword", chapter: "CH1", floor: 1, floorMax: 9, gold: 0, relics: [], playerHp: 100, playerMaxHp: 100 };
  const weapon = weaponsData[run.weapon] || weaponsData.sword;
  const S = weapon.stats;

  // Bible v3.0: forge in-battle effective values. Resolved ONCE per battle mount.
  const meta = getState().meta || {};
  const wsCost = S.ws_cost;
  const ultCost = S.ult_cost;
  const dmgForgeBonus = forgeDmgBonus(meta);           // +2 all attacks (combat_t1)
  const energyRegenForge = forgeEnergyRegenBonus(meta); // +5 energy/turn (combat_t2)
  const battleStartEnergyForge = forgeBattleStartEnergy(meta); // +30e per battle (combat_t3)
  const battleGoldForge = forgeBattleGoldBonus(meta);   // +5g per win (economy_t2)
  const chapterKey = (run.chapter || "CH1").toLowerCase();
  const chapterData = monstersData[chapterKey] || monstersData.ch1;
  const bgImg = chapterData.background || "bg_ch1_goblin_caverns.png";

  // 2.7d M3: enemy pool determined by CURRENT MAP NODE's type (set from map scene),
  // not floor index. Map scene routes here only for normal/elite/boss nodes.
  // Fallback to floorMap-based logic if run.map / currentNode missing (legacy/demo entry).
  const currentFloor = run.floor || 1;
  const mapCurrentNode = (run.map && run.currentNodeId)
    ? run.map.nodes.find((nd) => nd.id === run.currentNodeId)
    : null;
  const nodeType = (mapCurrentNode && mapCurrentNode.type)
    ? mapCurrentNode.type
    : nodeTypeFor(run.chapter || "CH1", currentFloor);
  const isBossFloor = nodeType === "boss";
  // M9: Bandit Ambush forces the elite enemy pool + elite reward tier even
  // though the underlying map node was a mystery. Treat it as elite from this
  // point on for both enemy selection and reward generation.
  const isEliteFloor = nodeType === "elite" || !!opts.forceElite;
  // Bible v3.0 §4.3: Miniboss fights use standard battle scene with isMiniboss flag.
  const isMinibossFloor = nodeType === "miniboss" || !!opts.isMiniboss;
  let enemyDef;
  if (opts.enemy) {
    enemyDef = opts.enemy;
  } else if (isMinibossFloor) {
    // R7/R8: use the chapter's DEDICATED miniboss (Hooded Sister CH2 /
    // Renfield CH3). Previously this picked elites[0], so the real minibosses
    // never appeared. Fall back to first elite only if miniboss data missing.
    const elites = chapterData.elites || chapterData.normals || [];
    enemyDef = chapterData.miniboss || elites[0] || chapterData.normals[0];
  } else if (isBossFloor) {
    enemyDef = chapterData.boss || chapterData.normals[0];
  } else if (isEliteFloor) {
    // Anti-dupe elites per run (mirrors the normal-monster queue): shuffle the
    // chapter's elite pool and deal WITHOUT replacement, so you don't face the
    // same elite twice in one chapter.
    const pool = chapterData.elites || chapterData.normals || [];
    let queue = Array.isArray(run.eliteQueue) ? [...run.eliteQueue] : [];
    if (run.eliteQueueChapter !== run.chapter || queue.length === 0) {
      queue = pool.map((m) => m.id);
      // Fisher-Yates shuffle
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(rngNext() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    const nextId = queue.shift();
    enemyDef = pool.find((m) => m.id === nextId) || pool[0];
    // Persist the post-shift queue to BOTH the store AND the mount-captured
    // local `run` -- otherwise reward fns (applyRewardAndAdvance) spread the
    // stale `{...run}` and wipe the queue, causing repeat encounters.
    run.eliteQueue = queue;
    run.eliteQueueChapter = run.chapter;
    setState({ run: { ...getState().run, eliteQueue: queue, eliteQueueChapter: run.chapter } });
  } else {
    // 2.7b-3 v2c: no-dupe normals per run. Maintain a shuffled queue per chapter.
    // When queue empty or chapter changed, re-shuffle from chapterData.normals.
    const pool = chapterData.normals || [];
    let queue = Array.isArray(run.normalQueue) ? [...run.normalQueue] : [];
    if (run.normalQueueChapter !== run.chapter || queue.length === 0) {
      queue = pool.map((m) => m.id);
      // Fisher-Yates shuffle
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(rngNext() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    const nextId = queue.shift();
    enemyDef = pool.find((m) => m.id === nextId) || pool[0];
    // Persist remaining queue to BOTH the store AND the mount-captured local
    // `run` -- otherwise reward fns spread stale `{...run}` and wipe the queue
    // (caused the same normal monster to repeat in one chapter).
    run.normalQueue = queue;
    run.normalQueueChapter = run.chapter;
    setState({ run: { ...getState().run, normalQueue: queue, normalQueueChapter: run.chapter } });
  }
  // M6: Ascension patch. Reassign enemyDef BEFORE any downstream reads so
  // every `enemyDef.dmg / .hp / .honest_pct` reference auto-uses the
  // ascended stats. Shallow clone -- monsters.json never mutated.
  const ascLevel = clampAsc(run.ascension);
  if (ascLevel > 0) {
    const patched = applyAscensionToEnemy(enemyDef, ascLevel, isBossFloor);
    enemyDef = patched;
    console.log(`[ascension] Asc ${ascLevel} applied to ${enemyDef.id}:`, {
      dmg: enemyDef.dmg,
      hp: enemyDef.hp,
      honest_pct: enemyDef.honest_pct,
    });
  }
  // M9: Cursed Chest mystery event sets run.cursedNextBattle. We bump enemy
  // dmg +50% for this fight ONLY, then clear the flag immediately so it
  // never bleeds into the next battle. Bosses skipped -- curse can't apply
  // to boss floors (mystery nodes never sit before boss).
  const isCursedBattle = !!run.cursedNextBattle && !isBossFloor;
  if (isCursedBattle) {
    enemyDef = { ...enemyDef, dmg: Math.max(1, Math.round((enemyDef.dmg || 1) * 1.5)) };
    setState({ run: { ...run, cursedNextBattle: false } });
    console.log(`[mystery] curse active -- ${enemyDef.id} dmg patched to`, enemyDef.dmg);
  }
  const spriteId = enemyDef.sprite_id || enemyDef.id;

  // Bible v3.0 §4.2: Monster specials engine.
  const ss = initSpecials(enemyDef);

  // Build adapter object for specials — bridges ss to battle state.
  const buildSpecialCtx = () => ({
    log: (msg) => state.log.push(msg),
    playerEnergy: () => state.player.energy,
    drainEnergy: (n) => { state.player.energy = Math.max(0, state.player.energy - n); },
    dealDirectDmg: (n, _tag) => {
      const taken = Math.max(0, n);
      state.player.hp = Math.max(0, state.player.hp - taken);
    },
    playerGold: () => run.gold || 0,
    stealGold: (n) => {
      const stolen = Math.min(run.gold || 0, n);
      run.gold = (run.gold || 0) - stolen;
      setState({ run });
    },
    healEnemy: (n) => {
      // Holy Water (tooltip): 1x/battle, the first time the enemy tries to heal,
      // disable monster healing for 3 turns (this heal + the window).
      if (hasHolyWater(run) && !state.holyWaterUsed) {
        state.holyWaterUsed = true;
        state.enemyHealDisabledTurns = 3;
        flashRelic("holy_water", "BLOCKED");
        state.log.push(`Holy Water: monster healing disabled for 3 turns!`);
      }
      if (state.enemyHealDisabledTurns > 0) {
        flashRelic("holy_water", "");
        state.log.push(`Holy Water: enemy heal blocked.`);
        return;
      }
      state.enemy.hp = Math.min(state.enemy.maxHp, state.enemy.hp + n);
    },
  });

  // Animation queue: filled during resolve(), flushed after render()
  const anims = [];
  // 2.7a-patch fix: end overlay should only run its 0.55s delayed fade-in
  // animation the FIRST time it appears. Re-renders (e.g. tap-to-select relic)
  // must skip the animation so the overlay doesn't flash transparent each tap.
  let endOverlayShown = false;
  const queueFloater = (target, value, kind) => anims.push({ kind: "float", target, value, type: kind });
  // Relic-trigger feedback: pulse the relic's chip + pop a tiny label over it.
  const flashRelic = (rid, label) => anims.push({ kind: "relictrigger", rid, label: label || "" });
  const queueShake = (level) => anims.push({ kind: "shake", level });
  const queueFlash = (target) => anims.push({ kind: "flash", target });

  const state = {
    turn: 1,
    slashWins: 0, // 2.7c-1: crow_feather counter
    floor: currentFloor,
    floorMax: run.floorMax || 9,
    chapter: run.chapter || "CH1",
    isBossFloor,
    rewarded: false, // true after reward overlay handled (prevents double-grant)
    rewardData: null, // { gold, relicChoices: [...] } when win
    // 2.7d-stepC: boss reward = optional. Player picks TAKE or SKIP (decision tension).
    // null = not yet chosen; "take" = relic taken; "skip" = took 50g + 15 HP heal instead.
    bossRewardTaken: null,
    player: {
      hp: (typeof run.playerHp === "number") ? run.playerHp : BASE_PLAYER_HP,
      maxHp: run.playerMaxHp || BASE_PLAYER_HP,
      // 2.7a-patch: carry-over from run state
      energy: (typeof run.energy === "number") ? run.energy : 0,
      maxEnergy: MAX_ENERGY,
      comboCount: 0, // RESET per battle (micro chain, not run-level)
      momentumStacks: (typeof run.momentumStacks === "number") ? run.momentumStacks : 0,
      berserkTurns: (typeof run.berserkTurns === "number") ? run.berserkTurns : 0,
    },
    // STUDY (READ) uses remaining this RUN, default 3. Carries between battles.
    readUsesRemaining: (typeof run.readUses === "number") ? run.readUses : 3,
    enemy: { hp: enemyDef.hp, maxHp: enemyDef.hp, buffs: [] },
    log: [`-- Battle start --`, `${enemyDef.name} appears (HP ${enemyDef.hp})`],
    pendingAction: null,
    ended: null,
    intent: null,        // DISPLAYED intent (may lie per honest_pct)
    actualIntent: null,  // TRUE move (used in resolve)
    foresightQueue: [],  // queued ACTUAL intents for next turns
    foresightActiveThisTurn: false, // true if current intent sourced from foresight queue
    pendingRelicId: null,           // tap-select highlight on reward overlay
    showSurrenderConfirm: false,    // in-game confirm modal flag
    showRunInfo: false,             // 2.7d stepA: in-game RUN INFO modal flag
    showRelicId: null,              // 2.7e P1: tap-to-show relic tooltip (id of relic shown, or null)
    warCryThisTurn: false,          // scheme turn: monster uses special (no RPS round)
    telegraphDmgMult: 1,            // free-hit penalty on buff/turtle telegraphs (1 = none)
    telegraphReducedThisTurn: 0,    // dmg cut by the telegraph penalty this turn (for log tag)
    enragedThisTurn: false,         // war_cry payoff: +50% damage
    enemyFrozenNextTurn: false,     // 2.7c-2: Frostbite Shard freeze flag
    enemyFrozenThisTurn: false,     // 2.7c-2: tag intent display as FROZEN
    playerFrozenThisTurn: false,    // monster freeze special: player can't act
    // 2.7c-3 epic flags
    echoLastAction: null,           // last basic-RPS WIN action for Echo Stone
    echoStreak: 0,                  // current Echo Stone chain length
    serpentBeltThisTurn: false,     // set at turn-start when serpent_belt fires
    crownTurnThisTurn: false,       // set at turn-start when crown_of_decision fires
    voidCrownPendingBonus: false,   // true after a READ if Void Crown owned
    enemyVulnerableTurns: 0,        // Bible v3.0: Axe Cleave -- enemy Berserk (+50% dmg taken)
  };

  // 2.7c-3 EPIC battle-start: Golden Chalice -- hp = 50% maxHp at battle start.
  const chaliceFrac = goldenChaliceStartHpFrac(run);
  if (chaliceFrac !== null) {
    const chaliceHp = Math.max(1, Math.floor(state.player.maxHp * chaliceFrac));
    state.player.hp = chaliceHp;
    state.log.push(`Golden Chalice: HP set to ${chaliceHp} (50% cap).`);
  }
  // 2.7c-3 EPIC battle-start: Crown turn / Serpent belt fire on turn 1 too.
  if (serpentBeltActive(run, 1)) state.serpentBeltThisTurn = true; // turn 1 not 5, no-op
  if (crownTurnActive(run, 1)) state.crownTurnThisTurn = true;     // turn 1 not 3, no-op

  // 2.7c-2 BATTLE-START relic effects ----------------------------------------
  // Per-battle relic charges (tooltip-accurate behaviours).
  state.cleansingBellUsed = false;     // Cleansing Bell: 1x/battle clear curse/DoT
  state.ironWillUsed = false;          // Iron Will: 1x/battle ignore a scheme/feint
  state.phoenixUsedThisBattle = false; // Phoenix Ember: 1x/battle heal at low HP
  state.holyWaterUsed = false;         // Holy Water: 1x/battle disable enemy healing
  state.enemyHealDisabledTurns = 0;    // Holy Water active window (turns remaining)

  // Forge Combat T3: +30 battle start energy.
  if (battleStartEnergyForge > 0) {
    state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + battleStartEnergyForge);
    state.log.push(`Forge: +${battleStartEnergyForge} battle start energy`);
  }
  // Gambler's Dice (tooltip): +30 energy at battle start (-10 maxHp applied at acquire).
  const diceEnergy = gamblersDiceEnergyOnStart(run);
  if (diceEnergy > 0) {
    state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + diceEnergy);
    flashRelic("gamblers_dice", `+${diceEnergy}⚡`);
    state.log.push(`Gambler's Dice: +${diceEnergy} energy`);
  }
  // Turn-1 per-turn relic effects (rest applied in the turn-tick block for turns 2+).
  {
    const drain1 = grimoireEnergyDrain(run);
    if (drain1 > 0 && state.player.energy > 0) {
      state.player.energy = Math.max(0, state.player.energy - drain1);
      flashRelic("chained_grimoire", `-${drain1}⚡`);
      state.log.push(`Chained Grimoire: -${drain1} energy`);
    }
    const self1 = berserkerStoneSelfDmg(run, 1);
    if (self1 > 0) {
      state.player.hp = Math.max(1, state.player.hp - self1);
      flashRelic("berserker_stone", `-${self1}`);
      state.log.push(`Berserker Stone: -${self1} HP (recoil)`);
    }
  }

  // Reward generator: fills state.rewardData. Called once on win.
  // 2.7b-1 reward gating per Design Doc v1.1 §5.2:
  //   normal -> gold only (no relic pick)
  //   elite  -> 3-pick, 60% common + 40% rare per slot
  //   boss   -> auto-grant 1, 60% rare + 40% epic
  const generateReward = () => {
    if (state.rewardData) return; // idempotent
    const tier = isBossFloor ? "boss" : (isMinibossFloor ? "miniboss" : (isEliteFloor ? "elite" : "normal"));
    const goldTier = (tier === "miniboss") ? "elite" : tier; // miniboss uses elite gold range
    const [lo, hi] = GOLD_RANGE[goldTier] || GOLD_RANGE.normal;
    // Gold = base range + relic bonuses + forge economy_t2 bonus + chalice multiplier.
    const gold = (
      randInRange(lo, hi)
      + bonusGoldOnBattleWin(run)
      + coinPouchGold(run)
      + (state.slashWins * goldPerSlashWin(run))
      + battleGoldForge
    ) * goldenChaliceGoldMult(run);
    let relicChoices = [];
    let autoGrantedRelic = null;
    if (tier === "miniboss") {
      // Bible §4.3: Guaranteed epic relic drop on miniboss win.
      const epicPicks = pickFromPool(relicsData.epics || [], run.relics || [], 1);
      autoGrantedRelic = epicPicks[0] || null;
    } else if (tier === "elite") {
      relicChoices = pickRelicChoicesByTier(run.relics || [], 3, { common: 0.6, rare: 0.4 });
    } else if (tier === "boss") {
      const picks = pickRelicChoicesByTier(run.relics || [], 1, { rare: 0.6, epic: 0.4 });
      autoGrantedRelic = picks[0] || null;
    }
    // normal: relicChoices stays [] -> reward overlay shows gold + NEXT FLOOR button
    // M9: Bandit Ambush -- on top of the elite reward, roll ONE extra relic
    // via the mystery distribution (3% epic / 30% rare / 67% common) and
    // auto-grant on advance. Acts as "2 relics" payout per design §6.3.
    let bonusBanditRelic = null;
    if (run.banditAmbushPending && tier === "elite") {
      const t = rollMysteryRelicTier();
      bonusBanditRelic = pickMysteryRelic({ relics: run.relics || [] }, t) || null;
      if (bonusBanditRelic) {
        console.log(`[mystery] bandit bonus relic rolled tier=${t}:`, bonusBanditRelic.id);
      }
    }
    state.rewardData = { gold, relicChoices, tier, autoGrantedRelic, bonusBanditRelic };
  };

  // Apply chosen reward to run state, then return to MAP (non-boss only).
  // 2.7d M3: map = source of truth, scenes return to it after.
  const applyRewardAndAdvance = (chosenRelicId) => {
    if (!state.rewardData) return;
    let newRun = { ...run };
    addRunGold(newRun, state.rewardData.gold); // M2
    // Carry-over fields persisted to run state FIRST (so acquireRelic sees fresh HP)
    newRun.playerHp = state.player.hp;
    newRun.playerMaxHp = state.player.maxHp;
    // 2.7c-1: Healing Herb -- heal at end of every battle won
    const heal = healOnBattleWin(newRun);
    if (heal > 0) {
      newRun.playerHp = Math.min(newRun.playerMaxHp, newRun.playerHp + heal);
    }
    newRun.relics = (newRun.relics || []).slice();
    if (chosenRelicId) {
      newRun = acquireRelic(newRun, chosenRelicId);
    }
    // M9: Bandit Ambush bonus relic auto-grants AFTER the player's elite pick.
    // Clear the flag whether or not a bonus was actually rolled (e.g. pool
    // exhausted), so the next elite battle doesn't carry it over.
    if (newRun.banditAmbushPending) {
      const bonus = state.rewardData.bonusBanditRelic;
      if (bonus && !newRun.relics.some((r) => (r.id || r) === bonus.id)) {
        newRun = acquireRelic(newRun, bonus.id);
        console.log(`[mystery] bandit bonus relic granted: ${bonus.id}`);
      }
      newRun.banditAmbushPending = false;
    }
    // R9: Soul Harvest -- +1 permanent dmg stack per elite/miniboss/boss kill.
    if (hasRelic(newRun, "soul_harvest") && soulHarvestKillTier(state.rewardData.tier)) {
      newRun.soulHarvestStacks = (newRun.soulHarvestStacks || 0) + 1;
    }
    newRun.energy = state.player.energy;
    newRun.momentumStacks = state.player.momentumStacks;
    newRun.berserkTurns = state.player.berserkTurns;
    newRun.readUses = state.readUsesRemaining;
    setState({ run: newRun });
    mountScene("map", root);
  };

  // 2.7d-stepC: Boss reward = player choice (TAKE relic vs SKIP for 50g + 15 HP).
  // Mutates run state but does NOT navigate -- caller (boss-finish click) goes to lobby.
  const applyBossReward = (took) => {
    if (!state.rewardData) return;
    let newRun = { ...run };
    addRunGold(newRun, state.rewardData.gold); // M2
    newRun.playerHp = state.player.hp;
    newRun.playerMaxHp = state.player.maxHp;
    const heal = healOnBattleWin(newRun);
    if (heal > 0) newRun.playerHp = Math.min(newRun.playerMaxHp, newRun.playerHp + heal);
    newRun.relics = (newRun.relics || []).slice();
    if (took && state.rewardData.autoGrantedRelic) {
      newRun = acquireRelic(newRun, state.rewardData.autoGrantedRelic.id);
    } else if (!took) {
      // SKIP compensation: +50 gold + heal +30 HP (capped at maxHp). Decision tension preserved.
      addRunGold(newRun, 50); // M2
      newRun.playerHp = Math.min(newRun.playerMaxHp, newRun.playerHp + 30);
    }
    // R9: Soul Harvest -- +1 permanent dmg stack per elite/miniboss/boss kill.
    if (hasRelic(newRun, "soul_harvest") && soulHarvestKillTier(state.rewardData.tier)) {
      newRun.soulHarvestStacks = (newRun.soulHarvestStacks || 0) + 1;
    }
    newRun.energy = state.player.energy;
    newRun.momentumStacks = state.player.momentumStacks;
    newRun.berserkTurns = state.player.berserkTurns;
    newRun.readUses = state.readUsesRemaining;
    // Bible v3.0: chapter advance logic.
    // Demo mode or CH3 boss = run complete. CH1/CH2 boss = advance to next chapter.
    const chapterNum = parseInt((newRun.chapter || "CH1").replace("CH", ""), 10);
    const isDemoMode = (newRun.mode || "demo") === "demo";
    const isFinalChapter = chapterNum >= 3;
    const isRunComplete = isDemoMode || isFinalChapter;
    if (isRunComplete) {
      newRun.completed = true;
    } else {
      // Chapter advance: prepare next chapter on the run (navigate handled by boss-finish click).
      newRun.nextChapter = `CH${chapterNum + 1}`;
      // Energy carries over across chapters (persistent the whole run).
    }
    setState({ run: newRun });
    // Shard payout: per chapter clear (always).
    const isCh1Clear = chapterNum === 1;
    state.runEndShards = payoutShards({ run: newRun, isCh1BossClear: isCh1Clear });
    state.bossRewardTaken = took ? "take" : "skip";
    state.chapterAdvance = !isRunComplete; // flag for render overlay
    // M8: fire-and-forget submit to Supabase leaderboard (only on run complete).
    if (isRunComplete) {
      leaderboardSubmitRun(newRun).then((res) => {
        if (res.ok) console.log("[leaderboard] submitted run", res.row.id);
      });
    }
    render();
  };

  const honestPct = (typeof enemyDef.honest_pct === "number") ? enemyDef.honest_pct : 100;

  const rollActualIntent = () => {
    if (Array.isArray(enemyDef.pattern)) {
      return enemyDef.pattern[(state.turn - 1) % enemyDef.pattern.length];
    }
    return RPS[Math.floor(rngNext() * 3)];
  };

  const rollDisplayedFor = (actual, honestOverride) => {
    // honest_pct% chance display = actual. Else display = one of the OTHER 2 (gocek).
    // 2.7d batch2: honestOverride lets ENRAGED turn use 60% honest (Goblin King payoff feint).
    const honest = (typeof honestOverride === "number") ? honestOverride : honestPct;
    if (rngNext() * 100 < honest) return actual;
    const others = RPS.filter((x) => x !== actual);
    return others[Math.floor(rngNext() * others.length)];
  };

  // Initial roll
  state.actualIntent = rollActualIntent();
  state.intent = rollDisplayedFor(state.actualIntent);
  // 2.7c-1: Insight Charm forces honest display on turn 1
  if (insightCharmActive(run, state.turn)) state.intent = state.actualIntent;

  const peekActualIntent = (offset) => {
    // For pattern monsters: deterministic. For random: roll fresh (locked into queue).
    if (Array.isArray(enemyDef.pattern)) {
      return enemyDef.pattern[(state.turn - 1 + offset) % enemyDef.pattern.length];
    }
    return RPS[Math.floor(rngNext() * 3)];
  };

  // Bible v3.0: enemy base dmg integrates specials system (buff/enraged/war_cry).
  const enemyBaseDmg = () => {
    let base = enemyDef.dmg;
    // Specials: flat dmg buff from rally, pack_howl etc.
    base += getEnemyDmgBonus(ss);
    // Enraged turn (war_cry payoff): +50%.
    if (state.enragedThisTurn) base = Math.round(base * 1.5);
    return base;
  };

  const intentDmgDisplay = (intent) => {
    if (intent === "WARCRY") return 0;
    if (intent === "GUARD") return 0;
    const base = enemyBaseDmg();
    if (intent === "COUNTER") return base + 3;
    return base;
  };

  const lossDmgTaken = (action, baseDmg) => {
    const reduced = Math.max(1, baseDmg);
    if (action === "GUARD") return Math.floor(reduced * (1 - S.guard_dmg_reduction_pct / 100));
    if (action === "COUNTER") return reduced + Math.max(0, S.counter_loss_dmg_taken);
    return reduced;
  };

  // Apply berserk taken multiplier (+50% taken while active)
  const applyBerserkTaken = (taken) => {
    if (state.player.berserkTurns > 0) return Math.floor(taken * 1.5);
    return taken;
  };

  // Apply berserk dealt multiplier (+100% = x2 while active)
  const applyBerserkDealt = (dmg) => {
    if (state.player.berserkTurns > 0) return Math.floor(dmg * 2);
    return dmg;
  };

  // 2.7c-3: Compute epic taken modifiers (eye +10%, crown +50%, serpent_belt = 0).
  // Pure function -- returns the FINAL dmg the player should take.
  // Used for enemy-sourced damage paths (LOSS / WILD / READ / ULT-enemy-hit).
  // NOT for self-damage (Devil's Bargain) which uses raw value.
  const epicTakenMod = (taken) => {
    let t = Math.floor(taken * eyeOmniscienceEnemyDmgMult(run));
    if (state.crownTurnThisTurn) t = Math.floor(t * 1.5);
    if (state.serpentBeltThisTurn) t = 0;
    return t;
  };

  // 2.7c-3: Compute epic dealt modifiers (crown +50%, serpent_belt x2).
  // Applied to ALL player dmg paths (basic WIN, WILD, ULT). Echo Stone bonus
  // already lives inline in the basic-WIN block so it doesn't double-stack.
  const epicDealtMod = (dmg) => {
    let d = dmg;
    if (state.crownTurnThisTurn) d = Math.floor(d * 1.5);
    if (state.serpentBeltThisTurn) d = d * 2;
    return d;
  };

  // R9: flat dmg added to EVERY player attack once (Glass Cannon +6, Soul Harvest stacks).
  const flatAtkBonus = () => glassCannonDmgBonus(run) + soulHarvestDmgBonus(run);
  // R9: Arcane Conduit -- multiply a weapon-skill / ULT base by +30% (per-hit safe).
  const arcaneAbil = (d) => Math.floor(d * arcaneConduitAbilityMult(run));

  // Bible v3.0: apply player dealt-damage to enemy. Honors Cleave vulnerability
  // (+50% taken), enemy armor & absorb shields. `opts.ignoreArmor` for Impale.
  const enemyTakeDmg = (raw, opts = {}) => {
    let d = Math.max(0, Math.floor(raw));
    // Telegraph free-hit penalty (buff/turtle wind-up). min 1 so a hit still chips.
    if (state.telegraphDmgMult !== 1 && d > 0) { const _pre = d; d = Math.max(1, Math.floor(d * state.telegraphDmgMult)); state.telegraphReducedThisTurn += (_pre - d); }
    if (state.enemyVulnerableTurns > 0) d = Math.floor(d * 1.5);
    if (d > 0 && !opts.ignoreArmor) {
      let armor = getEnemyArmor(ss);
      if (armor > 0 && etherealArmorPenFrac(run) > 0) armor = Math.floor(armor * (1 - etherealArmorPenFrac(run))); // R9 Ethereal Edge
      if (armor > 0) { const after = Math.max(1, d - armor); state.armorBlockedThisTurn += (d - after); d = after; }
      d = absorbShield(ss, d);
    }
    state.enemy.hp -= d;
    return d;
  };

  // Bible v3.0: Staff Purify clears all player-affecting debuffs from special state.
  const clearPlayerDebuffs = () => {
    if (!ss) return false;
    const had = (ss.buffs || []).some(b => b.type === "player_dot" || b.type === "player_curse")
      || (ss.bloodCurseStacks || 0) > 0 || ss.playerFrozenNext || ss.playerFrozenThisTurn;
    if (ss.buffs) ss.buffs = ss.buffs.filter(b => b.type !== "player_dot" && b.type !== "player_curse");
    ss.bloodCurseStacks = 0;
    ss.playerFrozenNext = false;
    ss.playerFrozenThisTurn = false;
    state.playerFrozenThisTurn = false;
    return had;
  };

  // 2.7c-2: Apply taken dmg to player, check Iron Will (big hit -> +10 maxHp perm).
  const applyTakenToPlayer = (taken) => {
    // 2.7d batch2: during WAR CRY the boss only roars -> deals no damage this turn.
    if (state.warCryThisTurn) taken = 0;
    state.player.hp -= taken;
  };

  const tickPlayerBuffs = () => {
    if (state.player.berserkTurns > 0) {
      state.player.berserkTurns--;
      if (state.player.berserkTurns === 0) {
        state.log.push("Berserk ended.");
      }
    }
    if (state.enemyVulnerableTurns > 0) {
      state.enemyVulnerableTurns--;
      if (state.enemyVulnerableTurns === 0) {
        state.log.push("Enemy Berserk (vulnerable) ended.");
      }
    }
  };

  const resolve = (action) => {
    state.armorBlockedThisTurn = 0; // reset per-turn armor-mitigation tracker
    state.telegraphReducedThisTurn = 0; // reset per-turn telegraph-penalty tracker
    // TELEGRAPH free-hit penalty: when the enemy is winding up a NON-damaging
    // (buff/turtle) special, the player's opportunistic free hit is weaker, so
    // reading the telegraph isn't a pure no-risk windfall. Damaging telegraphs
    // (Avalanche/Ambush/Blizzard/Poison/Bats) keep FULL power -- you already eat
    // the hit there. basic+weapon-skill -> 50%, ULT -> 70% (it cost energy).
    // (50% tuned via win-rate sim: 30% over-nerfed frequent-telegraph bosses.)
    state.telegraphDmgMult = 1;
    if (state.warCryThisTurn && ss && !schemeHitsPlayer(ss)) {
      state.telegraphDmgMult = (action === "ULT") ? 0.7 : 0.5;
    }
    let intent = state.actualIntent; // use TRUE move for RPS resolution (display may have lied)
    // Specials: scheme turn (war_cry etc) -- no RPS round, player gets free hit.
    if (state.warCryThisTurn && (action === "SLASH" || action === "GUARD" || action === "COUNTER")) {
      intent = BEATS[action];
    }
    // Specials: scrying passive -- monster reads player intent and counter-plays.
    // Only affects basic RPS actions; WILD/ULT/READ bypass it.
    if (!state.warCryThisTurn && hasPassive(ss, "scrying") && (action === "SLASH" || action === "GUARD" || action === "COUNTER")) {
      // Scrying: enemy's actual move becomes the one that BEATS player's choice.
      // SLASH is beaten by GUARD, GUARD by COUNTER, COUNTER by SLASH.
      const counterPlay = { SLASH: "GUARD", GUARD: "COUNTER", COUNTER: "SLASH" };
      intent = counterPlay[action];
      state.log.push("Scrying — the enemy reads your intent!");
    }
    const wasFeint = !state.warCryThisTurn && state.intent !== state.actualIntent;
    // Show the actual special name on scheme turns (was hardcoded "WAR CRY").
    const intentLabel = state.warCryThisTurn ? (specialName(ss) || "SPECIAL").toUpperCase() : intent;
    // Show the weapon-skill / ultimate name in the log (not the raw "WILD"/"ULT" code).
    const actionLabel = action === "WILD" ? weapon.weapon_skill.name.toUpperCase()
                      : action === "ULT" ? weapon.ultimate.name.toUpperCase()
                      : action;
    let line = `T${state.turn}: You ${actionLabel} vs ${intentLabel}${wasFeint ? " [FEINT!]" : ""} -> `;

    // Snapshot for animation deltas
    const preEnemyHp = state.enemy.hp;
    const prePlayerHp = state.player.hp;
    let didCrit = false;
    let didHeal = 0;
    state.lastAction = action; // for sprite swap (SLASH/GUARD/COUNTER/WILD/ULT)
    state.playerActed = false; // pose swap only if player "acted" (RPS win, WILD, ULT)
    state.enemyActed = false;  // pose swap only if enemy "acted" (RPS loss, WILD, ULT-with-hit)

    if (action === "READ") {
      // STUDY (READ) - 2.7a-patch v1.2 lock:
      //   * 3 uses per RUN (carries between battles, NOT per-battle)
      //   * cost: 60 energy + skip turn (Bible v3.0 §3.2; Void Crown -20e -> 40e)
      //   * free hit dmg: reduced by 20% (you flinch-defend while reading)
      //   * reveals next 1 intent AND locks it HONEST (anti-feint)
      // 2.7c-3: Void Crown -- READ cost -20e and queues 2 honest reveals.
      const readCost = 60 + voidCrownReadCostDelta(run);
      state.player.energy -= readCost;
      state.readUsesRemaining = Math.max(0, state.readUsesRemaining - 1);
      const reducedHit = Math.floor(enemyDef.dmg * 0.8);
      let taken = applyBerserkTaken(reducedHit); taken = epicTakenMod(taken);
      applyTakenToPlayer(taken);
      const extra = voidCrownExtraHonestReveals(run);
      if (extra > 0) {
        state.foresightQueue = [peekActualIntent(1), peekActualIntent(2)];
      } else {
        state.foresightQueue = [peekActualIntent(1)];
      }
      // Void Crown bonus: next attack WIN gets +10% dmg.
      if (hasVoidCrown(run)) state.voidCrownPendingBonus = true;
      line += `STUDY - took ${taken} (-20%), next ${1 + extra} intent(s) locked honest (${state.readUsesRemaining} left)`;
      // Player still chained an action interruption - reset combo
      state.player.comboCount = 0;
      state.playerActed = false;  // no player pose (skip turn)
      state.enemyActed = true;    // enemy free hit pose
    } else if (action === "WILD") {
      // Bible v3.0 WEAPON SKILL -- guaranteed scheme (locks your action so feints
      // can't punish you) + per-weapon bonus. Costs energy, NO refund.
      state.player.energy -= wsCost;
      const wsAct = weapon.weapon_skill.action; // SLASH / GUARD / COUNTER
      state.lastAction = wsAct;                  // pose = the locked scheme
      const wsName = weapon.weapon_skill.name.toUpperCase();
      // On a scheme turn the enemy plays no RPS move -> the weapon skill is a
      // guaranteed FREE HIT (was incorrectly treated as a loss before).
      const wsWin = state.warCryThisTurn ? true : (BEATS[wsAct] === intent);
      const wsDraw = state.warCryThisTurn ? false : (wsAct === intent);
      // Shared loss helper (full hit, incl. blood-curse extra) for non-Purify schemes.
      const takeSchemeLoss = (schemeAct) => {
        let taken = lossDmgTaken(schemeAct, enemyBaseDmg());
        taken = applyBerserkTaken(taken);
        const extraTaken = getPlayerExtraDmgTaken(ss);
        if (extraTaken > 0) taken += extraTaken;
        taken = epicTakenMod(taken);
        applyTakenToPlayer(taken);
        onMonsterHit(ss, buildSpecialCtx(), taken);
        state.enemyActed = true;
        return taken;
      };

      if (weapon.id === "staff") {
        // PURIFY: guaranteed GUARD, clear all debuffs, no refund, no heal.
        const cleared = clearPlayerDebuffs();
        if (wsWin) {
          const dealt = enemyTakeDmg(epicDealtMod(applyBerserkDealt(arcaneAbil(S.guard_win_dmg)) + flatAtkBonus()));
          line += `${wsName}: GUARD win, deal ${dealt}${cleared ? ", debuffs cleared" : ""}`;
        } else {
          // GUARD reduces the incoming hit (handled by lossDmgTaken for GUARD).
          let taken = lossDmgTaken("GUARD", enemyBaseDmg());
          taken = epicTakenMod(applyBerserkTaken(taken));
          applyTakenToPlayer(taken);
          if (taken > 0) state.enemyActed = true;
          line += `${wsName}: GUARD, took ${taken}${cleared ? ", debuffs cleared" : ""}`;
        }
      } else if (weapon.id === "spear") {
        // THRUST: guaranteed SLASH, deal 1.3x slash dmg REGARDLESS of outcome.
        // You still take the hit if the matchup loses.
        const dealt = enemyTakeDmg(epicDealtMod(applyBerserkDealt(arcaneAbil(Math.floor(S.slash_dmg * 1.3))) + flatAtkBonus()));
        let extra = "";
        if (!wsWin && !wsDraw) extra = `, took ${takeSchemeLoss("SLASH")}`;
        line += `${wsName}: deal ${dealt} (1.3x any outcome)${extra}`;
      } else {
        // SWORD Riposte (COUNTER, 1.5x on win) / AXE Cleave (SLASH, enemy Berserk on win).
        if (wsWin) {
          let base = wsAct === "COUNTER" ? S.counter_win_dmg : S.slash_dmg;
          if (weapon.id === "sword") base = Math.floor(base * 1.5); // Riposte payoff
          const dealt = enemyTakeDmg(epicDealtMod(applyBerserkDealt(arcaneAbil(base)) + flatAtkBonus()));
          let bonus = "";
          if (weapon.id === "axe") {
            state.enemyVulnerableTurns = 2; // Cleave: enemy Berserk 2 turns (+50% dmg taken)
            bonus = " (enemy Berserk +50% taken, 2t)";
          } else {
            bonus = " (1.5x)";
          }
          line += `${wsName}: win, deal ${dealt}${bonus}`;
        } else if (wsDraw) {
          line += `${wsName}: DRAW (0)`;
        } else {
          line += `${wsName}: loss, took ${takeSchemeLoss(wsAct)}`;
        }
      }
      state.player.comboCount = 0;
      state.player.momentumStacks = 0;
      state.playerActed = true;
    } else if (action === "ULT") {
      // Bible v3.0 ULTIMATES (100e). Q3: enemy still hits this turn at -50% (unless it dies).
      state.player.energy -= ultCost;
      const ultName = weapon.ultimate.name.toUpperCase();
      if (weapon.id === "sword") {
        // BLADE STORM: 3 consecutive hits at 0.8x slash dmg each.
        const per = Math.floor(S.slash_dmg * 0.8);
        let total = 0;
        for (let i = 0; i < 3; i++) {
          if (state.enemy.hp <= 0) break;
          total += enemyTakeDmg(epicDealtMod(applyBerserkDealt(arcaneAbil(per)) + (i === 0 ? flatAtkBonus() : 0)));
        }
        line += `${ultName}: 3x${per} = ${total} dmg`;
      } else if (weapon.id === "spear") {
        // IMPALE: single 2.5x slash hit, ignores GUARD (armor/shield bypassed).
        const dealt = enemyTakeDmg(epicDealtMod(applyBerserkDealt(arcaneAbil(Math.floor(S.slash_dmg * 2.5))) + flatAtkBonus()), { ignoreArmor: true });
        line += `${ultName}: ${dealt} dmg (ignore GUARD)`;
      } else if (weapon.id === "axe") {
        // EXECUTIONER: instakill if enemy <30% HP (not boss/miniboss); else 2x slash dmg.
        const lowHp = state.enemy.hp < state.enemy.maxHp * 0.3;
        const protectedFoe = isBossFloor || isMinibossFloor;
        if (lowHp && !protectedFoe) {
          state.enemy.hp = 0;
          line += `${ultName}: INSTANT KILL!`;
        } else {
          const dealt = enemyTakeDmg(epicDealtMod(applyBerserkDealt(arcaneAbil(S.slash_dmg * 2)) + flatAtkBonus()));
          line += `${ultName}: ${dealt} dmg${lowHp && protectedFoe ? " (boss/miniboss immune to execute)" : ""}`;
        }
      } else if (weapon.id === "staff") {
        // ARCANE BLAST: 2x slash dmg + heal 15.
        const dealt = enemyTakeDmg(epicDealtMod(applyBerserkDealt(arcaneAbil(S.slash_dmg * 2)) + flatAtkBonus()));
        const healAmt = Math.min(15, state.player.maxHp - state.player.hp);
        didHeal += healAmt;
        state.player.hp += healAmt;
        line += `${ultName}: ${dealt} dmg, +${healAmt} HP`;
      }
      // Enemy free hit at -50% (skip if the ULT killed it, OR the enemy is
      // scheming this turn = it plays no normal attack).
      if (state.enemy.hp > 0 && !state.warCryThisTurn) {
        let taken = Math.floor(applyBerserkTaken(enemyBaseDmg()) / 2);
        taken = epicTakenMod(taken);
        applyTakenToPlayer(taken);
        if (taken > 0) line += `, took ${taken} (-50%)`;
      }
      state.player.comboCount = 0;
      state.player.momentumStacks = 0;
      state.playerActed = true; // ULT = always player pose
      if (prePlayerHp - state.player.hp > 0) state.enemyActed = true;
    } else {
      // Normal RPS
      if (action === intent) {
        line += "DRAW (0/0)";
        state.player.comboCount = 0;
        state.player.momentumStacks = 0;
        // 2.7c-3: Echo Stone resets on DRAW.
        state.echoStreak = 0;
        state.echoLastAction = null;
        state.player.energy += Math.floor(S.energy_regen_per_turn / 2) + Math.floor(bonusEnergyPerTurn(run) / 2) + Math.floor(energyRegenForge / 2);
        // DRAW cue: small shake + both sprites bump (no one wins this round)
        queueShake("small");
        anims.push({ kind: "bump", target: "player" });
        anims.push({ kind: "bump", target: "enemy" });
      } else if (BEATS[action] === intent) {
        // WIN
        state.player.comboCount++;
        let dmg = action === "SLASH" ? S.slash_dmg : action === "COUNTER" ? S.counter_win_dmg : S.guard_win_dmg;

        // 2.7b-2 Campfire SHARPEN buff: +N per action stack (permanent for run)
        const __buffs = run.actionBuffs || {};
        const __buffKey = action.toLowerCase(); // slash | guard | counter
        dmg += (__buffs[__buffKey] || 0);

        // Bible v3.0: Forge Combat T1 = +2 to ALL attacks (not just SLASH).
        dmg += dmgForgeBonus;

        // Relic SLASH dmg bonuses (broken_dagger +1, whetstone +2, berserker_stone +5).
        if (action === "SLASH") {
          // Live run snapshot so Berserker Stone sees the *current* battle HP.
          const liveRun = { ...run, playerHp: state.player.hp, playerMaxHp: state.player.maxHp };
          const sB = slashDmgBonus(liveRun);
          if (sB > 0) { dmg += sB; line += ` [SLASH relic +${sB}]`; }
          // Crow Feather: +2 gold per SLASH win (tracked, paid in reward)
          state.slashWins += 1;
        }
        // R9: Counterweight (+2 COUNTER win) / Parry Stud (+2 GUARD win).
        // + Chained Grimoire (+6 COUNTER win).
        if (action === "COUNTER") {
          const cwB = counterDmgBonus(run);
          const grB = grimoireCounterBonus(run);
          if (cwB > 0) { dmg += cwB; line += ` [Counterweight +${cwB}]`; }
          if (grB > 0) { dmg += grB; line += ` [Grimoire +${grB}]`; }
        }
        if (action === "GUARD") {
          const psB = guardWinDmgBonus(run);
          if (psB > 0) { dmg += psB; line += ` [Parry +${psB}]`; }
        }
        // R9: Momentum Coil -- +1 dmg per consecutive RPS win (cap +5), any action.
        const __mc = momentumCoilBonus(run, state.player.comboCount);
        if (__mc > 0) { dmg += __mc; line += ` [Momentum +${__mc}]`; }
        // R9: Glass Cannon (+6) + Soul Harvest (stacks) flat bonus to all attacks.
        const __flat = flatAtkBonus();
        if (__flat > 0) { dmg += __flat; line += ` [Power +${__flat}]`; }

        // Sword Momentum
        if (weapon.id === "sword" && (action === "SLASH" || action === "COUNTER")) {
          state.player.momentumStacks = Math.min(5, state.player.momentumStacks + 1);
        }
        if (weapon.id === "sword") {
          dmg += state.player.momentumStacks;
        }

        // Spear Precise Read: +2 dmg on COUNTER wins
        if (weapon.id === "spear" && action === "COUNTER") {
          dmg += 2;
        }

        // Axe Crit Strike: 20% chance x2 on SLASH/COUNTER wins (Bible v3.0 R2)
        let crit = false;
        if (weapon.id === "axe" && (action === "SLASH" || action === "COUNTER")) {
          if (rngNext() < 0.2) {
            dmg *= 2;
            crit = true;
            didCrit = true;
          }
        }

        // Combo 3+ bonus (+10%).
        if (state.player.comboCount >= 3) {
          dmg = Math.floor(dmg * 1.1);
        }

        // R9: Arcane Conduit -- basic RPS-win dmg -15% (favors ability play).
        {
          const __am = arcaneConduitBasicMult(run);
          if (__am !== 1.0) { const b = dmg; dmg = Math.floor(dmg * __am); if (b - dmg > 0) line += ` [Arcane -${b - dmg}]`; }
        }

        // Berserk dealt multiplier
        dmg = applyBerserkDealt(dmg);

        // 2.7c-3 EPIC: Echo Stone -- same basic action 2+ WIN streak -> +25%.
        if (hasEchoStone(run)) {
          if (state.echoLastAction === action) {
            state.echoStreak += 1;
          } else {
            state.echoStreak = 1;
            state.echoLastAction = action;
          }
          if (state.echoStreak >= 2) {
            const before = dmg;
            dmg = Math.floor(dmg * 1.25);
            line += ` [Echo x${state.echoStreak} +${dmg - before}]`;
          }
        }
        // 2.7c-3 EPIC: Crown + Serpent Belt modifiers via epicDealtMod.
        dmg = epicDealtMod(dmg);
        // 2.7c-3 EPIC: Void Crown -- next attack after READ +10% IF attack action.
        if (state.voidCrownPendingBonus && (action === "SLASH" || action === "COUNTER")) {
          const before = dmg;
          dmg = Math.floor(dmg * 1.1);
          state.voidCrownPendingBonus = false;
          line += ` [VoidCrown +${dmg - before}]`;
        }

        // Bible v3.0: Axe Cleave -- enemy Berserk makes it take +50% damage.
        if (state.enemyVulnerableTurns > 0) {
          dmg = Math.floor(dmg * 1.5);
        }

        // Telegraph free-hit penalty (buff/turtle wind-up): weaken the basic poke
        // (min 1). Applied before dodge/armor so it stacks like a true dmg cut.
        if (state.telegraphDmgMult !== 1 && dmg > 0) {
          const _pre = dmg;
          dmg = Math.max(1, Math.floor(dmg * state.telegraphDmgMult));
          state.telegraphReducedThisTurn += (_pre - dmg);
        }
        // Specials: enemy dodge chance (phase_shift etc.)
        const dodgeRoll = getEnemyDodgeChance(ss);
        if (dodgeRoll > 0 && rngNext() < dodgeRoll) {
          dmg = 0;
          line += "DODGED";
        }
        // Specials: enemy armor (stone_skin, plate_armor etc.) reduces dmg.
        if (dmg > 0) {
          let armor = getEnemyArmor(ss);
          // R9: Ethereal Edge -- ignore 50% of enemy armor.
          if (armor > 0 && etherealArmorPenFrac(run) > 0) armor = Math.floor(armor * (1 - etherealArmorPenFrac(run)));
          if (armor > 0) {
            const after = Math.max(1, dmg - armor);
            state.armorBlockedThisTurn += (dmg - after);
            dmg = after;
          }
          // Specials: ice_shield / bone_shield absorb remaining dmg.
          dmg = absorbShield(ss, dmg);
        }
        state.enemy.hp -= dmg;
        line += `WIN deal ${dmg}${crit ? " * CRIT!" : ""}`;
        state.player.energy += S.energy_regen_per_turn + bonusEnergyPerTurn(run) + energyRegenForge;
        state.playerActed = true; // RPS WIN = player pose

        // 2.7c-2 rare hooks on RPS WIN
        if (action === "SLASH") {
          // 2.7c-3 EPIC: Devil's Bargain -- self-dmg per SLASH win.
          const selfDmg = devilsBargainSelfDmgPerSlashWin(run);
          if (selfDmg > 0) {
            applyTakenToPlayer(selfDmg);
            line += ` (-${selfDmg} self Devil's Bargain)`;
          }
          // Vampire Fang: heal per SLASH win
          const vHeal = healPerSlashWin(run);
          if (vHeal > 0 && state.player.hp < state.player.maxHp) {
            const before = state.player.hp;
            state.player.hp = Math.min(state.player.maxHp, state.player.hp + vHeal);
            didHeal += state.player.hp - before;
            line += ` (+${state.player.hp - before} HP Fang)`;
          }
          // Frostbite Shard: 15% chance to freeze enemy next turn
          if (rollFrostbiteFreeze(run)) {
            state.enemyFrozenNextTurn = true;
            line += " (Frostbite!)";
          }
        }
        if (action === "GUARD") {
          // Mirror Shield: reflect 50% of base enemy dmg on GUARD win
          const frac = mirrorReflectFrac(run);
          if (frac > 0) {
            const reflect = Math.floor(enemyDef.dmg * frac);
            if (reflect > 0) {
              state.enemy.hp -= reflect;
              line += ` (Mirror +${reflect})`;
            }
          }
          // R9: Frost Lattice -- 20% chance on GUARD win to freeze enemy next turn.
          if (rollFrostLatticeFreeze(run)) {
            state.enemyFrozenNextTurn = true;
            line += " (Frost Lattice!)";
          }
        }
        // Staff Arcane Recovery: +1 HP per RPS win, cap maxHp
        if (weapon.id === "staff") {
          if (state.player.hp < state.player.maxHp) {
            state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
            didHeal += 1;
            line += " (+1 HP)";
          }
        }
      } else {
        // LOSS
        const base = enemyBaseDmg(); // includes specials dmg bonus + enraged
        let taken = lossDmgTaken(action, base);
        taken = applyBerserkTaken(taken);
        // Specials: blood_curse / curse extra damage taken on hit.
        const extraTaken = getPlayerExtraDmgTaken(ss);
        if (extraTaken > 0) taken += extraTaken;
        // 2.7c-1: Iron Buckler -- GUARD blocks +3 extra dmg
        if (action === "GUARD") {
          taken = Math.max(0, taken - guardExtraBlock(run));
        }
        // 2.7c-3 EPIC: eye/crown/serpent modifiers.
        taken = epicTakenMod(taken);
        applyTakenToPlayer(taken);
        // Specials: on_hit triggers (poison_arrow, steal_gold, blood_drain etc.)
        onMonsterHit(ss, buildSpecialCtx(), taken);
        line += `LOSS took ${taken}`;
        state.player.comboCount = 0;
        state.player.momentumStacks = 0;
        // 2.7c-3: Echo Stone resets on LOSS.
        state.echoStreak = 0;
        state.echoLastAction = null;
        state.player.energy += S.energy_regen_per_turn + bonusEnergyPerTurn(run) + energyRegenForge;
        state.enemyActed = true; // RPS LOSS = enemy pose
      }
    }

    state.player.energy = Math.max(0, Math.min(state.player.maxEnergy, state.player.energy));
    state.player.hp = Math.max(0, state.player.hp);
    state.enemy.hp = Math.max(0, state.enemy.hp);
    // Explain enemy armor (Stone Skin etc.) in the log whenever it cut the
    // player's damage this turn, so the effect is visible across its duration.
    if (state.armorBlockedThisTurn > 0) {
      const ai = getEnemyArmorInfo(ss);
      if (ai) line += ` (${ai.label}: -${state.armorBlockedThisTurn}, ${ai.turnsLeft}t left)`;
    }
    // Telegraph free-hit penalty: show how much dmg the prep-hit penalty cut, so
    // the player understands why their free hit landed weaker than usual.
    if (state.telegraphReducedThisTurn > 0) {
      const tpct = Math.round((1 - state.telegraphDmgMult) * 100);
      line += ` (Telegraph -${tpct}%: -${state.telegraphReducedThisTurn} dmg)`;
    }
    state.log.push(line);
    console.log(`[battle] ${line}`);

    // TIER 2 (scheme timing): the enemy telegraphed its special last turn
    // ("...is charging AVALANCHE"). It now UNLEASHES — AFTER the player's free
    // hit this turn — so the flow reads: charge -> you strike -> it lands.
    if (state.warCryThisTurn && ss) {
      const _preBuffs = ss.buffs.length;
      executeScheme(ss, buildSpecialCtx());
      // Buffs added by the scheme this turn must NOT be ticked down by this same
      // resolve's tickEffects() -- mark them fresh so their full duration counts
      // from NEXT turn (e.g. Stone Skin -3 reduces 2 full turns, not 1).
      for (let i = _preBuffs; i < ss.buffs.length; i++) ss.buffs[i]._fresh = true;
      state.player.hp = Math.max(0, state.player.hp);
      state.enemy.hp = Math.max(0, state.enemy.hp);
    }

    // Queue animations based on deltas
    const enemyDmgDealt = preEnemyHp - state.enemy.hp;
    const playerDmgTaken = prePlayerHp - state.player.hp + didHeal; // exclude healing from "taken" count
    if (enemyDmgDealt > 0) {
      queueFloater("enemy", enemyDmgDealt, didCrit ? "crit" : "dmg");
      queueFlash("enemy");
      queueShake(didCrit || enemyDmgDealt >= 20 ? "big" : "small");
    }
    if (playerDmgTaken > 0) {
      queueFloater("player", playerDmgTaken, "dmg");
      queueFlash("player");
      queueShake(playerDmgTaken >= 15 ? "big" : "small");
    }
    // Sprite pose swap: only the WINNER of the round gets the attack pose (Murid rule).
    // ULT always gives player a pose, WILD gives both. enemyActed/playerActed set above.
    state.enemyAttacked = state.enemyActed;
    if (!state.playerActed) state.lastAction = null; // skip player pose swap on loss/draw
    if (didHeal > 0) {
      queueFloater("player", didHeal, "heal");
    }

    // Phoenix Ember (tooltip): 1x/battle, when HP drops below 20% maxHp, heal 15 HP.
    // Triggers while still alive (it's a heal, not a revive).
    if (hasPhoenixEmber(run) && !state.phoenixUsedThisBattle
        && state.player.hp > 0
        && state.player.hp < Math.ceil(state.player.maxHp * phoenixThresholdFrac())) {
      const heal = phoenixHealAmount();
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
      state.phoenixUsedThisBattle = true;
      queueFloater("player", heal, "heal");
      flashRelic("phoenix_ember", `+${heal}`);
      state.log.push(`* PHOENIX EMBER -- low HP, heal ${heal}! *`);
    }

    // Heart of Nimblade: one-shot revive at 30 HP if a lethal hit landed.
    // Runs BEFORE end checks so revive overrides the DEFEAT branch.
    if (state.player.hp <= 0 && state.enemy.hp > 0) {
      if (canHeartRevive(run)) {
        state.player.hp = 30;
        run.heartUsed = true;
        run.playerHp = 30;
        setState({ run });
        state.log.push("* HEART OF NIMBLADE -- revived at 30 HP! *");
      }
    }

    if (state.enemy.hp <= 0) {
      state.ended = "win";
      state.log.push("* VICTORY *");
      generateReward();
    } else if (state.player.hp <= 0) {
      state.ended = "lose";
      state.log.push("x DEFEAT x");
      // M2: shard payout on death. Per §7.1, player keeps 20% of total gold
      // earned as shards regardless of survival. Run-end overlay reads
      // state.runEndShards to display the result.
      state.runEndShards = payoutShards({ run, isCh1BossClear: false });
    } else {
      state.turn++;
      // Tick player buffs (berserk countdown)
      tickPlayerBuffs();
      // 2.7c-3 EPIC: turn-tick flags for Crown of Decision / Serpent Belt.
      state.crownTurnThisTurn = crownTurnActive(run, state.turn);
      state.serpentBeltThisTurn = serpentBeltActive(run, state.turn);
      if (state.crownTurnThisTurn) state.log.push(`Crown Turn -- all dmg x1.5 both sides.`);
      if (state.serpentBeltThisTurn) state.log.push(`Serpent Belt -- 0 dmg taken, 2x dmg dealt.`);

      // --- Per-turn relic effects (turns 2+) -------------------------------
      // Chained Grimoire: -5 energy per turn.
      const __drain = grimoireEnergyDrain(run);
      if (__drain > 0 && state.player.energy > 0) {
        state.player.energy = Math.max(0, state.player.energy - __drain);
        flashRelic("chained_grimoire", `-${__drain}⚡`);
        state.log.push(`Chained Grimoire: -${__drain} energy`);
      }
      // Berserker Stone: +2 self-dmg per round for the first 5 rounds.
      const __self = berserkerStoneSelfDmg(run, state.turn);
      if (__self > 0) {
        state.player.hp = Math.max(1, state.player.hp - __self);
        flashRelic("berserker_stone", `-${__self}`);
        state.log.push(`Berserker Stone: -${__self} HP (recoil)`);
      }
      // Holy Water: tick down the heal-disable window.
      if (state.enemyHealDisabledTurns > 0) state.enemyHealDisabledTurns -= 1;
      // Cleansing Bell: 1x/battle auto-clear curse/DoT the moment one is present.
      if (hasCleansingBell(run) && !state.cleansingBellUsed) {
        if (clearPlayerDebuffs()) {
          state.cleansingBellUsed = true;
          flashRelic("cleansing_bell", "CLEANSED");
          state.log.push(`Cleansing Bell: cleared all curse/DoT!`);
        }
      }

      // --- Monster Specials engine: tick effects + scheme logic ---------------
      // Tick timed buffs/debuffs (DoT, armor, dodge, honest_mod etc.)
      const tickResult = tickEffects(ss);
      if (tickResult.dotDmg > 0) {
        state.player.hp = Math.max(0, state.player.hp - tickResult.dotDmg);
        state.log.push(`${specialName(ss) || "Special"} DoT: -${tickResult.dotDmg} HP`);
      }
      // Player freeze from monster special (freeze etc.)
      state.playerFrozenThisTurn = isPlayerFrozen(ss);

      // Scheme bookkeeping: was the previous turn a scheme (war_cry etc)?
      const prevWarCry = state.warCryThisTurn;
      state.warCryThisTurn = false;
      state.enragedThisTurn = false;

      // Enraged = payoff turn AFTER a war_cry scheme
      let startEnragedTurn = prevWarCry && isEnragedThisTurn(ss);
      if (startEnragedTurn) consumeEnraged(ss);

      // Check if THIS turn is a scheme turn (monster uses special instead of RPS)
      let startSchemeTurn = !startEnragedTurn && isSchemeThisTurn(ss, state.turn);

      // Iron Will (tooltip): 1x/battle ignore one boss SCHEME (treat as honest).
      // Cancels the first scheme / enraged feint and forces the intent honest.
      let ironWillHonestThisTurn = false;
      if (hasIronWill(run) && !state.ironWillUsed && (startSchemeTurn || startEnragedTurn)) {
        startSchemeTurn = false;
        startEnragedTurn = false;
        state.ironWillUsed = true;
        ironWillHonestThisTurn = true;
        flashRelic("iron_will", "SAW IT");
        state.log.push(`* IRON WILL -- saw through the scheme (honest this turn)! *`);
      }

      // Roll next intent: actual first (prefer foresight queue = honest display), else normal gocek roll
      if (state.foresightQueue.length > 0) {
        state.actualIntent = state.foresightQueue.shift();
        state.intent = state.actualIntent; // foresight rounds: display = actual (100% honest)
        state.foresightActiveThisTurn = true;
      } else {
        state.actualIntent = rollActualIntent();
        // Enraged turn -> intent display lies more often (60% honest).
        const honestForThisRoll = startEnragedTurn ? 60 : undefined;
        // Specials: honest modifier from hex/scrying etc.
        const specialHonestMod = getEnemyHonestMod(ss);
        state.intent = rollDisplayedFor(state.actualIntent, honestForThisRoll);
        state.foresightActiveThisTurn = false;
        // Apply specials honest modifier (additive to base honest_pct).
        if (!startEnragedTurn && specialHonestMod !== 0) {
          const effectiveHonest = Math.max(0, Math.min(100, honestPct + specialHonestMod));
          state.intent = rollDisplayedFor(state.actualIntent, effectiveHonest);
        }
        // 2.7c-2: Time Glass / Eye of Omniscience forces honest display on turns 1-2.
        // 2.7c-3: Crown of Decision OVERRIDES -- intent uses chapter honesty (can lie).
        // NOTE: enraged turn intentionally bypasses honestIntentTurn so the feint can land.
        if ((honestIntentTurn(run, state.turn) || ironWillHonestThisTurn) && !state.crownTurnThisTurn && !startEnragedTurn) {
          state.intent = state.actualIntent;
        }
      }
      // 2.7c-2: Frostbite freeze applies to THIS new turn.
      if (state.enemyFrozenNextTurn) {
        state.enemyFrozenNextTurn = false;
        state.enemyFrozenThisTurn = true;
        state.actualIntent = "GUARD"; // enemy guards = deals 0
        state.intent = "GUARD";
        state.log.push("Enemy is FROZEN -- guards this turn.");
      } else {
        state.enemyFrozenThisTurn = false;
      }

      // Apply scheme / enraged flags + telegraphs (frozen skips scheme).
      if (startEnragedTurn && !state.enemyFrozenThisTurn) {
        state.enragedThisTurn = true;
        state.log.push(`* ${enemyDef.name} is ENRAGED -- next blow deals +50% (intent may lie!) *`);
      } else if (startSchemeTurn && !state.enemyFrozenThisTurn) {
        state.warCryThisTurn = true;
        const sName = specialName(ss) || "SPECIAL";
        if (schemeSkipsAttack(ss)) {
          state.actualIntent = "WARCRY";
          state.intent = "WARCRY";
        }
        // TIER 2: only TELEGRAPH here. The special resolves next turn, AFTER the
        // player commits their action (see the executeScheme call up in resolve()).
        state.log.push(`* ${enemyDef.name} is charging ${sName.toUpperCase()} -- strike now, it unleashes right after your hit! *`);
      }
    }
  };

  // 2.7c-2: extend global cheat (defined in main.js) with battle-only commands.
  window.cheat = window.cheat || {};
  Object.assign(window.cheat, {
    energy: (n) => { state.player.energy = n; render(); console.log(`[cheat] energy=${n}`); },
    enemyHp: (n) => { state.enemy.hp = n; render(); console.log(`[cheat] enemyHp=${n}`); },
    playerHp: (n) => { state.player.hp = n; render(); console.log(`[cheat] playerHp=${n}`); },
    win: () => { state.enemy.hp = 0; state.ended = "win"; state.log.push("* CHEAT VICTORY *"); generateReward(); render(); },
    lose: () => { state.player.hp = 0; state.ended = "lose"; state.log.push("x CHEAT DEFEAT x"); render(); },
  });
  console.log("[cheat] battle commands active -- cheat.help()");

  const render = () => {
    const intent = state.intent;
    const intentIcon = INTENT_ICON[intent] || "?";
    const idmg = intentDmgDisplay(intent);
    // 2.7d batch2: WAR CRY + ENRAGED intent telegraph (Goblin King).
    let intentHtml;
    if (state.warCryThisTurn || intent === "WARCRY") {
      const schemeName = (specialName(ss) || "WAR CRY").toUpperCase();
      intentHtml = `INTENT: <span class="b-intent__warcry">\u26A1 ${schemeName} -- charging</span>`;
    } else {
      const dmgText = intent === "GUARD" ? "defends" : `${idmg} DMG`;
      const enragedTag = state.enragedThisTurn ? ` <span class="b-intent__enraged">\u26A1 ENRAGED +50%</span>` : "";
      intentHtml = `INTENT: ${intentIcon} ${intent} -- <strong>${dmgText}</strong>${enragedTag}`;
    }
    // M5b: use forge-discounted costs (resolved at scene mount).
    const canUlt = !state.ended && state.player.energy >= ultCost;
    const canWild = !state.ended && state.player.energy >= wsCost;

    // Player buff chips
    const playerBuffs = [];
    if (state.player.berserkTurns > 0) {
      playerBuffs.push(`<span class="b-chip b-chip--berserk">BERSERK ${state.player.berserkTurns}t</span>`);
    }
    if (state.player.momentumStacks > 0 && weapon.id === "sword") {
      playerBuffs.push(`<span class="b-chip">MOMENTUM +${state.player.momentumStacks}</span>`);
    }
    const playerBuffsHtml = playerBuffs.length ? playerBuffs.join("") : `<span class="b-chip b-chip--none">none</span>`;

    // Enemy buff chips: merge old state.enemy.buffs with specials active effects.
    const specialLabels = activeEffectLabels(ss);
    const allEnemyBuffs = [...state.enemy.buffs, ...specialLabels];
    const enemyBuffsHtml = allEnemyBuffs.length
      ? allEnemyBuffs.map((b) => `<span class="b-chip">${b}</span>`).join("")
      : `<span class="b-chip b-chip--none">none</span>`;

    // 2.7d batch5: compact FORESIGHT to single chip line (was 2-line on iPhone SE).
    // Format: `[FORESIGHT] HONEST -- next [COUNTER] [SLASH]` or `next [COUNTER]`.
    let foresightHtml = "";
    if (state.foresightActiveThisTurn) {
      const nextChips = state.foresightQueue.length
        ? ` <span class="b-foresight__sep">--</span> next ${state.foresightQueue.map(i => `<span class="b-fs-chip">${INTENT_ICON[i]} ${i}</span>`).join(" ")}`
        : "";
      foresightHtml = `<div class="b-foresight"><span class="b-foresight__tag">FORESIGHT</span><span class="b-foresight__txt">HONEST${nextChips}</span></div>`;
    } else if (state.foresightQueue.length) {
      foresightHtml = `<div class="b-foresight"><span class="b-foresight__tag">FORESIGHT</span><span class="b-foresight__txt">next ${state.foresightQueue.map(i => `<span class="b-fs-chip">${INTENT_ICON[i]} ${i}</span>`).join(" ")}</span></div>`;
    }

    const pHpPct = (state.player.hp / state.player.maxHp) * 100;
    const pEngPct = (state.player.energy / state.player.maxEnergy) * 100;
    const eHpPct = (state.enemy.hp / state.enemy.maxHp) * 100;
    const ultPct = Math.min(100, (state.player.energy / ultCost) * 100);

    const action = (act, label, dmg, beats) => {
      const pending = state.pendingAction === act ? "b-act--pending" : "";
      const disabled = state.ended ? "disabled" : "";
      return `<button class="b-act ${pending}" data-action="action" data-act="${act}" ${disabled}>
        <div class="b-act__main">${label} <strong>${dmg}</strong></div>
        <div class="b-act__sub">Beats ${beats}</div>
      </button>`;
    };
    const logHtml = state.log.slice(-3).map((l) => `<div>${l}</div>`).join("");

    // Confirm bar with berserk warning
    let confirmExtra = "";
    if (state.pendingAction && state.player.berserkTurns > 0) {
      confirmExtra = ` <em class="b-confirm__warn">(BERSERK +100% dmg / +50% taken)</em>`;
    }
    const confirmBar = state.pendingAction ? `
      <div class="b-confirm">
        <span>Confirm <strong>${state.pendingAction}</strong>?${confirmExtra}</span>
        <button class="btn btn--primary b-confirm__yes" data-action="confirm">CONFIRM</button>
        <button class="btn btn--secondary b-confirm__no" data-action="cancel">CANCEL</button>
      </div>` : "";

    // End / Reward overlay
    // If overlay already shown once this scene, skip entry animation to
    // prevent flash on every re-render (e.g. relic tap-to-select).
    const noAnim = endOverlayShown ? "b-end--no-anim" : "";
    let endOverlay = "";
    if (state.ended === "lose") {
      // M2: shard payout summary (set when state.ended flipped to "lose").
      const lossShards = state.runEndShards || { shardsEarned: 0, ascMultiplier: 1.0 };
      const lossShardLine = lossShards.demo
        ? `<div class="b-end__stats b-end__stats--muted">\ud83c\udfae Demo run \u00b7 connect your Nimiq wallet to earn shards</div>`
        : (lossShards.shardsEarned > 0
          ? `<div class="b-end__shards">\ud83d\udc8e +${lossShards.shardsEarned} shards earned</div>`
          : `<div class="b-end__stats b-end__stats--muted">No shards earned (need gold to convert)</div>`);
      endOverlay = `
      <div class="b-end b-end--lose ${noAnim}">
        <div class="b-end__title">x GAME OVER x</div>
        <div class="b-end__sub">You fell to ${enemyDef.name} on Floor ${state.floor}/${state.floorMax}</div>
        <div class="b-end__stats">Gold earned: ${run.totalGoldEarned || 0} - Relics: ${(run.relics || []).length}</div>
        ${lossShardLine}
        <button class="btn btn--primary b-end__btn" data-action="end-back">BACK TO LOBBY</button>
      </div>`;
    } else if (state.ended === "win" && isMinibossFloor) {
      // Miniboss reward: guaranteed epic relic (auto-grant like boss, but returns to map).
      const rwd = state.rewardData || { gold: 0, autoGrantedRelic: null };
      const granted = rwd.autoGrantedRelic;
      const grantedCard = granted ? `
        <div class="b-reward__pick">MINIBOSS DROP -- EPIC RELIC</div>
        <div class="b-reward__relics">
          <div class="b-reward__relic b-reward__relic--selected b-reward__relic--auto">
            <span class="b-reward__relic-name">${granted.name}</span>
            <span class="b-reward__relic-desc">${granted.description}</span>
            <span class="b-reward__relic-tier">EPIC</span>
          </div>
        </div>` : "";
      endOverlay = `
      <div class="b-end b-end--win b-end--reward ${noAnim}">
        <div class="b-reward__head">
          <div class="b-reward__title">* MINIBOSS DOWN *</div>
          <div class="b-reward__sub">${enemyDef.name} defeated in ${state.turn} turns</div>
          <div class="b-reward__gold">+${rwd.gold} gold (total ${(run.gold || 0) + rwd.gold})</div>
        </div>
        ${grantedCard}
        <div class="b-reward__actions">
          <button class="btn btn--primary" data-action="miniboss-take">TAKE RELIC & CONTINUE</button>
        </div>
      </div>`;
    } else if (state.ended === "win" && state.isBossFloor) {
      // 2.7d-stepC: Boss reward = player CHOICE. Two phases:
      //   Phase 1 (bossRewardTaken === null): show relic + TAKE / SKIP buttons
      //   Phase 2 (bossRewardTaken set): show CHAPTER COMPLETE celebration + back to lobby
      const rwd = state.rewardData || { gold: 0, autoGrantedRelic: null };
      const granted = rwd.autoGrantedRelic;
      if (state.bossRewardTaken === null) {
        // Phase 1: reward choice
        const grantedCard = granted ? `
          <div class="b-reward__pick">BOSS RELIC -- TAKE OR SKIP?</div>
          <div class="b-reward__relics">
            <div class="b-reward__relic b-reward__relic--selected b-reward__relic--auto">
              <span class="b-reward__relic-name">${granted.name}</span>
              <span class="b-reward__relic-desc">${granted.description}</span>
              <span class="b-reward__relic-tier">${(granted.tier || "rare").toUpperCase()}</span>
            </div>
          </div>` : "";
        endOverlay = `
        <div class="b-end b-end--win b-end--reward ${noAnim}">
          <div class="b-reward__head">
            <div class="b-reward__title">* BOSS DOWN *</div>
            <div class="b-reward__sub">${enemyDef.name} defeated in ${state.turn} turns</div>
            <div class="b-reward__gold">+${rwd.gold} gold (total ${(run.gold || 0) + rwd.gold})</div>
          </div>
          ${grantedCard}
          <div class="b-reward__actions">
            <button class="btn btn--primary" data-action="boss-take">TAKE RELIC</button>
            <button class="btn btn--secondary" data-action="boss-skip">SKIP -- +50 gold, +15 HP</button>
          </div>
        </div>`;
      } else {
        // Phase 2: chapter advance or run complete celebration
        const finalRun = getState().run || run;
        const isDemoMode = (finalRun.mode || run.mode) === "demo";
        const chNum = parseInt((run.chapter || "CH1").replace("CH", ""), 10);
        const bossName = enemyDef.name;
        const tookText = state.bossRewardTaken === "take"
          ? `Relic gained: <strong>${granted ? granted.name : "(none)"}</strong>`
          : `Skipped boss relic. <strong>+50 gold, +15 HP</strong> recovered.`;
        let ctaTitle, ctaSub, ctaButtons;
        if (state.chapterAdvance) {
          // Chapter advance: CH1→CH2 or CH2→CH3
          const nextCh = `CH${chNum + 1}`;
          ctaTitle = `\u2728 CHAPTER ${chNum} COMPLETE \u2728`;
          ctaSub = `${bossName} defeated! The journey continues into ${nextCh}.`;
          ctaButtons = `
            <button class="btn btn--primary b-end__btn" data-action="boss-finish">CONTINUE TO ${nextCh}</button>`;
        } else if (isDemoMode) {
          ctaTitle = "\u2728 DEMO COMPLETE \u2728";
          ctaSub = `${bossName} defeated! To unlock CH2 and CH3, connect your Nimiq wallet and start a full run.`;
          ctaButtons = `
            <button class="btn btn--primary b-end__btn" data-action="boss-finish">CONNECT WALLET &amp; PLAY CH2</button>
            <button class="btn btn--secondary b-end__btn" data-action="boss-finish">BACK TO LOBBY</button>`;
        } else {
          // CH3 final boss or run complete
          ctaTitle = "\u2728 RUN COMPLETE \u2728";
          ctaSub = `${bossName} defeated! You conquered all three chapters.`;
          ctaButtons = `
            <button class="btn btn--primary b-end__btn" data-action="boss-finish">RETURN TO LOBBY</button>`;
        }
        // M2: shard payout summary + Ascension-unlock celebration if applicable.
        const bossShards = state.runEndShards || { shardsEarned: 0, ascMultiplier: 1.0, ch1Unlocked: false };
        const ascNote = bossShards.ascMultiplier > 1.0
          ? ` <em class="b-end__stats--muted">(\u00d7${bossShards.ascMultiplier.toFixed(2)} Asc bonus)</em>`
          : "";
        const bossShardLine = bossShards.demo
          ? `<div class="b-end__stats b-end__stats--muted">\ud83c\udfae Demo run \u00b7 connect your Nimiq wallet to earn shards</div>`
          : `<div class="b-end__shards">\ud83d\udc8e +${bossShards.shardsEarned} shards earned${ascNote}</div>`;
        const unlockBanner = bossShards.ch1Unlocked
          ? `<div class="b-end__unlock">\ud83c\udf1f ASCENSION MODE UNLOCKED \u2014 try harder runs from the lobby!</div>`
          : "";
        endOverlay = `
        <div class="b-end b-end--win b-end--complete ${noAnim}">
          <div class="b-end__title">${ctaTitle}</div>
          <div class="b-end__sub">${ctaSub}</div>
          <div class="b-end__stats">${tookText}</div>
          <div class="b-end__stats">Final HP ${finalRun.playerHp}/${finalRun.playerMaxHp} -- Gold ${finalRun.totalGoldEarned || finalRun.gold || 0} -- Relics ${(finalRun.relics || []).length}</div>
          ${bossShardLine}
          ${unlockBanner}
          ${ctaButtons}
        </div>`;
      }
    } else if (state.ended === "win") {
      // Between-floor reward. 2.7b-1: gating by node tier.
      //   normal -> gold only, NEXT FLOOR
      //   elite  -> 3-pick (60c/40r), CONFIRM or skip
      const rwd = state.rewardData || { gold: 0, relicChoices: [], tier: "normal" };
      const isEliteReward = rwd.tier === "elite";
      const hasRelicPick = isEliteReward && (rwd.relicChoices || []).length > 0;
      const relicCards = (rwd.relicChoices || []).map((r) => {
        const sel = state.pendingRelicId === r.id ? "b-reward__relic--selected" : "";
        return `
        <button class="b-reward__relic ${sel}" data-action="select-relic" data-relic="${r.id}">
          <span class="b-reward__relic-name">${r.name}</span>
          <span class="b-reward__relic-desc">${r.description}</span>
          <span class="b-reward__relic-tier">${(r.tier || "common").toUpperCase()}</span>
        </button>`;
      }).join("");
      const confirmDisabled = state.pendingRelicId ? "" : "disabled";
      const confirmLabel = state.pendingRelicId ? "CONFIRM PICK" : "SELECT A RELIC FIRST";
      if (hasRelicPick) {
        // ELITE reward -- relic pick layout (scrollable, unchanged)
        endOverlay = `
        <div class="b-end b-end--win b-end--reward ${noAnim}">
          <div class="b-reward__head">
            <div class="b-reward__title">* ELITE DOWN *</div>
            <div class="b-reward__sub">Floor ${state.floor}/${state.floorMax} cleared - ${enemyDef.name} down in ${state.turn} turns</div>
            <div class="b-reward__gold">+${rwd.gold} gold (total ${(run.gold || 0) + rwd.gold})</div>
          </div>
          <div class="b-reward__pick">ELITE DROP - PICK 1 RELIC</div>
          ${rwd.bonusBanditRelic ? `<div class="b-reward__bonus">\ud83c\udff9 BANDIT BOUNTY: <strong>${rwd.bonusBanditRelic.name}</strong> (${(rwd.bonusBanditRelic.tier || "common").toUpperCase()}) -- auto-granted on confirm</div>` : ""}
          <div class="b-reward__relics">${relicCards}</div>
          <div class="b-reward__actions">
            <button class="btn btn--primary b-reward__confirm" data-action="confirm-relic" ${confirmDisabled}>${confirmLabel}</button>
            <button class="btn btn--secondary b-reward__skip" data-action="skip-relic">Skip (gold only)</button>
          </div>
        </div>`;
      } else {
        // 2.7d batch1: NORMAL win -- 3-zone layout (top title / mid info card / bottom NEXT FLOOR)
        endOverlay = `
        <div class="b-end b-end--win b-end--winsimple ${noAnim}">
          <div class="b-win__top">
            <div class="b-win__title">* VICTORY *</div>
          </div>
          <div class="b-win__mid">
            <div class="b-win__card">
              <div class="b-win__row"><span>Floor cleared</span><strong>${state.floor}/${state.floorMax}</strong></div>
              <div class="b-win__row"><span>Enemy</span><strong>${enemyDef.name}</strong></div>
              <div class="b-win__row"><span>Rounds</span><strong>${state.turn}</strong></div>
              <div class="b-win__row"><span>Gold gained</span><strong>+${rwd.gold}</strong></div>
              <div class="b-win__row b-win__row--total"><span>Total gold</span><strong>${(run.gold || 0) + rwd.gold}</strong></div>
            </div>
          </div>
          <div class="b-win__bottom">
            <button class="btn btn--primary b-win__next" data-action="skip-relic">NEXT FLOOR</button>
          </div>
        </div>`;
      }
    }

    // SURRENDER confirm modal (custom in-game, not browser confirm())
    let surrenderModal = "";
    if (state.showSurrenderConfirm) {
      surrenderModal = `
      <div class="b-modal-bg">
        <div class="b-modal">
          <div class="b-modal__title">SURRENDER?</div>
          <div class="b-modal__body">You'll abandon this run. Gold & relics earned this run will be lost.</div>
          <div class="b-modal__actions">
            <button class="btn btn--secondary" data-action="surrender-cancel">CANCEL</button>
            <button class="btn btn--primary b-modal__danger" data-action="surrender-yes">YES, SURRENDER</button>
          </div>
        </div>
      </div>`;
    }

    // 2.7d stepA: RUN INFO modal (custom in-game, replaces native alert())
    let runInfoModal = "";
    if (state.showRunInfo) {
      const rls = (run.relics || []);
      // 2.7d batch2: lookup relic name + description from relics.json (across all tiers).
      const allRelics = [
        ...(relicsData.commons || []),
        ...(relicsData.rares || []),
        ...(relicsData.epics || []),
        ...(relicsData.special || []),
      ];
      const relicMap = {};
      allRelics.forEach((r) => { relicMap[r.id] = r; });
      const tierIcon = (t) => t === "epic" ? "\u2728" : (t === "rare" ? "\u2734\ufe0f" : "\u25c6");
      const escHtml = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const rlsHtml = rls.length === 0
        ? `<div class="b-modal__row b-modal__row--muted">none yet</div>`
        : rls.map((rid) => {
            const r = relicMap[rid];
            if (!r) return `<div class="b-modal__row b-modal__row--relic">- ${escHtml(rid)}</div>`;
            const icon = tierIcon(r.tier);
            return `<div class="b-modal__row b-modal__row--relic">
              <div class="b-modal__relic-name">${icon} ${escHtml(r.name)}</div>
              <div class="b-modal__relic-desc">${escHtml(r.description || "")}</div>
            </div>`;
          }).join("");
      runInfoModal = `
      <div class="b-modal-bg" data-action="runinfo-close">
        <div class="b-modal b-modal--info" data-action="runinfo-stop">
          <div class="b-modal__title">RUN INFO</div>
          <div class="b-modal__body">
            <div class="b-modal__section">
              <div class="b-modal__row"><span>Mode</span><strong>${run.mode || "demo"}</strong></div>
              <div class="b-modal__row"><span>Weapon</span><strong>${weapon.name}</strong></div>
              <div class="b-modal__row"><span>Floor</span><strong>${state.floor}/${state.floorMax}</strong></div>
              <div class="b-modal__row"><span>Gold</span><strong>${run.gold || 0}</strong></div>
            </div>
            <div class="b-modal__section">
              <div class="b-modal__sub">CARRY-OVER (LIVE)</div>
              <div class="b-modal__row"><span>HP</span><strong>${state.player.hp}/${state.player.maxHp}</strong></div>
              <div class="b-modal__row"><span>Energy</span><strong>${state.player.energy}/${state.player.maxEnergy}</strong></div>
              <div class="b-modal__row"><span>Momentum</span><strong>${state.player.momentumStacks}</strong></div>
              <div class="b-modal__row"><span>Berserk turns left</span><strong>${state.player.berserkTurns}</strong></div>
              <div class="b-modal__row"><span>STUDY uses left</span><strong>${state.readUsesRemaining}/3</strong></div>
            </div>
            <div class="b-modal__section">
              <div class="b-modal__sub">RELICS (${rls.length})</div>
              ${rlsHtml}
            </div>
          </div>
          <div class="b-modal__actions">
            <button class="btn btn--primary" data-action="runinfo-close">CLOSE</button>
          </div>
        </div>
      </div>`;
    }

    // 2.7c-3: Void Crown -- READ cost reduced.
    const readCostUi = 60 + voidCrownReadCostDelta(run);
    const canRead = !state.ended && state.readUsesRemaining > 0 && state.player.energy >= readCostUi;
    const readReveals = 1 + voidCrownExtraHonestReveals(run);
    const readLabel = state.readUsesRemaining <= 0
      ? "STUDY - out of uses this run"
      : `STUDY (${state.readUsesRemaining} left) - ${readCostUi}e, reveal ${readReveals} honest`;
    const actionsBlock = state.ended ? "" : (state.pendingAction ? confirmBar : `
      <div class="b-acts-row">
        ${action("SLASH", "SLASH", S.slash_dmg, "COUNTER")}
        ${action("GUARD", "GUARD", S.guard_dmg_reduction_pct + "%", "SLASH")}
        ${action("COUNTER", "COUNTER", S.counter_win_dmg, "GUARD")}
      </div>
      <button class="b-wild ${canWild ? "" : "b-wild--off"}" data-action="action" data-act="WILD" ${canWild ? "" : "disabled"}>
        <strong>${weapon.weapon_skill.name.toUpperCase()}</strong> (${weapon.weapon_skill.action}) - ${weapon.weapon_skill.description} - ${wsCost}e
      </button>
      <button class="b-read ${canRead ? "" : "b-read--off"}" data-action="action" data-act="READ" ${canRead ? "" : "disabled"}>
        \u{1F441} ${readLabel}
      </button>`);

    const lowHpClass = state.player.hp > 0 && state.player.hp < state.player.maxHp * 0.25 ? "b-bar__fill--critical" : "";
    const enemyDyingClass = state.ended === "win" ? "b-sprite--dying" : "";
    const playerDyingClass = state.ended === "lose" ? "b-sprite--dying" : "";
    // Axe Berserk: while buff active, idle pose = ultimate (fire/bara look)
    const playerIdleSprite = (weapon.id === "axe" && state.player.berserkTurns > 0)
      ? "axe_ultimate"
      : `${weapon.id}_idle`;

    // 2.7e P1: footer relics row -- render owned relics with tier-coded chips.
    // Tap a chip -> tooltip with name + description. Empty slots stay dashed.
    const ownedRelicIds = run.relics || [];
    const _allRelicDefs = [
      ...(relicsData.commons || []),
      ...(relicsData.rares   || []),
      ...(relicsData.epics   || []),
      ...(relicsData.special || []),
    ];
    const _relicMap = {};
    _allRelicDefs.forEach((r) => { _relicMap[r.id] = r; });
    const _escHtml = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const _relicEmoji = (r) => {
      // Quick visual differentiator per tier when we have no sprite.
      if (!r) return "\u25c6";
      if (r.tier === "epic")    return "\u2728"; // sparkles
      if (r.tier === "rare")    return "\u2734\ufe0f"; // 4-point star
      if (r.tier === "special") return "\u{1F48E}"; // gem
      return "\u25c6"; // diamond
    };
    const _slotsToShow = Math.max(5, ownedRelicIds.length);
    let _relicChips = "";
    for (let i = 0; i < _slotsToShow; i++) {
      const rid = ownedRelicIds[i];
      if (!rid) {
        _relicChips += `<div class="b-relics__slot b-relics__slot--empty"></div>`;
        continue;
      }
      const r = _relicMap[rid];
      const tier = r?.tier || "common";
      const name = _escHtml(r?.name || rid);
      _relicChips += `<button class="b-relics__slot b-relics__slot--owned b-relics__slot--${tier}" data-action="relic-show" data-rid="${rid}" aria-label="${name}" title="${name}">${_relicEmoji(r)}</button>`;
    }
    const relicsRowHtml = `
      <div class="b-relics">
        <span class="b-relics__label">RELICS:</span>
        <div class="b-relics__row">${_relicChips}</div>
      </div>`;

    // 2.7e P1: relic tooltip modal -- shown when state.showRelicId is set.
    let relicTooltip = "";
    if (state.showRelicId) {
      const r = _relicMap[state.showRelicId];
      if (r) {
        const tier = r.tier || "common";
        const tierLabel = tier.toUpperCase();
        relicTooltip = `
        <div class="b-modal-bg" data-action="relic-close">
          <div class="b-modal b-modal--tooltip b-modal--tier-${tier}" data-action="relic-stop">
            <div class="b-modal__tooltip-head">
              <span class="b-modal__tooltip-icon">${_relicEmoji(r)}</span>
              <div>
                <div class="b-modal__title">${_escHtml(r.name)}</div>
                <div class="b-modal__tooltip-tier">${tierLabel} RELIC</div>
              </div>
            </div>
            <div class="b-modal__body">
              <div class="b-modal__tooltip-desc">${_escHtml(r.description || "")}</div>
            </div>
            <div class="b-modal__actions">
              <button class="btn btn--primary" data-action="relic-close">CLOSE</button>
            </div>
          </div>
        </div>`;
      }
    }

    root.innerHTML = `
      <div class="b-screen" style="background-image:url('/assets/${bgImg}')">
        <div class="b-header">
          <button class="b-icon-btn" data-action="settings">SET</button>
          <div class="b-stage">${state.chapter} - FLOOR ${state.floor}/${state.floorMax}${isMinibossFloor ? " [MINIBOSS]" : ""}</div>
          <button class="b-icon-btn b-runinfo" data-action="runinfo">RUN INFO</button>
        </div>
        <div class="b-zone">
          <div class="b-side b-side--player">
            <div class="b-side__info">
              <div class="b-side__label">YOU</div>
              <div class="b-bar"><div class="b-bar__fill b-bar__fill--hp ${lowHpClass}" style="width:${pHpPct}%"></div><span class="b-bar__text">HP ${state.player.hp}/${state.player.maxHp}</span></div>
              <div class="b-bar"><div class="b-bar__fill b-bar__fill--eng" style="width:${pEngPct}%"></div><span class="b-bar__text">ENG ${state.player.energy}/${state.player.maxEnergy}</span></div>
              <div class="b-buffs">BUFFS: ${playerBuffsHtml}</div>
            </div>
            <div class="b-sprite ${playerDyingClass}" style="background-image:url('/assets/${playerIdleSprite}.png')"></div>
          </div>
          <div class="b-side b-side--enemy">
            <div class="b-side__info">
              <div class="b-side__label">${enemyDef.name.toUpperCase()}</div>
              <div class="b-bar"><div class="b-bar__fill b-bar__fill--enemyhp" style="width:${eHpPct}%"></div><span class="b-bar__text">${hasTorch(run) ? `HP ${state.enemy.hp}/${state.enemy.maxHp}` : `HP ${Math.max(0, Math.ceil(eHpPct))}%`}</span></div>
              <div class="b-intent ${state.warCryThisTurn ? "b-intent--warcry" : ""} ${state.enragedThisTurn ? "b-intent--enraged" : ""}">${intentHtml}</div>
              ${foresightHtml}
              <div class="b-buffs">BUFFS: ${enemyBuffsHtml}</div>
            </div>
            <div class="b-sprite ${enemyDyingClass}" style="background-image:url('/assets/${spriteId}.png')"></div>
          </div>
        </div>
        <div class="b-mid b-mid--2col">
          <div class="b-card">
            <div class="b-card__title">${weapon.name.toUpperCase()}</div>
            <div class="b-card__small"><strong>${weapon.passive.name}</strong></div>
            <div class="b-card__small">Stacks: ${state.player.momentumStacks}</div>
            <div class="b-card__small">Combo: x${state.player.comboCount}</div>
          </div>
          <button class="b-card b-card--ult ${canUlt ? "b-card--ready" : ""}" data-action="ult" ${!canUlt ? "disabled" : ""}>
            <div class="b-card__title">${weapon.ultimate.name.toUpperCase()}</div>
            <div class="b-bar b-bar--ult"><div class="b-bar__fill b-bar__fill--ult" style="width:${ultPct}%"></div><span class="b-bar__text">${state.player.energy}/${ultCost}</span></div>
            <div class="b-card__small">${canUlt ? "TAP TO USE" : weapon.ultimate.description}</div>
          </button>
        </div>
        <div class="b-battlelog">
          <div class="b-battlelog__title">BATTLE LOG &middot; ROUND ${state.turn}</div>
          <div class="b-battlelog__lines">${logHtml || '<div class="b-battlelog__empty">No actions yet</div>'}</div>
        </div>
        <div class="b-prompt">CHOOSE YOUR MOVE</div>
        ${actionsBlock}
        ${state.ended ? "" : `<button class="b-surrender" data-action="flee">SURRENDER</button>`}
        ${relicsRowHtml}
        ${endOverlay}
        ${surrenderModal}
        ${runInfoModal}
        ${relicTooltip}
      </div>`;
    // After first render that included end overlay, suppress entry animation
    // on subsequent re-renders (relic tap, etc.) so it doesn't flash.
    if (state.ended) endOverlayShown = true;
  };

  const swapSprite = (sel, newUrl, ms = 1800) => {
    const el = root.querySelector(sel);
    if (!el) return;
    const orig = el.style.backgroundImage;
    el.style.backgroundImage = `url('${newUrl}')`;
    setTimeout(() => {
      // only revert if same element still in DOM
      if (el.isConnected) el.style.backgroundImage = orig;
    }, ms);
  };

  const flushSpriteSwaps = () => {
    if (state.lastAction) {
      const map = { SLASH: "slash", GUARD: "guard", COUNTER: "counter", WILD: "slash", ULT: "ultimate" };
      const variant = map[state.lastAction] || "idle";
      swapSprite(".b-side--player .b-sprite", `/assets/${weapon.id}_${variant}.png`);
      state.lastAction = null;
    }
    if (state.enemyAttacked) {
      swapSprite(".b-side--enemy .b-sprite", `/assets/${spriteId}_attack.png`);
      state.enemyAttacked = false;
    }
  };

  const flushAnims = () => {
    const screen = root.querySelector(".b-screen");
    anims.forEach((a) => {
      if (a.kind === "shake" && screen) {
        const cls = `b-screen--shake-${a.level}`;
        screen.classList.remove(cls);
        // force reflow so animation restarts
        void screen.offsetWidth;
        screen.classList.add(cls);
        setTimeout(() => screen.classList.remove(cls), 400);
      } else if (a.kind === "flash") {
        const sprite = root.querySelector(`.b-side--${a.target} .b-sprite`);
        if (!sprite) return;
        sprite.classList.add("b-sprite--hit");
        setTimeout(() => sprite.classList.remove("b-sprite--hit"), 200);
      } else if (a.kind === "bump") {
        const sprite = root.querySelector(`.b-side--${a.target} .b-sprite`);
        if (!sprite) return;
        sprite.classList.add("b-sprite--bump");
        setTimeout(() => sprite.classList.remove("b-sprite--bump"), 280);
      } else if (a.kind === "float") {
        const sprite = root.querySelector(`.b-side--${a.target} .b-sprite`);
        if (!sprite) return;
        const el = document.createElement("div");
        el.className = `b-floater b-floater--${a.type}`;
        el.textContent = a.type === "heal" ? `+${a.value}` : (a.type === "crit" ? `* ${a.value} *` : `${a.value}`);
        sprite.appendChild(el);
        el.addEventListener("animationend", () => el.remove());
      } else if (a.kind === "relictrigger") {
        const chip = root.querySelector(`[data-rid="${a.rid}"]`);
        if (!chip) return;
        chip.classList.remove("b-relics__slot--trigger");
        void chip.offsetWidth; // force reflow so the animation restarts
        chip.classList.add("b-relics__slot--trigger");
        setTimeout(() => chip.classList.remove("b-relics__slot--trigger"), 800);
        if (a.label) {
          const fl = document.createElement("div");
          fl.className = "b-relics__floater";
          fl.textContent = a.label;
          chip.appendChild(fl);
          fl.addEventListener("animationend", () => fl.remove());
        }
      }
    });
    anims.length = 0;
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    if (action === "flee") {
      state.showSurrenderConfirm = true;
      render();
    } else if (action === "surrender-cancel") {
      state.showSurrenderConfirm = false;
      render();
    } else if (action === "surrender-yes") {
      // M2: surrender still pays out shards per §7.1 ("regardless of survival").
      payoutShards({ run, isCh1BossClear: false });
      mountScene("lobby", root);
    } else if (action === "end-back") {
      mountScene("lobby", root);
    } else if (action === "select-relic") {
      state.pendingRelicId = t.dataset.relic || null;
      render();
    } else if (action === "confirm-relic") {
      if (!state.pendingRelicId) return;
      applyRewardAndAdvance(state.pendingRelicId);
    } else if (action === "skip-relic") {
      applyRewardAndAdvance(null);
    } else if (action === "boss-take") {
      applyBossReward(true);
    } else if (action === "boss-skip") {
      applyBossReward(false);
    } else if (action === "miniboss-take") {
      // Miniboss: auto-grant epic relic, then return to map.
      if (!state.rewardData) return;
      const relicId = state.rewardData.autoGrantedRelic ? state.rewardData.autoGrantedRelic.id : null;
      applyRewardAndAdvance(relicId);
    } else if (action === "boss-finish") {
      if (state.chapterAdvance) {
        // v3.0 R0: chapter advance via runHelpers.advanceChapter.
        // chapter++, resets floor/floorMax + REGENERATES the map for the new
        // chapter. HP and energy now CARRY OVER (persistent the whole run).
        let advRun = { ...getState().run };
        delete advRun.nextChapter;
        const advanced = advanceChapter(advRun);
        if (advanced) {
          setState({ run: advanced });
          mountScene("map", root);
        } else {
          // Already final chapter (shouldn't happen here) -- fall back to lobby.
          setState({ run: null });
          mountScene("lobby", root);
        }
      } else {
        // Run complete or demo -- discard run, return to lobby.
        setState({ run: null });
        mountScene("lobby", root);
      }
    } else if (action === "runinfo") {
      state.showRunInfo = true;
      render();
      return;
    } else if (action === "runinfo-close") {
      // 2.7d stepA: backdrop or CLOSE button -> dismiss. Inner modal swallows via runinfo-stop.
      state.showRunInfo = false;
      render();
      return;
    } else if (action === "runinfo-stop") {
      // 2.7d stepA: noop -- prevents inner modal clicks from bubbling to backdrop close.
      return;
    } else if (action === "relic-show") {
      // 2.7e P1: tap a relic chip in the footer row -> show its tooltip modal.
      const rid = t.dataset.rid;
      if (rid) {
        state.showRelicId = rid;
        render();
      }
      return;
    } else if (action === "relic-close") {
      // 2.7e P1: backdrop tap or CLOSE button -> dismiss tooltip.
      state.showRelicId = null;
      render();
      return;
    } else if (action === "relic-stop") {
      // 2.7e P1: inner panel tap -- noop, just stops backdrop close from firing.
      return;
    } else if (action === "settings") {
      alert("Settings coming Step 2.10");
    } else if (action === "ult") {
      if (state.ended) return;
      state.pendingAction = "ULT";
      render();
    } else if (action === "action") {
      if (state.ended) return;
      state.pendingAction = t.dataset.act;
      render();
    } else if (action === "cancel") {
      state.pendingAction = null;
      render();
    } else if (action === "confirm") {
      const act = state.pendingAction;
      state.pendingAction = null;
      resolve(act);
      render();
      flushAnims();
      flushSpriteSwaps();
    }
  };
  root.addEventListener("click", onClick);
  render();
  flushAnims();
  return () => {
    root.removeEventListener("click", onClick);
    // 2.7c-2: only strip battle-scoped keys; keep global cheat alive across scenes.
    if (window.cheat) {
      delete window.cheat.energy;
      delete window.cheat.enemyHp;
      delete window.cheat.playerHp;
      delete window.cheat.win;
      delete window.cheat.lose;
    }
  };
}
