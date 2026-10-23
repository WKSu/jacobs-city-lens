import { roleColor, ROLE_LABEL } from "./theme.js";
import { CONDITIONS } from "./tests.js";

// Six districts against the four conditions: one square per hexagon in the
// district, filled when it meets the condition (meets_* from the pipeline,
// city's 60th percentile). Showing every hexagon keeps the sample size visible:
// Kop van Zuid is six squares, Ommoord forty-seven.
// Filled squares first, so each cell also reads as a bar.
const RANK = { on: 0, "": 1, na: 2 };

// Each district's hexagons and how many conditions they meet, best first.
// Shared with the figure-ground plans so both list districts in the same order.
export function districtRows(city, hex) {
  const byArea = new Map(city.areas.map((a) => [a.id, []]));
  for (const f of hex.features) byArea.get(f.properties.study_area)?.push(f.properties);
  return city.areas.map((a) => {
    const hexes = byArea.get(a.id);
    const scored = hexes.filter((p) => typeof p.conditions_met === "number");
    const mean = scored.reduce((s, p) => s + p.conditions_met, 0) / (scored.length || 1);
    const share = (c) => scored.filter((p) => p[`meets_${c.gen}`]).length / (scored.length || 1);
    return { a, hexes, scored, mean, share, places: a.metrics.places_per_ha?.median };
  }).filter((r) => r.hexes.length).sort((x, y) => y.mean - x.mean);
}

export function renderScorecard(el, tooltip, city, hex, onPick) {
  const rows = districtRows(city, hex);
  if (!rows.length || !rows[0].scored.length) { el.innerHTML = ""; return; }

  const maxPlaces = Math.max(...rows.map((r) => r.places ?? 0), 1);
  const cityPlaces = city.city_median.places_per_ha;
  const pct = (v) => `${Math.min(100, (v / maxPlaces) * 100)}%`;
  const meets = (p, c) => p[`meets_${c.gen}`];

  el.innerHTML = `<div class="scorecard" role="table" aria-label="Share of each district's hexagons that meet each of Jacobs' four conditions">
    <div class="sc-head sc-keep" role="columnheader">District</div>
    ${CONDITIONS.map((c) => `<div class="sc-head" role="columnheader"><button type="button" data-tab="${c.gen}">${c.label}</button></div>`).join("")}
    <div class="sc-head sc-keep" role="columnheader">Places per ha</div>
    ${rows.map((r) => `
      <div class="sc-cell sc-name" role="rowheader"><b>${r.a.label}</b>
        <span><i style="background:${roleColor(r.a.role)}"></i>${ROLE_LABEL[r.a.role]}</span>
        <span>${r.mean.toFixed(1)} of 4 conditions on average</span></div>
      ${CONDITIONS.map((c) => {
        const met = r.scored.filter((p) => meets(p, c)).length;
        return `<div class="sc-cell sc-cond" role="cell" data-label="${c.label}" data-a="${r.a.id}" data-c="${c.gen}">
          <div class="sc-units">${r.hexes.map((p) => (meets(p, c) == null ? "na" : meets(p, c) ? "on" : ""))
            .sort((x, y) => RANK[x] - RANK[y]).map((k) => `<i class="${k}"></i>`).join("")}</div>
          <span class="sc-share">${met} of ${r.scored.length}</span></div>`;
      }).join("")}
      <div class="sc-cell sc-out" role="cell" data-label="Places per ha">
        <span class="sc-val">${r.places == null ? "–" : r.places.toFixed(1)}</span>
        <div class="sc-bar"><b style="width:${r.places == null ? 0 : pct(r.places)}"></b>
          <i class="ref" style="left:${pct(cityPlaces)}" title="City median"></i></div></div>`).join("")}
  </div>
  <p class="sc-note">Dashed line: the city median, ${cityPlaces.toFixed(1)} places per ha. Districts of six to
  ten hexagons are small samples. Click a condition to open its tab.</p>`;

  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => onPick(b.dataset.tab)));
  el.querySelectorAll(".sc-cond").forEach((cell) => {
    const r = rows.find((x) => x.a.id === cell.dataset.a);
    const c = CONDITIONS.find((x) => x.gen === cell.dataset.c);
    const threshold = city.conditions?.conditions.find((x) => x.id === c.gen)?.threshold;
    const m = city.metrics.find((x) => x.id === c.id);
    cell.addEventListener("mousemove", (e) => {
      const met = r.scored.filter((p) => meets(p, c)).length;
      tooltip.innerHTML = `<div class="t-title">${r.a.label}: ${c.label}</div><table>
        <tr><td>Hexagons that meet it</td><td class="v">${met} of ${r.scored.length}</td></tr>
        ${threshold != null && m ? `<tr><td>${m.label} at least</td><td class="v">${
          threshold.toLocaleString(undefined, { maximumFractionDigits: threshold < 10 ? 2 : 0 })}${m.unit ? ` ${m.unit}` : ""}</td></tr>` : ""}
      </table><div class="source">Met when a hexagon is in the city's top 40%.</div>`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${e.clientY + 10}px`;
    });
    cell.addEventListener("mouseleave", () => { tooltip.hidden = true; });
  });
}
