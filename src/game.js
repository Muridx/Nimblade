// ─── WEAPONS ────────────────────────────────────────────────────────────────
export const WEAPONS = {
  sword: {
    name: 'Sword', icon: '⚔️',
    idle: '/assets/sword_idle.png',
    slash: '/assets/sword_slash.png',
    guard: '/assets/sword_guard.png',
    counter: '/assets/sword_counter.png',
    ult: '/assets/sword_ultimate.png',
    unlockCost: 0,
    identity: 'Balanced fighter. Scales harder the longer the fight goes.',
    passive: { name: 'Momentum', desc: 'Win a round: +1 dmg permanent (this run). Stacks forever.' },
    ultimate: { name: 'Blade Rush', desc: 'Deal 25 damage. Ignores armor and shields.', cost: 100 },
  },
  spear: {
    name: 'Spear', icon: '🔱',
    idle: '/assets/spear_idle.png',
    slash: '/assets/spear_slash.png',
    guard: '/assets/spear_guard.png',
    counter: '/assets/spear_counter.png',
    ult: '/assets/spear_ultimate.png',
    unlockCost: 200,
    identity: 'Prediction master. Rewards reading monster patterns.',
    passive: { name: 'Precise Read', desc: 'Counter wins deal +50% damage (15 → 22).' },
    ultimate: { name: 'Foresight', desc: "Reveal monster's actual next move (ignores intent).", cost: 100 },
  },
  axe: {
    name: 'Axe', icon: '🪓',
    idle: '/assets/axe_idle.png',
    slash: '/assets/axe_slash.png',
    guard: '/assets/axe_guard.png',
    counter: '/assets/axe_counter.png',
    ult: '/assets/axe_ultimate.png',
    unlockCost: 300,
    identity: 'High risk, high reward. Burst damage specialist.',
    passive: { name: 'Critical Strike', desc: '20% chance on win: damage ×2.' },
    ultimate: { name: 'Berserk', desc: 'Next 2 rounds: damage ×2. Cannot Guard.', cost: 100 },
  },
  staff: {
    name: 'Staff', icon: '🧙',
    idle: '/assets/staff_idle.png',
    slash: '/assets/staff_slash.png',
    guard: '/assets/staff_guard.png',
    counter: '/assets/staff_counter.png',
    ult: '/assets/staff_ultimate.png',
    unlockCost: 400,
    identity: 'Sustain & utility. Hard to kill, counters monster buffs.',
    passive: { name: 'Arcane Recovery', desc: 'Win a round: heal 3 HP.' },
    ultimate: { name: 'Purify', desc: 'Remove all monster buffs. Heal 15 HP.', cost: 100 },
  },
}

// ─── RELICS ──────────────────────────────────────────────────────────────────
export const RELICS = {
  // COMMON
  sharp_blade:      { id: 'sharp_blade',      name: 'Sharp Blade',      rarity: 'common', icon: '🗡️', desc: 'Slash damage +2.', timing: 'per round, on win' },
  iron_guard:       { id: 'iron_guard',        name: 'Iron Guard',       rarity: 'common', icon: '🛡️', desc: 'Guard damage +2.', timing: 'per round, on win' },
  quick_reflex:     { id: 'quick_reflex',      name: 'Quick Reflex',     rarity: 'common', icon: '⚡', desc: 'Counter damage +2.', timing: 'per round, on win' },
  lucky_coin:       { id: 'lucky_coin',        name: 'Lucky Coin',       rarity: 'common', icon: '🪙', desc: 'Gold earned +10%.', timing: 'on dungeon clear' },
  vitality:         { id: 'vitality',          name: 'Vitality',         rarity: 'common', icon: '❤️', desc: 'Max HP +10.', timing: 'passive, permanent this run' },
  blood_drop:       { id: 'blood_drop',        name: 'Blood Drop',       rarity: 'common', icon: '🩸', desc: 'Win a round: heal 1 HP.', timing: 'per round, on win' },
  battle_focus:     { id: 'battle_focus',      name: 'Battle Focus',     rarity: 'common', icon: '🎯', desc: 'Start each battle with +20 Energy.', timing: 'per battle/stage' },
  warrior_gloves:   { id: 'warrior_gloves',    name: 'Warrior Gloves',   rarity: 'common', icon: '🥊', desc: 'Ultimate damage +10%.', timing: 'on ult use' },
  sturdy_armor:     { id: 'sturdy_armor',      name: 'Sturdy Armor',     rarity: 'common', icon: '🪖', desc: 'All damage received -1.', timing: 'per round, on hit' },
  adrenaline:       { id: 'adrenaline',        name: 'Adrenaline',       rarity: 'common', icon: '💊', desc: 'HP below 50%: damage +2.', timing: 'per round, conditional' },
  hunters_instinct: { id: 'hunters_instinct',  name: "Hunter's Instinct",rarity: 'common', icon: '🏹', desc: 'Boss damage +10%.', timing: 'per round, vs boss' },
  recovery_potion:  { id: 'recovery_potion',   name: 'Recovery Potion',  rarity: 'common', icon: '🧪', desc: 'After picking a relic: heal 5 HP.', timing: 'after relic pick' },
  // RARE
  razor_edge:       { id: 'razor_edge',        name: 'Razor Edge',       rarity: 'rare',   icon: '🔪', desc: 'Slash wins deal +5 damage.', timing: 'per round, on win' },
  fortress_shield:  { id: 'fortress_shield',   name: 'Fortress Shield',  rarity: 'rare',   icon: '🏰', desc: 'Guard wins: heal 3 HP.', timing: 'per round, on win' },
  deadly_reflex:    { id: 'deadly_reflex',     name: 'Deadly Reflex',    rarity: 'rare',   icon: '💥', desc: 'Counter wins deal +7 damage.', timing: 'per round, on win' },
  energy_core:      { id: 'energy_core',       name: 'Energy Core',      rarity: 'rare',   icon: '🔋', desc: 'Win a round: +10 Energy bonus.', timing: 'per round, on win' },
  treasure_map:     { id: 'treasure_map',      name: 'Treasure Map',     rarity: 'rare',   icon: '🗺️', desc: 'Gold earned +25%.', timing: 'on dungeon clear' },
  berserker_charm:  { id: 'berserker_charm',   name: 'Berserker Charm',  rarity: 'rare',   icon: '😤', desc: 'HP below 30%: damage +50%.', timing: 'per round, conditional' },
  second_wind:      { id: 'second_wind',       name: 'Second Wind',      rarity: 'rare',   icon: '💨', desc: 'Once per run: when HP drops below 20%, auto-heal 20 HP.', timing: 'one-time trigger — hangus setelah trigger' },
  hunters_mark:     { id: 'hunters_mark',      name: "Hunter's Mark",    rarity: 'rare',   icon: '🎯', desc: 'Boss damage +20%.', timing: 'per round, vs boss' },
  // EPIC
  crown_of_momentum:{ id: 'crown_of_momentum', name: 'Crown of Momentum',rarity: 'epic',   icon: '👑', desc: 'Win a round: +2 damage permanent (stacks with Sword passive).', timing: 'per round, stacks' },
  eye_of_prediction:{ id: 'eye_of_prediction', name: 'Eye of Prediction',rarity: 'epic',   icon: '👁️', desc: "Each battle: see monster's first move (actual, not intent).", timing: 'per battle/stage' },
  vampiric_core:    { id: 'vampiric_core',     name: 'Vampiric Core',    rarity: 'epic',   icon: '🧛', desc: 'Heal 20% of all damage dealt.', timing: 'per round, on deal damage' },
  blood_god_totem:  { id: 'blood_god_totem',   name: 'Blood God Totem',  rarity: 'epic',   icon: '🩸', desc: 'Critical chance +25% (Axe: total 45%).', timing: 'passive, permanent this run' },
}

// ─── META PROGRESSION TREE ───────────────────────────────────────────────────
export const UPGRADE_TREE = {
  // Survivor Tree
  tough_skin_1:    { id: 'tough_skin_1',    name: 'Tough Skin I',      tree: 'survivor', cost: 100, desc: '+5 HP at start of each run.', requires: null },
  tough_skin_2:    { id: 'tough_skin_2',    name: 'Tough Skin II',     tree: 'survivor', cost: 250, desc: '+10 HP at start of each run.', requires: 'tough_skin_1' },
  veteran:         { id: 'veteran',         name: 'Veteran',           tree: 'survivor', cost: 500, desc: '+20 HP at start of each run.', requires: 'tough_skin_2' },
  // Hunter Tree
  sharp_eyes:      { id: 'sharp_eyes',      name: 'Sharp Eyes',        tree: 'hunter',  cost: 100, desc: 'Monster intent change chance: 20% → 15%.', requires: null },
  pattern_reader:  { id: 'pattern_reader',  name: 'Pattern Reader',    tree: 'hunter',  cost: 300, desc: 'Monster intent change chance: 15% → 10%.', requires: 'sharp_eyes' },
  sixth_sense:     { id: 'sixth_sense',     name: 'Sixth Sense',       tree: 'hunter',  cost: 600, desc: 'Boss intent change chance: 20% → 10%.', requires: 'pattern_reader' },
  // Relic Tree
  lucky_find:      { id: 'lucky_find',      name: 'Lucky Find',        tree: 'relic',   cost: 150, desc: 'Rare relic chance +5%.', requires: null },
  treasure_hunter: { id: 'treasure_hunter', name: 'Treasure Hunter',   tree: 'relic',   cost: 300, desc: 'Rare relic chance +10%.', requires: 'lucky_find' },
  ancient_knowledge:{ id: 'ancient_knowledge', name: 'Ancient Knowledge', tree: 'relic', cost: 500, desc: 'Epic relic chance +3%, Rare +5%.', requires: 'treasure_hunter' },
  // Gold Tree
  bounty_hunter:   { id: 'bounty_hunter',   name: 'Bounty Hunter',     tree: 'gold',    cost: 150, desc: 'Gold earned +5%.', requires: null },
  rich_adventurer: { id: 'rich_adventurer', name: 'Rich Adventurer',   tree: 'gold',    cost: 400, desc: 'Gold earned +10%.', requires: 'bounty_hunter' },
  treasure_magnet: { id: 'treasure_magnet', name: 'Treasure Magnet',   tree: 'gold',    cost: 600, desc: 'Gold earned +20%.', requires: 'rich_adventurer' },
  // Ultimate Tree
  weapon_training:   { id: 'weapon_training',   name: 'Weapon Training',   tree: 'ultimate', cost: 250, desc: '+5 Energy per round (20 → 25).', requires: null },
  battle_experience: { id: 'battle_experience', name: 'Battle Experience', tree: 'ultimate', cost: 400, desc: '+5 Energy per round (25 → 30).', requires: 'weapon_training' },
  master_combatant:  { id: 'master_combatant',  name: 'Master Combatant',  tree: 'ultimate', cost: 750, desc: 'Start each battle with 25 Energy.', requires: 'battle_experience' },
}

// ─── NIM EXCLUSIVE: SHARPEN STONE TIERS ─────────────────────────
// 5-tier permanent upgrade purchased with NIM. Each tier grants +1 Max HP.
// Tiers are sequential: must own tier N-1 before buying tier N.
// Prices are intentionally low; tune later by editing `costNim` only.
export const SHARPEN_STONE_TIERS = [
  { tier: 1, name: 'Sharpen Stone I',   costNim: 1, hpBonus: 1 },
  { tier: 2, name: 'Sharpen Stone II',  costNim: 2, hpBonus: 1 },
  { tier: 3, name: 'Sharpen Stone III', costNim: 3, hpBonus: 1 },
  { tier: 4, name: 'Sharpen Stone IV',  costNim: 5, hpBonus: 1 },
  { tier: 5, name: 'Sharpen Stone V',   costNim: 8, hpBonus: 1 },
]

// Returns the next tier the player can buy, or null if maxed out.
export function getNextSharpenTier(currentLevel = 0) {
  const lvl = Math.max(0, Math.min(5, currentLevel | 0))
  if (lvl >= 5) return null
  return SHARPEN_STONE_TIERS[lvl]  // tier index = current level (0-based)
}

// Returns total +HP from Sharpen Stone at this level.
export function getSharpenStoneHpBonus(currentLevel = 0) {
  return Math.max(0, Math.min(5, currentLevel | 0))
}

// ─── DUNGEONS ────────────────────────────────────────────────────────────────
export const DUNGEONS = [
  { id: 1,  name: 'Goblin Camp',     theme: 'forest',   bg: '/assets/arena_battle.png', gold: 50,  stages: [{ monster: 'goblin_scout' }, { monster: 'goblin_archer' }, { monster: 'goblin_shaman' }, { monster: 'goblin_warrior', isElite: true }, { monster: 'goblin_king', isBoss: true }] },
  { id: 2,  name: 'Dark Forest',     theme: 'forest',   bg: '/assets/arena_battle.png', gold: 75,  stages: [{ monster: 'wild_wolf' }, { monster: 'poison_frog' }, { monster: 'forest_witch' }, { monster: 'treant', isElite: true }, { monster: 'forest_king', isBoss: true }] },
  { id: 3,  name: 'Abandoned Mine',  theme: 'cave',     bg: '/assets/arena_battle.png', gold: 100, stages: [{ monster: 'mine_bat' }, { monster: 'rock_golem' }, { monster: 'cave_troll' }, { monster: 'dark_miner', isElite: true }, { monster: 'mine_overlord', isBoss: true }] },
  { id: 4,  name: 'Cursed Swamp',    theme: 'swamp',    bg: '/assets/arena_battle.png', gold: 125, stages: [{ monster: 'swamp_slug' }, { monster: 'bog_witch' }, { monster: 'mud_golem' }, { monster: 'swamp_hydra', isElite: true }, { monster: 'swamp_titan', isBoss: true }] },
  { id: 5,  name: 'Bandit Fortress', theme: 'fortress', bg: '/assets/arena_battle.png', gold: 150, stages: [{ monster: 'bandit_scout' }, { monster: 'bandit_mage' }, { monster: 'bandit_captain' }, { monster: 'bandit_assassin', isElite: true }, { monster: 'bandit_lord', isBoss: true }] },
  { id: 6,  name: 'Ancient Ruins',   theme: 'ruins',    bg: '/assets/arena_battle.png', gold: 175, stages: [{ monster: 'stone_sentinel' }, { monster: 'ruin_wraith' }, { monster: 'golem_guardian' }, { monster: 'arcane_construct', isElite: true }, { monster: 'ancient_colossus', isBoss: true }] },
  { id: 7,  name: 'Vampire Castle',  theme: 'castle',   bg: '/assets/arena_battle.png', gold: 200, stages: [{ monster: 'vampire_bat' }, { monster: 'thrall_knight' }, { monster: 'vampire_mage' }, { monster: 'vampire_lord', isElite: true }, { monster: 'count_dracula', isBoss: true }] },
  { id: 8,  name: 'Frozen Tundra',   theme: 'ice',      bg: '/assets/arena_battle.png', gold: 225, stages: [{ monster: 'ice_wolf' }, { monster: 'frost_witch' }, { monster: 'ice_golem' }, { monster: 'frost_giant', isElite: true }, { monster: 'ice_queen', isBoss: true }] },
  { id: 9,  name: 'Shadow Realm',    theme: 'shadow',   bg: '/assets/arena_battle.png', gold: 250, stages: [{ monster: 'shadow_clone' }, { monster: 'dark_specter' }, { monster: 'void_knight' }, { monster: 'shadow_titan', isElite: true }, { monster: 'shadow_king', isBoss: true }] },
  { id: 10, name: 'Demon Throne',    theme: 'demon',    bg: '/assets/arena_battle.png', gold: 300, stages: [{ monster: 'demon_guard' }, { monster: 'demon_mage' }, { monster: 'demon_knight' }, { monster: 'arch_demon', isElite: true }, { monster: 'demon_lord', isBoss: true }] },
]

// ─── MONSTER DATA ─────────────────────────────────────────────────────────────
export const MONSTERS = {
  // D1 — Goblin Camp
  goblin_scout:   { name: 'Goblin Scout',   hp: 30,  idle: '/assets/goblin_scout.png',   attack: '/assets/goblin_scout_attack.png',   pattern: ['slash','slash','guard','slash','guard'],         buff: null,                                                       phase2: null },
  goblin_archer:  { name: 'Goblin Archer',  hp: 35,  idle: '/assets/goblin_archer.png',  attack: '/assets/goblin_archer_attack.png',  pattern: ['guard','counter','guard','counter','guard'],       buff: null,                                                       phase2: null },
  goblin_shaman:  { name: 'Goblin Shaman',  hp: 40,  idle: '/assets/goblin_shaman.png',  attack: '/assets/goblin_shaman_attack.png',  pattern: ['counter','counter','slash','counter','slash'],     buff: { type: 'rage',     value: 3, desc: 'Rage: +3 dmg' },        phase2: null },
  goblin_warrior: { name: 'Goblin Warrior', hp: 45,  idle: '/assets/goblin_warrior.png', attack: '/assets/goblin_warrior_attack.png', pattern: ['slash','guard','counter','slash','guard'],         buff: null,                                                       phase2: null },
  goblin_king:    { name: 'Goblin King',    hp: 80,  idle: '/assets/goblin_king.png',    attack: '/assets/goblin_king_attack.png',    pattern: ['slash','slash','guard','counter','slash','guard','counter'], buff: { type: 'shield', value: 2, desc: 'Shield: -2 dmg taken' }, phase2: { hpThreshold: 40, pattern: ['guard','counter','guard','counter'], buffChange: null } },
  // D2 — Dark Forest
  wild_wolf:    { name: 'Wild Wolf',    hp: 35, idle: '/assets/wild_wolf.png',    attack: '/assets/wild_wolf_attack.png',    pattern: ['slash','slash','slash','guard','slash'],         buff: null,                                                             phase2: null },
  poison_frog:  { name: 'Poison Frog', hp: 40, idle: '/assets/poison_frog.png',  attack: '/assets/poison_frog_attack.png',  pattern: ['counter','guard','counter','guard','counter'],   buff: { type: 'poison',  value: 2,  desc: 'Poison: -2 HP/round' },       phase2: null },
  forest_witch: { name: 'Forest Witch',hp: 45, idle: '/assets/forest_witch.png', attack: '/assets/forest_witch_attack.png', pattern: ['counter','counter','guard','counter','guard'],   buff: { type: 'regen',   value: 3,  desc: 'Regen: +3 HP/round' },        phase2: null },
  treant:       { name: 'Treant',       hp: 55, idle: '/assets/treant.png',       attack: '/assets/treant_attack.png',       pattern: ['guard','guard','guard','slash','guard'],         buff: { type: 'armor',   value: 3,  desc: 'Bark Skin: -3 dmg taken' },   phase2: null },
  forest_king:  { name: 'Forest King', hp: 90, idle: '/assets/forest_king.png',  attack: '/assets/forest_king_attack.png',  pattern: ['guard','counter','slash','guard','guard','counter','slash'], buff: { type: 'rage', value: 3, desc: 'Nature Blessing: +3 dmg' }, phase2: { hpThreshold: 45, pattern: ['slash','slash','counter','slash'], buffChange: null } },
  // D3 — Abandoned Mine
  mine_bat:      { name: 'Mine Bat',      hp: 35,  idle: '/assets/mine_bat.png',      attack: '/assets/mine_bat_attack.png',      pattern: ['counter','counter','slash','counter','slash'],     buff: null,                                                               phase2: null },
  rock_golem:    { name: 'Rock Golem',    hp: 60,  idle: '/assets/rock_golem.png',    attack: '/assets/rock_golem_attack.png',    pattern: ['guard','guard','guard','guard','slash'],           buff: { type: 'armor_pct',    value: 0.5, desc: 'Stone Skin: -50% dmg taken' }, phase2: null },
  cave_troll:    { name: 'Cave Troll',    hp: 50,  idle: '/assets/cave_troll.png',    attack: '/assets/cave_troll_attack.png',    pattern: ['slash','guard','slash','guard','slash'],           buff: { type: 'regen',        value: 4,  desc: 'Regen: +4 HP/round' },        phase2: null },
  dark_miner:    { name: 'Dark Miner ⚡', hp: 55,  idle: '/assets/dark_miner.png',    attack: '/assets/dark_miner_attack.png',    pattern: ['counter','slash','counter','guard','counter'],     buff: { type: 'double_strike', value: 0.5, desc: 'Double Strike: 50% chance dmg ×2' }, phase2: null },
  mine_overlord: { name: 'Mine Overlord', hp: 100, idle: '/assets/mine_overlord.png', attack: '/assets/mine_overlord_attack.png', pattern: ['guard','guard','slash','counter','guard','slash','counter'], buff: { type: 'armor', value: 4, desc: 'Armor: -4 dmg taken' }, phase2: { hpThreshold: 50, pattern: ['counter','counter','slash','counter'], buffChange: null } },
  // D4 — Cursed Swamp
  swamp_slug:  { name: 'Swamp Slug',    hp: 40,  idle: '/assets/swamp_slug.png',  attack: '/assets/swamp_slug_attack.png',  pattern: ['guard','guard','slash','guard','slash'],           buff: { type: 'slow',    value: 10, desc: 'Slow: -10 Energy/round' },     phase2: null },
  bog_witch:   { name: 'Bog Witch',     hp: 45,  idle: '/assets/bog_witch.png',   attack: '/assets/bog_witch_attack.png',   pattern: ['counter','guard','counter','counter','guard'],     buff: { type: 'curse',   value: 2,  desc: 'Curse: your dmg -2' },          phase2: null },
  mud_golem:   { name: 'Mud Golem',     hp: 60,  idle: '/assets/mud_golem.png',   attack: '/assets/mud_golem_attack.png',   pattern: ['guard','guard','guard','slash','guard'],           buff: { type: 'armor',   value: 3,  desc: 'Stone Skin: -3 dmg taken' },   phase2: null },
  swamp_hydra: { name: 'Swamp Hydra ⚡',hp: 65,  idle: '/assets/swamp_hydra.png', attack: '/assets/swamp_hydra_attack.png', pattern: ['slash','counter','slash','counter','guard'],       buff: { type: 'regen',   value: 5,  desc: 'Regen: +5 HP/round' },         phase2: null },
  swamp_titan: { name: 'Swamp Titan',   hp: 110, idle: '/assets/swamp_titan.png', attack: '/assets/swamp_titan_attack.png', pattern: ['counter','guard','slash','counter','guard','guard','slash'], buff: { type: 'poison', value: 3, desc: 'Toxic Aura: -3 HP/round' }, phase2: { hpThreshold: 55, pattern: ['guard','guard','counter','guard'], buffChange: null } },
  // D5 — Bandit Fortress
  bandit_scout:    { name: 'Bandit Scout',      hp: 45,  idle: '/assets/bandit_scout.png',    attack: '/assets/bandit_scout_attack.png',    pattern: ['slash','counter','guard','slash','counter'],           buff: null,                                                            phase2: null },
  bandit_mage:     { name: 'Bandit Mage',       hp: 50,  idle: '/assets/bandit_mage.png',     attack: '/assets/bandit_mage_attack.png',     pattern: ['counter','counter','guard','counter','slash'],         buff: { type: 'rage',     value: 5,    desc: 'Spell: +5 dmg on counter win' }, phase2: null },
  bandit_captain:  { name: 'Bandit Captain',    hp: 55,  idle: '/assets/bandit_captain.png',  attack: '/assets/bandit_captain_attack.png',  pattern: ['slash','guard','counter','slash','guard'],             buff: { type: 'momentum', value: 2,    desc: 'Rally: +2 dmg per win' },       phase2: null },
  bandit_assassin: { name: 'Bandit Assassin ⚡', hp: 60,  idle: '/assets/bandit_assassin.png', attack: '/assets/bandit_assassin_attack.png', pattern: ['counter','slash','counter','slash','counter'],         buff: { type: 'dodge',    value: 30,   desc: 'Shadow: 30% dodge' },           phase2: null },
  bandit_lord:     { name: 'Bandit Lord',        hp: 120, idle: '/assets/bandit_lord.png',     attack: '/assets/bandit_lord_attack.png',     pattern: ['slash','counter','guard','slash','counter','guard','counter'], buff: { type: 'momentum', value: 2, desc: 'Momentum: +2 dmg/win' }, phase2: { hpThreshold: 60, pattern: ['counter','counter','guard','counter'], buffChange: null } },
  // D6 — Ancient Ruins
  stone_sentinel:   { name: 'Stone Sentinel',    hp: 55,  idle: '/assets/stone_sentinel.png',   attack: '/assets/stone_sentinel_attack.png',   pattern: ['guard','guard','slash','guard','guard'],             buff: { type: 'armor',   value: 3, desc: 'Ward: -3 dmg taken' },                      phase2: null },
  ruin_wraith:      { name: 'Ruin Wraith',        hp: 55,  idle: '/assets/ruin_wraith.png',      attack: '/assets/ruin_wraith_attack.png',      pattern: ['counter','counter','counter','guard','counter'],     buff: { type: 'phase',   value: 3, desc: 'Phase: immune every 3rd round' },            phase2: null },
  golem_guardian:   { name: 'Golem Guardian',     hp: 70,  idle: '/assets/golem_guardian.png',   attack: '/assets/golem_guardian_attack.png',   pattern: ['guard','slash','guard','slash','guard'],             buff: { type: 'armor',   value: 4, desc: 'Iron Skin: -4 dmg taken' },                    phase2: null },
  arcane_construct: { name: 'Arcane Construct ⚡', hp: 65,  idle: '/assets/arcane_construct.png', attack: '/assets/arcane_construct_attack.png', pattern: ['counter','guard','counter','guard','slash'],         buff: { type: 'rage',    value: 5, desc: 'Overcharge: +5 dmg' },                         phase2: null },
  ancient_colossus: { name: 'Ancient Colossus',   hp: 130, idle: '/assets/ancient_colossus.png', attack: '/assets/ancient_colossus_attack.png', pattern: ['guard','guard','counter','slash','guard','counter','guard'], buff: { type: 'barrier', value: 1, desc: 'Barrier: blocks 1st hit' }, phase2: { hpThreshold: 65, pattern: ['counter','slash','counter','slash'], buffChange: null } },
  // D7 — Vampire Castle
  vampire_bat:   { name: 'Vampire Bat',    hp: 50,  idle: '/assets/vampire_bat.png',   attack: '/assets/vampire_bat_attack.png',   pattern: ['counter','slash','counter','slash','counter'],           buff: { type: 'lifesteal', value: 3, desc: 'Lifesteal: heal 3 HP/win' },     phase2: null },
  thrall_knight: { name: 'Thrall Knight',  hp: 60,  idle: '/assets/thrall_knight.png', attack: '/assets/thrall_knight_attack.png', pattern: ['slash','guard','slash','guard','slash'],                 buff: { type: 'lifesteal', value: 4, desc: 'Lifesteal: heal 4 HP/win' },     phase2: null },
  vampire_mage:  { name: 'Vampire Mage',   hp: 65,  idle: '/assets/vampire_mage.png',  attack: '/assets/vampire_mage_attack.png',  pattern: ['counter','counter','guard','counter','guard'],           buff: { type: 'regen',     value: 6, desc: 'Blood Regen: +6 HP/round' },   phase2: null },
  vampire_lord:  { name: 'Vampire Lord ⚡', hp: 75,  idle: '/assets/vampire_lord.png',  attack: '/assets/vampire_lord_attack.png',  pattern: ['slash','counter','guard','slash','counter'],             buff: { type: 'rage',      value: 4, desc: 'Blood Frenzy: +4 dmg' },        phase2: null },
  count_dracula: { name: 'Count Dracula',  hp: 140, idle: '/assets/count_dracula.png', attack: '/assets/count_dracula_attack.png', pattern: ['counter','slash','guard','counter','slash','guard','counter'], buff: { type: 'lifesteal', value: 8, desc: 'Blood God: heal 8 HP/win' }, phase2: { hpThreshold: 70, pattern: ['counter','counter','slash','counter'], buffChange: null } },
  // D8 — Frozen Tundra
  ice_wolf:    { name: 'Ice Wolf',      hp: 55,  idle: '/assets/ice_wolf.png',    attack: '/assets/ice_wolf_attack.png',    pattern: ['slash','slash','guard','slash','slash'],               buff: { type: 'slow',  value: 15, desc: 'Frost: -15 Energy/round' },       phase2: null },
  frost_witch: { name: 'Frost Witch',   hp: 65,  idle: '/assets/frost_witch.png', attack: '/assets/frost_witch_attack.png', pattern: ['guard','counter','guard','counter','guard'],           buff: { type: 'curse', value: 3,  desc: 'Blizzard: your dmg -3' },          phase2: null },
  ice_golem:   { name: 'Ice Golem',     hp: 80,  idle: '/assets/ice_golem.png',   attack: '/assets/ice_golem_attack.png',   pattern: ['guard','guard','guard','slash','guard'],               buff: { type: 'armor', value: 5,  desc: 'Permafrost: -5 dmg taken' },       phase2: null },
  frost_giant: { name: 'Frost Giant ⚡', hp: 85,  idle: '/assets/frost_giant.png', attack: '/assets/frost_giant_attack.png', pattern: ['slash','guard','slash','guard','counter'],             buff: { type: 'armor', value: 4,  desc: 'Frozen Armor: -4 dmg taken' },     phase2: null },
  ice_queen:   { name: 'Ice Queen',     hp: 155, idle: '/assets/ice_queen.png',   attack: '/assets/ice_queen_attack.png',   pattern: ['guard','counter','guard','slash','guard','counter','slash'], buff: { type: 'slow', value: 20, desc: 'Absolute Zero: -20 Energy/round' }, phase2: { hpThreshold: 77, pattern: ['counter','guard','counter','guard'], buffChange: null } },
  // D9 — Shadow Realm
  shadow_clone:  { name: 'Shadow Clone',   hp: 60,  idle: '/assets/shadow_clone.png',  attack: '/assets/shadow_clone_attack.png',  pattern: ['mirror'],                                               buff: { type: 'dodge',    value: 20, desc: 'Shadow: 20% dodge' },                      phase2: null },
  dark_specter:  { name: 'Dark Specter',   hp: 70,  idle: '/assets/dark_specter.png',  attack: '/assets/dark_specter_attack.png',  pattern: ['counter','slash','counter','guard','counter'],           buff: { type: 'phase',    value: 3,  desc: 'Phase Shift: immune every 3rd round' },    phase2: null },
  void_knight:   { name: 'Void Knight',    hp: 80,  idle: '/assets/void_knight.png',   attack: '/assets/void_knight_attack.png',   pattern: ['guard','slash','guard','counter','guard'],               buff: { type: 'nullify',  value: 1,  desc: 'Nullify: ignores your relics for 1 round' }, phase2: null },
  shadow_titan:  { name: 'Shadow Titan ⚡', hp: 90,  idle: '/assets/shadow_titan.png',  attack: '/assets/shadow_titan_attack.png',  pattern: ['slash','counter','slash','counter','slash'],             buff: { type: 'momentum', value: 2,  desc: 'Dark Momentum: +2 dmg/win' },              phase2: null },
  shadow_king:   { name: 'Shadow King',    hp: 165, idle: '/assets/shadow_king.png',   attack: '/assets/shadow_king_attack.png',   pattern: ['mirror'],                                               buff: { type: 'curse',    value: 3,  desc: 'Dark Aura: your dmg -3' },                 phase2: { hpThreshold: 82, pattern: ['slash','counter','slash','counter'], buffChange: null } },
  // D10 — Demon Throne
  demon_guard:  { name: 'Demon Guard',   hp: 70,  idle: '/assets/demon_guard.png',  attack: '/assets/demon_guard_attack.png',  pattern: ['slash','guard','counter','slash','guard'],               buff: { type: 'rage',  value: 5, desc: 'Hellfire: +5 dmg' },           phase2: null },
  demon_mage:   { name: 'Demon Mage',    hp: 75,  idle: '/assets/demon_mage.png',   attack: '/assets/demon_mage_attack.png',   pattern: ['counter','counter','guard','counter','slash'],           buff: { type: 'inferno', value: 3, desc: 'Inferno: +3 dmg, burn -3 HP/round' }, phase2: null },
  demon_knight: { name: 'Demon Knight',  hp: 85,  idle: '/assets/demon_knight.png', attack: '/assets/demon_knight_attack.png', pattern: ['slash','guard','slash','counter','guard'],               buff: { type: 'armor', value: 5, desc: 'Demonic Armor: -5 dmg taken' }, phase2: null },
  arch_demon:   { name: 'Archdemon ⚡',   hp: 95,  idle: '/assets/arch_demon.png',   attack: '/assets/arch_demon_attack.png',   pattern: ['counter','slash','guard','counter','slash'],             buff: { type: 'chaos', value: 1, desc: 'Chaos: random buff each round' }, phase2: null },
  demon_lord:   { name: 'DEMON LORD',    hp: 180, idle: '/assets/demon_lord.png',   attack: '/assets/demon_lord_attack.png',   pattern: ['guard','counter','slash','guard','counter','slash','guard'], buff: { type: 'rage', value: 5, desc: 'Hellfire: +5 dmg' }, phase2: { hpThreshold: 90, pattern: ['counter','counter','guard','counter','slash','counter'], buffChange: { type: 'rage', value: 8, desc: 'BERSERK: +8 dmg, reduced defense' } } },
}

// ─── CHAOS BUFF POOL ─────────────────────────────────────────────────────────
const CHAOS_BUFFS = [
  { type: 'rage',      value: 5,  desc: 'Chaos Rage: +5 dmg' },
  { type: 'armor',     value: 3,  desc: 'Chaos Shield: -3 dmg taken' },
  { type: 'regen',     value: 4,  desc: 'Chaos Regen: +4 HP/round' },
  { type: 'poison',    value: 2,  desc: 'Chaos Poison: -2 HP/round' },
  { type: 'dodge',     value: 25, desc: 'Chaos Dodge: 25% dodge' },
  { type: 'lifesteal', value: 3,  desc: 'Chaos Lifesteal: heal 3 HP/win' },
]

export function rollChaosBuff() {
  return CHAOS_BUFFS[Math.floor(Math.random() * CHAOS_BUFFS.length)]
}

// ─── RPS CORE ────────────────────────────────────────────────────────────────
const BEATS = { guard: 'slash', slash: 'counter', counter: 'guard' }
const MOVES  = ['slash', 'guard', 'counter']

export function getMonsterMove(monster, roundIndex, lastPlayerMove, upgradeAccuracy = 0) {
  const pattern = monster.currentPattern || monster.data.pattern
  // Mirror mechanic
  if (pattern[0] === 'mirror') {
    if (roundIndex === 0) return MOVES[Math.floor(Math.random() * 3)]
    return lastPlayerMove || MOVES[Math.floor(Math.random() * 3)]
  }
  const intended = pattern[roundIndex % pattern.length]
  let changeChance = monster.isElite ? 0.40 : monster.isBoss ? 0.20 : 0.20
  changeChance = Math.max(0, changeChance - upgradeAccuracy)
  if (Math.random() < changeChance) {
    const others = MOVES.filter(m => m !== intended)
    return others[Math.floor(Math.random() * others.length)]
  }
  return intended
}

export function getMonsterIntent(monster, roundIndex) {
  const pattern = monster.currentPattern || monster.data.pattern
  if (pattern[0] === 'mirror') return null // mirror = unknown intent
  return pattern[roundIndex % pattern.length]
}

// ─── RESOLVE ROUND ────────────────────────────────────────────────────────────
export function resolveRound(playerMove, monsterMove, playerState, monsterState) {
  // Draw
  if (playerMove === monsterMove) {
    return { winner: 'draw', playerDmg: 0, monsterDmg: 0, crit: false, missed: false, healed: 0 }
  }

  const playerWins = BEATS[playerMove] === monsterMove
  let playerDmg  = 0
  let monsterDmg = 0
  let crit       = false
  let missed     = false
  let healed     = 0

  // ── PLAYER WINS ──
  if (playerWins) {
    // Base damage
    playerDmg = playerMove === 'counter' ? 15 : 10

    // Momentum / Crown of Momentum bonus
    playerDmg += playerState.momentumDmg || 0
    playerDmg += (playerState.crownStacks || 0) * 2

    // Curse debuff (Purify strips this — no data.buff fallback so the strip is real)
    const cursed = monsterState.activeBuff?.type === 'curse'
    if (cursed) {
      const curseVal = monsterState.activeBuff?.value ?? 0
      playerDmg = Math.max(1, playerDmg - curseVal)
    }

    // Nullify: skip all relic bonuses this round (Void Knight)
    const nullified = monsterState.activeBuff?.type === 'nullify'
    if (!nullified) {
      playerDmg += getRelicDmgBonus(playerMove, playerState)
    }

    // Adrenaline
    if (playerState.relics?.includes('adrenaline') && playerState.hp < playerState.maxHp * 0.5) {
      playerDmg += 2
    }

    // Berserker Charm
    if (playerState.relics?.includes('berserker_charm') && playerState.hp < playerState.maxHp * 0.3) {
      playerDmg = Math.round(playerDmg * 1.5)
    }

    // Spear Precise Read (+50% on counter) — floor so 15 → 22 (doc-correct), not round → 23
    if (playerState.weapon === 'spear' && playerMove === 'counter') {
      playerDmg = Math.floor(playerDmg * 1.5)
    }

    // Axe Berserk (+100% = ×2)
    if (playerState.weapon === 'axe' && playerState.ultActive > 0) {
      playerDmg = playerDmg * 2
    }

    // (Removed: Sword Blade Rush block — Blade Rush is auto-resolved in main.js, never hits this path)
    // (Removed: Spear Foresight +50% counter bonus — not in spec; ult is reveal-only, no dmg bonus)

    // Crit (Axe)
    const critResult = applyCrit(playerState, playerDmg)
    playerDmg = critResult.dmg
    crit = critResult.crit

    // Boss dmg modifiers
    if (monsterState.isBoss) {
      if (!nullified && playerState.relics?.includes('hunters_instinct')) playerDmg = Math.round(playerDmg * 1.10)
      if (!nullified && playerState.relics?.includes('hunters_mark'))     playerDmg = Math.round(playerDmg * 1.20)
    }

    // Apply monster armor/shield (unblockable bypasses)
    if (!playerState.ultUnblockable) {
      playerDmg = applyMonsterArmor(playerDmg, monsterState)
    }
    playerState.ultUnblockable = false

    // Barrier: first hit absorbed
    if (monsterState.barrierActive) {
      playerDmg = 0
      monsterState.barrierActive = false
    }

    // Monster dodge — resolved BEFORE vampiric heal & crit so a dodged hit doesn't heal or "crit"
    const dodgeChance = (monsterState.activeBuff?.type === 'dodge' ? monsterState.activeBuff.value : 0) / 100
    if (dodgeChance > 0 && Math.random() < dodgeChance) {
      playerDmg = 0
      missed = true
      crit   = false
    }

    // Vampiric Core heal — only on damage that actually lands
    if (!missed && playerDmg > 0 && playerState.relics?.includes('vampiric_core') && !nullified) {
      healed = Math.round(playerDmg * 0.20)
    }

  // ── MONSTER WINS ──
  } else {
    monsterDmg = monsterMove === 'counter' ? 15 : 10

    // Monster rage/inferno bonus (Purify strips — no data.buff fallback)
    const buff = monsterState.activeBuff
    // Bandit Mage spec says +5 on COUNTER win only — gate rage on counter when monster id is bandit_mage.
    // Generic rage (other monsters) still applies on any win.
    if (buff?.type === 'rage') {
      const isBanditMage = monsterState.data?.name === 'Bandit Mage'
      if (!isBanditMage || monsterMove === 'counter') {
        monsterDmg += buff.value
      }
    }
    if (buff?.type === 'inferno') {
      monsterDmg += buff.value
    }
    if (buff?.type === 'momentum') {
      monsterDmg += (monsterState.momentumStacks || 0) * buff.value
    }

    // Axe Berserk: takes +5 extra dmg when losing
    if (playerState.weapon === 'axe' && playerState.ultActive > 0) {
      monsterDmg += 5
    }

    // Double Strike (Dark Miner): chance = buff.value (data-driven, no hardcoded 0.5)
    if (buff?.type === 'double_strike' && Math.random() < (buff.value ?? 0.5)) {
      monsterDmg = monsterDmg * 2
    }

    // Player armor reduction
    monsterDmg = applyPlayerArmor(monsterDmg, playerState)
  }

  return { winner: playerWins ? 'player' : 'monster', playerDmg, monsterDmg, crit, missed, healed }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getRelicDmgBonus(move, ps) {
  let b = 0
  const r = ps.relics || []
  if (move === 'slash'   && r.includes('sharp_blade'))   b += 2
  if (move === 'guard'   && r.includes('iron_guard'))    b += 2
  if (move === 'counter' && r.includes('quick_reflex'))  b += 2
  if (move === 'slash'   && r.includes('razor_edge'))    b += 5
  if (move === 'counter' && r.includes('deadly_reflex')) b += 7
  return b
}

function applyCrit(ps, dmg) {
  if (ps.weapon !== 'axe') return { dmg, crit: false }
  let chance = 0.20
  if (ps.relics?.includes('blood_god_totem')) chance += 0.25
  const crit = Math.random() < chance
  return { dmg: crit ? dmg * 2 : dmg, crit }
}

function applyMonsterArmor(dmg, ms) {
  const buff = ms.activeBuff // Purify strips — no data.buff fallback
  if (!buff) return dmg
  if (buff.type === 'shield' || buff.type === 'armor') {
    return Math.max(1, dmg - buff.value)
  }
  if (buff.type === 'armor_pct') {
    return Math.max(1, Math.round(dmg * (1 - buff.value)))
  }
  return dmg
}

function applyPlayerArmor(dmg, ps) {
  let reduction = 0
  if (ps.relics?.includes('sturdy_armor')) reduction += 1
  return Math.max(1, dmg - reduction)
}

// ─── PER ROUND EFFECTS ───────────────────────────────────────────────────────

// Monster per-round effects (regen, momentum tracking)
// monsterWon = true ONLY when monster won the round (draws don't trigger lifesteal/momentum)
export function applyMonsterPerRound(monsterState, playerWon, isDraw = false) {
  const buff = monsterState.activeBuff // Purify strips — no data.buff fallback
  const monsterWon = !playerWon && !isDraw
  let hpDelta = 0

  if (buff?.type === 'regen') hpDelta = buff.value
  if (buff?.type === 'lifesteal' && monsterWon) hpDelta = buff.value
  if (buff?.type === 'momentum' && monsterWon) {
    monsterState.momentumStacks = (monsterState.momentumStacks || 0) + 1
  }

  return { hpDelta }
}

// Player per-round debuffs from monster
export function applyPlayerDebuffPerRound(playerState, monsterState) {
  const buff = monsterState.activeBuff // Purify strips — no data.buff fallback
  if (!buff) return { hpDelta: 0, energyDelta: 0 }
  let hpDelta = 0
  let energyDelta = 0
  if (buff.type === 'poison')  hpDelta     = -buff.value
  if (buff.type === 'inferno') hpDelta     = -buff.value
  if (buff.type === 'slow')    energyDelta = -buff.value
  return { hpDelta, energyDelta }
}

// Player after-round state update
export function afterRoundUpdate(playerState, won, isDraw, playerMove, monsterMove) {
  const s = { ...playerState }
  const r = s.relics || []

  if (!isDraw) {
    if (won) {
      // Sword Momentum: +1 dmg combo, cap 3 stacks (draws keep streak, only loss resets)
      if (s.weapon === 'sword') s.momentumDmg = Math.min(3, (s.momentumDmg || 0) + 1)

      // Staff Arcane Recovery: heal 3 HP
      if (s.weapon === 'staff') s.hp = Math.min(s.maxHp, s.hp + 3)

      // Relic: Blood Drop — heal 1 HP on win
      if (r.includes('blood_drop')) s.hp = Math.min(s.maxHp, s.hp + 1)

      // Relic: Fortress Shield — heal 3 HP on guard win
      if (r.includes('fortress_shield') && playerMove === 'guard') s.hp = Math.min(s.maxHp, s.hp + 3)

      // Relic: Energy Core — +10 energy on win
      if (r.includes('energy_core')) s.energy = Math.min(100, s.energy + 10)

      // Crown of Momentum: +2 dmg permanent per win (stacks, no cap, never resets)
      if (r.includes('crown_of_momentum')) s.crownStacks = (s.crownStacks || 0) + 1
    } else {
      // LOSS — Sword Momentum combo resets (Crown stays permanent)
      if (s.weapon === 'sword') s.momentumDmg = 0
    }
  }

  // Tick down ult duration
  if (s.ultActive > 0) s.ultActive--

  // Tick down Foresight
  if (s.foresightActive) s.foresightActive = false

  // Energy gain per round
  const energyGain = getEnergyPerRound(s.upgrades)
  s.energy = Math.min(100, (s.energy || 0) + energyGain)

  // Recovery Potion: heal 5 HP after each stage — handled in stage clear, not here

  return s
}

// ─── ULTIMATE ACTIVATION ────────────────────────────────────────────────────
export function activateUltimate(playerState, monsterState) {
  if ((playerState.energy || 0) < 100) return null
  const s = { ...playerState, energy: 0 }
  let healAmount       = 0
  let foresightActive  = false
  let stripsBuffs      = false

  switch (s.weapon) {
    case 'sword':
      // Blade Rush: flat 25 dmg, unblockable — fires next attack
      s.ultDmgBonus    = 25
      s.ultUnblockable = true
      s.ultActive      = 1 // consumed on next win
      break
    case 'axe':
      // Berserk: 2 rounds ×2 dmg, cant guard
      s.ultActive = 2
      break
    case 'spear':
      // Foresight: see actual next move
      s.foresightActive = true
      foresightActive   = true
      s.ultActive       = 0
      break
    case 'staff':
      // Purify: heal 15 + strip monster buffs
      healAmount   = 15
      stripsBuffs  = true
      s.ultActive  = 0
      break
  }

  // Warrior Gloves: +10% to ult dmg (applied in resolveRound for sword, here for staff)
  if (s.weapon === 'staff' && s.relics?.includes('warrior_gloves')) {
    healAmount = Math.round(healAmount * 1.10)
  }

  return { newState: s, healAmount, foresightActive, stripsBuffs }
}

// ─── PHASE 2 ─────────────────────────────────────────────────────────────────
export function checkPhase2(monster) {
  if (!monster.data.phase2) return false
  if (monster.isPhase2) return false
  return monster.hp <= monster.data.phase2.hpThreshold
}

export function applyPhase2(monster) {
  monster.currentPattern = [...monster.data.phase2.pattern]
  monster.isPhase2 = true
  // Demon Lord phase 2: buff changes to Berserk
  if (monster.data.phase2.buffChange) {
    monster.activeBuff = { ...monster.data.phase2.buffChange }
  }
  return monster
}

// ─── RELIC GENERATION ────────────────────────────────────────────────────────
export function generateRelicChoices(stageIndex, upgrades = {}, currentRelics = []) {
  const isStage1 = stageIndex === 0 // stage 1 = index 0

  let epicChance, rareChance
  if (isStage1) {
    epicChance = 0.02 + (upgrades.ancient_knowledge ? 0.03 : 0)
    rareChance = 0.18 + (upgrades.lucky_find ? 0.05 : 0) + (upgrades.treasure_hunter ? 0.10 : 0) + (upgrades.ancient_knowledge ? 0.05 : 0)
  } else {
    epicChance = 0.10 + (upgrades.ancient_knowledge ? 0.03 : 0)
    rareChance = 0.30 + (upgrades.lucky_find ? 0.05 : 0) + (upgrades.treasure_hunter ? 0.10 : 0) + (upgrades.ancient_knowledge ? 0.05 : 0)
  }
  epicChance = Math.min(epicChance, 0.30)
  rareChance = Math.min(rareChance, 0.60)

  const allRelics = Object.values(RELICS)
  const available = allRelics.filter(r => !currentRelics.includes(r.id))

  const commons = available.filter(r => r.rarity === 'common')
  const rares   = available.filter(r => r.rarity === 'rare')
  const epics   = available.filter(r => r.rarity === 'epic')

  const choices = []
  const used = new Set()

  while (choices.length < 3) {
    const roll = Math.random()
    let pool
    if (roll < epicChance && epics.length > 0)              pool = epics
    else if (roll < epicChance + rareChance && rares.length > 0) pool = rares
    else if (commons.length > 0)                             pool = commons
    else pool = available

    const candidates = pool.filter(r => !used.has(r.id))
    if (candidates.length === 0) break
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    used.add(pick.id)
    choices.push(pick)
  }

  return choices
}

// ─── SECOND WIND CHECK ───────────────────────────────────────────────────────
export function checkSecondWind(playerState) {
  if (!playerState.relics?.includes('second_wind')) return false
  if (playerState.secondWindUsed) return false
  return playerState.hp > 0 && playerState.hp <= playerState.maxHp * 0.20
}

// ─── PLAYER STATE ────────────────────────────────────────────────────────────
export function createRunState(weapon, upgrades = {}, sharpenStoneLevel = 0) {
  let maxHp = 100
  if (upgrades.tough_skin_1) maxHp += 5
  if (upgrades.tough_skin_2) maxHp += 10
  if (upgrades.veteran)      maxHp += 20
  // Sharpen Stone (NIM-paid): +1 max HP per tier owned, capped 0–5.
  maxHp += Math.max(0, Math.min(5, sharpenStoneLevel | 0))

  const startEnergy = upgrades.master_combatant ? 25 : 0

  return {
    weapon,
    hp: maxHp, maxHp,
    energy: startEnergy,
    ultActive: 0, ultDmgBonus: 0, ultUnblockable: false,
    foresightActive: false,
    momentumDmg: 0,
    crownStacks: 0,
    secondWindUsed: false,
    nullifyActive: false,
    relics: [],
    upgrades,
  }
}

export function applyRelicToRunState(state, relicId) {
  const s = { ...state, relics: [...(state.relics || []), relicId] }
  if (relicId === 'vitality') { s.maxHp += 10; s.hp += 10 }
  // Battle Focus: +20 energy is granted at START of each battle (handled in main.js startStage),
  // NOT at pick time — picking just adds the relic to the list. (Fix for double-fire bug.)
  return s
}

// ─── GOLD CALC ───────────────────────────────────────────────────────────────
export function calcGoldReward(baseGold, relics = [], upgrades = {}) {
  let mult = 1
  if (relics.includes('lucky_coin'))    mult += 0.10
  if (relics.includes('treasure_map'))  mult += 0.25
  if (upgrades.bounty_hunter)           mult += 0.05
  if (upgrades.rich_adventurer)         mult += 0.10
  if (upgrades.treasure_magnet)         mult += 0.20
  return Math.round(baseGold * mult)
}

// ─── ENERGY PER ROUND ────────────────────────────────────────────────────────
export function getEnergyPerRound(upgrades = {}) {
  let base = 20
  if (upgrades.weapon_training)   base += 5
  if (upgrades.battle_experience) base += 5
  return base
}

// ─── UPGRADE ACCURACY (for monster intent change) ───────────────────────────
export function getUpgradeAccuracy(upgrades = {}, isBoss = false) {
  let reduction = 0
  if (isBoss) {
    if (upgrades.sixth_sense) reduction = 0.10
  } else {
    if (upgrades.sharp_eyes)     reduction += 0.05
    if (upgrades.pattern_reader) reduction += 0.05
  }
  return reduction
}

// ─── SAVE / LOAD (localStorage) ─────────────────────────────────────────────
const SAVE_KEY = 'nim_arena_save'

export function saveProgress(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch (e) { console.warn('Save failed', e) }
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) { return null }
}

export function getDefaultProgress() {
  return {
    gold: 0,
    highestDungeon: 0,
    unlockedWeapons: ['sword'],
    upgrades: {},
    sharpenStoneLevel: 0,
    weeklyPoints: 0,
    lastReset: Date.now(),
  }
}

export function unlockWeapon(progress, weaponId) {
  const weapon = WEAPONS[weaponId]
  if (!weapon) return null
  if (progress.gold < weapon.unlockCost) return null
  if (progress.unlockedWeapons.includes(weaponId)) return progress
  return {
    ...progress,
    gold: progress.gold - weapon.unlockCost,
    unlockedWeapons: [...progress.unlockedWeapons, weaponId],
  }
}

export function purchaseUpgrade(progress, upgradeId) {
  const upgrade = UPGRADE_TREE[upgradeId]
  if (!upgrade) return null
  if (progress.gold < upgrade.cost) return null
  if (progress.upgrades[upgradeId]) return progress
  if (upgrade.requires && !progress.upgrades[upgrade.requires]) return null
  return {
    ...progress,
    gold: progress.gold - upgrade.cost,
    upgrades: { ...progress.upgrades, [upgradeId]: true },
  }
}

// ─── WEEKLY LEADERBOARD HELPERS ──────────────────────────────────────────────
export function getWeeklyCountdown() {
  const now    = new Date()
  const monday = new Date(now)
  monday.setUTCHours(0, 0, 0, 0)
  const day = monday.getUTCDay()
  const daysUntil = day === 0 ? 1 : 8 - day
  monday.setUTCDate(monday.getUTCDate() + daysUntil)
  const diff = monday - now
  if (diff <= 0) return '0d 0h 0m'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000)  / 60000)
  return `${d}d ${h}h ${m}m`
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
export function getHpColor(hp, max = 100) {
  const pct = hp / max
  if (pct > 0.5) return ''
  if (pct > 0.25) return 'mid'
  return 'low'
}

export function canUseUltimate(state) {
  return (state.energy || 0) >= 100
}

export function canGuard(playerState) {
  // Axe Berserk: cannot guard
  if (playerState.weapon === 'axe' && playerState.ultActive > 0) return false
  return true
}

export function getMoveImage(weapon, move) {
  const w = WEAPONS[weapon]
  if (!w) return ''
  return w[move] || w.idle
}