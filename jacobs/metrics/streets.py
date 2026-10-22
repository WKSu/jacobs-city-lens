"""Generator 2: short blocks.

"Most blocks must be short; that is, streets and opportunities to turn corners
must be frequent." (ch. 9)

Jacobs meant streets that buildings face, so the main metrics use a *street*
network (roads and pedestrian streets). Footpaths through parks and green
space would make a modernist estate look finely cut, so they only enter the
secondary *paths* network. Per hexagon:

* intersection_density   street intersections (3+ way) per km² of land
* median_link_m          median street length between two intersections
* dead_end_share         dead ends / (dead ends + intersections)
* median_block_ha        median area of the blocks enclosed by streets
* path_intersection_density   the same count on the full walking network
"""

from __future__ import annotations

from collections import defaultdict

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.ops import polygonize, substring

from jacobs.grid import assign_points

# Overture road classes that form streets. Motorways and trunk roads are left
# out, as are separately mapped sidewalks and crossings (which would double
# count every street) and parking aisles / driveways.
STREET_CLASSES = {
    "primary", "secondary", "tertiary", "residential", "living_street",
    "unclassified", "pedestrian", "service",
}
PATH_CLASSES = STREET_CLASSES | {"footway", "steps", "path", "cycleway"}
EXCLUDED_SUBCLASSES = {"sidewalk", "crosswalk", "driveway", "parking_aisle", "cycle_crossing"}
# Blocks larger than this are parks, rail yards, port basins etc., not blocks.
MAX_BLOCK_HA = 25.0


def walkable_segments(segments: gpd.GeoDataFrame, classes: set[str] = STREET_CLASSES) -> gpd.GeoDataFrame:
    s = segments[(segments["subtype"] == "road") & segments["class"].isin(classes)]
    s = s[~s["subclass"].isin(EXCLUDED_SUBCLASSES)]
    # Service roads only count when they are alleys or otherwise named streets.
    service = s["class"] == "service"
    s = s[~service | (s["subclass"] == "alley") | s["name"].notna()]
    return s


def build_edges(segments: gpd.GeoDataFrame, crs: str) -> gpd.GeoDataFrame:
    """Split segments at their connectors: one edge per pair of consecutive connectors."""
    segs = segments.to_crs(crs)
    rows = []
    for geom, ids, ats in zip(segs.geometry, segs["connector_ids"], segs["connector_at"]):
        ids, ats = list(ids), list(ats)
        if len(ids) < 2 or geom is None or geom.is_empty:
            continue
        for (a, ta), (b, tb) in zip(zip(ids, ats), zip(ids[1:], ats[1:])):
            if a == b or tb <= ta:
                continue
            piece = substring(geom, ta, tb, normalized=True)
            if piece.length > 0:
                rows.append((a, b, piece.length, piece))
    return gpd.GeoDataFrame(rows, columns=["u", "v", "length", "geometry"], crs=crs)


def node_degrees(edges: gpd.GeoDataFrame) -> pd.Series:
    """Number of distinct neighbours per connector (parallel edges count once)."""
    pairs = pd.DataFrame({"a": edges["u"], "b": edges["v"]})
    both = pd.concat([pairs, pairs.rename(columns={"a": "b", "b": "a"})])
    return both.drop_duplicates().groupby("a").size()


def node_points(edges: gpd.GeoDataFrame) -> gpd.GeoSeries:
    starts = shapely.get_point(edges.geometry.values, 0)
    ends = shapely.get_point(edges.geometry.values, -1)
    pts = pd.concat([pd.Series(starts, index=edges["u"].values), pd.Series(ends, index=edges["v"].values)])
    pts = pts[~pts.index.duplicated()]
    return gpd.GeoSeries(pts, crs=edges.crs)


def links(edges: gpd.GeoDataFrame, degree: pd.Series) -> gpd.GeoDataFrame:
    """Merge chains of edges through degree-2 nodes into intersection-to-intersection links."""
    adjacency = defaultdict(list)
    for i, (u, v) in enumerate(zip(edges["u"], edges["v"])):
        adjacency[u].append(i)
        adjacency[v].append(i)
    us, vs, lengths, geoms = edges["u"].values, edges["v"].values, edges["length"].values, edges.geometry.values
    visited = np.zeros(len(edges), dtype=bool)
    rows = []
    for start in range(len(edges)):
        if visited[start]:
            continue
        visited[start] = True
        chain = [start]
        ends = []
        for node in (us[start], vs[start]):
            current = node
            prev_edge = start
            while degree.get(current, 0) == 2:
                nxt = [e for e in adjacency[current] if e != prev_edge and not visited[e]]
                if not nxt:
                    break
                e = nxt[0]
                visited[e] = True
                chain.append(e)
                current = vs[e] if us[e] == current else us[e]
                prev_edge = e
            ends.append(current)
        length = float(lengths[chain].sum())
        geom = shapely.line_merge(shapely.union_all(geoms[chain]))
        kinds = sorted("dead_end" if degree.get(n, 0) == 1 else "intersection" for n in ends)
        rows.append((ends[0], ends[1], length, "-".join(kinds), geom))
    return gpd.GeoDataFrame(rows, columns=["u", "v", "length", "ends", "geometry"], crs=edges.crs)


def blocks(edges: gpd.GeoDataFrame, land: shapely.Geometry) -> gpd.GeoDataFrame:
    polys = list(polygonize(shapely.union_all(edges.geometry.values)))
    gdf = gpd.GeoDataFrame(geometry=polys, crs=edges.crs)
    gdf["area_ha"] = gdf.area / 10_000
    gdf = gdf[(gdf["area_ha"] > 0.01) & (gdf["area_ha"] <= MAX_BLOCK_HA)]
    # Drop "blocks" that are mostly water (e.g. enclosed by bridges over a harbour).
    gdf = gdf[gdf.intersection(land).area / gdf.area > 0.5]
    return gdf.reset_index(drop=True)


def compute(grid: gpd.GeoDataFrame, segments: gpd.GeoDataFrame, land: shapely.Geometry,
            crs: str, resolution: int) -> tuple[pd.DataFrame, dict[str, gpd.GeoDataFrame]]:
    edges = build_edges(walkable_segments(segments), crs)
    degree = node_degrees(edges)
    nodes = node_points(edges)
    nodes = gpd.GeoDataFrame({"degree": degree.reindex(nodes.index).values}, geometry=nodes.values, crs=crs)
    nodes["h3"] = assign_points(nodes, resolution)

    link_gdf = links(edges, degree)
    link_gdf["h3"] = assign_points(
        gpd.GeoDataFrame(geometry=link_gdf.geometry.interpolate(0.5, normalized=True), crs=crs), resolution
    )
    block_gdf = blocks(edges, land)
    block_gdf["h3"] = assign_points(block_gdf, resolution)

    out = pd.DataFrame(index=grid["h3"])
    n_int = nodes[nodes["degree"] >= 3].groupby("h3").size()
    n_dead = nodes[nodes["degree"] == 1].groupby("h3").size()
    out["intersections"] = n_int.reindex(out.index).fillna(0)
    out["dead_ends"] = n_dead.reindex(out.index).fillna(0)
    land_km2 = grid.set_index("h3")["land_ha"] / 100
    out["intersection_density"] = out["intersections"] / land_km2
    nodes_total = out["intersections"] + out["dead_ends"]
    out["dead_end_share"] = (out["dead_ends"] / nodes_total).where(nodes_total > 0)
    through = link_gdf[link_gdf["ends"] == "intersection-intersection"]
    out["median_link_m"] = through.groupby("h3")["length"].median().reindex(out.index)
    out["median_block_ha"] = block_gdf.groupby("h3")["area_ha"].median().reindex(out.index)
    out["street_km"] = (link_gdf.groupby("h3")["length"].sum() / 1000).reindex(out.index).fillna(0)

    path_edges = build_edges(walkable_segments(segments, PATH_CLASSES), crs)
    path_degree = node_degrees(path_edges)
    path_nodes = node_points(path_edges)
    path_nodes = gpd.GeoDataFrame({"degree": path_degree.reindex(path_nodes.index).values},
                                  geometry=path_nodes.values, crs=crs)
    path_nodes["h3"] = assign_points(path_nodes, resolution)
    n_path = path_nodes[path_nodes["degree"] >= 3].groupby("h3").size()
    out["path_intersection_density"] = n_path.reindex(out.index).fillna(0) / land_km2
    return out, {"links": link_gdf, "blocks": block_gdf, "nodes": nodes}
