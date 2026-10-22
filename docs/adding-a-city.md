# Adding a city

The pipeline is the same for every city. A city is one YAML file.

1. **Find the boundary.** Look up the city's Overture `division_area` id (subtype
   `locality` or `county`) in the current release, for example with the Overture
   Explorer at <https://explore.overturemaps.org>.
2. **Create `config/cities/<id>.yaml`** with the same shape as `rotterdam.yaml`:
   * `crs`: a metric projection for the city (a local UTM zone works everywhere;
     New York uses EPSG:2263 in feet, so prefer UTM 18N, EPSG:32618).
   * `study_areas`: neighbourhoods selected by Overture division `subtype` + `name`.
     Run `fetch` first and list the names in `data/raw/<id>/overture/divisions.parquet`,
     because Overture's neighbourhood levels differ between countries.
   * `story` (optional): the city's own scene for each tab and the places the map can fly
     to (`center` is `[lon, lat]`), plus the districts used in the density quiz. Jacobs'
     ideas and the book's scenes are shared by every city and live in `site/src/stories.js`.
3. **Run the pipeline:**

   ```sh
   uv run python -m jacobs fetch <id>
   uv run python -m jacobs build <id>
   ```

4. The site picks the city up from `site/public/data/cities.json`.

## Local data sources

Global metrics come from Overture, so they compare fairly between cities.
Better national data (BAG for the Netherlands, PLUTO for New York and so on)
goes in `jacobs/sources/<name>.py` and must:

* write to `data/raw/<city>/<source>/`
* add new hexagon columns rather than overwrite global ones
  (e.g. `bag_use_mix` next to `use_mix`), and register them in
  `jacobs/metrics/registry.py` with a `tier: local` flag.

A source module exposes two functions, as `bag.py`, `cbs.py`, `bgt.py` and
`osm.py` do:

* `fetch(city, force=False)` downloads and caches to
  `data/raw/<city>/<source>/`, and returns early if the file is already there.
  It is reached by `python -m jacobs fetch <city> --source <name>`, so the name
  also goes in `SOURCES` in `jacobs/cli.py`.
* `load(city)` reads the cache, clips it to the city boundary, drops records for
  things that no longer exist, and reprojects to the city CRS.

A city switches a source on by listing it under `sources` in its YAML. The
pipeline reads those keys in `local_tier()`, so a city without a national
register simply has no such columns, and `export.py` leaves those metrics out of
`city.json` instead of writing empty ones. Nothing else needs changing.

The Netherlands fetches are large and paged. Keep per-page conversion rather
than collecting whole responses in memory: BGT alone is over 400,000 polygons
for one city.

## Checks before publishing a city

* Places per 1,000 addresses (or per 1,000 people) is within the range of
  cities already published. Very low values mean Overture places are
  incomplete there.
* Study areas each cover at least 4 hexagons.
* The figure-ground panels show the area you expect.
