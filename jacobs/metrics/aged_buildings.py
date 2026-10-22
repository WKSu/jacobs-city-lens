"""Generator 3: aged buildings.

"Districts must mingle buildings that vary in age and condition, including a
good proportion of old ones." (ch. 10) Jacobs' reason is economic: old
buildings are cheap buildings, and only a spread of rents lets bookshops,
studios and corner shops sit next to banks.

This module measures the mix of *ages* from BAG construction years. The mix of
*rents* that the age mix is supposed to produce is measured separately, from
the CBS grid, in metrics/cbs_grid.py.

Per hexagon:

* age_diversity     entropy of construction-year bands, weighted by units
* share_pre_1945    share of units in buildings finished before 1945
* median_year       median construction year of units
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd

from jacobs.grid import assign_points
from jacobs.metrics.mixed_use import entropy

# Bands chosen so that the Dutch post-war rebuilding, the 1970s expansion
# districts and recent redevelopment each land in their own class.
BANDS = [
    ("pre_1900", 0, 1900),
    ("1900_1944", 1900, 1945),
    ("1945_1969", 1945, 1970),
    ("1970_1989", 1970, 1990),
    ("1990_2009", 1990, 2010),
    ("2010_later", 2010, 9999),
]
BAND_NAMES = [name for name, _, _ in BANDS]

MIN_UNITS = 10  # fewer dated units than this and the age mix is noise


def band_of(years: pd.Series) -> pd.Series:
    out = pd.Series(pd.NA, index=years.index, dtype="object")
    for name, lo, hi in BANDS:
        out = out.mask(years.between(lo, hi - 1), name)
    return out


def compute(grid: gpd.GeoDataFrame, units: gpd.GeoDataFrame, resolution: int) -> pd.DataFrame:
    out = pd.DataFrame(index=grid["h3"])
    u = units.assign(h3=assign_points(units, resolution))
    u = u[u["year"].notna()]

    counts = (
        u.assign(band=band_of(u["year"]))
        .groupby(["h3", "band"]).size().unstack(fill_value=0)
        .reindex(index=out.index, columns=BAND_NAMES, fill_value=0)
    )
    dated = counts.sum(axis=1)
    out["dated_units"] = dated
    out["age_diversity"] = entropy(counts).where(dated >= MIN_UNITS)
    out["share_pre_1945"] = (
        (counts["pre_1900"] + counts["1900_1944"]) / dated.replace(0, np.nan)
    ).where(dated >= MIN_UNITS)
    out["median_year"] = u.groupby("h3")["year"].median().reindex(out.index).where(dated >= MIN_UNITS)
    for name in BAND_NAMES:
        out[f"units_{name}"] = counts[name]
    return out
