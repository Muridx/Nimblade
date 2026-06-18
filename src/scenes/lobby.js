import { mountScene } from "./sceneManager.js";
import { seed as rngSeed, getSeed as rngGetSeed } from "../data/rng.js";
import { getState, setState } from "../state/store.js";
import { generateMap } from "../data/mapGen.js";
import { connectWallet, isConnected, getAddress } from "../data/wallet.js";
import { purchaseForgeNode, fetchForgeState, fetchBalances } from "../data/economy.js";
import { FORGE_NODES } from "../state/store.js";
import {
  forgeMaxHpBonus,
  forgeStartGoldBonus,
  forgeStartEnergyBonus,
  forgeStarterRelicId,
  forgeLuckStarterCommonId,
  forgeLuckStarterRareId,
  forgeReviveEnabled,
  FORGE_REVIVE_HP,
  describeRunInitEffects,
} from "../data/forgeEffects.js";
import { acquireRelic } from "../data/relicEffects.js";
import {
  ASCENSION_LEVELS,
  ascensionMaxHpPenalty,
  describeAscensionRunEffects,
  clampAsc,
} from "../data/ascensionEffects.js";
import { fetchTopRuns, getDisplayName, setDisplayName } from "../data/leaderboard.js";
import { isSupabaseReady } from "../data/supabase.js";
import {
  fetchDailyStatus,
  claimDaily,
  DAILY_REWARDS,
  DAILY_CYCLE_TOTAL,
  rewardForDay,
} from "../data/dailyLogin.js";

// 2.7e P0: Nimiq Pay wallet now wired via @nimiq/mini-app-sdk.
// `Connect Wallet` button calls connectWallet() which init()s the SDK,
// listAccounts(), and writes the address to state.meta.wallet. Outside the
// Nimiq Pay host (e.g. plain browser preview) it returns a friendly error
// and the player can still use DEMO mode to play CH1 without a wallet.
//
// M3 (meta header): top bar now shows three meta chips alongside the wallet
// button -- SHARDS (count), FORGE (opens upgrade tree), and ASCENSION
// (run difficulty selector, M6).
//
// M4 (forge modal): clicking SHARDS chip or FORGE button opens the upgrade
// tree -- 4 branches x 5 tiers, prereq chain T1->T2->T3->T4->T5. Costs: 40/100/200/400/800 (survival_t5: 1600).
// Selection is two-tap (tap card -> PURCHASE button) to prevent misclick on
// mobile. Once unlocked, nodes show GET emerald check. Effects engine that
// reads meta.forge during run-init lands in M5.

let connecting = false;
// M4: forge modal local UI state.
//   forgeOpen          -> modal visible?
//   forgeSelectedKey   -> which node card is currently highlighted (detail
//                         panel shown, PURCHASE button enabled). null = no
//                         selection (detail panel shows hint text).
let forgeOpen = false;
let forgeSelectedKey = null;

// M6: ascension picker modal state.
//   ascOpen     -> modal visible
//   ascSelected -> hovered/tapped level (0..5), null = none
let ascOpen = false;
let ascSelected = null;

// M8: leaderboard modal state.
let lbOpen = false;
let lbRows = null;     // null = loading, [] = empty, [...] = loaded
let lbError = null;

// P3b: Daily Login modal + claim state.
//   dailyOpen          -> modal visible
//   dailyStatus        -> last RPC payload from daily_status (or null = not loaded)
//   dailyClaiming      -> true while claim RPC in flight (disables button)
//   dailyClaimResult   -> last claim_daily payload to show in modal
//                         (e.g. "+3 SHARDS" celebration line)
//   dailyAutoShownFor  -> wallet address we already auto-popped modal for, so
//                         we don't keep re-opening on every render
let dailyOpen = false;
let dailyStatus = null;
let dailyClaiming = false;
let dailyClaimResult = null;
let dailyAutoShownFor = null;

// P3d: How to Play modal. Pure-static tutorial content -> only needs a
// visible flag. Reset on scene mount like the other modals.
let howtoOpen = false;

// B (onboarding): first-run name-entry screen. Shown ONCE, the very first
// time a player lands in the lobby on this device. After they confirm/skip we
// set the onboarded flag and auto-open How to Play once so the core duel rules
// are guaranteed to be seen even by a cold player who'd never tap the card.
let namePromptOpen = false;
const LS_ONBOARDED_KEY = "nbl_onboarded_v1";
function isOnboarded() {
  try { return localStorage.getItem(LS_ONBOARDED_KEY) === "1"; }
  catch (_) { return true; } // storage blocked -> don't nag every load
}
function setOnboarded() {
  try { localStorage.setItem(LS_ONBOARDED_KEY, "1"); } catch (_) {}
}

// M4: branch metadata for forge modal layout. Ordered left->right.
const FORGE_BRANCHES = [
  { key: "survival",  icon: "\u2764\ufe0f", label: "SURVIVAL"  },
  { key: "economy",   icon: "\ud83d\udcb0", label: "ECONOMY"   },
  { key: "combat",    icon: "\u2694\ufe0f", label: "COMBAT"    },
  { key: "luck",      icon: "\ud83c\udf40",     label: "LUCK"      },
];

export function lobbyScene(root) {
  forgeOpen = false;
  forgeSelectedKey = null;
  ascOpen = false;
  ascSelected = null;
  lbOpen = false;
  lbRows = null;
  lbError = null;
  // P3b: reset daily modal state per scene mount, BUT keep dailyAutoShownFor
  // across re-mounts (player returning to lobby after a run shouldn't get
  // the auto-popup again if they already saw it once today).
  dailyOpen = false;
  dailyClaiming = false;
  dailyClaimResult = null;
  howtoOpen = false;
  // B (onboarding): very first lobby visit on this device -> pop the name
  // prompt. Everything else (auto-opening How to Play) is chained from the
  // prompt's confirm/skip handlers.
  namePromptOpen = !isOnboarded();
  render(root);

  // Sync server state on mount if wallet already connected.
  if (isConnected()) {
    const addr = getAddress();
    if (addr) {
      fetchBalances(addr).catch(() => {});
      fetchForgeState(addr).then(() => render(root)).catch(() => {});
    }
  }

  // Fire-and-forget daily status refresh if wallet connected. Triggers a
  // re-render to show the "!" badge + auto-popup the modal once per day.
  refreshDailyStatus(root, { allowAutoPopup: true });

  const onClick = async (e) => {
    const target = e.target.closest("[data-action]");
    const action = target && target.dataset.action;
    if (!action) return;

    if (action === "wallet") {
      if (connecting) return;
      const wallet = getState().meta.wallet;
      if (wallet) {
        if (confirm(`Disconnect wallet ${shortAddr(wallet.address)}?`)) {
          const meta = getState().meta || {};
          setState({ meta: { ...meta, wallet: null } });
          // P3b: wallet disconnect -> hide daily badge + clear cached status.
          dailyStatus = null;
          dailyAutoShownFor = null;
          render(root);
        }
        return;
      }
      connecting = true;
      setBtnText(root, "Connecting...");
      const res = await connectWallet();
      connecting = false;
      if (res.ok) {
        // Sync server state: balances + forge ownership
        const addr = getAddress();
        if (addr) {
          fetchBalances(addr).catch(() => {});
          fetchForgeState(addr).then(() => render(root)).catch(() => {});
        }
        render(root);
        // P3b: fresh wallet -> fetch daily status so badge + auto-popup work
        // immediately without waiting for a scene re-mount.
        refreshDailyStatus(root, { allowAutoPopup: true });
      } else {
        alert(res.error || "Wallet connect failed.");
        render(root);
      }
      return;
    }
    if (action === "start-run") {
      if (!getState().meta.wallet) {
        alert("Connect your Nimiq wallet to start a full run, or try DEMO mode.");
        return;
      }
      setState({ run: freshRun("full") });
      mountScene("weaponSelect", root);
      return;
    }
    if (action === "try-demo") {
      setState({ run: freshRun("demo") });
      mountScene("weaponSelect", root);
      return;
    }
    // Weekly Gauntlet: dedicated scene (tournament + leaderboard).
    if (action === "open-gauntlet") {
      mountScene("gauntlet", root);
      return;
    }
    // Exchange: dedicated scene (buy gems, convert shards, cash out NIM).
    if (action === "open-exchange") {
      mountScene("exchange", root);
      return;
    }
    // M4: open forge modal (real upgrade tree, no more stub).
    if (action === "open-forge") {
      forgeOpen = true;
      forgeSelectedKey = null;
      render(root);
      return;
    }
    // M4: forge node tap -> select (highlight + show desc + enable purchase if affordable).
    if (action === "forge-select") {
      const key = target.dataset.key;
      forgeSelectedKey = (forgeSelectedKey === key) ? null : key;
      render(root);
      return;
    }
    // M4: purchase confirm -- server-validated forge purchase via RPC.
    if (action === "forge-buy") {
      const meta = getState().meta || {};
      const node = FORGE_NODES.find((n) => n.key === forgeSelectedKey);
      if (!node) return;
      const status = nodeStatus(node, meta);
      if (status !== "affordable") return;
      if (!isConnected()) {
        showToast(root, "🔒 WALLET REQUIRED", "Connect your wallet to purchase forge upgrades.");
        return;
      }

      // Disable button during server call
      const btn = root.querySelector('[data-action="forge-buy"]');
      if (btn) { btn.disabled = true; btn.textContent = "⏳ PURCHASING..."; }

      (async () => {
        const walletAddr = getAddress();
        const res = await purchaseForgeNode(walletAddr, node.key);
        if (res.ok) {
          // Server deducted shards + recorded ownership. Update local state.
          const freshMeta = getState().meta || {};
          const newForge = { ...(freshMeta.forge || {}), [node.key]: true };
          const newShards = Math.max(0, (Number(freshMeta.shards) || 0) - node.cost);
          setState({ meta: { ...freshMeta, shards: newShards, forge: newForge } });
        } else {
          const errMsg = res.error === "insufficient_shards"
            ? `Not enough shards (have ${res.have}, need ${res.need}).`
            : res.error === "prereq_not_met"
            ? `Unlock ${res.need} first.`
            : res.error === "already_owned"
            ? "Already owned!"
            : res.error || "Purchase failed.";
          showToast(root, "❌ FORGE ERROR", errMsg);
        }
        render(root);
      })();
      return;
    }
    // M4: close forge modal (X button or backdrop).
    if (action === "forge-close") {
      forgeOpen = false;
      forgeSelectedKey = null;
      render(root);
      return;
    }
    if (action === "forge-stop") {
      return; // swallow clicks inside modal card
    }
    // M6: Ascension picker. Opens a modal listing levels 0-5 with the
    // cumulative effects each adds + shard multiplier. Selected level is
    // saved to meta.ascension and consumed by freshRun() / battle.js /
    // mapGen.js on the very next run.
    if (action === "open-ascension") {
      const meta = getState().meta || {};
      if (!meta.ch1Cleared) {
        showToast(root, "\uD83D\uDD12 ASCENSION locked", "Beat the Goblin King (CH1 boss) once to unlock harder runs with bonus shard payouts.");
        return;
      }
      ascOpen = true;
      ascSelected = clampAsc(meta.ascension);
      render(root);
      return;
    }
    if (action === "asc-select") {
      const lvl = clampAsc(parseInt(target.dataset.level, 10));
      ascSelected = lvl;
      // Preserve scroll position of the asc list across re-render so tapping
      // a card near the bottom doesn't yank the user back to the top.
      const prevScroll = root.querySelector(".asc__list")?.scrollTop ?? 0;
      render(root);
      const newList = root.querySelector(".asc__list");
      if (newList) newList.scrollTop = prevScroll;
      return;
    }
    if (action === "asc-confirm") {
      const lvl = clampAsc(ascSelected);
      const cur = getState().meta || {};
      setState({ meta: { ...cur, ascension: lvl } });
      ascOpen = false;
      ascSelected = null;
      render(root);
      showToast(
        root,
        lvl === 0 ? "Ascension reset" : `\uD83C\uDF1F ASCENSION ${lvl}/5 locked`,
        lvl === 0
          ? "Next run plays at standard difficulty."
          : `Next run starts at Ascension ${lvl}. Shard payout x${ASCENSION_LEVELS[lvl].shardMult.toFixed(2)}.`
      );
      return;
    }
    if (action === "asc-close") {
      ascOpen = false;
      ascSelected = null;
      render(root);
      return;
    }
    if (action === "asc-stop") {
      return; // swallow clicks inside the modal card
    }

    // M8: Leaderboard modal handlers.
    if (action === "open-leaderboard") {
      lbOpen = true;
      lbRows = null;
      lbError = null;
      render(root);
      // Kick off fetch; re-render when it lands.
      fetchTopRuns(10).then((rows) => {
        lbRows = rows;
        if (!isSupabaseReady()) lbError = "Leaderboard not configured (env vars missing).";
        if (lbOpen) render(root);
      }).catch((e) => {
        lbRows = [];
        lbError = String(e && e.message || e);
        if (lbOpen) render(root);
      });
      return;
    }
    if (action === "lb-close") {
      lbOpen = false;
      render(root);
      return;
    }
    if (action === "lb-stop") {
      return; // swallow clicks inside modal card
    }
    if (action === "lb-save-name") {
      const input = root.querySelector(".lb__name-input");
      const newName = input ? input.value : "";
      const saved = setDisplayName(newName);
      showToast(root, "Name saved", saved ? `Display name: <strong>${escapeHTML(saved)}</strong>` : "Display name cleared (will show as Anonymous).");
      render(root);
      return;
    }
    // P3b: Daily Login modal handlers.
    //   open-daily   -> open modal. If status not loaded yet, kick fetch.
    //   close-daily  -> close modal.
    //   daily-stop   -> swallow inside-card clicks (backdrop dismiss).
    //   claim-daily  -> call server claim_daily(wallet), credit shards on ok.
    if (action === "open-daily") {
      const meta = getState().meta || {};
      if (!meta.wallet) {
        // Manual badge tap with no wallet -> friendly nudge instead of modal.
        showToast(root, "\ud83d\udd17 Connect wallet first", "Daily login rewards are wallet-only. Tap CONNECT in the top-right, then come back here to claim your daily shards.");
        return;
      }
      dailyOpen = true;
      dailyClaimResult = null;
      render(root);
      // If status missing or stale, refresh in background.
      if (!dailyStatus) refreshDailyStatus(root, { allowAutoPopup: false });
      return;
    }
    if (action === "close-daily") {
      dailyOpen = false;
      dailyClaimResult = null;
      render(root);
      return;
    }
    if (action === "daily-stop") {
      return; // swallow clicks inside card
    }
    if (action === "claim-daily") {
      const meta = getState().meta || {};
      if (!meta.wallet) {
        showToast(root, "\ud83d\udd17 Wallet required", "Connect your wallet first to claim daily rewards.");
        return;
      }
      if (dailyClaiming) return;
      if (dailyStatus && dailyStatus.can_claim === false) return;
      dailyClaiming = true;
      render(root);
      const res = await claimDaily(meta.wallet.address);
      dailyClaiming = false;
      if (res.ok) {
        // Credit shards to local meta and refresh status from server.
        const fresh = getState().meta || {};
        const shardsNow = (Number(fresh.shards) || 0) + (Number(res.shards_earned) || 0);
        setState({ meta: { ...fresh, shards: shardsNow } });
        dailyClaimResult = res;
        await refreshDailyStatus(root, { allowAutoPopup: false });
        render(root);
      } else {
        // Server says no -- typical case: already claimed (e.g. another device
        // claimed earlier today). Reflect that state and re-fetch status.
        dailyClaimResult = res;
        await refreshDailyStatus(root, { allowAutoPopup: false });
        render(root);
      }
      return;
    }

    if (action === "toast-close") {
      const t = root.querySelector(".lobby__toast");
      if (t) t.remove();
      return;
    }
    if (action === "toast-stop") return;

    // P3a: settings card stub. Full settings modal (display name, audio,
    // reset progress, about) ships in P3c. For now show a toast so the
    // card is wired and tap target works.
    if (action === "open-settings") {
      showToast(root, "\u2699\ufe0f SETTINGS", "Display name lives inside LEADERBOARD for now. Audio toggle + reset progress + about screen ship in the next polish pass (P3c).");
      return;
    }

    // P3d: How to Play modal handlers.
    //   open-howto  -> show tutorial overlay
    //   howto-close -> X button or backdrop tap dismisses
    //   howto-stop  -> swallow taps inside the card (so backdrop dismiss works)
    if (action === "open-howto") {
      howtoOpen = true;
      render(root);
      return;
    }
    if (action === "howto-close") {
      howtoOpen = false;
      render(root);
      return;
    }
    if (action === "howto-stop") {
      return; // swallow clicks inside the modal card
    }

    // B (onboarding): first-run name prompt handlers.
    //   onb-save-name -> save the typed name, mark onboarded, auto-open guide.
    //   onb-skip      -> skip naming (stays Anonymous) but still see the guide.
    //   onb-stop      -> swallow taps inside the card.
    // Note: the onboarding overlay has NO backdrop dismiss action on purpose,
    // so a cold player must make a choice and can't accidentally skip the
    // guide by tapping outside.
    if (action === "onb-save-name") {
      const input = root.querySelector(".onb__name-input");
      const newName = input ? input.value : "";
      setDisplayName(newName);
      setOnboarded();
      namePromptOpen = false;
      howtoOpen = true; // chain straight into the tutorial, shown once
      render(root);
      return;
    }
    if (action === "onb-skip") {
      setOnboarded();
      namePromptOpen = false;
      howtoOpen = true;
      render(root);
      return;
    }
    if (action === "onb-stop") {
      return; // swallow clicks inside the onboarding card
    }
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/**
 * M4: compute forge-node state given current meta.
 *   "owned"        -> player has already bought it
 *   "locked"       -> prereq tier in same branch not owned yet
 *   "affordable"   -> prereq met, not owned, shards >= cost
 *   "unaffordable" -> prereq met, not owned, shards < cost
 */
function nodeStatus(node, meta) {
  const forge = meta.forge || {};
  const shards = Number(meta.shards) || 0;
  if (forge[node.key]) return "owned";
  if (node.tier > 1) {
    const prereqKey = `${node.branch}_t${node.tier - 1}`;
    if (!forge[prereqKey]) return "locked";
  }
  return shards >= node.cost ? "affordable" : "unaffordable";
}

function render(root) {
  const meta = getState().meta || {};
  const wallet = meta.wallet;
  const walletLabel = wallet ? shortAddr(wallet.address) : "CONNECT";
  const walletIcon = wallet ? "\u26d3" : "\u26d3"; // chain link icon both states

  const shards = Number(meta.shards) || 0;
  const shardsDisplay = shards.toLocaleString("en-US");
  const ch1Cleared = !!meta.ch1Cleared;
  const ascLevel = clampAsc(meta.ascension);

  // P3a: ASCENSION card sub-text + accent state.
  //   - Not unlocked: "\ud83d\udd12 Locked" + dimmed card
  //   - Standard (lvl 0): "Standard"
  //   - Lvl 1-5: "Tier N \u00b7 xMULT" with gold accent border
  let ascSub, ascChipClass;
  if (!ch1Cleared) {
    ascSub = "\ud83d\udd12 Locked";
    ascChipClass = "lobby__chip lobby__chip--locked";
  } else if (ascLevel === 0) {
    ascSub = "Standard";
    ascChipClass = "lobby__chip";
  } else {
    const mult = ASCENSION_LEVELS[ascLevel].shardMult.toFixed(2);
    ascSub = `Tier ${ascLevel} \u00b7 x${mult}`;
    ascChipClass = "lobby__chip lobby__chip--accent";
  }

  // M4: forge modal HTML appended at end of lobby (covers screen when forgeOpen).
  const forgeModalHTML = forgeOpen ? renderForgeModalHTML(meta) : "";
  // M6: ascension picker modal -- same overlay pattern as forge.
  const ascModalHTML = ascOpen ? renderAscensionModalHTML(meta) : "";
  // M8: leaderboard modal.
  const lbModalHTML = lbOpen ? renderLeaderboardModalHTML() : "";
  // P3b: daily login modal.
  const dailyModalHTML = dailyOpen ? renderDailyModalHTML(meta) : "";
  // P3d: How to Play overlay -- static tutorial, no data deps.
  const howtoModalHTML = howtoOpen ? renderHowToModalHTML() : "";
  // B (onboarding): first-run name prompt -- injected last so it sits on top.
  const namePromptHTML = namePromptOpen ? renderNamePromptHTML() : "";

  // P3b: daily login pill. Sits between SHARDS and WALLET in the top bar.
  //   - Wallet not connected -> hidden entirely (no point teasing).
  //   - Wallet connected, status loading -> show gift icon, no badge.
  //   - Wallet connected, can_claim -> show gift icon + red "!" badge dot.
  //   - Wallet connected, already claimed today -> show gift icon dimmed.
  let dailyPillHTML = "";
  if (wallet) {
    const canClaim = !!(dailyStatus && dailyStatus.can_claim);
    const pillClass = canClaim
      ? "lobby__daily lobby__daily--ready"
      : "lobby__daily";
    const badgeHTML = canClaim ? `<span class="lobby__daily-badge">!</span>` : "";
    const ariaLabel = canClaim ? "Daily reward ready to claim" : "Daily login";
    dailyPillHTML = `
      <div class="${pillClass}" role="button" tabindex="0" data-action="open-daily" aria-label="${ariaLabel}">
        <span class="lobby__daily-icon">\ud83c\udf81</span>
        ${badgeHTML}
      </div>
    `;
  }

  // P3a: PREMIUM LOBBY V3 LAYOUT
  //   - Top bar: SHARDS pill (left, gold-tinted glass) + WALLET pill (right)
  //   - Title block: PNG logo (300x110, glow) + tagline "A ROGUELITE DUEL"
  //   - 2x2 menu grid: FORGE / ASCENSION / LEADERBOARD / SETTINGS
  //     (full labels, icon + label + sub-text per card, glassmorphism)
  //   - CTA stack at bottom: START RUN (premium gold) + TRY DEMO (ghost glass)
  //     + demo hint
  // All chip clutter from M3 is gone; menu lives in cards instead.
  // Ambient ember particles drifting up over the tavern scene (decorative).
  let emberHTML = "";
  for (let i = 0; i < 14; i++) {
    const left = (Math.random() * 100).toFixed(2);
    const dur = (5 + Math.random() * 5).toFixed(2);
    const delay = (-Math.random() * 8).toFixed(2);
    const size = (2 + Math.random() * 2).toFixed(2);
    emberHTML += `<i class="ember" style="left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s"></i>`;
  }

  root.innerHTML = `
    <div class="lobby">
      <div class="lobby__embers" aria-hidden="true">${emberHTML}</div>
      <div class="lobby__top">
        <div class="lobby__shards" role="button" tabindex="0" data-action="open-forge" aria-label="Shards (${shards})">
          <div class="lobby__shards-icon">\ud83d\udc8e</div>
          <div class="lobby__shards-text">
            <div class="lobby__shards-val">${shardsDisplay}</div>
            <div class="lobby__shards-label">SHARDS</div>
          </div>
        </div>
        <div class="lobby__top-right">
          ${dailyPillHTML}
          <button class="lobby__wallet" data-action="wallet" aria-label="${wallet ? 'Wallet ' + escapeHTML(walletLabel) : 'Connect Wallet'}">
            <span class="lobby__wallet-icon">${walletIcon}</span>
            <span class="lobby__wallet-label">${escapeHTML(walletLabel)}</span>
          </button>
        </div>
      </div>

      <div class="lobby__titleblock">
        <div class="lobby__logo" role="img" aria-label="NIMBLADE"></div>
        <div class="lobby__tagline">A Roguelite Duel</div>
      </div>

      <div class="lobby__bottom">
        <div class="lobby__chips">
          <div class="lobby__chip" role="button" tabindex="0" data-action="open-forge" aria-label="Forge">
            <div class="lobby__chip-icon">\u2692\ufe0f</div>
            <div class="lobby__chip-label">FORGE</div>
          </div>
          <div class="${ascChipClass}" role="button" tabindex="0" data-action="open-ascension" aria-label="Ascension (${ascSub})">
            <div class="lobby__chip-icon">\ud83c\udf1f</div>
            <div class="lobby__chip-label">ASCEND</div>
          </div>
          <div class="lobby__chip" role="button" tabindex="0" data-action="open-leaderboard" aria-label="Leaderboard">
            <div class="lobby__chip-icon">\ud83c\udfc6</div>
            <div class="lobby__chip-label">RANKS</div>
          </div>
          <div class="lobby__chip" role="button" tabindex="0" data-action="open-settings" aria-label="Settings">
            <div class="lobby__chip-icon">\u2699\ufe0f</div>
            <div class="lobby__chip-label">SETTINGS</div>
          </div>
        </div>

        <div class="lobby__howto-row">
          <div class="lobby__howto lobby__howto--half" role="button" tabindex="0" data-action="open-howto">
            <span class="lobby__howto-icon">\ud83d\udcd6</span>
            <div class="lobby__howto-text">
              <div class="lobby__howto-title">HOW TO PLAY</div>
              <div class="lobby__howto-sub">Learn the duel</div>
            </div>
          </div>
          <div class="lobby__howto lobby__howto--half lobby__howto--exchange" role="button" tabindex="0" data-action="open-exchange">
            <span class="lobby__howto-icon">\ud83d\udc8e</span>
            <div class="lobby__howto-text">
              <div class="lobby__howto-title">EXCHANGE</div>
              <div class="lobby__howto-sub">Shards \u00b7 Gems \u00b7 NIM</div>
            </div>
          </div>
        </div>

        <div class="lobby__cta">
          <button class="lobby__btn-start" data-action="start-run">
            <span class="cta__label">START RUN</span>
            <span class="cta__sub">Full run \u00b7 all chapters</span>
          </button>
          <div class="lobby__cta-row">
            <button class="lobby__btn-demo" data-action="try-demo">
              <span class="cta__label">TRY DEMO</span>
              <span class="cta__sub">Chapter 1 \u00b7 no wallet</span>
            </button>
            <button class="lobby__btn-gauntlet" data-action="open-gauntlet">
              <span class="cta__label">\u2694\ufe0f GAUNTLET</span>
              <span class="cta__sub">Weekly \u00b7 NIM entry</span>
            </button>
          </div>
        </div>
      </div>

      ${forgeModalHTML}
      ${ascModalHTML}
      ${lbModalHTML}
      ${dailyModalHTML}
      ${howtoModalHTML}
      ${namePromptHTML}
    </div>
  `;
}

/**
 * B (onboarding): first-run name-entry overlay. Shown once on the very first
 * lobby visit. Reuses the forge overlay/card scaffolding to keep CSS small.
 * Deliberately has NO backdrop dismiss so the player makes a choice; both
 * buttons chain into the How to Play guide via their handlers.
 */
function renderNamePromptHTML() {
  const name = getDisplayName();
  return `
    <div class="lobby__toast forge__overlay">
      <div class="forge__card onb__card" data-action="onb-stop">
        <div class="onb__logo" role="img" aria-label="NIMBLADE"></div>
        <div class="onb__welcome">Welcome, duelist</div>
        <p class="onb__lead">Before you climb, what should the leaderboard call you?</p>
        <input class="onb__name-input" type="text" maxlength="24" placeholder="Your name" value="${escapeHTML(name)}" />
        <button class="btn btn--primary onb__go" data-action="onb-save-name">LET'S GO \u2694\ufe0f</button>
        <button class="btn onb__skip" data-action="onb-skip">Skip for now</button>
      </div>
    </div>
  `;
}

// P3b: helper -- fetch latest daily_status for the connected wallet and
// re-render the lobby. If allowAutoPopup is true AND can_claim AND we
// haven't already auto-opened for this wallet this scene-lifetime, open
// the modal automatically so the player knows free shards are waiting.
async function refreshDailyStatus(root, { allowAutoPopup = false } = {}) {
  const meta = getState().meta || {};
  const wallet = meta.wallet;
  if (!wallet) {
    dailyStatus = null;
    return;
  }
  const status = await fetchDailyStatus(wallet.address);
  dailyStatus = status;
  if (allowAutoPopup
      && status && status.ok && status.can_claim
      && dailyAutoShownFor !== wallet.address
      && !dailyOpen) {
    dailyAutoShownFor = wallet.address;
    dailyOpen = true;
  }
  render(root);
}

/**
 * P3b: Render the Daily Login claim modal.
 *
 * Layout (mobile-first, 360px target):
 *   - Header: "\ud83c\udf1f DAILY LOGIN" + close X
 *   - Streak strip: "\ud83d\udd25 Day N streak" + total earned
 *   - 7-day grid (2 rows x 4 cols on narrow, all in a row if it fits):
 *     each cell shows Day label, shard reward, status icon
 *     (\u2705 claimed, \ud83d\udcaa TODAY, \ud83d\udd12 future)
 *   - Big CLAIM button OR "Already claimed today" state
 *   - Hint line: "Miss a day -> streak resets to Day 1"
 *   - Footer note: "Server-verified, one claim per UTC day"
 */
function renderDailyModalHTML(meta) {
  const wallet = meta.wallet;
  const status = dailyStatus;
  const claimResult = dailyClaimResult;

  // Compute the day to spotlight + which days are claimed/today/future.
  // Server only tracks current_streak (the last day claimed). We project a
  // 7-day strip showing the CURRENT cycle: days 1..7 with claimed/today
  // markers derived from current_streak + can_claim + streak_alive.
  const currentStreak = (status && Number(status.current_streak)) || 0;
  const canClaim = !!(status && status.can_claim);
  const streakAlive = !!(status && status.streak_alive);
  const nextDay = (status && Number(status.next_day)) || 1;
  const totalEarned = currentStreak > 0
    ? DAILY_REWARDS.slice(1, Math.min(currentStreak, 7) + 1).reduce((a, b) => a + b, 0)
    : 0;

  // Decide grid status per slot.
  //   - If canClaim:
  //       days 1..(nextDay-1) -> claimed (\u2705) IF streakAlive, else future
  //       day nextDay         -> TODAY (\ud83d\udcaa) -- highlighted
  //       days nextDay+1..7   -> future (\ud83d\udd12)
  //   - If !canClaim (already claimed today):
  //       days 1..currentStreak -> claimed (\u2705)
  //       days currentStreak+1..7 -> future (\ud83d\udd12)
  function slotState(day) {
    if (canClaim) {
      if (streakAlive && day < nextDay) return "claimed";
      if (day === nextDay) return "today";
      return "future";
    }
    if (day <= currentStreak) return "claimed";
    return "future";
  }

  const gridCells = [];
  for (let d = 1; d <= 7; d++) {
    const reward = DAILY_REWARDS[d];
    const isJackpot = d === 7;
    const st = slotState(d);
    let cellClass = "daily__day";
    let icon = "\ud83d\udd12";
    if (st === "claimed") { cellClass += " daily__day--claimed"; icon = "\u2705"; }
    else if (st === "today") { cellClass += " daily__day--today"; icon = "\ud83d\udcaa"; }
    if (isJackpot) cellClass += " daily__day--jackpot";
    gridCells.push(`
      <div class="${cellClass}">
        <div class="daily__day-label">Day ${d}</div>
        <div class="daily__day-reward">${reward}<span class="daily__gem">\ud83d\udc8e</span></div>
        <div class="daily__day-state">${icon}</div>
      </div>
    `);
  }

  // CTA / status line below the grid.
  let ctaHTML = "";
  if (!wallet) {
    ctaHTML = `
      <div class="daily__nowallet">
        <div class="daily__nowallet-text">Connect your wallet to claim daily shards.</div>
        <button class="btn btn--primary daily__connect" data-action="wallet">CONNECT WALLET</button>
      </div>
    `;
  } else if (!status) {
    ctaHTML = `<div class="daily__status">Loading...</div>`;
  } else if (canClaim) {
    const reward = rewardForDay(nextDay);
    const dayLabel = (currentStreak === 0 || !streakAlive)
      ? `Start a new streak today \u2192 +${reward} shard`
      : `Day ${nextDay} streak reward \u2192 +${reward} shard`;
    ctaHTML = `
      <button class="btn btn--primary daily__claim ${dailyClaiming ? 'daily__claim--loading' : ''}"
              data-action="claim-daily"
              ${dailyClaiming ? 'disabled' : ''}>
        ${dailyClaiming ? "CLAIMING..." : `\u2728 CLAIM ${reward} SHARDS \u2728`}
      </button>
      <div class="daily__status-line">${escapeHTML(dayLabel)}</div>
    `;
  } else {
    ctaHTML = `
      <div class="daily__done">
        <div class="daily__done-title">\u2705 Already claimed today</div>
        <div class="daily__done-sub">Come back tomorrow for Day ${nextDay} (+${rewardForDay(nextDay)} shard).</div>
      </div>
    `;
  }

  // If we just succeeded with a claim, show a celebration line above the grid.
  let celebrationHTML = "";
  if (claimResult && claimResult.ok) {
    const earned = Number(claimResult.shards_earned) || 0;
    const dayJust = Number(claimResult.streak_day) || 1;
    const verb = claimResult.status === "reset"
      ? "Streak restarted"
      : claimResult.status === "first_claim"
        ? "Streak started"
        : "Streak continued";
    celebrationHTML = `
      <div class="daily__celebrate">
        <div class="daily__celebrate-title">+${earned} \ud83d\udc8e claimed!</div>
        <div class="daily__celebrate-sub">${verb} \u00b7 Day ${dayJust} of 7</div>
      </div>
    `;
  } else if (claimResult && !claimResult.ok && claimResult.error === "already_claimed") {
    celebrationHTML = `
      <div class="daily__celebrate daily__celebrate--info">
        <div class="daily__celebrate-title">Already claimed</div>
        <div class="daily__celebrate-sub">Another session beat you to it today. Streak is safe.</div>
      </div>
    `;
  }

  const streakHTML = currentStreak > 0
    ? `<div class="daily__streak">
         <span class="daily__streak-icon">\ud83d\udd25</span>
         <span class="daily__streak-text">Day ${currentStreak} streak</span>
         <span class="daily__streak-total">${totalEarned} \ud83d\udc8e this cycle</span>
       </div>`
    : `<div class="daily__streak daily__streak--zero">
         <span class="daily__streak-icon">\ud83c\udf31</span>
         <span class="daily__streak-text">No streak yet</span>
         <span class="daily__streak-total">${DAILY_CYCLE_TOTAL} \ud83d\udc8e per full week</span>
       </div>`;

  return `
    <div class="lobby__toast forge__overlay" data-action="close-daily">
      <div class="forge__card daily__card" data-action="daily-stop">
        <div class="forge__header">
          <div class="forge__title">\ud83c\udf1f DAILY LOGIN</div>
          <button class="forge__close" data-action="close-daily" aria-label="Close">\u00d7</button>
        </div>
        ${celebrationHTML}
        ${streakHTML}
        <div class="daily__grid">${gridCells.join("")}</div>
        ${ctaHTML}
        <div class="daily__hint">Miss a day \u2192 streak resets to Day 1.</div>
        <div class="daily__footer">Server-verified \u00b7 one claim per UTC day \u00b7 wallet-only.</div>
      </div>
    </div>
  `;
}

/**
 * P3d: Render the HOW TO PLAY modal. Pure-static onboarding tutorial -- the
 * single biggest new-player retention lever (sim showed skill >> ascension,
 * and the bluff "feels like luck" until a player learns it's pattern-based).
 * Reuses the forge__overlay / forge__card scaffolding (scrollable, max 90vh)
 * so the CSS surface stays tiny. Backdrop tap or X closes it.
 */
function renderHowToModalHTML() {
  return `
    <div class="lobby__toast forge__overlay" data-action="howto-close">
      <div class="forge__card htp__card" data-action="howto-stop">
        <div class="forge__header">
          <div class="forge__title">\ud83d\udcd6 HOW TO PLAY</div>
          <button class="forge__close" data-action="howto-close" aria-label="Close">\u00d7</button>
        </div>

        <div class="htp__body">
          <p class="htp__lead">NIMBLADE is a roguelite duel. Climb through 3 chapters of enemies, beat the boss at the end of each, and reach the top. You have one life per run \u2014 lose all your HP and the run ends. But you always keep your <strong>Shards</strong> to grow stronger for next time.</p>

          <div class="htp__h">\u2694\ufe0f The Duel \u2014 Rock, Paper, Scissors</div>
          <p>Every turn you and your enemy each pick one move. They clash like rock-paper-scissors:</p>
          <div class="htp__rps">
            <div class="htp__rps-row"><span>\u2694\ufe0f SLASH</span><span class="htp__beats">beats</span><span>\ud83c\udf00 COUNTER</span></div>
            <div class="htp__rps-row"><span>\ud83d\udee1\ufe0f GUARD</span><span class="htp__beats">beats</span><span>\u2694\ufe0f SLASH</span></div>
            <div class="htp__rps-row"><span>\ud83c\udf00 COUNTER</span><span class="htp__beats">beats</span><span>\ud83d\udee1\ufe0f GUARD</span></div>
          </div>
          <p>Same move = a draw, nobody takes damage. <strong>Win the clash and you deal damage; lose it and you take damage.</strong> It all comes down to out-guessing your opponent.</p>

          <div class="htp__h">\ud83d\udc41\ufe0f Reading Your Enemy</div>
          <p>Above the enemy you'll see its <strong>INTENT</strong> \u2014 the move it's hinting at. But beware: enemies <strong>bluff</strong>. A sneaky enemy shows a fake intent to bait you, and tougher enemies lie more often. Three ways to outplay them:</p>
          <ul class="htp__list">
            <li><strong>\ud83d\udd0e READ</strong> (costs 50 energy) \u2014 reveals the enemy's TRUE move this turn. No guessing.</li>
            <li><strong>Learn its LEAN</strong> \u2014 every enemy favours some moves more than others (a defensive foe guards a lot; a savage one slashes). It's not a fixed script \u2014 but over a fight you'll feel which way it leans and bet smarter. <em>This is the real skill of NIMBLADE.</em></li>
            <li><strong>Mind the streak</strong> \u2014 no enemy throws the same move three times in a row, so right after a double you can safely rule that move out.</li>
          </ul>

          <div class="htp__h">\ud83c\udf2b\ufe0f Veiled Foes</div>
          <p>Some enemies hide their hand. The <strong>Hooded Sister</strong> clouds her intent so each turn you only see <strong>two</strong> of the three moves she might throw (shown like <em>"\u2753 GUARD or SLASH?"</em>). You're never fully blind \u2014 against any two moves there's always a pick that <strong>can't lose</strong>, so play it safe or gamble on her lean for the win. A \ud83d\udd0e READ or a reveal relic pierces the veil completely.</p>

          <div class="htp__h">\u26a1 Energy, Skills &amp; Ultimate</div>
          <p>You gain 20 energy each turn (max 100). Spend it on:</p>
          <ul class="htp__list">
            <li><strong>READ</strong> (50) \u2014 see the true intent.</li>
            <li><strong>Weapon SKILL</strong> (30\u201340) \u2014 a special guaranteed move.</li>
            <li><strong>ULTIMATE</strong> (100) \u2014 your most powerful attack.</li>
          </ul>

          <div class="htp__h">\ud83d\udca1 Example 1 \u2014 a real turn</div>
          <div class="htp__ex">The enemy shows \ud83d\udee1\ufe0f GUARD. Your instinct might be to SLASH \u2014 but GUARD beats SLASH, so you'd lose! Instead you play \ud83c\udf00 COUNTER, because COUNTER beats GUARD. You win the clash and deal damage. If you're not sure the GUARD is honest, spend 50 energy on \ud83d\udd0e READ first to see the truth before you commit.</div>

          <div class="htp__h">\ud83d\udca1 Example 2 \u2014 playing the lean</div>
          <div class="htp__ex">You've noticed the Cave Troll loves to SLASH \u2014 it's thrown it most of the fight. This turn its INTENT shows \ud83d\udee1\ufe0f GUARD, but that smells like a bait. You trust its lean and play \ud83d\udee1\ufe0f GUARD yourself (GUARD beats SLASH) \u2014 and it slashes straight into your guard. Reading an enemy's tendencies turns guesswork into an edge. Still unsure? Spend 50 energy on \ud83d\udd0e READ and remove all doubt.</div>

          <div class="htp__h">\ud83d\udddd\ufe0f Weapons</div>
          <p>You start with the <strong>SWORD</strong> (balanced). Completing challenges unlocks the <strong>SPEAR</strong> (counter master), <strong>AXE</strong> (heavy hitter), and <strong>STAFF</strong> (magic &amp; healing). Each weapon has its own Skill and Ultimate.</p>

          <div class="htp__h">\ud83d\udc8d Relics</div>
          <p>Scattered through the map are <strong>Relics</strong> \u2014 permanent bonuses for the run (extra damage, gold, healing, energy and more). Grab them whenever you can; stacking relics is how you snowball into a powerful build.</p>

          <div class="htp__h">\ud83d\uddfa\ufe0f The Map</div>
          <p>Between fights you choose your path: \u2694\ufe0f battles, \ud83d\uded2 shops (spend gold), \ud83d\udd25 campfires (heal), \ud83d\udc8e treasure, and \u2753 mystery events. Plan your route \u2014 there's no single right way up.</p>

          <div class="htp__h">\ud83c\udf1f After the Run</div>
          <p>Win or lose, you earn <strong>Shards</strong>. Spend them in the <strong>FORGE</strong> for permanent upgrades that carry across every run. Want a tougher challenge with bigger rewards? Raise your <strong>ASCENSION</strong> level.</p>

          <div class="htp__tip">NIMBLADE isn't about luck \u2014 it's about reading your opponent. Lose a fight? You weren't unlucky, you got out-read. Read their tendencies, manage your energy, and you'll climb higher every run. Good luck! \u2694\ufe0f</div>
        </div>

        <button class="btn btn--primary htp__got" data-action="howto-close">GOT IT</button>
      </div>
    </div>
  `;
}

/**
 * M8: Render the LEADERBOARD modal. Shows top 10 by gold_earned + a small
 * display-name input the player can edit. Uses the same forge__overlay
 * scaffolding so we keep CSS surface small.
 */
function renderLeaderboardModalHTML() {
  const name = getDisplayName();
  const configured = isSupabaseReady();
  let bodyHTML = "";
  if (!configured) {
    bodyHTML = `
      <div class="lb__empty">
        Leaderboard offline. Set <code>VITE_SUPABASE_URL</code> + <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code> and on Vercel, then redeploy.
      </div>`;
  } else if (lbRows === null) {
    bodyHTML = `<div class="lb__empty">Loading...</div>`;
  } else if (lbError) {
    bodyHTML = `<div class="lb__empty">Error: ${escapeHTML(lbError)}</div>`;
  } else if (lbRows.length === 0) {
    bodyHTML = `<div class="lb__empty">No runs yet. Be the first to clear Ch1!</div>`;
  } else {
    const rows = lbRows.map((r, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? "lb__rank--1" : rank === 2 ? "lb__rank--2" : rank === 3 ? "lb__rank--3" : "";
      const asc = (Number(r.ascension) || 0) > 0 ? ` \u00b7 A${r.ascension}` : "";
      const wep = String(r.weapon || "?").slice(0, 8);
      return `
        <div class="lb__row">
          <div class="lb__rank ${rankClass}">#${rank}</div>
          <div class="lb__name">${escapeHTML(r.display_name || "Anonymous")}</div>
          <div class="lb__meta">${escapeHTML(wep)}${asc}</div>
          <div class="lb__gold">\ud83d\udcb0 ${r.gold_earned}</div>
        </div>
      `;
    }).join("");
    bodyHTML = `<div class="lb__list">${rows}</div>`;
  }

  return `
    <div class="lobby__toast forge__overlay" data-action="lb-close">
      <div class="forge__card lb__card" data-action="lb-stop">
        <div class="forge__header">
          <div class="forge__title">\ud83c\udfc6 LEADERBOARD</div>
          <button class="forge__close" data-action="lb-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="lb__name-row">
          <label class="lb__name-label">Your name:</label>
          <input class="lb__name-input" type="text" maxlength="24" placeholder="Anonymous" value="${escapeHTML(name)}" />
          <button class="btn btn--secondary lb__name-save" data-action="lb-save-name">SAVE</button>
        </div>
        ${bodyHTML}
        <div class="lb__footer">Top 10 by gold earned per chapter clear. Updates live after each boss kill.</div>
      </div>
    </div>
  `;
}

/**
 * M6: Render the ASCENSION picker modal. Lists levels 0-5 with effect text
 * + shard multiplier. Tap a row to highlight, tap CONFIRM to save into
 * meta.ascension (consumed by freshRun on next run start).
 *
 * Reuses forge__overlay/forge__card scaffolding so we don't ship a new pile
 * of CSS classes -- only adds `.asc__*` selectors for the row list.
 */
function renderAscensionModalHTML(meta) {
  const currentLvl = clampAsc(meta.ascension);
  const selectedLvl = clampAsc(ascSelected);
  const ch1Cleared = !!meta.ch1Cleared;

  const rows = ASCENSION_LEVELS.map((lv) => {
    const isCurrent = lv.level === currentLvl;
    const isSelected = lv.level === selectedLvl;
    const stateClasses = [
      isSelected ? "asc__row--selected" : "",
      isCurrent ? "asc__row--current" : "",
    ].join(" ");
    const effectsHTML = lv.effectLines.length === 0
      ? `<div class="asc__row-effect asc__row-effect--none">No modifiers</div>`
      : lv.effectLines.map((e) => `<div class="asc__row-effect">\u2022 ${escapeHTML(e)}</div>`).join("");
    const multLabel = `x${lv.shardMult.toFixed(2)}`;
    const currentTag = isCurrent ? `<span class="asc__row-current-tag">CURRENT</span>` : "";
    return `
      <div class="asc__row ${stateClasses}" role="button" tabindex="0" data-action="asc-select" data-level="${lv.level}">
        <div class="asc__row-head">
          <div class="asc__row-name">${escapeHTML(lv.name)} ${currentTag}</div>
          <div class="asc__row-mult">\ud83d\udc8e ${multLabel}</div>
        </div>
        <div class="asc__row-summary">${escapeHTML(lv.summary)}</div>
        <div class="asc__row-effects">${effectsHTML}</div>
      </div>
    `;
  }).join("");

  const confirmDisabled = selectedLvl === currentLvl;
  const confirmLabel = selectedLvl === 0
    ? "RESET TO STANDARD"
    : `LOCK ASCENSION ${selectedLvl}`;
  const confirmBtn = confirmDisabled
    ? `<button class="btn btn--secondary asc__confirm" disabled>${confirmLabel}</button>`
    : `<button class="btn btn--primary asc__confirm" data-action="asc-confirm">${confirmLabel}</button>`;

  const helperLine = ch1Cleared
    ? "Effects apply to your NEXT run. Setting persists across deaths."
    : "Beat the Ch1 boss to unlock.";

  return `
    <div class="lobby__toast forge__overlay" data-action="asc-close">
      <div class="forge__card asc__card" data-action="asc-stop">
        <div class="forge__header">
          <div class="forge__title">\ud83c\udf1f ASCENSION</div>
          <div class="forge__shards"><span>Current</span> <strong>${currentLvl}/5</strong></div>
          <button class="forge__close" data-action="asc-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="asc__list">${rows}</div>
        <div class="asc__footer">
          <div class="asc__helper">${helperLine}</div>
          ${confirmBtn}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the FORGE upgrade-tree modal.
 * Layout: 4 branch columns x 3 tier rows. Each cell = node card.
 * Below the grid: detail panel (long desc for selected node) + PURCHASE button.
 *
 * Cards show:
 *   - branch icon (header row)
 *   - tier label (left margin label)
 *   - node name + cost
 *   - state badge: \u2705 owned / \ud83d\udd12 locked / \ud83d\udc8e cost
 */
function renderForgeModalHTML(meta) {
  const shards = Number(meta.shards) || 0;

  // Header row (branch icons + labels)
  const headerCells = FORGE_BRANCHES.map((b) => `
    <div class="forge__col-head">
      <div class="forge__col-icon">${b.icon}</div>
      <div class="forge__col-label">${b.label}</div>
    </div>
  `).join("");

  // 5 tier rows, each row has 4 node cards (one per branch).
  const rows = [1, 2, 3, 4, 5].map((tier) => {
    const rowCells = FORGE_BRANCHES.map((b) => {
      const node = FORGE_NODES.find((n) => n.branch === b.key && n.tier === tier);
      if (!node) return `<div class="forge__cell"></div>`;
      const status = nodeStatus(node, meta);
      const isSelected = forgeSelectedKey === node.key;
      const stateClass = `forge__cell--${status}`;
      const selClass = isSelected ? "forge__cell--selected" : "";
      let badge = "";
      if (status === "owned") badge = `<div class="forge__badge forge__badge--owned">\u2705</div>`;
      else if (status === "locked") badge = `<div class="forge__badge forge__badge--locked">\ud83d\udd12</div>`;
      const costLine = status === "owned" ? "OWNED" : `\ud83d\udc8e ${node.cost}`;
      return `
        <button class="forge__cell ${stateClass} ${selClass}" data-action="forge-select" data-key="${node.key}">
          ${badge}
          <div class="forge__cell-name">${escapeHTML(node.name)}</div>
          <div class="forge__cell-cost">${costLine}</div>
        </button>
      `;
    }).join("");
    return `
      <div class="forge__row">
        <div class="forge__row-label">T${tier}</div>
        ${rowCells}
      </div>
    `;
  }).join("");

  // Detail panel for selected node.
  const selectedNode = FORGE_NODES.find((n) => n.key === forgeSelectedKey);
  let detailHTML = "";
  if (selectedNode) {
    const status = nodeStatus(selectedNode, meta);
    let actionHTML = "";
    if (status === "owned") {
      actionHTML = `<div class="forge__detail-state forge__detail-state--owned">\u2705 Already forged -- effect applies to every new run.</div>`;
    } else if (status === "locked") {
      const prereqKey = `${selectedNode.branch}_t${selectedNode.tier - 1}`;
      const prereqNode = FORGE_NODES.find((n) => n.key === prereqKey);
      actionHTML = `<div class="forge__detail-state forge__detail-state--locked">\ud83d\udd12 Forge <strong>${escapeHTML(prereqNode ? prereqNode.name : "previous tier")}</strong> first.</div>`;
    } else if (status === "unaffordable") {
      const need = selectedNode.cost - shards;
      actionHTML = `
        <div class="forge__detail-state forge__detail-state--poor">Need <strong>${need}</strong> more shards.</div>
        <button class="btn btn--secondary forge__buy" disabled>\ud83d\udc8e ${selectedNode.cost} -- INSUFFICIENT</button>
      `;
    } else {
      // affordable
      actionHTML = `<button class="btn btn--primary forge__buy" data-action="forge-buy">\ud83d\udc8e ${selectedNode.cost} -- PURCHASE</button>`;
    }
    detailHTML = `
      <div class="forge__detail">
        <div class="forge__detail-name">${escapeHTML(selectedNode.name)} <span class="forge__detail-tier">T${selectedNode.tier}</span></div>
        <div class="forge__detail-desc">${escapeHTML(selectedNode.desc)}</div>
        ${actionHTML}
      </div>
    `;
  } else {
    detailHTML = `<div class="forge__detail forge__detail--empty">Tap a node to inspect. Upgrades persist across every run.</div>`;
  }

  return `
    <div class="lobby__toast forge__overlay" data-action="forge-close">
      <div class="forge__card" data-action="forge-stop">
        <div class="forge__header">
          <div class="forge__title">\ud83d\udd28 FORGE</div>
          <div class="forge__shards"><span>\ud83d\udc8e</span> <strong>${shards}</strong></div>
          <button class="forge__close" data-action="forge-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="forge__grid">
          <div class="forge__row forge__row--head">
            <div class="forge__row-label"></div>
            ${headerCells}
          </div>
          ${rows}
        </div>
        ${detailHTML}
      </div>
    </div>
  `;
}

function escapeHTML(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setBtnText(root, text) {
  const btn = root.querySelector('[data-action="wallet"]');
  if (btn) btn.textContent = text;
}

function showToast(root, title, body) {
  const existing = root.querySelector(".lobby__toast:not(.forge__overlay)");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "lobby__toast";
  el.setAttribute("data-action", "toast-close");
  el.innerHTML = `
    <div class="lobby__toast-card" data-action="toast-stop">
      <div class="lobby__toast-title">${title}</div>
      <div class="lobby__toast-body">${body}</div>
      <button class="btn btn--secondary lobby__toast-btn" data-action="toast-close">OK</button>
    </div>
  `;
  const lobby = root.querySelector(".lobby");
  (lobby || root).appendChild(el);
}

export function freshRun(mode, seedOverride) {
  // M5a: read meta forge ownership and bake the 4 run-init bonuses in.
  // We do this BEFORE constructing the run object so HP/gold/energy already
  // reflect the upgrade tree the first time freshRun's value is read.
  const meta = getState().meta || {};
  const hpBonus     = forgeMaxHpBonus(meta);       // survival_t1+t2 -> +5/+15
  const goldBonus   = forgeStartGoldBonus(meta);   // economy_t1  -> +5
  const energyBonus = forgeStartEnergyBonus(meta); // legacy shim -> always 0 (combat_t4 covers battle-start energy)
  // M6: Asc 3+ -- start with -10 max HP. Applied AFTER forge bonus so the
  // two stack predictably (e.g. Survival T1 + Asc 3 = +5 - 10 = -5 net).
  // Gauntlet: ignore player's ascension — fixed difficulty via GAUNTLET_SCALING
  // in ascensionEffects.js (HP ×2.0, DMG ×1.5) applied in battle.js.
  const ascLevel = mode === "gauntlet" ? 0 : clampAsc(meta.ascension);
  const ascHpPenalty = ascensionMaxHpPenalty(ascLevel);
  const startMaxHp = Math.max(10, 100 + hpBonus - ascHpPenalty);

  // SEED migration: seed the per-run PRNG ONCE here, store run.seed for the
  // leaderboard record + Phase C server replay. All gameplay randomness
  // (map, combat, rewards, events) now draws from this single seeded stream.
  // Phase 2 Gauntlet: when seedOverride is provided (weekly shared seed),
  // use it so every player gets the exact same run that week.
  if (seedOverride != null) {
    rngSeed(seedOverride);
  } else {
    rngSeed();
  }
  let run = {
    mode,
    seed: rngGetSeed(),
    weapon: null,
    chapter: "CH1",
    floor: 1,
    floorMax: 9,
    gold: 0 + goldBonus,
    totalGoldEarned: 0 + goldBonus, // M2: starter gold counts toward shard payout
    ascension: ascLevel,
    relics: [],
    playerHp: startMaxHp,
    playerMaxHp: startMaxHp,
    sharpenStones: 0,
    energy: 0 + energyBonus,
    momentumStacks: 0,
    berserkTurns: 0,
    readUses: 4,
    normalQueue: null,
    normalQueueChapter: null,
    map: generateMap(undefined, ascLevel),
    currentNodeId: null,
    visitedNodeIds: [],
    // Phase 3: move log for gauntlet anti-cheat replay. Only allocated for
    // gauntlet runs to avoid memory overhead on casual play.
    moveLog: mode === "gauntlet" ? [] : null,
  };

  // Survival T4 — free starter common relic via acquireRelic engine.
  const starterId = forgeStarterRelicId(meta);
  if (starterId) {
    run = acquireRelic(run, starterId);
  }

  // Luck T4 — another starter common relic (stacks with survival_t4).
  const luckCommonId = forgeLuckStarterCommonId(meta);
  if (luckCommonId) {
    run = acquireRelic(run, luckCommonId);
  }

  // Luck T5 — start with 1 random rare relic.
  const starterRareId = forgeLuckStarterRareId(meta);
  if (starterRareId) {
    run = acquireRelic(run, starterRareId);
  }

  // Survival T5 — revive counter (1 use per run, 20 HP on death).
  if (forgeReviveEnabled(meta)) {
    run.revivesLeft = 1;
    run.reviveHp = FORGE_REVIVE_HP;
  }

  // Debug: log applied effects to console so QA can verify wiring.
  const applied = describeRunInitEffects(meta);
  if (applied.length > 0) {
    console.log("[forge] run-init effects applied:", applied.join(", "), starterId ? `(starter relic: ${starterId})` : "");
  }
  const ascApplied = describeAscensionRunEffects(ascLevel);
  if (ascApplied.length > 0) {
    console.log(`[ascension] Asc ${ascLevel} run-init effects:`, ascApplied.join(" | "));
  }

  return run;
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}
