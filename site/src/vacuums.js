import { select, scaleLinear, max, line } from "d3";
import { token } from "./theme.js";

const MEASURES = {
  places: { key: "places_per_ha", label: "places per ha" },
  addresses: { key: "addresses_per_ha", label: "addresses per ha" },
};

// Small multiples: activity in 50 m bands from the edge of each kind of vacuum,
// against the city-wide level (dashed). A line that climbs left to right is
// Jacobs' border vacuum.
export function renderVacuums(el, controlsEl, tooltip, city, measure = "places") {
  const v = city.vacuums;
  if (!v) { el.innerHTML = ""; controlsEl.innerHTML = ""; return; }
  controlsEl.innerHTML = Object.entries(MEASURES).map(([id, m]) =>
    `<button class="chip" role="radio" data-v="${id}" aria-checked="${id === measure}">${m.label}</button>`).join("");
  controlsEl.querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => renderVacuums(el, controlsEl, tooltip, city, b.dataset.v)));

  const key = MEASURES[measure].key;
  const cityLevel = v.decay.find((r) => r.kind === "city")?.[key];
  const kinds = Object.keys(v.labels).filter((k) => v.decay.some((r) => r.kind === k));
  const yMax = max(v.decay.filter((r) => r.kind !== "city"), (r) => r[key]) * 1.05;

  el.innerHTML = kinds.map((k) => `<figure class="sm-card" data-k="${k}">
    <figcaption><b>${v.labels[k]}</b><span>${Math.round(v.area_ha[k] ?? 0).toLocaleString()} ha</span></figcaption>
  </figure>`).join("");

  for (const k of kinds) {
    const card = el.querySelector(`[data-k="${k}"]`);
    const rows = v.decay.filter((r) => r.kind === k && r[key] !== null);
    const width = Math.max(card.clientWidth - 24, 200), height = 150;
    const m = { top: 10, right: 8, bottom: 26, left: 32 };
    const x = scaleLinear().domain([0, 400]).range([m.left, width - m.right]);
    const y = scaleLinear().domain([0, yMax]).nice().range([height - m.bottom, m.top]);
    const svg = select(card).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
      .attr("aria-label", `${MEASURES[measure].label} by distance from ${v.labels[k]}`);

    const axis = svg.append("g").attr("class", "axis");
    for (const t of y.ticks(3)) {
      axis.append("line").attr("x1", m.left).attr("x2", width - m.right).attr("y1", y(t)).attr("y2", y(t));
      axis.append("text").attr("x", m.left - 6).attr("y", y(t) + 4).attr("text-anchor", "end").text(t);
    }
    for (const t of [0, 100, 200, 300, 400]) {
      axis.append("text").attr("x", x(t)).attr("y", height - 8).attr("text-anchor", "middle")
        .text(t === 400 ? "400 m" : t);
    }
    if (cityLevel != null) {
      svg.append("line").attr("x1", x(0)).attr("x2", x(400)).attr("y1", y(cityLevel)).attr("y2", y(cityLevel))
        .attr("stroke", "var(--text-muted)").attr("stroke-dasharray", "4 3");
    }
    const mid = (r) => (r.band_lo + r.band_hi) / 2;
    svg.append("path").datum(rows).attr("fill", "none").attr("stroke", token("series-1")).attr("stroke-width", 2)
      .attr("d", line().x((r) => x(mid(r))).y((r) => y(r[key])));
    svg.append("g").selectAll("circle").data(rows).join("circle")
      .attr("cx", (r) => x(mid(r))).attr("cy", (r) => y(r[key])).attr("r", 3.5)
      .attr("fill", token("series-1")).attr("stroke", "var(--surface-1)").attr("stroke-width", 1.5);
    svg.append("g").selectAll("rect").data(rows).join("rect")
      .attr("x", (r) => x(r.band_lo)).attr("width", (r) => x(r.band_hi) - x(r.band_lo))
      .attr("y", m.top).attr("height", height - m.top - m.bottom).attr("fill", "transparent")
      .on("mousemove", (e, r) => {
        tooltip.innerHTML = `<div class="t-title">${v.labels[k]}, ${r.band_lo}–${r.band_hi} m</div><table>
          <tr><td>${MEASURES[measure].label}</td><td class="v">${r[key].toFixed(1)}</td></tr>
          <tr><td>City-wide</td><td class="v">${cityLevel.toFixed(1)}</td></tr>
          <tr><td>Land in band</td><td class="v">${Math.round(r.land_ha)} ha</td></tr></table>`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
        tooltip.style.top = `${e.clientY + 10}px`;
      })
      .on("mouseleave", () => { tooltip.hidden = true; });
  }
}
