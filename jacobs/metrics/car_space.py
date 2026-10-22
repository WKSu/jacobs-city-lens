"""Chapter 18: erosion of cities by automobiles.

Jacobs watched cars take city space a piece at a time — "a street widened here,
another convenient parking lot there" — until the places worth walking to were
gone. The BGT maps every paved surface in the Netherlands separately, so the
division of public space can simply be measured rather than estimated.

Per hexagon:

* car_space_share     carriageway and parking as a share of all paved public space
* car_space_per_ha    carriageway and parking area as a share of land
* pedestrian_share    footways and pedestrian areas as a share of paved space
* cycle_share         cycle paths as a share of paved space
* paved_share         all mapped road surface as a share of land
* non_road_ha         land that is not road surface, for net densities
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd

GROUPS = ["car", "pedestrian", "cycle", "transit", "other"]
MIN_PAVED_M2 = 1000.0  # below this a hexagon is mostly fields or water


def compute(grid: gpd.GeoDataFrame, wegdeel: gpd.GeoDataFrame, crs: str) -> pd.DataFrame:
    out = pd.DataFrame(index=grid["h3"])
    land_ha = grid.set_index("h3")["land_ha"]

    surfaces = wegdeel[["group", "geometry"]].to_crs(crs)
    surfaces = surfaces.set_geometry(surfaces.geometry.make_valid())
    pieces = gpd.overlay(surfaces, grid[["h3", "geometry"]], how="intersection", keep_geom_type=True)
    area_m2 = (
        pieces.assign(a=pieces.area).groupby(["h3", "group"])["a"].sum().unstack(fill_value=0.0)
        .reindex(index=out.index, columns=GROUPS, fill_value=0.0)
    )

    paved = area_m2.sum(axis=1)
    enough = paved >= MIN_PAVED_M2
    out["paved_m2"] = paved
    for group in GROUPS:
        out[f"{group}_m2"] = area_m2[group]

    out["car_space_share"] = (area_m2["car"] / paved.replace(0, np.nan)).where(enough)
    out["pedestrian_share"] = (area_m2["pedestrian"] / paved.replace(0, np.nan)).where(enough)
    out["cycle_share"] = (area_m2["cycle"] / paved.replace(0, np.nan)).where(enough)
    out["car_space_per_ha"] = (area_m2["car"] / 10_000 / land_ha).clip(upper=1)
    out["paved_share"] = (paved / 10_000 / land_ha).clip(upper=1)
    out["non_road_ha"] = (land_ha - paved / 10_000).clip(lower=0)
    return out
