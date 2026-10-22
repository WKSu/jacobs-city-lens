"""Overture Maps: the global data tier, available for every city.

Reads GeoParquet straight from Overture's public S3 bucket with pyarrow,
filtering on the per-row bbox column so only row groups near the city are
downloaded. Each layer is flattened to a few plain columns and written to
data/raw/<city>/overture/<layer>.parquet.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass

import geopandas as gpd
import pandas as pd
import pyarrow.compute as pc
import pyarrow.dataset as ds
import shapely
from pyarrow import fs

from jacobs.config import City

BUCKET = "overturemaps-us-west-2/release"


def _primary_name(names):
    return names.get("primary") if isinstance(names, dict) else None


def _first_source(sources):
    return sources[0].get("dataset") if sources is not None and len(sources) else None


def _taxonomy_top(tax):
    if not isinstance(tax, dict) or tax.get("hierarchy") is None or not len(tax["hierarchy"]):
        return None
    return tax["hierarchy"][0]


@dataclass(frozen=True)
class Layer:
    theme: str
    type: str
    columns: tuple[str, ...]
    # Derived columns computed from the raw (nested) Overture columns.
    derive: dict[str, Callable[[pd.DataFrame], pd.Series]]
    keep: tuple[str, ...]


LAYERS: dict[str, Layer] = {
    "divisions": Layer(
        "divisions", "division_area",
        ("id", "subtype", "class", "names", "division_id", "country"),
        {"name": lambda df: df["names"].map(_primary_name)},
        ("id", "subtype", "class", "name", "division_id"),
    ),
    "buildings": Layer(
        "buildings", "building",
        ("id", "subtype", "class", "height", "num_floors", "is_underground", "sources"),
        {"source": lambda df: df["sources"].map(_first_source)},
        ("id", "subtype", "class", "height", "num_floors", "is_underground", "source"),
    ),
    "places": Layer(
        "places", "place",
        ("id", "names", "basic_category", "taxonomy", "confidence", "operating_status"),
        {
            "name": lambda df: df["names"].map(_primary_name),
            "category": lambda df: df["taxonomy"].map(_taxonomy_top),
        },
        ("id", "name", "basic_category", "category", "confidence", "operating_status"),
    ),
    "segments": Layer(
        "transportation", "segment",
        ("id", "names", "subtype", "class", "subclass", "connectors"),
        {
            "name": lambda df: df["names"].map(_primary_name),
            "connector_ids": lambda df: df["connectors"].map(
                lambda cs: [c["connector_id"] for c in cs] if cs is not None else []
            ),
            "connector_at": lambda df: df["connectors"].map(
                lambda cs: [float(c["at"]) for c in cs] if cs is not None else []
            ),
        },
        ("id", "name", "subtype", "class", "subclass", "connector_ids", "connector_at"),
    ),
    "addresses": Layer(
        "addresses", "address",
        ("id", "street", "number", "unit", "postcode", "sources"),
        {
            "source": lambda df: df["sources"].map(_first_source),
            "record_id": lambda df: df["sources"].map(
                lambda s: s[0].get("record_id") if s is not None and len(s) else None
            ),
        },
        ("id", "street", "number", "unit", "postcode", "source", "record_id"),
    ),
    "land_use": Layer(
        "base", "land_use", ("id", "subtype", "class", "names"),
        {"name": lambda df: df["names"].map(_primary_name)},
        ("id", "subtype", "class", "name"),
    ),
    "water": Layer(
        "base", "water", ("id", "subtype", "class"), {}, ("id", "subtype", "class"),
    ),
}


def _filesystem() -> fs.S3FileSystem:
    kwargs = {"anonymous": True, "region": "us-west-2"}
    if proxy := os.environ.get("HTTPS_PROXY"):
        kwargs["proxy_options"] = proxy
    if ca := os.environ.get("AWS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE"):
        kwargs["tls_ca_file_path"] = ca
    return fs.S3FileSystem(**kwargs)


def _bbox_filter(bounds: tuple[float, float, float, float]):
    xmin, ymin, xmax, ymax = bounds
    return (
        (pc.field("bbox", "xmax") >= xmin)
        & (pc.field("bbox", "xmin") <= xmax)
        & (pc.field("bbox", "ymax") >= ymin)
        & (pc.field("bbox", "ymin") <= ymax)
    )


def read_layer(release: str, layer: Layer, filter) -> gpd.GeoDataFrame:
    path = f"{BUCKET}/{release}/theme={layer.theme}/type={layer.type}/"
    dataset = ds.dataset(path, filesystem=_filesystem(), format="parquet")
    table = dataset.to_table(columns=[*layer.columns, "geometry"], filter=filter)
    df = table.to_pandas()
    for col, fn in layer.derive.items():
        df[col] = fn(df) if len(df) else pd.Series(dtype=object)
    geometry = shapely.from_wkb(df["geometry"].to_numpy())
    return gpd.GeoDataFrame(df[list(layer.keep)], geometry=geometry, crs="EPSG:4326")


def fetch_boundary(city: City) -> gpd.GeoDataFrame:
    release = city.source_config("overture")["release"]
    area_id = city.boundary["overture_division_area"]
    gdf = read_layer(release, LAYERS["divisions"], pc.field("id") == area_id)
    if gdf.empty:
        raise SystemExit(f"Overture division area {area_id} not found in release {release}")
    return gdf


def fetch(city: City, layers: list[str] | None = None) -> None:
    release = city.source_config("overture")["release"]
    out_dir = city.raw_dir / "overture"
    out_dir.mkdir(parents=True, exist_ok=True)

    boundary = fetch_boundary(city)
    boundary.to_parquet(out_dir / "boundary.parquet")
    shape = boundary.geometry.iloc[0]
    bbox_filter = _bbox_filter(shape.bounds)

    for name in layers or list(LAYERS):
        layer = LAYERS[name]
        print(f"[overture] {city.id}: fetching {name} ({layer.theme}/{layer.type})", flush=True)
        filt = bbox_filter
        if name == "divisions":
            filt = filt & (pc.field("country") == city.country)
        gdf = read_layer(release, layer, filt)
        gdf = gdf[gdf.intersects(shape)]
        gdf.to_parquet(out_dir / f"{name}.parquet")
        print(f"[overture] {city.id}: {name}: {len(gdf):,} features", flush=True)
