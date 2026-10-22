"""The shared H3 hexagon grid that every metric is aggregated to."""

from __future__ import annotations

import geopandas as gpd
import h3
import pandas as pd
import shapely

from jacobs.config import City


def build_grid(city: City, boundary: gpd.GeoDataFrame, water: gpd.GeoDataFrame | None) -> gpd.GeoDataFrame:
    """Hexagons covering the city, with gross area and land area (excluding water) in ha."""
    shape = boundary.to_crs(4326).geometry.union_all()
    cells = h3.geo_to_cells(shape, city.h3_resolution)
    polys = [shapely.Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(c)]) for c in cells]
    grid = gpd.GeoDataFrame({"h3": list(cells)}, geometry=polys, crs=4326).to_crs(city.crs)

    clipped = grid.geometry.intersection(boundary.to_crs(city.crs).geometry.union_all())
    grid["area_ha"] = clipped.area / 10_000
    land = clipped
    if water is not None and not water.empty:
        water_shape = water.to_crs(city.crs).geometry.make_valid().union_all()
        land = clipped.difference(water_shape)
    grid["land_ha"] = land.area / 10_000
    grid = grid[grid["land_ha"] > 0.5].sort_values("h3").reset_index(drop=True)
    return grid


def assign_points(points: gpd.GeoDataFrame, resolution: int) -> pd.Series:
    """H3 cell for each point (or the representative point of a polygon)."""
    pts = points.to_crs(4326).geometry
    pts = pts.where(pts.geom_type == "Point", pts.representative_point())
    return pd.Series([h3.latlng_to_cell(p.y, p.x, resolution) for p in pts], index=points.index)
