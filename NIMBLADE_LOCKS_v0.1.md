# NIMBLADE — Design Lock Document v0.1

**Date**: 2026-06-11 (Day 4 design lock session)
**Status**: Section 1 + 2 + side decisions locked. Section 3-10 pending.
**Reference**: Built on PDF v0.9 (`/work/skills/users/u0b9f6k619p/references/nimblade_design_doc.pdf`).

Legend:
- 🔵 = from PDF v0.9 (unchanged)
- 🟢 = our locked decision (changes from PDF)
- 🟡 = TBD next session

---

## SECTION 1 — RUN STRUCTURE (LOCKED)

### 1.1 Macro structure
- **3 chapters total** (ch1 → ch2 → ch3 connected) 🟢
- **Death anywhere = full reset back to ch1** 🟢
- **V1 scope = chapter 1 only fully coded. Ch2/3 design on paper.** 🟢
- Boss reward each chapter = menunjang chapter berikutnya (specific reward spec'd per chapter; see C1) 🟢
- Chapter clear → next chapter map auto-loads (v1 ch1 boss clear shows "CHAPTER 2 COMING SOON") 🟢

### 1.2 Map shape (Slay-the-Spire-style branching)
- Mobile-cut StS map, **branching strict (option a)** — only connected paths 🟢
- **Full map visible upfront (option a)** — player plans entire chapter route 🟢
- **Boss preview (option a)**: boss identity + intent revealed at chapter start, buff revealed at battle 🟢
- Player traverses ~9 nodes per chapter

### 1.3 Chapter 1 node distribution (LOCKED for now, may refine in §6)
- **9 floors** (floor 1-9, boss = floor 9)
- Floor 1: 2 normal node options (player picks left/right)
- Floors 2-3: normal battles, branching
- Floor 4: campfire / mystery / normal choice
- Floor 5: shop / elite / normal choice
- Floor 6: **guaranteed treasure** (no combat, free relic pick)
- Floor 7: elite / mystery choice
- Floor 8: 1-2 campfire options (pre-boss rest)
- Floor 9: **BOSS** (Goblin King)

Player traverses ~9 nodes total:
- 5-6 normal battles
- 1-2 elite
- 1 treasure
- 1-2 campfire
- 1 shop
- 1-2 mystery
- 1 boss

Estimated run length: 15-20 minutes per chapter.

### 1.4 Save & quit
- **Save state to `active_runs` after each node completion** 🟢
- **Mid-battle: auto-save round-by-round** (HP, energy, monster state preserved). Trust player no abuse. 🟢
- **Player quit anytime → progress safe**. Resume from home screen `CONTINUE RUN` button. 🟢
- **Death = `active_runs` row deleted**. Player back to home. In-run gold lost. 🟢
- **Save lifespan: forever** (no expiry) 🟢
- **Idle 5 minutes in-battle → auto-save + exit to home** (mobile-safe) 🟢
- Demo mode (pre-wallet): uses localStorage instead of Supabase 🟢

### 1.5 Map randomization (LOCKED)
**Per chapter — fixed**:
- Floor count (ch1 = 9)
- Node type distribution
- Boss identity

**Per run — randomized**:
- Node position within floors (which slot is shop vs elite)
- Path branching
- Specific monster from pool at normal/elite nodes
- Relic offerings (shop, treasure, mystery)
- Mystery event outcomes

→ Every run feels fresh, structure consistent. StS-style.

---

## SECTION 2 — COMBAT CORE (LOCKED, awaiting simulator)

### 2.1 RPS rules 🔵 (PDF)
- SLASH beats COUNTER
- GUARD beats SLASH
- COUNTER beats GUARD
- Draw = no damage, round advances

### 2.2 Move identity (NEW LOCKED 🟢 — give each move purpose)
| Move | Win dmg | Loss dmg taken | Identity |
|---|---|---|---|
| 🗡 SLASH | 10 | full monster dmg | Balanced default |
| 🛡 GUARD | 6 | **HALF** monster dmg | Defensive — survive low HP |
| 🔄 COUNTER | 14 | **+3 extra** monster dmg | Risky — high reward |

### 2.3 Timer 🟢
- **NO TIMER** (RPS = pattern reading, not reaction game)
- Idle 5 min → auto-save + exit to home
- (PDF v0.9's 8s timer was PvP legacy, removed)

### 2.4 Intent system 🔵+🟢
- **Normal monster**: 80% honest, 20% changes
- **Elite monster**: 60% honest + shows **2 possible intents** (player commits among 2)
- **Boss**: 80% honest BUT every 3 rounds = "SCHEMING" (intent fully hidden)
- Upgrade tree can improve honest %

### 2.5 Patch A — tutorial-only 🟢
- Round 1 always honest **only at chapter 1 floor 1** (tutorial battle for new players)
- All other battles use standard intent system
- Eye of Prediction (epic relic) remains useful (reveal first move every battle)

### 2.6 Wild Strike 🔵
- 4th battle action (emergency)
- Cost: **40 energy**
- Effect: **8 damage flat, ignores RPS** (monster's pick irrelevant)
- Flat 8 dmg across all chapters (not scaling)

### 2.7 Energy 🟢
- **Start each battle: 0 energy**
- Regen: **+20 per round**
- Use cases: Wild Strike (40), Ultimate (100)

### 2.8 "READ" action 🟢 (NEW idea, locked pending simulator)
- Tap "👁 READ" once per battle
- Effect: reveal monster intent next 2 rounds (100% honest)
- Cost: skip your turn (no attack, no defend, monster free hit)
- Decision tension: info worth 1 free hit?

### 2.9 Combo bonus 🟢 (NEW, locked pending simulator)
- 3 consecutive wins (no draw, no loss) = next attack dmg +50%
- Reset on loss or draw

### 2.10 Difficulty dial 🟡
- V2 feature. Skip for now.

---

## SIDE DECISIONS LOCKED

### A1 — Sharpen Stone (NIM purchase) 🟢
```
Tier I   1 NIM → +3 max HP
Tier II  2 NIM → +50g starting gold each run
Tier III 3 NIM → +5 max HP
Tier IV  5 NIM → +1 free shop re-roll per run
Tier V   8 NIM → +5 max HP
Total: 19 NIM → +13 max HP + 50g start + 1 free reroll
```
No cosmetic on Tier V (dropped).

### A2 — Skins NIM 🟢
**SKIPPED.** No cosmetic skin purchases in v1.

### Currency model — 2-currency 🟢
**🪙 Gold (in-run)**:
- Drop from battle / boss / treasure
- Spent in shop, re-rolls, heal potion
- Reset on run end (death or chapter clear)
- 10% unspent gold at final boss clear → bonus Soul Gems

**💎 Soul Gem (meta persistent)**:
- Drop from chapter boss clear: ch1 +5, ch2 +10, ch3 +15
- Mystery node lucky drop: 10% chance +1-2 gem
- Final boss clear bonus: 10% of unspent gold → gem
- Daily login: +1 gem/day for 7 days, cycles weekly (wallet tier only)
- Used for: weapon unlock, upgrade tree
- **NO CAP, NO RESET ON DEATH** (locked at moment of earn)

### Economy pricing 🟢
**Weapon unlock**:
- Spear: 30 gem
- Axe: 60 gem
- Staff: 100 gem
- Subtotal: 190 gem

**Upgrade tree** (13 nodes):
- 5 tier-1 nodes: 10 gem each = 50 gem
- 5 tier-2 nodes: 25 gem each = 125 gem
- 3 tier-3 nodes: 50 gem each = 150 gem
- Subtotal: 325 gem

**Total full unlock: 515 gem ≈ 15-18 full clear runs ≈ 10 hours playtime.**

### Relic — 12 slot cap 🟢
- Cap at 12. Full + new offering = "Discard 1 or Skip" prompt.

### Watcher's Eye redesign 🟢 (RARE active relic)
- Once per battle: reveal next round intent 100% honest
- Cooldown reset each battle
- Replaces PDF v0.9 "Watcher's Eye common +5% honest"

### Cursed Relic concept 🟢 (rare mystery event reward)
- "+5 dmg when you deal damage to monster, -2 HP when you lose a round"
- Modulated risk relic

### Brand of Valor 🟢 (lifetime first-clear rewards)
- **Bronze Brand** (ch1 first clear): +2 max HP permanent
- **Silver Brand** (ch2 first clear): +25g starting gold + 1 random starting relic (common pool)
- **Gold Brand** (ch3 first clear): +5 max HP + 1 free shop re-roll first visit

### M3 — Practice vs Wallet tier 🟢
- **Practice tier**: free play, no gem earning, no leaderboard
- **Wallet tier**: full gem progression + leaderboard
- Connect wallet later → auto-grant Brand of Valor for Practice lifetime chapter clears
- Persistent UI: small "Connect Wallet" button top-right of home

### M4 — Daily login 🟢
- +1 gem/day for 7 days, resets weekly
- Wallet tier only

### Player base stats 🟢
- Starting max HP: 100
- Starting energy each battle: 0
- Starting gold each run: 0g (unless Silver Brand = +25g)

### Boss telegraphs 🟢 (C5)
- Phase 2 trigger → animation + dialog text ("Goblin King roars: «I will not fall!»")

### Audio 🟡
- Deferred to end-game polish phase. Free assets freesound.org.

### Difficulty / Daily Challenge 🟡
- V2 features. Spec on paper, not coded in v1.

### Daily Challenge 🟡
- V2: seeded daily run, daily leaderboard

### Chapter 1 monster pool 🟢
- Normal (5): Goblin, Slime, Wolf, Skeleton, Bandit
- Elite (2): Orc Brute, Spider Queen
- Boss (1): Goblin King
- Stats + intent patterns TBD in Section 4

### Mystery event pool ch1 🟢
- 6-8 variants (heal, lose HP+gain gold, cursed relic, free relic, mini battle, fortune teller, etc.)
- Exact roster TBD

### Practice→Wallet UX triggers 🟢
1. Persistent "Connect Wallet" button top-right home
2. First time Practice player clears ch1 → modal "Connect wallet to save + earn gems"
3. Death in ch2+ → toast "Connect wallet for progress next time"
4. Connect wallet → auto-grant Brands for Practice clears

### D4 — Weekly leaderboard partial points 🟢
- Reach final boss but lose = 5 partial weekly points
- (Encourages attempts; not strictly fair-or-nothing)

### D5 — Wild Strike: flat 8 dmg 🟢

### D7 — Sharpen mechanic edge case 🟢
- All relics already epic → Sharpen at campfire = +1 stack effect (e.g., Sharp Blade +2 → +3 dmg)

### D10 — Old unused dungeons (D5/D6/D8/D9) 🟢
- Comment out in code labeled `V2_CONTENT`. Don't delete.

---

## PENDING NEXT SECTIONS

- §3 Weapons (Sword/Spear/Axe/Staff full spec)
- §4 Monsters (stats, intent AI per monster)
- §5 Relics (full list with rarity, effect, drop sources)
- §6 Campfire & Shop (mechanics + balance)
- §7 Meta Progression (upgrade tree detail)
- §8 Economy (final tuning after §3-7 done)
- §9 UI/UX (screens, flow, polish)
- §10 Save & Demo (technical model)

After all sections locked → compile **NIMBLADE Design Doc v1.0** (full game design bible).



# NIMBLADE Design Doc — Section 4: MONSTERS (v0.1 draft)

> Status: PROPOSAL — awaiting Murid review/lock.
> Legend: 🔵 PDF v0.9 carry-over · 🟢 locked change · 🟡 new proposal

---

## 4.1 Stat philosophy

All monster stats validated via `battle_sim.py` (Section 2 combat is locked).

- **Player baseline**: HP 100, energy regen +20/round, SLASH 10 / GUARD 6 / COUNTER 14.
- **Normal monsters**: forgiving. Should die in ~3–5 rounds of decent play, deal ~10–25 HP total over a fight.
- **Elite monsters**: punishing but readable. ~6–8 rounds, can drain 30–50 HP if misplayed.
- **Bosses**: gauntlet. ~10–14 rounds, scheming intents every 3rd turn, demand campfire prep.

### 4.1.1 Intent honesty (🟢 LOCKED in §2)
- Normal: **80%** honest
- Elite: **60%** honest (2-option intents)
- Boss: **80%** honest, but every 3rd intent is a **SCHEME** (random) — telegraphed by red glow

### 4.1.2 Intent patterns
- **No pattern** = pure random per turn (most basic normals)
- **Pattern** = fixed cycle (e.g. `[SLASH, GUARD, SLASH, COUNTER]`) — rewards memorization

---

## 4.2 Chapter 1 — Goblin Caverns 🟢

Tone: earthy, beginner-friendly. Teaches RPS reads + energy management.

### Normals (5 — encounter pool for floors 1–6)

| ID | Name | Tier | HP | DMG | Honest | Intent pattern | Vibe |
|---|---|---|---|---|---|---|---|
| `goblin_warrior` | Goblin Warrior | normal | 28 | 6 | 80% | none (random) | Basic punching bag. Floor-1 tutorial fodder. |
| `goblin_scout` | Goblin Scout | normal | 22 | 5 | 80% | `[SLASH, SLASH, GUARD]` | Fast, telegraphs aggression. Easy combo target. |
| `goblin_archer` | Goblin Archer | normal | 24 | 8 | 80% | `[GUARD, SLASH, COUNTER]` | Glass cannon — hits hard if ignored, dies in 2 SLASH. |
| `wild_wolf` | Wild Wolf | normal | 30 | 7 | 80% | none (random) | Pure random aggression — teaches "when in doubt, COUNTER". |
| `mine_bat` | Mine Bat | normal | 18 | 4 | 80% | `[COUNTER, SLASH]` | Squishy but counter-baits — teaches when NOT to spam SLASH. |

### Elites (2 — appear on floor 4 + elite-marked nodes) 🟡

| ID | Name | Tier | HP | DMG | Honest | Intent pattern | Vibe |
|---|---|---|---|---|---|---|---|
| `goblin_shaman` | Goblin Shaman | elite | 55 | 9 | 60% | `[GUARD, SLASH, COUNTER, COUNTER]` | Counter-heavy mage. Punishes lazy SLASH spam. Drops relic. |
| `cave_troll` | Cave Troll | elite | 75 | 11 | 60% | `[SLASH, SLASH, GUARD, COUNTER]` | Big bruiser. Trades blows. Worth a campfire heal before. |

### Boss (floor 7) 🟢

| ID | Name | Tier | HP | DMG | Honest | Intent pattern | Vibe |
|---|---|---|---|---|---|---|---|
| `goblin_king` | Goblin King | boss | 140 | 10 | 80%* | `[SLASH, COUNTER, COUNTER, GUARD, SLASH, COUNTER]` | Validated boss from sim. Every 3rd intent = SCHEME (random). Forces 10–14 round skill check. |

> *Boss honesty 80% but SCHEME triggers every 3rd turn regardless (overrides honesty roll).

---

## 4.3 Chapter 2 — Frost Spire 🟢 (stub — full stats locked alongside CH1 once §4 approved)

Tone: cold, methodical. Stats scale ~30% above CH1.

- **Normals (5)**: `ice_wolf`, `frost_witch` (low-HP caster), `frost_giant` (slow tank), `bandit_scout` (mercenary intruder), `mine_bat` (carry-over, +stats).
- **Elites (2)**: `ice_golem` (HP wall), `bandit_captain` (pattern-heavy duelist).
- **Boss**: `ice_queen` (freeze mechanic — telegraphs longer but hits 2x dmg on SLASH win).

> Full HP/DMG/intent table delivered in §4 v0.2 after CH1 locked.

---

## 4.4 Chapter 3 — Demon Citadel 🟢 (stub)

Tone: hellish, climactic. Stats scale ~70% above CH1.

- **Normals (5)**: `demon_guard`, `demon_mage`, `thrall_knight`, `shadow_clone`, `ruin_wraith`.
- **Elites (2)**: `demon_knight` (counter god — 70% counter intent), `void_knight` (random scheme every 2nd turn).
- **Boss**: `arch_demon` (final fight, 200+ HP, multi-phase: phase-2 triggers at 50% HP and shifts intent pattern).

---

## 4.5 Intent AI behavior (engine spec) 🟢

```
on_turn_start(monster):
    intended = next_from_pattern() OR random()
    if monster.is_boss AND turn_count % 3 == 0:
        actual = random_move()                # SCHEME (overrides honesty)
        ui.show_intent(intended, scheme=True) # red glow
    else:
        if rand() < monster.intent_honest_pct:
            actual = intended
        else:
            actual = random_other_than(intended)
        ui.show_intent(intended, scheme=False)
    queue.actual = actual
```

- **READ action** (skip turn → reveal next 2 turns 100% honest): overrides the honesty roll for the foresight window. SCHEME on boss still scrambles.

---

## 4.6 Loot table per tier 🟡

| Tier | Gold drop | Relic drop | Heal drop |
|---|---|---|---|
| Normal | 8–15 | 0% (only via campfire/shop) | 5% chance small potion |
| Elite  | 25–40 | 100% (1 common-or-rare relic) | 25% chance medium potion |
| Boss   | 60–100 | 100% (1 rare-or-epic relic) + chapter token | 100% full heal at next campfire |

---

## 4.7 Open questions for Murid 🟡

- **Q1** Pattern intents OK as table above? Or all-random for first 2 normals to make CH1 floor-1 dead-simple?
- **Q2** Elite drop = guaranteed relic OK? (Sim shows this incentivizes elite hunting → matches "DECISION TENSION" north star.)
- **Q3** CH2/CH3 normal lineups — go with the stub lists above, or want different families? (e.g. CH3 = Vampire Court instead of Demon)
- **Q4** Boss SCHEME every 3rd turn — keep, or tune to every 4th to give boss more readable windows?

---

## NEXT after §4 lock
- §5 Relics (full list: common / rare / epic — effects + drop pools, including elite/boss rewards tying back to this section)



====================================================

# NIMBLADE Design Doc — Section 4: MONSTERS (v0.2 FINAL)

> Status: FINAL draft — pending Murid lock. Compiled 2026-06-11 from all Z1–Z4 + K1 locks.
> Legend: 🔵 PDF v0.9 carry-over · 🟢 locked · 🟡 new in v0.2

---

## 4.1 Stat philosophy (LOCKED 🟢)

Player baseline: HP 100, energy +20/round, SLASH 10 / GUARD 6 / COUNTER 14.

- **Normal**: 3–5 rounds, drains ~10–25 HP total. 80% honest.
- **Elite**: 6–8 rounds, drains ~30–50 HP. 60% honest, pattern-heavy.
- **Boss**: 10–14 rounds. 80% honest + SCHEME every 3rd turn (random override).

CH2 stats scale ~30% above CH1. CH3 scales ~70% above CH1.

---

## 4.2 Chapter 1 — Goblin Caverns 🟢 LOCKED

### Normals (5)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `goblin_warrior` | Goblin Warrior | 28 | 6 | 80% | random | Tutorial fodder |
| `goblin_scout` | Goblin Scout | 22 | 5 | 80% | `[SLASH,SLASH,GUARD]` | Combo target |
| `goblin_archer` | Goblin Archer | 24 | 8 | 80% | `[GUARD,SLASH,COUNTER]` | Glass cannon |
| `wild_wolf` | Wild Wolf | 30 | 7 | 80% | random | "When in doubt, COUNTER" |
| `mine_bat` | Mine Bat | 18 | 4 | 80% | `[COUNTER,SLASH]` | Counter-bait |

### Elites (2)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `goblin_shaman` | Goblin Shaman | 55 | 9 | 60% | `[GUARD,SLASH,COUNTER,COUNTER]` | Counter-heavy mage |
| `cave_troll` | Cave Troll | 75 | 11 | 60% | `[SLASH,SLASH,GUARD,COUNTER]` | Bruiser, campfire prep |

### Boss
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `goblin_king` | Goblin King | 140 | 10 | 80% + SCHEME/3rd | `[SLASH,COUNTER,COUNTER,GUARD,SLASH,COUNTER]` | Validated boss from sim |

---

## 4.3 Chapter 2 — Frost Spire 🟢 LOCKED (mix lineup) 🟡

### Normals (5) — mix frost + bandit
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `ice_wolf` | Ice Wolf | 35 | 8 | 80% | random | CH2 wolf bump |
| `frost_witch` | Frost Witch | 28 | 9 | 80% | `[SLASH,GUARD,COUNTER,COUNTER]` | Caster, counter-heavy |
| `bandit_scout` | Bandit Scout | 32 | 7 | 80% | `[SLASH,SLASH,COUNTER]` | Aggro mercenary |
| `dark_miner` | Dark Miner | 38 | 8 | 80% | `[GUARD,SLASH,SLASH]` | Defensive bruiser |
| `mine_bat` | Mine Bat (CH2 bump) | 22 | 5 | 80% | `[COUNTER,SLASH]` | Carry-over |

### Elites (2)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `frost_giant` | Frost Giant | 90 | 13 | 60% | `[SLASH,SLASH,GUARD,COUNTER]` | HP wall, slow tank |
| `bandit_captain` | Bandit Captain | 70 | 12 | 60% | `[GUARD,COUNTER,SLASH,COUNTER]` | Pattern-heavy duelist |

### Boss
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `ice_queen` | Ice Queen | 170 | 12 | 80% + SCHEME/3rd | `[SLASH,COUNTER,GUARD,COUNTER,SLASH,GUARD]` | Freeze mechanic: SLASH win = 2x dmg if frozen (triggers when SCHEME hits) |

---

## 4.4 Chapter 3 — Vampire Court 🟢 LOCKED 🟡

### Normals (5)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `vampire_bat` | Vampire Bat | 25 | 6 | 80% | random | Fast swarm fodder |
| `vampire_mage` | Vampire Mage | 35 | 11 | 80% | `[COUNTER,COUNTER,SLASH]` | Counter god, glass |
| `thrall_knight` | Thrall Knight | 50 | 10 | 80% | `[SLASH,GUARD,SLASH]` | Standard duelist |
| `ruin_wraith` | Ruin Wraith | 40 | 9 | 80% | `[GUARD,COUNTER,SLASH]` | Tricky reads |
| `dark_specter` | Dark Specter | 30 | 11 | 80% | random | Pure chaos punisher |

### Elites (2)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `vampire_lord` | Vampire Lord | 110 | 14 | 60% | `[COUNTER,SLASH,COUNTER,GUARD]` | Lifesteal — heals 5 HP on SLASH win |
| `shadow_king` | Shadow King | 130 | 13 | 60% | `[SLASH,SLASH,COUNTER,GUARD,COUNTER]` | Punishes lazy combos |

### Boss
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `count_dracula` | Count Dracula | 220 | 14 | 80% + SCHEME/3rd | `[SLASH,COUNTER,COUNTER,GUARD,SLASH,COUNTER,SLASH]` | **Phase 2 @ 50% HP**: lifesteal active (heals 8 HP on SLASH win), pattern reshuffles |

> Demon family (`demon_*`, `arch_demon`, etc.) deferred to V2_CONTENT pack.

---

## 4.5 Intent AI engine spec (LOCKED 🟢)

```pseudocode
on_turn_start(monster, turn_count):
    intended = next_from_pattern(monster) OR random()

    # Boss scheme override
    if monster.is_boss AND turn_count % 3 == 0:
        actual = random_move()
        ui.show_intent(intended, scheme=True)   # red glow
        return actual

    # Honesty roll
    if rand() < monster.intent_honest_pct:
        actual = intended
    else:
        actual = random_other_than(intended)
    ui.show_intent(intended, scheme=False)
    return actual

on_read_action(monster, n=2):
    # Player skipped turn → next N intents 100% honest
    monster.read_window = n
    # SCHEME on boss still overrides during this window
```

---

## 4.6 Loot table (LOCKED 🟢 — Z2 update applied 🟡)

| Tier | Gold | Relic | Potion |
|---|---|---|---|
| Normal | 8–15 | — | 5% small potion |
| Elite | 25–40 | **Pick 1 of 3 random** (common-or-rare) — others disappear | 25% medium potion |
| Boss | 60–100 + chapter token | 100% rare-or-epic (auto-grant) | 100% full heal at next campfire |

> StS-style elite relic choice = decision tension (Z2 north star).

---

## 4.7 Implementation notes for §4 → code

- Monster data file: `src/data/monsters.js` (or JSON). Each entry: `{id, name, tier, chapter, hp, dmg, honest_pct, pattern, sprite_idle, sprite_attack, special?}`.
- Sprite paths: `/assets/{id}.png` + `/assets/{id}_attack.png` (flattened, no `/normalized/`).
- Encounter pool per floor:
  - CH1: floors 1–3 = normal pool, floor 4 = elite slot, floors 5–6 = normal, floor 7 = boss
  - CH2/CH3 same structure (full map shape in §1 lock).
- Elite relic flow: server rolls 3 candidates from `relics.common_rare`, presents modal, player picks 1, others discarded (no inventory).
- Boss phase-2 trigger: HP ≤ 50% threshold check post-damage → set `monster.phase = 2` → reshuffle pattern + enable phase-2 special.

---

## NEXT after §4 lock
- §5 Relics: full list (common/rare/epic) + drop pools tying back here


---------------------------------------------

# NIMBLADE Design Doc — Section 4: MONSTERS (v0.3 LOCKED)

> Status: 🔒 LOCKED 2026-06-11. Includes monster effects (12 effects across 21 monsters, OPSI B).
> Legend: 🔵 PDF v0.9 carry-over · 🟢 locked · 🟡 new in v0.3

## 4.0 Monster effects (LOCKED 🟢)

### CH1 — gentle, teach basics
- `goblin_archer` **Aimed Shot**: first attack of battle is always honest (skips honesty roll).
- `wild_wolf` **Bloodlust**: +1 dmg per round, cap +3.
- `goblin_shaman` (E) **Hex**: every 3rd turn, drain 5 player energy.
- `cave_troll` (E) **Stoneform**: when troll wins GUARD, next 2 incoming player dmg halved.
- `goblin_king` (B): SCHEME only (Rally removed — first boss must be clean).

### CH2 — control / drain
- `frost_witch` **Mana Drain**: -7 player energy per witch GUARD win.
- `dark_miner` **Plate Armor**: 50% reduced dmg from the first SLASH win against him (one-time per battle).
- `frost_giant` (E) **Ice Armor**: first 25 dmg absorbed (one-time shield).
- `bandit_captain` (E): no effect — pattern-puzzle pure.
- `ice_queen` (B) **Freeze**: on SCHEME turn, player frozen + queen SLASH = 1.5x dmg.

### CH3 — drain / curse (harshest, counter-play via §5 relics)
- `vampire_bat` **Blood Sip**: +2 HP on SLASH win.
- `vampire_mage` **Curse**: when mage wins COUNTER, player takes 2 dmg/turn for 2 turns (no stack, refresh on retrigger).
- `vampire_lord` (E) **Lifesteal**: +4 HP per SLASH win.
- `shadow_king` (E) **Hex Aura**: every 3rd turn, next attack +50% dmg (telegraphed red aura before turn).
- `count_dracula` (B) **Phase 2 @ 50% HP**: lifesteal +6 HP per SLASH win + pattern reshuffle.

### Flagged for re-validate after §5 relics + sim run
- Dracula phase 2 lifesteal (needs anti-heal relic in §5 to ensure counter-play)
- CH3 cumulative cognitive load (must validate via UI prototype in §9)
- cave_troll Stoneform (replaced regen — confirm not too punishing in sim)

---

## 4.1 Stat philosophy (LOCKED 🟢)

Player baseline: HP 100, energy +20/round, SLASH 10 / GUARD 6 / COUNTER 14.

- **Normal**: 3–5 rounds, drains ~10–25 HP total. 80% honest.
- **Elite**: 6–8 rounds, drains ~30–50 HP. 60% honest, pattern-heavy.
- **Boss**: 10–14 rounds. 80% honest + SCHEME every 3rd turn (random override).

CH2 stats scale ~30% above CH1. CH3 scales ~70% above CH1.

---

## 4.2 Chapter 1 — Goblin Caverns 🟢 LOCKED

### Normals (5)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `goblin_warrior` | Goblin Warrior | 28 | 6 | 80% | random | Tutorial fodder |
| `goblin_scout` | Goblin Scout | 22 | 5 | 80% | `[SLASH,SLASH,GUARD]` | Combo target |
| `goblin_archer` | Goblin Archer | 24 | 8 | 80% | `[GUARD,SLASH,COUNTER]` | Glass cannon |
| `wild_wolf` | Wild Wolf | 30 | 7 | 80% | random | "When in doubt, COUNTER" |
| `mine_bat` | Mine Bat | 18 | 4 | 80% | `[COUNTER,SLASH]` | Counter-bait |

### Elites (2)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `goblin_shaman` | Goblin Shaman | 55 | 9 | 60% | `[GUARD,SLASH,COUNTER,COUNTER]` | Counter-heavy mage |
| `cave_troll` | Cave Troll | 75 | 11 | 60% | `[SLASH,SLASH,GUARD,COUNTER]` | Bruiser, campfire prep |

### Boss
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `goblin_king` | Goblin King | 140 | 10 | 80% + SCHEME/3rd | `[SLASH,COUNTER,COUNTER,GUARD,SLASH,COUNTER]` | Validated boss from sim |

---

## 4.3 Chapter 2 — Frost Spire 🟢 LOCKED (mix lineup) 🟡

### Normals (5) — mix frost + bandit
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `ice_wolf` | Ice Wolf | 35 | 8 | 80% | random | CH2 wolf bump |
| `frost_witch` | Frost Witch | 28 | 9 | 80% | `[SLASH,GUARD,COUNTER,COUNTER]` | Caster, counter-heavy |
| `bandit_scout` | Bandit Scout | 32 | 7 | 80% | `[SLASH,SLASH,COUNTER]` | Aggro mercenary |
| `dark_miner` | Dark Miner | 38 | 8 | 80% | `[GUARD,SLASH,SLASH]` | Defensive bruiser |
| `mine_bat` | Mine Bat (CH2 bump) | 22 | 5 | 80% | `[COUNTER,SLASH]` | Carry-over |

### Elites (2)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `frost_giant` | Frost Giant | 90 | 13 | 60% | `[SLASH,SLASH,GUARD,COUNTER]` | HP wall, slow tank |
| `bandit_captain` | Bandit Captain | 70 | 12 | 60% | `[GUARD,COUNTER,SLASH,COUNTER]` | Pattern-heavy duelist |

### Boss
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `ice_queen` | Ice Queen | 170 | 12 | 80% + SCHEME/3rd | `[SLASH,COUNTER,GUARD,COUNTER,SLASH,GUARD]` | Freeze mechanic: SLASH win = 2x dmg if frozen (triggers when SCHEME hits) |

---

## 4.4 Chapter 3 — Vampire Court 🟢 LOCKED 🟡

### Normals (5)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `vampire_bat` | Vampire Bat | 25 | 6 | 80% | random | Fast swarm fodder |
| `vampire_mage` | Vampire Mage | 35 | 11 | 80% | `[COUNTER,COUNTER,SLASH]` | Counter god, glass |
| `thrall_knight` | Thrall Knight | 50 | 10 | 80% | `[SLASH,GUARD,SLASH]` | Standard duelist |
| `ruin_wraith` | Ruin Wraith | 40 | 9 | 80% | `[GUARD,COUNTER,SLASH]` | Tricky reads |
| `dark_specter` | Dark Specter | 30 | 11 | 80% | random | Pure chaos punisher |

### Elites (2)
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `vampire_lord` | Vampire Lord | 110 | 14 | 60% | `[COUNTER,SLASH,COUNTER,GUARD]` | Lifesteal — heals 5 HP on SLASH win |
| `shadow_king` | Shadow King | 130 | 13 | 60% | `[SLASH,SLASH,COUNTER,GUARD,COUNTER]` | Punishes lazy combos |

### Boss
| ID | Name | HP | DMG | Honest | Intent pattern | Role |
|---|---|---|---|---|---|---|
| `count_dracula` | Count Dracula | 220 | 14 | 80% + SCHEME/3rd | `[SLASH,COUNTER,COUNTER,GUARD,SLASH,COUNTER,SLASH]` | **Phase 2 @ 50% HP**: lifesteal active (heals 8 HP on SLASH win), pattern reshuffles |

> Demon family (`demon_*`, `arch_demon`, etc.) deferred to V2_CONTENT pack.

---

## 4.5 Intent AI engine spec (LOCKED 🟢)

```pseudocode
on_turn_start(monster, turn_count):
    intended = next_from_pattern(monster) OR random()

    # Boss scheme override
    if monster.is_boss AND turn_count % 3 == 0:
        actual = random_move()
        ui.show_intent(intended, scheme=True)   # red glow
        return actual

    # Honesty roll
    if rand() < monster.intent_honest_pct:
        actual = intended
    else:
        actual = random_other_than(intended)
    ui.show_intent(intended, scheme=False)
    return actual

on_read_action(monster, n=2):
    # Player skipped turn → next N intents 100% honest
    monster.read_window = n
    # SCHEME on boss still overrides during this window
```

---

## 4.6 Loot table (LOCKED 🟢 — Z2 update applied 🟡)

| Tier | Gold | Relic | Potion |
|---|---|---|---|
| Normal | 8–15 | — | 5% small potion |
| Elite | 25–40 | **Pick 1 of 3 random** (common-or-rare) — others disappear | 25% medium potion |
| Boss | 60–100 + chapter token | 100% rare-or-epic (auto-grant) | 100% full heal at next campfire |

> StS-style elite relic choice = decision tension (Z2 north star).

---

## 4.7 Implementation notes for §4 → code

- Monster data file: `src/data/monsters.js` (or JSON). Each entry: `{id, name, tier, chapter, hp, dmg, honest_pct, pattern, sprite_idle, sprite_attack, special?}`.
- Sprite paths: `/assets/{id}.png` + `/assets/{id}_attack.png` (flattened, no `/normalized/`).
- Encounter pool per floor:
  - CH1: floors 1–3 = normal pool, floor 4 = elite slot, floors 5–6 = normal, floor 7 = boss
  - CH2/CH3 same structure (full map shape in §1 lock).
- Elite relic flow: server rolls 3 candidates from `relics.common_rare`, presents modal, player picks 1, others discarded (no inventory).
- Boss phase-2 trigger: HP ≤ 50% threshold check post-damage → set `monster.phase = 2` → reshuffle pattern + enable phase-2 special.

---

## NEXT after §4 lock
- §5 Relics: full list (common/rare/epic) + drop pools tying back here

=========================================================

# NIMBLADE Design Doc — Section 5: RELICS (v0.4 FINAL LOCKED)

## v0.4 changes
- `echo_stone`: redesigned → momentum chain, +25% dmg on consecutive same-action wins, basic RPS only (no abuse via Ult/Wild Strike/READ)
- `crown_of_decision`: redesigned → every 3rd turn ALL dmg ×1.5 both sides, intent uses chapter honesty (can lie). Removed broken 100%-honest reveal.


> Status: 🔒 LOCKED 2026-06-11. 31 relics + 1 special-node easter egg, sub-tier weighted drops, post-review balance pass.
> Legend: 🔵 PDF v0.9 carry-over · 🟢 locked · 🟡 new in v0.3

## v0.3 changes (post Murid review)
- `frostbite_shard`: 25% → **10% freeze chance**
- `eye_of_omniscience`: god-mode removed → **first 2 turns of battle honest, enemy +10% dmg whole battle**
- `void_crown`: **-20 energy cost on READ, next attack +10% dmg conditional on winning RPS**
- `dusty_tome`: marginal honest roll removed → **+3 max HP flat** (Old Knowledge)
- `time_glass`: **guaranteed re-pick win, but dmg dealt that turn = 50%** (trade-off, not safety net)

---

## 5.1 Philosophy (LOCKED 🟢)

- **Picking a relic = decision tension** (elite drops 3-pick, others gone)
- **Common** = small flat bonuses, freely stack
- **Rare** = bigger effects, often charges or conditional triggers
- **Epic** = run-defining + hard trade-offs
- **Counter-play relics**: anti-heal (Dracula), cleanse (curse), ignore-SCHEME
- **Sub-tier weighted drops** within each pool — strong relics rarer = moments

---

## 5.2 Drop pool + sub-tier system (LOCKED 🟢)

```
relic.tier   = 'common' | 'rare' | 'epic'
relic.weight = 1 (rarest) ... 5 (most common)
```

Drop function:
```js
function drawRelic(tier) {
  const pool = relics.filter(r => r.tier === tier);
  const totalWeight = pool.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const r of pool) {
    if (roll < r.weight) return r;
    roll -= r.weight;
  }
}
```

| Source | Behavior |
|---|---|
| Run start | Random 1 from common pool (can be junk) — fits \"sampah\" variance |
| Elite drop | 3-pick: roll 3 candidates (common 60% / rare 40% mix), player picks 1 |
| Boss drop | Auto-grant 1 (rare 60% / epic 40%) |
| Campfire shop | 3 commons at 25 / 40 / 60 gold |
| Special CH2 node | `nimiq_crystal` only — 1x per run, must purchase via gold |

---

## 5.3 COMMONS (11) 🟡

| ID | Name | Effect | Tier | Weight |
|---|---|---|---|---|
| `broken_dagger` | Broken Dagger | SLASH dmg +1 | Junk | 5 |
| `old_coin` | Old Coin | +2 gold per battle won | Junk | 5 |
| `dusty_tome` | Dusty Tome | +3 max HP for the run | Junk | 5 |
| `whetstone` | Whetstone | SLASH dmg +2 | Standard | 3 |
| `iron_buckler` | Iron Buckler | GUARD blocks +3 extra dmg | Standard | 3 |
| `lucky_coin` | Lucky Coin | +5 gold per battle won | Standard | 3 |
| `crow_feather` | Crow Feather | +2 gold on every SLASH win | Standard | 3 |
| `torch` | Torch | See enemy exact HP number | Standard | 3 |
| `quick_boots` | Quick Boots | +5 energy per round | Standard | 3 |
| `insight_charm` | Charm of Insight | First turn of each battle: intent always honest | Strong | 1 |
| `healing_herb` | Healing Herb | Heal 3 HP at end of each battle | Strong | 1 |

---

## 5.4 RARES (12) 🟡

| ID | Name | Effect | Tier | Weight |
|---|---|---|---|---|
| `vampire_fang` | Vampire Fang | +2 HP lifesteal on SLASH win | Utility | 4 |
| `cleansing_bell` | Cleansing Bell | 1x/battle: clear all curse/DoT | Utility (anti-curse) | 4 |
| `frostbite_shard` 🟡 | Frostbite Shard | On SLASH win: 10% chance enemy frozen 1 turn (skips next turn) | Utility | 4 |
| `phoenix_ember` 🟡 | Phoenix Ember | 1x/battle: when HP drops below 20%, heal 15 HP | Utility (panic button) | 4 |
| `berserker_stone` | Berserker Stone | SLASH dmg +5, BUT +2 self-dmg/round for first 5 rounds 🟡 (capped) | Risk/reward | 3 |
| `mirror_shield` | Mirror Shield | GUARD win = reflect 50% incoming dmg back | Risk/reward | 3 |
| `time_glass` | Time Glass | 1x/battle: re-pick your action knowing enemy's move (guaranteed RPS win) BUT dmg dealt that turn = 50% | Skill check | 3 |
| `gamblers_dice` | Gambler's Dice | +30 energy each battle start, BUT -10 max HP for run | Risk/reward | 3 |
| `iron_will` | Iron Will | 1x/battle: ignore one boss SCHEME (treat as honest) | Boss tool | 3 |
| `chained_grimoire` 🟡 | Chained Grimoire | COUNTER dmg +6, BUT lose 5 energy per turn | Counter-build | 3 |
| `runic_compass` 🟡 | Runic Compass | Reveal next 2 floor node types on map | Scouting | 3 |
| `holy_water` | Holy Water | 1x/battle: disable monster healing for 3 turns | Anti-heal (counters Dracula) | 1 |

---

## 5.5 EPICS (8) 🟡

| ID | Name | Effect | Tier | Weight |
|---|---|---|---|---|
| `pact_of_shadows` | Pact of Shadows | +30 max HP for run 🟡, BUT -2 self-dmg per SLASH win 🟡 | Deal-with-devil | 3 |
| `echo_stone` 🟢v0.4 | Echo Stone | Win RPS with same basic action 2+ turns in a row → +25% dmg. Resets on action change, RPS loss, or draw. Basic RPS only (no Wild Strike / Ult / READ). | Momentum chain | 3 |
| `serpent_belt` 🟡 | Serpent Belt | Every 5th turn: take 0 dmg AND deal 2x dmg | Rhythm build | 3 |
| `golden_chalice` 🟡 | Golden Chalice | Start each battle at 50% HP cap, BUT double gold from all sources | High-risk economy | 3 |
| `crown_of_decision` 🟢v0.4 | Crown of Decision | Every 3rd turn = Crown Turn: ALL dmg ×1.5 (both sides). Intent uses chapter honesty normal (can lie). | Double-stake | 2 |
| `eye_of_omniscience` 🟡 | Eye of Omniscience | First 2 turns of each battle: intent always honest. Enemy +10% dmg whole battle. | Opener info | 2 |
| `void_crown` 🟡 | Void Crown | READ action reveals next 2 intents honest. Costs -20 energy. Next attack after READ: +10% dmg IF you win the RPS exchange (no bonus if you lose). | Buff READ synergy, conditional | 2 |
| `heart_of_nimblade` | Heart of Nimblade | When HP drops to 0: revive at 30 HP. 1x per run. | Legendary save | 1 |

---

## 5.6 Special: `nimiq_crystal` (Brand easter egg) 🟡

- **Effect**: Convert leftover energy at end of each battle into +1 gold each.
- **Distribution**: NOT in random pool. Appears as 1-time guaranteed offer at a special CH2 \"Crystal Shrine\" node.
- **Cost**: 50 gold (purchase, not free drop).
- **Vibe**: NIM-themed brand touchpoint without spamming brand.

---

## 5.7 Counter-play matrix (validates §4 risks)

| §4 threat | Counter relic | Tier / Weight | Notes |
|---|---|---|---|
| Dracula phase 2 lifesteal | `holy_water` | Rare W1 | Rare drop = decision moment if you find it |
| Vampire Lord lifesteal | `holy_water` | Rare W1 | Same |
| Vampire Mage curse DoT | `cleansing_bell` | Rare W4 | Common-ish, accessible |
| Boss SCHEME spam | `iron_will` | Rare W3 | Mid weight |
| Low HP wipe | `phoenix_ember` / `heart_of_nimblade` | Rare W4 / Epic W1 | Layered safety nets |

---

## 5.8 Implementation notes for §5 → code

- Data file: `src/data/relics.js` — array of `{id, name, tier, weight, effect_id, description, icon}`.
- `effect_id` maps to a function in `src/engine/relicEffects.js` (event-driven: `on_battle_start`, `on_slash_win`, `on_turn_start`, `on_hp_drop`, etc.).
- Active relics displayed in top-right inventory strip (icon grid, hover tooltip).
- Drop weight rolled per pool — see §5.2 pseudocode.
- Boss drop: roll 1 from rare+epic combined pool (rare weight 6 / epic weight 4 per drop).

---

## NEXT after §5 lock
- §6 Campfire / Shop mechanics
- §7 Meta tree (permanent unlocks)
- §8 Economy (gold flow + NIM purchases re-balance)


-------------------------------------------------------------


# NIMBLADE Design Doc — Section 6: CAMPFIRE / SHOP / MYSTERY (v0.2 FINAL LOCKED)

> Status: 🔒 LOCKED 2026-06-11. Post-review pass: cleanse dropped (junk relics already safe), mystery epic drop @ 3%, NIM offers shop-only.
> Legend: 🔵 PDF v0.9 · 🟢 locked · 🟡 new

---

## 6.1 CAMPFIRE NODE 🟢

Player picks **1 of 3 options** (others lost):

| Option | Effect | Tradeoff |
|---|---|---|
| 🛌 **REST** | Heal 40% max HP (rounded down) | Safe pick, no power gain |
| ⚔️ **SHARPEN** | Pick 1 basic RPS action (SLASH/GUARD/COUNTER) → permanent +2 dmg for run | Skip heal, need HP buffer |
| 🎲 **SMOKE** | 50/50 roll: gain 30 gold OR lose 10 HP | Gambling, best at full HP |

**Decision tension**: heal vs power-up vs gamble. Each pick excludes the others.

Campfire placement (from §1):
- Floor 4 (campfire/mystery/normal node choice)
- Floor 8 (1-2 campfires pre-boss)

---

## 6.2 SHOP NODE 🟢

Full inventory visible. Player buys what they can afford:

```
3 RELIC SLOTS:
  Slot 1: Common @ 30 gold
  Slot 2: Common @ 40 gold
  Slot 3: Rare    @ 75 gold
  (Random draw from respective tier pools)

1 WEAPON UPGRADE:
  +3 dmg permanent to currently equipped weapon
  Cost: 50 gold

1 NIM PURCHASE 💎:
  "Sharpen Stone" — +5 dmg permanent to equipped weapon
  Cost: 1 NIM (real money)
  1x per shop visit
```

**No cleanse slot** (v0.2 change): all junk-tier relics are marginal-positive or neutral, so cleanse not needed. Simpler shop layout.

**Shop placement**: Floor 5 (shop/elite/normal node choice).

---

## 6.3 MYSTERY NODE 🟢

Player enters → random roll picks 1 of 6 events:

| # | Event | Effect |
|---|---|---|
| 1 | 🛒 Wandering Merchant | 1 relic offered, -25% discount |
| 2 | 🪙 Shrine of Gold | Sacrifice 10 HP → gain 50 gold |
| 3 | 📦 Cursed Chest | Free random relic, BUT 50% chance cursed 1 battle |
| 4 | 💧 Healing Spring | Heal 20 HP, no cost |
| 5 | 🔮 Ancient Rune | +1 max energy regen/turn permanent (run-only) |
| 6 | 🏹 Bandit Ambush | Elite battle, drops 2 relics if won |

### 6.3.1 Mystery relic distribution 🟡 (v0.2 NEW)

For events that grant relics (Wandering Merchant, Cursed Chest, Bandit Ambush drops):

```python
roll = random(0, 100)
if roll < 3:     tier = "epic"     # 3% jackpot
elif roll < 33:  tier = "rare"     # 30%
else:            tier = "common"   # 67%
```

Bandit Ambush = 2 independent rolls (so ~6% chance at least 1 epic).

**Decision tension**: mystery = gamble. Could be jackpot (epic relic!) or trap (cursed chest curse, bandit fight at low HP).

**Mystery placement**: Floor 4 + Floor 7 (mystery/elite choice).

---

## 6.4 Open items deferred to later sections

- **Cursed Chest curse mechanic** — define exact debuff in §4 effect glossary update
- **Ancient Rune stacking** — only 1 active per run (no double-up if same event rolled twice)
- **Gold balance** — exact campfire/shop/mystery gold rewards finalized in §8 Economy
- **NIM Sharpen Stone pricing** — confirmed 1 NIM, shop-only, available every shop (cumulative possible across run)

=================================================================

# NIMBLADE Design Doc — Section 3: WEAPONS (v0.2 FINAL LOCKED)

> Status: 🔒 LOCKED 2026-06-11. Achievement-based unlock. 4 weapons. Sword starter.
> Legend: 🔵 PDF v0.9 · 🟢 locked · 🟡 new

---

## 3.1 Weapon Roster Overview 🟢

| Weapon | Identity | SLASH | GUARD taken | COUNTER (win/loss) | WS dmg @ cost | Ult cost |
|---|---|---|---|---|---|---|
| 🗡 Sword | Balanced (starter) | 10 | 50% | 14 / +3 | 8 @ 40e | 100e |
| ⚡ Spear | Counter-focused | 9 | 50% | 16 / +2 | 8 @ 40e | 100e |
| 🪓 Axe | Brute force | 13 | 65% | 14 / +3 | 8 @ 40e | 100e |
| 📜 Staff | Mage / abilities | 8 | 50% | 12 / +3 | 10 @ 35e | 85e |

GUARD win dmg = 6 for all weapons. Energy regen +20/turn baseline for all. Staff is **raw** (no intrinsic energy bonus) — high-skill weapon.

---

## 3.2 Passives & Ultimates 🟢

### 🗡 SWORD
- **Passive — Momentum**: +1 dmg permanent buff stacks on each basic RPS win (SLASH + COUNTER wins only, GUARD wins don't count). Cap at **+5**. Reset to 0 on any draw/loss. Persists across battles within run.
- **Ultimate — Blade Rush** (100 energy): deals **25 dmg**, ignores RPS outcome (always deals), ignores monster GUARD intent reduction.

### 🪓 AXE
- **Passive — Crit Strike**: 10% chance on SLASH/COUNTER wins to deal ×2 damage. Visual: red flash + "CRIT!" text.
- **Ultimate — Berserk** (100 energy): for **2 turns** player deals +100% damage, BUT also takes +50% damage from monster during those 2 turns. Pure risk/reward.

### ⚡ SPEAR
- **Passive — Precise Read**: COUNTER wins deal **+2 dmg** (16 → **18 dmg** on COUNTER win).
- **Ultimate — Foresight** (100 energy): skip current turn (player deals no dmg, monster acts free), AND reveal next **2 turns** of monster intent at 100% honesty (overrides chapter intent honesty %).

### 📜 STAFF
- **Passive — Arcane Recovery**: +1 HP per RPS win (SLASH/GUARD/COUNTER wins only, no Wild Strike/Ult). No cap.
- **Ultimate — Purify** (85 energy): heal 15 HP + restore 40 energy. Cycle ult — enables mage rotation (cast Ult → immediate energy refund → cast Wild Strike or build to next Ult).

---

## 3.3 Achievement-Based Unlock System 🟢

Sword = starter (always unlocked). Other 3 unlocked via in-game achievements:

| Weapon | Unlock Achievement | Difficulty |
|---|---|---|
| 🪓 Axe | Deal 30+ dmg in a single turn (any run) | Medium |
| ⚡ Spear | Win 1 battle with 4+ total COUNTER wins | Hard |
| 📜 Staff | Use Ultimate 5 times in a single run (any run, win or die) | Hardest |

**Tracker schema** (Supabase):
```sql
profiles (
  id uuid PRIMARY KEY,
  unlocked_weapons text[] DEFAULT '{"sword"}',
  achievement_progress jsonb DEFAULT '{}'
)
```

`achievement_progress` example:
```json
{
  "axe_max_turn_dmg": 27,
  "spear_max_counter_wins_battle": 3,
  "staff_max_ult_per_run": 4
}
```

UI: lobby "Weapon Rack" modal shows 4 weapons. Locked weapons grayed with tooltip showing unlock criteria + current progress.

---

## 3.4 Open items deferred

- **Ultimate animation specs** — §9 UI/UX
- **Weapon sprite asset list** — Murid generating hurt/death sprites separately; idle/slash/guard/counter/ultimate poses already have for all 4 weapons (5 × 4 = 20 sprites done)
- **NIM Sharpen Stone application per weapon** — confirmed in §6 (works on equipped weapon, +5 dmg permanent)
- **Weapon upgrade application per weapon** — shop +3 dmg upgrade scales SLASH only? or all basic actions? → TBD §8 Economy

===================================================================

# NIMBLADE Design Doc — Section 8: ECONOMY (v0.2 FINAL LOCKED)

> Status: 🔒 LOCKED 2026-06-11. 5-layer economy: gold income, shop pricing, shard conversion, NIM offers, ascension.

---

## 8.1 LAYER 1 — Gold Income per Node 🟢

| Node | Gold reward |
|---|---|
| Normal battle won | 6-10 gold (random in range) |
| Elite battle won | 16-24 gold |
| Boss battle won | 36-44 gold |
| Treasure node | 0 (gives relic) |
| Shop node | 0 (spending only) |
| Campfire SMOKE (50/50) | +24 gold or -10 HP |
| Mystery — Shrine of Gold | +40 gold (-10 HP cost) |
| Mystery — Bandit Ambush | +20-28 gold + 2 relic drops |
| Other mystery events | 0 (HP/relic effects) |

**Typical ch1 clear earns ~104 gold** (4 normals × 8 + elite 20 + boss 40 + mystery avg 12). Partial death runs earn ~50-65 gold.

---

## 8.2 LAYER 2 — Shop Pricing 🟢

| Item | Price | Effect |
|---|---|---|
| Common relic slot 1 | 30 gold | random common |
| Common relic slot 2 | 40 gold | random common |
| Rare relic slot | 75 gold | random rare |
| Weapon upgrade | 50 gold | +3 dmg to SLASH + COUNTER win |
| NIM Sharpen Stone | 1 NIM | +5 dmg to SLASH + COUNTER win |

**Cap: max 3 NIM Sharpen Stones per run** regardless of shop visits. After 3rd purchase, NIM slot empty in subsequent shops.

---

## 8.3 LAYER 3 — Shard Conversion + Forge Tree 🟢

**Shards = 20% of total gold earned in run** (regardless of survival).

**Forge tree pricing** (12 nodes, 4 branches × 3 tiers):

```
Tier 1 (4 nodes):  40 shards each =  160
Tier 2 (4 nodes): 100 shards each =  400
Tier 3 (4 nodes): 250 shards each = 1000
TOTAL FULL UNLOCK:                 1560 shards
```

**Time-to-full-unlock estimate (v1 ch1-only)**:
- Avg gold/attempt: ~51 gold
- Avg shards/attempt: ~10 shards
- Full unlock: ~150 attempts ≈ 25-30 hours minimum
- Player skill spread: pros ~20h, casuals ~35h

---

## 8.4 LAYER 4 — NIM Offers 🟢

| NIM Item | Cost | Source | Effect |
|---|---|---|---|
| NIM Sharpen Stone | 1 NIM | Shop only (max 3/run) | +5 dmg permanent (SLASH + COUNTER win) |
| Nimiq Crystal Shrine | 1 NIM **or** 50g + 30% HP | Ch1 Mystery event (Wandering Nimiq Merchant) | Grants `nimiq_crystal` epic relic |

Nimiq Crystal Shrine details (locked in §6 Mystery rev):
- **Pay 1 NIM** → full `nimiq_crystal` relic (live NIM transaction)
- **Pay 50g + 30% current HP** → cursed crystal: same relic effect + 1 curse stack (decays per node cleared)
- **Leave** → no effect

NIM is intentionally minimal-scope. Max realistic NIM spend per run: 1 NIM (crystal) + 3 NIM (Sharpen) = 4 NIM = ~$1-2 USD lifetime spend per committed run. Competition-acceptable.

---

## 8.5 LAYER 5 — Ascension Rewards 🟢

Unlocked after first Ch1 boss clear. 5 levels, scaling difficulty + shard bonus:

| Level | Modifier | Gold/Shard multiplier |
|---|---|---|
| Asc 1 | Enemy dmg +10% | ×1.10 |
| Asc 2 | + Elite spawn rate +50% | ×1.20 |
| Asc 3 | + Player start -10 max HP | ×1.35 |
| Asc 4 | + Intent honesty -10% all chapters | ×1.50 |
| Asc 5 | + Boss extra phase mechanic | ×1.70 |

Cap at 70% bonus (was 75%). Endgame loop for post-tree-unlock players.

---

## 8.6 Multi-Chapter Scaling Direction (v2+ note) 🟡

For v2 (ch1-3 / 1-hour runs) and beyond:
- **Linear power scaling**: monster HP × (1 + 0.3 × chapter), dmg × (1 + 0.2 × chapter). Ch3 boss ≈ 1.9× ch1 boss HP.
- **Shard conversion may drop to 15%** to maintain 20+ hour grind target as runs get longer.
- **Forge tree may expand**: 4 more nodes per branch added per chapter milestone (10 ch × 4 nodes = 40 final).
- **Achievement gating**: existing achievements re-scope or new ones added per chapter unlock.

Rebalance per playtest data. Not final v1 commitment.

---

## 8.7 Curse Stacking Rules 🟢

- Curse stacks: cap at **2 simultaneous active curses**
- 3rd cursed event auto-declines (no curse, no relic)
- Decay: 1 stack removed per node cleared (merciful long-run)

---

## 8.8 Weapon Upgrade + NIM Sharpen Application Scope 🟢

Both effects apply to **SLASH + COUNTER win damage only**.
- Does NOT affect: GUARD win damage, Wild Strike, Ultimate damage
- Stacks multiplicatively with weapon-specific passives (Momentum, Precise Read, Crit Strike)
- Stacks additively across multiple upgrades/stones

=====================================================================

# NIMBLADE Design Doc — Section 9: UI/UX (v0.2 LOCKED)

> Status: 🔒 LOCKED 2026-06-11. Murid provided polished battle layout reference. This doc codifies info architecture + screen inventory.

---

## 9.1 Screen Inventory (14 screens)

```
START FLOW:
  1. Splash       — logo, "PLAY" CTA, NIM wallet connect button
  2. Lobby        — main hub (weapon rack, forge, start/continue run, settings)

WEAPON & META:
  3. Weapon Rack  — 4 weapons, achievement progress per locked
  4. Forge Tree   — 12-node meta tree, shard spending UI

RUN FLOW:
  5. Map          — StS-style branching, current chapter, next nodes
  6. Battle       — RPS combat (most complex; layout in 9.2)
  7. Campfire     — REST/SHARPEN/SMOKE picker
  8. Shop         — relics + weapon upgrade + NIM Sharpen Stone
  9. Mystery      — dynamic per event (6 events + Wandering Nimiq Merchant)
  10. Treasure    — relic pick
  11. Boss Intro  — chapter boss reveal animation

RUN END:
  12. Run Result  — victory/defeat, shards earned breakdown, leaderboard rank

PROFILE:
  13. Achievements — progress on weapon unlocks
  14. Settings    — audio, NIM wallet, credits (EN only v1)
```

---

## 9.2 Battle Screen Layout (Murid-locked reference)

```
┌─────────────────────────────────────────────┐
│ ⚙   STAGE NAME · STAGE x/5    [RUN INFO]   │  HEADER
├──────────────────────┬──────────────────────┤
│ YOU                  │       GOBLIN WARRIOR │  BATTLE ZONE
│ ❤  HP [████████] N/N │  ❤ HP [██████░░] N/N │  side-by-side
│ ⚡ ENG [████░░░░] N/N │  INTENT: 🗡 Slash    │
│                      │  BUFFS: [Rage +3]    │
│  [player sprite]  VS  [enemy sprite]        │
│                                              │
├──────────────┬──────────────┬───────────────┤
│ WEAPON       │ ULTIMATE     │ ROUND INFO    │  MID PANEL
│ 🗡 Sword     │ ✦ Blade Rush │ Round 1/∞     │  3 columns
│ Passive:     │ [████░░] N/E │               │
│ Momentum     │ Deal 25 DMG  │ BATTLE LOG    │
│ +1 DMG/win   │ Ignore Shield│ -- start --   │
│ Stacks: N    │              │ Goblin: Slash │
│ Combo: ×N    │              │ You: Counter  │
└──────────────┴──────────────┴───────────────┤
│            CHOOSE YOUR MOVE                  │  ACTIONS
├──────────────┬──────────────┬───────────────┤
│ 🗡 SLASH 10  │ 🛡 GUARD 6   │ ⚔ COUNTER 14  │
│ Beats Counter│ Beats Slash  │ Beats Guard   │
├──────────────┴──────────────┴───────────────┤
│ [SURRENDER — give up battle, lose HP]       │
├──────────────────────────────────────────────┤
│ ACTIVE RELICS:                               │  FOOTER
│ [🗡+2][🛡+5][💰+10%][🧪heal][_____]          │
└──────────────────────────────────────────────┘
```

**Critical info visibility decisions:**

| Info | Location | Always-visible? |
|---|---|---|
| Player HP/MaxHP | Top-left battle zone | ✅ |
| Player Energy | Top-left battle zone | ✅ |
| Enemy HP | Top-right battle zone | ✅ |
| Enemy Intent + dmg estimate | Top-right battle zone | ✅ |
| Enemy Buffs (Rage, Speed, etc) | Top-right BUFFS panel | ✅ |
| Weapon equipped + Passive + Passive stacks | WEAPON mid-card | ✅ |
| **Combo counter** | WEAPON mid-card under passive stacks | ✅ |
| Ultimate progress + dmg/effect | ULTIMATE mid-card | ✅ |
| Round counter | ROUND INFO mid-card | ✅ |
| Battle Log (last 2-3 turns) | ROUND INFO mid-card | ✅ |
| RPS buttons + dmg numbers + "Beats X" tooltip | Action zone | ✅ |
| Surrender button | Below RPS row | ✅ |
| Active relics (4-5 slots, tappable for tooltip) | Footer row | ✅ |
| **Curse stack** | Player BUFFS panel (mirror enemy buffs, left side) | ✅ if active |
| **Gold counter** | Inside RUN INFO modal (tap button to open) | On-demand |
| Intent honesty % | **HIDDEN from HUD** (vibes > stats) | ❌ |
| Wild Strike / READ | Removed for v1 to simplify — *flagged for §9 review* | TBD |

**Removed from v1 (simplicity)**:
- Random Move button (Murid unsure of purpose; defer to v2 if needed for accessibility)

**Pending design clarifications**:
- Wild Strike (energy ability) — does it stay as separate button, or fold into Ultimate slot? Layout has only 1 energy ability slot visible.
- READ action — needed for spear/intent-reveal builds. Where does it live in this layout? Possibly hidden behind RUN INFO or surfaced only when relevant.

---

## 9.3 UI Principles 🔒

```
✅ Mobile-first (vertical 9:16 portrait)
✅ Tappable hit targets ≥ 44px
✅ Critical info ALWAYS visible during battle (battle screen layout above)
✅ Tap-and-hold = tooltip (relic descriptions, weapon passives, etc)
✅ Animation feedback for every action (hit shake, heal pulse, draw flash)
✅ Color coding consistent:
     🟢 green = positive (heal, gain, player power)
     🔴 red = damage / negative / enemy
     🟡 yellow = gold / warning / ultimate-ready
     🔵 blue = energy / abilities
     🟣 purple = curse / mystery / epic relics
✅ Sound: hit, win, lose, ult, victory, gold-gain, relic-pickup, button-tap (min 8 SFX)
✅ Text ≥ 14px body, ≥ 18px CTA
✅ Language: English ONLY v1 (ID added v2)
```

---

## 9.4 Map Screen 🔒

- **StS-style branching** (multi-path picks)
- Show full chapter map (8 floors), current position highlighted
- Each node shows icon (battle/elite/shop/campfire/mystery/treasure/boss)
- Tap node → preview popup (node type + tier + brief description)
- Player persistent HUD on map screen:
  - HP / Max HP
  - Gold
  - Active relics (icon row)
  - Weapon + upgrade level
  - Active curse count (if > 0)
  - Active forge buffs (collapsed icon list)

---

## 9.5 Lobby Hub 🔒

```
[NIMBLADE logo + selected weapon hero art]

  ▶ START RUN  (or CONTINUE RUN if save exists)
  🗡 Weapon Rack — current: Sword
  🏛 Forge Tree — Shards: NNN
  🏆 Leaderboard — your rank: #NNN
  🎖 Achievements
  ⚙ Settings

Footer: NIM wallet status, version
```

- **Continue Run** automatically shown if mid-run save exists
- **Leaderboard** = only social feature v1. Shows global top N + your rank. (Detail tbd §10)
- No friend system, no sharing, no chat v1

---

## 9.6 Forge Tree 🔒

```
Shards: NNN 🔷

[4 branches visualization — Survival / Economy / Combat / Abilities]
Each branch: T1 → T2 → T3 chain (locked nodes grayed)

Tap node:
  - Description (effect)
  - Cost (shards)
  - Prerequisite (tier in same branch)
  - [UNLOCK] button if affordable + prereq met
```

---

## 9.7 Run Info Modal (tap RUN INFO button) 🔒

```
Tap "RUN INFO" button on battle screen header → modal opens with:

┌─────────────────────────┐
│ RUN INFO                │
│                         │
│ 💰 Gold: NNN            │
│ 🔮 Relics (N):          │
│   - [icon] Eye of Omni  │
│   - [icon] Burning Brand│
│   ...                   │
│ 🗡 Weapon: Sword +1     │
│ 🟢 Forge buffs active:  │
│   - Sharp Blade (+2)    │
│   - Coin Pouch (+20g)   │
│ Chapter progress: 4/8   │
│ Run time: 12:34         │
│                         │
│ [CLOSE]                 │
└─────────────────────────┘
```

Modal lives outside battle HUD to keep main screen clean. Player can check anytime without clutter.

---

## 9.8 Surrender Behavior 🔒

- Insta-end current battle as loss
- Player loses % HP equivalent to monster damage estimate
- Returns to map node selection
- Run continues (NOT full game over)
- Use case: strategic escape when player knows fight is unwinnable
