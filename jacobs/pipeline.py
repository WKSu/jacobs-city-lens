"""Compute every metric for a city on its H3 grid.

Inputs:  data/raw/<city>/overture/*.parquet
Outputs: data/processed/<city>/hex.parquet      one row per hexagon, all metrics
         data/processed/<city>/areas.parquet    study area polygons
         data/processed/<city>/links.parquet    street links (for maps)
         data/processed/<city>/blocks.parquet   street blocks (for maps)
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

from jacobs.config import City
from jacobs.grid import build_grid
from jacobs.metrics import density, mixed_use, streets


def load_raw(city: City, layer: str) -> gpd.GeoDataFrame:
    path = city.raw_dir / "overture" / f"{layer}.parquet"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: python -m jacobs fetch {city.id}")
    return gpd.read_parquet(path)


def study_areas(city: City, divisions: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    rows = []
    for key, spec in city.study_areas.items():
        match = spec["match"]
        hit = divisions[(divisions["subtype"] == match["subtype"]) & (divisions["name"] == match["name"])]
        if hit.empty:
            print(f"[pipeline] warning: study area '{key}' matched nothing ({match})")
            continue
        rows.append({
            "area": key, "label": spec.get("label", key), "role": spec["role"],
            "note": spec.get("note", ""), "geometry": hit.geometry.union_all(),
        })
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=divisions.crs)


def run(city: City) -> gpd.GeoDataFrame:
    boundary = load_raw(city, "boundary")
    water = load_raw(city, "water")
    water = water[water.geom_type.isin(["Polygon", "MultiPolygon"])]
    grid = build_grid(city, boundary, water)
    land = grid.geometry.union_all()
    print(f"[pipeline] {city.id}: {len(grid):,} hexagons", flush=True)

    street_metrics, street_layers = streets.compute(
        grid, load_raw(city, "segments"), land, city.crs, city.h3_resolution
    )
    print("[pipeline] streets done", flush=True)
    density_metrics = density.compute(
        grid, load_raw(city, "addresses"), load_raw(city, "buildings"), city.crs, city.h3_resolution
    )
    print("[pipeline] density done", flush=True)
    mix_metrics = mixed_use.compute(grid, load_raw(city, "places"), density_metrics["units"], city.h3_resolution)
    print("[pipeline] mixed use done", flush=True)

    hexes = grid.set_index("h3").join([street_metrics, density_metrics, mix_metrics]).reset_index()

    areas = study_areas(city, load_raw(city, "divisions")).to_crs(city.crs)
    centroids = gpd.GeoDataFrame({"h3": hexes["h3"]}, geometry=hexes.geometry.centroid, crs=city.crs)
    joined = gpd.sjoin(centroids, areas[["area", "geometry"]], predicate="within", how="left")
    hexes["study_area"] = joined.drop_duplicates("h3").set_index("h3")["area"].reindex(hexes["h3"]).values

    out = city.processed_dir
    out.mkdir(parents=True, exist_ok=True)
    hexes.to_parquet(out / "hex.parquet")
    areas.to_parquet(out / "areas.parquet")
    for name, gdf in street_layers.items():
        gdf.to_parquet(out / f"{name}.parquet")
    print(f"[pipeline] wrote {out}", flush=True)
    return hexes


def summary(hexes: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Median of each metric per study area, plus the city-wide median."""
    by_area = hexes.groupby("study_area")[columns].median()
    by_area.loc["(city)"] = hexes[columns].median()
    return by_area
