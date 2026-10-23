import { select, scaleLinear } from "d3";
import { roleColor, ROLE_LABEL } from "./theme.js";
import { withUnit } from "./format.js";
import { STORIES } from "./stories.js";

// Dot plot: one row per metric, x = city percentile (oriented so right = more
// Jacobsian), one dot per study area coloured by role. Unless showAll, only each
// idea's lead measure is drawn, so the chart reads at a glance.
export function renderProfile(el, legendEl, tableEl, tooltip, city, showAll = false) {
  const metrics = city.metrics.filter((m) => (m.layer ?? "hex") === "hex");
  const generators = city.generators.filter((g) => metrics.some((m) => m.generator === g.id));
  const rows = [];
  for (const g of generators) {
    const own = metrics.filter((m) => m.generator === g.id);
    const lead = own.find((m) => m.id === STORIES[g.id]?.lead) || own[0];
    rows.push({ type: "group", g });
    for (const m of showAll ? own : [lead]) rows.push({ type: "metric", m });
  }

  const rowH = 30, groupH = 28, labelW = 300, right = 24, top = 24;
  const width = Math.max(el.clientWidth, 320);
  const narrow = width < 640;
  const lw = narrow ? 0 : labelW;
  let y = top;
  for (const r of rows) {
    if (narrow && r.type === "metric") y += 16;
    r.y = y + (r.type === "group" ? groupH - 8 : rowH / 2);
    y += r.type === "group" ? groupH : rowH;
  }
  const height = y + 8;
  const x = scaleLinear().domain([0, 100]).range([lw + 8, width - right]);

  const svg = select(el).html("").append("svg").attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img").attr("aria-label", "District profiles: city percentile for each metric");

  const axis = svg.append("g").attr("class", "axis");
  for (const t of [0, 25, 50, 75, 100]) {
    axis.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", top - 4).attr("y2", height - 8)
      .attr("stroke-dasharray", t === 50 ? null : "2 3");
    axis.append("text").attr("x", x(t)).attr("y", top - 10).attr("text-anchor", "middle")
      .text(t === 50 ? "city median" : t === 100 ? "most Jacobsian" : t === 0 ? "least" : `${t}`);
  }

  for (const r of rows) {
    if (r.type === "group") {
      svg.append("text").attr("class", "group-label").attr("x", 0).attr("y", r.y).text(r.g.label);
      continue;
    }
    const m = r.m;
    svg.append("text").attr("class", "row-label")
      .attr("x", narrow ? x(0) : lw).attr("y", narrow ? r.y - 12 : r.y + 4)
      .attr("text-anchor", narrow ? "start" : "end")
      .text(m.direction === "lower" ? `${m.label} (${m.unit === "m" ? "shorter" : "smaller"} is better)` : m.label);
    svg.append("line").attr("x1", x(0)).attr("x2", x(100)).attr("y1", r.y).attr("y2", r.y)
      .attr("stroke", "var(--grid)");
    for (const a of city.areas) {
      const v = a.metrics[m.id];
      if (v.percentile === null) continue;
      const g = svg.append("g").attr("class", "dot").attr("data-area", a.id);
      g.append("circle").attr("cx", x(v.percentile)).attr("cy", r.y).attr("r", 6)
        .attr("fill", roleColor(a.role)).attr("stroke", "var(--surface-1)").attr("stroke-width", 2);
      // larger invisible hit target
      g.append("circle").attr("cx", x(v.percentile)).attr("cy", r.y).attr("r", 12).attr("fill", "transparent")
        .on("mousemove", (e) => {
          tooltip.innerHTML = `<div class="t-title">${a.label}</div><table>
            <tr><td>${m.label}</td><td class="v">${withUnit(m, v.median)}</td></tr>
            <tr><td>City percentile</td><td class="v">${Math.round(v.percentile)}</td></tr></table>
            <div class="source">${ROLE_LABEL[a.role]}</div>`;
          tooltip.hidden = false;
          tooltip.style.left = `${e.clientX + 14}px`;
          tooltip.style.top = `${e.clientY + 10}px`;
          highlight(svg, a.id);
        })
        .on("mouseleave", () => { tooltip.hidden = true; highlight(svg, null); });
    }
  }

  legendEl.innerHTML = ["jacobs", "planned"].map((role) =>
    `<span class="key"><span class="dot" style="background:${roleColor(role)}"></span>${ROLE_LABEL[role]}: ${
      city.areas.filter((a) => a.role === role).map((a) => a.label).join(", ")}</span>`).join("");

  tableEl.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Metric</th>${
    city.areas.map((a) => `<th>${a.label}</th>`).join("")}<th>City median</th></tr></thead><tbody>${
    metrics.map((m) => `<tr><td>${m.label}</td>${city.areas.map((a) =>
      `<td>${withUnit(m, a.metrics[m.id].median)}</td>`).join("")}<td>${withUnit(m, city.city_median[m.id])}</td></tr>`).join("")
  }</tbody></table></div>`;
}

function highlight(svg, areaId) {
  svg.selectAll("g.dot").attr("opacity", function () {
    return areaId === null || this.dataset.area === areaId ? 1 : 0.25;
  });
}
