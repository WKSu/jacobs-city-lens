"""Generator 1: mixed primary uses.

Jacobs wanted people on the street "at different times and ... for different
purposes" (ch. 8). Until BAG use classes are in, the mix is measured on
Overture places grouped into a few kinds of reason to be somewhere:

* places_per_ha     open places per ha of land
* use_mix           Shannon entropy of the place groups, scaled to 0-1
                    (only for hexagons with at least MIN_PLACES places)
* places_per_100_units   activity relative to the number of addresses, a rough
                    stand-in for the balance between homes and everything else
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd

from jacobs.grid import assign_points

# Overture taxonomy (top level) -> the reason someone comes to the street.
GROUPS = {
    "services_and_business": "work",
    "shopping": "shopping",
    "food_and_drink": "food_drink",
    "lifestyle_services": "personal_services",
    "health_care": "civic",
    "education": "civic",
    "community_and_government": "civic",
    "arts_and_entertainment": "culture_leisure",
    "sports_and_recreation": "culture_leisure",
    "cultural_and_historic": "culture_leisure",
    "lodging": "culture_leisure",
}
GROUP_NAMES = sorted(set(GROUPS.values()))
MIN_PLACES = 5
MIN_CONFIDENCE = 0.5


def clean_places(places: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    p = places[places["operating_status"].fillna("open") != "permanently_closed"]
    p = p[p["confidence"].fillna(0) >= MIN_CONFIDENCE]
    p = p.assign(group=p["category"].map(GROUPS))
    return p[p["group"].notna()]


def entropy(counts: pd.DataFrame) -> pd.Series:
    totals = counts.sum(axis=1)
    shares = counts.div(totals.replace(0, np.nan), axis=0)
    h = -(shares * np.log(shares.where(shares > 0))).sum(axis=1, min_count=1)
    return h / np.log(counts.shape[1])


def compute(grid: gpd.GeoDataFrame, places: gpd.GeoDataFrame, units: pd.Series,
            resolution: int) -> pd.DataFrame:
    p = clean_places(places)
    p = p.assign(h3=assign_points(p, resolution))
    counts = p.groupby(["h3", "group"]).size().unstack(fill_value=0)
    counts = counts.reindex(index=grid["h3"], columns=GROUP_NAMES, fill_value=0)

    out = pd.DataFrame(index=grid["h3"])
    out["places"] = counts.sum(axis=1)
    out["places_per_ha"] = out["places"] / grid.set_index("h3")["land_ha"]
    out["use_mix"] = entropy(counts).where(out["places"] >= MIN_PLACES)
    out["places_per_100_units"] = (100 * out["places"] / units).where(units >= 20)
    for g in GROUP_NAMES:
        out[f"n_{g}"] = counts[g]
    return out
