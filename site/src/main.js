import { HexMap } from "./map.js";
import { renderProfile } from "./profile.js";
import { renderFigureGround } from "./figureground.js";
import { renderDensity } from "./density.js";
import { renderVacuums } from "./vacuums.js";
import { renderParks } from "./parks.js";
import { renderClocks } from "./clocks.js";
import { onThemeChange } from "./theme.js";
import { STORIES } from "./stories.js";
import { renderModel } from "./models.js";
import { explainHex } from "./explain.js";

const base = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);
const tooltip = $("tooltip");
const hexMap = new HexMap($("map"), tooltip);
const state = { generator: "short_blocks", metric: null, city: null, data: null, hex: null, redrawModel: null };

async function getJSON(path) {
  const res = await fetch(`${base}data/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

const EMPTY = { type: "FeatureCollection", features: [] };
// Layers a city may not have yet.
const optional = (path) => getJSON(path).catch(() => EMPTY);

async function loadCity(id) {
  const [city, hex, areas, water, fg, links, vacuums, parks, clocks] = await Promise.all([
    getJSON(`${id}/city.json`), getJSON(`${id}/hex.geojson`), getJSON(`${id}/areas.geojson`),
    getJSON(`${id}/water.geojson`), getJSON(`${id}/figure_ground.json`),
    optional(`${id}/links.geojson`), optional(`${id}/vacuums.geojson`), optional(`${id}/parks.geojson`),
    getJSON(`${id}/clocks.json`).catch(() => ({})),
  ]);
  state.city = city;
  state.hex = null;
  state.data = { hex, areas, water, fg, links, vacuums, parks, clocks };
  hexMap.onHexClick = (p) => { state.hex = p; explainHex($("explain"), state.generator, p, city); };
  await hexMap.load(city, state.data);
  loadGround(id);
  renderTabs();
  renderCharts();
  renderMethod();
}

// Compact point files: [dx, dy, extra...] integers from an origin (see jacobs/export.py).
function decodePoints(file, stride, props) {
  const { origin: [x0, y0], scale, points } = file;
  const features = [];
  for (let i = 0, k = 0; i < points.length; i += stride, k++) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [x0 + points[i] / scale, y0 + points[i + 1] / scale] },
      properties: props(points, i, k),
    });
  }
  return { type: "FeatureCollection", features };
}

// The things the indicators count load after the map, so the page is usable first.
async function loadGround(id) {
  const [places, addresses, intersections] = await Promise.all(
    ["places", "addresses", "intersections"].map((n) => getJSON(`${id}/${n}.json`).catch(() => null)));
  if (state.city?.id !== id) return;
  if (places) hexMap.setGround("places", decodePoints(places, 3, (p, i, k) => ({ group: places.groups[p[i + 2]], name: places.names[k] })));
  if (addresses) hexMap.setGround("addresses", decodePoints(addresses, 3, (p, i) => ({ n: p[i + 2] })));
  if (intersections) hexMap.setGround("intersections", decodePoints(intersections, 2, () => ({})));
}

function renderStory(g) {
  const { city, data } = state;
  const story = STORIES[g.id] || {};
  const scene = city.story?.scenes?.[g.id];
  $("story-idea").textContent = story.idea || "";
  $("story-scene").textContent = story.scene || "";
  $("story-scene-source").textContent = story.scene ? `In the book, chapter ${story.chapter}` : "";
  $("story-city-block").hidden = !scene;
  if (scene) {
    $("story-city-title").textContent = `In ${city.name}`;
    $("story-city").textContent = scene.text;
    $("story-places").innerHTML = (scene.places || []).map((p, i) =>
      `<button type="button" class="place-btn" data-i="${i}">Show ${p.label} on the map</button>`).join("");
    $("story-places").querySelectorAll(".place-btn").forEach((b) => b.addEventListener("click", () => {
      const p = scene.places[+b.dataset.i];
      hexMap.flyTo(p.center, p.zoom);
      $("map").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }));
  }
  $("story-counts").textContent = story.counts || "";
  $("story-honest").textContent = story.honest ? `Limits: ${story.honest}` : "";
  state.redrawModel = renderModel(story.model, $("story-model"), { city, data });
  $("story").classList.toggle("no-model", $("story-model").hidden);
}

function renderTabs() {
  const { city } = state;
  const tab = (g) =>
    `<button class="tab${g.status ? " pending" : ""}" role="tab" data-g="${g.id}" aria-selected="${g.id === state.generator}">
      ${g.label}<span class="chapter">ch. ${g.chapter}</span></button>`;
  const generators = city.generators.filter((g) => g.kind !== "chapter");
  const chapters = city.generators.filter((g) => g.kind === "chapter");
  $("generator-tabs").innerHTML = generators.map(tab).join("") +
    (chapters.length ? `<span class="tab-divider" aria-hidden="true"></span>${chapters.map(tab).join("")}` : "");
  $("generator-tabs").querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => selectGenerator(b.dataset.g)));
  selectGenerator(state.generator);
}

function selectGenerator(id) {
  const { city } = state;
  state.generator = id;
  const g = city.generators.find((x) => x.id === id);
  $("generator-tabs").querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.g === id));
  $("generator-summary").textContent = g.summary;
  renderStory(g);
  explainHex($("explain"), id, state.hex, city);
  const metrics = city.metrics.filter((m) => m.generator === id);
  const buttons = $("metric-buttons");
  if (!metrics.length) {
    buttons.innerHTML = `<p class="pending-note">Not measured yet${g.status ? `: ${g.status}` : ""}.</p>`;
    return;
  }
  buttons.innerHTML = metrics.map((m) =>
    `<button class="chip" role="radio" data-m="${m.id}" aria-checked="false">${m.label}</button>`).join("");
  buttons.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => selectMetric(b.dataset.m)));
  selectMetric(metrics[0].id);
}

function selectMetric(id) {
  const m = state.city.metrics.find((x) => x.id === id);
  state.metric = m;
  $("metric-buttons").querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-checked", b.dataset.m === id));
  hexMap.setMetric(m, state.city.metrics.filter((x) => x.generator === m.generator));
  hexMap.legend($("legend"));
  $("metric-description").textContent = m.description;
  $("metric-source").textContent = `Source: ${m.source}. ${
    m.tier === "local" ? "National register, so this one is not comparable with other countries. " : ""}${
    m.direction === "lower" ? "Lower values are closer to what Jacobs asked for." : ""}`;
}

function renderCharts() {
  const { city, data } = state;
  renderProfile($("profile-chart"), $("profile-legend"), $("profile-table"), tooltip, city);
  renderFigureGround($("fg-grid"), city, data.fg);
  renderDensity($("density-chart"), $("density-intro"), tooltip, city);
  renderVacuums($("vacuum-chart"), $("vacuum-controls"), tooltip, city);
  renderParks($("park-chart"), $("park-controls"), $("park-legend"), tooltip, city, data.parks);
  renderClocks($("clock-chart"), $("clock-controls"), $("clock-legend"), tooltip, city, data.clocks);
}

function renderMethod() {
  const { city } = state;
  $("method-text").innerHTML = `
    <p>${city.name} is divided into ${city.distributions.units_per_ha.length.toLocaleString()} H3 hexagons
    (resolution ${city.h3_resolution}, about 10 ha each). Every metric is computed per hexagon from the
    Overture Maps release ${city.sources.overture_release}. In the Netherlands, Overture's addresses come
    directly from the BAG, the national building and address register.</p>
    <p>Districts are compared by their median hexagon. Percentiles are relative to the rest of the same
    city, so they show contrasts within a city; comparisons between cities use the raw values.</p>
    <p>Eyes on the street is measured per street (intersection to intersection) and then averaged over
    each hexagon's street length. Border vacuums are detected from Overture land use, rail and motorway
    lines, water, and the street network itself; parks are Overture land use parks over 0.5 ha.</p>
    <p>Metrics come in two tiers. The <b>global</b> tier is computed the same way for every city,
    from Overture, so cities can be compared. The <b>local</b> tier uses a national register and
    exists only where that register does: for ${city.name} that is the BAG for the use class, floor
    area and construction year of every unit, the CBS 100 m grid for residents, dwelling value and
    tenure, the BGT for how street space divides between cars and people, and OSM opening hours for
    the time of day. Those are richer but stop at the border, so each one is labelled where it is
    shown.</p>
    <p>Two of them are worth a word. The use mix in the local tier is floor area across legal use
    classes with <em>homes included</em>, which a count of shops can never see, though housing is
    the use that puts people on a street in the evening. And the spread of dwelling value is a
    spread, not an average: her case for old buildings is a case for a mix of rents, so the
    variation inside a neighbourhood is the measure.</p>
    <p>Jacobs' arguments are qualitative. Each indicator here is one interpretation of them. See the
    project's <code>docs/</code> folder for definitions and data sources.</p>`;
}

async function init() {
  const cities = await getJSON("cities.json");
  const params = new URLSearchParams(location.search);
  const first = cities.find((c) => c.id === params.get("city"))?.id || cities[0].id;
  $("city").innerHTML = cities.map((c) => `<option value="${c.id}" ${c.id === first ? "selected" : ""}>${c.name}</option>`).join("");
  $("city").addEventListener("change", (e) => {
    history.replaceState(null, "", `?city=${e.target.value}`);
    loadCity(e.target.value);
  });
  await loadCity(first);
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(renderCharts, 150); });
  onThemeChange(() => { renderCharts(); state.redrawModel?.(); });
}

init().catch((err) => {
  document.querySelector("main").insertAdjacentHTML("afterbegin", `<p class="pending-note">${err.message}</p>`);
  console.error(err);
});
