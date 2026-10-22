"""Write the small, web-ready files the site reads.

site/public/data/cities.json              index of exported cities
site/public/data/<city>/city.json         metadata, metric registry, area profiles, distributions
site/public/data/<city>/hex.geojson       hexagons with all metrics (WGS84)
site/public/data/<city>/areas.geojson     study area outlines
site/public/data/<city>/water.geojson     simplified water for the map background
site/public/data/<city>/figure_ground.json   buildings + streets around each study area (metres)
site/public/data/<city>/links.geojson     street links with eyes-on-the-street metrics
site/public/data/<city>/vacuums.geojson   border vacuums by type
site/public/data/<city>/parks.geojson     parks with the uses around them
site/public/data/<city>/clocks.json       open places by weekday and hour per study area
site/public/data/<city>/places.json       every counted place, by group (compact points)
site/public/data/<city>/addresses.json    every address location with its count (compact points)
site/public/data/<city>/intersections.json   street intersections (compact points)

The compact point files hold [dx, dy, ...] integers in 1e-5 degrees from an
origin, so a city's hundred thousand addresses stay a small download.
"""

from __future__ import annotations

import json
import math

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from jacobs.config import ROOT, City, list_cities
from jacobs.metrics.mixed_use import GROUP_NAMES, clean_places
from jacobs.metrics.registry import (
    GENERATORS,
    HEX_METRICS,
    LINK_METRIC_IDS,
    METRICS,
    PARK_METRIC_IDS,
)
from jacobs.metrics.vacuums import LABELS as VACUUM_LABELS
from jacobs.pipeline import load_raw

SITE_DATA = ROOT / "site" / "public" / "data"
FIGURE_GROUND_SIZE_M = 800
POINT_SCALE = 1e5  # compact point files: integer steps of 1e-5 degrees (about 1 m)


def _round(v, digits=4):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return round(float(v), digits)


def _write_geojson(gdf: gpd.GeoDataFrame, path, precision=5):
    gdf = gdf.to_crs(4326)
    gdf = gdf.set_geometry(shapely.set_precision(gdf.geometry.values, 10 ** -precision))
    path.write_text(gdf.to_json(drop_id=True, na="null"))


def percentile_of(values: pd.Series, x: float, direction: str) -> float | None:
    """Share of city hexagons this value beats, oriented so 100 = most Jacobsian."""
    v = values.dropna().to_numpy()
    if x is None or np.isnan(x) or not len(v):
        return None
    beats = (v < x).mean() + 0.5 * (v == x).mean()
    return round(100 * (beats if direction == "higher" else 1 - beats), 1)


def available_metrics(hexes: pd.DataFrame) -> list[dict]:
    """The hexagon metrics this city actually has.

    A city with no national register has no local-tier columns, and a hexagon
    metric that is blank everywhere says nothing, so neither is written to
    city.json rather than being published empty.
    """
    return [m for m in HEX_METRICS if m["id"] in hexes.columns and hexes[m["id"]].notna().any()]


def area_profiles(hexes: pd.DataFrame, areas: gpd.GeoDataFrame, metrics_list: list[dict]) -> list[dict]:
    profiles = []
    for _, a in areas.iterrows():
        sub = hexes[hexes["study_area"] == a["area"]]
        metrics = {}
        for m in metrics_list:
            med = sub[m["id"]].median()
            metrics[m["id"]] = {
                "median": _round(med),
                "percentile": percentile_of(hexes[m["id"]], med, m["direction"]),
            }
        profiles.append({"id": a["area"], "label": a["label"], "role": a["role"], "note": a["note"],
                         "hexagons": len(sub), "metrics": metrics})
    return profiles


def figure_ground(city: City, areas: gpd.GeoDataFrame) -> dict:
    buildings = load_raw(city, "buildings").to_crs(city.crs)
    buildings = buildings[~buildings["is_underground"].fillna(False).astype(bool)]
    links = gpd.read_parquet(city.processed_dir / "links.parquet").to_crs(city.crs)
    half = FIGURE_GROUND_SIZE_M / 2
    out = {}
    for _, a in areas.to_crs(city.crs).iterrows():
        c = a.geometry.representative_point() if not a.geometry.centroid.within(a.geometry) else a.geometry.centroid
        x0, y0 = c.x - half, c.y - half
        box = shapely.box(x0, y0, x0 + FIGURE_GROUND_SIZE_M, y0 + FIGURE_GROUND_SIZE_M)

        def local(geom, x0=x0, top=y0 + FIGURE_GROUND_SIZE_M):
            # metres from the top-left corner, y pointing down (SVG coordinates)
            return shapely.transform(geom, lambda xy: np.column_stack([xy[:, 0] - x0, top - xy[:, 1]]))

        b = buildings[buildings.intersects(box)].geometry.intersection(box)
        s = links[links.intersects(box)].geometry.intersection(box)
        out[a["area"]] = {
            "size_m": FIGURE_GROUND_SIZE_M,
            "buildings": [_svg_path(local(g).simplify(0.5)) for g in b if not g.is_empty],
            "streets": [_svg_path(local(g)) for g in s if not g.is_empty],
            "outline": _svg_path(local(a.geometry.intersection(box).boundary)),
        }
    return out


def _svg_path(geom) -> str:
    parts = []
    for g in getattr(geom, "geoms", [geom]):
        if g.geom_type == "Polygon":
            for ring in [g.exterior, *g.interiors]:
                parts.append(_ring(ring.coords, close=True))
        elif g.geom_type in ("LineString", "LinearRing"):
            parts.append(_ring(g.coords, close=False))
        elif hasattr(g, "geoms"):
            parts.append(_svg_path(g))
    return " ".join(p for p in parts if p)


def _ring(coords, close):
    pts = [f"{x:.1f} {y:.1f}" for x, y, *_ in coords]
    if len(pts) < 2:
        return ""
    return "M" + "L".join(pts) + ("Z" if close else "")


def day_clocks(city: City, hexes: pd.DataFrame) -> dict:
    """How many places are open in each hour of the week, per study area.

    Empty for cities with no opening-hours source, which the site reads as
    "no day clocks for this city" rather than as zero places open.
    """
    if "osm" not in city.sources:
        return {}
    from jacobs.grid import assign_points
    from jacobs.metrics.temporal_mix import area_clocks
    from jacobs.sources import osm

    places = osm.load(city)
    cells = assign_points(places, city.h3_resolution)
    areas = area_clocks(places, hexes, cells)

    # Only a tenth or so of places publish opening hours in OSM, and which ones
    # do is not even between districts: a shopping centre full of chains is
    # tagged far better than a street of independent shops. Each area therefore
    # carries the number of places known at all, so the chart can say what share
    # of them it is actually drawing.
    known = hexes.dropna(subset=["study_area"]).groupby("study_area")["places"].sum()
    for area, values in areas.items():
        values["mapped"] = int(known.get(area, 0))
    return {"days": ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"], "areas": areas}


def compact_points(gdf: gpd.GeoDataFrame, origin: tuple[float, float]) -> np.ndarray:
    """(n, 2) integer offsets from origin in 1e-5 degrees."""
    xy = gdf.to_crs(4326).geometry.get_coordinates().to_numpy()
    return np.round((xy - np.array(origin)) * POINT_SCALE).astype(int)


def point_layers(city: City, boundary: shapely.Geometry, origin: tuple[float, float]) -> dict[str, dict]:
    """The things each indicator counts, as points: places, addresses, intersections."""
    places = clean_places(load_raw(city, "places")).to_crs(city.crs)
    places = places[places.within(boundary)]
    places = places.assign(geometry=places.geometry.representative_point())
    group = places["group"].map({g: i for i, g in enumerate(GROUP_NAMES)}).to_numpy()
    xy = compact_points(places, origin)
    names = places["name"].fillna("").str.slice(0, 40).tolist()

    addresses = load_raw(city, "addresses").to_crs(city.crs)
    addresses = addresses[addresses.within(boundary)]
    axy = pd.DataFrame(compact_points(addresses, origin), columns=["x", "y"])
    counted = axy.groupby(["x", "y"]).size().reset_index(name="n")

    nodes = gpd.read_parquet(city.processed_dir / "nodes.parquet")
    nodes = nodes[(nodes["degree"] >= 3) & nodes.within(boundary)]
    nxy = compact_points(nodes, origin)

    return {
        "places": {"groups": GROUP_NAMES, "points": np.column_stack([xy, group]).ravel().tolist(), "names": names},
        "addresses": {"points": counted[["x", "y", "n"]].to_numpy().ravel().tolist()},
        "intersections": {"points": nxy.ravel().tolist()},
    }


def run(city: City) -> None:
    out = SITE_DATA / city.id
    out.mkdir(parents=True, exist_ok=True)
    hexes = gpd.read_parquet(city.processed_dir / "hex.parquet")
    areas = gpd.read_parquet(city.processed_dir / "areas.parquet")

    metrics_list = available_metrics(hexes)
    metric_ids = [m["id"] for m in metrics_list]
    # Street and park metrics live on their own layers, so they are always sent;
    # the hexagon metrics are only those this city has.
    published = {*metric_ids, *LINK_METRIC_IDS, *PARK_METRIC_IDS}
    site_metrics = [m for m in METRICS if m["id"] in published]
    # A generator or chapter with nothing to show would be an empty tab.
    measured = {m["generator"] for m in site_metrics}
    site_generators = [g for g in GENERATORS if g["id"] in measured]

    # Raw counts behind each hexagon's numbers, so the site can show how they are made.
    counts = ["units", "places", "intersections", *(f"n_{g}" for g in GROUP_NAMES)]
    local_counts = [c for c in ["dwellings", "cbs_population"] if c in hexes.columns]
    keep = ["h3", "land_ha", "study_area", *counts, *local_counts, *metric_ids]
    web = hexes[keep + ["geometry"]].copy()
    web[counts] = web[counts].fillna(0).astype(int)
    for col in metric_ids + ["land_ha"]:
        web[col] = web[col].round(4)
    _write_geojson(web, out / "hex.geojson")
    _write_geojson(areas[["area", "label", "role", "geometry"]], out / "areas.geojson")

    water = load_raw(city, "water")
    water = water[water.geom_type.isin(["Polygon", "MultiPolygon"])].to_crs(city.crs)
    boundary = load_raw(city, "boundary").to_crs(city.crs).geometry.union_all().buffer(500)
    water = gpd.GeoDataFrame(geometry=[water.geometry.make_valid().union_all().intersection(boundary).simplify(5)],
                             crs=city.crs)
    _write_geojson(water, out / "water.geojson")

    (out / "figure_ground.json").write_text(json.dumps(figure_ground(city, areas)))
    (out / "clocks.json").write_text(json.dumps(day_clocks(city, hexes)))

    links = gpd.read_parquet(city.processed_dir / "eyes_links.parquet")
    # length_m only between two intersections: Jacobs' block length (dead ends get none)
    links = links.assign(geometry=links.geometry.simplify(1),
                         length_m=links["length"].round(0).where(links["ends"] == "intersection-intersection"))
    for col in LINK_METRIC_IDS:
        links[col] = links[col].round(3)
    _write_geojson(links[[*LINK_METRIC_IDS, "length_m", "geometry"]], out / "links.geojson")

    vac = gpd.read_parquet(city.processed_dir / "vacuums.parquet")
    vac = vac.assign(geometry=vac.geometry.simplify(5), area_ha=vac["area_ha"].round(1))
    _write_geojson(vac[["kind", "area_ha", "geometry"]], out / "vacuums.geojson")
    decay = pd.read_parquet(city.processed_dir / "vacuum_decay.parquet")

    parks = gpd.read_parquet(city.processed_dir / "parks.parquet")
    parks = parks.assign(geometry=parks.geometry.simplify(2))
    for col in ["area_ha", "ring_places_per_ha", *PARK_METRIC_IDS]:
        parks[col] = parks[col].round(3)
    park_cols = ["name", "study_area", "area_ha", "ring_places_per_ha", *PARK_METRIC_IDS]
    _write_geojson(parks[[*park_cols, "geometry"]], out / "parks.geojson")

    bounds = hexes.to_crs(4326).total_bounds
    origin = (round(float(bounds[0]), 3), round(float(bounds[1]), 3))
    city_shape = load_raw(city, "boundary").to_crs(city.crs).geometry.union_all()
    for name, layer in point_layers(city, city_shape, origin).items():
        (out / f"{name}.json").write_text(json.dumps({"origin": origin, "scale": POINT_SCALE, **layer},
                                                     separators=(",", ":")))
    meta = {
        "id": city.id, "name": city.name, "country": city.country,
        "h3_resolution": city.h3_resolution,
        "sources": {"overture_release": city.source_config("overture").get("release")},
        "bounds": [_round(v, 5) for v in bounds],
        "generators": site_generators,
        "story": city.story,
        "place_groups": GROUP_NAMES,
        "metrics": site_metrics,
        "areas": area_profiles(hexes, areas, metrics_list),
        "city_median": {m: _round(hexes[m].median()) for m in metric_ids},
        "distributions": {
            **{m: [_round(v) for v in hexes[m].dropna().sort_values()] for m in metric_ids},
            **{m: [_round(v) for v in parks[m].dropna().sort_values()] for m in PARK_METRIC_IDS},
        },
        "link_distributions": {m: [_round(v, 3) for v in links[m].dropna().sort_values()[::5]]
                               for m in LINK_METRIC_IDS},
        "vacuums": {
            "labels": VACUUM_LABELS,
            "area_ha": {k: _round(v, 0) for k, v in vac.groupby("kind")["area_ha"].sum().items()},
            "decay": [{k: (_round(v) if isinstance(v, float) else v) for k, v in r.items()}
                      for r in decay.to_dict("records")],
        },
    }
    (out / "city.json").write_text(json.dumps(meta))

    index = []
    for cid in list_cities():
        p = SITE_DATA / cid / "city.json"
        if p.exists():
            m = json.loads(p.read_text())
            index.append({"id": cid, "name": m["name"], "country": m["country"]})
    (SITE_DATA / "cities.json").write_text(json.dumps(index, indent=1))
    print(f"[export] wrote {out}")
