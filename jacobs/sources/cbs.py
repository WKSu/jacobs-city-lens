"""CBS 100 m grid statistics (local tier, Netherlands).

Jacobs' aged-buildings argument is really about a *mix of rents*: "a mingling
of buildings that vary in age and condition" produces a mingling of what people
can afford to pay (ch. 10). The CBS 100 m grid is the only source that gives
dwelling value and tenure finely enough to see that mix inside a neighbourhood.

Served by PDOK's vierkantstatistieken100m OGC API. Two cautions:

* The collection holds every year from 1971 on, so `jaarcode` must be set.
  Only 2022-2024 carry the expanded indicators, and dwelling value and tenure
  stop after 2023, so 2023 is the default year.
* Values of -99997 (and other large negatives) mean CBS suppressed the cell for
  disclosure control, not zero. Household income is suppressed everywhere at
  this resolution, so it is not offered here.
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

from jacobs.config import City
from jacobs.sources import bag, pdok

DEFAULT_YEAR = 2023
SUPPRESSED = -9000  # any value at or below this is a suppression sentinel

# CBS field -> the name used downstream.
FIELDS = {
    "aantal_inwoners": "population",
    "aantal_woningen": "dwellings",
    "gemiddelde_woz_waarde_woning": "woz",
    "percentage_huurwoningen": "rental_pct",
    "percentage_koopwoningen": "owner_pct",
    "gemiddelde_huishoudensgrootte": "household_size",
    "aantal_huurwoningen_in_bezit_woningcorporaties": "social_rentals",
    "aantal_meergezins_woningen": "multi_family",
    "omgevingsadressendichtheid": "address_density",
}

# Dwelling-age bands, which cross-check BAG construction years from a different
# register (and are the only age source for cities without a BAG).
AGE_BANDS = {
    "aantal_woningen_bouwjaar_voor_1945": "pre_1945",
    "aantal_woningen_bouwjaar_45_tot_65": "1945_1964",
    "aantal_woningen_bouwjaar_65_tot_75": "1965_1974",
    "aantal_woningen_bouwjaar_75_tot_85": "1975_1984",
    "aantal_woningen_bouwjaar_85_tot_95": "1985_1994",
    "aantal_woningen_bouwjaar_95_tot_05": "1995_2004",
    "aantal_woningen_bouwjaar_05_tot_15": "2005_2014",
    "aantal_woningen_bouwjaar_15_en_later": "2015_later",
}

PROPERTIES = ("crs28992res100m", "jaarcode", *FIELDS, *AGE_BANDS)


def year_for(city: City) -> int:
    return int(city.source_config("cbs").get("year", DEFAULT_YEAR))


def fetch(city: City, force: bool = False) -> gpd.GeoDataFrame:
    """Download the CBS 100 m grid for the city's bounding box."""
    year = year_for(city)
    bbox = pdok.city_bbox(bag.boundary(city))
    return pdok.fetch_items(
        "cbs_grid", "vierkant100", bbox,
        city.raw_dir / "cbs" / f"vierkant100_{year}.parquet",
        properties=PROPERTIES, params={"jaarcode": year},
        force=force, label=f"cbs grid {year}",
    )


def load(city: City) -> gpd.GeoDataFrame:
    """The cached grid with suppressed values turned into NaN."""
    year = year_for(city)
    path = city.raw_dir / "cbs" / f"vierkant100_{year}.parquet"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: python -m jacobs fetch {city.id} --source cbs")

    gdf = gpd.read_parquet(path)
    gdf = gdf.rename(columns={**FIELDS, **AGE_BANDS})
    for col in list(FIELDS.values()) + list(AGE_BANDS.values()):
        values = pd.to_numeric(gdf[col], errors="coerce")
        gdf[col] = values.where(values > SUPPRESSED)

    shape = bag.boundary(city).to_crs(4326).geometry.union_all()
    gdf = gdf[gdf.geometry.notna() & gdf.intersects(shape)]
    return gdf.to_crs(city.crs)
