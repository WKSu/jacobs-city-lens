"""Generators 1 and 4 from BAG use classes (local tier, Netherlands).

The Overture measure of mixed use counts *places* — shops, offices, cafes — and
so cannot see homes at all. Jacobs' first generator is about primary uses, and
dwellings are the primary use that puts people on the street in the evening, so
a mix measured without them misses her point. BAG records the legal use class
and the floor area of every unit in the country, homes included, which is the
closest any register comes to what she described.

Per hexagon:

* bag_use_mix           entropy of floor area across the BAG use classes
* floor_area_per_ha     total floor area per hectare of land
* fsi                   floor space index: floor area / land area
* osr                   open space ratio: unbuilt land per unit of floor area
* dwellings_per_ha      dwellings per hectare of land (gross)
* dwellings_per_net_ha  dwellings per hectare of land that is not road surface,
                        which is closer to the net density Jacobs quoted
* home_floor_share      share of floor area that is housing

`fsi` with `coverage` (GSI) from the global tier is the pair plotted in a
Spacemate diagram, after Berghauser Pont & Haupt, which separates the two
things Jacobs insisted were not the same: density, which she wanted, and
overcrowding, which she did not (ch. 11).

One caveat on the floor area: BAG records *usable* floor area per unit, not
gross external area, and it records nothing for a building with no units, such
as a warehouse or a station hall. So `fsi` here reads lower than an FSI built
from gross areas, and is a floor area per hexagon rather than per plot. It is
comparable between Dutch hexagons, not with published Spacemate figures.
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd

from jacobs.grid import assign_points
from jacobs.metrics.mixed_use import entropy
from jacobs.sources.bag import USE_CLASSES, split_uses

HOME = "woonfunctie"
MIN_FLOOR_AREA = 500.0  # m² in a hexagon before a use mix means anything
# Jacobs: about 100 dwellings per net acre is where city diversity starts.
JACOBS_NET_DWELLINGS_PER_HA = 100 / 0.404686


def floor_area_by_use(units: gpd.GeoDataFrame, resolution: int) -> pd.DataFrame:
    """Floor area per hexagon and use class.

    A unit may declare several use classes ("winkelfunctie,woonfunctie" is a
    shop with a home above it). BAG does not say how the floor area splits
    between them, so it is divided equally.
    """
    u = units.assign(h3=assign_points(units, resolution), uses=split_uses(units["gebruiksdoel"]))
    u = u[u["uses"].str.len() > 0]
    area = pd.to_numeric(u["oppervlakte"], errors="coerce").fillna(0).clip(lower=0)
    u = u.assign(share=area / u["uses"].str.len())
    exploded = u[["h3", "uses", "share"]].explode("uses")
    return (
        exploded.groupby(["h3", "uses"])["share"].sum().unstack(fill_value=0.0)
        .reindex(columns=USE_CLASSES, fill_value=0.0)
    )


def compute(grid: gpd.GeoDataFrame, units: gpd.GeoDataFrame, resolution: int,
            net_ha: pd.Series | None = None, coverage: pd.Series | None = None) -> pd.DataFrame:
    out = pd.DataFrame(index=grid["h3"])
    land_ha = grid.set_index("h3")["land_ha"]

    by_use = floor_area_by_use(units, resolution).reindex(index=out.index, fill_value=0.0)
    total = by_use.sum(axis=1)
    out["bag_floor_area"] = total
    out["bag_use_mix"] = entropy(by_use).where(total >= MIN_FLOOR_AREA)
    out["floor_area_per_ha"] = total / land_ha
    out["home_floor_share"] = (by_use[HOME] / total.replace(0, np.nan)).where(total >= MIN_FLOOR_AREA)

    fsi = total / (land_ha * 10_000)
    out["fsi"] = fsi.where(total >= MIN_FLOOR_AREA)
    if coverage is not None:
        gsi = coverage.reindex(out.index)
        out["osr"] = ((1 - gsi) / fsi.where(fsi > 0)).where(total >= MIN_FLOOR_AREA)
    else:
        out["osr"] = np.nan

    u = units.assign(h3=assign_points(units, resolution), uses=split_uses(units["gebruiksdoel"]))
    homes = u[u["uses"].map(lambda classes: HOME in classes)]
    out["dwellings"] = homes.groupby("h3").size().reindex(out.index).fillna(0)
    out["dwellings_per_ha"] = out["dwellings"] / land_ha
    if net_ha is not None:
        net = net_ha.reindex(out.index)
        out["dwellings_per_net_ha"] = out["dwellings"] / net.where(net > 0)
    return out
