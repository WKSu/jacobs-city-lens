import { select, scaleLinear, bin, max } from "d3";
import { token, roleColor } from "./theme.js";

const JACOBS_NET_PER_HA = 247; // 100 dwellings per net acre

// Histogram of hexagon densities with the study areas and Jacobs' threshold marked.
export function renderDensity(el, introEl, tooltip, city) {
  const values = city.distributions.units_per_ha;
  introEl.textContent = `Jacobs put the start of real city diversity at about 100 dwellings per net acre, roughly
    ${JACOBS_NET_PER_HA} per hectare. The bars count ${city.name}'s hexagons by addresses per hectare of land.
    These are gross figures (streets and parks included) and count every address, not only homes, so
    they are not directly comparable with her net threshold.`;

  const width = Math.max(el.clientWidth, 320), height = 260;
  const m = { top: 28, right: 16, bottom: 36, left: 44 };
  const xMax = Math.max(280, Math.ceil(values[values.length - 1] / 20) * 20);
  const x = scaleLinear().domain([0, xMax]).range([m.left, width - m.right]);
  const bins = bin().domain([0, xMax]).thresholds(xMax / 10)(values);
  const y = scaleLinear().domain([0, max(bins, (b) => b.length)]).nice().range([height - m.bottom, m.top]);

  const svg = select(el).html("").append("svg").attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img").attr("aria-label", "Histogram of addresses per hectare across hexagons");

  const axis = svg.append("g").attr("class", "axis");
  for (const t of y.ticks(4)) {
    axis.append("line").attr("x1", m.left).attr("x2", width - m.right).attr("y1", y(t)).attr("y2", y(t));
    axis.append("text").attr("x", m.left - 6).attr("y", y(t) + 4).attr("text-anchor", "end").text(t);
  }
  for (const t of x.ticks(width < 500 ? 4 : 8)) {
    axis.append("text").attr("x", x(t)).attr("y", height - m.bottom + 24).attr("text-anchor", "middle").text(t);
  }
  axis.append("text").attr("x", width - m.right).attr("y", height - 4).attr("text-anchor", "end")
    .text("addresses per ha (gross)");
  axis.append("text").attr("x", m.left).attr("y", m.top - 12).attr("text-anchor", "start").text("hexagons");

  const barColor = token("seq-4");
  svg.append("g").selectAll("rect").data(bins).join("rect")
    .attr("x", (b) => x(b.x0) + 1).attr("width", (b) => Math.max(0, x(b.x1) - x(b.x0) - 2))
    .attr("y", (b) => y(b.length)).attr("height", (b) => y(0) - y(b.length))
    .attr("rx", 2).attr("fill", barColor)
    .on("mousemove", (e, b) => {
      tooltip.innerHTML = `<div class="t-title">${Math.round(b.x0)}–${Math.round(b.x1)} per ha</div>${b.length} hexagons`;
      tooltip.hidden = false;
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top = `${e.clientY + 10}px`;
    })
    .on("mouseleave", () => { tooltip.hidden = true; });

  const tx = x(JACOBS_NET_PER_HA);
  svg.append("line").attr("x1", tx).attr("x2", tx).attr("y1", m.top - 4).attr("y2", y(0))
    .attr("stroke", "var(--text-primary)").attr("stroke-dasharray", "4 3");
  svg.append("text").attr("class", "annotation").attr("x", tx - 6).attr("y", m.top + 8).attr("text-anchor", "end")
    .text("Jacobs: ~100 dwellings / net acre");

  // study area medians as ticks under the axis
  for (const a of city.areas) {
    const v = a.metrics.units_per_ha.median;
    if (v === null) continue;
    svg.append("path").attr("d", `M${x(v)},${y(0) + 2}l-5,8h10z`).attr("fill", roleColor(a.role))
      .append("title").text(`${a.label}: ${Math.round(v)} per ha`);
  }
}
