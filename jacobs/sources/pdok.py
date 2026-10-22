"""Shared client for PDOK's OGC API Features services (the Dutch local tier).

BAG, BGT and the CBS 100 m grid are all published by PDOK behind the same
protocol, so one paging client serves all three. Pages are capped at 1000
features server-side and there is no `numberMatched`, so we follow the `next`
link until it stops coming.

Every fetch is cached as GeoParquet under data/raw/<city>/<service>/. These are
large downloads over a public API: re-running the pipeline must not re-download,
so a cached file is reused unless `force` is set.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely.geometry

PAGE_SIZE = 1000
MAX_PAGES = 20_000
RETRIES = 4
BACKOFF = 2.0
TIMEOUT = 120
USER_AGENT = "jacobs-city-lens/0.1 (+https://github.com/WKSu/jacobs-city-lens)"

# service name -> OGC API Features landing page
SERVICES = {
    "bag": "https://api.pdok.nl/kadaster/bag/ogc/v2",
    "bgt": "https://api.pdok.nl/lv/bgt/ogc/v1",
    "cbs_grid": "https://api.pdok.nl/cbs/vierkantstatistieken100m/ogc/v1",
    "cbs_areas": "https://api.pdok.nl/cbs/gebiedsindelingen/ogc/v1",
}


def _get_json(url: str) -> dict:
    last = None
    for attempt in range(RETRIES):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            if attempt < RETRIES - 1:
                time.sleep(BACKOFF * (attempt + 1))
    raise SystemExit(f"[pdok] giving up on {url}: {last}")


def _features_to_gdf(features: list[dict], properties: tuple[str, ...] | None) -> gpd.GeoDataFrame:
    if not features:
        columns = list(properties) if properties else []
        return gpd.GeoDataFrame(pd.DataFrame(columns=columns), geometry=[], crs="EPSG:4326")
    rows, geoms = [], []
    for f in features:
        props = f.get("properties") or {}
        rows.append({k: props.get(k) for k in properties} if properties else props)
        geoms.append(shapely.geometry.shape(f["geometry"]) if f.get("geometry") else None)
    return gpd.GeoDataFrame(rows, geometry=geoms, crs="EPSG:4326")


def fetch_items(
    service: str,
    collection: str,
    bbox: tuple[float, float, float, float],
    out_path: Path,
    properties: tuple[str, ...] | None = None,
    params: dict[str, str] | None = None,
    force: bool = False,
    label: str | None = None,
) -> gpd.GeoDataFrame:
    """Download every feature of `collection` intersecting `bbox` (WGS84), with caching.

    `params` adds extra query parameters, for the properties a service declares
    queryable (for example the CBS grid's `jaarcode`).
    """
    if out_path.exists() and not force:
        gdf = gpd.read_parquet(out_path)
        print(f"[pdok] {label or collection}: {len(gdf):,} cached features", flush=True)
        return gdf

    base = SERVICES[service]
    url = (
        f"{base}/collections/{collection}/items?f=json&limit={PAGE_SIZE}"
        f"&bbox={bbox[0]:.6f},{bbox[1]:.6f},{bbox[2]:.6f},{bbox[3]:.6f}"
    )
    for key, value in (params or {}).items():
        url += f"&{urllib.parse.quote(key)}={urllib.parse.quote(str(value))}"
    # Each page is turned into a frame straight away and the raw GeoJSON is let
    # go. Holding 400k feature dicts (BGT road surfaces for one city) instead
    # costs several gigabytes.
    frames: list[gpd.GeoDataFrame] = []
    count = 0
    for page in range(MAX_PAGES):
        payload = _get_json(url)
        batch = payload.get("features") or []
        if batch:
            frames.append(_features_to_gdf(batch, properties))
            count += len(batch)
        if page % 25 == 0 or not batch:
            print(f"[pdok] {label or collection}: {count:,} features", flush=True)
        nxt = next((lk["href"] for lk in payload.get("links", []) if lk.get("rel") == "next"), None)
        if not nxt or not batch:
            break
        url = nxt
    else:
        raise SystemExit(f"[pdok] {collection}: hit MAX_PAGES, refusing to page further")

    gdf = (
        pd.concat(frames, ignore_index=True)
        if frames else _features_to_gdf([], properties)
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(out_path)
    print(f"[pdok] {label or collection}: wrote {len(gdf):,} features to {out_path}", flush=True)
    return gdf


def city_bbox(boundary: gpd.GeoDataFrame) -> tuple[float, float, float, float]:
    xmin, ymin, xmax, ymax = boundary.to_crs(4326).total_bounds
    return (xmin, ymin, xmax, ymax)
