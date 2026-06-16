import { mountScene } from "./sceneManager.js";
import { next as rngNext } from "../data/rng.js";
import { getState, setState } from "../state/store.js";
import { nodeTypeFor, sceneForNodeType } from "../data/floorMap.js";
import { renderRunInfoModalHTML } from "../ui/runInfoModal.js";
import { addRunGold } from "../data/runHelpers.js";
import { forgeRestHealBonus } from "../data/forgeEffects.js";

/**
 * Campfire scene (2.7b-2): HEAL / SMOKE / SHARPEN.
 *   HEAL    -> +35 HP (capped at maxHp; +0 if full)
 *   SMOKE   -> 50/50: +24 gold or -10 HP (HP capped >= 1)
 *   SHARPEN -> -5 HP (capped >= 1), pick SLASH/GUARD/COUNTER -> permanent +2 dmg for run
 *
 * Flow:
 *   1. 3 choice cards.
 *   2. Tap card -> highlight. CONFIRM CHOICE.
 *   3. HEAL/SMOKE resolve immediately -> result overlay.
 *      SHARPEN routes to sub-pick (3 action cards) -> tap -> CONFIRM SHARPEN -> result.
 *   4. CONTINUE -> advance via floorMap.
 */
export function campfireScene(root) {
  const sceneState = {
    phase: "PICK_MAIN",        // PICK_MAIN | PICK_ACTION | RESULT
    pendingChoice: null,       // "HEAL" | "SMOKE" | "SHARPEN" | null
    pendingAction: null,       // "SLASH" | "GUARD" | "COUNTER" | null  (sharpen sub-pick)
    resolved: null,            // { kind, text } once finalized
    showRunInfo: false,        // 2.7d batch4: custom modal flag
  };

  const advance = () => {
    // 2.7d M3: return to map.
    mountScene("map", root);
  };

  const resolveMainChoice = () => {
    if (!sceneState.pendingChoice) return;
    if (sceneState.pendingChoice === "SHARPEN") {
      sceneState.phase = "PICK_ACTION";
      render();
      return;
    }
    const cur = getState().run || {};
    const maxHp = cur.playerMaxHp || 100;
    const hp = cur.playerHp || maxHp;
    const gold = cur.gold || 0;
    const newRun = { ...cur };

    if (sceneState.pendingChoice === "HEAL") {
      // M5b: Survival T2 forge -- REST bonus on top of the base +35.
      // Forged => +25 extra (so a 100-HP run heals 60 total, mirrors "60%").
      const meta = getState().meta || {};
      const baseHeal = 35;
      const bonusHeal = forgeRestHealBonus(meta);
      const totalHeal = baseHeal + bonusHeal;
      const newHp = Math.min(maxHp, hp + totalHeal);
      const real = newHp - hp;
      newRun.playerHp = newHp;
      const bonusTag = bonusHeal > 0 ? " (Forge: +25 bonus)" : "";
      sceneState.resolved = {
        kind: "HEAL",
        text: real > 0
          ? `+${real} HP recovered${bonusTag} (now ${newHp}/${maxHp})`
          : `+0 HP (already full at ${maxHp}/${maxHp})`,
      };
    } else if (sceneState.pendingChoice === "SMOKE") {
      const win = rngNext() < 0.5;
      if (win) {
        addRunGold(newRun, 24); // M2: also bumps totalGoldEarned
        sceneState.resolved = { kind: "SMOKE_WIN", text: `+24 gold (lucky -- now ${newRun.gold})` };
      } else {
        const newHp = Math.max(1, hp - 10);
        const real = hp - newHp;
        newRun.playerHp = newHp;
        sceneState.resolved = { kind: "SMOKE_LOSE", text: `-${real} HP (the smoke turns toxic -- now ${newHp}/${maxHp})` };
      }
    }
    sceneState.phase = "RESULT";
    setState({ run: newRun });
    render();
  };

  const resolveSharpen = () => {
    if (!sceneState.pendingAction) return;
    const cur = getState().run || {};
    const maxHp = cur.playerMaxHp || 100;
    const hp = cur.playerHp || maxHp;
    const newRun = { ...cur };
    // -5 HP cost (capped at HP 1)
    const newHp = Math.max(1, hp - 5);
    const realLoss = hp - newHp;
    newRun.playerHp = newHp;
    // Apply +2 dmg buff to picked action (stack)
    const buffs = { ...(cur.actionBuffs || {}) };
    const key = sceneState.pendingAction.toLowerCase();
    buffs[key] = (buffs[key] || 0) + 2;
    newRun.actionBuffs = buffs;
    sceneState.resolved = {
      kind: "SHARPEN",
      text: `${sceneState.pendingAction} +2 dmg (now +${buffs[key]} for run) -- -${realLoss} HP (now ${newHp}/${maxHp})`,
    };
    sceneState.phase = "RESULT";
    setState({ run: newRun });
    render();
  };

  // Compute action base dmg for sub-pick preview, using the current run's weapon.
  // Falls back gracefully if weapon stats not present.
  const getActionPreview = () => {
    const cur = getState().run || {};
    const buffs = cur.actionBuffs || {};
    // Best-effort base dmg per weapon (mirrors weapons.json defaults).
    const baseByWeapon = {
      sword:  { SLASH: 10, GUARD: 6, COUNTER: 14 },
      spear:  { SLASH: 10, GUARD: 6, COUNTER: 16 },
      axe:    { SLASH: 13, GUARD: 6, COUNTER: 14 },
      staff:  { SLASH: 8,  GUARD: 6, COUNTER: 14 },
    };
    const wid = cur.weapon || "sword";
    const base = baseByWeapon[wid] || baseByWeapon.sword;
    return ["SLASH", "GUARD", "COUNTER"].map((act) => {
      const b = base[act];
      const buff = buffs[act.toLowerCase()] || 0;
      const next = b + buff + 2; // after this sharpen
      const cur2 = b + buff;
      return { action: act, current: cur2, next };
    });
  };

  const render = () => {
    const cur = getState().run || {};
    const floor = cur.floor || 1;
    const floorMax = cur.floorMax || 9;
    const hp = cur.playerHp || cur.playerMaxHp || 100;
    const maxHp = cur.playerMaxHp || 100;
    const gold = cur.gold || 0;

    let body;
    if (sceneState.phase === "RESULT") {
      const r = sceneState.resolved;
      const iconMap = {
        HEAL: "\u{1FA79}", SMOKE_WIN: "\u{1F4B0}", SMOKE_LOSE: "\u{1F4A8}", SHARPEN: "\u{1F5E1}\u{FE0F}",
      };
      const titleMap = {
        HEAL: "HEALED", SMOKE_WIN: "FORTUNE", SMOKE_LOSE: "TOXIC SMOKE", SHARPEN: "SHARPENED",
      };
      const flavorMap = {
        HEAL: "You rest by the fire. Your wounds knit shut.",
        SMOKE_WIN: "The smoke shows you a glint of treasure.",
        SMOKE_LOSE: "The smoke fills your lungs. You stagger.",
        SHARPEN: "You drag your blade across the whetstone. The edge bites deeper.",
      };
      body = `
        <div class="b-campfire__result">
          <div class="node-stub__icon">${iconMap[r.kind]}</div>
          <div class="node-stub__title">${titleMap[r.kind]}</div>
          <div class="b-campfire__result-text">${r.text}</div>
          <div class="b-campfire__result-flavor"><em>${flavorMap[r.kind]}</em></div>
          <button class="btn btn--primary node-stub__continue" data-action="continue">CONTINUE</button>
        </div>`;
    } else if (sceneState.phase === "PICK_ACTION") {
      const previews = getActionPreview();
      const cards = previews.map((p) => {
        const sel = sceneState.pendingAction === p.action ? "b-campfire__choice--selected" : "";
        return `
          <button class="b-campfire__choice b-campfire__choice--sharpen ${sel}" data-action="pick-action" data-act="${p.action}">
            <span class="b-campfire__choice-icon">${p.action === "SLASH" ? "\u{2694}\u{FE0F}" : p.action === "GUARD" ? "\u{1F6E1}\u{FE0F}" : "\u{1F300}"}</span>
            <span class="b-campfire__choice-name">${p.action}</span>
            <span class="b-campfire__choice-effect">${p.current} -> ${p.next} dmg</span>
            <span class="b-campfire__choice-flavor">Permanent +2 for run</span>
          </button>`;
      }).join("");
      const disabled = sceneState.pendingAction ? "" : "disabled";
      const label = sceneState.pendingAction ? "CONFIRM SHARPEN" : "PICK AN ACTION";
      body = `
        <div class="node-stub__icon">\u{1F5E1}\u{FE0F}</div>
        <div class="node-stub__title">SHARPEN WHICH?</div>
        <div class="node-stub__desc">-5 HP cost. Pick the action to permanently buff.</div>
        <div class="b-campfire__choices">${cards}</div>
        <div class="b-campfire__action-row">
          <button class="btn btn--secondary" data-action="back-main">BACK</button>
          <button class="btn btn--primary" data-action="confirm-sharpen" ${disabled}>${label}</button>
        </div>
      `;
    } else {
      // PICK_MAIN
      const healSel = sceneState.pendingChoice === "HEAL" ? "b-campfire__choice--selected" : "";
      const smokeSel = sceneState.pendingChoice === "SMOKE" ? "b-campfire__choice--selected" : "";
      const sharpSel = sceneState.pendingChoice === "SHARPEN" ? "b-campfire__choice--selected" : "";
      const disabled = sceneState.pendingChoice ? "" : "disabled";
      const label = sceneState.pendingChoice ? "CONFIRM CHOICE" : "PICK ONE";
      body = `
        <div class="node-stub__icon">\u{1F525}</div>
        <div class="node-stub__title">CAMPFIRE</div>
        <div class="node-stub__desc">A safe place to rest. The fire crackles. The smoke whispers. The whetstone waits.</div>
        <div class="b-campfire__choices">
          <button class="b-campfire__choice b-campfire__choice--heal ${healSel}" data-action="pick-main" data-choice="HEAL">
            <span class="b-campfire__choice-icon">\u{1FA79}</span>
            <span class="b-campfire__choice-name">HEAL</span>
            <span class="b-campfire__choice-effect">+35 HP</span>
            <span class="b-campfire__choice-flavor">Safe. No risk.</span>
          </button>
          <button class="b-campfire__choice b-campfire__choice--smoke ${smokeSel}" data-action="pick-main" data-choice="SMOKE">
            <span class="b-campfire__choice-icon">\u{1F4A8}</span>
            <span class="b-campfire__choice-name">SMOKE</span>
            <span class="b-campfire__choice-effect">50/50: +24 gold or -10 HP</span>
            <span class="b-campfire__choice-flavor">Gamble with the smoke.</span>
          </button>
          <button class="b-campfire__choice b-campfire__choice--sharpen ${sharpSel}" data-action="pick-main" data-choice="SHARPEN">
            <span class="b-campfire__choice-icon">\u{1F5E1}\u{FE0F}</span>
            <span class="b-campfire__choice-name">SHARPEN</span>
            <span class="b-campfire__choice-effect">-5 HP, pick SLASH/GUARD/COUNTER: +2 dmg permanent</span>
            <span class="b-campfire__choice-flavor">Bleed now. Hit harder forever.</span>
          </button>
        </div>
        <button class="btn btn--primary node-stub__continue" data-action="confirm-main" ${disabled}>${label}</button>
      `;
    }

    // 2.7d batch4: RUN INFO custom modal (same shell as battle scene).
    const buffsObj = cur.actionBuffs || {};
    const buffStr = Object.entries(buffsObj).filter(([,v]) => v > 0)
      .map(([k,v]) => `${k.toUpperCase()} +${v}`).join(", ") || "none";
    const runInfoModal = sceneState.showRunInfo ? renderRunInfoModalHTML({
      sections: [
        { rows: [
          ["Mode", cur.mode || "demo"],
          ["Floor", `${floor}/${floorMax}`],
          ["Gold", gold],
        ]},
        { title: "CARRY-OVER (LIVE)", rows: [
          ["HP", `${hp}/${maxHp}`],
          ["Energy", cur.energy || 0],
          ["SHARPEN buffs", buffStr],
          ["STUDY uses left", `${cur.readUses || 0}/4`],
        ]},
      ],
      relicIds: cur.relics || [],
    }) : "";

    root.innerHTML = `
      <div class="b-screen node-stub node-stub--campfire">
        <div class="b-header">
          <button class="b-icon-btn" data-action="surrender">LEAVE</button>
          <div class="b-stage">CH1 - FLOOR ${floor}/${floorMax}</div>
          <button class="b-icon-btn b-runinfo" data-action="run-info">RUN INFO</button>
        </div>
        <div class="node-stub__body">
          ${body}
        </div>
        <div class="b-footer">
          <div class="b-hpgold">HP ${hp}/${maxHp} - Gold ${gold}</div>
        </div>
        ${runInfoModal}
      </div>
    `;
  };

  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "pick-main") {
      if (sceneState.phase !== "PICK_MAIN") return;
      sceneState.pendingChoice = t.dataset.choice;
      render();
    } else if (a === "confirm-main") {
      resolveMainChoice();
    } else if (a === "pick-action") {
      if (sceneState.phase !== "PICK_ACTION") return;
      sceneState.pendingAction = t.dataset.act;
      render();
    } else if (a === "confirm-sharpen") {
      resolveSharpen();
    } else if (a === "back-main") {
      sceneState.phase = "PICK_MAIN";
      sceneState.pendingAction = null;
      render();
    } else if (a === "continue") {
      advance();
    } else if (a === "surrender") {
      if (confirm("Leave run and return to lobby?")) {
        setState({ run: null });
        mountScene("lobby", root);
      }
    } else if (a === "run-info") {
      sceneState.showRunInfo = true;
      render();
    } else if (a === "runinfo-close") {
      sceneState.showRunInfo = false;
      render();
    } else if (a === "runinfo-stop") {
      // swallow clicks inside modal card
    }
  };

  render();
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}
