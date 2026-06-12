/*
 * NIMBLADE -- Nimiq Pay wallet integration
 *
 * Wraps `@nimiq/mini-app-sdk` so the rest of the game does not need to know
 * about the SDK details. Designed for the Nimiq Pay mini-app environment:
 * the SDK provider is injected by the host (Nimiq Pay) and exposed via
 * `init()`. Outside of Nimiq Pay (regular browser), `init()` will time out
 * or throw, so we catch and return a friendly error.
 *
 * Public API
 *   connectWallet()           -> { ok, address?, error? }
 *   sendNim(toAddress, nim, label?) -> { ok, txHash?, error? }
 *   isConnected()             -> boolean
 *   getAddress()              -> string | null
 *
 * Internal:
 *   _ensureProvider() lazy-imports the SDK on first call and caches the
 *   provider. We dynamic-import so a missing dep does not crash boot.
 */

import { getState, setState } from "../state/store.js";

const LUNA_PER_NIM = 100_000;

let _providerPromise = null;

async function _ensureProvider() {
  if (_providerPromise) return _providerPromise;
  _providerPromise = (async () => {
    // Dynamic import so the bundle can still build if the SDK isn't installed
    // yet during local dev.
    const mod = await import("@nimiq/mini-app-sdk");
    if (!mod || typeof mod.init !== "function") {
      throw new Error("Nimiq SDK loaded but `init` is missing");
    }
    // init() resolves when Nimiq Pay has injected the provider.
    const provider = await mod.init();
    return provider;
  })();
  return _providerPromise;
}

/**
 * Ask Nimiq Pay for the user's primary account. Updates run state on success.
 * Returns { ok, address, error }.
 */
export async function connectWallet() {
  try {
    const provider = await _ensureProvider();
    const accounts = await provider.listAccounts();
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return { ok: false, error: "No Nimiq accounts available." };
    }
    // SDK may return objects {address, label} or plain address strings.
    const first = accounts[0];
    const address = typeof first === "string" ? first : first?.address;
    if (!address) {
      return { ok: false, error: "Account has no address." };
    }
    const meta = getState().meta || {};
    setState({ meta: { ...meta, wallet: { address, connectedAt: Date.now() } } });
    return { ok: true, address };
  } catch (err) {
    console.warn("[wallet] connect failed:", err);
    return {
      ok: false,
      error:
        "Open this app inside Nimiq Pay to connect your wallet. (Browser preview mode -- wallet connect requires Nimiq Pay host.)",
    };
  }
}

/**
 * Send a NIM payment from the connected account to `toAddress`.
 * `amountNim` is the human amount in NIM (gets converted to Luna for the SDK).
 * `label` is an optional short message (uses sendBasicTransactionWithData when set).
 */
export async function sendNim(toAddress, amountNim, label) {
  try {
    const provider = await _ensureProvider();
    const valueLuna = Math.round(amountNim * LUNA_PER_NIM);
    let txHash;
    if (label && typeof provider.sendBasicTransactionWithData === "function") {
      txHash = await provider.sendBasicTransactionWithData({
        recipient: toAddress,
        value: valueLuna,
        data: label,
      });
    } else {
      txHash = await provider.sendBasicTransaction({
        recipient: toAddress,
        value: valueLuna,
      });
    }
    return { ok: true, txHash };
  } catch (err) {
    console.warn("[wallet] sendNim failed:", err);
    return { ok: false, error: err?.message || "Transaction failed or was rejected." };
  }
}

export function isConnected() {
  return Boolean(getState()?.meta?.wallet?.address);
}

export function getAddress() {
  return getState()?.meta?.wallet?.address || null;
}
