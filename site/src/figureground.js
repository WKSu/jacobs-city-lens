import { roleColor, ROLE_LABEL } from "./theme.js";
import { CONDITIONS } from "./tests.js";
import { districtRows } from "./scorecard.js";

// Same-scale plans of each district, in the scorecard's order, each with the
// four conditions underneath (filled when most of its hexagons meet one).
export function renderFigureGround(el, city, fg, hex) {
  const rows = districtRows(city, hex);
  const order = rows.length ? rows.map((r) => r.a) : city.areas;
  el.innerHTML = order.map((a) => {
    const d = fg[a.id];
    if (!d) return "";
    const s = d.size_m;
    const r = rows.find((x) => x.a.id === a.id);
    return `<figure class="fg-card">
      <svg viewBox="0 0 ${s} ${s}" role="img" aria-label="Buildings and streets in ${a.label}, ${s} by ${s} metres">
        <path d="${d.streets.join(" ")}" fill="none" stroke="var(--fg-street)" stroke-width="2" />
        <path d="${d.buildings.join(" ")}" fill="var(--fg-building)" fill-rule="evenodd" />
        <path d="${d.outline}" fill="none" stroke="${roleColor(a.role)}" stroke-width="4" stroke-dasharray="${a.role === "planned" ? "14 10" : ""}" />
        <line x1="${s - 220}" x2="${s - 20}" y1="${s - 24}" y2="${s - 24}" stroke="var(--text-primary)" stroke-width="4" />
        <text x="${s - 120}" y="${s - 36}" text-anchor="middle" font-size="28" fill="var(--text-primary)">200 m</text>
      </svg>
      <figcaption>
        <h3>${a.label}</h3>
        <span class="role"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:${roleColor(a.role)}"></span>${ROLE_LABEL[a.role]}</span>
        <p class="note">${a.note}</p>
        ${r ? `<ul class="fg-conds">${CONDITIONS.map((c) => `<li class="${r.share(c) >= 0.5 ? "on" : ""}">${c.label}</li>`).join("")}</ul>` : ""}
      </figcaption>
    </figure>`;
  }).join("");
}
