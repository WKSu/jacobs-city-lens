"""The four generators together (ch. 7).

"All four in combination are necessary to generate city diversity; the absence
of any one of the four frustrates a district's potential." Jacobs' own claim is
about the combination, so an average of the four would miss it: one strong
value would hide a missing one. Instead each hexagon gets a count of how many
conditions it meets.

A condition is met when the hexagon's value is at or above the city's
THRESHOLD_PCT percentile. The percentile is taken over the hexagons that are
mostly land (more than MIN_LAND_HA) and have all four values; any other hexagon
gets no count at all, so the count never mixes "not met" with "not known".
The thresholds are relative to the city because Jacobs gave a number only for
density, and for that one the hexagon also gets `jacobs_density`: whether it
reaches her own figure of about 100 dwellings per net acre.

Per hexagon:

* conditions_met    0–4, blank where a value is missing
* meets_<condition> 1 / 0 for each condition, blank likewise
* jacobs_density    1 / 0: dwellings_per_net_ha at or above Jacobs' figure

The site computes the same count from hex.geojson when this column is absent,
so the definition here and in the site must stay the same. It is computed at
export, from hex.parquet, so changing it needs no pipeline run.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# condition -> the metric that stands for it (all "higher is more Jacobsian")
CONDITIONS = {
    "mixed_uses": "bag_use_mix",
    "short_blocks": "intersection_density",
    "aged_buildings": "age_diversity",
    "concentration": "dwellings_per_net_ha",
}
THRESHOLD_PCT = 0.6
MIN_LAND_HA = 4.0
# Jacobs' 100 dwellings per net acre (247 per ha), rounded the way the site states it
JACOBS_DENSITY = 250.0


def thresholds(hexes: pd.DataFrame) -> dict[str, float] | None:
    """City threshold per condition, or None when the city lacks a metric."""
    if any(m not in hexes.columns for m in CONDITIONS.values()):
        return None
    cols = list(CONDITIONS.values())
    base = hexes[(hexes["land_ha"] > MIN_LAND_HA) & hexes[cols].notna().all(axis=1)]
    if base.empty:
        return None
    return {c: float(base[m].quantile(THRESHOLD_PCT)) for c, m in CONDITIONS.items()}


def compute(hexes: pd.DataFrame) -> tuple[pd.DataFrame, dict | None]:
    """Condition columns for every hexagon, and the thresholds used."""
    out = pd.DataFrame(index=hexes.index)
    limits = thresholds(hexes)
    if limits is None:
        return out, None

    cols = list(CONDITIONS.values())
    known = (hexes["land_ha"] > MIN_LAND_HA) & hexes[cols].notna().all(axis=1)
    for c, m in CONDITIONS.items():
        out[f"meets_{c}"] = (hexes[m] >= limits[c]).astype(float).where(known)
    out["conditions_met"] = out[[f"meets_{c}" for c in CONDITIONS]].sum(axis=1, min_count=4)
    dens = hexes["dwellings_per_net_ha"]
    out["jacobs_density"] = (dens >= JACOBS_DENSITY).astype(float).where(dens.notna())

    summary = {
        "threshold_percentile": THRESHOLD_PCT,
        "min_land_ha": MIN_LAND_HA,
        "conditions": [
            {"id": c, "metric": m, "threshold": round(limits[c], 4)}
            for c, m in CONDITIONS.items()
        ],
        "jacobs_density": JACOBS_DENSITY,
        "counts": {str(k): int(v) for k, v in
                   out["conditions_met"].dropna().astype(int).value_counts().sort_index().items()},
        "jacobs_density_hexagons": int(np.nansum(out["jacobs_density"])),
    }
    return out, summary
