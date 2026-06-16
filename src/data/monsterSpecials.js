/**
 * NIMBLADE — MONSTER SPECIALS ENGINE (Bible v3.0 §4.2 + Appendix B)
 *
 * Central registry for all 25 unique monster special abilities.
 * battle.js calls into this module at key moments:
 *
 *   1. initSpecials(enemyDef)            — at battle start
 *   2. isSchemeThisTurn(ss, turn)        — before intent roll
 *   3. executeScheme(ss, ctx)            — on scheme turns
 *   4. onMonsterHit(ss, ctx, dmgDealt)   — after monster deals damage
 *   5. tickEffects(ss)                   — start of each turn (DoTs, expiry)
 *   6. Query helpers                     — during damage calc
 *
 * Special types:
 *   "scheme"   — activates every N turns (replaces normal RPS round)
 *   "on_hit"   — triggers when monster deals damage (no scheme turn)
 *   "passive"  — always active
 *
 * Buffer state lives in a `specialState` (ss) object created per battle.
 * battle.js owns the object; this module reads/writes it.
 */

// ── SPECIALS REGISTRY ────────────────────────────────────────────────────────

const SPECIALS = {
  // ── CH1 ──────────────────────────────────────────────────────────────────

  /** Goblin Warrior — +2 dmg for 2 turns */
  rally: {
    name: "Rally",
    type: "scheme",
    cooldown: 4,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_dmg", 2, 2);
      ctx.log("Enemy rallies — +2 DMG for 2 turns!");
    },
  },

  /** Goblin Archer — 3 poison dmg/turn for 3 turns */
  poison_arrow: {
    name: "Poison Arrow",
    type: "scheme",
    hitsPlayer: true,
    cooldown: 4,
    skipsAttack: false,
    directDmg: 0,
    execute(ss, ctx) {
      addBuff(ss, "player_dot", 3, 3, { label: "Poison" });
      ctx.log("Enemy fires a poison arrow — 3 dmg/turn for 3 turns!");
    },
  },

  /** Wild Wolf — +15% honest for 3 turns (monster telegraphs more clearly) */
  pack_howl: {
    name: "Pack Howl",
    type: "scheme",
    cooldown: 4,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_honest", 15, 3);
      ctx.log("Enemy howls — intent becomes more honest for 3 turns.");
    },
  },

  /** Goblin Shaman — drain 10 energy */
  hex: {
    name: "Hex",
    type: "scheme",
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      const drained = Math.min(ctx.playerEnergy(), 10);
      ctx.drainEnergy(drained);
      ctx.log(`Enemy casts Hex — you lose ${drained} energy!`);
    },
  },

  /** Cave Troll — take 3 less dmg for 2 turns */
  stone_skin: {
    name: "Stone Skin",
    type: "scheme",
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_armor", 3, 2, { label: "Stone Skin" });
      ctx.log("Enemy hardens — −3 damage taken for 2 turns!");
    },
  },

  /** Goblin King — +4 dmg for 2 turns + ENRAGED next turn (50% bonus) */
  war_cry: {
    name: "War Cry",
    type: "scheme",
    cooldown: 3,       // default; boss can override via scheme_every
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_dmg", 4, 2);
      ss.enragedNext = true;
      ctx.log("* Enemy lets out a WAR CRY — +4 DMG for 2 turns! *");
    },
  },

  // ── CH2 ──────────────────────────────────────────────────────────────────

  /** Ice Wolf — skip player's next turn */
  freeze: {
    name: "Freeze",
    type: "scheme",
    cooldown: 4,
    skipsAttack: true,
    execute(ss, ctx) {
      ss.playerFrozenNext = true;
      ctx.log("Enemy casts Freeze — you'll be unable to act next turn!");
    },
  },

  /** Dark Miner — take 4 less dmg for 2 turns */
  plate_armor: {
    name: "Plate Armor",
    type: "scheme",
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_armor", 4, 2, { label: "Plate Armor" });
      ctx.log("Enemy raises Plate Armor — −4 damage taken for 2 turns!");
    },
  },

  /** Mine Bat (CH2) — enemy becomes harder to read */
  screech: {
    name: "Screech",
    type: "scheme",
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_honest", -20, 2);
      ctx.log("Enemy screeches — intent becomes harder to read for 2 turns!");
    },
  },

  /** Frost Golem — absorb next 10 damage */
  ice_shield: {
    name: "Ice Shield",
    type: "scheme",
    cooldown: 4,
    skipsAttack: true,
    execute(ss, ctx) {
      ss.shield = (ss.shield || 0) + 10;
      ctx.log("Enemy raises an Ice Shield — absorbs 10 damage!");
    },
  },

  /** Snow Bandit — 8 direct damage, ignores guard */
  ambush: {
    name: "Ambush",
    type: "scheme",
    hitsPlayer: true,
    cooldown: 4,
    skipsAttack: true,
    execute(ss, ctx) {
      ctx.dealDirectDmg(8, "ignores guard");
      ctx.log("Enemy ambushes you — 8 damage (ignores guard)!");
    },
  },

  /** Frost Giant — 15 direct damage, ignores guard */
  avalanche: {
    name: "Avalanche",
    type: "scheme",
    hitsPlayer: true,
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      ctx.dealDirectDmg(7, "ignores guard");
      ctx.log("Enemy triggers AVALANCHE — 7 damage (ignores guard)!");
    },
  },

  /** Bandit Captain — steal 10g on hit */
  steal_gold: {
    name: "Steal Gold",
    type: "on_hit",
    execute(ss, ctx, _dmgDealt) {
      const stolen = Math.min(ctx.playerGold(), 10);
      if (stolen > 0) {
        ctx.stealGold(stolen);
        ctx.log(`Enemy steals ${stolen}g!`);
      }
    },
  },

  /** Hooded Sister (Miniboss) — CLOUDED SIGHT: intent veiled, narrowed to 2 of 3 RPS each turn */
  clouded_sight: {
    name: "Clouded Sight",
    type: "passive",
    // battle.js checks hasPassive(ss, "clouded_sight"): each turn her TRUE move is
    // restricted to a random 2 of 3 RPS, the intent icon shows a veil ("?"), and the
    // log names the 2 candidates. RPS stays winnable (no auto-lose); reveal relics &
    // READ pierce the veil.
    description: "Her intent is veiled — but it's only one of two moves (shown in the log).",
  },

  /** Ice Queen — drain 10 energy + deal 5 direct damage */
  blizzard: {
    name: "Blizzard",
    type: "scheme",
    hitsPlayer: true,
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      const drained = Math.min(ctx.playerEnergy(), 10);
      ctx.drainEnergy(drained);
      ctx.dealDirectDmg(5);
      ctx.log(`Enemy casts BLIZZARD — ${drained} energy drained + 5 damage!`);
    },
  },

  // ── CH3 ──────────────────────────────────────────────────────────────────

  /** Vampire Bat — heal 5 HP on hit */
  blood_sip: {
    name: "Blood Sip",
    type: "on_hit",
    execute(ss, ctx, _dmgDealt) {
      ctx.healEnemy(5);
      ctx.log("Enemy sips blood — heals 5 HP!");
    },
  },

  /** Skeleton Knight — take 3 less dmg for 3 turns */
  bone_shield: {
    name: "Bone Shield",
    type: "scheme",
    cooldown: 4,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_armor", 3, 3, { label: "Bone Shield" });
      ctx.log("Enemy raises Bone Shield — −3 damage taken for 3 turns!");
    },
  },

  /** Ghost — 100% dodge for 1 turn (intangible) */
  phase_shift: {
    name: "Phase Shift",
    type: "scheme",
    cooldown: 4,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_dodge", 1.0, 1);
      ctx.log("Enemy phases out — immune to damage for 1 turn!");
    },
  },

  /** Dark Witch — drain 15 energy */
  curse: {
    name: "Curse",
    type: "scheme",
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      const drained = Math.min(ctx.playerEnergy(), 15);
      ctx.drainEnergy(drained);
      ctx.log(`Enemy curses you — lose ${drained} energy!`);
    },
  },

  /** Gargoyle — take 5 less dmg for 2 turns */
  stone_form: {
    name: "Stone Form",
    type: "scheme",
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_armor", 5, 2, { label: "Stone Form" });
      ctx.log("Enemy turns to stone — −5 damage taken for 2 turns!");
    },
  },

  /** Shadow King — 50% dodge for 2 turns */
  shadow_clone: {
    name: "Shadow Clone",
    type: "scheme",
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "enemy_dodge", 0.5, 2);
      ctx.log("Enemy splits into shadows — 50% dodge for 2 turns!");
    },
  },

  /** Vampire Lord — heal 8 HP on hit */
  blood_drain: {
    name: "Blood Drain",
    type: "on_hit",
    execute(ss, ctx, _dmgDealt) {
      ctx.healEnemy(8);
      ctx.log("Enemy drains blood — heals 8 HP!");
    },
  },

  /** Renfield (Miniboss) — 3 dmg/turn for 3 turns */
  summon_bats: {
    name: "Summon Bats",
    type: "scheme",
    hitsPlayer: true,
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      addBuff(ss, "player_dot", 3, 3, { label: "Bats" });
      ctx.log("Enemy summons bats — 3 dmg/turn for 3 turns!");
    },
  },

  /** Count Dracula — cumulative +1 dmg taken per stack */
  blood_curse: {
    name: "Blood Curse",
    type: "scheme",
    cooldown: 3,
    skipsAttack: true,
    execute(ss, ctx) {
      ss.bloodCurseStacks = (ss.bloodCurseStacks || 0) + 1;
      ctx.log(
        `Enemy inflicts Blood Curse — you take +${ss.bloodCurseStacks} damage per hit (${ss.bloodCurseStacks} stack${ss.bloodCurseStacks > 1 ? "s" : ""})!`
      );
    },
  },
};

// ── Legacy aliases (match current monsters.json special keys) ────────────────
// These map old keys to Bible keys so existing monsters.json works until
// it's updated to Bible names. Remove after monsters.json v2 ships.

SPECIALS.aimed_shot = SPECIALS.poison_arrow;   // goblin_archer
SPECIALS.bloodlust = SPECIALS.pack_howl;       // wild_wolf
SPECIALS.hex_drain = SPECIALS.hex;             // goblin_shaman
SPECIALS.stoneform = SPECIALS.stone_form;      // cave_troll (old key)
SPECIALS.ice_armor = SPECIALS.avalanche;       // frost_giant (old key)
SPECIALS.mana_drain = SPECIALS.screech;        // frost_witch → mine_bat CH2
SPECIALS.lifesteal = SPECIALS.blood_drain;     // vampire_lord
SPECIALS.hex_aura = SPECIALS.shadow_clone;     // shadow_king
SPECIALS.dracula_phase2 = SPECIALS.blood_curse; // count_dracula

// ── BUFF / DEBUFF HELPERS ────────────────────────────────────────────────────

/**
 * Add a timed buff/debuff to the special state.
 *
 * Buff types:
 *   "enemy_dmg"     — bonus damage for monster  (value = flat bonus)
 *   "enemy_armor"   — damage reduction for monster (value = flat reduction)
 *   "enemy_dodge"   — dodge chance 0..1 (value = probability)
 *   "enemy_honest"  — honest_pct modifier (value = delta, can be negative)
 *   "player_dot"    — damage per turn to player (value = dmg/turn)
 *   "player_curse"  — extra damage taken per hit (value = flat)
 */
function addBuff(ss, type, value, turns, meta = {}) {
  ss.buffs.push({ type, value, turnsLeft: turns, ...meta });
}

// ── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Create a fresh special state for a battle.
 * Returns null if the enemy has no special.
 */
export function initSpecials(enemyDef) {
  const key = enemyDef && enemyDef.special;
  if (!key || !SPECIALS[key]) return null;

  const spec = SPECIALS[key];
  const cooldown =
    (typeof enemyDef.scheme_every === "number" && enemyDef.scheme_every > 0)
      ? enemyDef.scheme_every
      : spec.cooldown || 0;

  return {
    key,
    spec,
    cooldown,          // 0 = no scheme turns (on_hit/passive only)
    buffs: [],         // active buffs/debuffs
    shield: 0,         // ice_shield absorb pool
    bloodCurseStacks: 0,
    enragedNext: false, // war_cry ENRAGED flag
    playerFrozenNext: false,
    playerFrozenThisTurn: false,
    schemeFired: false, // track if scheme fired this turn (for render)
  };
}

/**
 * Should this turn be a scheme turn?
 * Scheme turns replace the normal RPS round.
 */
export function isSchemeThisTurn(ss, turn) {
  if (!ss || ss.spec.type !== "scheme") return false;
  if (ss.cooldown <= 0) return false;
  return turn > 0 && turn % ss.cooldown === 0;
}

/**
 * Execute the scheme special.
 * `ctx` is an adapter object created by battle.js with these methods:
 *   log(msg), playerEnergy(), drainEnergy(n), dealDirectDmg(n, tag),
 *   playerGold(), stealGold(n), healEnemy(n)
 */
export function executeScheme(ss, ctx) {
  if (!ss) return;
  ss.schemeFired = true;
  ss.spec.execute(ss, ctx);
}

/**
 * Call when monster deals damage via normal RPS resolution.
 * Triggers on_hit specials.
 */
export function onMonsterHit(ss, ctx, dmgDealt) {
  if (!ss || ss.spec.type !== "on_hit") return;
  ss.spec.execute(ss, ctx, dmgDealt);
}

/**
 * Tick all active buffs/debuffs. Call at start of each turn.
 * Returns { dotDmg, expired[] } so battle.js can log/animate.
 */
export function tickEffects(ss) {
  const result = { dotDmg: 0, expired: [] };
  if (!ss) return result;

  // Frozen flag: consume playerFrozenNext → playerFrozenThisTurn
  ss.playerFrozenThisTurn = ss.playerFrozenNext;
  ss.playerFrozenNext = false;
  ss.schemeFired = false;

  // Tick buffs
  for (let i = ss.buffs.length - 1; i >= 0; i--) {
    const b = ss.buffs[i];

    // Buffs applied THIS turn (e.g. a scheme that resolves after the player's
    // free hit) skip their first tick so the stated duration is fully honored.
    if (b._fresh) { b._fresh = false; continue; }

    // DoT deals damage at tick
    if (b.type === "player_dot") {
      result.dotDmg += b.value;
    }

    // Decrement
    b.turnsLeft -= 1;
    if (b.turnsLeft <= 0) {
      result.expired.push(b);
      ss.buffs.splice(i, 1);
    }
  }

  return result;
}

// ── QUERY HELPERS (call during damage calc) ──────────────────────────────────

/** Total bonus damage for monster attacks this turn. */
export function getEnemyDmgBonus(ss) {
  if (!ss) return 0;
  let bonus = 0;
  for (const b of ss.buffs) {
    if (b.type === "enemy_dmg") bonus += b.value;
  }
  // ENRAGED turn: +50% damage (consumed after use)
  // Note: the +50% is multiplicative and applied in battle.js on top of base+bonus
  return bonus;
}

/** Is the enemy ENRAGED this turn? (war_cry payoff) */
export function isEnragedThisTurn(ss) {
  if (!ss) return false;
  return ss.enragedNext;
}

/** Consume the ENRAGED flag (call after applying the bonus). */
export function consumeEnraged(ss) {
  if (ss) ss.enragedNext = false;
}

/** Total damage reduction for monster (armor buffs). */
export function getEnemyArmor(ss) {
  if (!ss) return 0;
  let armor = 0;
  for (const b of ss.buffs) {
    if (b.type === "enemy_armor") armor += b.value;
  }
  return armor;
}

/**
 * Detailed armor info for the battle log: total reduction, max turns left,
 * and a display label (e.g. "Stone Skin"). Returns null if no armor active.
 */
export function getEnemyArmorInfo(ss) {
  if (!ss) return null;
  let value = 0;
  let turnsLeft = 0;
  let label = "Armor";
  for (const b of ss.buffs) {
    if (b.type === "enemy_armor") {
      value += b.value;
      if (b.turnsLeft > turnsLeft) turnsLeft = b.turnsLeft;
      if (b.label) label = b.label;
    }
  }
  return value > 0 ? { value, turnsLeft, label } : null;
}

/** Enemy dodge chance (0..1). Multiple dodges use highest. */
export function getEnemyDodgeChance(ss) {
  if (!ss) return 0;
  let max = 0;
  for (const b of ss.buffs) {
    if (b.type === "enemy_dodge" && b.value > max) max = b.value;
  }
  return max;
}

/** Honest_pct modifier (can be negative = less honest). */
export function getEnemyHonestMod(ss) {
  if (!ss) return 0;
  let mod = 0;
  for (const b of ss.buffs) {
    if (b.type === "enemy_honest") mod += b.value;
  }
  return mod;
}

/** Extra damage taken per hit by player (blood_curse stacks). */
export function getPlayerExtraDmgTaken(ss) {
  if (!ss) return 0;
  return ss.bloodCurseStacks || 0;
}

/** Shield HP remaining (ice_shield). */
export function getShieldHp(ss) {
  if (!ss) return 0;
  return ss.shield || 0;
}

/**
 * Absorb damage through shield. Returns remaining damage after shield.
 * Mutates ss.shield.
 */
export function absorbShield(ss, dmg) {
  if (!ss || ss.shield <= 0) return dmg;
  const absorbed = Math.min(ss.shield, dmg);
  ss.shield -= absorbed;
  return dmg - absorbed;
}

/** Is the player frozen this turn? (freeze special) */
export function isPlayerFrozen(ss) {
  if (!ss) return false;
  return ss.playerFrozenThisTurn;
}

/** Does this enemy have a passive of the given key? */
export function hasPassive(ss, passiveKey) {
  if (!ss) return false;
  return ss.spec.type === "passive" && ss.key === passiveKey;
}

/** Does the scheme skip the normal attack? */
export function schemeSkipsAttack(ss) {
  if (!ss) return false;
  return ss.spec.skipsAttack === true;
}

/** Does the charging scheme deal damage to the player (avalanche-type)?
 *  These keep the player's FULL telegraph hit; buff/turtle schemes get reduced. */
export function schemeHitsPlayer(ss) {
  if (!ss) return false;
  return ss.spec.hitsPlayer === true;
}

/** Get display name of the special. */
export function specialName(ss) {
  if (!ss) return null;
  return ss.spec.name;
}

/** Get the special key. */
export function specialKey(ss) {
  if (!ss) return null;
  return ss.key;
}

/** Get all active buff descriptions for UI display. */
export function activeEffectLabels(ss) {
  if (!ss) return [];
  const labels = [];
  for (const b of ss.buffs) {
    switch (b.type) {
      case "enemy_dmg":
        labels.push(`+${b.value} DMG (${b.turnsLeft}t)`);
        break;
      case "enemy_armor":
        labels.push(`−${b.value} taken (${b.turnsLeft}t)`);
        break;
      case "enemy_dodge":
        labels.push(`${Math.round(b.value * 100)}% dodge (${b.turnsLeft}t)`);
        break;
      case "enemy_honest":
        labels.push(
          b.value > 0
            ? `+${b.value}% honest (${b.turnsLeft}t)`
            : `${b.value}% honest (${b.turnsLeft}t)`
        );
        break;
      case "player_dot":
        labels.push(`${b.label || "DoT"}: ${b.value}/t (${b.turnsLeft}t)`);
        break;
    }
  }
  if (ss.bloodCurseStacks > 0) {
    labels.push(`Blood Curse: +${ss.bloodCurseStacks} taken/hit`);
  }
  if (ss.shield > 0) {
    labels.push(`Shield: ${ss.shield} HP`);
  }
  return labels;
}
