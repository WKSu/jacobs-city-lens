"""Write the small, web-ready files the site reads.

site/public/data/cities.json              index of exported cities
site/public/data/<city>/city.json         metadata, metric registry, area profiles, distributions
site/public/data/<city>/hex.geojson       hexagons with all metrics (WGS84)
site/public/data/<city>/areas.geojson     study area outlines
site/public/data/<city>/water.geojson     simplified water for the map background
site/public/data/<city>/figure_ground.json   buildings + streets around each study area (metres)
"""

from __future__ import annotations

import json
import math

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from jacobs.config import ROOT, City, list_cities
from jacobs.metrics.registry import GENERATORS, METRIC_IDS, METRICS
from jacobs.pipeline import load_raw

SITE_DATA = ROOT / "site" / "public" / "data"
FIGURE_GROUND_SIZE_M = 800


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


def area_profiles(hexes: pd.DataFrame, areas: gpd.GeoDataFrame) -> list[dict]:
    profiles = []
    for _, a in areas.iterrows():
        sub = hexes[hexes["study_area"] == a["area"]]
        metrics = {}
        for m in METRICS:
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


def run(city: City) -> None:
    out = SITE_DATA / city.id
    out.mkdir(parents=True, exist_ok=True)
    hexes = gpd.read_parquet(city.processed_dir / "hex.parquet")
    areas = gpd.read_parquet(city.processed_dir / "areas.parquet")

    keep = ["h3", "land_ha", "study_area", "units", "places", *METRIC_IDS]
    web = hexes[keep + ["geometry"]].copy()
    for col in METRIC_IDS + ["land_ha"]:
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

    bounds = hexes.to_crs(4326).total_bounds
    meta = {
        "id": city.id, "name": city.name, "country": city.country,
        "h3_resolution": city.h3_resolution,
        "sources": {"overture_release": city.source_config("overture").get("release")},
        "bounds": [_round(v, 5) for v in bounds],
        "generators": GENERATORS,
        "metrics": METRICS,
        "areas": area_profiles(hexes, areas),
        "city_median": {m: _round(hexes[m].median()) for m in METRIC_IDS},
        "distributions": {m: [_round(v) for v in hexes[m].dropna().sort_values()] for m in METRIC_IDS},
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
