import maplibregl from "maplibre-gl";
import { quantile } from "d3";
import { sequential, token } from "./theme.js";
import { formatter, withUnit } from "./format.js";

// Streets replace hexagons from this zoom when the metric has a street-level version.
const LINK_ZOOM = 14;

// What each tab's indicators count, shown instead of hexagons when zoomed in.
// "linkColor" colours the street links by another property than the metric.
const GROUND = {
  mixed_uses: { layers: ["addresses", "places"] },
  short_blocks: { layers: ["links", "intersections"], linkColor: "length_m" },
  concentration: { layers: ["addresses"] },
};
// Street length between corners (m): the classes used to colour Jacobs' block length.
export const LENGTH_BREAKS = [60, 100, 150, 250];
// The six place groups fold into three families for the dots (three hues stay
// distinguishable on a map; the hexagon panel still shows all six).
export const FAMILIES = [
  { id: "work", label: "Work and civic", groups: ["work", "civic"], color: "cat-1" },
  { id: "shops", label: "Shops and services", groups: ["shopping", "personal_services"], color: "cat-2" },
  { id: "leisure", label: "Food, culture and leisure", groups: ["food_drink", "culture_leisure"], color: "cat-3" },
];
const EMPTY = { type: "FeatureCollection", features: [] };

// Self-contained map: no external basemap or glyphs, just our own layers.
export class HexMap {
  constructor(container, tooltip) {
    this.container = container;
    this.tooltip = tooltip;
    this.metric = null;
    this.hovered = null;
    this.markers = [];
    this.ground = {};
    this.onHexClick = null;
  }

  // Point layers (places, addresses, intersections) arrive later than the map; see main.js.
  setGround(name, geojson) {
    this.ground[name] = geojson;
    this.map?.getSource(name)?.setData(geojson);
  }

  flyTo(center, zoom) {
    this.map?.flyTo({ center, zoom, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1600 });
  }

  async load(city, data) {
    this.city = city;
    this.data = data;
    if (this.map) this.map.remove();
    this.markers.forEach((m) => m.remove());
    this.markers = [];
    this.selected = null;

    this.map = new maplibregl.Map({
      container: this.container,
      style: {
        version: 8,
        sources: {
          water: { type: "geojson", data: data.water },
          hex: { type: "geojson", data: data.hex, promoteId: "h3" },
          areas: { type: "geojson", data: data.areas },
          links: { type: "geojson", data: data.links },
          vacuums: { type: "geojson", data: data.vacuums },
          parks: { type: "geojson", data: data.parks },
          places: { type: "geojson", data: this.ground.places || EMPTY },
          addresses: { type: "geojson", data: this.ground.addresses || EMPTY },
          intersections: { type: "geojson", data: this.ground.intersections || EMPTY },
        },
        layers: [
          { id: "land", type: "background", paint: { "background-color": token("land") } },
          { id: "water", type: "fill", source: "water", paint: { "fill-color": token("water") } },
          { id: "hex", type: "fill", source: "hex", paint: { "fill-color": token("hex-empty"), "fill-opacity": 0.92 } },
          {
            id: "hex-line", type: "line", source: "hex",
            paint: {
              "line-color": hexLineColor(),
              "line-width": ["case", ["any", ["boolean", ["feature-state", "hover"], false], ["boolean", ["feature-state", "selected"], false]], 2.4, 0.6],
            },
          },
          {
            id: "parks", type: "fill", source: "parks", layout: { visibility: "none" },
            paint: { "fill-color": token("hex-empty"), "fill-outline-color": token("text-muted") },
          },
          {
            id: "links", type: "line", source: "links", minzoom: LINK_ZOOM - 1,
            layout: { visibility: "none", "line-cap": "round" },
            paint: {
              "line-color": token("hex-empty"),
              "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.2, 16, 4],
              "line-opacity": ["interpolate", ["linear"], ["zoom"], LINK_ZOOM - 1, 0, LINK_ZOOM, 1],
            },
          },
          {
            id: "addresses", type: "circle", source: "addresses", minzoom: LINK_ZOOM - 1, layout: { visibility: "none" },
            paint: {
              "circle-color": token("text-muted"),
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, ["min", 3, ["+", 0.6, ["*", 0.25, ["sqrt", ["get", "n"]]]]],
                17, ["min", 9, ["+", 1.5, ["*", 0.9, ["sqrt", ["get", "n"]]]]]],
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], LINK_ZOOM - 1, 0, LINK_ZOOM, 0.55],
            },
          },
          {
            id: "places", type: "circle", source: "places", minzoom: LINK_ZOOM - 1, layout: { visibility: "none" },
            paint: {
              "circle-color": familyColor(),
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.6, 17, 5],
              "circle-stroke-color": token("surface-1"),
              "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 14, 0, 16, 1],
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], LINK_ZOOM - 1, 0, LINK_ZOOM, 1],
              "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], LINK_ZOOM - 1, 0, LINK_ZOOM, 1],
            },
          },
          {
            id: "intersections", type: "circle", source: "intersections", minzoom: LINK_ZOOM - 1, layout: { visibility: "none" },
            paint: {
              "circle-color": token("text-primary"),
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.2, 17, 4],
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], LINK_ZOOM - 1, 0, LINK_ZOOM, 1],
            },
          },
          {
            id: "vacuums", type: "line", source: "vacuums", layout: { visibility: "none" },
            paint: { "line-color": token("text-primary"), "line-width": 1, "line-dasharray": [2, 2] },
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

    this.map.on("mousemove", "hex", (e) => { if (this.hoverTarget() === "hex") this.hover(e); });
    this.map.on("mouseleave", "hex", () => this.clearHover());
    this.map.on("mousemove", "links", (e) => { if (this.hoverTarget() === "links") this.hoverLink(e); });
    this.map.on("mouseleave", "links", () => this.clearHover());
    this.map.on("mousemove", "places", (e) => this.hoverPlace(e));
    this.map.on("mouseleave", "places", () => this.clearHover());
    this.map.on("click", "hex", (e) => {
      const f = e.features[0];
      if (this.selected != null) this.map.setFeatureState({ source: "hex", id: this.selected }, { selected: false });
      this.selected = f.id;
      this.map.setFeatureState({ source: "hex", id: f.id }, { selected: true });
      this.onHexClick?.(f.properties);
    });
    this.map.on("mousemove", "parks", (e) => this.hoverPark(e));
    this.map.on("mouseleave", "parks", () => this.clearHover());
    this.map.on("zoomend", () => this.clearHover());
    if (this.metric) this.setMetric(this.metric, this.generatorMetrics);
  }

  setMetric(metric, generatorMetrics) {
    this.metric = metric;
    this.generatorMetrics = generatorMetrics;
    if (!this.map || !this.map.isStyleLoaded()) return;
    const values = this.city.distributions[metric.id] || [];
    this.breaks = metric.breaks || breaks(values, 7);
    const onParks = metric.layer === "parks";
    const show = (id, on) => this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    const ground = GROUND[metric.generator];
    this.groundOn = !!ground;
    show("parks", onParks);
    show("links", !!metric.links || !!ground?.layers.includes("links"));
    show("vacuums", metric.generator === "border_vacuums");
    for (const id of ["places", "addresses", "intersections"]) show(id, !!ground?.layers.includes(id));

    if (onParks) {
      this.map.setPaintProperty("hex", "fill-color", token("hex-empty"));
      this.map.setPaintProperty("hex", "fill-opacity", 0.5);
      this.map.setPaintProperty("parks", "fill-color", colorExpr(metric.id, this.breaks));
      return;
    }
    this.map.setPaintProperty("hex", "fill-color", colorExpr(metric.id, this.breaks, metric.classes && classColors(metric.classes.length)));
    // Street-level metrics: hexagons fade out as single streets fade in.
    this.map.setPaintProperty("hex", "fill-opacity", metric.links || ground
      ? ["interpolate", ["linear"], ["zoom"], LINK_ZOOM - 1, 0.92, LINK_ZOOM, ground ? 0.08 : 0.15] : 0.92);
    if (ground?.linkColor) {
      const ramp = sequential();
      this.map.setPaintProperty("links", "line-color", colorExpr(ground.linkColor, LENGTH_BREAKS, [ramp[1], ramp[2], ramp[4], ramp[5], ramp[6]]));
    } else if (metric.links) {
      this.linkBreaks = breaks(this.city.link_distributions[metric.id] || [], 7);
      this.map.setPaintProperty("links", "line-color", colorExpr(metric.id, this.linkBreaks));
    }
  }

  hoverTarget() {
    if (this.map.getZoom() < LINK_ZOOM) return "hex";
    if (this.metric?.links) return "links";
    return this.groundOn ? "ground" : "hex";
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

  hoverLink(e) {
    const p = e.features[0].properties;
    this.showTooltip(e, `<div class="t-title">This street</div><table>${this.rows(p)}</table>
      <div class="source">On streets, colours are classed among all streets, not hexagons.</div>`);
  }

  hoverPlace(e) {
    if (this.hoverTarget() !== "ground") return;
    const p = e.features[0].properties;
    const fam = FAMILIES.find((f) => f.groups.includes(p.group));
    this.showTooltip(e, `<div class="t-title">${p.name || "Unnamed place"}</div>
      <div class="source">${fam ? fam.label : ""} (${p.group.replace("_", " ")})</div>`);
  }

  hoverPark(e) {
    const p = e.features[0].properties;
    const name = p.name && p.name !== "null" ? p.name : "Unnamed park";
    this.showTooltip(e, `<div class="t-title">${name}</div>
      <table><tr><td>Size</td><td class="v">${Number(p.area_ha).toFixed(1)} ha</td></tr>${this.rows(p)}</table>`);
  }

  rows(p) {
    return this.generatorMetrics.map((m) =>
      `<tr class="${m.id === this.metric.id ? "active" : ""}"><td>${m.label}</td><td class="v">${withUnit(m, p[m.id])}</td></tr>`
    ).join("");
  }

  showTooltip(e, html) {
    this.tooltip.innerHTML = html;
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
    if (m.classes) {
      const colors = classColors(m.classes.length);
      el.innerHTML = `<div class="legend-title">${m.label}${m.unit ? ` <span class="source">(${m.unit})</span>` : ""}</div>
        <div class="legend-scale">${colors.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
        <div class="legend-ticks">${m.classes.map((t) => `<span>${t}</span>`).join("")}</div>
        <div class="legend-empty"><i></i> left out: little land or missing data</div>`;
      return;
    }
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
      <div class="source">Seven equal-count classes across the city's ${m.layer === "parks" ? "parks" : "hexagons"}.${
        m.links ? " Zoom in to see single streets." : ""}</div>
      ${m.generator === "border_vacuums" ? `<div class="legend-empty"><i class="dashed"></i> edge of a border vacuum</div>` : ""}
      ${groundLegend(m.generator)}
      <div class="legend-empty"><i></i> ${m.layer === "parks" ? "outside parks / too few places" : "no data / too few places"}</div>`;
  }
}

function hexLineColor() {
  return ["case", ["boolean", ["feature-state", "selected"], false], token("series-2"),
    ["boolean", ["feature-state", "hover"], false], token("text-primary"), token("surface-1")];
}

function familyColor() {
  const expr = ["match", ["get", "group"]];
  for (const f of FAMILIES) expr.push(f.groups, token(f.color));
  expr.push(token("text-muted"));
  return expr;
}

function groundLegend(generator) {
  const ground = GROUND[generator];
  if (!ground) return "";
  const dot = (color, label, cls = "") => `<span class="key"><i class="kdot ${cls}" style="background:${color}"></i>${label}</span>`;
  let keys = "";
  if (ground.layers.includes("places")) keys += FAMILIES.map((f) => dot(token(f.color), f.label)).join("");
  if (ground.layers.includes("addresses")) keys += dot(token("text-muted"), generator === "concentration" ? "Address (bigger: more at one spot)" : "Address, mostly homes");
  if (ground.layers.includes("intersections")) keys += dot(token("text-primary"), "Intersection");
  if (ground.linkColor) {
    const ramp = sequential();
    const cols = [ramp[1], ramp[2], ramp[4], ramp[5], ramp[6]];
    const labels = [`under ${LENGTH_BREAKS[0]} m`, ...LENGTH_BREAKS.slice(0, -1).map((b, i) => `${b}–${LENGTH_BREAKS[i + 1]} m`), `over ${LENGTH_BREAKS.at(-1)} m`];
    keys += `<div class="ground-sub">Street between corners</div>` + cols.map((c, i) => `<span class="key"><i class="kline" style="background:${c}"></i>${labels[i]}</span>`).join("");
  }
  return `<div class="ground-legend"><div class="ground-title">Zoom in to see what is counted</div>${keys}</div>`;
}

// A few classes spread over the full ramp, rather than its lightest steps.
function classColors(n) {
  const ramp = sequential();
  return Array.from({ length: n }, (_, i) => ramp[Math.round((i * (ramp.length - 1)) / (n - 1))]);
}

function colorExpr(id, cuts, palette) {
  const colors = palette || sequential();
  const expr = ["step", ["get", id], colors[0]];
  cuts.forEach((b, i) => expr.push(b, colors[i + 1]));
  return ["case", ["==", ["typeof", ["get", id]], "number"], expr, token("hex-empty")];
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
