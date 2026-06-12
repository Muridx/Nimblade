import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import { generateMap } from "../data/mapGen.js";
import { connectWallet } from "../data/wallet.js";

// 2.7e P0: Nimiq Pay wallet now wired via @nimiq/mini-app-sdk.
// `Connect Wallet` button calls connectWallet() which init()s the SDK,
// listAccounts(), and writes the address to state.meta.wallet. Outside the
// Nimiq Pay host (e.g. plain browser preview) it returns a friendly error
// and the player can still use DEMO mode to play CH1 without a wallet.

let connecting = false;

export function lobbyScene(root) {
  render(root);

  const onClick = async (e) => {
    const action = e.target.dataset && e.target.dataset.action;
    if (!action) return;

    if (action === "wallet") {
      if (connecting) return;
      const wallet = getState().meta.wallet;
      if (wallet) {
        // Already connected -- offer disconnect.
        if (confirm(`Disconnect wallet ${shortAddr(wallet.address)}?`)) {
          const meta = getState().meta || {};
          setState({ meta: { ...meta, wallet: null } });
          render(root);
        }
        return;
      }
      connecting = true;
      setBtnText(root, "Connecting...");
      const res = await connectWallet();
      connecting = false;
      if (res.ok) {
        render(root);
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
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

function render(root) {
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
}

function setBtnText(root, text) {
  const btn = root.querySelector('[data-action="wallet"]');
  if (btn) btn.textContent = text;
}

// Fresh run skeleton. Weapon is filled in weaponSelect scene.
function freshRun(mode) {
  return {
    mode,
    weapon: null,
    chapter: "CH1",
    floor: 1,
    floorMax: 9,
    gold: 0,
    relics: [],
    playerHp: 100,
    playerMaxHp: 100,
    sharpenStones: 0,
    // 2.7a-patch carry-over fields (persist across floors)
    energy: 0,
    momentumStacks: 0,
    berserkTurns: 0,
    readUses: 3, // total reads per RUN (STUDY: reveal 1 + lock honest)
    // 2.7b-3 v2c: no-dupe normals per run (shuffled queue per chapter)
    normalQueue: null,
    normalQueueChapter: null,
    // 2.7d M1: proc-gen branching map for this run.
    map: generateMap(),
    currentNodeId: null, // set when player picks first node on F2
    visitedNodeIds: [],
  };
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}
