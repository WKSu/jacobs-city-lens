// Small interactive models, one per mechanism. "Sketch" models are made up to
// show how a mechanism works; "data" models use the city's own numbers. The
// two are labelled differently so a sketch is never mistaken for data.

import { token } from "./theme.js";

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function text(parent, x, y, str, attrs = {}) {
  const t = svgEl("text", { x, y, "font-size": 11, fill: token("text-muted"), ...attrs }, parent);
  t.textContent = str;
  return t;
}

function frame(el, title, kind, body) {
  const label = kind === "data" ? "City data" : "Sketch, not measured";
  el.innerHTML = `<div class="model-hd"><h3>${title}</h3><span class="model-kind ${kind}">${label}</span></div>${body}`;
}

// Segmented control: one pressed button at a time.
function segmented(container, onChange) {
  container.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    container.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    onChange(b.dataset.v);
  }));
}

const seg = (key, label, options, value) =>
  `<span class="model-ctl"><span class="model-ctl-label">${label}</span><span class="seg" data-k="${key}">${options
    .map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(value)}">${l}</button>`)
    .join("")}</span></span>`;

export function renderModel(kind, el, ctx) {
  const fn = MODELS[kind];
  if (!fn) { el.innerHTML = ""; el.hidden = true; return () => {}; }
  el.hidden = false;
  return fn(el, ctx);
}

const MODELS = { eyes, day: (el) => day(el, "street"), "day-park": (el) => day(el, "park"), grid, quiz, walk };

/* Eyes on the street: who can see a person walking along a 300 m street. */
function eyes(el) {
  const S = { grain: 6, ground: "homes", setback: 0, gaps: 0 };
  frame(el, "Who can see you?", "sketch", `
    <div class="model-controls">
      ${seg("grain", "Buildings", [[6, "Narrow houses"], [18, "Medium"], [110, "Slabs"]], S.grain)}
      ${seg("ground", "Ground floor", [["homes", "Homes"], ["shops", "Shops"], ["blank", "Blank walls"]], S.ground)}
      ${seg("setback", "Set back", [[0, "0 m"], [10, "10 m"], [30, "30 m"]], S.setback)}
      ${seg("gaps", "Gaps", [[0, "None"], [1, "Car parks"]], S.gaps)}
    </div>
    <svg viewBox="0 0 640 262" role="img" aria-label="Plan of a 300 metre street with buildings on both sides. Lines link the walker to the windows and doors that can see them."></svg>
    <label class="model-ctl-label" for="eyes-walk">Walk along the street</label>
    <input type="range" id="eyes-walk" min="0" max="300" value="120">
    <div class="model-out"></div>
    <p class="model-note">Every window or door within 40 m counts, weighted by distance, and a shopkeeper counts double. The bottom row uses the map's own definitions.</p>`);
  const svg = el.querySelector("svg"), out = el.querySelector(".model-out"), walk = el.querySelector("input");
  el.querySelectorAll(".seg").forEach((s) => segmented(s, (v) => { S[s.dataset.k] = isNaN(+v) ? v : +v; draw(); }));
  walk.addEventListener("input", draw);
  const PX = 2, X0 = 20, ROAD = 6, WALK = 3;

  function buildings() {
    const list = [], gaps = [];
    for (const side of [-1, 1]) {
      let x = side === 1 ? S.grain * 0.4 : 0, i = 0;
      while (x < 300) {
        if (S.gaps && i % 4 === 2) { gaps.push({ side, x }); x += 25; i++; continue; }
        const w = Math.min(S.grain, 300 - x);
        if (w > 2) list.push({ side, x, w, depth: S.grain > 50 ? 14 : 10 });
        x += w + (S.grain > 50 ? 12 : 0);
        i++;
      }
    }
    return { list, gaps };
  }

  function draw() {
    const wx = +walk.value, { list, gaps } = buildings();
    const Y = (m) => 128 + m * PX, X = (m) => X0 + m * PX;
    svg.textContent = "";
    svgEl("rect", { x: X0, y: Y(-ROAD - WALK), width: 300 * PX, height: (ROAD + WALK) * 2 * PX, fill: token("grid") }, svg);
    for (const s of [-1, 1]) svgEl("line", { x1: X0, x2: X0 + 300 * PX, y1: Y(s * ROAD), y2: Y(s * ROAD), stroke: token("border") }, svg);
    for (const g of gaps) {
      const y = g.side * (ROAD + WALK);
      svgEl("rect", { x: X(g.x), y: g.side < 0 ? Y(y - 12) : Y(y), width: 25 * PX - 2, height: 12 * PX, fill: "none", stroke: token("text-muted"), "stroke-dasharray": "3 3" }, svg);
    }
    const pts = [];
    list.forEach((b, bi) => {
      const yF = b.side * (ROAD + WALK + S.setback);
      svgEl("rect", { x: X(b.x), y: b.side < 0 ? Y(yF - b.depth) : Y(yF), width: b.w * PX - 1, height: b.depth * PX, fill: token("fg-building") }, svg);
      const door = b.x + b.w / 2;
      pts.push({ x: door, y: yF, w: S.ground === "shops" ? 2 : 1, b: bi, shop: S.ground === "shops" });
      if (S.ground !== "blank") {
        for (let x = b.x + 1.5; x < b.x + b.w - 1; x += 3) if (Math.abs(x - door) > 1.4) pts.push({ x, y: yF, w: 1, b: bi });
      }
    });
    const wy = ROAD + WALK / 2;
    let seenBy = 0, shops = 0;
    const seen = new Set();
    for (const p of pts) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < 40) {
        seenBy += p.w * (1 - d / 40);
        seen.add(p.b);
        if (p.shop) shops++;
        svgEl("line", { x1: X(p.x), y1: Y(p.y), x2: X(wx), y2: Y(wy), stroke: token("series-2"), "stroke-opacity": (0.15 + 0.6 * (1 - d / 40)).toFixed(2), "stroke-width": p.shop ? 1.6 : 0.8 }, svg);
      }
      svgEl("circle", { cx: X(p.x), cy: Y(p.y), r: p.shop ? 2.6 : 1.5, fill: p.shop ? token("series-2") : token("series-1") }, svg);
    }
    svgEl("circle", { cx: X(wx), cy: Y(wy), r: 6, fill: token("series-2"), stroke: token("surface-1"), "stroke-width": 2 }, svg);
    text(svg, X0, 256, "0 m");
    text(svg, X0 + 300 * PX, 256, "300 m", { "text-anchor": "end" });

    // The map's measures for this street (both sides, 300 m).
    const lined = ROAD + WALK + S.setback <= 20;
    const wall = lined ? list.reduce((s, b) => s + b.w, 0) / 600 : 0;
    out.innerHTML = `<span><b>${seenBy.toFixed(0)}</b> eyes on this spot</span><span><b>${seen.size}</b> buildings watching</span><span><b>${shops}</b> shopkeepers</span>
      <span class="break"></span>
      <span>Street wall <b class="sm">${Math.round(wall * 100)}%</b></span>
      <span>Buildings fronting <b class="sm">${(list.length / 3).toFixed(1)}</b> per 100 m</span>
      <span>Places along the street <b class="sm">${(S.ground === "shops" ? list.length / 3 : 0).toFixed(1)}</b> per 100 m</span>`;
  }
  draw();
  return draw;
}

/* Fill the day: who is on the street (or in the park) at each hour. */
// Same three families of use as the dots on the map, plus homes.
const USES = [
  { id: "homes", label: "Homes", c: "home", p: [1,1,1,1,1,3,10,18,16,8,6,6,7,6,6,8,10,14,14,11,8,5,3,2] },
  { id: "work", label: "Work and civic", c: "cat-1", p: [0,0,0,0,0,0,2,16,34,12,9,11,24,14,10,18,16,23,8,3,1,0,0,0] },
  { id: "shops", label: "Shops and services", c: "cat-2", p: [0,0,0,0,0,0,0,1,4,10,15,16,17,17,17,17,16,14,9,3,1,0,0,0] },
  { id: "leisure", label: "Food, culture and leisure", c: "cat-3", p: [4,2,1,0,0,0,1,3,4,5,7,12,17,13,8,8,10,15,20,24,24,20,14,8] },
];

function day(el, mode) {
  const park = mode === "park";
  const presets = park
    ? { offices: ["work"], homes: ["homes"], mixed: ["homes", "work", "shops", "leisure"] }
    : { offices: ["work"], homes: ["homes"], mixed: ["homes", "work", "shops", "leisure"] };
  const names = park
    ? { offices: "Ringed by offices", homes: "Ringed by homes", mixed: "Ringed by everything" }
    : { offices: "Office district", homes: "Housing estate", mixed: "Mixed street" };
  const on = new Set(presets.homes);
  frame(el, park ? "Who is in the park, and when?" : "Fill the day", "sketch", `
    <div class="model-controls">${seg("preset", "Start from", Object.keys(presets).map((k) => [k, names[k]]), "homes")}</div>
    <div class="model-toggles">${USES.map((u) => `<label><input type="checkbox" data-u="${u.id}"><i class="sw" data-c="${u.c}"></i>${u.label}</label>`).join("")}</div>
    <svg viewBox="0 0 640 220" role="img" aria-label="Stacked area chart of people ${park ? "in the park" : "on the street"} by hour of the day, by reason for being there."></svg>
    <div class="model-out"></div>
    <p class="model-note">The hourly patterns are assumptions that show the mechanism. A measured version needs opening hours (planned, issue 6).</p>`);
  const svg = el.querySelector("svg"), out = el.querySelector(".model-out");
  const presetSeg = el.querySelector(".seg");
  segmented(presetSeg, (v) => { on.clear(); presets[v].forEach((x) => on.add(x)); draw(); });
  el.querySelectorAll(".model-toggles input").forEach((i) => i.addEventListener("change", () => {
    i.checked ? on.add(i.dataset.u) : on.delete(i.dataset.u);
    presetSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    draw();
  }));

  function draw() {
    el.querySelectorAll(".model-toggles input").forEach((i) => (i.checked = on.has(i.dataset.u)));
    el.querySelectorAll(".sw").forEach((s) => (s.style.background = token(s.dataset.c)));
    svg.textContent = "";
    const L = 36, R = 628, T = 12, B = 190, MAX = 60, QUIET = 8;
    const x = (h) => L + (h / 23) * (R - L), y = (v) => B - (Math.min(v, MAX) / MAX) * (B - T);
    const act = USES.filter((u) => on.has(u.id));
    // a park draws a share of the people around it, and only by day
    const scale = (h) => (park ? (h >= 7 && h <= 21 ? 0.8 : 0.1) : 1);
    const total = USES[0].p.map((_, h) => act.reduce((s, u) => s + u.p[h], 0) * scale(h));
    const step = (R - L) / 23;
    for (let h = 6; h < 24; h++) if (total[h] < QUIET) svgEl("rect", { x: x(h) - step / 2, y: T, width: step, height: B - T, fill: token("grid") }, svg);
    for (const v of [20, 40, 60]) svgEl("line", { x1: L, x2: R, y1: y(v), y2: y(v), stroke: token("grid") }, svg);
    const base = new Array(24).fill(0);
    for (const u of act) {
      const top = base.map((b, h) => b + u.p[h] * scale(h));
      const d = "M" + top.map((v, h) => `${x(h)},${y(v)}`).join("L") + "L" + base.map((v, h) => `${x(h)},${y(v)}`).reverse().join("L") + "Z";
      svgEl("path", { d, fill: token(u.c), stroke: token("surface-1"), "stroke-width": 1 }, svg);
      top.forEach((v, h) => (base[h] = v));
    }
    svgEl("line", { x1: L, x2: R, y1: y(QUIET), y2: y(QUIET), stroke: token("text-muted"), "stroke-dasharray": "4 3" }, svg);
    text(svg, R, y(QUIET) - 4, park ? "too few people for the park to feel safe" : "too few people to feel watched", { "text-anchor": "end", "font-size": 10 });
    for (const h of [0, 6, 12, 18, 23]) text(svg, x(h), B + 16, `${String(h).padStart(2, "0")}:00`, { "text-anchor": h === 0 ? "start" : h === 23 ? "end" : "middle" });
    text(svg, 4, T + 8, "people", { "font-size": 10 });
    const quiet = total.slice(6).filter((v) => v < QUIET).length;
    const kinds = act.filter((u) => u.id !== "homes").length;
    const mix = kinds > 1 ? Math.log(kinds) / Math.log(3) : 0;
    out.innerHTML = `<span><b>${quiet}</b> of 18 waking hours (6:00 to midnight) ${park ? "with an empty park" : "with an empty street"}</span>
      <span><b>${mix.toFixed(2)}</b> use mix across the three kinds, if places split evenly</span>`;
  }
  draw();
  return draw;
}

/* Cut a new street: shortest routes between two corners of a grid. */
function grid(el) {
  frame(el, "Cut a new street", "sketch", `
    <p class="model-lede">Click a dashed line to open a cross street, then count the shortest walks from A to B.</p>
    <svg viewBox="0 0 640 220" role="img" aria-label="A street grid with long blocks. Dashed lines mark possible new cross streets."></svg>
    <div class="model-out"></div>
    <div class="model-controls"><button type="button" class="model-btn" data-a="long">Long blocks</button><button type="button" class="model-btn" data-a="short">All short blocks</button></div>
    <p class="model-note">The faint lines are six shortest routes picked at random. One grid step is 30 m, so the starting blocks are 240 m long, as on the Upper West Side.</p>`);
  const svg = el.querySelector("svg"), out = el.querySelector(".model-out");
  const W = 24, H = 3, cand = Array.from({ length: W / 2 + 1 }, (_, i) => i * 2);
  const base = [0, 8, 16, 24];
  let open = new Set(base);
  const L = 40, R = 600, T = 24, B = 186, sx = (R - L) / W, sy = (B - T) / H;
  const X = (i) => L + i * sx, Y = (j) => B - j * sy;
  el.querySelector('[data-a="long"]').addEventListener("click", () => { open = new Set(base); draw(); });
  el.querySelector('[data-a="short"]').addEventListener("click", () => { open = new Set(cand); draw(); });

  // Paths that only go right or up; going up is possible only on an open cross street.
  function counts() {
    const n = {};
    cand.forEach((x, i) => {
      for (let j = 0; j <= H; j++) {
        let v = i === 0 && j === 0 ? 1 : 0;
        if (i > 0) v += n[`${cand[i - 1]},${j}`];
        if (j > 0 && open.has(x)) v += n[`${x},${j - 1}`];
        n[`${x},${j}`] = v;
      }
    });
    return n;
  }
  // A uniformly random shortest path, walked back from B.
  function sample(n) {
    let i = cand.length - 1, j = H;
    const path = [[cand[i], j]];
    while (i > 0 || j > 0) {
      const left = i > 0 ? n[`${cand[i - 1]},${j}`] : 0;
      const down = j > 0 && open.has(cand[i]) ? n[`${cand[i]},${j - 1}`] : 0;
      if (Math.random() * (left + down) < left) i--; else j--;
      path.push([cand[i], j]);
    }
    return path;
  }
  function draw() {
    svg.textContent = "";
    for (let j = 0; j <= H; j++) svgEl("line", { x1: X(0), x2: X(W), y1: Y(j), y2: Y(j), stroke: token("fg-street"), "stroke-width": 6, "stroke-linecap": "round" }, svg);
    for (const x of cand) {
      if (open.has(x)) { svgEl("line", { x1: X(x), x2: X(x), y1: Y(0), y2: Y(H), stroke: token("fg-street"), "stroke-width": 6 }, svg); continue; }
      svgEl("line", { x1: X(x), x2: X(x), y1: Y(0), y2: Y(H), stroke: token("text-muted"), "stroke-width": 1.5, "stroke-dasharray": "4 4" }, svg);
      const hit = svgEl("rect", { x: X(x) - 10, y: Y(H), width: 20, height: B - T, fill: "transparent", class: "model-hit", tabindex: 0, role: "button", "aria-label": `Open a cross street at ${x * 30} m` }, svg);
      const go = () => { open.add(x); draw(); };
      hit.addEventListener("click", go);
      hit.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    }
    const n = counts();
    for (let k = 0; k < 6; k++) {
      const off = (k - 2.5) * 1.6;
      svgEl("polyline", { points: sample(n).map(([x, j]) => `${X(x) + off},${Y(j) + off}`).join(" "), fill: "none", stroke: token("series-2"), "stroke-opacity": 0.55, "stroke-width": 1.5 }, svg);
    }
    for (const [label, x, j] of [["A", 0, 0], ["B", W, H]]) {
      svgEl("circle", { cx: X(x), cy: Y(j), r: 11, fill: token("series-2") }, svg);
      text(svg, X(x), Y(j) + 4, label, { "font-size": 12, "font-weight": 600, fill: token("surface-1"), "text-anchor": "middle" });
    }
    const streets = open.size;
    out.innerHTML = `<span><b>${n[`${W},${H}`].toLocaleString("en")}</b> shortest routes from A to B</span>
      <span><b>${streets * (H + 1)}</b> street corners</span><span><b>${Math.round((W / (streets - 1)) * 30)} m</b> average block length</span>`;
  }
  draw();
  return draw;
}

/* Density quiz: the same 800 x 800 m in four districts; which holds the most addresses? */
function quiz(el, { city, data }) {
  const byId = Object.fromEntries(city.areas.map((a) => [a.id, a]));
  const ids = (city.story?.quiz || Object.keys(data.fg)).filter((id) => data.fg[id] && byId[id]).slice(0, 4);
  if (ids.length < 2) { el.hidden = true; return () => {}; }
  const units = (id) => byId[id].metrics.units_per_ha.median;
  const best = ids.reduce((a, id) => (units(id) > units(a) ? id : a), ids[0]);
  const max = units(best);
  let picked = null, revealed = false;
  frame(el, "Which has the most homes per hectare?", "data", `
    <p class="model-lede">The same 800 × 800 m in ${ids.length} districts, at the same scale. Pick the densest.</p>
    <div class="quiz-grid"></div><div class="model-out"></div>
    <div class="model-controls"><button type="button" class="model-btn" data-a="reveal">Show all</button><button type="button" class="model-btn" data-a="reset">Try again</button></div>
    <p class="model-note">Values are the median addresses per ha of each district's hexagons, not of the square shown.</p>`);
  const gridEl = el.querySelector(".quiz-grid"), out = el.querySelector(".model-out");
  el.querySelector('[data-a="reveal"]').addEventListener("click", () => { revealed = true; draw(); });
  el.querySelector('[data-a="reset"]').addEventListener("click", () => { revealed = false; picked = null; draw(); });
  function draw() {
    gridEl.innerHTML = ids.map((id, i) => {
      const fg = data.fg[id], a = byId[id], show = revealed || picked === id;
      const letter = "ABCD"[i];
      return `<button type="button" class="quiz-card${picked === id ? " picked" : ""}" data-id="${id}" aria-label="District ${letter}">
        <svg viewBox="0 0 ${fg.size_m} ${fg.size_m}" aria-hidden="true"><path d="${fg.streets.join(" ")}" fill="none" stroke="var(--fg-street)" stroke-width="3"/><path d="${fg.buildings.join(" ")}" fill="var(--fg-building)" fill-rule="evenodd"/></svg>
        <span class="quiz-cap">${show
          ? `<b>${a.label}</b> ${Math.round(units(id))} addresses per ha<i class="quiz-bar"><i style="width:${(units(id) / max) * 100}%;background:var(${a.role === "jacobs" ? "--series-1" : "--series-2"})"></i></i>`
          : `<b>${letter}</b>`}</span></button>`;
    }).join("");
    gridEl.querySelectorAll(".quiz-card").forEach((b) => b.addEventListener("click", () => { picked = b.dataset.id; revealed = true; draw(); }));
    const b = byId[best];
    if (picked === best) out.innerHTML = `<span>Right. ${b.label} has about <b class="sm">${Math.round(max)}</b> addresses per ha.</span>`;
    else if (picked) out.innerHTML = `<span>${byId[picked].label} has <b class="sm">${Math.round(units(picked))}</b> addresses per ha. The densest is ${b.label}, at ${Math.round(max)}. Tall buildings with open space around them are often less dense than low buildings packed together.</span>`;
    else out.innerHTML = revealed ? `<span>${b.label} is densest, at <b class="sm">${Math.round(max)}</b> addresses per ha.</span>` : "";
  }
  draw();
  return draw;
}

/* Border vacuum walk: activity in 50 m bands away from the edge of a vacuum. */
function walk(el, { city }) {
  const v = city.vacuums;
  if (!v?.decay?.length) { el.hidden = true; return () => {}; }
  const kinds = [...new Set(v.decay.map((r) => r.kind))].filter((k) => k !== "city");
  const cityLevel = v.decay.find((r) => r.kind === "city")?.places_per_ha;
  let kind = kinds.includes("park") ? "park" : kinds[0];
  const short = (k) => (v.labels[k] || k).split(/[ ,(]/)[0].replace(/^\w/, (c) => c.toUpperCase());
  frame(el, "Walk away from the edge", "data", `
    <div class="model-controls">${seg("kind", "Edge of", kinds.map((k) => [k, v.labels[k] ? short(k) : k]), kind)}</div>
    <svg viewBox="0 0 640 210" role="img" aria-label="Line chart of places per hectare by distance from the edge of a border vacuum."></svg>
    <label class="model-ctl-label" for="vac-walk">Your distance from the edge</label>
    <input type="range" id="vac-walk" min="0" max="7" step="1" value="0">
    <div class="model-out"></div>`);
  const svg = el.querySelector("svg"), out = el.querySelector(".model-out"), slider = el.querySelector("input");
  segmented(el.querySelector(".seg"), (k) => { kind = k; draw(); });
  slider.addEventListener("input", draw);
  function draw() {
    const rows = v.decay.filter((r) => r.kind === kind).sort((a, b) => a.band_lo - b.band_lo);
    slider.max = rows.length - 1;
    const L = 40, R = 620, T = 14, B = 176;
    const xMax = rows[rows.length - 1].band_hi;
    const yMax = Math.max(cityLevel || 0, ...v.decay.filter((r) => r.kind !== "city").map((r) => r.places_per_ha)) * 1.05;
    const x = (m) => L + (m / xMax) * (R - L), y = (val) => B - (val / yMax) * (B - T);
    svg.textContent = "";
    for (const t of [0, 2, 4, 6, 8].filter((t) => t <= yMax)) {
      svgEl("line", { x1: L, x2: R, y1: y(t), y2: y(t), stroke: token("grid") }, svg);
      text(svg, L - 6, y(t) + 4, t, { "text-anchor": "end", "font-size": 10 });
    }
    if (cityLevel != null) {
      svgEl("line", { x1: L, x2: R, y1: y(cityLevel), y2: y(cityLevel), stroke: token("text-muted"), "stroke-dasharray": "5 4" }, svg);
      text(svg, R, y(cityLevel) - 5, "city-wide level", { "text-anchor": "end", "font-size": 10 });
    }
    const mid = (r) => (r.band_lo + r.band_hi) / 2;
    svgEl("polyline", { points: rows.map((r) => `${x(mid(r))},${y(r.places_per_ha)}`).join(" "), fill: "none", stroke: token("series-1"), "stroke-width": 2 }, svg);
    rows.forEach((r) => svgEl("circle", { cx: x(mid(r)), cy: y(r.places_per_ha), r: 3, fill: token("series-1") }, svg));
    const r = rows[Math.min(+slider.value, rows.length - 1)];
    svgEl("line", { x1: x(mid(r)), x2: x(mid(r)), y1: T, y2: B, stroke: token("series-2") }, svg);
    svgEl("circle", { cx: x(mid(r)), cy: y(r.places_per_ha), r: 7, fill: token("series-2"), stroke: token("surface-1"), "stroke-width": 2 }, svg);
    for (let m = 0; m <= xMax; m += 100) text(svg, x(m), B + 16, `${m} m`, { "text-anchor": "middle", "font-size": 10 });
    text(svg, L, T - 2, "places per ha", { "font-size": 10 });
    const far = rows[rows.length - 1].places_per_ha;
    out.innerHTML = `<span><b>${r.band_lo}–${r.band_hi} m</b> from the edge</span><span><b>${r.places_per_ha.toFixed(1)}</b> places per ha</span>
      ${cityLevel ? `<span><b>${Math.round((r.places_per_ha / cityLevel) * 100)}%</b> of the city-wide level</span>` : ""}
      <span><b>${Math.round((r.places_per_ha / far) * 100)}%</b> of the level ${rows[rows.length - 1].band_lo}–${xMax} m away</span>`;
  }
  draw();
  return draw;
}
