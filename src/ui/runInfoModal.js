// 2.7d batch4: shared RUN INFO modal helper.
// Used by shop.js, campfire.js, treasure.js so they all show the SAME custom modal
// (matches the in-battle one). Battle.js still inlines its own version because it
// has combat-only LIVE STATE fields; the visual shell + relic rendering matches.

import relicsData from "../data/relics.json";

const _esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const _tierIcon = (t) => t === "epic" ? "\u2728" : (t === "rare" ? "\u2734\ufe0f" : "\u25c6");

let _relicMap = null;
function _getRelicMap() {
  if (_relicMap) return _relicMap;
  const all = [
    ...(relicsData.commons || []),
    ...(relicsData.rares   || []),
    ...(relicsData.epics   || []),
    ...(relicsData.special || []),
  ];
  _relicMap = {};
  all.forEach((r) => { _relicMap[r.id] = r; });
  return _relicMap;
}

/** Render the relics list HTML (one block per relic: tier-icon + name + italic desc). */
export function renderRelicListHTML(relicIds) {
  const rls = relicIds || [];
  if (rls.length === 0) {
    return `<div class="b-modal__row b-modal__row--muted">none yet</div>`;
  }
  const map = _getRelicMap();
  return rls.map((rid) => {
    const r = map[rid];
    if (!r) {
      return `<div class="b-modal__row b-modal__row--relic">- ${_esc(rid)}</div>`;
    }
    return `<div class="b-modal__row b-modal__row--relic">
      <div class="b-modal__relic-name">${_tierIcon(r.tier)} ${_esc(r.name)}</div>
      <div class="b-modal__relic-desc">${_esc(r.description || "")}</div>
    </div>`;
  }).join("");
}

/**
 * Render full RUN INFO modal HTML (backdrop + card + close button).
 *
 * @param {object} opts
 * @param {Array<{title?:string, rows:Array<[string,string|number]>}>} opts.sections
 * @param {string[]} opts.relicIds
 * @param {string} [opts.closeAction] data-action used for backdrop + CLOSE button
 * @param {string} [opts.stopAction]  data-action used to swallow clicks inside the card
 */
export function renderRunInfoModalHTML({
  sections = [],
  relicIds = [],
  closeAction = "runinfo-close",
  stopAction  = "runinfo-stop",
}) {
  const sectionsHtml = sections.map((s) => {
    const sub = s.title ? `<div class="b-modal__sub">${_esc(s.title)}</div>` : "";
    const rowsHtml = (s.rows || []).map(([k, v]) =>
      `<div class="b-modal__row"><span>${_esc(k)}</span><strong>${_esc(v)}</strong></div>`
    ).join("");
    return `<div class="b-modal__section">${sub}${rowsHtml}</div>`;
  }).join("");

  const relicCount = (relicIds || []).length;
  const relicHtml = renderRelicListHTML(relicIds);

  return `
    <div class="b-modal-bg" data-action="${closeAction}">
      <div class="b-modal b-modal--info" data-action="${stopAction}">
        <div class="b-modal__title">RUN INFO</div>
        <div class="b-modal__body">
          ${sectionsHtml}
          <div class="b-modal__section">
            <div class="b-modal__sub">RELICS (${relicCount})</div>
            ${relicHtml}
          </div>
        </div>
        <div class="b-modal__actions">
          <button class="btn btn--primary" data-action="${closeAction}">CLOSE</button>
        </div>
      </div>
    </div>`;
}
