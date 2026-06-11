/**
  * NIMBLADE -- lobby scene
  * bg + 2 buttons (START RUN / TRY DEMO) + wallet chip
 */
import { getState, setState } from "../state/store.js";

export function lobbyScene(root) {
  const wallet = getState().meta.wallet;
  const walletLabel = wallet ? shortAddr(wallet.address) : "Connect Wallet";

  root.innerHTML = `
    <div class="lobby">
      <button class="lobby__wallet" data-action="wallet">${walletLabel}</button>
      <div class="lobby__title">NIMBLADE</div>
      <div class="lobby__spacer"></div>
      <div class="lobby__actions">
        <button class="btn btn--primary" data-action="start-run">START RUN</button>
        <button class="btn btn--secondary" data-action="try-demo">TRY DEMO</button>
        <p class="lobby__hint">Demo runs Chapter 1 only, no wallet needed</p>
      </div>
    </div>
  `;

  const onClick = (e) => {
    const action = e.target.dataset && e.target.dataset.action;
    if (!action) return;

    if (action === "wallet") {
      alert("Wallet connect coming in Step 2.9 (Nimiq Pay SDK).");
      return;
    }

    if (action === "start-run") {
      if (!getState().meta.wallet) {
        alert("Connect your wallet to start a full run, or try DEMO mode.");
        return;
      }
      setState({ run: { mode: "full" } });
      console.log("[lobby] start full run");
      // Step 2.6 -- mount map scene
      return;
    }

    if (action === "try-demo") {
      setState({ run: { mode: "demo" } });
      console.log("[lobby] start demo run");
      // Step 2.6 -- mount map scene (demo)
      return;
    }
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}