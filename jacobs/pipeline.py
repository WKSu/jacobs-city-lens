"""Compute every metric for a city on its H3 grid.

Inputs:  data/raw/<city>/overture/*.parquet
Outputs: data/processed/<city>/hex.parquet      one row per hexagon, all metrics
         data/processed/<city>/areas.parquet    study area polygons
         data/processed/<city>/links.parquet    street links (for maps)
         data/processed/<city>/blocks.parquet   street blocks (for maps)
         data/processed/<city>/eyes_links.parquet   street links with eyes-on-the-street metrics
         data/processed/<city>/vacuums.parquet  border vacuums; vacuum_decay.parquet the distance bands
         data/processed/<city>/parks.parquet    parks with the uses around them
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

from jacobs.config import City
from jacobs.grid import build_grid
from jacobs.metrics import density, eyes, mixed_use, parks, streets, vacuums


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


def local_tier(city: City, grid: gpd.GeoDataFrame,
               coverage: pd.Series | None = None) -> list[pd.DataFrame]:
    """Metrics from national registers, for the cities that have them.

    Each block is switched on by a key in the city's `sources`, so a city
    without a BAG simply gets none of these columns and the site leaves those
    metrics out. Road surfaces come first because the net densities need to
    know how much of the land is street. `coverage` is building coverage (GSI)
    from the global tier, which the open space ratio needs.
    """
    frames: list[pd.DataFrame] = []
    resolution = city.h3_resolution
    net_ha = None

    if "bgt" in city.sources:
        from jacobs.metrics import car_space
        from jacobs.sources import bgt

        frame = car_space.compute(grid, bgt.load(city), city.crs)
        net_ha = frame["non_road_ha"]
        frames.append(frame)
        print("[pipeline] car space done", flush=True)

    if "bag" in city.sources:
        from jacobs.metrics import aged_buildings, use_classes
        from jacobs.sources import bag

        units = bag.load(city)["units"]
        frames.append(use_classes.compute(
            grid, units, resolution, net_ha=net_ha, coverage=coverage))
        frames.append(aged_buildings.compute(grid, units, resolution))
        print("[pipeline] bag use classes and building ages done", flush=True)

    if "cbs" in city.sources:
        from jacobs.metrics import cbs_grid
        from jacobs.sources import cbs

        frames.append(cbs_grid.compute(grid, cbs.load(city), resolution, net_ha=net_ha))
        print("[pipeline] cbs grid done", flush=True)

    if "osm" in city.sources:
        from jacobs.metrics import temporal_mix
        from jacobs.sources import osm

        frames.append(temporal_mix.compute(grid, osm.load(city), resolution))
        print("[pipeline] opening hours done", flush=True)

    return frames


def run(city: City) -> gpd.GeoDataFrame:
    boundary = load_raw(city, "boundary")
    water = load_raw(city, "water")
    water = water[water.geom_type.isin(["Polygon", "MultiPolygon"])]
    grid = build_grid(city, boundary, water)
    land = grid.geometry.union_all()
    print(f"[pipeline] {city.id}: {len(grid):,} hexagons", flush=True)

    buildings, places, addresses = load_raw(city, "buildings"), load_raw(city, "places"), load_raw(city, "addresses")
    land_use, segments = load_raw(city, "land_use"), load_raw(city, "segments")

    street_metrics, street_layers = streets.compute(grid, segments, land, city.crs, city.h3_resolution)
    print("[pipeline] streets done", flush=True)
    density_metrics = density.compute(grid, addresses, buildings, city.crs, city.h3_resolution)
    print("[pipeline] density done", flush=True)
    mix_metrics = mixed_use.compute(grid, places, density_metrics["units"], city.h3_resolution)
    print("[pipeline] mixed use done", flush=True)

    eyes_metrics, eyes_links = eyes.compute(grid, street_layers["links"], buildings, places)
    print("[pipeline] eyes on the street done", flush=True)
    # the city's land, net of water (the grid's union overshoots the boundary)
    city_land = boundary.to_crs(city.crs).geometry.union_all().difference(
        water.to_crs(city.crs).geometry.make_valid().union_all())
    city_shape = boundary.to_crs(city.crs).geometry.union_all()
    vacuum_gdf = vacuums.detect(land_use, segments, water, city_land, city.crs).clip(city_shape)
    vacuum_gdf = vacuum_gdf[vacuum_gdf.geom_type.isin(["Polygon", "MultiPolygon"])].reset_index(drop=True)
    vacuum_metrics = vacuums.compute(grid, vacuum_gdf, city_land)
    vacuum_decay = vacuums.decay(vacuum_gdf, places, addresses, city_land, city.crs)
    print(f"[pipeline] border vacuums done ({len(vacuum_gdf):,} areas)", flush=True)
    park_gdf = parks.compute(
        parks.detect(land_use, city_land, city.crs), places, addresses, buildings, city_land, city.crs
    )
    print(f"[pipeline] parks done ({len(park_gdf):,} parks)", flush=True)

    local = local_tier(city, grid, coverage=density_metrics["coverage"])
    hexes = grid.set_index("h3").join(
        [street_metrics, density_metrics, mix_metrics, eyes_metrics, vacuum_metrics, *local]
    ).reset_index()

    areas = study_areas(city, load_raw(city, "divisions")).to_crs(city.crs)
    park_gdf["study_area"] = parks.assign_areas(park_gdf, areas)
    centroids = gpd.GeoDataFrame({"h3": hexes["h3"]}, geometry=hexes.geometry.centroid, crs=city.crs)
    joined = gpd.sjoin(centroids, areas[["area", "geometry"]], predicate="within", how="left")
    hexes["study_area"] = joined.drop_duplicates("h3").set_index("h3")["area"].reindex(hexes["h3"]).values

    out = city.processed_dir
    out.mkdir(parents=True, exist_ok=True)
    hexes.to_parquet(out / "hex.parquet")
    areas.to_parquet(out / "areas.parquet")
    for name, gdf in street_layers.items():
        gdf.to_parquet(out / f"{name}.parquet")
    eyes_links.to_parquet(out / "eyes_links.parquet")
    vacuum_gdf.to_parquet(out / "vacuums.parquet")
    vacuum_decay.to_parquet(out / "vacuum_decay.parquet")
    park_gdf.to_parquet(out / "parks.parquet")
    print(f"[pipeline] wrote {out}", flush=True)
    return hexes


def summary(hexes: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Median of each metric per study area, plus the city-wide median."""
    by_area = hexes.groupby("study_area")[columns].median()
    by_area.loc["(city)"] = hexes[columns].median()
    return by_area
