import maplibregl from "maplibre-gl";
import { quantile } from "d3";
import { sequential, token, onThemeChange } from "./theme.js";
import { formatter, withUnit } from "./format.js";

// Self-contained map: no external basemap or glyphs, just our own layers.
export class HexMap {
  constructor(container, tooltip) {
    this.container = container;
    this.tooltip = tooltip;
    this.metric = null;
    this.hovered = null;
    this.markers = [];
    onThemeChange(() => this.restyle());
  }

  async load(city, data) {
    this.city = city;
    this.data = data;
    if (this.map) this.map.remove();
    this.markers.forEach((m) => m.remove());
    this.markers = [];

    this.map = new maplibregl.Map({
      container: this.container,
      style: {
        version: 8,
        sources: {
          water: { type: "geojson", data: data.water },
          hex: { type: "geojson", data: data.hex, promoteId: "h3" },
          areas: { type: "geojson", data: data.areas },
        },
        layers: [
          { id: "land", type: "background", paint: { "background-color": token("land") } },
          { id: "water", type: "fill", source: "water", paint: { "fill-color": token("water") } },
          { id: "hex", type: "fill", source: "hex", paint: { "fill-color": token("hex-empty"), "fill-opacity": 0.92 } },
          {
            id: "hex-line", type: "line", source: "hex",
            paint: {
              "line-color": ["case", ["boolean", ["feature-state", "hover"], false], token("text-primary"), token("surface-1")],
              "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.6],
            },
          },
          {
            id: "areas", type: "line", source: "areas",
            paint: {
              "line-color": token("text-primary"), "line-width": 1.6,
              "line-dasharray": ["case", ["==", ["get", "role"], "planned"], ["literal", [2, 1.5]], ["literal", [1, 0]]],
            },
          },
        ],
      },
      bounds: city.bounds,
      fitBoundsOptions: { padding: 16 },
      attributionControl: { compact: true, customAttribution: "© Overture Maps, OpenStreetMap contributors" },
      dragRotate: false,
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    this.map.touchZoomRotate.disableRotation();

    await new Promise((resolve) => this.map.on("load", resolve));

    for (const f of data.areas.features) {
      const el = document.createElement("div");
      el.className = "area-label";
      el.textContent = f.properties.label;
      const c = centroid(f.geometry);
      this.markers.push(new maplibregl.Marker({ element: el }).setLngLat(c).addTo(this.map));
    }

    this.map.on("mousemove", "hex", (e) => this.hover(e));
    this.map.on("mouseleave", "hex", () => this.clearHover());
    if (this.metric) this.setMetric(this.metric, this.generatorMetrics);
  }

  setMetric(metric, generatorMetrics) {
    this.metric = metric;
    this.generatorMetrics = generatorMetrics;
    if (!this.map || !this.map.isStyleLoaded()) return;
    const values = this.city.distributions[metric.id] || [];
    this.breaks = breaks(values, 7);
    const colors = sequential();
    const expr = ["step", ["get", metric.id], colors[0]];
    this.breaks.forEach((b, i) => expr.push(b, colors[i + 1]));
    this.map.setPaintProperty("hex", "fill-color", [
      "case", ["==", ["typeof", ["get", metric.id]], "number"], expr, token("hex-empty"),
    ]);
  }

  restyle() {
    if (!this.map) return;
    this.map.setPaintProperty("land", "background-color", token("land"));
    this.map.setPaintProperty("water", "fill-color", token("water"));
    this.map.setPaintProperty("areas", "line-color", token("text-primary"));
    this.map.setPaintProperty("hex-line", "line-color",
      ["case", ["boolean", ["feature-state", "hover"], false], token("text-primary"), token("surface-1")]);
    if (this.metric) this.setMetric(this.metric, this.generatorMetrics);
  }

  hover(e) {
    const f = e.features[0];
    if (this.hovered !== null) this.map.setFeatureState({ source: "hex", id: this.hovered }, { hover: false });
    this.hovered = f.id;
    this.map.setFeatureState({ source: "hex", id: f.id }, { hover: true });
    const p = f.properties;
    const area = this.city.areas.find((a) => a.id === p.study_area);
    const rows = (this.generatorMetrics || [this.metric]).map((m) =>
      `<tr class="${m.id === this.metric.id ? "active" : ""}"><td>${m.label}</td><td class="v">${withUnit(m, p[m.id])}</td></tr>`
    ).join("");
    this.tooltip.innerHTML = `<div class="t-title">${area ? area.label : "Hexagon"}</div>
      <table>${rows}<tr><td>Addresses</td><td class="v">${p.units ?? 0}</td></tr>
      <tr><td>Places</td><td class="v">${p.places ?? 0}</td></tr></table>`;
    this.tooltip.hidden = false;
    const { clientX: x, clientY: y } = e.originalEvent;
    const w = this.tooltip.offsetWidth;
    this.tooltip.style.left = `${x + 16 + w > window.innerWidth ? x - w - 16 : x + 16}px`;
    this.tooltip.style.top = `${y + 12}px`;
    this.map.getCanvas().style.cursor = "crosshair";
  }

  clearHover() {
    if (this.hovered !== null) this.map.setFeatureState({ source: "hex", id: this.hovered }, { hover: false });
    this.hovered = null;
    this.tooltip.hidden = true;
    this.map.getCanvas().style.cursor = "";
  }

  legend(el) {
    const m = this.metric;
    const f = formatter(m);
    const colors = sequential();
    const ticks = [];
    const values = this.city.distributions[m.id] || [];
    ticks.push(f(values[0]));
    ticks.push(...this.breaks.filter((_, i) => i % 2 === 1).map(f));
    ticks.push(f(values[values.length - 1]));
    el.innerHTML = `<div class="legend-title">${m.label}${m.unit && m.unit !== "share" ? ` <span class="source">(${m.unit})</span>` : ""}</div>
      <div class="legend-scale">${colors.slice(0, this.breaks.length + 1).map((c) => `<span style="background:${c}"></span>`).join("")}</div>
      <div class="legend-ticks">${ticks.map((t) => `<span>${t}</span>`).join("")}</div>
      <div class="source">Seven equal-count classes across the city's hexagons.</div>
      <div class="legend-empty"><i></i> no data / too few places</div>`;
  }
}

function breaks(sorted, n) {
  const out = [];
  for (let i = 1; i < n; i++) {
    const q = quantile(sorted, i / n);
    if (q !== undefined && (out.length === 0 || q > out[out.length - 1])) out.push(q);
  }
  return out;
}

function centroid(geom) {
  const ring = geom.type === "Polygon" ? geom.coordinates[0]
    : geom.coordinates.reduce((a, p) => (p[0].length > a.length ? p[0] : a), []);
  let x = 0, y = 0;
  for (const [lx, ly] of ring) { x += lx; y += ly; }
  return [x / ring.length, y / ring.length];
}
