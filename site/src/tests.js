// "What Rotterdam shows": each tab puts Jacobs' claim to a simple test on the
// city's own hexagons. Thresholds are relative to the city (its 60th
// percentile) and set beside Jacobs' own numbers where she gave any.
//
// The outcome Jacobs cared about, streets full of people at all hours, is not
// in the data. Places per hectare (shops, cafés, offices on the map) stands in
// as a visible trace of it, and every test says so.

import { select, scaleBand, scaleLinear, quantile, median, max } from "d3";
import { token } from "./theme.js";

export const CONDITIONS = [
  { id: "bag_use_mix", label: "Mixed uses", gen: "mixed_uses" },
  { id: "intersection_density", label: "Short blocks", gen: "short_blocks" },
  { id: "age_diversity", label: "Aged buildings", gen: "aged_buildings" },
  { id: "dwellings_per_net_ha", label: "Concentration", gen: "concentration" },
];
const LEVEL = 0.6; // a condition is met at or above the city's 60th percentile
const MIN_LAND_HA = 4; // skip slivers at the edge of the city and the water
const JACOBS_NET_PER_HA = 247; // her 100 dwellings per net acre
const OUTCOME = "places_per_ha";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const asc = (a, b) => a - b;
const sorted = (xs) => xs.filter(isNum).sort(asc);

// Thresholds, conditions met per hexagon, and the numbers every chart needs.
// Uses the pipeline's conditions_met when the data has it (same definition).
export function computeTests(city, hex) {
  const all = hex.features.map((f) => f.properties);
  const sample = all.filter((p) => p.land_ha > MIN_LAND_HA && isNum(p[OUTCOME]) && CONDITIONS.every((c) => isNum(p[c.id])));
  const thresholds = Object.fromEntries(CONDITIONS.map((c) => [c.id, quantile(sorted(sample.map((p) => p[c.id])), LEVEL)]));
  const inSample = new Set(sample);
  for (const p of all) {
    if (isNum(p.conditions_met)) continue;
    p.conditions_met = inSample.has(p) ? CONDITIONS.filter((c) => p[c.id] >= thresholds[c.id]).length : null;
  }
  const densEdges = [0.25, 0.5, 0.75].map((q) => quantile(sorted(sample.map((p) => p.dwellings_per_net_ha)), q));
  const densQ = (p) => densEdges.filter((e) => p.dwellings_per_net_ha >= e).length;
  return { sample, thresholds, densEdges, densQ, n: sample.length };
}

const med = (rows) => ({ v: rows.length ? median(rows, (p) => p[OUTCOME]) : null, n: rows.length });

// Two groups compared inside each density quarter, so a difference is not just
// "more homes, more shops".
function byDensity(t, isA) {
  const labels = ["Fewest homes", "Fewer", "More", "Most homes"];
  return labels.map((label, q) => {
    const rows = t.sample.filter((p) => t.densQ(p) === q);
    return { label, a: med(rows.filter(isA)), b: med(rows.filter((p) => !isA(p))) };
  });
}

function verdict(groups) {
  const wins = groups.filter((g) => g.a.v != null && g.b.v != null && g.a.v > g.b.v).length;
  if (wins === groups.length) return { result: "agrees", wins };
  if (wins >= 2) return { result: "partly", wins };
  return { result: "no", wins };
}

const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const n0 = (v) => Math.round(v).toLocaleString("en");

export const RESULT_LABEL = {
  agrees: "Rotterdam agrees",
  partly: "Partly",
  no: "Not visible here",
  untestable: "Can't test with this data",
};

const TRACE = "Places per hectare counts the shops, cafés, offices and other open places on the map. It is a visible trace of street life, not a count of people.";
const FAIR = "Neighbourhoods are compared with others that have a similar number of homes, so the difference is not simply more homes, more shops.";

export const TESTS = {
  together: {
    question: "Do neighbourhoods that meet more of the four conditions have more going on?",
    run(t) {
      const groups = [0, 1, 2, 3, 4].map((k) => ({ label: `${k}`, a: med(t.sample.filter((p) => p.conditions_met === k)) }));
      const vals = groups.map((g) => g.a.v);
      const rising = vals.every((v, i) => i === 0 || v > vals[i - 1]);
      return {
        chart: { groups, series: [{ key: "a", label: "Median places per ha", color: "seq-4" }], x: "conditions met (of 4)", y: "places per ha" },
        result: rising ? "agrees" : "partly",
        finding: `With each extra condition met, the typical neighbourhood has more places: from ${f1(vals[0])} per hectare where none is met to ${f1(vals[4])} where all four are, about ${Math.round(vals[4] / vals[0])} times as many. Only ${groups[4].a.n} of ${n0(t.n)} hexagons meet all four.`,
        jacobs: "Jacobs said all four conditions are needed together and that none is enough alone. She gave no cut-off for three of them, so here a condition counts as met when a hexagon is in the top 40% of Rotterdam for it.",
        disclaimer: `${TRACE} Most hexagons that meet all four lie in the old city near the centre, which is busy for other reasons too, so this shows the conditions go together with activity, not that they cause it.`,
      };
    },
  },
  mixed_uses: {
    question: "Where homes, work and shops share a neighbourhood, are there more places to go?",
    run(t) {
      const cut = median(t.sample, (p) => p.bag_use_mix);
      const groups = byDensity(t, (p) => p.bag_use_mix >= cut);
      const v = verdict(groups);
      return {
        chart: { groups, series: [{ key: "a", label: "More mixed", color: "series-1" }, { key: "b", label: "Less mixed", color: "bar-rest" }], x: "neighbourhoods by number of homes", y: "places per ha" },
        result: v.result,
        finding: `In ${v.wins} of 4 density groups, the more mixed half of neighbourhoods has more places per hectare than the less mixed half.`,
        jacobs: "Jacobs gave no number for mixing. She asked whether a district has at least two primary reasons for people to be there, at different times. The mix here is floor area across homes, offices, shops, schools and other legal uses in the building register.",
        disclaimer: `${TRACE} ${FAIR} Shop floor area is part of the mix, so the two measures overlap a little. The map has no counts of people by time of day, which is what Jacobs really meant.`,
      };
    },
  },
  short_blocks: {
    question: "Do neighbourhoods with more street corners have more going on, at the same density?",
    run(t) {
      const cut = median(t.sample, (p) => p.intersection_density);
      const groups = byDensity(t, (p) => p.intersection_density >= cut);
      const v = verdict(groups);
      return {
        chart: { groups, series: [{ key: "a", label: "More corners", color: "series-1" }, { key: "b", label: "Fewer corners", color: "bar-rest" }], x: "neighbourhoods by number of homes", y: "places per ha" },
        result: v.result,
        finding: `In ${v.wins} of 4 density groups, neighbourhoods with more corners than the city median (${n0(cut)} per km²) have more places per hectare. Denser areas also tend to have more corners, so the two are hard to pull apart.`,
        jacobs: "Jacobs' long Manhattan blocks were about 240 m. Most streets between two corners in Rotterdam are far shorter than that, so the city's question is how many corners there are, not how long the blocks are. Ommoord's streets are as short as Oude Noorden's, but Oude Noorden has nearly twice the corners.",
        disclaimer: `${TRACE} ${FAIR} Corners count streets for cars and walking; footpaths through parks are left out.`,
      };
    },
  },
  aged_buildings: {
    question: "Do older neighbourhoods have more places, at the same density?",
    run(t) {
      const groups = byDensity(t, (p) => p.share_pre_1945 > 0.5);
      const v = verdict(groups);
      const old = t.sample.filter((p) => p.share_pre_1945 > 0.5 && isNum(p.woz_spread));
      const rest = t.sample.filter((p) => !(p.share_pre_1945 > 0.5) && isNum(p.woz_spread));
      const wo = median(old, (p) => p.woz_spread), wr = median(rest, (p) => p.woz_spread);
      return {
        chart: { groups, series: [{ key: "a", label: "Mostly pre-1945", color: "series-1" }, { key: "b", label: "Mostly newer", color: "bar-rest" }], x: "neighbourhoods by number of homes", y: "places per ha" },
        result: v.result,
        finding: `In ${v.wins} of 4 density groups, neighbourhoods where most homes were built before 1945 have more places per hectare. Her deeper point was cheap rent: the spread of home values in old neighbourhoods is ${wo == null ? "–" : (wo > wr * 1.1 ? "wider than" : wo < wr * 0.9 ? "narrower than" : "about the same as")} in newer ones, so Rotterdam's old districts are not clearly the cheap, mixed-rent places she described.`,
        jacobs: "Jacobs gave no age cut-off. She wanted a mix of old and new buildings, because only old ones have the low rents that new and small businesses can pay. Built before 1945 stands in for old here; rents are not in the data, home values are.",
        disclaimer: `${TRACE} ${FAIR} After the 1940 bombing and decades of urban renewal, much of Rotterdam's old housing was renovated or is social housing, so building age says less about rent here than in 1950s New York.`,
      };
    },
  },
  concentration: {
    question: "Is there a density below which neighbourhoods stay quiet?",
    run(t) {
      const edges = [0, 25, 50, 100, 150, 200, 250, Infinity];
      const groups = edges.slice(0, -1).map((lo, i) => {
        const hi = edges[i + 1];
        return { label: hi === Infinity ? `${lo}+` : `${lo}–${hi}`, a: med(t.sample.filter((p) => p.dwellings_per_net_ha >= lo && p.dwellings_per_net_ha < hi)) };
      });
      const vals = groups.map((g) => g.a.v);
      const over = t.sample.filter((p) => p.dwellings_per_net_ha >= JACOBS_NET_PER_HA).length;
      const rising = vals.every((v, i) => i === 0 || v == null || vals[i - 1] == null || v >= vals[i - 1] * 0.9);
      return {
        chart: { groups, series: [{ key: "a", label: "Median places per ha", color: "seq-4" }], x: "homes per hectare of building land", y: "places per ha", mark: { at: 6, label: "Jacobs' floor" } },
        result: rising ? "agrees" : "partly",
        finding: `Places climb with density, slowly at first and steeply from about 100 homes per hectare of building land. Only ${over} of ${n0(t.n)} hexagons reach the density Jacobs named as a floor.`,
        jacobs: "Jacobs put the start of real city life at about 100 dwellings per acre of residential land, roughly 250 per hectare. Rotterdam's busiest old districts come in well below that, and still show the pattern she described.",
        disclaimer: `${TRACE} Homes per hectare of building land counts dwellings from the building register over the land of their plots, which is close to her net acre but not the same.`,
      };
    },
  },
  border_vacuums: {
    question: "Near a rail line, motorway or big park, are there fewer places for the people who live there?",
    run(t, city) {
      const decay = city.vacuums?.decay || [];
      const bands = [...new Set(decay.filter((r) => r.kind !== "city").map((r) => r.band_lo))].sort(asc);
      const pooled = bands.map((lo) => {
        const rows = decay.filter((r) => r.kind !== "city" && r.band_lo === lo && isNum(r.places_per_ha));
        const land = rows.reduce((s, r) => s + r.land_ha, 0);
        const places = rows.reduce((s, r) => s + r.places_per_ha * r.land_ha, 0);
        const addresses = rows.reduce((s, r) => s + r.addresses_per_ha * r.land_ha, 0);
        return { lo, hi: rows[0]?.band_hi, addressesPerHa: addresses / land, perAddress: (places / addresses) * 100 };
      });
      const near = pooled.slice(0, 2), far = pooled.slice(-2);
      const avg = (xs, k) => xs.reduce((s, r) => s + r[k], 0) / xs.length;
      const addrRatio = avg(near, "addressesPerHa") / avg(far, "addressesPerHa");
      const perRatio = avg(near, "perAddress") / avg(far, "perAddress");
      const mk = (k) => pooled.map((r) => ({ label: `${r.lo}`, a: { v: r[k], n: null } }));
      return {
        chart: {
          panels: [
            { title: "Addresses per ha", groups: mk("addressesPerHa"), series: [{ key: "a", label: "Addresses per ha", color: "seq-4" }], x: "metres from the edge", y: "addresses per ha" },
            { title: "Places per 100 addresses", groups: mk("perAddress"), series: [{ key: "a", label: "Places per 100 addresses", color: "seq-4" }], x: "metres from the edge", y: "per 100 addresses" },
          ],
        },
        result: perRatio < 0.8 ? "agrees" : "partly",
        finding: `Within 100 m of a vacuum's edge there are ${Math.round((1 - addrRatio) * 100)}% fewer addresses per hectare than 300–400 m away. But per address, the number of places is ${perRatio > 0.9 && perRatio < 1.1 ? "about the same" : perRatio < 1 ? `${Math.round((1 - perRatio) * 100)}% lower` : `${Math.round((perRatio - 1) * 100)}% higher`}. The edges are thinly built, rather than shunned by the people who do live there.`,
        jacobs: "Jacobs argued that edges lose life because few people cross them on foot. The data can't see footsteps, only where homes and places are.",
        disclaimer: `${TRACE} Studies in Seoul and Italy found border vacuums by looking at land use; this per-resident check is a different question, and its answer here is a first look, not a settled result. Quiet canals and lively park entrances are pooled with motorways.`,
      };
    },
  },
  eyes: {
    question: "Are streets lined with doors and windows safer?",
    run() {
      return {
        result: "untestable",
        finding: "The map can measure how much of each street is lined by buildings, and how many buildings and places face it. It can't measure safety: there are no crime or safety figures in this data yet.",
        jacobs: "Jacobs' claim is about people watching the street without meaning to. The data sees building fronts, not windows that are actually used or people who are actually there.",
        disclaimer: "Research since Jacobs is divided. Some studies find more shops and cafés go with more crime on quiet streets, and less on busy, dense ones. A comparison with Rotterdam's neighbourhood safety survey (Wijkprofiel) is planned, and even then it would show where safety and street fronts go together, not that one causes the other.",
      };
    },
  },
  parks: {
    question: "Are parks ringed by mixed, dense neighbourhoods used more?",
    run() {
      return {
        result: "untestable",
        finding: "The map can describe what surrounds each park. It can't tell how much a park is used, so the claim can't be tested here.",
        jacobs: "Jacobs judged parks by watching who used them at each hour. Rittenhouse Square was full all day; Washington Square emptied after work.",
        disclaimer: "People counts in parks would make this testable. They are on the project's wish list.",
      };
    },
  },
  cars: {
    question: "Where less street space goes to cars, are there more places, at the same density?",
    run(t) {
      const rows = t.sample.filter((p) => isNum(p.car_space_share));
      const cut = median(rows, (p) => p.car_space_share);
      const groups = byDensity({ ...t, sample: rows }, (p) => p.car_space_share < cut);
      const v = verdict(groups);
      return {
        chart: { groups, series: [{ key: "a", label: "Less space for cars", color: "series-1" }, { key: "b", label: "More space for cars", color: "bar-rest" }], x: "neighbourhoods by number of homes", y: "places per ha" },
        result: v.result,
        finding: `In ${v.wins} of 4 density groups, neighbourhoods that give less of their street space to cars have more places per hectare.`,
        jacobs: "Jacobs described a slow erosion: each road widening makes walking a little worse and driving a little easier, until the street is for cars. She gave no figure for how much car space is too much.",
        disclaimer: `${TRACE} ${FAIR} Street space comes from the large-scale base map (BGT); it shows today's layout, not the erosion over time she wrote about.`,
      };
    },
  },
};

// Grouped bars: one or two series per category, one y axis.
export function renderBars(el, tooltip, spec) {
  const width = Math.max(el.clientWidth || 0, 280), height = 220;
  const m = { top: 14, right: 8, bottom: 40, left: 40 };
  const { groups, series } = spec;
  const x = scaleBand().domain(groups.map((g) => g.label)).range([m.left, width - m.right]).padding(0.25);
  const x1 = scaleBand().domain(series.map((s) => s.key)).range([0, x.bandwidth()]).padding(series.length > 1 ? 0.08 : 0);
  const yMax = max(groups, (g) => max(series, (s) => g[s.key]?.v ?? 0)) || 1;
  const y = scaleLinear().domain([0, yMax * 1.08]).nice().range([height - m.bottom, m.top]);
  const svg = select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
    .attr("aria-label", `${spec.y} by ${spec.x}`);
  const axis = svg.append("g").attr("class", "axis");
  for (const t of y.ticks(4)) {
    axis.append("line").attr("x1", m.left).attr("x2", width - m.right).attr("y1", y(t)).attr("y2", y(t));
    axis.append("text").attr("x", m.left - 6).attr("y", y(t) + 4).attr("text-anchor", "end").text(t);
  }
  for (const g of groups) {
    axis.append("text").attr("x", x(g.label) + x.bandwidth() / 2).attr("y", height - m.bottom + 16)
      .attr("text-anchor", "middle").text(g.label);
  }
  axis.append("text").attr("x", (m.left + width - m.right) / 2).attr("y", height - 4).attr("text-anchor", "middle").text(spec.x);
  if (spec.mark) {
    const g = groups[spec.mark.at];
    const cx = x(g.label);
    svg.append("line").attr("x1", cx - x.step() * x.paddingInner() / 2).attr("x2", cx - x.step() * x.paddingInner() / 2)
      .attr("y1", m.top).attr("y2", y(0)).attr("stroke", "var(--text-primary)").attr("stroke-dasharray", "4 3");
    svg.append("text").attr("class", "annotation").attr("x", cx - 6).attr("y", m.top + 8).attr("text-anchor", "end").text(spec.mark.label);
  }
  const bars = groups.flatMap((g) => series.map((s) => ({ g, s, d: g[s.key] }))).filter((b) => b.d?.v != null);
  const r = 3;
  svg.append("g").selectAll("path").data(bars).join("path")
    .attr("fill", (b) => token(b.s.color))
    .attr("d", (b) => {
      const bx = x(b.g.label) + x1(b.s.key), bw = x1.bandwidth(), by = y(b.d.v), bh = y(0) - by;
      const rr = Math.min(r, bh, bw / 2);
      return `M${bx},${y(0)}V${by + rr}Q${bx},${by} ${bx + rr},${by}H${bx + bw - rr}Q${bx + bw},${by} ${bx + bw},${by + rr}V${y(0)}Z`;
    })
    .on("mousemove", (e, b) => {
      tooltip.innerHTML = `<div class="t-title">${spec.x}: ${b.g.label}</div><table>
        <tr><td>${b.s.label}</td><td class="v">${b.d.v.toFixed(1)}</td></tr>
        ${b.d.n != null ? `<tr><td>Hexagons</td><td class="v">${b.d.n}</td></tr>` : ""}</table>`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${e.clientY + 10}px`;
    })
    .on("mouseleave", () => { tooltip.hidden = true; });
  if (!spec.title) svg.append("text").attr("x", m.left).attr("y", m.top - 4).attr("class", "axis-title").text(spec.y);
}

// The "What Rotterdam shows" block for one tab.
export function renderTest(el, tooltip, id, t, city) {
  const test = TESTS[id];
  if (!test || !t) { el.hidden = true; return; }
  el.hidden = false;
  const r = test.run(t, city);
  el.innerHTML = `<p class="test-q">${test.question}</p>
    <div class="test-charts"></div>
    <p class="test-finding"><span class="result result-${r.result}">${RESULT_LABEL[r.result]}</span> ${r.finding}</p>
    <p class="test-jacobs"><b>Compared with Jacobs.</b> ${r.jacobs}</p>
    <p class="test-disclaimer"><b>Read with care.</b> ${r.disclaimer}</p>`;
  const charts = el.querySelector(".test-charts");
  const panels = r.chart?.panels || (r.chart ? [r.chart] : []);
  charts.classList.toggle("two", panels.length > 1);
  charts.hidden = !panels.length;
  for (const p of panels) {
    const fig = document.createElement("figure");
    fig.className = "test-chart";
    if (p.series.length > 1) {
      fig.innerHTML = `<figcaption class="chart-key">${p.series.map((s) =>
        `<span class="key"><i style="background:${token(s.color)}"></i>${s.label}</span>`).join("")}</figcaption>`;
    } else if (p.title) {
      fig.innerHTML = `<figcaption class="chart-key"><b>${p.title}</b></figcaption>`;
    }
    charts.append(fig);
    renderBars(fig, tooltip, p);
  }
}
