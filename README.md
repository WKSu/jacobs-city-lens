# Jacobs City Lens

Visualizing the ideas of Jane Jacobs' *The Death and Life of Great American Cities*
(1961) with open data: mixed uses, short blocks, aged buildings, density, eyes on the
street and border vacuums. Rotterdam comes first. The pipeline is designed so the
cities in the book (New York, Boston, Chicago, Philadelphia, San Francisco) and Hanoi
can be added through configuration alone.

* [PLAN.md](PLAN.md): indicators, cities, phases
* [docs/data-sources.md](docs/data-sources.md): which data, why, and what is blocked
* [docs/adding-a-city.md](docs/adding-a-city.md): how to add another city

## Quick start

```sh
uv sync
uv run python -m jacobs fetch rotterdam     # Overture layers -> data/raw/rotterdam/
uv run python -m jacobs build rotterdam     # metrics + web export -> site/public/data/
uv run pytest

cd site && npm install && npm run dev        # http://localhost:5173
```

For Rotterdam there is also a **local tier** from the Dutch national registers,
which carries building ages, use classes, dwelling values and street surfaces:

```sh
uv run python -m jacobs fetch rotterdam --source bag   # units, buildings
uv run python -m jacobs fetch rotterdam --source cbs   # 100 m grid + neighbourhoods
uv run python -m jacobs fetch rotterdam --source bgt   # road and parking surfaces
uv run python -m jacobs fetch rotterdam --source osm   # opening hours
```

These are big paged downloads that cache under `data/raw/`, so they run once.
See [docs/data-sources.md](docs/data-sources.md) for what each one gives and
which hosts are reachable.

## How it works

```
config/cities/<city>.yaml      boundary, CRS, study areas, sources
        │
jacobs/sources/overture.py     global tier: buildings, places, streets, addresses, water
jacobs/sources/{bag,cbs,bgt,osm}.py   local tier (NL): use classes, ages, values, surfaces
        │
jacobs/grid.py                 H3 hexagons (resolution 9, ~10 ha)
jacobs/metrics/*.py            one module per generator, chapter or data source
jacobs/metrics/registry.py     metric definitions shared with the site
        │
jacobs/export.py               small GeoJSON/JSON files in site/public/data/<city>/
        │
site/                          Vite + MapLibre + D3, deployed on GitHub Pages
```

## What the site shows

1. **The four generators, and what surrounds them**: one tab per chapter. Each tab opens
   with Jacobs' idea, a scene from the book, a Rotterdam scene with places to fly to on the
   map, and a small interactive model of the mechanism (labelled as a sketch or as city
   data). The hexagon map follows. Zoom in to see what each indicator counts (every place,
   address, intersection and street), and click a hexagon to see how its numbers are made.
2. **Old districts and planned ones**: a profile chart placing each district on
   the city's distribution (further right is closer to what Jacobs asked for).
3. **Figure-ground**: the same 800 × 800 m of buildings and streets for each district.
4. **How dense is dense enough?**: the density distribution against Jacobs'
   ~100 dwellings per acre.
5. **Border vacuums**: activity in 50 m bands from the edges of rail, motorways, industry,
   campuses, large parks, water and superblocks.
6. **Parks and the uses around them**: each park's size against the mix, density and
   built edge of its surroundings.
