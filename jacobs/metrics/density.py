"""Generator 4: sufficient concentration.

Jacobs put the point where city diversity starts at roughly 100 dwellings per
net residential acre, about 250 per hectare (ch. 11). Hexagon densities here are
*gross* (all land in the cell, streets and parks included), so they read lower
than her net figures.

* units_per_ha      BAG addresses (all units, not only dwellings) per ha of land
* coverage          building footprint area / land area (GSI)
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

from jacobs.grid import assign_points

JACOBS_NET_DWELLINGS_PER_HA = 100 / 0.404686  # 100 per acre


def compute(grid: gpd.GeoDataFrame, addresses: gpd.GeoDataFrame, buildings: gpd.GeoDataFrame,
            crs: str, resolution: int) -> pd.DataFrame:
    out = pd.DataFrame(index=grid["h3"])
    land_ha = grid.set_index("h3")["land_ha"]

    addresses = addresses.copy()
    addresses["h3"] = assign_points(addresses, resolution)
    out["units"] = addresses.groupby("h3").size().reindex(out.index).fillna(0)
    out["units_per_ha"] = out["units"] / land_ha

    b = buildings[~buildings["is_underground"].fillna(False).astype(bool)].to_crs(crs)
    pieces = gpd.overlay(b[["geometry"]], grid[["h3", "geometry"]], how="intersection", keep_geom_type=True)
    footprint_ha = pieces.assign(a=pieces.area / 10_000).groupby("h3")["a"].sum()
    out["coverage"] = (footprint_ha.reindex(out.index).fillna(0) / land_ha).clip(upper=1)
    return out
