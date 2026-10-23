"""Eyes on the street (ch. 2–3).

"There must be eyes upon the street, eyes belonging to those we might call the
natural proprietors of the street. The buildings on a street ... must be
oriented to the street." Measured per street link (intersection to
intersection), then summed to hexagons by street length:

* frontage_share       share of street length, both sides, with a building within
                       RAY_M of the centre line: how much of the street has a wall
* buildings_per_100m   distinct buildings fronting the street per 100 m: the grain
                       of doors and windows (a tower in a lawn counts once, a row
                       of narrow houses many times)
* doors_per_100m       distinct address locations within DOOR_M of the street per
                       100 m: a stand-in for front doors, since BAG puts a unit's
                       point inside its building and flats behind one entrance
                       often share a location
* places_per_100m      open places within PLACE_M of the street per 100 m: the
                       shops and cafés that give people a reason to watch
* eyes_score           mean of street wall, buildings and doors, each as a city
                       percentile (0–1). A summary for the street map only, not a
                       finding on its own.

Places are kept out of the score. They already measure mixed use, so counting
them here made the two tabs repeat each other, and the evidence on shops and
safety points the other way: studies of burglary find that doors and windows
facing the street go with less crime, while commercial uses often go with more
street crime except where density is high (Browning et al. 2010, Twinam 2017,
van Nes & López 2010).
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from jacobs.metrics.mixed_use import clean_places

SAMPLE_M = 10
# Half a typical street (~10 m) plus a front garden (~5-10 m).
RAY_M = 20
PLACE_M = 30
# address points sit inside the building, so reach a little past the street wall
DOOR_M = 30
MIN_LINK_M = 20


def rays(links: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Perpendicular rays every SAMPLE_M along each link, one per side."""
    rows_link, rows_side, starts, ends = [], [], [], []
    for i, geom in zip(links.index, links.geometry):
        if geom is None or geom.is_empty or geom.length < 1:
            continue
        line = geom if geom.geom_type == "LineString" else shapely.line_merge(geom)
        if line.geom_type != "LineString":
            line = max(line.geoms, key=lambda g: g.length)
        n = max(1, int(line.length // SAMPLE_M))
        d = (np.arange(n) + 0.5) * line.length / n
        p = shapely.line_interpolate_point(line, d)
        q = shapely.line_interpolate_point(line, np.clip(d + 1, 0, line.length))
        r = shapely.line_interpolate_point(line, np.clip(d - 1, 0, line.length))
        px, py = shapely.get_x(p), shapely.get_y(p)
        dx, dy = shapely.get_x(q) - shapely.get_x(r), shapely.get_y(q) - shapely.get_y(r)
        norm = np.hypot(dx, dy)
        norm[norm == 0] = 1
        nx, ny = -dy / norm, dx / norm
        for side in (1, -1):
            # start 2 m off the centre line so a building the street runs through is not "fronting"
            starts.append(np.column_stack([px + side * 2 * nx, py + side * 2 * ny]))
            ends.append(np.column_stack([px + side * RAY_M * nx, py + side * RAY_M * ny]))
            rows_link.append(np.full(n, i))
            rows_side.append(np.full(n, side))
    a, b = np.concatenate(starts), np.concatenate(ends)
    geoms = shapely.linestrings(np.stack([a, b], axis=1))
    return gpd.GeoDataFrame({"link": np.concatenate(rows_link), "side": np.concatenate(rows_side)},
                            geometry=geoms, crs=links.crs)


def percentile_rank(s: pd.Series) -> pd.Series:
    return s.rank(pct=True)


def near_counts(points: gpd.GeoDataFrame, links: gpd.GeoDataFrame, max_m: float) -> pd.Series:
    """Points per link, each point counted once on its nearest link within max_m."""
    near = gpd.sjoin_nearest(points[["geometry"]], links[["geometry"]], max_distance=max_m, how="inner")
    near = near[~near.index.duplicated()]
    return near.groupby("index_right").size().reindex(links.index).fillna(0)


def door_points(addresses: gpd.GeoDataFrame, crs) -> gpd.GeoDataFrame:
    """One point per distinct address location (to the metre)."""
    a = addresses.to_crs(crs)
    a = a.assign(geometry=a.geometry.representative_point())
    xy = np.column_stack([shapely.get_x(a.geometry.values), shapely.get_y(a.geometry.values)]).round()
    return a.loc[~pd.DataFrame(xy).duplicated().to_numpy(), ["geometry"]]


def link_metrics(links: gpd.GeoDataFrame, buildings: gpd.GeoDataFrame,
                 places: gpd.GeoDataFrame, addresses: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    links = links[links["length"] >= MIN_LINK_M].copy()
    r = rays(links)
    b = buildings[~buildings["is_underground"].fillna(False).astype(bool)].to_crs(links.crs).reset_index(drop=True)
    ray_idx, bld_idx = b.sindex.query(r.geometry.values, predicate="intersects")
    hit = pd.DataFrame({"link": r["link"].values[ray_idx], "ray": ray_idx, "building": bld_idx})

    rays_total = r.groupby("link").size()
    rays_hit = hit.drop_duplicates("ray").groupby("link").size()
    links["frontage_share"] = (rays_hit.reindex(links.index).fillna(0) / rays_total.reindex(links.index)).values
    n_buildings = hit.drop_duplicates(["link", "building"]).groupby("link").size()
    links["fronting_buildings"] = n_buildings.reindex(links.index).fillna(0)
    links["buildings_per_100m"] = 100 * links["fronting_buildings"] / links["length"]

    p = clean_places(places).to_crs(links.crs)
    p = p.assign(geometry=p.geometry.representative_point())
    links["places"] = near_counts(p, links, PLACE_M)
    links["places_per_100m"] = 100 * links["places"] / links["length"]
    links["doors"] = near_counts(door_points(addresses, links.crs), links, DOOR_M)
    links["doors_per_100m"] = 100 * links["doors"] / links["length"]

    links["eyes_score"] = pd.concat([
        percentile_rank(links["frontage_share"]),
        percentile_rank(links["buildings_per_100m"]),
        percentile_rank(links["doors_per_100m"]),
    ], axis=1).mean(axis=1)
    return links


def compute(grid: gpd.GeoDataFrame, links: gpd.GeoDataFrame, buildings: gpd.GeoDataFrame,
            places: gpd.GeoDataFrame, addresses: gpd.GeoDataFrame) -> tuple[pd.DataFrame, gpd.GeoDataFrame]:
    lm = link_metrics(links, buildings, places, addresses)
    w = lm.assign(
        front_m=lm["frontage_share"] * lm["length"],
        eyes_m=lm["eyes_score"] * lm["length"],
    ).groupby("h3")[["length", "front_m", "eyes_m", "fronting_buildings", "places", "doors"]].sum()
    w = w.reindex(grid["h3"])
    enough = w["length"] >= 100
    out = pd.DataFrame(index=grid["h3"])
    out["frontage_share"] = (w["front_m"] / w["length"]).where(enough)
    out["buildings_per_100m"] = (100 * w["fronting_buildings"] / w["length"]).where(enough)
    out["places_per_100m"] = (100 * w["places"] / w["length"]).where(enough)
    out["doors_per_100m"] = (100 * w["doors"] / w["length"]).where(enough)
    out["eyes_score"] = (w["eyes_m"] / w["length"]).where(enough)
    cols = ["h3", "length", "ends", "frontage_share", "buildings_per_100m", "places_per_100m",
            "doors_per_100m", "eyes_score", "geometry"]
    return out, lm[cols].reset_index(drop=True)
