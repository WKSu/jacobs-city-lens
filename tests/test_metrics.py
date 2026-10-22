import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString

from jacobs.metrics import mixed_use, streets

CRS = "EPSG:28992"


def grid_segments(n=3, spacing=100.0):
    """An n x n street grid. Each street is one segment with a connector at every crossing."""
    rows = []
    for i in range(n):
        for horizontal in (True, False):
            coords = [(0, i * spacing), ((n - 1) * spacing, i * spacing)]
            if not horizontal:
                coords = [(y, x) for x, y in coords]
            ids = [f"c{(i, j) if horizontal else (j, i)}" for j in range(n)]
            at = [j / (n - 1) for j in range(n)]
            rows.append({"subtype": "road", "class": "residential", "subclass": None, "name": "x",
                         "connector_ids": ids, "connector_at": at, "geometry": LineString(coords)})
    return gpd.GeoDataFrame(rows, crs=CRS)


def test_grid_network():
    edges = streets.build_edges(grid_segments(), CRS)
    assert len(edges) == 12
    assert np.allclose(edges["length"], 100)
    degree = streets.node_degrees(edges)
    # centre is a 4-way crossing, edge midpoints are T junctions, corners are bends
    assert degree["c(1, 1)"] == 4
    assert degree["c(0, 1)"] == 3
    assert degree["c(0, 0)"] == 2
    links = streets.links(edges, degree)
    # corners have degree 2, so the two edges around each corner merge into one link
    assert len(links) == 8
    assert sorted(links["length"].round()) == [100] * 4 + [200] * 4
    blocks = streets.blocks(edges, edges.union_all().buffer(1000))
    assert len(blocks) == 4
    assert np.allclose(blocks["area_ha"], 1.0)


def test_walkable_filter_drops_sidewalks_and_motorways():
    segs = grid_segments()
    segs.loc[0, "subclass"] = "sidewalk"
    segs.loc[1, "class"] = "motorway"
    segs.loc[2, "class"] = "footway"
    assert len(streets.walkable_segments(segs)) == len(segs) - 3
    assert len(streets.walkable_segments(segs, streets.PATH_CLASSES)) == len(segs) - 2


def test_entropy():
    counts = pd.DataFrame({"a": [5, 10, 0], "b": [5, 0, 0]})
    h = mixed_use.entropy(counts)
    assert np.isclose(h[0], 1.0)
    assert np.isclose(h[1], 0.0)
    assert np.isnan(h[2])
