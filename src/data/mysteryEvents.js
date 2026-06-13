// src/data/mysteryEvents.js
//
// M9: Mystery node event table per Design Doc §6.3.
//
// Player enters a mystery node -> roll picks 1 of 6 events. The mystery scene
// uses these definitions to render the right UI/copy and to call the event's
// onAccept(run, ctx) handler when the player commits.
//
// Each event:
//   id        -- stable string
//   icon      -- emoji shown in header
//   name      -- title text
//   blurb     -- short fluff (the "what you see") line
//   primary   -- { label, costLabel?, isDisabled(run), apply(run, ctx) }
//   secondary -- optional { label, apply(run) }    (defaults to LEAVE)
//
// apply() MUST return { run, message?, transition? }:
//   run         -- new run object (immutable-style)
//   message     -- success-line for the result panel
//   transition  -- optional { scene: "battle", opts: {...} } for bandit ambush
//
// The mystery scene clones run via spread before passing it in, so callers can
// mutate freely (defensive).

import relicsData from "./relics.json";
import { acquireRelic } from "./relicEffects.js";

const COMMON_PRICE = { strong: 40, standard: 30, junk: 25 };
const RARE_PRICE_BY_WEIGHT = { 4: 60, 3: 75, 2: 85, 1: 90 };

/** Mystery relic distribution per §6.3.1. */
export function rollMysteryRelicTier(rng) {
  const r = (rng || Math.random)();
  const roll = Math.floor(r * 100);
  if (roll < 3) return "epic";
  if (roll < 33) return "rare";
  return "common";
}

/** Pick a random relic of the given tier that the run doesn't already own. */
export function pickMysteryRelic(run, tier, rng) {
  const owned = new Set((run.relics || []).map((r) => r.id || r));
  const pool = (tier === "epic" ? relicsData.epics
              : tier === "rare" ? relicsData.rares
              : relicsData.commons)
              .filter((r) => !owned.has(r.id));
  if (pool.length === 0) return null;
  // weighted
  const totalW = pool.reduce((s, r) => s + (r.weight || 1), 0);
  let pickRoll = (rng || Math.random)() * totalW;
  for (const r of pool) {
    pickRoll -= (r.weight || 1);
    if (pickRoll <= 0) return r;
  }
  return pool[0];
}

/** Base shop-style price for a relic (used by Wandering Merchant). */
export function basePriceFor(relic) {
  if (!relic) return 0;
  if (relic.tier === "common") return COMMON_PRICE[relic.subtier] || 30;
  if (relic.tier === "rare") return RARE_PRICE_BY_WEIGHT[relic.weight] || 75;
  return 90; // epic merchant fallback (shouldn't normally happen here)
}

// ----------------------------------------------------------------------------
// Event definitions
// ----------------------------------------------------------------------------

export const MYSTERY_EVENTS = [
  // 1. Wandering Merchant -- 1 relic offered at -25% discount.
  {
    id: "merchant",
    icon: "\ud83d\udecd\ufe0f",
    name: "Wandering Merchant",
    blurb: "A hooded trader unrolls a cloth. \"One item, traveler. Cheap for you.\"",
    initCtx(run, rng) {
      const tier = rollMysteryRelicTier(rng);
      const relic = pickMysteryRelic(run, tier, rng);
      if (!relic) return { skip: true };
      const basePrice = basePriceFor(relic);
      const price = Math.max(1, Math.ceil(basePrice * 0.75));
      return { relic, price };
    },
    describeOffer(ctx) {
      if (!ctx || !ctx.relic) return "Merchant has nothing left to sell.";
      return `Offered: <strong>${ctx.relic.name}</strong> (${ctx.relic.tier}) -- ${ctx.relic.description}<br/>Price: <strong>${ctx.price}g</strong> (-25% off)`;
    },
    primary: {
      label: (ctx) => ctx && ctx.relic ? `BUY (${ctx.price}g)` : "NOTHING TO BUY",
      isDisabled: (run, ctx) => !ctx || !ctx.relic || (run.gold || 0) < ctx.price,
      apply(run, ctx) {
        let next = { ...run, gold: (run.gold || 0) - ctx.price };
        next = acquireRelic(next, ctx.relic.id);
        return { run: next, message: `Acquired <strong>${ctx.relic.name}</strong> for ${ctx.price} gold.` };
      },
    },
  },

  // 2. Shrine of Gold -- sacrifice 10 HP -> 50 gold.
  {
    id: "shrine",
    icon: "\ud83e\ude99",
    name: "Shrine of Gold",
    blurb: "A small altar drips with coins. The carving reads: \"Blood for fortune.\"",
    describeOffer() {
      return "Sacrifice <strong>10 HP</strong> -> gain <strong>50 gold</strong>.";
    },
    primary: {
      label: () => "SACRIFICE (-10 HP / +50g)",
      isDisabled: (run) => (run.playerHp || 0) <= 10,
      apply(run) {
        const newHp = Math.max(1, (run.playerHp || 1) - 10);
        const newGold = (run.gold || 0) + 50;
        return {
          run: { ...run, playerHp: newHp, gold: newGold, totalGoldEarned: (run.totalGoldEarned || 0) + 50 },
          message: "You bleed onto the shrine. 50 gold materializes in your pouch.",
        };
      },
    },
  },

  // 3. Cursed Chest -- free random relic, 50% chance cursed next battle.
  {
    id: "cursed_chest",
    icon: "\ud83d\udce6",
    name: "Cursed Chest",
    blurb: "A heavy chest, half-buried. It hums faintly. Free to open... probably.",
    initCtx(run, rng) {
      const tier = rollMysteryRelicTier(rng);
      const relic = pickMysteryRelic(run, tier, rng);
      return { relic, curseRoll: (rng || Math.random)() };
    },
    describeOffer(ctx) {
      if (!ctx || !ctx.relic) return "The chest is empty.";
      return `Inside: <strong>${ctx.relic.name}</strong> (${ctx.relic.tier}) -- ${ctx.relic.description}<br/><span style=\"color:#ffb27a\">Warning: 50% chance cursed next battle (enemy +50% dmg).</span>`;
    },
    primary: {
      label: () => "CLAIM",
      isDisabled: (run, ctx) => !ctx || !ctx.relic,
      apply(run, ctx) {
        let next = acquireRelic(run, ctx.relic.id);
        const cursed = ctx.curseRoll < 0.5;
        if (cursed) next = { ...next, cursedNextBattle: true };
        return {
          run: next,
          message: cursed
            ? `Acquired <strong>${ctx.relic.name}</strong>. The chest hisses -- you feel a curse settle. Next battle: enemy damage +50%.`
            : `Acquired <strong>${ctx.relic.name}</strong>. The chest was clean. Lucky.`,
        };
      },
    },
  },

  // 4. Healing Spring -- 20 HP free.
  {
    id: "spring",
    icon: "\ud83d\udca7",
    name: "Healing Spring",
    blurb: "Crystal water bubbles from a mossy crack. It glows faintly blue.",
    describeOffer() {
      return "Drink and restore <strong>20 HP</strong>. No cost.";
    },
    primary: {
      label: () => "DRINK (+20 HP)",
      isDisabled: (run) => (run.playerHp || 0) >= (run.playerMaxHp || 100),
      apply(run) {
        const max = run.playerMaxHp || 100;
        const newHp = Math.min(max, (run.playerHp || 0) + 20);
        const healed = newHp - (run.playerHp || 0);
        return {
          run: { ...run, playerHp: newHp },
          message: `Healed ${healed} HP. Now ${newHp}/${max}.`,
        };
      },
    },
  },

  // 5. Ancient Rune -- +1 energy regen/turn permanent (run-only).
  {
    id: "rune",
    icon: "\ud83d\udd2e",
    name: "Ancient Rune",
    blurb: "A glowing rune is etched into the wall. Touching it warms your weapon.",
    describeOffer() {
      return "Attune to the rune: <strong>+1 energy regen / turn</strong> for the rest of this run.";
    },
    primary: {
      label: () => "ATTUNE (+1 regen)",
      isDisabled: () => false,
      apply(run) {
        const cur = run.runeEnergyBonus || 0;
        return {
          run: { ...run, runeEnergyBonus: cur + 1 },
          message: `The rune fades into your weapon. Energy regen now +${cur + 1} this run.`,
        };
      },
    },
  },

  // 6. Bandit Ambush -- elite fight, drops 2 relics if won.
  {
    id: "bandit",
    icon: "\ud83c\udff9",
    name: "Bandit Ambush",
    blurb: "A bandit blocks the path, blade drawn. \"Coin or blood, your choice.\"",
    describeOffer() {
      return "<strong>Elite battle</strong>. Win: 2 relics (extra mystery roll). Lose: death.<br/><span style=\"color:#ff9a9a\">You cannot leave -- only fight or stand still.</span>";
    },
    primary: {
      label: () => "FIGHT",
      isDisabled: () => false,
      apply(run) {
        // Flag battle.js to grant a bonus mystery-tier relic on victory.
        const next = { ...run, banditAmbushPending: true };
        return {
          run: next,
          transition: { scene: "battle", opts: { forceElite: true } },
        };
      },
    },
    // No secondary "leave" -- forced fight per design (decision tension).
    secondaryDisabled: true,
  },
];

/** Roll a random mystery event for a fresh mystery node. */
export function rollMysteryEvent(rng) {
  const r = rng || Math.random;
  const idx = Math.floor(r() * MYSTERY_EVENTS.length);
  return MYSTERY_EVENTS[Math.min(MYSTERY_EVENTS.length - 1, Math.max(0, idx))];
}
