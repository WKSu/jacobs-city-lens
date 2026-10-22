"""BAG: the Dutch building and address register (local tier, Netherlands).

BAG is the best source for three of Jacobs' four generators, because it records
*every* unit's legal use class and floor area, and every building's year of
construction:

* verblijfsobject  one row per unit: `gebruiksdoel` (the legal use classes),
                   `oppervlakte` (m² of floor area), point geometry
* pand             one row per building: year of construction (`bouwjaar`),
                   footprint polygon

Units carry no construction year of their own, so each unit takes the year of
the building its point falls in.

Fetched from PDOK's BAG OGC API Features service into
data/raw/<city>/bag/*.parquet. Rotterdam is roughly 400k units, which the API
serves 1000 at a time, so the first run takes a while and is then cached.
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

from jacobs.config import City
from jacobs.sources import pdok

# Records BAG keeps for things that no longer exist, or do not exist yet, would
# distort both the use mix and the age mix. Filtering by exclusion rather than
# by an allow-list, so an unseen status variant never silently drops real data.
UNIT_STATUS_DROP = {
    "Verblijfsobject ingetrokken",
    "Niet gerealiseerd verblijfsobject",
}
BUILDING_STATUS_DROP = {
    "Pand ingetrokken",
    "Niet gerealiseerd pand",
    "Pand gesloopt",
    "Bouwvergunning verleend",
    "Bouw gestart",
}

UNIT_PROPERTIES = (
    "identificatie", "gebruiksdoel", "oppervlakte", "status",
    "woonplaats_naam", "postcode", "huisnummer", "hoofdadres_identificatie",
)
BUILDING_PROPERTIES = (
    "identificatie", "bouwjaar", "status", "aantal_verblijfsobjecten", "gebruiksdoel",
)

# The legal use classes, as the register spells them. A unit may declare several
# (for example "winkelfunctie,woonfunctie": a shop with a home above it).
USE_CLASSES = [
    "woonfunctie", "bijeenkomstfunctie", "celfunctie", "gezondheidszorgfunctie",
    "industriefunctie", "kantoorfunctie", "logiesfunctie", "onderwijsfunctie",
    "sportfunctie", "winkelfunctie", "overige gebruiksfunctie",
]

# BAG uses 1005 and similar for "very old, year unknown"; anything outside this
# range is a data error rather than a building age.
MIN_YEAR, MAX_YEAR = 1100, 2100


def split_uses(gebruiksdoel: pd.Series) -> pd.Series:
    """The comma-separated `gebruiksdoel` field as a list of use classes per row."""
    return gebruiksdoel.fillna("").str.split(",").map(
        lambda parts: [p.strip() for p in parts if p.strip() in USE_CLASSES]
    )


def fetch(city: City, force: bool = False) -> dict[str, gpd.GeoDataFrame]:
    """Download BAG units and buildings for the city's bounding box."""
    bbox = pdok.city_bbox(boundary(city))
    out_dir = city.raw_dir / "bag"
    units = pdok.fetch_items(
        "bag", "verblijfsobject", bbox, out_dir / "verblijfsobject.parquet",
        properties=UNIT_PROPERTIES, force=force, label="bag units",
    )
    buildings = pdok.fetch_items(
        "bag", "pand", bbox, out_dir / "pand.parquet",
        properties=BUILDING_PROPERTIES, force=force, label="bag buildings",
    )
    return {"units": units, "buildings": buildings}


def boundary(city: City) -> gpd.GeoDataFrame:
    path = city.raw_dir / "overture" / "boundary.parquet"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: python -m jacobs fetch {city.id}")
    return gpd.read_parquet(path)


def load(city: City) -> dict[str, gpd.GeoDataFrame]:
    """Cached BAG extracts, clipped to the boundary, filtered on status, units dated."""
    out_dir = city.raw_dir / "bag"
    missing = [n for n in ("verblijfsobject", "pand") if not (out_dir / f"{n}.parquet").exists()]
    if missing:
        raise SystemExit(f"Missing BAG {missing}. Run: python -m jacobs fetch {city.id} --source bag")

    shape = boundary(city).to_crs(4326).geometry.union_all()

    units = gpd.read_parquet(out_dir / "verblijfsobject.parquet")
    units = units[~units["status"].isin(UNIT_STATUS_DROP)]
    units = units[units.geometry.notna() & units.intersects(shape)].to_crs(city.crs)

    buildings = gpd.read_parquet(out_dir / "pand.parquet")
    buildings = buildings[~buildings["status"].isin(BUILDING_STATUS_DROP)]
    buildings = buildings[buildings.geometry.notna() & buildings.intersects(shape)].to_crs(city.crs)
    year = pd.to_numeric(buildings["bouwjaar"], errors="coerce")
    buildings["year"] = year.where(year.between(MIN_YEAR, MAX_YEAR))

    units = date_units(units, buildings)
    return {"units": units, "buildings": buildings}


def date_units(units: gpd.GeoDataFrame, buildings: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Give every unit the construction year of the building it sits in."""
    joined = gpd.sjoin(
        units, buildings[["year", "geometry"]], predicate="within", how="left",
    ).drop(columns="index_right")
    # A unit point can fall inside two overlapping footprints; keep the older one,
    # which is the building the unit most likely belongs to. Sorting puts missing
    # years last, so a real year always wins over a blank one.
    joined = joined.sort_values("year")
    joined = joined[~joined.index.duplicated(keep="first")]
    return joined.reindex(units.index)
