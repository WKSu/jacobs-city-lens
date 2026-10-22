"""Generator 1, the time dimension: when is anything open?

"The requisite for any of these streets is that a person must be able to use
them with reasonable safety at any hour." (ch. 2) Jacobs' first generator asks
for primary uses that "insure the presence of people who go outdoors on
different schedules". A district with a hundred offices and nothing else is
busy for eight hours and dead for the other sixteen, and the usual mixed-use
measures cannot tell it apart from a district with cafes and homes.

Per hexagon, from OSM opening hours (see metrics/opening_hours.py):

* open_hours_share    share of the week's 168 hours when at least MIN_OPEN
                      places are open
* evening_share       the same for 18:00-24:00, when offices are shut and a
                      street either has life or does not
* night_share         the same for 00:00-06:00
* hours_coverage      share of the hexagon's places whose opening hours could
                      be parsed, so the reader can judge the rest
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd

from jacobs.grid import assign_points
from jacobs.metrics.opening_hours import HOURS, week_mask

MIN_OPEN = 3  # places open before an hour counts as "something is open"
MIN_PLACES = 5  # places with readable hours before a share is reported
EVENING = range(18, 24)
NIGHT = range(6)


def masks_for(places: gpd.GeoDataFrame) -> tuple[np.ndarray, pd.Index]:
    """A (n, 7, 24) array of open hours, and the index of the places it covers."""
    parsed, index = [], []
    for idx, value in places["opening_hours"].items():
        mask = week_mask(value)
        if mask is not None:
            parsed.append(mask)
            index.append(idx)
    if not parsed:
        return np.zeros((0, 7, HOURS), dtype=bool), pd.Index([])
    return np.stack(parsed), pd.Index(index)


def hex_counts(places: gpd.GeoDataFrame, cells: pd.Series,
               order: pd.Index) -> tuple[np.ndarray, pd.Series]:
    """For each hexagon in `order`, how many places are open in each hour of the week."""
    masks, index = masks_for(places)
    position = {h: i for i, h in enumerate(order)}
    counts = np.zeros((len(order), 7, HOURS), dtype=np.int32)
    readable = pd.Series(0, index=order, dtype=int)
    for offset, idx in enumerate(index):
        cell = cells.get(idx)
        row = position.get(cell)
        if row is None:
            continue
        counts[row] += masks[offset]
        readable.iloc[row] += 1
    return counts, readable


def compute(grid: gpd.GeoDataFrame, places: gpd.GeoDataFrame, resolution: int) -> pd.DataFrame:
    out = pd.DataFrame(index=grid["h3"])
    cells = assign_points(places, resolution)
    counts, readable = hex_counts(places, cells, out.index)

    total = pd.Series(cells.value_counts()).reindex(out.index).fillna(0)
    out["hours_places"] = readable
    out["hours_coverage"] = (readable / total.replace(0, np.nan)).where(total > 0)

    open_now = counts >= MIN_OPEN
    enough = readable >= MIN_PLACES
    out["open_hours_share"] = pd.Series(open_now.mean(axis=(1, 2)), index=out.index).where(enough)
    out["evening_share"] = pd.Series(
        open_now[:, :, list(EVENING)].mean(axis=(1, 2)), index=out.index).where(enough)
    out["night_share"] = pd.Series(
        open_now[:, :, list(NIGHT)].mean(axis=(1, 2)), index=out.index).where(enough)
    return out


def area_clocks(places: gpd.GeoDataFrame, hexes: pd.DataFrame, cells: pd.Series) -> dict[str, list]:
    """Open-place counts by weekday and hour for each study area, for the day clocks."""
    area_of = hexes.set_index("h3")["study_area"]
    masks, index = masks_for(places)
    clocks: dict[str, np.ndarray] = {}
    for offset, idx in enumerate(index):
        area = area_of.get(cells.get(idx))
        if not isinstance(area, str):
            continue
        clocks.setdefault(area, np.zeros((7, HOURS), dtype=np.int32))
        clocks[area] += masks[offset]
    return {area: counts.tolist() for area, counts in clocks.items()}
