"""Eyes on the street, border vacuums and parks on small synthetic layouts."""

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point, box

from jacobs.metrics import eyes, parks, vacuums

CRS = "EPSG:28992"


def street(length=100.0):
    return gpd.GeoDataFrame({"h3": ["a"], "length": [length]}, geometry=[LineString([(0, 0), (length, 0)])], crs=CRS)


def buildings(geoms):
    return gpd.GeoDataFrame({"is_underground": [False] * len(geoms)}, geometry=geoms, crs=CRS)


def places(points, category="shopping"):
    n = len(points)
    return gpd.GeoDataFrame({"category": [category] * n, "confidence": [0.9] * n, "operating_status": ["open"] * n},
                            geometry=points, crs=CRS)


def test_rays_cover_both_sides():
    r = eyes.rays(street())
    assert len(r) == 2 * (100 // eyes.SAMPLE_M)
    assert set(r["side"]) == {1, -1}
    assert np.allclose(r.length, eyes.RAY_M - 2)


def test_street_wall_and_grain():
    # ten 10 m wide houses along the whole north side, 8 m from the centre line; nothing on the south side
    row = [box(x, 8, x + 10, 18) for x in range(0, 100, 10)]
    lm = eyes.link_metrics(street(), buildings(row), places([Point(50, 12)]))
    assert np.isclose(lm["frontage_share"].iloc[0], 0.5)
    assert lm["buildings_per_100m"].iloc[0] == 10
    assert lm["places_per_100m"].iloc[0] == 1

    # one slab far back from the street does not count
    slab = eyes.link_metrics(street(), buildings([box(0, 40, 100, 60)]), places([]))
    assert slab["frontage_share"].iloc[0] == 0
    assert slab["buildings_per_100m"].iloc[0] == 0


def test_vacuum_decay_counts_by_band():
    vac = gpd.GeoDataFrame({"kind": ["park"], "area_ha": [4.0]}, geometry=[box(0, 0, 200, 200)], crs=CRS)
    land = box(-1000, -1000, 1200, 1200)
    # one place 25 m from the park edge, one 375 m away, one inside the park (ignored)
    p = places([Point(225, 100), Point(575, 100), Point(100, 100)])
    a = gpd.GeoDataFrame(geometry=[Point(225, 110)], crs=CRS)
    d = vacuums.decay(vac, p, a, land, CRS)
    park = d[d["kind"] == "park"].set_index("band_hi")
    assert park.loc[50, "places_per_ha"] > 0 and park.loc[400, "places_per_ha"] > 0
    assert park.loc[100, "places_per_ha"] == 0
    assert park.loc[50, "addresses_per_ha"] > 0
    city = d[d["kind"] == "city"]
    assert np.isclose(city["places_per_ha"].iloc[0], 2 / ((land.area - vac.area.sum()) / 10_000))


def test_park_surroundings():
    land = box(-1000, -1000, 1000, 1000)
    lu = gpd.GeoDataFrame({"subtype": ["park", "park"], "class": ["park", "playground"], "name": ["P", None]},
                          geometry=[box(0, 0, 100, 100), box(300, 300, 320, 320)], crs=CRS)
    found = parks.detect(lu, land, CRS)
    assert len(found) == 1 and found["name"].iloc[0] == "P"
    # buildings along the west edge only (which also reach 30 m along the north and south
    # edges), and a pavilion inside the park that must not count
    b = buildings([box(-30, 0, -10, 100), box(40, 40, 60, 60)])
    p = pd.concat([places([Point(-50, 50)] * 3, "shopping"), places([Point(150, 50)] * 3, "food_and_drink")])
    a = gpd.GeoDataFrame(geometry=[Point(-50, 50)] * 10, crs=CRS)
    out = parks.compute(found, p, a, b, land, CRS)
    assert np.isclose(out["edge_built_share"].iloc[0], 160 / 400, atol=0.03)
    assert out["ring_use_mix"].iloc[0] > 0.3
    assert out["ring_units_per_ha"].iloc[0] > 0
