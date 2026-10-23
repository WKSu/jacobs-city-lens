"""The four generators together: counts of conditions met per hexagon."""

import numpy as np
import pandas as pd

from jacobs.metrics import conditions


def hexes(n=10):
    v = np.arange(n, dtype=float)
    return pd.DataFrame({
        "land_ha": [10.0] * n,
        "bag_use_mix": v / n,
        "intersection_density": v * 20,
        "age_diversity": v / n,
        "dwellings_per_net_ha": v * 40,
    })


def test_threshold_is_the_city_percentile():
    h = hexes()
    limits = conditions.thresholds(h)
    assert np.isclose(limits["short_blocks"], h["intersection_density"].quantile(0.6))


def test_count_of_conditions_met():
    out, summary = conditions.compute(hexes())
    # values rise together, so the top 40% meet all four and the rest none
    assert list(out["conditions_met"]) == [0] * 6 + [4] * 4
    assert summary["counts"] == {"0": 6, "4": 4}


def test_one_strong_value_does_not_hide_a_missing_one():
    h = hexes()
    h.loc[9, "age_diversity"] = 0.0
    out, _ = conditions.compute(h)
    assert out.loc[9, "conditions_met"] == 3
    assert out.loc[9, "meets_aged_buildings"] == 0


def test_blank_when_a_value_is_missing_or_mostly_water():
    h = hexes()
    h.loc[0, "bag_use_mix"] = np.nan
    h.loc[1, "land_ha"] = 2.0
    out, _ = conditions.compute(h)
    assert np.isnan(out.loc[0, "conditions_met"])
    assert np.isnan(out.loc[1, "conditions_met"])
    assert np.isnan(out.loc[0, "meets_short_blocks"])


def test_mostly_water_hexagons_do_not_set_the_threshold():
    h = hexes()
    h.loc[[0, 1, 2], "land_ha"] = 1.0
    limits = conditions.thresholds(h)
    assert np.isclose(limits["short_blocks"], h.loc[3:, "intersection_density"].quantile(0.6))


def test_jacobs_density_uses_her_figure():
    out, summary = conditions.compute(hexes())
    # 40 per step: 280 and 320 and 360 reach 250
    assert list(out["jacobs_density"]) == [0] * 7 + [1] * 3
    assert summary["jacobs_density_hexagons"] == 3


def test_nothing_without_the_local_tier():
    out, summary = conditions.compute(hexes().drop(columns=["age_diversity"]))
    assert summary is None
    assert out.empty
