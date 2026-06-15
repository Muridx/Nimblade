import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import weaponsData from "../data/weapons.json";

/**
 * P4: Weapon Select scene -- now with shard-gated unlock UI.
 *
 * Layout (mobile-first, 360px target):
 *   - Top: Back button + title + mode subtitle + SHARDS pill (top-right)
 *   - 2x2 grid of large weapon cards. Each card shows:
 *       \u2022 Big idle PNG (160px tall, contain-fit)
 *       \u2022 Weapon name + identity
 *       \u2022 Lock state: greyscale + \ud83d\udd12 overlay + price chip if locked
 *   - Bottom panel: stats + passive + ult of the SELECTED weapon (always shown)
 *   - Bottom CTA button (context-aware):
 *       \u2022 Selected weapon UNLOCKED   -> "BEGIN RUN WITH XXX" (gold)
 *       \u2022 Selected weapon LOCKED, shards >= cost -> "\ud83d\udd12 UNLOCK FOR \ud83d\udc8e XXX" (purple)
 *       \u2022 Selected weapon LOCKED, shards < cost  -> disabled, sub: "Need XXX more shards"
 *   - Demo mode bypasses all locks (per existing behavior).
 *
 * Unlock flow:
 *   - Tap "UNLOCK FOR \ud83d\udc8e XXX" -> confirm() dialog with weapon name + price
 *   - On confirm: deduct shards, push id into meta.weaponsUnlocked, persist,
 *     re-render. Selected weapon stays selected, button morphs to BEGIN RUN.
 *
 * Pricing locked by Murid (option A): axe 400 / spear 1000 / staff 1800.
 * Total 3200 shards = ~2.9x cost of unlocking full forge tree (1120 shards).
 * Decision tension: which weapon to chase first, when each is a multi-day grind.
 */

// P4 LOCKED prices. Sword is the free starter so it's not listed here.
//   Axe   400  -> first unlock target, ~10-15 ch1 runs
//   Spear 1000 -> mid-game commitment, ~1 month
//   Staff 1800 -> trophy weapon, ULT-stacker identity, ~2 month
const UNLOCK_PRICE = {
  axe: 400,
  spear: 1000,
  staff: 1800,
};

// Order to render cards in grid. Keeps Sword top-left (free), then mirrors
// unlock order Axe -> Spear -> Staff so the climb reads left-to-right.
const CARD_ORDER = ["sword", "axe", "spear", "staff"];

export function weaponSelectScene(root) {
  const run = getState().run || { mode: "demo" };
  const isDemo = run.mode === "demo";
  let selected = "sword";

  const isUnlocked = (weaponId) => {
    if (isDemo) return true;
    if (weaponId === "sword") return true;
    const meta = getState().meta || {};
    const list = Array.isArray(meta.weaponsUnlocked) ? meta.weaponsUnlocked : ["sword"];
    return list.includes(weaponId);
  };

  const priceOf = (weaponId) => UNLOCK_PRICE[weaponId] || 0;

  const render = () => {
    const meta = getState().meta || {};
    const shards = Number(meta.shards) || 0;
    const w = weaponsData[selected];
    const selectedUnlocked = isUnlocked(selected);
    const selectedPrice = priceOf(selected);

    const cards = CARD_ORDER.map((id) => {
      const weapon = weaponsData[id];
      if (!weapon) return "";
      const unlocked = isUnlocked(id);
      const sel = selected === id ? "ws__card--selected" : "";
      const lock = !unlocked ? "ws__card--locked" : "";
      const price = priceOf(id);
      const lockOverlayHTML = !unlocked
        ? `<div class="ws__lock-overlay">
             <div class="ws__lock-icon">\ud83d\udd12</div>
             <div class="ws__lock-price">\ud83d\udc8e ${price.toLocaleString("en-US")}</div>
           </div>`
        : "";
      const freeChipHTML = (id === "sword" && !isDemo)
        ? `<div class="ws__free-chip">FREE</div>`
        : "";
      // Use the idle PNG as the card art. Path matches public/assets/{id}_idle.png
      // which Vite serves directly under /assets/ in dev + prod.
      return `
        <div class="ws__card ${sel} ${lock}" role="button" tabindex="0" data-action="select" data-weapon="${id}">
          <div class="ws__art">
            <img class="ws__art-img" src="/assets/${id}_idle.png" alt="${weapon.name}" draggable="false" />
            ${lockOverlayHTML}
            ${freeChipHTML}
          </div>
          <div class="ws__card-name">${weapon.name}</div>
          <div class="ws__card-identity">${weapon.identity}</div>
        </div>`;
    }).join("");

    // Bottom CTA button (3 states): BEGIN / UNLOCK / NEED MORE.
    let ctaHTML;
    if (selectedUnlocked) {
      ctaHTML = `
        <button class="btn btn--primary ws__begin" data-action="begin">
          BEGIN RUN WITH ${w.name.toUpperCase()}
        </button>`;
    } else if (shards >= selectedPrice) {
      ctaHTML = `
        <button class="btn ws__unlock" data-action="unlock" data-weapon="${selected}">
          \ud83d\udd12 UNLOCK ${w.name.toUpperCase()} FOR \ud83d\udc8e ${selectedPrice.toLocaleString("en-US")}
        </button>`;
    } else {
      const need = selectedPrice - shards;
      ctaHTML = `
        <button class="btn ws__unlock ws__unlock--disabled" disabled>
          \ud83d\udd12 UNLOCK FOR \ud83d\udc8e ${selectedPrice.toLocaleString("en-US")}
        </button>
        <div class="ws__cta-sub">Need \ud83d\udc8e ${need.toLocaleString("en-US")} more shards</div>`;
    }

    // P4 fix: preserve scroll position across re-renders so tapping a card
    // (which rebuilds innerHTML) doesn't snap the page back to top.
    const prevScroll = root.firstElementChild ? root.firstElementChild.scrollTop : 0;
    root.innerHTML = `
      <div class="weapon-select">
        <div class="ws__shards" aria-label="Shards: ${shards}">
          <span class="ws__shards-icon">\ud83d\udc8e</span>
          <span class="ws__shards-val">${shards.toLocaleString("en-US")}</span>
        </div>
        <button class="ws__back" data-action="back">&larr; Back</button>
        <div class="ws__title">CHOOSE YOUR WEAPON</div>
        <p class="ws__mode">${isDemo ? "DEMO MODE \u00b7 all weapons unlocked" : "FULL RUN"}</p>
        <div class="ws__grid">${cards}</div>
        <div class="ws__panel">
          <div class="ws__stats">
            <span>SLASH</span><strong>${w.stats.slash_dmg}</strong>
            <span>COUNTER</span><strong>${w.stats.counter_win_dmg}</strong>
            <span>GUARD</span><strong>${w.stats.guard_dmg_reduction_pct}%</strong>
            <span>${w.weapon_skill.name.toUpperCase()}</span><strong>${w.stats.ws_cost}e</strong>
          </div>
          <div class="ws__passive"><strong>${w.passive.name}:</strong> ${w.passive.description}</div>
          <div class="ws__ult"><strong>ULT - ${w.ultimate.name} (${w.ultimate.cost}):</strong> ${w.ultimate.description}</div>
        </div>
        ${ctaHTML}
      </div>`;
    // Restore scroll position on the freshly-rendered .weapon-select wrapper.
    if (prevScroll > 0 && root.firstElementChild) {
      root.firstElementChild.scrollTop = prevScroll;
    }
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    if (action === "back") {
      mountScene("lobby", root);
      return;
    }
    if (action === "select") {
      // Locked weapons ARE selectable now -- selecting reveals stats + the
      // unlock CTA. Without this, locked cards were dead, killing the
      // decision-tension preview.
      const id = t.dataset.weapon;
      if (!weaponsData[id]) return;
      selected = id;
      render();
      return;
    }
    if (action === "unlock") {
      const id = t.dataset.weapon;
      const weapon = weaponsData[id];
      if (!weapon) return;
      const price = priceOf(id);
      if (price <= 0) return;
      const meta = getState().meta || {};
      const shards = Number(meta.shards) || 0;
      if (shards < price) return;
      if (isUnlocked(id)) return;
      const ok = confirm(`Unlock ${weapon.name} for ${price} shards?\nThis is permanent and cannot be undone.`);
      if (!ok) return;
      const list = Array.isArray(meta.weaponsUnlocked) ? meta.weaponsUnlocked : ["sword"];
      const nextList = list.includes(id) ? list : [...list, id];
      setState({
        meta: {
          ...meta,
          shards: shards - price,
          weaponsUnlocked: nextList,
        },
      });
      console.log(`[weapon-unlock] ${id} unlocked for ${price} shards`);
      // Keep selection on the just-unlocked weapon so the CTA morphs into
      // BEGIN RUN WITH XXX -- one-tap-to-start dopamine.
      selected = id;
      render();
      return;
    }
    if (action === "begin") {
      // Safety: don't let a still-locked weapon start a run (shouldn't be
      // possible via UI, but defend against state edge-cases).
      if (!isUnlocked(selected)) return;
      setState({ run: { ...getState().run, weapon: selected } });
      console.log(`[run] start mode=${run.mode} weapon=${selected}`);
      mountScene("map", root);
      return;
    }
  };

  root.addEventListener("click", onClick);
  render();
  return () => root.removeEventListener("click", onClick);
}
