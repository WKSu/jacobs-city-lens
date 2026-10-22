import { select, scaleLog, scaleLinear, extent } from "d3";
import { roleColor, ROLE_LABEL, token } from "./theme.js";
import { formatter, withUnit } from "./format.js";

// Scatter: one dot per park, size on a log x axis, a measure of its surroundings
// on y. Parks inside a study area take that district's colour.
export function renderParks(el, controlsEl, legendEl, tooltip, city, parks, metricId) {
  const metrics = city.metrics.filter((m) => m.layer === "parks");
  if (!parks?.features?.length || !metrics.length) { el.innerHTML = ""; controlsEl.innerHTML = ""; return; }
  const metric = metrics.find((m) => m.id === metricId) || metrics[0];
  controlsEl.innerHTML = metrics.map((m) =>
    `<button class="chip" role="radio" data-m="${m.id}" aria-checked="${m.id === metric.id}">${m.label}</button>`).join("");
  controlsEl.querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => renderParks(el, controlsEl, legendEl, tooltip, city, parks, b.dataset.m)));

  const areas = Object.fromEntries(city.areas.map((a) => [a.id, a]));
  legendEl.innerHTML = ["jacobs", "planned"].map((role) =>
    `<span class="key"><span class="dot" style="background:${roleColor(role)}"></span>${role === "jacobs" ? "In an old, Jacobs-style district" : "In a planned district"}</span>`).join("") +
    `<span class="key"><span class="dot" style="background:${token("text-muted")};opacity:0.45"></span>Other parks</span>`;
  const pts = parks.features.map((f) => f.properties).filter((p) => p[metric.id] !== null)
    // draw study-area parks last so they sit on top
    .sort((a, b) => (areas[a.study_area] ? 1 : 0) - (areas[b.study_area] ? 1 : 0));

  const width = Math.max(el.clientWidth, 320), height = 340;
  const m = { top: 24, right: 16, bottom: 40, left: 48 };
  const x = scaleLog().domain(extent(pts, (p) => p.area_ha)).nice().range([m.left, width - m.right]);
  const yExt = extent(pts, (p) => p[metric.id]);
  // an index starts where the parks do; counts and shares start at zero
  const y = scaleLinear().domain([metric.unit === "0–1" ? yExt[0] : 0, yExt[1]]).nice().range([height - m.bottom, m.top]);
  const f = formatter(metric);

  const svg = select(el).html("").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
    .attr("aria-label", `Parks by size and ${metric.label.toLowerCase()}`);
  const axis = svg.append("g").attr("class", "axis");
  for (const t of y.ticks(5)) {
    axis.append("line").attr("x1", m.left).attr("x2", width - m.right).attr("y1", y(t)).attr("y2", y(t));
    axis.append("text").attr("x", m.left - 6).attr("y", y(t) + 4).attr("text-anchor", "end").text(f(t));
  }
  for (const t of [0.5, 1, 2, 5, 10, 20, 50, 100, 200].filter((t) => t >= x.domain()[0] && t <= x.domain()[1])) {
    axis.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.top).attr("y2", height - m.bottom);
    axis.append("text").attr("x", x(t)).attr("y", height - m.bottom + 16).attr("text-anchor", "middle").text(t);
  }
  axis.append("text").attr("x", width - m.right).attr("y", height - 4).attr("text-anchor", "end").text("park size (ha, log scale)");
  axis.append("text").attr("x", m.left).attr("y", m.top - 4).attr("text-anchor", "start")
    .text(metric.unit && metric.unit !== "0–1" && metric.unit !== "share" ? `${metric.label} (${metric.unit})` : metric.label);

  const muted = token("text-muted");
  svg.append("g").selectAll("circle").data(pts).join("circle")
    .attr("cx", (p) => x(p.area_ha)).attr("cy", (p) => y(p[metric.id]))
    .attr("r", (p) => (areas[p.study_area] ? 6 : 4.5))
    .attr("fill", (p) => (areas[p.study_area] ? roleColor(areas[p.study_area].role) : muted))
    .attr("fill-opacity", (p) => (areas[p.study_area] ? 1 : 0.45))
    .attr("stroke", "var(--surface-1)").attr("stroke-width", 1.5)
    .on("mousemove", (e, p) => {
      const a = areas[p.study_area];
      tooltip.innerHTML = `<div class="t-title">${p.name || "Unnamed park"}</div><table>
        <tr><td>Size</td><td class="v">${p.area_ha.toFixed(1)} ha</td></tr>
        ${metrics.map((mm) => `<tr class="${mm.id === metric.id ? "active" : ""}"><td>${mm.label}</td><td class="v">${withUnit(mm, p[mm.id])}</td></tr>`).join("")}
        </table>${a ? `<div class="source">${a.label} · ${ROLE_LABEL[a.role]}</div>` : ""}`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${e.clientY + 10}px`;
    })
    .on("mouseleave", () => { tooltip.hidden = true; });
}
