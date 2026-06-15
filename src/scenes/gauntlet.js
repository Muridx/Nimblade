/*
 * NIMBLADE -- Weekly Gauntlet scene.
 *
 * Reached from the lobby (GAUNTLET button under TRY DEMO). This is the home of
 * the competitive, wallet-gated mode:
 *
 *   PHASE 1 (this file, shipped now):
 *     - Explains what the Weekly Gauntlet is.
 *     - NIM -> gem exchange (ONE WAY). Buying gems calls wallet.sendNim() to the
 *       project wallet. Gems are credited to meta.gems ONLY on a confirmed tx.
 *     - ENTER GAUNTLET + leaderboard are placeholders ("coming soon").
 *
 *   PHASE 2 (later): weekly shared-seed Gauntlet run (same monsters/relics for
 *     everyone that week = skill, not chance).
 *   PHASE 3 (later): separate weekly leaderboard (Supabase).
 *
 * IMPORTANT: NIM transactions only work INSIDE the Nimiq Pay host. In a plain
 * browser (Vercel preview) connectWallet()/sendNim() fail gracefully with a
 * friendly message -- buying gems can only be verified inside Nimiq Pay.
 *
 * gem -> NIM cash-out is deliberately NOT built here. It is held until Nimiq
 * gives compliance greenlight (+ KYC/geo), because letting gems convert back to
 * real NIM would re-introduce a cash prize (gambling/money-transmitter risk).
 */

import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import {
  warmupWallet,
  connectWallet,
  sendNim,
  isConnected,
  getAddress,
} from "../data/wallet.js";

// --- Config -------------------------------------------------------------
// Project wallet that receives gem payments (NIM). VERIFY before shipping --
// a single wrong character sends funds to a dead address.
const GAUNTLET_WALLET = "NQ35 BMRD H1CX 91AY 7XKE EAXU HNH6 1906 S9DX";
const GEM_PER_NIM = 2; // 1 NIM => 2 gem
const BUNDLES = [
  { nim: 1, gem: 1 * GEM_PER_NIM },
  { nim: 5, gem: 5 * GEM_PER_NIM },
  { nim: 10, gem: 10 * GEM_PER_NIM },
];

// --- Scene state (reset on every mount) ---------------------------------
let busyBundle = null; // nim amount currently being purchased (disables UI)
let connecting = false;
let status = null; // { kind: "ok" | "err", text: string }

function escapeHTML(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortAddr(addr) {
  if (!addr) return "";
  const clean = String(addr);
  return clean.length > 14 ? `${clean.slice(0, 8)}...${clean.slice(-4)}` : clean;
}

function gemBalance() {
  return Math.max(0, Math.floor(Number(getState()?.meta?.gems) || 0));
}

export function gauntletScene(root) {
  busyBundle = null;
  connecting = false;
  status = null;

  // Pre-warm wallet transport so the dev Hub popup can open inside the click
  // gesture (avoids popup-blocker). No-op / harmless inside Nimiq Pay.
  warmupWallet();

  render(root);

  const onClick = async (e) => {
    const target = e.target.closest("[data-action]");
    const action = target && target.dataset.action;
    if (!action) return;

    if (action === "gauntlet-back") {
      mountScene("lobby", root);
      return;
    }

    if (action === "gauntlet-connect") {
      if (connecting) return;
      connecting = true;
      status = null;
      render(root);
      const res = await connectWallet();
      connecting = false;
      if (!res.ok) {
        status = { kind: "err", text: res.error || "Wallet connect failed." };
      }
      render(root);
      return;
    }

    if (action === "buy-gem") {
      if (busyBundle != null) return;
      const nim = Number(target.dataset.nim);
      const gem = Number(target.dataset.gem);
      if (!nim || !gem) return;

      if (!isConnected()) {
        status = { kind: "err", text: "Connect your wallet first." };
        render(root);
        return;
      }

      busyBundle = nim;
      status = null;
      render(root);

      // Real NIM payment to the project wallet. Only credit gems if it lands.
      const res = await sendNim(GAUNTLET_WALLET, nim, "Nimblade gems");
      busyBundle = null;

      if (res.ok) {
        const meta = getState().meta || {};
        setState({ meta: { ...meta, gems: (Number(meta.gems) || 0) + gem } });
        status = {
          kind: "ok",
          text: `+${gem} gem added! (paid ${nim} NIM)`,
        };
        console.log("[gauntlet] gem purchase ok:", { nim, gem, txHash: res.txHash });
      } else {
        status = {
          kind: "err",
          text: res.error || "Payment failed or was cancelled. No gems charged.",
        };
        console.warn("[gauntlet] gem purchase failed:", res.error);
      }
      render(root);
      return;
    }
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

function render(root) {
  const connected = isConnected();
  const addr = getAddress();
  const gems = gemBalance();

  const walletBlock = connected
    ? `<div class="gaunt__wallet gaunt__wallet--on">
         <span class="gaunt__wallet-dot"></span>
         <span>Wallet: ${escapeHTML(shortAddr(addr))}</span>
       </div>`
    : `<div class="gaunt__wallet">
         <p class="gaunt__wallet-note">Connect your Nimiq wallet to buy gems and enter the Gauntlet.</p>
         <button class="btn btn--primary" data-action="gauntlet-connect" ${connecting ? "disabled" : ""}>
           ${connecting ? "Connecting..." : "CONNECT WALLET"}
         </button>
       </div>`;

  const bundlesBlock = BUNDLES.map((b) => {
    const loading = busyBundle === b.nim;
    const disabled = !connected || busyBundle != null;
    return `
      <button class="gaunt__bundle ${loading ? "gaunt__bundle--loading" : ""}"
              data-action="buy-gem" data-nim="${b.nim}" data-gem="${b.gem}"
              ${disabled ? "disabled" : ""}>
        <span class="gaunt__bundle-gem">${b.gem} \u{1F48E}</span>
        <span class="gaunt__bundle-price">${loading ? "Paying..." : `${b.nim} NIM`}</span>
      </button>`;
  }).join("");

  const statusBlock = status
    ? `<div class="gaunt__status gaunt__status--${status.kind}">${escapeHTML(status.text)}</div>`
    : "";

  root.innerHTML = `
    <div class="gaunt">
      <div class="gaunt__top">
        <button class="gaunt__back" data-action="gauntlet-back" aria-label="Back to lobby">\u2190</button>
        <h1 class="gaunt__title">\u2694\ufe0f WEEKLY GAUNTLET</h1>
        <div class="gaunt__gembal" aria-label="Gem balance">${gems} \u{1F48E}</div>
      </div>

      <p class="gaunt__intro">
        A weekly <strong>skill</strong> tournament. Every player faces the
        <strong>same monsters, relics and events</strong> that week (a shared seed),
        so the leaderboard is decided by skill &mdash; not luck. Spend <strong>gems</strong>
        to enter; climb the board.
      </p>

      <section class="gaunt__card">
        <h2 class="gaunt__card-title">Exchange</h2>
        ${walletBlock}
        <p class="gaunt__rate">Rate: <strong>1 NIM = ${GEM_PER_NIM} gem</strong></p>
        <div class="gaunt__bundles">${bundlesBlock}</div>
        ${statusBlock}
        <p class="gaunt__hint">Payments go through Nimiq Pay. Gems are added only after the transaction confirms.</p>
        <p class="gaunt__locked">\u{1F512} Cash-out (gem \u2192 NIM) coming after Nimiq compliance approval.</p>
      </section>

      <section class="gaunt__card gaunt__card--soon">
        <h2 class="gaunt__card-title">This week's Gauntlet</h2>
        <button class="btn btn--primary" disabled>ENTER GAUNTLET \u2014 SOON</button>
        <p class="gaunt__hint">The weekly shared-seed run is coming next. Stock up on gems now.</p>
      </section>

      <section class="gaunt__card gaunt__card--soon">
        <h2 class="gaunt__card-title">Leaderboard</h2>
        <p class="gaunt__hint">Weekly Gauntlet rankings will appear here.</p>
      </section>
    </div>
  `;
}
