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

// Every model has the same parts: a question, one line on what to try, the
// picture, and one sentence that says what the reader is seeing right now.
function frame(el, title, kind, tryThis, body) {
  const label = kind === "data" ? "City data" : "Sketch, not measured";
  el.innerHTML = `<div class="model-hd"><h3>${title}</h3><span class="model-kind ${kind}">${label}</span></div>
    <p class="model-try"><b>Try it:</b> ${tryThis}</p>${body}<p class="model-take" aria-live="polite"></p>`;
  return el.querySelector(".model-take");
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

const MODELS = { eyes, day: (el) => day(el, "street"), "day-park": (el) => day(el, "park"), grid, quiz, walk, rents };

/* Eyes on the street: who can see a person walking along a 300 m street. */
function eyes(el) {
  const S = { grain: 6, ground: "homes", setback: 0 };
  const take = frame(el, "Who can see you?", "sketch",
    "drag the walker along the street, then change the buildings. Each line is a window or door that can see the walker.", `
    <div class="model-controls">
      ${seg("grain", "Buildings", [[6, "Narrow houses"], [110, "Long slabs"]], S.grain)}
      ${seg("setback", "Front", [[0, "On the pavement"], [30, "30 m back"]], S.setback)}
      ${seg("ground", "Ground floor", [["homes", "Homes"], ["shops", "Shops"], ["blank", "Blank walls"]], S.ground)}
    </div>
    <svg viewBox="0 0 640 262" role="img" aria-label="Plan of a 300 metre street with buildings on both sides. Lines link the walker to the windows and doors that can see them."></svg>
    <label class="model-ctl-label" for="eyes-walk">Walk along the street</label>
    <input type="range" id="eyes-walk" min="0" max="300" value="120">
    <p class="model-note">A window or door counts if it is within 40 m; a shopkeeper counts double. On the map, the street wall and front doors per 100 m measure the same thing for real streets.</p>`);
  const svg = el.querySelector("svg"), walk = el.querySelector("input");
  el.querySelectorAll(".seg").forEach((s) => segmented(s, (v) => { S[s.dataset.k] = isNaN(+v) ? v : +v; draw(); }));
  walk.addEventListener("input", draw);
  const PX = 2, X0 = 20, ROAD = 6, WALK = 3;

  function buildings() {
    const list = [];
    for (const side of [-1, 1]) {
      let x = side === 1 ? S.grain * 0.4 : 0;
      while (x < 300) {
        const w = Math.min(S.grain, 300 - x);
        if (w > 2) list.push({ side, x, w, depth: S.grain > 50 ? 14 : 10 });
        x += w + (S.grain > 50 ? 12 : 0);
      }
    }
    return list;
  }

  function draw() {
    const wx = +walk.value, list = buildings();
    const Y = (m) => 128 + m * PX, X = (m) => X0 + m * PX;
    svg.textContent = "";
    svgEl("rect", { x: X0, y: Y(-ROAD - WALK), width: 300 * PX, height: (ROAD + WALK) * 2 * PX, fill: token("grid") }, svg);
    for (const s of [-1, 1]) svgEl("line", { x1: X0, x2: X0 + 300 * PX, y1: Y(s * ROAD), y2: Y(s * ROAD), stroke: token("border") }, svg);
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
    let eyesOn = 0;
    const seen = new Set();
    for (const p of pts) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < 40) {
        eyesOn++;
        seen.add(p.b);
        svgEl("line", { x1: X(p.x), y1: Y(p.y), x2: X(wx), y2: Y(wy), stroke: token("series-2"), "stroke-opacity": (0.15 + 0.6 * (1 - d / 40)).toFixed(2), "stroke-width": p.shop ? 1.6 : 0.8 }, svg);
      }
      svgEl("circle", { cx: X(p.x), cy: Y(p.y), r: p.shop ? 2.6 : 1.5, fill: p.shop ? token("series-2") : token("series-1") }, svg);
    }
    svgEl("circle", { cx: X(wx), cy: Y(wy), r: 6, fill: token("series-2"), stroke: token("surface-1"), "stroke-width": 2 }, svg);
    text(svg, X0, 256, "0 m");
    text(svg, X0 + 300 * PX, 256, "300 m", { "text-anchor": "end" });

    const verdict = eyesOn === 0 ? "Nobody can see you here."
      : eyesOn < 15 ? "Only a few windows look onto this spot."
        : "Plenty of people could see you here without meaning to.";
    take.innerHTML = `${verdict} <b>${eyesOn}</b> windows and doors in <b>${seen.size}</b> buildings face this spot${
      S.ground === "shops" ? ", and shopkeepers are watching all day" : ""}.`;
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
  const take = frame(el, park ? "Who is in the park, and when?" : "Who is on the street, and when?", "sketch",
    `start from ${park ? "a park ringed by homes" : "a street of homes only"}, then tick other reasons to be there. Grey bands are hours when the ${park ? "park" : "street"} is nearly empty.`, `
    <div class="model-controls">${seg("preset", "Start from", Object.keys(presets).map((k) => [k, names[k]]), "homes")}</div>
    <div class="model-toggles">${USES.map((u) => `<label><input type="checkbox" data-u="${u.id}"><i class="sw" data-c="${u.c}"></i>${u.label}</label>`).join("")}</div>
    <svg viewBox="0 0 640 220" role="img" aria-label="Stacked area chart of people ${park ? "in the park" : "on the street"} by hour of the day, by reason for being there."></svg>
    <p class="model-note">The hourly patterns are made up to show the mechanism. The opening-hours chart further down shows the little real data there is.</p>`);
  const svg = el.querySelector("svg");
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
    const where = park ? "park" : "street";
    take.innerHTML = quiet === 0
      ? `With ${act.length} reasons to be here, someone is around in every waking hour. This is Jacobs' point: each use fills the gaps the others leave.`
      : `The ${where} is nearly empty for <b>${quiet}</b> of 18 waking hours (6:00 to midnight). ${
        act.length < 4 ? "Add another reason to be here and watch the grey gaps close." : ""}`;
  }
  draw();
  return draw;
}

/* Cut a new street: shortest routes between two corners of a grid. */
function grid(el) {
  const take = frame(el, "How many ways can you walk from A to B?", "sketch",
    "click a dashed line to cut a new cross street through a long block. The coloured lines are some of the shortest walks.", `
    <svg viewBox="0 0 640 220" role="img" aria-label="A street grid with long blocks. Dashed lines mark possible new cross streets."></svg>
    <div class="model-controls"><button type="button" class="model-btn" data-a="long">Long blocks</button><button type="button" class="model-btn" data-a="short">All short blocks</button></div>
    <p class="model-note">The faint lines are six shortest routes picked at random. One grid step is 30 m, so the starting blocks are 240 m long, as on the Upper West Side.</p>`);
  const svg = el.querySelector("svg");
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
    const routes = n[`${W},${H}`], first = 20;
    const block = Math.round((W / (open.size - 1)) * 30);
    take.innerHTML = routes === first
      ? `With ${block} m blocks there are <b>${routes}</b> shortest walks, and they all squeeze onto the same few streets. A shop halfway along a block sees few of them.`
      : `With ${block} m blocks there are <b>${routes.toLocaleString("en")}</b> shortest walks, ${Math.round(routes / first)} times as many. Paths spread over more streets and cross more often, and more corners face passers-by.`;
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
  const take = frame(el, "Which has the most homes per hectare?", "data",
    `the same 800 × 800 m of ${ids.length} districts, at the same scale. Guess which one holds the most homes, then click it.`, `
    <div class="quiz-grid"></div>
    <div class="model-controls"><button type="button" class="model-btn" data-a="reveal">Show all</button><button type="button" class="model-btn" data-a="reset">Try again</button></div>
    <p class="model-note">Values are the median addresses per ha of each district's hexagons, not of the square shown.</p>`);
  const gridEl = el.querySelector(".quiz-grid"), out = take;
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
    else if (picked) out.innerHTML = `<span>${byId[picked].label} has <b class="sm">${Math.round(units(picked))}</b> addresses per ha. The densest is ${b.label}, at ${Math.round(max)}. Tall buildings with lawns around them often hold fewer homes than low buildings packed together.</span>`;
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
  const short = (k) => (v.labels[k] || k).replace(/^large /i, "").split(/[ ,(]/)[0].replace(/^\w/, (c) => c.toUpperCase());
  const take = frame(el, "Does life thin out near an edge?", "data",
    "pick a kind of edge, then move the slider to walk away from it. The line counts shops, cafés and other places on ordinary land around it.", `
    <div class="model-controls">${seg("kind", "Edge of", kinds.map((k) => [k, v.labels[k] ? short(k) : k]), kind)}</div>
    <svg viewBox="0 0 640 210" role="img" aria-label="Line chart of places per hectare by distance from the edge of a border vacuum."></svg>
    <label class="model-ctl-label" for="vac-walk">Your distance from the edge</label>
    <input type="range" id="vac-walk" min="0" max="7" step="1" value="0">
    <p class="model-note">Fewer places near an edge is partly fewer homes near it, not only fewer people passing. Step 5 checks this.</p>`);
  const svg = el.querySelector("svg"), slider = el.querySelector("input");
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
    const share = Math.round((r.places_per_ha / far) * 100);
    take.innerHTML = `<b>${r.band_lo}–${r.band_hi} m</b> from the edge there are <b>${r.places_per_ha.toFixed(1)}</b> places per ha, ${
      share < 90 ? `only ${share}% of the level` : share > 110 ? `more than the level` : "about the same as"} ${rows[rows.length - 1].band_lo}–${xMax} m away.`;
  }
  draw();
  return draw;
}

/* Who can afford to move in? Old buildings are cheap, and only cheap space lets
   new and marginal businesses start. Rents here are rough tiers, not data. */
const AGES = { old: { label: "pre-1945", rent: 1 }, mid: { label: "1960s–80s", rent: 2 }, new: { label: "new", rent: 3 } };
const STREETS = {
  new: ["new", "new", "new", "new", "new", "new", "new", "new", "new", "new"],
  two: ["mid", "new", "mid", "mid", "new", "new", "mid", "new", "mid", "new"],
  many: ["old", "new", "mid", "old", "old", "mid", "new", "old", "mid", "old"],
};
const FIRMS = [
  { label: "Chain store", pays: 3 }, { label: "Bank branch", pays: 3 },
  { label: "Restaurant", pays: 2 }, { label: "Bookshop", pays: 2 },
  { label: "Start-up workshop", pays: 1 }, { label: "Artist's studio", pays: 1 },
];

function rents(el) {
  let street = "new";
  const take = frame(el, "Who can afford to move in?", "sketch",
    "change the ages of the buildings on this street and see which businesses can find a space they can pay for.", `
    <div class="model-controls">${seg("street", "Buildings", [["new", "All built at once"], ["two", "Two ages"], ["many", "Many ages"]], street)}</div>
    <svg viewBox="0 0 640 170" role="img" aria-label="A street of ten buildings shaded by age, with the rent level of each."></svg>
    <div class="firm-row"></div>
    <p class="model-note">Rents are three rough levels: new buildings are dearest, old ones cheapest. Jacobs: "Old ideas can sometimes use new buildings. New ideas must use old buildings."</p>`);
  const svg = el.querySelector("svg"), firms = el.querySelector(".firm-row");
  segmented(el.querySelector(".seg"), (v) => { street = v; draw(); });
  function draw() {
    svg.textContent = "";
    const ages = STREETS[street], w = 58, gap = 4, base = 130;
    const fill = { old: token("seq-3"), mid: token("seq-5"), new: token("seq-7") };
    svgEl("line", { x1: 8, x2: 632, y1: base, y2: base, stroke: token("border") }, svg);
    ages.forEach((a, i) => {
      const h = a === "new" ? 96 : a === "mid" ? 78 : 62, x = 12 + i * (w + gap);
      svgEl("rect", { x, y: base - h, width: w, height: h, fill: fill[a], rx: 2 }, svg);
      text(svg, x + w / 2, base + 16, AGES[a].label, { "text-anchor": "middle", "font-size": 10 });
      text(svg, x + w / 2, base + 30, "€".repeat(AGES[a].rent), { "text-anchor": "middle", "font-size": 11, fill: token("text-primary") });
    });
    const cheapest = Math.min(...ages.map((a) => AGES[a].rent));
    const fits = FIRMS.filter((f) => f.pays >= cheapest);
    firms.innerHTML = FIRMS.map((f) => `<span class="firm${f.pays >= cheapest ? " in" : ""}">${f.label}</span>`).join("");
    take.innerHTML = fits.length === FIRMS.length
      ? "With old buildings on the street, every kind of business finds a space, including the new and marginal ones that make a district diverse."
      : `Only <b>${fits.length}</b> of ${FIRMS.length} kinds of business can pay these rents. ${
        cheapest === 3 ? "A street built all at once has only high-rent space, so it fills with businesses that can afford it." : "Add some older, cheaper buildings to let the rest in."}`;
  }
  draw();
  return draw;
}
