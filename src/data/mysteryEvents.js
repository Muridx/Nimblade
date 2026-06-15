// src/data/mysteryEvents.js
//
// v3.0 MYS: Mystery node event table per Bible §8 + Design Lock v2.3 Q3.
//
// Locked 6-event set (equal weight 1/6):
//   1. Wandering Merchant — buy 1 rare relic for 35g
//   2. Hidden Stash       — gain 15–25g (random)
//   3. Cursed Chest       — gain 1 random relic + curse (-5 maxHP rest of run)
//   4. Healing Spring     — heal 20 HP (capped at max)
//   5. Hidden Vault       — choose: 30g safe OR 1 mystery relic (60c/30r/10e, tier hidden)
//   6. Bandit Ambush      — choose: pay 10g to flee OR fight bandit (50HP/9dmg/50%). Win=+20g.
//
// CUT from earlier code: Shrine of Gold, Ancient Rune (replaced by Hidden Stash / Hidden Vault).
//
// Each event:
//   id        -- stable string
//   icon      -- emoji shown in header
//   name      -- title text
//   blurb     -- short fluff
//   primary   -- { label, isDisabled?(run, ctx), apply(run, ctx) }
//   secondary -- optional alt action (Hidden Vault + Bandit Ambush use this)
//
// apply() returns { run, message?, transition? }

import relicsData from "./relics.json";
import { next as rngNext } from "./rng.js";
import { acquireRelic } from "./relicEffects.js";

// ---------------------------------------------------------------------------
// Relic helpers
// ---------------------------------------------------------------------------

/** Pick a random relic of the given tier that the run doesn't already own. */
export function pickMysteryRelic(run, tier, rng) {
  const owned = new Set((run.relics || []).map((r) => r.id || r));
  const pool = (tier === "epic" ? relicsData.epics
              : tier === "rare" ? relicsData.rares
              : relicsData.commons)
              .filter((r) => !owned.has(r.id));
  if (pool.length === 0) return null;
  const totalW = pool.reduce((s, r) => s + (r.weight || 1), 0);
  let pickRoll = (rng || rngNext)() * totalW;
  for (const r of pool) {
    pickRoll -= (r.weight || 1);
    if (pickRoll <= 0) return r;
  }
  return pool[0];
}

/** Roll mystery relic tier: 60% common, 30% rare, 10% epic (Design Lock Q3 / §8 Hidden Vault). */
export function rollMysteryRelicTier(rng) {
  const roll = Math.floor((rng || rngNext)() * 100);
  if (roll < 10) return "epic";   // 0–9   = 10%
  if (roll < 40) return "rare";   // 10–39 = 30%
  return "common";                // 40–99 = 60%
}

// ---------------------------------------------------------------------------
// Event definitions (locked set of 6)
// ---------------------------------------------------------------------------

export const MYSTERY_EVENTS = [
  // 1. Wandering Merchant — buy 1 rare relic for 35g.
  {
    id: "merchant",
    icon: "\ud83d\udecd\ufe0f",
    name: "Wandering Merchant",
    blurb: "A hooded trader unrolls a cloth. \"One item, traveler. Cheap for you.\"",
    initCtx(run, rng) {
      // Always offers a rare relic (§8: "Buy 1 rare relic for 35g").
      const relic = pickMysteryRelic(run, "rare", rng);
      if (!relic) return { skip: true };
      return { relic, price: 35 };
    },
    describeOffer(ctx) {
      if (!ctx || !ctx.relic) return "Merchant has nothing left to sell.";
      return `Offered: <strong>${ctx.relic.name}</strong> (rare) \u2014 ${ctx.relic.description}<br/>Price: <strong>35g</strong>`;
    },
    primary: {
      label: (ctx) => ctx && ctx.relic ? "BUY (35g)" : "NOTHING TO BUY",
      isDisabled: (run, ctx) => !ctx || !ctx.relic || (run.gold || 0) < 35,
      apply(run, ctx) {
        let next = { ...run, gold: (run.gold || 0) - 35 };
        next = acquireRelic(next, ctx.relic.id);
        return { run: next, message: `Acquired <strong>${ctx.relic.name}</strong> for 35 gold.` };
      },
    },
  },

  // 2. Hidden Stash — gain 15–25g (random).
  {
    id: "hidden_stash",
    icon: "\ud83d\udcb0",
    name: "Hidden Stash",
    blurb: "A glint of gold behind a loose stone. Looks untouched for years.",
    initCtx(_run, rng) {
      // Roll reward upfront so UI can show it.
      const amount = 15 + Math.floor((rng || rngNext)() * 11); // 15..25
      return { amount };
    },
    describeOffer(ctx) {
      return `You find <strong>${ctx.amount}g</strong> hidden in the wall. Take it?`;
    },
    primary: {
      label: (ctx) => `TAKE (+${ctx.amount}g)`,
      isDisabled: () => false,
      apply(run, ctx) {
        const newGold = (run.gold || 0) + ctx.amount;
        return {
          run: { ...run, gold: newGold, totalGoldEarned: (run.totalGoldEarned || 0) + ctx.amount },
          message: `Pocketed ${ctx.amount} gold. Total: ${newGold}g.`,
        };
      },
    },
  },

  // 3. Cursed Chest — gain 1 random relic + curse (-5 maxHP rest of run).
  {
    id: "cursed_chest",
    icon: "\ud83d\udce6",
    name: "Cursed Chest",
    blurb: "A heavy chest, half-buried. It hums faintly. Free to open... probably.",
    initCtx(run, rng) {
      const tier = rollMysteryRelicTier(rng);
      const relic = pickMysteryRelic(run, tier, rng);
      return { relic };
    },
    describeOffer(ctx) {
      if (!ctx || !ctx.relic) return "The chest is empty.";
      return `Inside: <strong>${ctx.relic.name}</strong> (${ctx.relic.tier}) \u2014 ${ctx.relic.description}<br/><span style="color:#ffb27a">Curse: <strong>-5 maxHP</strong> for the rest of this run.</span>`;
    },
    primary: {
      label: () => "CLAIM",
      isDisabled: (_run, ctx) => !ctx || !ctx.relic,
      apply(run, ctx) {
        let next = acquireRelic(run, ctx.relic.id);
        // Permanent curse: -5 maxHP for rest of run.
        const newMax = Math.max(1, (next.playerMaxHp || 100) - 5);
        next = { ...next, playerMaxHp: newMax };
        if ((next.playerHp || 0) > newMax) next.playerHp = newMax;
        return {
          run: next,
          message: `Acquired <strong>${ctx.relic.name}</strong>. A dark energy seeps in \u2014 maxHP reduced by 5 (now ${newMax}).`,
        };
      },
    },
  },

  // 4. Healing Spring — heal 20 HP (capped at max).
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

  // 5. Hidden Vault — choose: 30g safe OR 1 mystery relic (60c/30r/10e, tier hidden).
  {
    id: "hidden_vault",
    icon: "\ud83c\udfdb\ufe0f",
    name: "Hidden Vault",
    blurb: "A sealed vault. Inside: a pouch of coins and a locked reliquary. You can only carry one.",
    initCtx(run, rng) {
      const tier = rollMysteryRelicTier(rng);
      const relic = pickMysteryRelic(run, tier, rng);
      return { relic, vaultGold: 30 };
    },
    describeOffer(ctx) {
      const relicLine = ctx && ctx.relic
        ? `<strong>Mystery Relic</strong> (tier hidden \u2014 60% common / 30% rare / 10% epic)`
        : "<em>No relic available</em>";
      return `Choose one:<br/>\u2022 Take <strong>30g</strong> (safe)<br/>\u2022 Take ${relicLine}`;
    },
    primary: {
      label: () => "TAKE RELIC (\u2753)",
      isDisabled: (_run, ctx) => !ctx || !ctx.relic,
      apply(run, ctx) {
        const next = acquireRelic(run, ctx.relic.id);
        return {
          run: next,
          message: `You chose the reliquary. Inside: <strong>${ctx.relic.name}</strong> (${ctx.relic.tier})!`,
        };
      },
    },
    secondary: {
      label: "TAKE GOLD (30g)",
      apply(run, ctx) {
        const newGold = (run.gold || 0) + (ctx.vaultGold || 30);
        return {
          run: { ...run, gold: newGold, totalGoldEarned: (run.totalGoldEarned || 0) + 30 },
          message: `You took the safe choice. +30 gold (total: ${newGold}g).`,
        };
      },
    },
  },

  // 6. Bandit Ambush — choose: pay 10g flee OR fight bandit (50HP/9dmg/50%). Win=+20g.
  {
    id: "bandit",
    icon: "\ud83c\udff9",
    name: "Bandit Ambush",
    blurb: "A bandit blocks the path, blade drawn. \"Coin or blood, your choice.\"",
    describeOffer(ctx, run) {
      const canFlee = (run ? run.gold || 0 : 0) >= 10;
      return `<strong>Fight</strong> a bandit (50 HP / 9 dmg / 50% honest). Win = <strong>+20g</strong>. Lose = <strong>death</strong>.<br/>` +
        `Or <strong>pay 10g</strong> to flee${canFlee ? "" : " <span style=\"color:#ff9a9a\">(not enough gold)</span>"}.`;
    },
    primary: {
      label: () => "FIGHT",
      isDisabled: () => false,
      apply(run) {
        // Set up a bandit battle. battle.js reads banditAmbushPending to use
        // the bandit monster and award +20g on win.
        const next = { ...run, banditAmbushPending: true };
        return {
          run: next,
          transition: { scene: "battle", opts: { forceBandit: true } },
        };
      },
    },
    secondary: {
      label: "FLEE (pay 10g)",
      isDisabled: (run) => (run.gold || 0) < 10,
      apply(run) {
        const newGold = (run.gold || 0) - 10;
        return {
          run: { ...run, gold: newGold },
          message: `You toss 10 gold and slip away. The bandit grins. (${newGold}g left.)`,
        };
      },
    },
  },
];

/** Roll a random mystery event. Equal weight (1/6 each). */
export function rollMysteryEvent(rng) {
  const r = rng || rngNext;
  const idx = Math.floor(r() * MYSTERY_EVENTS.length);
  return MYSTERY_EVENTS[Math.min(MYSTERY_EVENTS.length - 1, Math.max(0, idx))];
}
