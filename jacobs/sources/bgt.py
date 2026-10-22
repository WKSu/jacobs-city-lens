"""BGT road surfaces: how public space is divided (local tier, Netherlands).

"The simple needs of automobiles are more easily understood and satisfied than
the complex needs of cities" (ch. 18). The BGT is a surface map of the whole
country at building-outline precision, so for each hexagon we can measure how
much of the paved public space is carriageway and parking, and how much is
sidewalk and cycle path.

Served by PDOK's BGT OGC API. Only parts at ground level
(`relatieve_hoogteligging` 0) count, so bridges and tunnels do not add a second
layer of surface on top of the street below them.
"""

from __future__ import annotations

import geopandas as gpd

from jacobs.config import City
from jacobs.sources import bag, pdok

PROPERTIES = ("lokaal_id", "functie", "fysiek_voorkomen", "relatieve_hoogteligging", "status")

# BGT `functie` -> who the surface is for. Cycle paths are kept apart from
# footways: in a Dutch city, counting them as "car space" would be wrong, and
# counting them as sidewalk would hide how much room bicycles actually get.
CAR = {
    "rijbaan autosnelweg", "rijbaan autoweg", "rijbaan regionale weg",
    "rijbaan lokale weg", "parkeervlak", "inrit",
}
PEDESTRIAN = {"voetpad", "voetpad op trap", "voetgangersgebied"}
CYCLE = {"fietspad"}
TRANSIT = {"OV-baan", "spoorbaan"}

FUNCTION_GROUPS = (
    {"group": "car", "functies": CAR},
    {"group": "pedestrian", "functies": PEDESTRIAN},
    {"group": "cycle", "functies": CYCLE},
    {"group": "transit", "functies": TRANSIT},
)


def group_of(functie: str | None) -> str:
    for spec in FUNCTION_GROUPS:
        if functie in spec["functies"]:
            return spec["group"]
    return "other"


def fetch(city: City, force: bool = False) -> gpd.GeoDataFrame:
    """Download BGT road surfaces for the city's bounding box."""
    bbox = pdok.city_bbox(bag.boundary(city))
    return pdok.fetch_items(
        "bgt", "wegdeel", bbox, city.raw_dir / "bgt" / "wegdeel.parquet",
        properties=PROPERTIES, force=force, label="bgt wegdeel",
    )


def load(city: City) -> gpd.GeoDataFrame:
    """Existing, ground-level road surfaces inside the boundary, with a `group` column."""
    path = city.raw_dir / "bgt" / "wegdeel.parquet"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: python -m jacobs fetch {city.id} --source bgt")

    gdf = gpd.read_parquet(path)
    gdf = gdf[gdf["status"] == "bestaand"]
    gdf = gdf[gdf["relatieve_hoogteligging"].fillna(0) == 0]
    shape = bag.boundary(city).to_crs(4326).geometry.union_all()
    gdf = gdf[gdf.geometry.notna() & gdf.intersects(shape)]
    gdf = gdf.assign(group=gdf["functie"].map(group_of)).to_crs(city.crs)
    return gdf[gdf.geometry.is_valid | gdf.geometry.make_valid().is_valid]
