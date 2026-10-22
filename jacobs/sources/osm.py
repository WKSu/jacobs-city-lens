"""OSM opening hours via Overpass (the only source for time-of-day mix).

Jacobs' first generator is not only about a mix of uses but about a mix of
*hours*: "the people who use a city street at different times of day must use
many of the same facilities" (ch. 8). A district where everything shuts at six
is not mixed, however many shops it has.

Overture Places carries no opening hours, so this is the one indicator that has
to come from OSM directly. Only objects that actually have an `opening_hours`
tag are requested, which keeps the download to a few thousand elements per city
instead of a national extract.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

import geopandas as gpd
import pandas as pd
import shapely

from jacobs.config import City
from jacobs.sources import bag

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
# Overpass rejects requests without a descriptive User-Agent.
USER_AGENT = "jacobs-city-lens/0.1 (+https://github.com/WKSu/jacobs-city-lens)"
TIMEOUT = 300
RETRIES = 3

# Tags that say what kind of place it is, in the order we prefer them.
KIND_TAGS = ["amenity", "shop", "office", "leisure", "tourism", "healthcare", "craft"]
PROPERTIES = ["osm_type", "osm_id", "name", "opening_hours", "kind", "kind_value"]


def query(bbox: tuple[float, float, float, float]) -> str:
    """Everything with an opening_hours tag in the bounding box."""
    south, west, north, east = bbox[1], bbox[0], bbox[3], bbox[2]
    return (
        "[out:json][timeout:240];\n"
        f'(nwr["opening_hours"]({south:.6f},{west:.6f},{north:.6f},{east:.6f}););\n'
        "out tags center;\n"
    )


def _post(url: str, body: str) -> dict:
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode({"data": body}).encode(),
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.load(response)


def _run(body: str) -> dict:
    last = None
    for attempt in range(RETRIES):
        for url in ENDPOINTS:
            try:
                return _post(url, body)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                last = f"{url}: {exc}"
        time.sleep(5 * (attempt + 1))
    raise SystemExit(f"[osm] Overpass unavailable: {last}")


def _kind(tags: dict) -> tuple[str | None, str | None]:
    for tag in KIND_TAGS:
        if tags.get(tag):
            return tag, tags[tag]
    return None, None


def elements_to_gdf(elements: list[dict]) -> gpd.GeoDataFrame:
    rows, geoms = [], []
    for element in elements:
        tags = element.get("tags") or {}
        centre = element.get("center") or element
        lat, lon = centre.get("lat"), centre.get("lon")
        if lat is None or lon is None or not tags.get("opening_hours"):
            continue
        kind, kind_value = _kind(tags)
        rows.append({
            "osm_type": element.get("type"), "osm_id": element.get("id"),
            "name": tags.get("name"), "opening_hours": tags["opening_hours"],
            "kind": kind, "kind_value": kind_value,
        })
        geoms.append(shapely.Point(lon, lat))
    if not rows:
        return gpd.GeoDataFrame(pd.DataFrame(columns=PROPERTIES), geometry=[], crs="EPSG:4326")
    return gpd.GeoDataFrame(rows, geometry=geoms, crs="EPSG:4326")


def fetch(city: City, force: bool = False) -> gpd.GeoDataFrame:
    """Download every object with opening hours in the city's bounding box."""
    out_path = city.raw_dir / "osm" / "opening_hours.parquet"
    if out_path.exists() and not force:
        gdf = gpd.read_parquet(out_path)
        print(f"[osm] opening hours: {len(gdf):,} cached objects", flush=True)
        return gdf

    bbox = tuple(bag.boundary(city).to_crs(4326).total_bounds)
    print(f"[osm] querying Overpass for {city.id}", flush=True)
    payload = _run(query(bbox))
    gdf = elements_to_gdf(payload.get("elements") or [])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(out_path)
    print(f"[osm] opening hours: wrote {len(gdf):,} objects to {out_path}", flush=True)
    return gdf


def load(city: City) -> gpd.GeoDataFrame:
    path = city.raw_dir / "osm" / "opening_hours.parquet"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: python -m jacobs fetch {city.id} --source osm")
    gdf = gpd.read_parquet(path)
    shape = bag.boundary(city).to_crs(4326).geometry.union_all()
    return gdf[gdf.intersects(shape)].to_crs(city.crs)
