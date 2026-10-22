"""Neighbourhood parks (ch. 5).

"Generalized neighborhood parks ... are apt to be vacuums" unless the district
around them draws people for different purposes at different times. For each
park:

* area_ha            size of the park
* ring_use_mix       Shannon entropy (0–1) of the open places within RING_M
* ring_places_per_ha places per ha of land within RING_M
* ring_units_per_ha  addresses per ha of land within RING_M
* edge_built_share   share of the park's edge with a building within EDGE_M
                     outside it: an edge that people look onto
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from jacobs.metrics.mixed_use import GROUP_NAMES, MIN_PLACES, clean_places, entropy

PARK_SUBTYPES = {"park"}
PARK_CLASSES_EXCLUDED = {"dog_park", "playground", "pitch"}
MIN_HA = 0.5
RING_M = 400
EDGE_M = 40
EDGE_SAMPLE_M = 10


def detect(land_use: gpd.GeoDataFrame, land: shapely.Geometry, crs: str) -> gpd.GeoDataFrame:
    lu = land_use[land_use.geom_type.isin(["Polygon", "MultiPolygon"])]
    lu = lu[lu["subtype"].isin(PARK_SUBTYPES) & ~lu["class"].isin(PARK_CLASSES_EXCLUDED)].to_crs(crs)
    merged = shapely.union_all(shapely.make_valid(lu.geometry.values)).intersection(land)
    parks = gpd.GeoDataFrame(geometry=[merged], crs=crs).explode(index_parts=False)
    parks = parks[parks.geom_type == "Polygon"].reset_index(drop=True)
    parks["area_ha"] = parks.area / 10_000
    parks = parks[parks["area_ha"] >= MIN_HA].reset_index(drop=True)
    # name: the largest named land use feature inside the merged park
    named = lu[lu["name"].notna()]
    names = []
    for g in parks.geometry:
        hits = named[named.intersects(g)]
        names.append(hits.loc[hits.area.idxmax(), "name"] if len(hits) else None)
    parks["name"] = names
    return parks


def compute(parks: gpd.GeoDataFrame, places: gpd.GeoDataFrame, addresses: gpd.GeoDataFrame,
            buildings: gpd.GeoDataFrame, land: shapely.Geometry, crs: str) -> gpd.GeoDataFrame:
    parks = parks.copy()
    all_parks = shapely.union_all(parks.geometry.values)
    rings = parks.geometry.buffer(RING_M, quad_segs=4).difference(all_parks).intersection(land)
    ring_gdf = gpd.GeoDataFrame({"park": parks.index}, geometry=rings.values, crs=crs)
    ring_ha = ring_gdf.area / 10_000

    p = clean_places(places).to_crs(crs)
    p = gpd.GeoDataFrame({"group": p["group"].values}, geometry=p.geometry.representative_point().values, crs=crs)
    hits = gpd.sjoin(p, ring_gdf, predicate="within")
    counts = hits.groupby(["park", "group"]).size().unstack(fill_value=0)
    counts = counts.reindex(index=parks.index, columns=GROUP_NAMES, fill_value=0)
    n_places = counts.sum(axis=1)
    parks["ring_use_mix"] = entropy(counts).where(n_places >= MIN_PLACES)
    parks["ring_places_per_ha"] = n_places / ring_ha

    a = gpd.GeoDataFrame(geometry=addresses.to_crs(crs).geometry.values, crs=crs)
    n_units = gpd.sjoin(a, ring_gdf, predicate="within").groupby("park").size()
    parks["ring_units_per_ha"] = n_units.reindex(parks.index).fillna(0) / ring_ha

    b = buildings[~buildings["is_underground"].fillna(False).astype(bool)].to_crs(crs)
    b = b[~shapely.within(b.geometry.representative_point().values, all_parks)]  # pavilions don't count
    tree = shapely.STRtree(b.geometry.values)
    shares = []
    for g in parks.geometry:
        edge = g.exterior
        n = max(4, int(edge.length // EDGE_SAMPLE_M))
        pts = shapely.line_interpolate_point(edge, np.linspace(0, edge.length, n, endpoint=False))
        idx = tree.query_nearest(pts, max_distance=EDGE_M, all_matches=False)
        shares.append(len(np.unique(idx[0])) / n)
    parks["edge_built_share"] = shares
    return parks


def assign_areas(parks: gpd.GeoDataFrame, areas: gpd.GeoDataFrame) -> pd.Series:
    centres = gpd.GeoDataFrame(geometry=parks.geometry.representative_point(), crs=parks.crs)
    j = gpd.sjoin(centres, areas[["area", "geometry"]].to_crs(parks.crs), predicate="within", how="left")
    return j[~j.index.duplicated()]["area"].reindex(parks.index)
