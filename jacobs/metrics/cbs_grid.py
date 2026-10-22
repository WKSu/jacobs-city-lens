"""Generators 3 and 4 from the CBS 100 m grid (local tier, Netherlands).

Two of Jacobs' conditions need numbers no map of buildings can give:

* **Concentration** (ch. 11) is about *people*, not units. She put the point
  where city diversity starts at about 100 dwellings per net acre, and was
  careful to separate density from overcrowding, which is people per room.
* **Aged buildings** (ch. 10) is an argument about rents, not architecture.
  "Old ideas can sometimes use new buildings. New ideas must use old
  buildings." What matters is that a district contains cheap space *and*
  expensive space at the same time, so the spread of dwelling value inside a
  neighbourhood is the measure, not its average.

Per hexagon:

* pop_per_ha        residents per hectare of land (gross)
* pop_per_net_ha    residents per hectare that is not road surface
* woz_spread        coefficient of variation of average dwelling value across
                    the CBS cells in this hexagon and its six neighbours
* rental_share      share of dwellings that are rented
* cbs_share_pre_1945  share of dwellings built before 1945, from CBS rather
                    than BAG, as an independent check
"""

from __future__ import annotations

import geopandas as gpd
import h3
import numpy as np
import pandas as pd

from jacobs.grid import assign_points
from jacobs.sources.cbs import AGE_BANDS

# Jacobs: about 100 dwellings per net acre is where city diversity starts.
JACOBS_NET_DWELLINGS_PER_HA = 100 / 0.404686
MIN_CELLS = 6  # CBS cells needed before a value spread means anything
PRE_1945 = "pre_1945"
BAND_NAMES = list(AGE_BANDS.values())


def compute(grid: gpd.GeoDataFrame, cbs: gpd.GeoDataFrame, resolution: int,
            net_ha: pd.Series | None = None) -> pd.DataFrame:
    out = pd.DataFrame(index=grid["h3"])
    land_ha = grid.set_index("h3")["land_ha"]
    columns = ["pop_per_ha", "pop_per_net_ha", "woz_spread", "rental_share", "cbs_share_pre_1945"]
    if cbs is None or cbs.empty:
        return out.assign(**{column: np.nan for column in columns})

    cells = cbs.assign(h3=assign_points(cbs, resolution))
    grouped = cells.groupby("h3")

    population = grouped["population"].sum().reindex(out.index)
    out["cbs_population"] = population
    out["pop_per_ha"] = population / land_ha
    if net_ha is not None:
        net = net_ha.reindex(out.index)
        out["pop_per_net_ha"] = population / net.where(net > 0)
    else:
        out["pop_per_net_ha"] = np.nan

    out["rental_share"] = _weighted_share(grouped, "rental_pct", "dwellings")
    out["cbs_share_pre_1945"] = _band_share(grouped).reindex(out.index)
    out["woz_spread"] = _woz_spread(out.index, cells, resolution)
    return out


def _weighted_share(grouped, column: str, weight: str) -> pd.Series:
    """A percentage column averaged over cells, weighted by dwellings, as a 0-1 share."""
    def mean(frame: pd.DataFrame) -> float:
        values, weights = frame[column], frame[weight]
        valid = values.notna() & weights.notna() & (weights > 0)
        if not valid.any():
            return np.nan
        return float(np.average(values[valid], weights=weights[valid]) / 100)

    return grouped.apply(mean, include_groups=False)


def _band_share(grouped) -> pd.Series:
    """Share of dwellings in the pre-1945 band, over the bands CBS did publish."""
    sums = grouped[BAND_NAMES].sum(min_count=1)
    total = sums.sum(axis=1, min_count=1)
    return sums[PRE_1945] / total.replace(0, np.nan)


def _woz_spread(index: pd.Index, cells: gpd.GeoDataFrame, resolution: int) -> pd.Series:
    """How mixed dwelling values are in and around each hexagon.

    A single hexagon holds only about ten CBS cells, too few for a stable
    spread, so each hexagon is measured together with its six neighbours.
    """
    by_hex = {cell: frame["woz"].dropna() for cell, frame in cells.groupby("h3")}
    spread = {}
    for cell in index:
        nearby = [by_hex[n] for n in h3.grid_disk(cell, 1) if n in by_hex]
        if not nearby:
            continue
        values = pd.concat(nearby)
        if len(values) >= MIN_CELLS and values.mean() > 0:
            spread[cell] = values.std(ddof=0) / values.mean()
    return pd.Series(spread, dtype=float).reindex(index)
