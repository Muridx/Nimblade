/*
 * NIMBLADE -- Exchange scene.
 *
 * Standalone economy hub accessible from the lobby. Handles:
 *   1. Buy gems   — NIM → gems (1 NIM = 1 gem, server-credited via tx_hash)
 *                    Tap bundle → confirm step → execute payment
 *   2. Convert    — Shards → gems (100 shards = 1 gem, server-side)
 *                    Stepper +/- to pick qty
 *   3. Cash out   — Gems → NIM (2 gems = 1 NIM, server-validated)
 *                    Stepper +/- to pick qty
 *
 * All mutations go through server RPCs (src/data/economy.js).
 * Local meta.shards / meta.gems = display cache only.
 */

import { getState, setState } from "../state/store.js";
import { mountScene } from "./sceneManager.js";
import {
  connectWallet,
  warmupWallet,
  sendNim,
  isConnected,
  getAddress,
} from "../data/wallet.js";
import {
  buyGemsCredit,
  cashoutGems,
  fetchBalances,
  convertShardsToGems,
  processCashoutTransfer,
  GEMS_PER_NIM_IN,
  GEMS_PER_NIM_OUT,
  SHARDS_PER_GEM,
} from "../data/economy.js";

// --- Config ----------------------------------------------------------------
const GAUNTLET_WALLET = "NQ40 TE0Q MVNJ VQ3M MDNJ 3T11 BHBY GYN0 D2VS";
const GEM_PER_NIM = GEMS_PER_NIM_IN; // 1 NIM = 1 gem (buy rate)
const BUY_BUNDLES = [
  { nim: 1, gem: 1 * GEM_PER_NIM },
  { nim: 5, gem: 5 * GEM_PER_NIM },
  { nim: 10, gem: 10 * GEM_PER_NIM },
];

// --- Helpers ---------------------------------------------------------------
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Scene -----------------------------------------------------------------
export function exchangeScene(root) {
  let status = null;       // { kind: "ok"|"err", text }
  let busyAction = null;   // "buy" | "convert" | "cashout" | "connect"
  let connecting = false;

  // Buy confirm state: null or { nim, gem }
  let pendingBuy = null;

  // Stepper quantities (in output units: gems for convert, NIM for cashout)
  let convertQty = 1;
  let cashoutQty = 1;

  warmupWallet();

  // Sync server balances on mount
  if (isConnected()) {
    fetchBalances(getAddress()).catch(() => {});
  }

  // --- Event handler -------------------------------------------------------
  function handleClick(e) {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "ex-back") {
      mountScene("lobby", root);
      return;
    }

    if (action === "ex-connect") {
      if (connecting) return;
      connecting = true;
      status = null;
      render();
      connectWallet()
        .then(() => {
          connecting = false;
          if (isConnected()) {
            fetchBalances(getAddress()).catch(() => {});
          }
          render();
        })
        .catch(() => {
          connecting = false;
          status = { kind: "err", text: "Wallet connection failed." };
          render();
        });
      return;
    }

    // --- Buy gems: step 1 — select bundle (show confirm) ---
    if (action === "ex-buy-select") {
      if (busyAction) return;
      const nim = Number(target.dataset.nim);
      const gem = Number(target.dataset.gem);
      if (!nim || !gem) return;
      if (!isConnected()) {
        status = { kind: "err", text: "Connect your wallet first." };
        render();
        return;
      }
      pendingBuy = { nim, gem };
      status = null;
      render();
      return;
    }

    // --- Buy gems: cancel confirm ---
    if (action === "ex-buy-cancel") {
      pendingBuy = null;
      render();
      return;
    }

    // --- Buy gems: step 2 — confirm & execute payment ---
    if (action === "ex-buy-confirm") {
      if (busyAction || !pendingBuy) return;
      const { nim, gem } = pendingBuy;

      busyAction = "buy";
      status = null;
      render();

      (async () => {
        const res = await sendNim(GAUNTLET_WALLET, nim, "Nimblade gems");
        if (res.ok) {
          const walletAddr = getAddress();
          const creditRes = await buyGemsCredit(walletAddr, nim, res.txHash || null);
          if (creditRes.ok) {
            status = { kind: "ok", text: `+${creditRes.gems_credited} 💎 added! (paid ${nim} NIM)` };
          } else {
            const meta = getState().meta || {};
            setState({ meta: { ...meta, gems: (Number(meta.gems) || 0) + gem } });
            status = { kind: "ok", text: `+${gem} 💎 added! (paid ${nim} NIM) — sync pending` };
          }
        } else {
          status = { kind: "err", text: res.error || "Payment failed or cancelled." };
        }
        busyAction = null;
        pendingBuy = null;
        render();
      })();
      return;
    }

    // --- Convert stepper ---
    if (action === "ex-conv-minus") {
      if (convertQty > 1) { convertQty--; render(); }
      return;
    }
    if (action === "ex-conv-plus") {
      const meta = getState().meta || {};
      const maxGems = Math.floor((Number(meta.shards) || 0) / SHARDS_PER_GEM);
      if (convertQty < maxGems) { convertQty++; render(); }
      return;
    }
    if (action === "ex-conv-max") {
      const meta = getState().meta || {};
      const maxGems = Math.floor((Number(meta.shards) || 0) / SHARDS_PER_GEM);
      if (maxGems > 0) { convertQty = maxGems; render(); }
      return;
    }

    // --- Convert execute ---
    if (action === "ex-convert") {
      if (busyAction) return;
      const meta = getState().meta || {};
      const shards = Number(meta.shards) || 0;
      const maxGems = Math.floor(shards / SHARDS_PER_GEM);
      if (maxGems < 1 || convertQty < 1) {
        status = { kind: "err", text: `Need ${SHARDS_PER_GEM} shards. You have ${shards}.` };
        render();
        return;
      }
      if (!isConnected()) {
        status = { kind: "err", text: "Connect your wallet first." };
        render();
        return;
      }

      const qty = Math.min(convertQty, maxGems);
      const shardsToSpend = qty * SHARDS_PER_GEM;

      busyAction = "convert";
      status = null;
      render();

      (async () => {
        const walletAddr = getAddress();
        const res = await convertShardsToGems(walletAddr, shardsToSpend);
        if (res.ok) {
          status = { kind: "ok", text: `Converted ${shardsToSpend} 🔷 → ${res.gems_gained} 💎` };
          convertQty = 1; // reset
        } else {
          status = { kind: "err", text: res.error || "Conversion failed." };
        }
        busyAction = null;
        render();
      })();
      return;
    }

    // --- Cashout stepper ---
    if (action === "ex-cash-minus") {
      if (cashoutQty > 1) { cashoutQty--; render(); }
      return;
    }
    if (action === "ex-cash-plus") {
      const meta = getState().meta || {};
      const maxNIM = Math.floor((Number(meta.gems) || 0) / GEMS_PER_NIM_OUT);
      if (cashoutQty < maxNIM) { cashoutQty++; render(); }
      return;
    }
    if (action === "ex-cash-max") {
      const meta = getState().meta || {};
      const maxNIM = Math.floor((Number(meta.gems) || 0) / GEMS_PER_NIM_OUT);
      if (maxNIM > 0) { cashoutQty = maxNIM; render(); }
      return;
    }

    // --- Cashout execute ---
    if (action === "ex-cashout") {
      if (busyAction) return;
      const meta = getState().meta || {};
      const gems = Number(meta.gems) || 0;
      const maxNIM = Math.floor(gems / GEMS_PER_NIM_OUT);
      if (maxNIM < 1 || cashoutQty < 1) {
        status = { kind: "err", text: `Need ${GEMS_PER_NIM_OUT} 💎 to cash out 1 NIM. You have ${gems}.` };
        render();
        return;
      }
      if (!isConnected()) {
        status = { kind: "err", text: "Connect your wallet first." };
        render();
        return;
      }

      const qty = Math.min(cashoutQty, maxNIM);
      const gemsToSpend = qty * GEMS_PER_NIM_OUT;

      busyAction = "cashout";
      status = null;
      render();

      (async () => {
        const walletAddr = getAddress();
        const res = await cashoutGems(walletAddr, gemsToSpend);
        if (res.ok) {
          // Gems deducted server-side. Now trigger auto NIM transfer via Edge Function.
          status = { kind: "ok", text: `Processing ${res.nim_amount} NIM transfer...` };
          render();

          const transfer = await processCashoutTransfer(res.request_id, walletAddr);
          if (transfer.ok) {
            status = { kind: "ok", text: `✅ ${res.nim_amount} NIM sent to your wallet!` };
          } else {
            // Edge Function failed — gems already refunded server-side by fail_cashout.
            // Refresh balances to show refund.
            await fetchBalances(walletAddr).catch(() => {});
            status = { kind: "err", text: `NIM transfer failed: ${transfer.error || "unknown error"}. Gems refunded.` };
          }
          cashoutQty = 1;
        } else {
          status = { kind: "err", text: res.error || "Cash out failed." };
        }
        busyAction = null;
        render();
      })();
      return;
    }
  }

  root.addEventListener("click", handleClick);

  // --- Render --------------------------------------------------------------
  function render() {
    const meta = getState().meta || {};
    const shards = Number(meta.shards) || 0;
    const gems = Number(meta.gems) || 0;
    const connected = isConnected();

    // --- Wallet block ---
    const walletBlock = connected
      ? ""
      : `<div class="ex__connect">
           <p class="ex__connect-text">Connect your Nimiq wallet to buy, convert, or cash out.</p>
           <button class="btn btn--primary" data-action="ex-connect" ${connecting ? "disabled" : ""}>
             ${connecting ? "Connecting..." : "CONNECT WALLET"}
           </button>
         </div>`;

    // --- Buy bundles (with confirm overlay) ---
    const bundlesHTML = BUY_BUNDLES.map((b) => {
      const isSelected = pendingBuy && pendingBuy.nim === b.nim;
      const disabled = !connected || busyAction != null;
      return `
        <button class="ex__bundle ${isSelected ? "ex__bundle--selected" : ""}"
                data-action="ex-buy-select" data-nim="${b.nim}" data-gem="${b.gem}"
                ${disabled ? "disabled" : ""}>
          <span class="ex__bundle-gem">${b.gem} 💎</span>
          <span class="ex__bundle-price">${b.nim} NIM</span>
        </button>`;
    }).join("");

    // Confirm bar (shown when a bundle is selected)
    const buyLoading = busyAction === "buy";
    const confirmHTML = pendingBuy
      ? `<div class="ex__confirm">
           <span class="ex__confirm-text">Pay <strong>${pendingBuy.nim} NIM</strong> for <strong>${pendingBuy.gem} 💎</strong>?</span>
           <div class="ex__confirm-btns">
             <button class="btn ex__confirm-no" data-action="ex-buy-cancel" ${buyLoading ? "disabled" : ""}>✕</button>
             <button class="btn btn--primary ex__confirm-yes" data-action="ex-buy-confirm" ${buyLoading ? "disabled" : ""}>
               ${buyLoading ? "Paying..." : "CONFIRM ✓"}
             </button>
           </div>
         </div>`
      : "";

    // --- Convert stepper ---
    const maxConvertGems = Math.floor(shards / SHARDS_PER_GEM);
    const clampedConvertQty = Math.max(1, Math.min(convertQty, Math.max(maxConvertGems, 1)));
    if (clampedConvertQty !== convertQty) convertQty = clampedConvertQty;
    const convertShardsNeeded = convertQty * SHARDS_PER_GEM;
    const convertDisabled = !connected || maxConvertGems < 1 || busyAction != null;
    const convertLoading = busyAction === "convert";

    // --- Cashout stepper ---
    const maxCashoutNIM = Math.floor(gems / GEMS_PER_NIM_OUT);
    const clampedCashoutQty = Math.max(1, Math.min(cashoutQty, Math.max(maxCashoutNIM, 1)));
    if (clampedCashoutQty !== cashoutQty) cashoutQty = clampedCashoutQty;
    const cashoutGemsNeeded = cashoutQty * GEMS_PER_NIM_OUT;
    const cashoutDisabled = !connected || maxCashoutNIM < 1 || busyAction != null;
    const cashoutLoading = busyAction === "cashout";

    // --- Status banner ---
    const statusHTML = status
      ? `<div class="ex__status ex__status--${status.kind}">${escapeHTML(status.text)}</div>`
      : "";

    // Preserve scroll position across re-renders
    const scrollEl = root.querySelector(".ex");
    const prevScroll = scrollEl ? scrollEl.scrollTop : 0;

    root.innerHTML = `
    <div class="ex">
      <header class="ex__header">
        <button class="ex__back" data-action="ex-back" aria-label="Back">‹</button>
        <h1 class="ex__title">💎 EXCHANGE</h1>
        <div class="ex__bal">
          <span class="ex__bal-item">🔷 ${shards}</span>
          <span class="ex__bal-item">💎 ${gems}</span>
        </div>
      </header>

      ${walletBlock}
      ${statusHTML}

      <section class="ex__card">
        <h2 class="ex__card-title">Buy Gems</h2>
        <p class="ex__rate">1 NIM = ${GEM_PER_NIM} 💎</p>
        <div class="ex__bundles">${bundlesHTML}</div>
        ${confirmHTML}
        <p class="ex__hint">Payments via Nimiq Pay. Gems credited after on-chain confirmation.</p>
      </section>

      <section class="ex__card">
        <h2 class="ex__card-title">Convert Shards → Gems</h2>
        <p class="ex__rate">${SHARDS_PER_GEM} 🔷 = 1 💎</p>
        <p class="ex__info">You have <strong>${shards} 🔷</strong> (max ${maxConvertGems} 💎)</p>
        <div class="ex__stepper">
          <button class="ex__step-btn" data-action="ex-conv-minus" ${convertQty <= 1 ? "disabled" : ""}>−</button>
          <span class="ex__step-val">${convertQty} 💎</span>
          <button class="ex__step-btn" data-action="ex-conv-plus" ${convertQty >= maxConvertGems ? "disabled" : ""}>+</button>
          <button class="ex__step-max" data-action="ex-conv-max" ${maxConvertGems < 1 ? "disabled" : ""}>MAX</button>
        </div>
        <p class="ex__step-summary">Cost: <strong>${convertShardsNeeded} 🔷</strong> → Get: <strong>${convertQty} 💎</strong></p>
        <button class="btn btn--primary ex__action-btn ${convertLoading ? "ex__action-btn--loading" : ""}"
                data-action="ex-convert"
                ${convertDisabled ? "disabled" : ""}>
          ${convertLoading ? "Converting..." : `CONVERT ${convertQty} 💎`}
        </button>
      </section>

      <section class="ex__card">
        <h2 class="ex__card-title">Cash Out Gems → NIM</h2>
        <p class="ex__rate">${GEMS_PER_NIM_OUT} 💎 = 1 NIM</p>
        <p class="ex__info">You have <strong>${gems} 💎</strong> (max ${maxCashoutNIM} NIM)</p>
        <div class="ex__stepper">
          <button class="ex__step-btn" data-action="ex-cash-minus" ${cashoutQty <= 1 ? "disabled" : ""}>−</button>
          <span class="ex__step-val">${cashoutQty} NIM</span>
          <button class="ex__step-btn" data-action="ex-cash-plus" ${cashoutQty >= maxCashoutNIM ? "disabled" : ""}>+</button>
          <button class="ex__step-max" data-action="ex-cash-max" ${maxCashoutNIM < 1 ? "disabled" : ""}>MAX</button>
        </div>
        <p class="ex__step-summary">Cost: <strong>${cashoutGemsNeeded} 💎</strong> → Get: <strong>${cashoutQty} NIM</strong></p>
        <button class="btn btn--primary ex__action-btn ${cashoutLoading ? "ex__action-btn--loading" : ""}"
                data-action="ex-cashout"
                ${cashoutDisabled ? "disabled" : ""}>
          ${cashoutLoading ? "Processing..." : `CASH OUT ${cashoutQty} NIM`}
        </button>
        <p class="ex__hint">NIM is sent automatically to your wallet after cashout.</p>
      </section>
    </div>
  `;

    // Restore scroll position
    const newScrollEl = root.querySelector(".ex");
    if (newScrollEl && prevScroll) newScrollEl.scrollTop = prevScroll;
  }

  render();

  return function unmount() {
    root.removeEventListener("click", handleClick);
  };
}
