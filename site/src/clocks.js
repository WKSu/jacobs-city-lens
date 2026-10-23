import { select, scaleLinear, scaleQuantize } from "d3";
import { sequential, roleColor, ROLE_LABEL } from "./theme.js";

const HOURS = 24;
const TICKS = [0, 6, 12, 18];

// Small multiples: for each district, the share of its places that are open in
// each hour of the week. Jacobs' first generator is about people being out at
// different times, so what matters is the shape of the week, not how many
// places a district has. Each grid is therefore scaled by the district's own
// place count, which puts every district on the same 0-100% scale.
export function renderClocks(el, controlsEl, legendEl, tooltip, city, clocks) {
  if (!clocks?.areas || !Object.keys(clocks.areas).length) {
    el.innerHTML = `<p class="pending-note">No opening hours for ${city.name} yet.</p>`;
    controlsEl.innerHTML = legendEl.innerHTML = "";
    return;
  }

  const areas = city.areas.filter((a) => clocks.areas[a.id]?.places);
  const colors = sequential();
  const color = scaleQuantize().domain([0, 1]).range(colors);

  legendEl.innerHTML =
    `<span class="key">none open<span class="clock-scale">${
      colors.map((c) => `<span style="background:${c}"></span>`).join("")
    }</span>all open</span>` +
    ["jacobs", "planned"].map((role) =>
      `<span class="key"><span class="dot" style="background:${roleColor(role)}"></span>${
        ROLE_LABEL[role]}</span>`).join("");
  controlsEl.innerHTML = "";

  el.innerHTML = areas.map((a) => `<figure class="sm-card" data-a="${a.id}">
    <figcaption><b>${a.label}</b><span>${clocks.areas[a.id].places} of ${
      clocks.areas[a.id].mapped || "?"} places</span></figcaption>
  </figure>`).join("");

  for (const area of areas) {
    const card = el.querySelector(`[data-a="${area.id}"]`);
    const { counts, places } = clocks.areas[area.id];
    const width = Math.max(card.clientWidth - 24, 200), height = 132;
    const m = { top: 8, right: 4, bottom: 20, left: 26 };
    const x = scaleLinear().domain([0, HOURS]).range([m.left, width - m.right]);
    const y = scaleLinear().domain([0, 7]).range([m.top, height - m.bottom]);
    const cw = x(1) - x(0), ch = y(1) - y(0);

    const svg = select(card).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
      .attr("aria-label", `Share of places open by weekday and hour in ${area.label}`);

    // The district's role tints the caption rule, as in the profile chart.
    svg.append("line").attr("x1", m.left).attr("x2", width - m.right).attr("y1", 2).attr("y2", 2)
      .attr("stroke", roleColor(area.role)).attr("stroke-width", 2);

    const cells = svg.append("g");
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < HOURS; h++) {
        const share = places ? counts[d][h] / places : 0;
        cells.append("rect")
          .attr("x", x(h)).attr("y", y(d)).attr("width", cw + 0.5).attr("height", ch + 0.5)
          .attr("fill", share > 0 ? color(share) : "var(--hex-empty)")
          .on("mousemove", (e) => {
            tooltip.innerHTML = `<div class="t-title">${area.label}</div><table>
              <tr><td>${clocks.days[d]} ${String(h).padStart(2, "0")}:00</td>
                  <td class="v">${counts[d][h]} of ${places} open</td></tr>
              <tr><td>Share</td><td class="v">${Math.round(share * 100)}%</td></tr></table>`;
            tooltip.hidden = false;
            tooltip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
            tooltip.style.top = `${e.clientY + 10}px`;
          })
          .on("mouseleave", () => { tooltip.hidden = true; });
      }
    }

    const axis = svg.append("g").attr("class", "axis");
    for (let d = 0; d < 7; d += 2) {
      axis.append("text").attr("x", m.left - 5).attr("y", y(d) + ch / 2 + 3).attr("text-anchor", "end")
        .text(clocks.days[d]);
    }
    for (const h of TICKS) {
      axis.append("text").attr("x", x(h) + cw / 2).attr("y", height - 6).attr("text-anchor", "middle")
        .text(`${String(h).padStart(2, "0")}h`);
    }
  }
}
