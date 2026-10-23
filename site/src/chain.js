// The opening chapter: Jacobs' chain from four conditions to living streets,
// with what the data can and can't see at each link. Cards open their tab.

import { FIT_LABEL } from "./stories.js";

const CONDITIONS = [
  { tab: "mixed_uses", title: "Mixed uses", text: "Homes, work and other reasons to be there, side by side", fit: "proxy" },
  { tab: "short_blocks", title: "Short blocks", text: "Many corners, many routes", fit: "proxy" },
  { tab: "aged_buildings", title: "Aged buildings", text: "Old and new together, so some rents stay low", fit: "proxy" },
  { tab: "concentration", title: "Concentration", text: "Enough people, residents included", fit: "good" },
];

const STEPS = [
  { title: "People on the street at all hours", text: "Different people, for different reasons, at different times of day. This is what Jacobs watched from her window.", fit: "none", note: "Not in the data: described in words" },
  { title: "Shops, cafés and small firms survive", text: "With customers all day, businesses that need many passers-by can stay open.", fit: "proxy", note: "A visible trace: places on the map" },
  { title: "Safe streets and used parks", text: "People watching without meaning to, parks busy because of what is around them.", fit: "none", note: "Not in the data yet", tabs: [["eyes", "Eyes on the street"], ["parks", "Parks"]] },
];

const WEAR = [
  { tab: "border_vacuums", title: "Border vacuums", text: "Rail yards, motorways and big single uses that few people cross" },
  { tab: "cars", title: "Erosion by cars", text: "Street space given bit by bit to driving and parking" },
];

const dot = (fit) => `<span class="fit fit-${fit}" title="${FIT_LABEL[fit]}"></span>`;

export function renderChain(el, onPick) {
  el.innerHTML = `
    <div class="chain">
      <div class="chain-col">
        <div class="chain-label">Four conditions</div>
        ${CONDITIONS.map((c) => `<button type="button" class="chain-card" data-tab="${c.tab}">
          <b>${dot(c.fit)}${c.title}</b><span>${c.text}</span></button>`).join("")}
        <button type="button" class="chain-card together" data-tab="together"><b>All four together</b><span>Her central claim: none is enough alone</span></button>
      </div>
      ${STEPS.map((s) => `<div class="chain-arrow" aria-hidden="true"></div>
      <div class="chain-step">
        <b>${dot(s.fit)}${s.title}</b><span>${s.text}</span><em>${s.note}</em>
        ${(s.tabs || []).map(([tab, label]) => `<button type="button" class="chain-link" data-tab="${tab}">${label}</button>`).join("")}
      </div>`).join("")}
    </div>
    <div class="chain-wear">
      <div class="chain-label">What wears it down</div>
      ${WEAR.map((w) => `<button type="button" class="chain-card" data-tab="${w.tab}"><b>${dot("proxy")}${w.title}</b><span>${w.text}</span></button>`).join("")}
    </div>
    <div class="fit-key">${Object.entries(FIT_LABEL).map(([k, v]) => `<span>${dot(k)}${v}</span>`).join("")}</div>`;
  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => onPick(b.dataset.tab)));
}
