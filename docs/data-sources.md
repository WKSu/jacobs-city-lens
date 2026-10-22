# Data sources

Jacobs' conditions are about *what is in the buildings*, *how old they are*, *how
the streets are cut*, and *how many people are around*. For each, this page
lists the best source per city and a global fallback that works everywhere.
Comparisons between cities use the **global tier**. Detail within a city may
use the **local tier**, and every chart says which tier it shows.

## Overview

| Need | Rotterdam / NL (best) | Global fallback | US cities in the book | Hanoi |
|---|---|---|---|---|
| Units & dwellings | **BAG** `verblijfsobject` (every unit, with use + floor area) | Overture `addresses` (count only) | NYC PLUTO `unitsres`; ACS housing units | VN census 2019 by ward; GHS-POP / WorldPop |
| Use mix | **BAG** `gebruiksdoel` (11 legal use classes per unit) + Overture places | Overture `places` taxonomy; OSM POIs | LEHD LODES jobs by sector (block level) + PLUTO land use | Overture places (better than OSM here) |
| Building age | **BAG** `pand.oorspronkelijkBouwjaar` (every building) | GHSL GHS-BUILT-S multitemporal (1975–2030, 5-year epochs) | PLUTO `yearbuilt`; county assessor data | GHSL only |
| Rents / economic yield | CBS 100 m grid: average WOZ value; CBS buurt: rental vs owner-occupied share | — | ACS median rent by block group | — |
| Floor area & height | **3DBAG** (TU Delft): LoD2 heights and volumes per building | Overture building height/floors (sparse) | NYC building footprints (height); PLUTO floor area | Overture / Google Open Buildings 2.5D |
| Streets & blocks | Overture `transportation` (from OSM); **BGT** `wegdeel` for road vs sidewalk surface | Overture `transportation` | same | same |
| Population & people | CBS 100 m grid (*vierkantstatistieken*), CBS *Kerncijfers wijken en buurten* | GHS-POP 100 m, WorldPop | ACS / decennial census | census 2019, GHS-POP |
| Jobs | CBS buurt: business establishments by sector (LISA is better but not open) | Overture places as proxy | LEHD LODES WAC | — |
| Opening hours (time-of-day mix) | OSM `opening_hours` | OSM | OSM | OSM (sparse) |
| Safety (eyes on the street) | Rotterdam *Wijkprofiel* safety index; police crime counts per buurt (data.politie.nl via CBS) | — | NYPD / Chicago open crime data | — |
| Car space | **BGT** `wegdeel` surfaces; CBS `personenautosPerHuishouden` per buurt | Overture road class + width | — | motorbike ownership (census); CBS has `motortweewielersTotaal` for NL |
| Transit | GTFS NL (OVapi) | GTFS / Overture | GTFS | Hanoi bus GTFS (community) |
| History | Rotterdam 1940 *brandgrens* (fire boundary); Kadaster TopoTijdReis historic maps | — | Sanborn maps (Boston West End) | — |

## Why these choices

**BAG is the main source for Rotterdam.** The Dutch building and address register
has every unit (`verblijfsobject`) with its legal use class (residential, shop,
office, assembly, industry, education, healthcare, lodging, sport, cell, other),
its floor area, and the original construction year of its building. That covers
three of the four generators (mixed uses, aged buildings, concentration) from one
complete, official, open (CC0) dataset. Few other countries have anything this
good, which is why Rotterdam is the best city to build the method on.

**Overture is the global baseline.** It bundles OSM streets and buildings,
Meta/Microsoft places, and national address registers into one schema with
monthly releases on public S3, so the same code runs for New York, Rotterdam and
Hanoi. For the Netherlands its `addresses` layer *is* BAG (dataset `BAG Light`,
with the BAG `nummeraanduiding` ID). That lets us count units now and join BAG
attributes by ID later.

**GHSL fills the building-age gap globally.** GHSL's built-up surface for each
5-year epoch gives a coarse age estimate (when each 100 m cell was first built
up) everywhere, including Hanoi. It is much coarser than BAG, so it is used only
for comparisons between cities.

**Places are a proxy for jobs and activity, not a count of them.** Overture place
counts depend on what Meta and Microsoft index. We drop
`operating_status = permanently_closed` and low-confidence records, and report
how complete each city's data is.

## Host access, as measured

The cloud build environment reaches Overture's S3 bucket but not the national
registers, so the first build was Overture only. Checked again from a local
machine, almost all of them are in fact reachable, and the local tier below was
fetched that way. Only 3DBAG is genuinely unavailable.

| Host | Local | Notes |
|---|---|---|
| `overturemaps-us-west-2` (S3) | yes | global tier |
| `api.pdok.nl/kadaster/bag/ogc/v2` | yes | BAG units and buildings |
| `api.pdok.nl/lv/bgt/ogc/v1` | yes | BGT surfaces, `wegdeel` |
| `api.pdok.nl/cbs/vierkantstatistieken100m/ogc/v1` | yes | CBS 100 m grid |
| `service.pdok.nl/cbs/wijkenbuurten/<year>/wfs/v1_0` | yes | CBS neighbourhood statistics (WFS, not OGC API) |
| `overpass-api.de` | yes | needs a descriptive `User-Agent`, else HTTP 406 |
| `opendata.cbs.nl` | yes | not needed; PDOK serves the grid with geometry |
| `data.3dbag.nl` | **no** | DNS resolves, TCP to :443 times out; other TU Delft hosts too |

So the data pipeline is a local step, as PLAN.md intends, and only the site
build runs in CI.

### Running the local tier

```sh
uv run python -m jacobs fetch rotterdam                 # Overture (global tier)
uv run python -m jacobs fetch rotterdam --source bag    # units, buildings
uv run python -m jacobs fetch rotterdam --source cbs    # 100 m grid
uv run python -m jacobs fetch rotterdam --source bgt    # road surfaces
uv run python -m jacobs fetch rotterdam --source osm    # opening hours
uv run python -m jacobs build rotterdam
```

Every fetch caches to `data/raw/<city>/<source>/` and is skipped if the file is
already there; pass `--force` to download again. These are big, paged downloads
from a public API: for Rotterdam, roughly 500k BAG units, 291k BAG buildings and
over 400k BGT surfaces, at 1000 features per request.

### Quirks worth knowing

* **PDOK OGC APIs cap `limit` at 1000** and return no `numberMatched`, so the
  client follows `next` links until they stop.
* **The neighbourhood statistics are WFS only**, and that service ignores
  `cql_filter`, so a bounding box is the only filter and neighbouring
  municipalities come back too (`load_buurten` clips). It is requested in RD
  coordinates because WFS 2.0 reads EPSG:4326 as latitude first.
* **Car ownership is not in the 100 m grid at all** — none of its 143 fields
  covers it — so chapter 18 takes it per neighbourhood. A hexagon gets a
  households-weighted average of the neighbourhoods it overlaps, which is
  blockier than everything else on the map.
* **BAG `gebruiksdoel` can hold several classes**, comma-separated
  (`winkelfunctie,woonfunctie` is a shop with a home above it). The register
  does not say how the floor area divides, so it is split equally.
* **BAG units carry no construction year.** Only `pand` has `bouwjaar`, so each
  unit takes the year of the footprint its point falls inside.
* **The CBS grid holds every year since 1971** in one collection and defaults to
  the oldest, so `jaarcode` must be set. Only 2022–2024 have the expanded
  indicators, and dwelling value and tenure stop after 2023, which is why 2023
  is the year used.
* **CBS suppresses cells for disclosure control** with `-99997`, which is not
  zero. At 100 m, household income is suppressed everywhere, so it is not
  offered. Dwelling-age bands are only about a third filled, so BAG carries the
  age story and CBS serves as a cross-check (they correlate 0.89 on the hexagons
  where both exist).
* **Overture's division lookup is slow without a bounding box.** Resolving a
  city boundary by `id` alone scans the whole global `division_area` layer
  (20+ minutes); the same read with a bbox prefilter takes about 75 seconds.
* **FSI from BAG is not a published Spacemate FSI.** BAG records usable floor
  area per unit and nothing for a building with no units, so the figure reads
  low. It compares Dutch hexagons with each other, not with the literature.

## Licences

* Overture: CDLA-Permissive-2.0, with ODbL for OSM-derived layers (buildings,
  transportation, base). Outputs derived from these layers carry ODbL attribution.
* BAG, BGT, CBS: CC0 / CC-BY 4.0.
* 3DBAG: CC-BY 4.0.
* GHSL: CC-BY 4.0.
