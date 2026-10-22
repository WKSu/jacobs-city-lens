"""Border vacuums (ch. 14).

"The root trouble with borders, as city neighbors, is that they are apt to form
dead ends for most people using city streets." Large single-use areas thin out
activity along their edges. Here:

1. Detect vacuums by type: rail, motorways, large parks, campuses and
   hospitals, industry and port, large water, and superblocks (areas over
   MIN_HA enclosed by streets).
2. For each type, count places and addresses in distance bands from its edges,
   leaving out land that is itself inside any vacuum. A real vacuum effect shows
   as density that rises with distance.

Per hexagon:

* vacuum_share     share of the hexagon's land inside a vacuum (water excluded)
* vacuum_dist_m    distance from the hexagon centre to the nearest vacuum edge
"""

from __future__ import annotations

from itertools import pairwise

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from jacobs.metrics.mixed_use import clean_places
from jacobs.metrics.streets import STREET_CLASSES, build_edges, walkable_segments

MIN_HA = 5.0
BANDS_M = list(range(0, 401, 50))
CORRIDOR_M = {"rail": 15, "motorway": 25}

# Overture land use (subtype, class) -> vacuum type. A class of None matches the whole subtype.
LAND_USE_TYPES = {
    ("transportation", "railway"): "rail",
    ("park", "park"): "park",
    ("cemetery", None): "park",
    ("golf", "golf_course"): "park",
    ("recreation", "recreation_ground"): "park",
    ("entertainment", None): "park",
    ("education", "university"): "campus",
    ("education", "college"): "campus",
    ("medical", "hospital"): "campus",
    ("military", None): "campus",
    ("recreation", "stadium"): "campus",
    ("developed", "industrial"): "industry_port",
    ("developed", "works"): "industry_port",
    ("developed", "port"): "industry_port",
    ("resource_extraction", None): "industry_port",
    ("landfill", None): "industry_port",
}
TYPES = ["rail", "motorway", "industry_port", "campus", "park", "water", "superblock"]
LABELS = {
    "rail": "Rail lines and yards", "motorway": "Motorways", "industry_port": "Industry and port",
    "campus": "Campuses, hospitals, stadiums", "park": "Large parks, cemeteries, zoos", "water": "Large water",
    "superblock": "Superblocks (> 5 ha between streets)",
}


def _polygons(geoms, crs) -> gpd.GeoSeries:
    merged = shapely.union_all(shapely.make_valid(np.asarray(geoms)))
    parts = gpd.GeoSeries([merged], crs=crs).explode(index_parts=False)
    return parts[parts.geom_type.isin(["Polygon", "MultiPolygon"])]


def detect(land_use: gpd.GeoDataFrame, segments: gpd.GeoDataFrame, water: gpd.GeoDataFrame,
           land: shapely.Geometry, crs: str) -> gpd.GeoDataFrame:
    lu = land_use[land_use.geom_type.isin(["Polygon", "MultiPolygon"])].to_crs(crs)
    kind = pd.Series(None, index=lu.index, dtype=object)
    for (subtype, cls), t in LAND_USE_TYPES.items():
        mask = lu["subtype"] == subtype
        if cls is not None:
            mask &= lu["class"] == cls
        kind = kind.where(~mask | kind.notna(), t)
    lu = lu.assign(kind=kind)

    rows = []
    for t in ["rail", "industry_port", "campus", "park"]:
        geoms = list(lu.loc[lu["kind"] == t].geometry)
        if t == "rail":
            r = segments[segments["subtype"] == "rail"].to_crs(crs)
            r = r[~r["class"].isin(["subway", "tram", "light_rail", "funicular", "monorail"])]
            geoms += list(r.geometry.buffer(CORRIDOR_M["rail"]))
        if geoms:
            rows += [(t, g) for g in _polygons(geoms, crs)]

    m = segments[(segments["subtype"] == "road") & segments["class"].isin(["motorway", "trunk"])].to_crs(crs)
    if len(m):
        rows += [("motorway", g) for g in _polygons(m.geometry.buffer(CORRIDOR_M["motorway"]), crs)]

    w = water[water.geom_type.isin(["Polygon", "MultiPolygon"])].to_crs(crs)
    if len(w):
        rows += [("water", g) for g in _polygons(w.geometry, crs)]

    v = gpd.GeoDataFrame(rows, columns=["kind", "geometry"], crs=crs)
    v["area_ha"] = v.area / 10_000
    corridor = v["kind"].isin(["rail", "motorway"])
    v = v[(v["area_ha"] >= MIN_HA) | (corridor & (v["area_ha"] >= 1))]

    # Superblocks: areas enclosed by streets, larger than MIN_HA, that are not
    # already explained by another vacuum (a park or a rail yard).
    edges = build_edges(walkable_segments(segments, STREET_CLASSES), crs)
    cells = gpd.GeoDataFrame(geometry=list(shapely.ops.polygonize(shapely.union_all(edges.geometry.values))),
                             crs=crs)
    cells = cells[cells.area >= MIN_HA * 10_000]
    if len(cells) and len(v):
        other = shapely.union_all(v.geometry.values)
        covered = cells.intersection(other).area / cells.area
        cells = cells[covered < 0.5]
    cells = cells[cells.intersection(land).area / cells.area > 0.5]
    sb = gpd.GeoDataFrame({"kind": "superblock", "area_ha": cells.area / 10_000}, geometry=cells.geometry, crs=crs)
    v = pd.concat([v, sb], ignore_index=True)
    return gpd.GeoDataFrame(v, geometry="geometry", crs=crs).reset_index(drop=True)


def decay(vacuums: gpd.GeoDataFrame, places: gpd.GeoDataFrame, addresses: gpd.GeoDataFrame,
          land: shapely.Geometry, crs: str) -> pd.DataFrame:
    """Places and addresses per ha of land in distance bands from each vacuum type's edges."""
    inside_any = shapely.union_all(vacuums.geometry.values)
    open_land = land.difference(inside_any)
    shapely.prepare(open_land)

    pts = {
        "places": clean_places(places).to_crs(crs).geometry.representative_point(),
        "addresses": addresses.to_crs(crs).geometry,
    }
    pts = {k: g[shapely.contains_xy(open_land, shapely.get_x(g.values), shapely.get_y(g.values))]
           for k, g in pts.items()}

    rows = []
    for t in TYPES:
        sub = vacuums[vacuums["kind"] == t]
        if sub.empty:
            continue
        shape = shapely.union_all(sub.geometry.values)
        tree = shapely.STRtree(list(sub.geometry.values))
        dists = {}
        for k, g in pts.items():
            _, d = tree.query_nearest(g.values, return_distance=True, all_matches=False)
            dists[k] = d
        prev = shape
        for lo, hi in pairwise(BANDS_M):
            outer = shape.buffer(hi, quad_segs=4)
            ring_ha = outer.difference(prev).intersection(open_land).area / 10_000
            prev = outer
            row = {"kind": t, "band_lo": lo, "band_hi": hi, "land_ha": round(ring_ha, 1)}
            for k, d in dists.items():
                n = int(((d > lo) & (d <= hi)).sum())
                row[f"{k}_per_ha"] = n / ring_ha if ring_ha > 1 else None
            rows.append(row)

    # City-wide reference: all open land.
    ha = open_land.area / 10_000
    for lo, hi in pairwise(BANDS_M):
        rows.append({"kind": "city", "band_lo": lo, "band_hi": hi, "land_ha": round(ha, 1),
                     **{f"{k}_per_ha": len(g) / ha for k, g in pts.items()}})
    return pd.DataFrame(rows)


def compute(grid: gpd.GeoDataFrame, vacuums: gpd.GeoDataFrame, land: shapely.Geometry) -> pd.DataFrame:
    out = pd.DataFrame(index=grid["h3"])
    shape = shapely.union_all(vacuums.geometry.values)
    # water is a vacuum for the distance measure, but the share only counts land
    on_land = shapely.union_all(vacuums.loc[vacuums["kind"] != "water"].geometry.values).intersection(land)
    parts = gpd.GeoDataFrame(geometry=[on_land], crs=vacuums.crs).explode(index_parts=False)
    parts = parts[parts.geom_type == "Polygon"]
    pieces = gpd.overlay(grid[["h3", "geometry"]], parts, how="intersection", keep_geom_type=True)
    inside_ha = (pieces.area / 10_000).groupby(pieces["h3"]).sum()
    land_ha = grid.set_index("h3")["land_ha"]
    out["vacuum_share"] = (inside_ha.reindex(out.index).fillna(0) / land_ha).clip(0, 1)
    centres = grid.geometry.centroid
    edge = shapely.boundary(shape)
    d = shapely.distance(centres.values, edge)
    d = np.where(shapely.contains_xy(shape, centres.x.values, centres.y.values), 0.0, d)
    out["vacuum_dist_m"] = d
    return out
