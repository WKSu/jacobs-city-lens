import { roleColor, ROLE_LABEL } from "./theme.js";
import { withUnit } from "./format.js";

const STATS = ["intersection_density", "units_per_ha", "use_mix"];

export function renderFigureGround(el, city, fg) {
  const metrics = Object.fromEntries(city.metrics.map((m) => [m.id, m]));
  const order = [...city.areas].sort((a, b) => (a.role === b.role ? 0 : a.role === "jacobs" ? -1 : 1));
  el.innerHTML = order.map((a) => {
    const d = fg[a.id];
    if (!d) return "";
    const s = d.size_m;
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
        <div class="fg-stats">${STATS.map((id) => `<div><b>${withUnit({ ...metrics[id], unit: "share" }, a.metrics[id].median)}</b>${metrics[id].label}${metrics[id].unit === "0–1" ? "" : ` (${metrics[id].unit})`}</div>`).join("")}</div>
      </figcaption>
    </figure>`;
  }).join("");
}
