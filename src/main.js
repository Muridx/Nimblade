import './style.css'

import {
  WEAPONS, MONSTERS, DUNGEONS,
  createRunState, applyRelicToRunState,
  resolveRound, getMonsterMove, getMonsterIntent,
  applyMonsterPerRound, applyPlayerDebuffPerRound, afterRoundUpdate,
  activateUltimate, checkPhase2, applyPhase2,
  generateRelicChoices, checkSecondWind,
  calcGoldReward, getUpgradeAccuracy,
  saveProgress, loadProgress, getDefaultProgress,
  unlockWeapon, purchaseUpgrade,
  canUseUltimate, canGuard, getMoveImage,
  rollChaosBuff,
  SHARPEN_STONE_TIERS, getNextSharpenTier,
} from './game.js'

import {
  getPlayer, createPlayer, updatePlayerWeapon,
  syncProgress, recordDungeonClear, recordRunFailed,
  purchaseUpgradeDB, unlockWeaponDB,
  checkWeeklyReset, getLeaderboard,
  incrementSharpenStone, logNimPurchase,
} from './supabase.js'

import {
  connectWallet, disconnectWallet, payNim, NIMBLADE_RECIPIENT,
} from './nimiq.js'

import {
  showScreen, showNav, setActiveNav,
  renderConnect, renderUsername, renderBottomNav,
  renderHome, renderDungeonMap, renderWeaponSelect,
  renderUpgradeTree, renderBattle, renderRelicPick,
  renderResult, renderLeaderboard, renderProfile, renderRules,
  updateBattleUI, showDamageFloat, showCritFloat,
  showIntentBubble, playAttackAnim, playGuardAnim,
  setCharImage, renderRelicBar, startWeeklyCountdown,
} from './ui.js'

// ─── APP STATE ───────────────────────────────────────────────────────────────
const app = document.getElementById('app')

// Persistent progress (saved to localStorage + Supabase)
let progress = loadProgress() || getDefaultProgress()

// Session info
let walletAddress = null
let isDemo = false

// Active run state (reset each dungeon run)
let runState   = null   // player HP, energy, relics, weapon etc
let monsterState = null // current monster
let dungeon    = null   // current dungeon data
let stageIdx   = 0      // 0-4
let roundIndex = 0      // within current battle
let lastPlayerMove = null

// Timers
let timerInterval = null
let weeklyInterval = null

// ─── BOOT ────────────────────────────────────────────────────────────────────
app.innerHTML = renderConnect() + renderUsername() + renderBottomNav()
showScreen('connect')
showNav(false)
bindConnect()

// ─── NAV ─────────────────────────────────────────────────────────────────────
function bindNav() {
  document.getElementById('nav-home')?.addEventListener('click', goHome)
  document.getElementById('nav-arena')?.addEventListener('click', goDungeonMap)
  document.getElementById('nav-upgrade')?.addEventListener('click', goUpgradeTree)
  document.getElementById('nav-leaderboard')?.addEventListener('click', goLeaderboard)
  document.getElementById('nav-profile')?.addEventListener('click', goProfile)
}

// ─── CONNECT ─────────────────────────────────────────────────────────────────
function bindConnect() {
  document.getElementById('btnConnect')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnConnect')
    btn.textContent = 'CONNECTING...'
    btn.disabled = true

    try {
      // Nimiq wallet connect via Nimiq Pay (uses src/nimiq.js wrapper).
      const addr = await connectWallet()
      if (!addr) throw new Error('No wallet')
      walletAddress = addr
      isDemo = false
      await onWalletConnected()
    } catch (e) {
      console.error('Connect wallet flow failed:', e)
      btn.textContent = 'CONNECT WALLET'
      btn.disabled = false
      alert('Could not connect wallet. Make sure Nimiq Pay is open.')
    }
  })

  document.getElementById('btnDemo')?.addEventListener('click', () => {
    walletAddress = 'DEMO_' + Math.random().toString(36).slice(2,8).toUpperCase()
    isDemo = true
    showScreen('username')
    bindUsername()
  })
}

async function onWalletConnected() {
  const player = await getPlayer(walletAddress)
  if (player) {
    progress.username        = player.username
    progress.gold            = player.gold            || 0
    progress.highestDungeon  = player.highest_dungeon || 0
    progress.unlockedWeapons = player.unlocked_weapons || ['sword']
    progress.upgrades        = player.upgrades        || {}
    progress.sharpenStoneLevel = player.sharpen_stone_level || 0
    progress.weeklyPoints    = player.weekly_points   || 0
    progress.selectedWeapon  = player.weapon          || 'sword'
    saveProgress(progress)
    await checkWeeklyReset(walletAddress)
    afterLogin()
  } else {
    showScreen('username')
    bindUsername()
  }
}

// ─── USERNAME ────────────────────────────────────────────────────────────────
function bindUsername() {
  document.getElementById('btnUsername')?.addEventListener('click', async () => {
    const val = document.getElementById('usernameInput')?.value?.trim()
    if (!val || val.length < 2) return alert('Min 2 characters')
    if (val.length > 12)        return alert('Max 12 characters')

    progress.username = val

    if (!isDemo) {
      const { error } = await createPlayer(walletAddress, val, progress.selectedWeapon || 'sword')
      if (error && error.code !== '23505') return alert('Error: ' + error.message)
    }

    saveProgress(progress)
    afterLogin()
  })
}

// ─── AFTER LOGIN ─────────────────────────────────────────────────────────────
function afterLogin() {
  rebuildApp()
  showNav(true)
  bindNav()
  goHome()
}

function rebuildApp() {
  app.innerHTML =
    renderConnect()                +
    renderUsername()               +
    renderHome(progress)           +
    renderDungeonMap(progress)     +
    renderWeaponSelect(progress)   +
    renderUpgradeTree(progress, walletAddress)    +
    renderLeaderboard([])          +
    renderProfile(progress, walletAddress) +
    renderRules()                  +
    renderBottomNav()
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function goHome() {
  replaceScreen('home', renderHome(progress))
  showScreen('home')
  showNav(true)
  setActiveNav('home')

  document.getElementById('btnGoArena')?.addEventListener('click', goDungeonMap)

  if (weeklyInterval) clearInterval(weeklyInterval)
  weeklyInterval = startWeeklyCountdown('weeklyCountdown')
}

// ─── DUNGEON MAP ──────────────────────────────────────────────────────────────
function goDungeonMap() {
  if (weeklyInterval) { clearInterval(weeklyInterval); weeklyInterval = null }
  replaceScreen('dungeonMap', renderDungeonMap(progress))
  showScreen('dungeonMap')
  showNav(true)
  setActiveNav('arena')

  document.querySelectorAll('.dungeon-node').forEach(node => {
    node.addEventListener('click', () => {
      const id      = parseInt(node.dataset.id)
      const highest = progress.highestDungeon || 0
      if (id > highest + 1) return // locked
      goWeaponSelect(id)
    })
  })
}

// ─── WEAPON SELECT ────────────────────────────────────────────────────────────
let pendingDungeonId = 1

function goWeaponSelect(dungeonId = 1) {
  if (weeklyInterval) { clearInterval(weeklyInterval); weeklyInterval = null }
  pendingDungeonId = dungeonId
  replaceScreen('weaponSelect', renderWeaponSelect(progress))
  showScreen('weaponSelect')
  showNav(true)
  setActiveNav('arena')

  document.querySelectorAll('.weapon-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.weapon
      if (!progress.unlockedWeapons?.includes(key)) return
      document.querySelectorAll('.weapon-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      progress.selectedWeapon = key
    })
  })

  document.getElementById('btnBackMap')?.addEventListener('click', goDungeonMap)

  document.getElementById('btnWeapon')?.addEventListener('click', () => {
    if (!isDemo) updatePlayerWeapon(walletAddress, progress.selectedWeapon)
    startRun(pendingDungeonId)
  })
}

// ─── UPGRADE TREE ─────────────────────────────────────────────────────────────
function goUpgradeTree() {
  if (weeklyInterval) { clearInterval(weeklyInterval); weeklyInterval = null }
  replaceScreen('upgradeTree', renderUpgradeTree(progress, walletAddress))
  showScreen('upgradeTree')
  showNav(true)
  setActiveNav('upgrade')

  document.querySelectorAll('.upgrade-btn:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.upgrade
      const result = purchaseUpgrade(progress, id)
      if (!result) return

      progress = result
      saveProgress(progress)

      if (!isDemo) {
        await purchaseUpgradeDB(walletAddress, id, progress.gold, progress.upgrades)
      }

      // Re-render tree
      replaceScreen('upgradeTree', renderUpgradeTree(progress, walletAddress))
      showScreen('upgradeTree')
      bindUpgradeBtns()
    })
  })
  bindSharpenStoneBtns()
}

function bindUpgradeBtns() {
  document.querySelectorAll('.upgrade-btn:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.upgrade
      const result = purchaseUpgrade(progress, id)
      if (!result) return
      progress = result
      saveProgress(progress)
      if (!isDemo) await purchaseUpgradeDB(walletAddress, id, progress.gold, progress.upgrades)
      replaceScreen('upgradeTree', renderUpgradeTree(progress, walletAddress))
      showScreen('upgradeTree')
      bindUpgradeBtns()
    })
  })
  bindSharpenStoneBtns()
}

// ─── SHARPEN STONE (NIM-PAID) ────────────────────────────────────────────────
function bindSharpenStoneBtns() {
  document.querySelectorAll('.nim-buy-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tier = parseInt(btn.dataset.sharpenTier, 10)
      await handleSharpenStonePurchase(tier, btn)
    })
  })
}

async function handleSharpenStonePurchase(tier, btn) {
  // Guard rails
  if (isDemo || !walletAddress) {
    alert('Connect your Nimiq wallet first to buy NIM items.')
    return
  }
  const next = getNextSharpenTier(progress.sharpenStoneLevel || 0)
  if (!next || next.tier !== tier) {
    alert('You cannot buy this tier yet.')
    return
  }

  // Confirm modal (simple native confirm for v1 — can prettify later)
  const ok = confirm(`Buy ${next.name} for ${next.costNim} NIM?\n\n+1 Max HP permanent.\nNimiq Pay will open to approve.`)
  if (!ok) return

  // UI: lock button while processing
  const origLabel = btn.textContent
  btn.disabled = true
  btn.textContent = 'PROCESSING…'

  let txHash = null
  try {
    // payNim returns tx hash (string) on success, throws on cancel/error
    txHash = await payNim({
      amountNim: next.costNim,
      recipient: NIMBLADE_RECIPIENT,
      purpose: `sharpen_stone_t${next.tier}`,
    })
    console.log('[Sharpen Stone] tx hash:', txHash)
  } catch (e) {
    console.error('payNim error:', e)
    alert('Payment cancelled or failed: ' + (e?.message || 'unknown error'))
    btn.disabled = false
    btn.textContent = origLabel
    return
  }

  // Persist purchase (audit log + level bump)
  try {
    await logNimPurchase({
      walletAddress,
      purchaseType: 'sharpen_stone',
      itemId: `tier_${next.tier}`,
      amountNim: next.costNim,
      txHash: typeof txHash === 'string' ? txHash : null,
    })
    const newLevel = await incrementSharpenStone(walletAddress, progress.sharpenStoneLevel || 0)
    progress.sharpenStoneLevel = newLevel ?? (progress.sharpenStoneLevel || 0) + 1
    saveProgress(progress)
    alert(`✅ ${next.name} unlocked! +1 Max HP next run.`)
  } catch (e) {
    console.error('DB persist error after successful payment:', e)
    alert('Payment succeeded but saving to server failed. tx: ' + txHash + '\nContact support if level does not update.')
  }

  // Re-render upgrade tree (button states will refresh from new level)
  replaceScreen('upgradeTree', renderUpgradeTree(progress, walletAddress))
  showScreen('upgradeTree')
  bindUpgradeBtns()
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
async function goLeaderboard() {
  if (weeklyInterval) { clearInterval(weeklyInterval); weeklyInterval = null }
  const players = await getLeaderboard()
  replaceScreen('leaderboard', renderLeaderboard(players))
  showScreen('leaderboard')
  showNav(true)
  setActiveNav('leaderboard')
  weeklyInterval = startWeeklyCountdown('lbCountdown')
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
async function goProfile() {
  if (weeklyInterval) { clearInterval(weeklyInterval); weeklyInterval = null }
  if (!isDemo) {
    const player = await getPlayer(walletAddress)
    if (player) {
      progress.gold            = player.gold            || progress.gold
      progress.highestDungeon  = player.highest_dungeon || progress.highestDungeon
      progress.unlockedWeapons = player.unlocked_weapons || progress.unlockedWeapons
      progress.upgrades        = player.upgrades        || progress.upgrades
      progress.sharpenStoneLevel = player.sharpen_stone_level ?? progress.sharpenStoneLevel ?? 0
      progress.weeklyPoints    = player.weekly_points   || progress.weeklyPoints
    }
  }

  replaceScreen('profile', renderProfile(progress, walletAddress))
  showScreen('profile')
  showNav(true)
  setActiveNav('profile')

  // Weapon selection in profile
  document.querySelectorAll('.weapon-card-sm').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.weapon
      if (!progress.unlockedWeapons?.includes(key)) return
      document.querySelectorAll('.weapon-card-sm').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      progress.selectedWeapon = key
    })
  })

  document.getElementById('btnSaveWeapon')?.addEventListener('click', async () => {
    saveProgress(progress)
    if (!isDemo) await updatePlayerWeapon(walletAddress, progress.selectedWeapon)
    const btn = document.getElementById('btnSaveWeapon')
    if (btn) { btn.textContent = 'SAVED ✓'; setTimeout(() => btn.textContent = 'SAVE', 1500) }
  })

  // Unlock weapon buttons
  document.querySelectorAll('.unlock-weapon-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.weapon
      const result = unlockWeapon(progress, key)
      if (!result) return alert('Not enough gold!')
      progress = result
      saveProgress(progress)
      if (!isDemo) await unlockWeaponDB(walletAddress, progress.gold, progress.unlockedWeapons)
      replaceScreen('profile', renderProfile(progress, walletAddress))
      showScreen('profile')
      goProfile()
    })
  })
}

// ─── RULES ───────────────────────────────────────────────────────────────────
function goRules() {
  showScreen('rules')
  showNav(true)
  setActiveNav('rules')
}

// ─── START RUN ───────────────────────────────────────────────────────────────
function startRun(dungeonId) {
  dungeon   = DUNGEONS.find(d => d.id === dungeonId)
  if (!dungeon) return

  stageIdx   = 0
  runState   = createRunState(progress.selectedWeapon || 'sword', progress.upgrades || {}, progress.sharpenStoneLevel || 0)
  runState.username = progress.username

  startStage()
}

// ─── START STAGE ─────────────────────────────────────────────────────────────
function startStage() {
  const stageDef = dungeon.stages[stageIdx]
  const mData    = MONSTERS[stageDef.monster]
  if (!mData) { console.error('Missing monster:', stageDef.monster); return }

  monsterState = {
    hp:             mData.hp,
    maxHp:          mData.hp,
    data:           mData,
    currentPattern: [...mData.pattern],
    activeBuff:     mData.buff ? { ...mData.buff } : null,
    isElite:        stageDef.isElite || false,
    isBoss:         stageDef.isBoss  || false,
    isPhase2:       false,
    momentumStacks: 0,
    barrierActive:  mData.buff?.type === 'barrier',
    nullifyActive:  false,
  }

  // battle_focus relic: +20 energy at start of each battle
  if (runState.relics.includes('battle_focus')) {
    runState.energy = Math.min(100, runState.energy + 20)
  }

  // eye_of_prediction relic: pre-roll & lock the first actual move so display matches
  if (runState.relics.includes('eye_of_prediction')) {
    runState.firstMoveRevealed = getMonsterMove(monsterState, 0, null, 0)
  } else {
    runState.firstMoveRevealed = null
  }

  roundIndex     = 0
  lastPlayerMove = null
  runState.moveConfirmed   = false
  runState.selectedMove    = null
  runState.ultimateQueued  = false
  runState.isPurifyRound   = false

  renderBattleScreen()
}

// ─── COMBAT LOG ─────────────────────────────────────────────────────────────
function addCombatLog(msg) {
  const log = document.getElementById('combatLog')
  if (!log) return
  const entry = document.createElement('div')
  entry.className = 'log-entry'
  entry.textContent = msg
  log.insertBefore(entry, log.firstChild) // newest on top
  // Keep max 8 entries
  while (log.children.length > 8) log.removeChild(log.lastChild)
}

// ─── RENDER BATTLE ───────────────────────────────────────────────────────────
function renderBattleScreen() {
  const old = document.getElementById('battle')
  if (old) old.remove()

  const relicPick = document.getElementById('relicPick')
  if (relicPick) relicPick.remove()

  const tmp = document.createElement('div')
  tmp.innerHTML = renderBattle(runState, monsterState, dungeon, stageIdx, roundIndex)
  app.insertBefore(tmp.firstElementChild, document.getElementById('bottomNav'))

  showScreen('battle')
  showNav(false)
  bindBattle()
  startRoundTimer()
  updateIntentDisplay()
}

// ─── BIND BATTLE ─────────────────────────────────────────────────────────────
function bindBattle() {
  // Move buttons
  document.querySelectorAll('.move-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (runState.moveConfirmed) return

      // Axe Berserk: can't guard
      if (btn.dataset.move === 'guard' && !canGuard(runState)) return

      document.querySelectorAll('.move-btn').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      runState.selectedMove = btn.dataset.move

      const confirmBtn = document.getElementById('btnConfirm')
      if (confirmBtn) confirmBtn.classList.remove('disabled')
    })
  })

  // Ultimate button
  document.getElementById('btnUlt')?.addEventListener('click', () => {
    if (runState.moveConfirmed) return
    if (!canUseUltimate(runState)) return

    runState.ultimateQueued = !runState.ultimateQueued
    const btn = document.getElementById('btnUlt')
    const w   = WEAPONS[runState.weapon]
    if (btn) {
      if (runState.ultimateQueued) {
        btn.classList.add('queued')
        btn.textContent = `✅ ${w.ultimate.name}`
      } else {
        btn.classList.remove('queued')
        btn.textContent = `⚡ ${w.ultimate.name}`
      }
    }
  })

  // Confirm button
  document.getElementById('btnConfirm')?.addEventListener('click', () => {
    if (!runState.selectedMove || runState.moveConfirmed) return
    runState.moveConfirmed = true
    clearInterval(timerInterval)

    const confirmBtn = document.getElementById('btnConfirm')
    if (confirmBtn) { confirmBtn.textContent = 'LOCKED ▶'; confirmBtn.classList.add('disabled') }
    document.querySelectorAll('.move-btn').forEach(b => b.classList.add('disabled'))
    document.getElementById('move1shown').textContent = '✓ Locked'

    // Activate ultimate if queued
    if (runState.ultimateQueued) {
      applyUltimate()
    }

    // Blade Rush: skip RPS, auto-win with 25 unblockable dmg
    if (runState.weapon === 'sword' && runState.ultDmgBonus > 0) {
      setTimeout(() => resolveAndAnimate('blade_rush', null), 600)
      return
    }

    // Purify: skip round entirely
    if (runState.isPurifyRound) {
      setTimeout(() => resolveAndAnimate('purify', null), 600)
      return
    }

    // Normal RPS
    const accuracy    = getUpgradeAccuracy(progress.upgrades || {}, monsterState.isBoss)
    // Eye of Prediction: if round 0 and a move was locked at battle start, use it (no re-roll)
    let monsterMove
    if (roundIndex === 0 && runState.firstMoveRevealed) {
      monsterMove = runState.firstMoveRevealed
    } else {
      monsterMove = getMonsterMove(monsterState, roundIndex, lastPlayerMove, accuracy)
    }
    setTimeout(() => resolveAndAnimate(runState.selectedMove, monsterMove), 600)
  })
}

// ─── APPLY ULTIMATE ──────────────────────────────────────────────────────────
function applyUltimate() {
  const result = activateUltimate(runState, monsterState)
  if (!result) return

  runState = { ...runState, ...result.newState, ultimateQueued: false }

  // Staff Purify: flag the round so confirm handler routes into the 'purify' branch
  if (result.stripsBuffs) {
    runState.isPurifyRound = true
  }

  // Spear: foresight — reveal next actual move
  if (result.foresightActive) {
    const nextMove = getMonsterMove(monsterState, roundIndex, lastPlayerMove, 0)
    const intentEl = document.getElementById('intentMove')
    if (intentEl) {
      const labels = { slash:'⚔ Slash', guard:'🛡 Guard', counter:'⚡ Counter' }
      intentEl.textContent = `👁 ${labels[nextMove] || nextMove}`
      intentEl.style.color = '#00ffcc'
    }
  }

  updateBattleUI(runState, monsterState)

  const resultText = document.getElementById('resultText')
  if (resultText) {
    resultText.textContent = `⚡ ${WEAPONS[runState.weapon].ultimate.name} ACTIVATED!`
    resultText.className = 'result-text win'
  }
}

// ─── RESOLVE ROUND ───────────────────────────────────────────────────────────
function resolveAndAnimate(playerMove, monsterMove) {
  // Only track real RPS moves for mirror monsters; ult pseudo-moves don't count
  if (playerMove === 'slash' || playerMove === 'guard' || playerMove === 'counter') {
    lastPlayerMove = playerMove
  }

  // ── BLADE RUSH: auto-win, 25 unblockable ──
  if (playerMove === 'blade_rush') {
    let dmg = 25
    if (runState.relics?.includes('warrior_gloves')) dmg = Math.round(dmg * 1.1)
    if (monsterState.isBoss && runState.relics?.includes('hunters_instinct')) dmg = Math.round(dmg * 1.1)
    if (monsterState.isBoss && runState.relics?.includes('hunters_mark'))     dmg = Math.round(dmg * 1.2)

    runState.ultDmgBonus    = 0
    runState.ultUnblockable = false
    runState.ultActive      = 0

    monsterState.hp = Math.max(0, monsterState.hp - dmg)
    showDamageFloat(dmg, false)

    setCharImage('char1img', WEAPONS[runState.weapon]?.ult || WEAPONS[runState.weapon]?.slash)
    const c1br = document.getElementById('char1wrap')
    const c2br = document.getElementById('char2wrap')
    playAttackAnim(c1br, c2br)

    const resultTextBR = document.getElementById('resultText')
    if (resultTextBR) {
      resultTextBR.textContent = `⚡ BLADE RUSH! -${dmg} HP (unblockable)`
      resultTextBR.className = 'result-text win'
    }
    document.getElementById('move1shown').textContent = '⚡ Blade Rush'
    document.getElementById('move2shown').textContent = '💥 Hit!'

    // Sword momentum: win counts
    runState = afterRoundUpdate(runState, true, false, 'slash', lastPlayerMove)
    updateBattleUI(runState, monsterState)
    renderRelicBar(runState.relics)

    setTimeout(() => {
      if (runState.hp <= 0)     { endRun(false); return }
      if (monsterState.hp <= 0) { onStageClear(); return }
      nextRound()
    }, 1800)
    return
  }

  // ── PURIFY: skip round, heal + strip buffs ──
  if (playerMove === 'purify') {
    runState.isPurifyRound = false

    let healAmt = 15
    if (runState.relics?.includes('warrior_gloves')) healAmt = Math.round(healAmt * 1.1)

    runState.hp = Math.min(runState.maxHp, runState.hp + healAmt)
    showDamageFloat(healAmt, true)

    monsterState.activeBuff     = null
    monsterState.momentumStacks = 0
    monsterState.barrierActive  = false

    const resultTextP = document.getElementById('resultText')
    if (resultTextP) {
      resultTextP.textContent = `✨ PURIFY! +${healAmt} HP · Monster buffs cleared`
      resultTextP.className = 'result-text win'
    }
    document.getElementById('move1shown').textContent = '✨ Purify'
    document.getElementById('move2shown').textContent = '🌀 Cleansed'

    // Treat as draw for energy/passive purposes (no win, no loss)
    runState = afterRoundUpdate(runState, false, true, 'guard', lastPlayerMove)
    updateBattleUI(runState, monsterState)
    renderRelicBar(runState.relics)

    // Log
    addCombatLog(`✨ Purify activated — +${healAmt} HP, monster buffs cleared`)

    setTimeout(() => {
      if (runState.hp <= 0)     { endRun(false); return }
      if (monsterState.hp <= 0) { onStageClear(); return }
      nextRound()
    }, 1800)
    return
  }

  // Chaos buff: roll new buff each round
  if (monsterState.data.buff?.type === 'chaos') {
    monsterState.activeBuff = rollChaosBuff()
  }

  // Phase immune check (ruin_wraith, dark_specter: immune every 3rd round)
  const isPhaseImmune = monsterState.activeBuff?.type === 'phase' &&
    (roundIndex + 1) % monsterState.activeBuff.value === 0

  // Resolve
  const result = resolveRound(playerMove, monsterMove, runState, monsterState)

  const playerWon = result.winner === 'player'
  const isDraw    = result.winner === 'draw'

  // Show move images
  const moveLabels = { slash:'⚔ Slash', guard:'🛡 Guard', counter:'⚡ Counter' }
  const move2el    = document.getElementById('move2shown')
  const move1el    = document.getElementById('move1shown')
  if (move2el) move2el.textContent = moveLabels[monsterMove]
  if (move1el) move1el.textContent = moveLabels[playerMove]

  // Set char images
  const w = WEAPONS[runState.weapon] || WEAPONS.sword
  setCharImage('char1img', getMoveImage(runState.weapon, playerMove))
  setCharImage('char2img', monsterState.data[monsterMove] || monsterState.data.attack)

  const c1 = document.getElementById('char1wrap')
  const c2 = document.getElementById('char2wrap')
  const resultText = document.getElementById('resultText')
  const resultDmg  = document.getElementById('resultDmg')

  // ── Apply phase immune ──
  if (isPhaseImmune) {
    playGuardAnim(c2)
    showIntentBubble(monsterMove, true)
    if (resultText) { resultText.textContent = '🔮 IMMUNE — no damage!'; resultText.className = 'result-text draw' }
    if (resultDmg)  resultDmg.textContent = ''
    addCombatLog(`R${roundIndex+1} 🔮 PHASE IMMUNE — no damage`)
    afterRoundCleanup(false, true, playerMove)
    return
  }

  // ── Draw ──
  if (isDraw) {
    playGuardAnim(c1); playGuardAnim(c2)
    if (resultText) { resultText.textContent = 'DRAW — no damage!'; resultText.className = 'result-text draw' }
    if (resultDmg)  resultDmg.textContent = ''
    addCombatLog(`R${roundIndex+1} DRAW — ${playerMove} vs ${monsterMove}`)
    afterRoundCleanup(false, true, playerMove)
    return
  }

  // ── Player wins ──
  if (playerWon) {
    playAttackAnim(c1, c2)
    const dmg = result.playerDmg
    monsterState.hp = Math.max(0, monsterState.hp - dmg)
    showDamageFloat(dmg, false)
    if (result.crit) showCritFloat()

    // Vampiric core heal
    if (result.healed > 0) {
      runState.hp = Math.min(runState.maxHp, runState.hp + result.healed)
      showDamageFloat(result.healed, true)
    }

    const label = result.missed ? '💨 DODGED!'
      : result.crit ? `⚔ CRIT! -${dmg} HP`
      : playerMove === 'counter' ? `⚡ COUNTER! -${dmg} HP`
      : `⚔ YOU WIN! -${dmg} HP`

    if (resultText) { resultText.textContent = label; resultText.className = 'result-text win' }
    if (resultDmg)  resultDmg.textContent = ''

  // ── Monster wins ──
  } else {
    playAttackAnim(c2, c1)
    const dmg = result.monsterDmg
    runState.hp = Math.max(0, runState.hp - dmg)
    showDamageFloat(dmg, false)

    const label = monsterMove === 'counter' ? `⚡ ENEMY COUNTER! -${dmg} HP` : `💀 ENEMY WINS! -${dmg} HP`
    if (resultText) { resultText.textContent = label; resultText.className = 'result-text lose' }
    if (resultDmg)  resultDmg.textContent = ''
  }

  afterRoundCleanup(playerWon, false, playerMove)
}

// ─── AFTER ROUND ─────────────────────────────────────────────────────────────
function afterRoundCleanup(playerWon, isDraw, playerMove) {
  // Monster per-round effects (regen, lifesteal, momentum)
  const mEffects = applyMonsterPerRound(monsterState, playerWon, isDraw)
  if (mEffects.hpDelta > 0) {
    monsterState.hp = Math.min(monsterState.maxHp, monsterState.hp + mEffects.hpDelta)
  }

  // Player debuffs from monster (poison, slow, burn)
  const pDebuffs = applyPlayerDebuffPerRound(runState, monsterState)
  if (pDebuffs.hpDelta < 0) {
    runState.hp = Math.max(0, runState.hp + pDebuffs.hpDelta)
    showDamageFloat(Math.abs(pDebuffs.hpDelta), false)
  }
  if (pDebuffs.energyDelta < 0) {
    runState.energy = Math.max(0, runState.energy + pDebuffs.energyDelta)
  }

  // Nullify resets each round
  monsterState.nullifyActive = monsterState.data.buff?.type === 'nullify' && !isDraw && !playerWon

  // Player state update (passives, energy, ult cooldown)
  runState = afterRoundUpdate(runState, playerWon, isDraw, playerMove, lastPlayerMove)

  // Second Wind check
  if (checkSecondWind(runState)) {
    runState.hp += 20
    runState.secondWindUsed = true
    showDamageFloat(20, true)
    const resultText = document.getElementById('resultText')
    if (resultText) { resultText.textContent = '💨 SECOND WIND! +20 HP'; resultText.className = 'result-text win' }
  }

  // Phase 2 check
  if (checkPhase2(monsterState)) {
    monsterState = applyPhase2(monsterState)
    // Reset pattern index so P2 starts at its first move (nextRound will ++ to 0)
    roundIndex = -1
    const resultText = document.getElementById('resultText')
    if (resultText) {
      setTimeout(() => {
        resultText.textContent = `⚡ ${monsterState.data.name} PHASE 2!`
        resultText.className = 'result-text lose'
      }, 400)
    }
  }

  updateBattleUI(runState, monsterState)
  renderRelicBar(runState.relics)

  // Decide what's next after 1.8s
  setTimeout(() => {
    if (runState.hp <= 0) {
      endRun(false)
    } else if (monsterState.hp <= 0) {
      onStageClear()
    } else {
      nextRound()
    }
  }, 1800)
}

// ─── NEXT ROUND ──────────────────────────────────────────────────────────────
function nextRound() {
  roundIndex++
  runState.selectedMove   = null
  runState.moveConfirmed  = false
  runState.ultimateQueued = false

  // Reset char to idle
  setCharImage('char1img', WEAPONS[runState.weapon]?.idle)
  setCharImage('char2img', monsterState.data.idle)

  document.querySelectorAll('.move-btn').forEach(b => b.classList.remove('selected','disabled'))

  const confirmBtn = document.getElementById('btnConfirm')
  if (confirmBtn) { confirmBtn.textContent = 'CONFIRM ▶'; confirmBtn.classList.add('disabled') }

  document.getElementById('move1shown').textContent = '...'
  document.getElementById('move2shown').textContent = '...'

  const resultText = document.getElementById('resultText')
  const resultDmg  = document.getElementById('resultDmg')
  if (resultText) { resultText.textContent = 'Choose your move!'; resultText.className = 'result-text draw' }
  if (resultDmg)  resultDmg.textContent = ''

  // Round number
  const rndEl = document.getElementById('roundNumBig')
  if (rndEl) rndEl.textContent = `R${roundIndex + 1}`

  // Update ult button
  const ultBtn = document.getElementById('btnUlt')
  const w      = WEAPONS[runState.weapon]
  if (ultBtn) {
    ultBtn.classList.remove('queued')
    const ready = canUseUltimate(runState)
    ultBtn.className = 'btn-ult ' + (ready ? 'ready' : 'locked')
    ultBtn.textContent = ready ? `⚡ ${w.ultimate.name}` : `🔒 ${w.ultimate.name}`
  }

  updateIntentDisplay()
  startRoundTimer()
}

// ─── INTENT DISPLAY ──────────────────────────────────────────────────────────
function updateIntentDisplay() {
  // Eye of Prediction: round 0 → reveal the actual locked move instead of intent
  if (roundIndex === 0 && runState?.firstMoveRevealed) {
    const intentEl = document.getElementById('intentMove')
    const labels = { slash:'⚔ Slash', guard:'🛡 Guard', counter:'⚡ Counter' }
    if (intentEl) {
      intentEl.textContent = `👁 ${labels[runState.firstMoveRevealed] || runState.firstMoveRevealed}`
      intentEl.style.color = '#ff66cc'
    }
    return
  }
  const intent = getMonsterIntent(monsterState, roundIndex)
  showIntentBubble(intent || 'unknown', false)
}

// ─── TIMER ───────────────────────────────────────────────────────────────────
function startRoundTimer() {
  let t = 15
  const timerEl = document.getElementById('timerCircle')
  clearInterval(timerInterval)

  if (timerEl) { timerEl.textContent = t; timerEl.classList.remove('urgent') }

  timerInterval = setInterval(() => {
    t--
    if (timerEl) {
      timerEl.textContent = t
      if (t <= 5) timerEl.classList.add('urgent')
    }
    if (t <= 0) {
      clearInterval(timerInterval)
      if (!runState.moveConfirmed) {
        // Auto-pick random move
        const moves = canGuard(runState) ? ['slash','guard','counter'] : ['slash','counter']
        runState.selectedMove = moves[Math.floor(Math.random() * moves.length)]
        document.getElementById('btnConfirm')?.click()
      }
    }
  }, 1000)
}

// ─── STAGE CLEAR ─────────────────────────────────────────────────────────────
function onStageClear() {
  clearInterval(timerInterval)

  const isBoss = dungeon.stages[stageIdx].isBoss

  if (isBoss) {
    // Dungeon cleared!
    onDungeonClear()
    return
  }

  // After stage 1 (idx 0) and stage 3 (idx 2) → relic pick
  if (stageIdx === 0 || stageIdx === 2) {
    showRelicPick()
    return
  }

  // Otherwise go to next stage
  stageIdx++
  startStage()
}

// ─── RELIC PICK ──────────────────────────────────────────────────────────────
function showRelicPick() {
  const choices = generateRelicChoices(stageIdx, progress.upgrades || {}, runState.relics)

  const old = document.getElementById('battle')
  if (old) old.remove()

  const tmp = document.createElement('div')
  tmp.innerHTML = renderRelicPick(choices, stageIdx, runState)
  app.insertBefore(tmp.firstElementChild, document.getElementById('bottomNav'))

  showScreen('relicPick')
  showNav(false)

  document.querySelectorAll('.relic-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const relicId = btn.dataset.relic
      runState = applyRelicToRunState(runState, relicId)

      // Recovery Potion: ONE-TIME heal only on the pick that grants it
      if (relicId === 'recovery_potion') {
        runState.hp = Math.min(runState.maxHp, runState.hp + 5)
      }

      stageIdx++
      startStage()
    })
  })
}

// ─── DUNGEON CLEAR ───────────────────────────────────────────────────────────
async function onDungeonClear() {
  clearInterval(timerInterval)

  const goldEarned = calcGoldReward(dungeon.gold, runState.relics, progress.upgrades || {})
  progress.gold = (progress.gold || 0) + goldEarned
  progress.highestDungeon = Math.max(progress.highestDungeon || 0, dungeon.id)
  progress.weeklyPoints   = (progress.weeklyPoints || 0) + 10
  saveProgress(progress)

  if (!isDemo) {
    await recordDungeonClear(walletAddress, dungeon.id, goldEarned)
  }

  showResult(true, goldEarned)
}

// ─── RUN FAILED ──────────────────────────────────────────────────────────────
async function endRun(won) {
  clearInterval(timerInterval)

  if (!won && !isDemo) {
    await recordRunFailed(walletAddress)
  }

  showResult(won, 0)
}

// ─── RESULT SCREEN ───────────────────────────────────────────────────────────
function showResult(won, goldEarned) {
  const old = document.getElementById('battle')
  if (old) old.remove()
  const rp = document.getElementById('relicPick')
  if (rp) rp.remove()

  const tmp = document.createElement('div')
  tmp.innerHTML = renderResult(won, goldEarned, runState, dungeon, stageIdx)
  app.insertBefore(tmp.firstElementChild, document.getElementById('bottomNav'))

  showScreen('result')
  showNav(false)

  document.getElementById('btnPlayAgain')?.addEventListener('click', () => {
    showNav(true)
    goDungeonMap()
  })

  document.getElementById('btnBackHome')?.addEventListener('click', () => {
    showNav(true)
    goHome()
  })
}

// ─── HELPER: replaceScreen ────────────────────────────────────────────────────
function replaceScreen(id, html) {
  const el = document.getElementById(id)
  if (!el) return
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  el.replaceWith(tmp.firstElementChild)
}