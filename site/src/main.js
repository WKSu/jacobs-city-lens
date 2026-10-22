import { HexMap } from "./map.js";
import { renderProfile } from "./profile.js";
import { renderFigureGround } from "./figureground.js";
import { renderDensity } from "./density.js";
import { renderVacuums } from "./vacuums.js";
import { renderParks } from "./parks.js";
import { onThemeChange } from "./theme.js";

const base = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);
const tooltip = $("tooltip");
const hexMap = new HexMap($("map"), tooltip);
const state = { generator: "short_blocks", metric: null, city: null, data: null };

async function getJSON(path) {
  const res = await fetch(`${base}data/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

const EMPTY = { type: "FeatureCollection", features: [] };
// Layers a city may not have yet.
const optional = (path) => getJSON(path).catch(() => EMPTY);

async function loadCity(id) {
  const [city, hex, areas, water, fg, links, vacuums, parks] = await Promise.all([
    getJSON(`${id}/city.json`), getJSON(`${id}/hex.geojson`), getJSON(`${id}/areas.geojson`),
    getJSON(`${id}/water.geojson`), getJSON(`${id}/figure_ground.json`),
    optional(`${id}/links.geojson`), optional(`${id}/vacuums.geojson`), optional(`${id}/parks.geojson`),
  ]);
  state.city = city;
  state.data = { hex, areas, water, fg, links, vacuums, parks };
  await hexMap.load(city, state.data);
  renderTabs();
  renderCharts();
  renderMethod();
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
  const metrics = city.metrics.filter((m) => m.generator === id);
  const buttons = $("metric-buttons");
  if (!metrics.length) {
    buttons.innerHTML = `<p class="pending-note">Not measured yet: ${g.status}.</p>`;
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
    m.direction === "lower" ? "Lower values are closer to what Jacobs asked for." : ""}`;
}

function renderCharts() {
  const { city, data } = state;
  renderProfile($("profile-chart"), $("profile-legend"), $("profile-table"), tooltip, city);
  renderFigureGround($("fg-grid"), city, data.fg);
  renderDensity($("density-chart"), $("density-intro"), tooltip, city);
  renderVacuums($("vacuum-chart"), $("vacuum-controls"), tooltip, city);
  renderParks($("park-chart"), $("park-controls"), $("park-legend"), tooltip, city, data.parks);
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
    <p>Jacobs' arguments are qualitative. Each indicator here is one interpretation of them, and
    the third generator (aged buildings) waits for BAG construction years. See the project's
    <code>docs/</code> folder for definitions and data sources.</p>`;
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
  onThemeChange(renderCharts);
}

init().catch((err) => {
  document.querySelector("main").insertAdjacentHTML("afterbegin", `<p class="pending-note">${err.message}</p>`);
  console.error(err);
});
