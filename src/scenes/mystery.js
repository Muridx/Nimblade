// src/scenes/mystery.js
//
// M9: Mystery node scene per Design Doc §6.3.
//
// On mount we roll one of 6 events from MYSTERY_EVENTS, render its blurb +
// describeOffer(), and show two buttons:
//   PRIMARY   -- accept the offer (event-specific). Calls event.primary.apply()
//   SECONDARY -- LEAVE (returns to map). Disabled for Bandit Ambush.
//
// After PRIMARY is committed we show a result line + CONTINUE button that
// returns to the map. For Bandit Ambush the apply() returns a transition
// object and we mount the battle scene directly.

import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import { MYSTERY_EVENTS, rollMysteryEvent } from "../data/mysteryEvents.js";

export function mysteryScene(root) {
  const run = getState().run;
  if (!run || !run.map) {
    root.innerHTML = `<div class="mystery__error">No active run.</div>`;
    return () => {};
  }

  // Roll event once and stash for this scene mount. We also call initCtx if
  // present (e.g. Wandering Merchant rolls its relic + price upfront).
  let event = rollMysteryEvent();
  // Guard against initCtx returning skip (e.g. relic pool exhausted) -- in
  // that edge case, re-roll a few times.
  let ctx = {};
  for (let i = 0; i < 6; i++) {
    ctx = event.initCtx ? event.initCtx(run) : {};
    if (!ctx.skip) break;
    event = rollMysteryEvent();
  }

  console.log(`[mystery] rolled event=${event.id}`, ctx);

  // Scene local state: pre-action vs post-action.
  let resolved = false;
  let resultMsg = "";

  const render = () => {
    const curRun = getState().run;
    if (!resolved) {
      renderOffer(root, event, ctx, curRun);
    } else {
      renderResult(root, event, resultMsg);
    }
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;

    if (action === "mystery-accept") {
      if (resolved) return;
      const cur = getState().run;
      // Re-check disabled state at click time (HP/gold could have changed --
      // unlikely but defensive).
      if (event.primary.isDisabled && event.primary.isDisabled(cur, ctx)) return;
      const result = event.primary.apply(cur, ctx);
      setState({ run: result.run });
      resolved = true;
      resultMsg = result.message || "";

      if (result.transition) {
        // Bandit ambush: jump straight to battle. The battle scene reads
        // run.banditAmbushPending to award a bonus relic on victory.
        mountScene(result.transition.scene, root, result.transition.opts || {});
        return;
      }
      render();
      return;
    }

    if (action === "mystery-leave" || action === "mystery-continue") {
      mountScene("map", root);
      return;
    }
  };

  root.addEventListener("click", onClick);
  render();
  return () => root.removeEventListener("click", onClick);
}

function renderOffer(root, event, ctx, run) {
  const disabled = event.primary.isDisabled && event.primary.isDisabled(run, ctx);
  const primaryLabel = typeof event.primary.label === "function"
    ? event.primary.label(ctx)
    : event.primary.label;
  const primaryClass = disabled ? "btn btn--secondary mystery__btn" : "btn btn--primary mystery__btn";
  const primaryAttr = disabled ? "disabled" : `data-action="mystery-accept"`;
  const leaveBtn = event.secondaryDisabled
    ? "" // forced fight (bandit)
    : `<button class="btn btn--secondary mystery__btn" data-action="mystery-leave">LEAVE</button>`;

  root.innerHTML = `
    <div class="mystery">
      <div class="mystery__card">
        <div class="mystery__icon">${event.icon}</div>
        <div class="mystery__name">${event.name}</div>
        <div class="mystery__blurb">${event.blurb}</div>
        <div class="mystery__offer">${event.describeOffer(ctx)}</div>
        <div class="mystery__hp">HP: <strong>${run.playerHp || 0}</strong>/${run.playerMaxHp || 100} \u00b7 Gold: <strong>${run.gold || 0}</strong></div>
        <div class="mystery__actions">
          <button class="${primaryClass}" ${primaryAttr}>${primaryLabel}</button>
          ${leaveBtn}
        </div>
      </div>
    </div>
  `;
}

function renderResult(root, event, message) {
  root.innerHTML = `
    <div class="mystery">
      <div class="mystery__card">
        <div class="mystery__icon">${event.icon}</div>
        <div class="mystery__name">${event.name}</div>
        <div class="mystery__result">${message}</div>
        <div class="mystery__actions">
          <button class="btn btn--primary mystery__btn" data-action="mystery-continue">CONTINUE</button>
        </div>
      </div>
    </div>
  `;
}
