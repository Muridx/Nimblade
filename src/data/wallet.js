/*
 * NIMBLADE -- Nimiq wallet integration (dual transport)
 *
 * Wraps two wallet back-ends behind ONE interface so scenes never care which
 * one is active:
 *
 *   1. NIMIQ PAY (real player path) -- `@nimiq/mini-app-sdk`. The provider is
 *      injected by the Nimiq Pay host and exposed via init(). This is what
 *      actual players use on mobile, and what the competition is judged on.
 *
 *   2. NIMIQ HUB (DEV-ONLY browser path) -- `@nimiq/hub-api`. A popup-based
 *      wallet that works in a normal desktop/mobile browser. This exists ONLY
 *      so the developer can test every feature on the web without a phone.
 *      It is gated behind DEV_HUB and defaults to TESTNET (free, fake NIM).
 *
 * Transport selection (decided once, cached):
 *   - Try Nimiq Pay first. If we're inside the host, use it.            -> "miniapp"
 *   - Else, if DEV_HUB is on, use Hub.                                  -> "hub"
 *   - Else, no wallet (plain browser, prod build) -> friendly error.    -> "none"
 *
 *  >>> BEFORE PUBLIC LAUNCH: set DEV_HUB = false (players use Nimiq Pay on
 *      mobile). Or, if you ever want real desktop support, set
 *      HUB_NETWORK = "main" so Hub uses real NIM on mainnet. <<<
 *
 * Public API (unchanged):
 *   warmupWallet()                  -> void   (call on scene mount; pre-warms transport)
 *   connectWallet()                 -> { ok, address?, error? }
 *   sendNim(toAddress, nim, label?) -> { ok, txHash?, error? }
 *   isConnected()                   -> boolean
 *   getAddress()                    -> string | null
 *   getWalletMode()                 -> "miniapp" | "hub" | "none" | null
 */

import { getState, setState } from "../state/store.js";

// --- Config -------------------------------------------------------------
const DEV_HUB = true; // DEV-ONLY browser wallet. Set false for public launch.
const HUB_NETWORK = "main"; // "test" = testnet (free fake NIM) | "main" = mainnet (real NIM)
const HUB_ENDPOINT =
  HUB_NETWORK === "main" ? "https://hub.nimiq.com" : "https://hub.nimiq-testnet.com";
const APP_NAME = "Nimblade";
const HOST_INIT_TIMEOUT_MS = 1500; // how long to wait for Nimiq Pay before falling back

const LUNA_PER_NIM = 100_000;

const BROWSER_MSG =
  "Open this app inside Nimiq Pay on your phone to connect your wallet.";

// --- Internal state -----------------------------------------------------
let _miniProviderPromise = null;
let _miniProvider = null;
let _hubApi = null;
let _transport = null; // "miniapp" | "hub" | "none"
let _transportPromise = null;

function _withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("host-init-timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function _ensureMiniProvider() {
  if (_miniProviderPromise) return _miniProviderPromise;
  _miniProviderPromise = (async () => {
    // Dynamic import so the bundle still builds if the SDK isn't installed yet.
    const mod = await import("@nimiq/mini-app-sdk");
    if (!mod || typeof mod.init !== "function") {
      throw new Error("Nimiq SDK loaded but `init` is missing");
    }
    // init() resolves once Nimiq Pay has injected the provider.
    return await mod.init();
  })();
  return _miniProviderPromise;
}

async function _ensureHub() {
  if (_hubApi) return _hubApi;
  const mod = await import("@nimiq/hub-api");
  const HubApi = mod.default || mod.HubApi || mod;
  _hubApi = new HubApi(HUB_ENDPOINT);
  return _hubApi;
}

/**
 * Decide ONCE which wallet transport to use, and cache it. Tries the real
 * Nimiq Pay host first; only falls back to the dev Hub if we're clearly not
 * inside Nimiq Pay (init times out / throws).
 */
async function _resolveTransport() {
  if (_transport) return _transport;
  if (_transportPromise) return _transportPromise;
  _transportPromise = (async () => {
    // 1) Real player path: Nimiq Pay host.
    try {
      _miniProvider = await _withTimeout(_ensureMiniProvider(), HOST_INIT_TIMEOUT_MS);
      _transport = "miniapp";
      console.log("[wallet] transport = miniapp (Nimiq Pay host)");
      return _transport;
    } catch (e) {
      // Not inside Nimiq Pay -- this is normal in a plain browser.
      _miniProviderPromise = null; // allow a later retry if the host appears
    }
    // 2) Dev-only browser fallback.
    if (DEV_HUB) {
      _transport = "hub";
      console.log(`[wallet] transport = hub (DEV, ${HUB_NETWORK}net) -- browser testing only`);
      return _transport;
    }
    // 3) No wallet available.
    _transport = "none";
    console.log("[wallet] transport = none (browser, DEV_HUB off)");
    return _transport;
  })();
  return _transportPromise;
}

/**
 * Pre-warm the transport (and the Hub instance) so that, in dev/browser mode,
 * the Hub popup can open inside the user's click gesture instead of being
 * blocked by the popup blocker. Safe to call repeatedly; fire-and-forget.
 */
export async function warmupWallet() {
  try {
    const t = await _resolveTransport();
    if (t === "hub") await _ensureHub();
  } catch (err) {
    console.warn("[wallet] warmup failed:", err);
  }
}

function _storeAddress(address) {
  const meta = getState().meta || {};
  setState({ meta: { ...meta, wallet: { address, connectedAt: Date.now() } } });
}

/**
 * Connect: ask the active wallet for an address. Updates meta on success.
 * Returns { ok, address, error }.
 */
export async function connectWallet() {
  const transport = await _resolveTransport();
  try {
    if (transport === "miniapp") {
      const provider = _miniProvider || (await _ensureMiniProvider());
      const accounts = await provider.listAccounts();
      if (!Array.isArray(accounts) || accounts.length === 0) {
        return { ok: false, error: "No Nimiq accounts available." };
      }
      const first = accounts[0];
      const address = typeof first === "string" ? first : first?.address;
      if (!address) return { ok: false, error: "Account has no address." };
      _storeAddress(address);
      return { ok: true, address };
    }

    if (transport === "hub") {
      const hub = await _ensureHub();
      const result = await hub.chooseAddress({ appName: APP_NAME });
      const address = result && result.address;
      if (!address) return { ok: false, error: "No address selected." };
      _storeAddress(address);
      return { ok: true, address };
    }

    return { ok: false, error: BROWSER_MSG };
  } catch (err) {
    console.warn("[wallet] connect failed:", err);
    // Hub throws a CANCELED error when the user closes the popup.
    if (err && /cancel/i.test(err.message || "")) {
      return { ok: false, error: "Wallet connect cancelled." };
    }
    return { ok: false, error: transport === "hub" ? "Wallet connect failed." : BROWSER_MSG };
  }
}

/**
 * Send a NIM payment from the connected account to `toAddress`.
 * `amountNim` is the human amount in NIM. `label` is an optional short message.
 * Returns { ok, txHash, error }.
 */
export async function sendNim(toAddress, amountNim, label) {
  const transport = await _resolveTransport();
  const valueLuna = Math.round(amountNim * LUNA_PER_NIM);
  try {
    if (transport === "miniapp") {
      const provider = _miniProvider || (await _ensureMiniProvider());
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
    }

    if (transport === "hub") {
      const hub = await _ensureHub();
      const signed = await hub.checkout({
        appName: APP_NAME,
        recipient: toAddress,
        value: valueLuna,
        fee: 0,
        ...(label ? { extraData: label } : {}),
      });
      // checkout relays the tx to the network AND returns the signed tx.
      return { ok: true, txHash: signed && signed.hash };
    }

    return { ok: false, error: BROWSER_MSG };
  } catch (err) {
    console.warn("[wallet] sendNim failed:", err);
    if (err && /cancel/i.test(err.message || "")) {
      return { ok: false, error: "Payment cancelled. No gems charged." };
    }
    return { ok: false, error: err?.message || "Transaction failed or was rejected." };
  }
}

export function isConnected() {
  return Boolean(getState()?.meta?.wallet?.address);
}

export function getAddress() {
  return getState()?.meta?.wallet?.address || null;
}

export function getWalletMode() {
  return _transport;
}
