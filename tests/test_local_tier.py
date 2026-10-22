"""Tests for the Dutch local tier: BAG, CBS, BGT and OSM opening hours."""

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import pytest
import shapely

from jacobs.grid import assign_points
from jacobs.metrics import aged_buildings, car_space, cbs_grid, temporal_mix, use_classes
from jacobs.metrics.opening_hours import week_mask
from jacobs.sources.bag import split_uses

CRS = "EPSG:28992"
RESOLUTION = 9
# A hexagon in central Rotterdam.
CELL = h3.latlng_to_cell(51.9225, 4.4792, RESOLUTION)


def cell_polygon(cell):
    return shapely.Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(cell)])


def make_grid(cells=(CELL,), land_ha=10.0):
    return gpd.GeoDataFrame(
        {"h3": list(cells), "land_ha": [land_ha] * len(cells)},
        geometry=[cell_polygon(c) for c in cells], crs=4326,
    ).to_crs(CRS)


def points_in(cell, n):
    lat, lng = h3.cell_to_latlng(cell)
    return [shapely.Point(lng, lat) for _ in range(n)]


# --- opening hours -----------------------------------------------------------

@pytest.mark.parametrize("value,hours", [
    ("24/7", 168),
    ("Mo-Fr 09:00-18:00", 45),
    ("Mo-Fr 09:00-18:00; Sa 10:00-17:00; Su off", 52),
    ("09:00-17:00", 56),
    ("Mo-Su 00:00-24:00", 168),
    ("Mo-Fr 09:00-12:00,13:00-17:00", 35),
    ("Mo-Sa 09:30-20:00, Su 14:00-20:00", 72),
    ("Sa,Su 10:00-16:00", 12),
    ("Mo,We,Fr 09:00-17:00", 24),
    ("Mo-Fr 08:00-17:00; PH off", 45),
    ("Mo-Su 07:00-22:00; \"opening hours of Albert Heijn\"", 105),
])
def test_opening_hours_parsed(value, hours):
    mask = week_mask(value)
    assert mask is not None
    assert mask.sum() == hours


@pytest.mark.parametrize("value", [
    "Apr-Oct Mo-Su 10:00-18:00", "sunrise-sunset", "Mo[1] 10:00-12:00",
    "\"by appointment\"", "Mo-Fr", "", None, "week 1-20 Mo 10:00-12:00",
])
def test_opening_hours_refused(value):
    assert week_mask(value) is None


def test_opening_hours_crosses_midnight():
    mask = week_mask("Tu-Sa 20:00-02:00")
    # Saturday night spills into the small hours of Sunday.
    assert mask[5, 20] and mask[6, 0] and mask[6, 1]
    assert not mask[6, 2] and not mask[0, 0]


def test_opening_hours_half_hours_cover_both():
    mask = week_mask("Mo 09:30-10:15")
    assert mask[0, 9] and mask[0, 10]
    assert not mask[0, 8] and not mask[0, 11]


def test_later_rule_replaces_earlier():
    mask = week_mask("Mo-Su 10:00-12:00; Su 14:00-16:00")
    assert mask[6, 14] and not mask[6, 10]
    assert mask[0, 10]


def test_weekday_range_wraps_around_the_week():
    mask = week_mask("Sa-Mo 10:00-16:00")
    assert mask[5, 10] and mask[6, 10] and mask[0, 10]
    assert not mask[1, 10]


# --- BAG use classes ---------------------------------------------------------

def test_split_uses_keeps_only_known_classes():
    values = pd.Series(["woonfunctie", "winkelfunctie,woonfunctie", "nonsense", None])
    assert list(split_uses(values)) == [
        ["woonfunctie"], ["winkelfunctie", "woonfunctie"], [], []]


def make_units(rows):
    """rows: (gebruiksdoel, oppervlakte, year, count)."""
    records, geoms = [], []
    for gebruiksdoel, area, year, n in rows:
        records.extend({"gebruiksdoel": gebruiksdoel, "oppervlakte": area, "year": year}
                       for _ in range(n))
        geoms.extend(points_in(CELL, n))
    return gpd.GeoDataFrame(records, geometry=geoms, crs=4326).to_crs(CRS)


def test_floor_area_splits_multi_use_units():
    by_use = use_classes.floor_area_by_use(
        make_units([("winkelfunctie,woonfunctie", 100, 1900, 1)]), RESOLUTION)
    assert by_use.loc[CELL, "winkelfunctie"] == 50
    assert by_use.loc[CELL, "woonfunctie"] == 50


def test_use_mix_zero_for_a_single_use():
    single = make_units([("woonfunctie", 1000, 1900, 1)])
    assert use_classes.compute(make_grid(), single, RESOLUTION).loc[CELL, "bag_use_mix"] == 0.0


def test_use_mix_rises_with_an_even_split():
    even = make_units([("woonfunctie", 500, 1900, 1), ("winkelfunctie", 500, 1900, 1)])
    single = make_units([("woonfunctie", 1000, 1900, 1)])
    grid = make_grid()
    mixed_value = use_classes.compute(grid, even, RESOLUTION).loc[CELL, "bag_use_mix"]
    assert mixed_value > use_classes.compute(grid, single, RESOLUTION).loc[CELL, "bag_use_mix"]


def test_dwellings_count_only_homes():
    units = make_units([("woonfunctie", 80, 1950, 20), ("kantoorfunctie", 200, 1950, 5)])
    out = use_classes.compute(make_grid(), units, RESOLUTION)
    assert out.loc[CELL, "dwellings"] == 20
    assert out.loc[CELL, "dwellings_per_ha"] == pytest.approx(2.0)
    assert out.loc[CELL, "home_floor_share"] == pytest.approx(1600 / 2600)


def test_fsi_and_osr():
    # 20 units of 500 m2 is 10,000 m2 of floor area on a 10 ha hexagon.
    units = make_units([("woonfunctie", 500, 1950, 20)])
    out = use_classes.compute(make_grid(), units, RESOLUTION, coverage=pd.Series({CELL: 0.25}))
    assert out.loc[CELL, "fsi"] == pytest.approx(0.1)
    assert out.loc[CELL, "osr"] == pytest.approx((1 - 0.25) / 0.1)


def test_osr_blank_without_coverage():
    units = make_units([("woonfunctie", 500, 1950, 20)])
    out = use_classes.compute(make_grid(), units, RESOLUTION)
    assert np.isnan(out.loc[CELL, "osr"])
    assert out.loc[CELL, "fsi"] == pytest.approx(0.1)


def test_net_density_excludes_road_surface():
    units = make_units([("woonfunctie", 80, 1950, 20)])
    out = use_classes.compute(make_grid(), units, RESOLUTION, net_ha=pd.Series({CELL: 5.0}))
    assert out.loc[CELL, "dwellings_per_net_ha"] == pytest.approx(4.0)


# --- aged buildings ----------------------------------------------------------

def make_cbs(values, cell=CELL):
    """CBS cells inside one hexagon: values is a list of (woz, rental_pct, dwellings)."""
    records = [{"woz": w, "rental_pct": r, "dwellings": d, "population": 10 * d,
                **{band: 0.0 for band in cbs_grid.BAND_NAMES}} for w, r, d in values]
    return gpd.GeoDataFrame(
        records, geometry=points_in(cell, len(values)), crs=4326,
        columns=["woz", "rental_pct", "dwellings", "population",
                 *cbs_grid.BAND_NAMES, "geometry"],
    ).to_crs(CRS)


def test_age_bands():
    years = pd.Series([1890.0, 1930.0, 1950.0, 1975.0, 2000.0, 2020.0])
    assert list(aged_buildings.band_of(years)) == [
        "pre_1900", "1900_1944", "1945_1969", "1970_1989", "1990_2009", "2010_later"]


def test_age_diversity_and_share_pre_1945():
    units = make_units([("woonfunctie", 80, 1900, 10), ("woonfunctie", 80, 1980, 10)])
    out = aged_buildings.compute(make_grid(), units, RESOLUTION)
    assert out.loc[CELL, "share_pre_1945"] == pytest.approx(0.5)
    assert out.loc[CELL, "age_diversity"] > 0.3
    assert out.loc[CELL, "median_year"] == 1940.0


def test_age_diversity_blank_when_too_few_units():
    units = make_units([("woonfunctie", 80, 1900, 3)])
    out = aged_buildings.compute(make_grid(), units, RESOLUTION)
    assert np.isnan(out.loc[CELL, "age_diversity"])


# --- CBS grid ----------------------------------------------------------------

def test_woz_spread_is_coefficient_of_variation():
    cbs = make_cbs([(200.0, 50.0, 10)] * 3 + [(400.0, 50.0, 10)] * 3)
    out = cbs_grid.compute(make_grid(), cbs, RESOLUTION)
    expected = np.std([200, 200, 200, 400, 400, 400]) / 300
    assert out.loc[CELL, "woz_spread"] == pytest.approx(expected)


def test_woz_spread_blank_with_too_few_cells():
    out = cbs_grid.compute(make_grid(), make_cbs([(200.0, 50.0, 10), (400.0, 50.0, 10)]), RESOLUTION)
    assert np.isnan(out.loc[CELL, "woz_spread"])


def test_rental_share_is_weighted_by_dwellings():
    out = cbs_grid.compute(make_grid(), make_cbs([(300.0, 100.0, 90), (300.0, 0.0, 10)]), RESOLUTION)
    assert out.loc[CELL, "rental_share"] == pytest.approx(0.9)


def test_population_density_gross_and_net():
    cbs = make_cbs([(300.0, 50.0, 10)] * 6)  # population is 10 x dwellings = 600
    out = cbs_grid.compute(make_grid(), cbs, RESOLUTION, net_ha=pd.Series({CELL: 5.0}))
    assert out.loc[CELL, "pop_per_ha"] == pytest.approx(60.0)
    assert out.loc[CELL, "pop_per_net_ha"] == pytest.approx(120.0)


def test_cbs_metrics_are_blank_without_data():
    out = cbs_grid.compute(make_grid(), make_cbs([]), RESOLUTION)
    assert np.isnan(out.loc[CELL, "pop_per_ha"])
    assert np.isnan(out.loc[CELL, "woz_spread"])


# --- car space ---------------------------------------------------------------

def make_wegdeel(groups, cell=CELL):
    """Equal 400 m² squares of road surface inside one hexagon, one per group given."""
    lat, lng = h3.cell_to_latlng(cell)
    centre = gpd.GeoSeries([shapely.Point(lng, lat)], crs=4326).to_crs(CRS).iloc[0]
    records, geoms = [], []
    for i, group in enumerate(groups):
        x = centre.x + i * 30
        records.append({"group": group})
        geoms.append(shapely.box(x, centre.y, x + 20, centre.y + 20))
    return gpd.GeoDataFrame(records, geometry=geoms, crs=CRS)


def test_car_space_share():
    out = car_space.compute(make_grid(), make_wegdeel(["car", "car", "car", "pedestrian"]), CRS)
    assert out.loc[CELL, "paved_m2"] == pytest.approx(1600, rel=1e-3)
    assert out.loc[CELL, "car_space_share"] == pytest.approx(0.75, rel=1e-3)
    assert out.loc[CELL, "pedestrian_share"] == pytest.approx(0.25, rel=1e-3)
    assert out.loc[CELL, "non_road_ha"] == pytest.approx(10 - 0.16, rel=1e-3)


def test_car_space_blank_when_barely_any_paving():
    out = car_space.compute(make_grid(), make_wegdeel(["car"]), CRS)
    assert np.isnan(out.loc[CELL, "car_space_share"])


# --- temporal mix ------------------------------------------------------------

def make_places(values, cell=CELL):
    return gpd.GeoDataFrame(
        {"opening_hours": values}, geometry=points_in(cell, len(values)), crs=4326
    ).to_crs(CRS)


def test_open_hours_share_needs_min_open_places():
    # Five places open the same 45 hours: 45 of the week's 168 hours have >= 3 open.
    out = temporal_mix.compute(make_grid(), make_places(["Mo-Fr 09:00-18:00"] * 5), RESOLUTION)
    assert out.loc[CELL, "open_hours_share"] == pytest.approx(45 / 168)
    assert out.loc[CELL, "evening_share"] == pytest.approx(0.0)


def test_too_few_open_at_once_counts_for_nothing():
    out = temporal_mix.compute(make_grid(), make_places(["Mo-Fr 09:00-18:00"] * 2
                                                        + ["24/7"] * 3), RESOLUTION)
    # The two office-hours places never reach MIN_OPEN on their own, but the
    # three always-open ones do, for the whole week.
    assert out.loc[CELL, "open_hours_share"] == pytest.approx(1.0)


def test_always_open_places_fill_the_week():
    out = temporal_mix.compute(make_grid(), make_places(["24/7"] * 5), RESOLUTION)
    assert out.loc[CELL, "open_hours_share"] == pytest.approx(1.0)
    assert out.loc[CELL, "night_share"] == pytest.approx(1.0)


def test_hours_coverage_reports_unparsed_share():
    places = make_places(["24/7"] * 5 + ["sunrise-sunset"] * 5)
    out = temporal_mix.compute(make_grid(), places, RESOLUTION)
    assert out.loc[CELL, "hours_coverage"] == pytest.approx(0.5)
    assert out.loc[CELL, "hours_places"] == 5


def test_blank_when_too_few_readable_places():
    out = temporal_mix.compute(make_grid(), make_places(["24/7"] * 2), RESOLUTION)
    assert np.isnan(out.loc[CELL, "open_hours_share"])


def test_area_clocks_count_places_and_hours():
    places = make_places(["24/7", "Mo-Fr 09:00-18:00", "sunrise-sunset"])
    hexes = pd.DataFrame({"h3": [CELL], "study_area": ["oude_noorden"]})
    cells = assign_points(places, RESOLUTION)
    clocks = temporal_mix.area_clocks(places, hexes, cells)
    area = clocks["oude_noorden"]
    # The unreadable one is left out of both the count and the grid.
    assert area["places"] == 2
    counts = np.array(area["counts"])
    assert counts.shape == (7, 24)
    assert counts[0, 10] == 2  # Monday mid-morning: both open
    assert counts[6, 10] == 1  # Sunday: only the 24/7 one
    assert counts[0, 3] == 1  # Monday small hours: only the 24/7 one


def test_area_clocks_skip_hexes_outside_a_study_area():
    places = make_places(["24/7"])
    hexes = pd.DataFrame({"h3": [CELL], "study_area": [None]})
    cells = assign_points(places, RESOLUTION)
    assert temporal_mix.area_clocks(places, hexes, cells) == {}
