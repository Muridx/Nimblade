import { WEAPONS, RELICS, UPGRADE_TREE, DUNGEONS, SHARPEN_STONE_TIERS, getHpColor, canUseUltimate, canGuard, getWeeklyCountdown } from './game.js'

// ─── SCREEN UTILS ────────────────────────────────────
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active')
    s.style.display = 'none'
  })
  const el = document.getElementById(id)
  if (el) { el.style.display = 'flex'; el.classList.add('active') }
}
export function showNav(show = true) {
  const nav = document.getElementById('bottomNav')
  if (nav) nav.style.display = show ? 'flex' : 'none'
}
export function setActiveNav(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('nav-' + tab)?.classList.add('active')
}

// ─── CONNECT ─────────────────────────────────────────
export function renderConnect() {
  return `
  <div id="connect" class="screen connect-screen active">
    <img src="/assets/arena_battle.png" class="connect-bg-img" />
    <div class="connect-overlay"></div>
    <div class="connect-content">
      <div class="connect-logo">
        <div class="logo-title">⚔ NIM<br>BLADE</div>
        <div class="logo-sub">Roguelite RPS Dungeon Crawler · built for Nimiq Pay</div>
      </div>
      <div class="connect-btns">
        <button class="btn-primary" id="btnDemo">PLAY NOW</button>
        <button class="btn-secondary" id="btnConnect">CONNECT WALLET</button>
        <div class="connect-hint">No wallet? Just hit Play. Connect later for the Official Leaderboard.</div>
      </div>
    </div>
  </div>`
}

// ─── USERNAME ────────────────────────────────────────
export function renderUsername() {
  return `
  <div id="username" class="screen username-screen">
    <div class="screen-title">ENTER YOUR<br>ARENA NAME</div>
    <input class="input-field" id="usernameInput" maxlength="12" placeholder="Warrior"
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"/>
    <div style="font-size:9px;color:#4a3010;text-align:center">2–12 characters</div>
    <button class="btn-primary" id="btnUsername">ENTER ARENA</button>
  </div>`
}

// ─── BOTTOM NAV ──────────────────────────────────────
export function renderBottomNav() {
  return `
  <nav id="bottomNav" class="bottom-nav" style="display:none">
    <button class="nav-btn" id="nav-home"><span class="nav-icon">🏠</span><span class="nav-lbl">HOME</span></button>
    <button class="nav-btn" id="nav-arena"><span class="nav-icon">⚔️</span><span class="nav-lbl">DUNGEON</span></button>
    <button class="nav-btn" id="nav-upgrade"><span class="nav-icon">🌳</span><span class="nav-lbl">UPGRADES</span></button>
    <button class="nav-btn" id="nav-leaderboard"><span class="nav-icon">🏆</span><span class="nav-lbl">RANKS</span></button>
    <button class="nav-btn" id="nav-profile"><span class="nav-icon">👤</span><span class="nav-lbl">ME</span></button>
  </nav>`
}

// ─── HOME ────────────────────────────────────────────
export function renderHome(progress) {
  const w = WEAPONS[progress.selectedWeapon] || WEAPONS.sword
  return `
  <div id="home" class="screen home-screen">
    <div class="home-header">
      <div class="home-logo">⚔ NIM ARENA</div>
      <div class="home-tagline">Dungeon Crawler · powered by NIM</div>
    </div>
    <img src="/assets/arena_battle.png" class="home-arena-img"/>
    <div class="home-welcome">
      WELCOME, <span class="welcome-name">${(progress.username||'WARRIOR').toUpperCase()}</span>
      <span class="home-weapon-badge">${w.icon} ${w.name}</span>
    </div>
    <div class="home-stats-row">
      <div class="home-stat"><span class="home-stat-val gold">${progress.gold||0}</span><span class="home-stat-lbl">GOLD</span></div>
      <div class="home-stat-divider"></div>
      <div class="home-stat"><span class="home-stat-val">${progress.highestDungeon||0}</span><span class="home-stat-lbl">BEST DUNGEON</span></div>
      <div class="home-stat-divider"></div>
      <div class="home-stat"><span class="home-stat-val">${progress.weeklyPoints||0}</span><span class="home-stat-lbl">WEEKLY PTS</span></div>
    </div>
    <button class="btn-battle" id="btnGoArena">⚔ ENTER DUNGEON</button>
    <div class="home-card">
      <div class="home-card-title">🏆 WEEKLY POOL</div>
      <div class="home-card-row">
        <span class="home-card-lbl">Resets Monday 00:00 UTC</span>
        <span class="home-card-lbl" id="weeklyCountdown">calculating...</span>
      </div>
      <div class="home-card-row">
        <span class="home-card-lbl">🥇 35% · 🥈 25% · 🥉 15% · #4-10: 25%</span>
      </div>
    </div>
    <div class="home-card">
      <div class="home-card-title">⚔️ HOW IT WORKS</div>
      <div class="feature-row"><span class="feature-icon">🗡️</span><span class="feature-text">Fight through 5 stages per dungeon</span></div>
      <div class="feature-row"><span class="feature-icon">💎</span><span class="feature-text">Pick relics after Stage 1 & 3 to power up</span></div>
      <div class="feature-row"><span class="feature-icon">👑</span><span class="feature-text">Defeat the boss to earn gold</span></div>
      <div class="feature-row"><span class="feature-icon">🌳</span><span class="feature-text">Spend gold on permanent upgrades & new weapons</span></div>
    </div>
  </div>`
}

// ─── DUNGEON MAP ─────────────────────────────────────
export function renderDungeonMap(progress) {
  const highest = progress.highestDungeon || 0

  // Layout: zigzag path, 10 nodes
  // Each node has a position in a 3-column grid (col 0=left, 1=center, 2=right)
  const positions = [
    { col: 1 }, // D1
    { col: 0 }, // D2
    { col: 2 }, // D3
    { col: 1 }, // D4
    { col: 0 }, // D5
    { col: 2 }, // D6
    { col: 1 }, // D7
    { col: 0 }, // D8
    { col: 2 }, // D9
    { col: 1 }, // D10
  ]

  const dungeonEmojis = ['🌿','🌲','⛏️','🌊','🏰','🏛️','🧛','❄️','👤','👹']

  const nodes = DUNGEONS.map((d, i) => {
    const isCleared  = d.id <= highest
    const isCurrent  = d.id === highest + 1
    const isLocked   = d.id > highest + 1
    const pos        = positions[i]
    const colPercent = pos.col === 0 ? 10 : pos.col === 1 ? 38 : 66

    let nodeClass = 'dungeon-node'
    if (isCleared)  nodeClass += ' cleared'
    if (isCurrent)  nodeClass += ' current'
    if (isLocked)   nodeClass += ' locked'

    return `
    <div class="${nodeClass}" data-id="${d.id}"
      style="left:${colPercent}%;bottom:${8 + i * 9}%;">
      <div class="node-icon">${isLocked ? '🔒' : isCleared ? '✅' : dungeonEmojis[i]}</div>
      <div class="node-label">${d.id}. ${d.name.split(' ').slice(0,2).join(' ')}</div>
      ${isCurrent ? '<div class="node-current-ring"></div>' : ''}
    </div>`
  }).join('')

  // Path lines between nodes (SVG)
  const svgLines = DUNGEONS.slice(0,-1).map((d, i) => {
    const cols = [1,0,2,1,0,2,1,0,2,1]
    const colToX = c => c === 0 ? 22 : c === 1 ? 50 : 78
    const x1 = colToX(cols[i])
    const y1 = 100 - (8 + i * 9) - 4
    const x2 = colToX(cols[i+1])
    const y2 = 100 - (8 + (i+1) * 9) - 4
    const cleared = d.id <= highest
    return `<line x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"
      stroke="${cleared ? '#4ecb30' : '#2a1608'}" stroke-width="1.5" stroke-dasharray="${cleared ? '0' : '4 3'}"/>`
  }).join('')

  return `
  <div id="dungeonMap" class="screen dungeon-map-screen">
    <div class="map-header">
      <div class="map-title">⚔ DUNGEON MAP</div>
      <div class="map-sub">ACT I — Choose your dungeon</div>
    </div>
    <div class="map-container">
      <img src="/assets/arena_battle.png" class="map-bg-img"/>
      <div class="map-overlay"></div>
      <svg class="map-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${svgLines}</svg>
      ${nodes}
    </div>
  </div>`
}

// ─── WEAPON SELECT ───────────────────────────────────
export function renderWeaponSelect(progress) {
  const weapons = Object.entries(WEAPONS)
  return `
  <div id="weaponSelect" class="screen weapon-screen">
    <div class="weapon-screen-title">CHOOSE WEAPON</div>
    <div class="weapon-screen-sub">SELECT YOUR FIGHTER FOR THIS RUN</div>
    <div class="weapon-grid">
      ${weapons.map(([key, w]) => {
        const unlocked = progress.unlockedWeapons?.includes(key)
        const selected = progress.selectedWeapon === key
        return `
        <div class="weapon-card ${selected ? 'selected' : ''} ${!unlocked ? 'locked-card' : ''}" data-weapon="${key}">
          <div class="weapon-card-img">
            <img src="${w.idle}" alt="${w.name}" onerror="this.style.display='none'"/>
          </div>
          <div class="weapon-card-body">
            <div class="weapon-card-top">
              <span class="weapon-name">${w.name.toUpperCase()}</span>
              ${!unlocked ? `<span class="weapon-lock-badge">🔒 ${w.unlockCost}G</span>` : ''}
            </div>
            <div class="weapon-identity">${w.identity}</div>
            <div class="weapon-skills">
              <div class="weapon-skill-row">
                <span class="weapon-skill-label">P</span>
                <span class="weapon-skill-name">${w.passive.name}</span>
              </div>
              <div class="weapon-skill-row">
                <span class="weapon-skill-label ult">U</span>
                <span class="weapon-skill-name">${w.ultimate.name}</span>
              </div>
            </div>
          </div>
          <span class="weapon-select-arrow">${selected ? '✓' : '›'}</span>
        </div>`
      }).join('')}
    </div>
    <div style="display:flex;gap:8px;width:100%;padding:0 4px">
      <button class="btn-secondary" id="btnBackMap" style="flex:1">← BACK</button>
      <button class="btn-primary" id="btnWeapon" style="flex:2">⚔ START RUN</button>
    </div>
  </div>`
}

// ─── UPGRADE TREE ────────────────────────────────────
export function renderUpgradeTree(progress, walletAddress = null) {
  const trees = [
    { id: 'survivor', name: 'Survivor', icon: '❤️', nodes: ['tough_skin_1','tough_skin_2','veteran'] },
    { id: 'hunter',   name: 'Hunter',   icon: '🎯', nodes: ['sharp_eyes','pattern_reader','sixth_sense'] },
    { id: 'relic',    name: 'Relic',    icon: '💎', nodes: ['lucky_find','treasure_hunter','ancient_knowledge'] },
    { id: 'gold',     name: 'Gold',     icon: '🪙', nodes: ['bounty_hunter','rich_adventurer','treasure_magnet'] },
    { id: 'ultimate', name: 'Ultimate', icon: '⚡', nodes: ['weapon_training','battle_experience','master_combatant'] },
  ]

  return `
  <div id="upgradeTree" class="screen upgrade-screen">
    <div class="upgrade-header">
      <div class="upgrade-title">UPGRADE TREE</div>
      <div class="upgrade-gold">🪙 ${progress.gold || 0} Gold</div>
    </div>
    <div class="upgrade-trees">
      ${(() => {
        const level = Math.max(0, Math.min(5, (progress.sharpenStoneLevel | 0)))
        const connected = !!walletAddress
        return `
        <div class="upgrade-tree-section nim-section">
          <div class="upgrade-tree-title nim-title">💎 NIM EXCLUSIVE — Sharpen Stone (+1 HP per tier)</div>
          <div class="nim-tier-row">
            ${SHARPEN_STONE_TIERS.map(t => {
              const owned     = t.tier <= level
              const isNext    = t.tier === level + 1
              const canBuy    = isNext && connected
              const locked    = t.tier > level + 1
              let label = ''
              if (owned)            label = '✅ OWNED'
              else if (locked)      label = `🔒 TIER ${t.tier - 1}`
              else if (!connected)  label = '🔗 CONNECT WALLET'
              else                  label = `BUY — ${t.costNim} NIM`
              return `
              <div class="nim-tier-card ${owned ? 'owned' : ''} ${locked ? 'locked' : ''} ${canBuy ? 'available' : ''}">
                <div class="nim-tier-name">${t.name}</div>
                <div class="nim-tier-bonus">+1 Max HP</div>
                <button class="nim-buy-btn ${(!canBuy && !owned) ? 'disabled' : ''}"
                        data-sharpen-tier="${t.tier}"
                        ${(!canBuy || owned) ? 'disabled' : ''}>${label}</button>
              </div>`
            }).join('')}
          </div>
        </div>`
      })()}
      ${trees.map(tree => `
      <div class="upgrade-tree-section">
        <div class="upgrade-tree-title">${tree.icon} ${tree.name}</div>
        <div class="upgrade-tree-nodes">
          ${tree.nodes.map((nodeId, idx) => {
            const node = UPGRADE_TREE[nodeId]
            if (!node) return ''
            const owned = !!progress.upgrades?.[nodeId]
            const reqMet = !node.requires || !!progress.upgrades?.[node.requires]
            const canBuy = !owned && reqMet && (progress.gold || 0) >= node.cost
            const locked = !reqMet

            return `
            <div class="upgrade-node ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}">
              <div class="upgrade-node-left">
                <div class="upgrade-node-name">${node.name}</div>
                <div class="upgrade-node-desc">${node.desc}</div>
              </div>
              <div class="upgrade-node-right">
                ${owned
                  ? '<span class="upgrade-owned-badge">✓</span>'
                  : `<button class="upgrade-btn ${!canBuy ? 'disabled' : ''}"
                      data-upgrade="${nodeId}" ${!canBuy ? 'disabled' : ''}>
                      ${locked ? '🔒' : `${node.cost}G`}
                    </button>`}
              </div>
            </div>
            ${idx < tree.nodes.length - 1 ? '<div class="upgrade-connector"></div>' : ''}
            `
          }).join('')}
        </div>
      </div>`).join('')}
    </div>
  </div>`
}

// ─── BATTLE ──────────────────────────────────────────
export function renderBattle(runState, monsterState, dungeon, stageIdx, roundIndex) {
  const w1 = WEAPONS[runState.weapon] || WEAPONS.sword
  const monster = monsterState.data
  const stageDef = dungeon.stages[stageIdx]
  const stageLabel = stageDef.isBoss ? '👑 BOSS' : stageDef.isElite ? '⚡ ELITE' : `Stage ${stageIdx + 1}`

  const hpPct1 = Math.round((runState.hp / runState.maxHp) * 100)
  const hpPct2 = Math.round((monsterState.hp / monsterState.maxHp) * 100)
  const hpClass1 = getHpColor(runState.hp, runState.maxHp)
  const hpClass2 = getHpColor(monsterState.hp, monsterState.maxHp)

  // Energy segments
  const energySegs = [0,1,2,3].map(i =>
    `<div class="energy-seg ${runState.energy >= (i+1)*25 ? 'filled' : ''}"></div>`
  ).join('')

  // Relics bar (small icons)
  const relicsBar = runState.relics.length > 0
    ? runState.relics.map(id => {
        const r = RELICS[id]
        return r ? `<span class="relic-mini" title="${r.name}: ${r.desc}">${r.icon}</span>` : ''
      }).join('')
    : '<span style="font-size:9px;color:#3a2008">No relics</span>'

  // Buff display
  const buffDisplay = monsterState.activeBuff
    ? `<span class="monster-buff-badge">${monsterState.activeBuff.desc}</span>`
    : ''

  const ultReady = canUseUltimate(runState)
  const guardDisabled = !canGuard(runState)

  // Intent bubble
  const { MONSTERS } = window._gameRef || {}
  const intentMove = monsterState.currentPattern
    ? monsterState.currentPattern[roundIndex % monsterState.currentPattern.length]
    : null
  const intentLabel = intentMove === 'mirror' ? '🪞 Mirror'
    : intentMove === 'slash' ? '⚔ Slash'
    : intentMove === 'guard' ? '🛡 Guard'
    : intentMove === 'counter' ? '⚡ Counter'
    : '❓'

  return `
  <div id="battle" class="screen battle-screen active">
    <div class="battle-bg">
      <img class="battle-arena-img" src="${dungeon.bg || '/assets/arena_battle.png'}"/>

      <!-- TOP HUD -->
      <div class="battle-hud">
        <div class="battle-stage-label">${dungeon.name} · ${stageLabel}</div>
        <div class="hud-row">
          <div class="hud-player-info">
            <span class="p-name">${(runState.username||'YOU').substring(0,8)}</span>
            <span class="p-hp-num" id="hp1num">${runState.hp}</span>
          </div>
          <div class="hp-track">
            <div class="hp-fill ${hpClass1}" id="hp1bar" style="width:${hpPct1}%"></div>
          </div>
          <div class="hud-vs">VS</div>
          <div class="hp-track">
            <div class="hp-fill ${hpClass2}" id="hp2bar" style="width:${hpPct2}%"></div>
          </div>
          <div class="hud-player-info right">
            <span class="p-name right">${monster.name.substring(0,10)}</span>
            <span class="p-hp-num right" id="hp2num">${monsterState.hp}</span>
          </div>
        </div>
      </div>

      <!-- PASSIVE / BUFF HUD -->
      <div class="passive-hud">
        <div class="passive-left">
          <div class="energy-bar-wrap">
            <span class="passive-label">NRG</span>
            <div class="energy-segs" id="energySegs">${energySegs}</div>
          </div>
          ${runState.weapon === 'sword' ? `
          <div class="passive-indicator">
            <span class="passive-label">MTM</span>
            <span class="passive-val" id="momentumVal">+${runState.momentumDmg||0}</span>
          </div>` : ''}
          ${runState.ultActive > 0 ? `<div class="ult-active-badge" id="ultActiveBadge">${w1.ultimate.name} ×${runState.ultActive}</div>` : '<div class="ult-active-badge" id="ultActiveBadge" style="display:none"></div>'}
        </div>
        <div class="passive-right">
          ${buffDisplay}
          ${monsterState.isPhase2 ? '<span class="phase2-badge">⚡ PHASE 2</span>' : ''}
        </div>
      </div>

      <!-- CHARACTERS -->
      <div class="chars-zone" id="charsZone">
        <div class="char-slot left-slot">
          <div class="char-img-wrap idle" id="char1wrap">
            <img id="char1img" src="${w1.idle}" onerror="this.src=''"/>
          </div>
          <span class="move-shown" id="move1shown">...</span>
        </div>

        <div class="vs-mid">
          <div class="intent-bubble" id="intentBubble">
            <span class="intent-label">INTENT</span>
            <span class="intent-move" id="intentMove">${intentLabel}</span>
          </div>
          <div class="timer-circle" id="timerCircle">15</div>
          <div class="round-num-big" id="roundNumBig">R${roundIndex+1}</div>
        </div>

        <div class="char-slot right-slot">
          <div class="char-img-wrap idle" id="char2wrap">
            <img id="char2img" src="${monster.idle}" onerror="this.src=''" class="flip"/>
          </div>
          <span class="move-shown" id="move2shown">...</span>
        </div>
      </div>

      <!-- RESULT BANNER -->
      <div class="result-banner">
        <span class="result-text draw" id="resultText">Choose your move!</span>
        <span class="dmg-text" id="resultDmg"></span>
      </div>

      <!-- RELICS BAR -->
      <div class="relics-bar" id="relicsBar">${relicsBar}</div>

      <!-- COMBAT LOG -->
      <div class="combat-log" id="combatLog"></div>

      <!-- ACTION BAR -->
      <div class="action-bar">
        <div class="moves-row">
          <div class="move-btn" id="btnSlash" data-move="slash">
            <span class="move-icon">⚔️</span>
            <span class="move-name">SLASH</span>
            <span class="move-sub">beats CTR</span>
          </div>
          <div class="move-btn" id="btnGuard" data-move="guard" ${guardDisabled ? 'style="opacity:.3;pointer-events:none"' : ''}>
            <span class="move-icon">🛡️</span>
            <span class="move-name">GUARD</span>
            <span class="move-sub">beats SLS</span>
          </div>
          <div class="move-btn" id="btnCounter" data-move="counter">
            <span class="move-icon">⚡</span>
            <span class="move-name">COUNTER</span>
            <span class="move-sub">beats GRD</span>
          </div>
        </div>
        <div class="confirm-row">
          <button class="btn-ult ${ultReady ? 'ready' : 'locked'}" id="btnUlt">
            ${ultReady ? `⚡ ${w1.ultimate.name}` : `🔒 ${w1.ultimate.name}`}
          </button>
          <button class="btn-confirm disabled" id="btnConfirm">CONFIRM ▶</button>
        </div>
      </div>

    </div>
  </div>`
}

// ─── RELIC PICK ──────────────────────────────────────
export function renderRelicPick(choices, stageIdx, runState) {
  const stageLabel = stageIdx === 0 ? 'Stage 1 Clear!' : 'Stage 3 Clear!'
  return `
  <div id="relicPick" class="screen relic-pick-screen active">
    <div class="relic-pick-header">
      <div class="relic-pick-title">⚔ ${stageLabel}</div>
      <div class="relic-pick-sub">CHOOSE A RELIC</div>
    </div>
    <div class="relic-pick-hp">
      HP: <span style="color:#4ecb30">${runState.hp}</span> / ${runState.maxHp}
    </div>
    <div class="relic-choices">
      ${choices.map(r => `
      <button class="relic-choice-btn rarity-${r.rarity}" data-relic="${r.id}">
        <div class="relic-icon">${r.icon}</div>
        <div class="relic-info">
          <div class="relic-name">${r.name}</div>
          <div class="relic-rarity ${r.rarity}">${r.rarity.toUpperCase()}</div>
          <div class="relic-desc">${r.desc}</div>
        </div>
      </button>`).join('')}
    </div>
    <div class="relic-current">
      <div class="relic-current-label">CURRENT RELICS</div>
      <div class="relic-current-list">
        ${runState.relics.length > 0
          ? runState.relics.map(id => {
              const r = RELICS[id]
              return r ? `<span class="relic-mini rarity-${r.rarity}" title="${r.name}">${r.icon}</span>` : ''
            }).join('')
          : '<span style="font-size:9px;color:#3a2008">None yet</span>'}
      </div>
    </div>
  </div>`
}

// ─── RESULT ──────────────────────────────────────────
export function renderResult(won, goldEarned, runState, dungeon, stageIdx) {
  const stage = dungeon?.stages[stageIdx]
  const reachedStage = stageIdx + 1
  const relicsDots = runState?.relics?.map(id => {
    const r = RELICS[id]
    return r ? `<span class="relic-mini" title="${r.name}">${r.icon}</span>` : ''
  }).join('') || ''

  return `
  <div id="result" class="screen result-screen active">
    <div class="result-crown">${won ? '👑' : '💀'}</div>
    <div class="result-title ${won ? 'win' : 'lose'}">${won ? 'VICTORY!' : 'DEFEATED'}</div>
    <div class="result-dungeon">${dungeon?.name || '—'} · Stage ${reachedStage}</div>

    <div class="result-stats">
      ${won ? `
      <div class="stat-row">
        <span class="stat-label">GOLD EARNED</span>
        <span class="stat-val gold">+${goldEarned} 🪙</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">WEEKLY POINTS</span>
        <span class="stat-val gold">+10 PTS</span>
      </div>` : ''}
      <div class="stat-row">
        <span class="stat-label">FINAL HP</span>
        <span class="stat-val ${runState?.hp > 0 ? 'green' : 'red'}">${runState?.hp || 0} / ${runState?.maxHp || 100}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">RELICS COLLECTED</span>
        <span class="stat-val">${runState?.relics?.length || 0}</span>
      </div>
    </div>

    ${relicsDots ? `<div class="result-relics">${relicsDots}</div>` : ''}

    <div class="result-actions">
      <button class="btn-primary" id="btnPlayAgain">⚔ PLAY AGAIN</button>
      <button class="btn-secondary" id="btnBackHome">BACK TO HOME</button>
    </div>
  </div>`
}

// ─── LEADERBOARD ─────────────────────────────────────
export function renderLeaderboard(players) {
  const rankEmoji = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`
  return `
  <div id="leaderboard" class="screen leaderboard-screen">
    <div class="lb-header">
      <div class="home-logo">🏆 LEADERBOARD</div>
      <div class="lb-subtitle">Weekly Arena Rankings</div>
      <div class="lb-pool-box">
        <span class="lb-pool-lbl">Resets in</span>
        <span class="lb-pool-val" id="lbCountdown">—</span>
      </div>
    </div>
    <div class="lb-cols-header">
      <span style="width:32px"></span>
      <span style="flex:1">PLAYER</span>
      <span style="width:50px;text-align:right">PTS</span>
      <span style="width:44px;text-align:right">BEST</span>
    </div>
    <div class="lb-list">
      ${players.length === 0
        ? '<div class="lb-empty">No warriors yet.<br>Be the first! ⚔</div>'
        : players.map((p,i) => {
          const w = WEAPONS[p.weapon]
          return `
          <div class="lb-row ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">
            <span class="lb-rank">${rankEmoji(i)}</span>
            <div class="lb-player">
              <span class="lb-name">${p.username}</span>
              <span class="lb-weapon">${w?.icon||'⚔'} ${w?.name||p.weapon}</span>
            </div>
            <div class="lb-right">
              <span class="lb-pts">${p.weekly_points||p.arena_points||0}</span>
              <span class="lb-pts-lbl">D${p.highestDungeon||0}</span>
            </div>
          </div>`
        }).join('')}
    </div>
    <div class="lb-reset-note">Points reset every Monday 00:00 UTC</div>
  </div>`
}

// ─── PROFILE ─────────────────────────────────────────
export function renderProfile(progress, walletAddress) {
  const w = WEAPONS[progress.selectedWeapon] || WEAPONS.sword
  const isDemo = walletAddress?.startsWith('DEMO_')
  const walletDisplay = isDemo ? 'DEMO MODE'
    : walletAddress ? walletAddress.slice(0,8) + '...' + walletAddress.slice(-4) : '—'

  return `
  <div id="profile" class="screen profile-screen">
    <div class="profile-header">
      <div class="profile-avatar"><img src="${w.idle}" onerror="this.style.display='none'"/></div>
      <div class="profile-info">
        <div class="profile-name">${(progress.username||'WARRIOR').toUpperCase()}</div>
        <div class="profile-weapon">${w.icon} ${w.name}</div>
        <div class="profile-wallet">${walletDisplay}</div>
      </div>
    </div>

    <div class="profile-stats-grid">
      <div class="profile-stat"><span class="profile-stat-val gold">${progress.gold||0}</span><span class="profile-stat-lbl">GOLD</span></div>
      <div class="profile-stat"><span class="profile-stat-val">${progress.highestDungeon||0}</span><span class="profile-stat-lbl">BEST DUNGEON</span></div>
      <div class="profile-stat"><span class="profile-stat-val green">${progress.weeklyPoints||0}</span><span class="profile-stat-lbl">WEEKLY PTS</span></div>
      <div class="profile-stat"><span class="profile-stat-val">${progress.unlockedWeapons?.length||1}</span><span class="profile-stat-lbl">WEAPONS</span></div>
    </div>

    <div class="profile-section-title">WEAPONS</div>
    <div class="weapon-grid-small">
      ${Object.entries(WEAPONS).map(([key, ww]) => {
        const unlocked = progress.unlockedWeapons?.includes(key)
        const selected = progress.selectedWeapon === key
        return `
        <div class="weapon-card-sm ${selected?'selected':''} ${!unlocked?'locked-card':''}" data-weapon="${key}">
          <img src="${ww.idle}" onerror="this.style.display='none'"/>
          <span>${ww.icon} ${ww.name}</span>
          ${!unlocked ? `<button class="unlock-weapon-btn" data-weapon="${key}">${ww.unlockCost}G</button>` : ''}
        </div>`
      }).join('')}
    </div>
    <button class="btn-primary" id="btnSaveWeapon" style="margin-top:8px">SAVE</button>
  </div>`
}

// ─── RULES ───────────────────────────────────────────
export function renderRules() {
  const weaponRows = Object.entries(WEAPONS).map(([,w]) => `
  <div class="rules-weapon-row">
    <span class="rules-weapon-icon">${w.icon}</span>
    <div class="rules-weapon-info">
      <span class="rules-weapon-name">${w.name}</span>
      <span class="rules-weapon-desc">${w.identity}</span>
      <span class="rules-weapon-passive">P: ${w.passive.name} — ${w.passive.desc}</span>
      <span class="rules-weapon-ult">U: ${w.ultimate.name} — ${w.ultimate.desc}</span>
    </div>
  </div>`).join('')

  return `
  <div id="rules" class="screen rules-screen">
    <div class="rules-title">HOW TO PLAY</div>
    <div class="rules-section">
      <div class="rules-section-title">🎮 BASICS</div>
      <div class="rules-text">Fight through <span class="hl">5 stages</span> per dungeon. Win rounds to deal damage. Defeat the boss to earn <span class="hl">gold</span> and unlock more dungeons.</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">⚔️ COMBAT</div>
      <div class="moves-explain">
        <div class="move-card-rule"><span class="move-icon-lg">⚔️</span><div class="move-detail"><span class="move-nm">SLASH</span><span class="move-desc">Beats Counter · 10 dmg</span></div></div>
        <div class="move-card-rule"><span class="move-icon-lg">🛡️</span><div class="move-detail"><span class="move-nm">GUARD</span><span class="move-desc">Beats Slash · 10 dmg</span></div></div>
        <div class="move-card-rule"><span class="move-icon-lg">⚡</span><div class="move-detail"><span class="move-nm">COUNTER</span><span class="move-desc">Beats Guard · <span class="hl">15 dmg</span></span></div></div>
      </div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">💭 MONSTER INTENT</div>
      <div class="rules-text">Monsters show their <span class="hl">intended move</span> each round. Normal: 80% follows intent. Elite ⚡: 60%. Boss: 80% but pattern changes in phase 2!</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">🗡️ WEAPONS</div>
      <div class="rules-weapons-list">${weaponRows}</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">💎 RELICS</div>
      <div class="rules-text">After clearing Stage 1 and Stage 3, pick <span class="hl">1 of 3 relics</span>. Relics last for this run only. Common / Rare / Epic — rarity affects power.</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">⚡ ULTIMATE</div>
      <div class="rules-text">Gain <span class="hl">+20 Energy/round</span>. At 100 energy, activate your Ultimate before confirming a move.</div>
    </div>
  </div>`
}

// ─── BATTLE UI UPDATER ───────────────────────────────
export function updateBattleUI(runState, monsterState) {
  const hp1 = document.getElementById('hp1bar')
  const hp2 = document.getElementById('hp2bar')
  const hp1num = document.getElementById('hp1num')
  const hp2num = document.getElementById('hp2num')

  const hpPct1 = Math.round((runState.hp / runState.maxHp) * 100)
  const hpPct2 = Math.round((monsterState.hp / monsterState.maxHp) * 100)

  if (hp1) { hp1.style.width = hpPct1 + '%'; hp1.className = 'hp-fill ' + getHpColor(runState.hp, runState.maxHp) }
  if (hp2) { hp2.style.width = hpPct2 + '%'; hp2.className = 'hp-fill ' + getHpColor(monsterState.hp, monsterState.maxHp) }
  if (hp1num) hp1num.textContent = runState.hp
  if (hp2num) hp2num.textContent = monsterState.hp

  // Energy segs
  document.querySelectorAll('.energy-seg').forEach((seg, i) => {
    seg.classList.toggle('filled', runState.energy >= (i+1)*25)
  })

  // Momentum
  const mval = document.getElementById('momentumVal')
  if (mval) mval.textContent = '+' + (runState.momentumDmg || 0)

  // Ult badge
  const badge = document.getElementById('ultActiveBadge')
  const w1 = WEAPONS[runState.weapon] || WEAPONS.sword
  if (badge) {
    if (runState.ultActive > 0) {
      badge.textContent = `${w1.ultimate.name} ×${runState.ultActive}`
      badge.style.display = 'block'
    } else {
      badge.style.display = 'none'
    }
  }

  // Ult button
  const ultBtn = document.getElementById('btnUlt')
  if (ultBtn && !runState.ultimateQueued) {
    const ready = canUseUltimate(runState)
    ultBtn.className = 'btn-ult ' + (ready ? 'ready' : 'locked')
    ultBtn.textContent = ready ? `⚡ ${w1.ultimate.name}` : `🔒 ${w1.ultimate.name}`
  }
}

// ─── DAMAGE FLOAT ────────────────────────────────────
export function showDamageFloat(amount, isHeal = false) {
  const zone = document.getElementById('charsZone')
  if (!zone) return
  const el = document.createElement('div')
  el.className = 'dmg-pop' + (isHeal ? ' heal' : '')
  el.textContent = isHeal ? `+${amount}` : `-${amount}`
  el.style.left = (20 + Math.random() * 60) + '%'
  zone.appendChild(el)
  setTimeout(() => el.remove(), 900)
}

export function showCritFloat() {
  const zone = document.getElementById('charsZone')
  if (!zone) return
  const el = document.createElement('div')
  el.className = 'dmg-pop crit'
  el.textContent = '💥 CRIT!'
  el.style.left = (15 + Math.random() * 70) + '%'
  zone.appendChild(el)
  setTimeout(() => el.remove(), 900)
}

// ─── INTENT BUBBLE ───────────────────────────────────
export function showIntentBubble(intent, isImmune = false) {
  const el = document.getElementById('intentMove')
  if (!el) return
  const labels = { slash: '⚔ Slash', guard: '🛡 Guard', counter: '⚡ Counter', mirror: '🪞 Mirror' }
  el.textContent = isImmune ? '🔮 IMMUNE' : (labels[intent] || '❓ ???')
  el.style.color = isImmune ? '#a040ff' : intent === 'counter' ? '#e24b4a' : '#f0c060'
}

// ─── ANIMATIONS ──────────────────────────────────────
export function playAttackAnim(attackerEl, defenderEl) {
  if (!attackerEl || !defenderEl) return
  attackerEl.classList.remove('idle','anim-slash','anim-hit','anim-guard')
  defenderEl.classList.remove('idle','anim-slash','anim-hit','anim-guard')
  attackerEl.classList.add('anim-slash')
  defenderEl.classList.add('anim-hit')
  setTimeout(() => {
    attackerEl.classList.remove('anim-slash'); attackerEl.classList.add('idle')
    defenderEl.classList.remove('anim-hit');   defenderEl.classList.add('idle')
  }, 600)
}

export function playGuardAnim(el) {
  if (!el) return
  el.classList.remove('idle','anim-guard')
  el.classList.add('anim-guard')
  setTimeout(() => { el.classList.remove('anim-guard'); el.classList.add('idle') }, 500)
}

export function setCharImage(charId, src) {
  const img = document.getElementById(charId)
  if (img && src) img.src = src
}

// ─── RELIC BAR ───────────────────────────────────────
export function renderRelicBar(relics) {
  const bar = document.getElementById('relicsBar')
  if (!bar) return
  bar.innerHTML = relics.length > 0
    ? relics.map(id => {
        const r = RELICS[id]
        return r ? `<span class="relic-mini rarity-${r.rarity}" title="${r.name}: ${r.desc}">${r.icon}</span>` : ''
      }).join('')
    : '<span style="font-size:9px;color:#3a2008">No relics</span>'
}

// ─── WEEKLY COUNTDOWN ────────────────────────────────
export function startWeeklyCountdown(elementId) {
  function update() {
    const el = document.getElementById(elementId)
    if (el) el.textContent = getWeeklyCountdown()
  }
  update()
  return setInterval(update, 30000)
}