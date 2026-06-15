// src/scenes/mystery.js
//
// v3.0 MYS: Mystery node scene per Bible §8 + Design Lock v2.3 Q3.
//
// On mount we roll one of 6 events from MYSTERY_EVENTS, render its blurb +
// describeOffer(), and show action buttons:
//   PRIMARY   -- main action (event-specific). Calls event.primary.apply()
//   SECONDARY -- alt action if event defines one (Hidden Vault: take gold,
//                Bandit Ambush: flee for 10g). Falls back to LEAVE if absent.
//
// After an action is committed we show a result line + CONTINUE button that
// returns to the map. Bandit Ambush fight transitions directly to battle scene.

import { mountScene } from "./sceneManager.js";
import { getState, setState } from "../state/store.js";
import { MYSTERY_EVENTS, rollMysteryEvent } from "../data/mysteryEvents.js";

export function mysteryScene(root) {
  const run = getState().run;
  if (!run || !run.map) {
    root.innerHTML = `<div class="mystery__error">No active run.</div>`;
    return () => {};
  }

  // Roll event once and stash for this scene mount. Call initCtx if present.
  let event = rollMysteryEvent();
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
      if (event.primary.isDisabled && event.primary.isDisabled(cur, ctx)) return;
      const result = event.primary.apply(cur, ctx);
      setState({ run: result.run });
      resolved = true;
      resultMsg = result.message || "";

      if (result.transition) {
        mountScene(result.transition.scene, root, result.transition.opts || {});
        return;
      }
      render();
      return;
    }

    if (action === "mystery-secondary") {
      if (resolved) return;
      const cur = getState().run;
      if (event.secondary && event.secondary.isDisabled && event.secondary.isDisabled(cur, ctx)) return;
      if (event.secondary && event.secondary.apply) {
        const result = event.secondary.apply(cur, ctx);
        setState({ run: result.run });
        resolved = true;
        resultMsg = result.message || "";

        if (result.transition) {
          mountScene(result.transition.scene, root, result.transition.opts || {});
          return;
        }
        render();
        return;
      }
      // No secondary apply = just leave.
      mountScene("map", root);
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

  // Secondary button: use event.secondary if defined, else generic LEAVE.
  let secondaryBtn;
  if (event.secondary) {
    const secLabel = typeof event.secondary.label === "function"
      ? event.secondary.label(ctx)
      : event.secondary.label;
    const secDisabled = event.secondary.isDisabled && event.secondary.isDisabled(run, ctx);
    const secClass = secDisabled ? "btn btn--secondary mystery__btn" : "btn btn--secondary mystery__btn";
    const secAttr = secDisabled ? "disabled" : `data-action="mystery-secondary"`;
    secondaryBtn = `<button class="${secClass}" ${secAttr}>${secLabel}</button>`;
  } else if (event.secondaryDisabled) {
    secondaryBtn = ""; // forced action, no leave
  } else {
    secondaryBtn = `<button class="btn btn--secondary mystery__btn" data-action="mystery-leave">LEAVE</button>`;
  }

  // v3.0: pass run to describeOffer so Bandit Ambush can check gold.
  const offerHtml = typeof event.describeOffer === "function"
    ? event.describeOffer(ctx, run)
    : "";

  root.innerHTML = `
    <div class="mystery">
      <div class="mystery__card">
        <div class="mystery__icon">${event.icon}</div>
        <div class="mystery__name">${event.name}</div>
        <div class="mystery__blurb">${event.blurb}</div>
        <div class="mystery__offer">${offerHtml}</div>
        <div class="mystery__hp">HP: <strong>${run.playerHp || 0}</strong>/${run.playerMaxHp || 100} \u00b7 Gold: <strong>${run.gold || 0}</strong></div>
        <div class="mystery__actions">
          <button class="${primaryClass}" ${primaryAttr}>${primaryLabel}</button>
          ${secondaryBtn}
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
