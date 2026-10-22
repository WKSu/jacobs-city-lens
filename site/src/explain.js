// "How this number is made": the raw counts behind one hexagon's indicators,
// so a reader sees the arithmetic instead of only a colour.

import { token } from "./theme.js";
import { FAMILIES } from "./map.js";

const GROUP_LABEL = {
  work: "Work", civic: "Civic and health", shopping: "Shopping", personal_services: "Personal services",
  food_drink: "Food and drink", culture_leisure: "Culture and leisure",
};

const n0 = (v) => Math.round(v ?? 0).toLocaleString("en");
const f1 = (v) => (v == null ? "–" : Number(v).toFixed(1));
const f2 = (v) => (v == null ? "–" : Number(v).toFixed(2));

export function explainHex(el, generator, p, city) {
  if (!p) {
    el.innerHTML = generator === "parks" || generator === "aged_buildings"
      ? "" : `<p class="explain-hint">Click a hexagon to see how its numbers are made.</p>`;
    return;
  }
  const area = city.areas.find((a) => a.id === p.study_area);
  const title = `<div class="explain-title">How this hexagon's numbers are made${area ? ` <span>(${area.label})</span>` : ""}</div>`;
  const ha = Number(p.land_ha);
  const body = BODIES[generator]?.(p, ha, city);
  el.innerHTML = body ? title + body : "";
}

const BODIES = {
  mixed_uses(p, ha, city) {
    const groups = city.place_groups || [];
    const counts = groups.map((g) => ({ g, n: Number(p[`n_${g}`] || 0) }));
    const total = counts.reduce((s, c) => s + c.n, 0);
    const max = Math.max(1, ...counts.map((c) => c.n));
    const fam = (g) => FAMILIES.find((f) => f.groups.includes(g));
    const bars = counts.map(({ g, n }) => `<div class="xbar"><span>${GROUP_LABEL[g] || g}</span>
      <i><b style="width:${(n / max) * 100}%;background:${token(fam(g)?.color || "text-muted")}"></b></i><em>${n}</em></div>`).join("");
    const mix = p.use_mix;
    return `${bars}
      <p><b>${n0(total)}</b> places on <b>${f1(ha)}</b> ha of land = <b>${f1(p.places_per_ha)}</b> places per ha.</p>
      <p>${mix == null
        ? `Fewer than 5 places, so no use mix is given.`
        : `Use mix <b>${f2(mix)}</b>: how evenly these bars are split. All places in one kind would give 0; six equal bars would give 1.`}</p>`;
  },
  short_blocks(p, ha) {
    return `<p><b>${n0(p.intersections)}</b> intersections on <b>${f2(ha / 100)}</b> km² of land = <b>${n0(p.intersection_density)}</b> per km².</p>
      <p>Half of the streets between two corners here are shorter than <b>${p.median_link_m == null ? "–" : n0(p.median_link_m)} m</b> (Jacobs wanted short ones; Manhattan's long blocks are about 240 m).</p>
      <p>Counting footpaths too gives <b>${n0(p.path_intersection_density)}</b> intersections per km².</p>`;
  },
  concentration(p, ha) {
    return `<p><b>${n0(p.units)}</b> addresses on <b>${f1(ha)}</b> ha of land = <b>${n0(p.units_per_ha)}</b> per ha.</p>
      <p>Jacobs' rough floor of 100 dwellings per acre is about 250 per hectare of building land. This hexagon's land includes streets and every kind of address is counted, so the two are not directly comparable.</p>
      <p>Buildings cover <b>${p.coverage == null ? "–" : Math.round(p.coverage * 100)}%</b> of the land.</p>`;
  },
  eyes(p) {
    return `<p>Each street gets three measures; the hexagon averages its streets, weighted by length.</p>
      <p>Street wall <b>${p.frontage_share == null ? "–" : Math.round(p.frontage_share * 100) + "%"}</b>, buildings fronting <b>${f1(p.buildings_per_100m)}</b> and places <b>${f1(p.places_per_100m)}</b> per 100 m of street.</p>
      <p>Zoom in to see each street's own values.</p>`;
  },
  border_vacuums(p) {
    return `<p><b>${p.vacuum_share == null ? "–" : Math.round(p.vacuum_share * 100) + "%"}</b> of this hexagon's land lies inside a border vacuum.</p>
      <p>Its centre is <b>${p.vacuum_dist_m == null ? "–" : n0(p.vacuum_dist_m)} m</b> from the nearest vacuum edge.</p>`;
  },
};
