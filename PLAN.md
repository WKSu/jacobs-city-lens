# Plan: Visualizing *The Death and Life of Great American Cities* with data

Jane Jacobs (1961) argued from observation, not statistics. This project turns her
main claims into measurable indicators, computes them the same way for several
cities, and shows them on maps and charts organized by the book's chapters.

The goal is **not** a single "Jacobs score". It is to let people see where a
neighbourhood meets or misses each of her conditions, and to compare the places
she wrote about with Rotterdam and Hanoi.

---

## 1. From the book to indicators

### The four generators of diversity (Part II, ch. 7–11)

| # | Jacobs' condition | What we measure | Main data sources |
|---|---|---|---|
| 1 | **Mixed primary uses**: people on the street at different times of day for different reasons | Shannon entropy of land use per hex; jobs to residents ratio; share of the day covered by POI opening hours ("temporal mix") | OSM, Overture Places, NL **BAG** (use per unit), US **LEHD LODES** + ACS |
| 2 | **Short blocks**: many corners and route choices | Intersection density, median block length, block perimeter, share of dead ends, route directness | OSM street network via `osmnx`; block geometry via `momepy` |
| 3 | **Aged buildings**: a mix of building ages and conditions, which gives a mix of rents | Diversity of construction years (entropy / IQR); share built before 1945; spread of property values | NL BAG `bouwjaar` + WOZ values; NYC PLUTO; Boston, Chicago, Philadelphia and SF assessor data; **GHSL built-up epochs** everywhere (the only source for Hanoi) |
| 4 | **Sufficient concentration**: dense enough to support all of the above | Dwellings per hectare (Jacobs: about 100+ per acre, roughly 250 per ha, net); population per ha | BAG, PLUTO, ACS, CBS buurt statistics, Vietnam 2019 census by ward, GHS-POP / WorldPop |

### Other chapters

| Chapter | Idea | Indicator (proxy) |
|---|---|---|
| 2–4 Sidewalks | **Eyes on the street**, sidewalk contact, children on sidewalks | Ground-floor active uses and building entrances per 100 m of street; front setback distance; share of street frontage lined by buildings; *stretch goal:* Mapillary street-level images (windows, storefronts, people) |
| 5 Neighbourhood parks | Parks thrive when the uses around them are mixed | Land-use mix and density within 400 m of each park, compared with park size |
| 6 City neighbourhoods | Street / district / city scale | Show every metric at three scales: street segment, H3 hex, district |
| 14 Border vacuums | Large single-use areas kill activity at their edges | Map rail yards, highways, campuses, large parks and superblocks; plot activity density against distance to their edge |
| 15 Unslumming | Gradual improvement from within | Change in population, income and building permits over time (ACS, CBS annual series) |
| 16 Gradual vs cataclysmic money | Many small investments vs a few large ones | Size distribution of building permits and redevelopment projects |
| 18 Erosion by automobiles | Roads and parking eat the city | Share of land used for roads and parking; car (and in Hanoi, motorbike) ownership |
| 13 Self-destruction of diversity | Success can push out the mix that made it | Change in POI-type mix over time where history exists (OSM history, Overture releases) |

## 2. Cities and neighbourhood pairs

Each city gets a **Jacobs-style area** and a **planned / modernist area** to compare.

| City | Jacobs-style | Contrast |
|---|---|---|
| New York | Greenwich Village (Hudson Street) | Stuyvesant Town; East Harlem towers |
| Boston | North End | West End (demolished 1958–60, rebuilt from historical maps as a stretch goal) |
| Chicago | Back of the Yards | Hyde Park–Kenwood renewal area |
| Philadelphia | Rittenhouse Square | Penn Center / Society Hill towers |
| San Francisco | North Beach / Telegraph Hill | Western Addition renewal area |
| Los Angeles | — (Jacobs' counterexample) | A typical car-oriented district |
| **Rotterdam** | Oude Noorden, Delfshaven (survived the 1940 bombing) | Lijnbaan / rebuilt centre (1953), Ommoord, Kop van Zuid |
| **Hanoi** | Old Quarter (36 streets, tube houses) | Kim Liên / Thanh Xuân KTT collective housing (Soviet-style, later heavily adapted by residents); new urban areas such as Ciputra or Vinhomes Ocean Park |

Rotterdam and Hanoi make a strong pair. Rotterdam is the European example of
rebuilding after destruction along modernist lines. Hanoi's Old Quarter may be more
"Jacobsian" than anything in 1961 New York. And the KTT estates show modernist
blocks being turned back toward a Jacobs-like street life by their residents.

## 3. Method

* **Common grid:** H3 resolution 9 (about 0.1 km² per hex) for every city, plus
  street segments and administrative districts.
* **Two data tiers:**
  1. *Global tier*: OSM, Overture, GHSL and WorldPop, computed the same way for
     every city so comparisons are fair.
  2. *Local tier*: richer national or municipal data (BAG, CBS, PLUTO, LODES,
     ACS, assessor data) for more detail where it exists. Always labelled as
     local-only.
* **Normalization:** show raw values together with percentiles inside each city,
  plus thresholds from the book where Jacobs gave them (for example density).
* **Profiles, not scores:** each neighbourhood gets a radar or bar profile across the
  four generators. Any combined index is optional, with its weighting made clear.
* **Data quality:** OSM POIs are undercounted in Hanoi, so cross-check with
  Overture and report completeness per city.

## 4. Tech stack

* **Pipeline:** Python with `uv`, `geopandas`, `osmnx`, `momepy`, `h3`, `duckdb`
  (to query Overture straight from S3), and `rasterio` (for GHSL). Each city is
  driven by a file in `config/cities/<city>.yaml`, and outputs are GeoParquet files.
* **Tiles:** `tippecanoe` to PMTiles, served as static files.
* **Website:** Observable Framework (or Vite + D3) with MapLibre GL, a
  scrollytelling layout with one section per chapter, a city/neighbourhood switcher
  and side-by-side maps. Deployed on GitHub Pages.
* **CI:** GitHub Actions to build the site; the heavy data pipeline runs locally or
  on demand.

## 5. Phases

| Phase | Deliverable |
|---|---|
| 0. Setup | Repo, environment, city config, area boundaries for each neighbourhood |
| 1. Short blocks + density | Street-network and density metrics for all cities (easiest and most comparable). First map prototype |
| 2. Mixed uses + aged buildings | Land-use entropy, temporal mix, building-age diversity (BAG and PLUTO first, GHSL for the rest) |
| 3. Website v1 | Map explorer + neighbourhood profiles for the four generators |
| 4. Secondary chapters | Border vacuums, parks, eyes on the street, cars |
| 5. Change over time | Unslumming, gradual vs cataclysmic money, self-destruction of diversity |
| 6. Stretch goals | Street-level image analysis; historical West End reconstruction; Hanoi 1990s vs today |

Suggested order: start with **Rotterdam** (BAG has excellent data on use, building
year and units), then **New York** (PLUTO), then **Hanoi** (the hardest data, so it
benefits from a pipeline that has already been tested).

### Status (Rotterdam first)

| Step | Branch / issue | State |
|---|---|---|
| Overture pipeline, H3 grid, short blocks, density, mixed use (global tier) | `feat/overture-pipeline` | done |
| Website v1: map explorer, district profiles, figure-ground, density chart | `feat/site-v1` | done |
| BAG: use classes per unit, construction years (generators 1, 3, 4) | issue 3 | done, `feat/local-tier-nl` |
| CBS 100 m grid: residents, WOZ value spread, tenure | issue 5 | done, `feat/local-tier-nl` |
| Car space (BGT) | issue 10 | done, `feat/local-tier-nl` |
| Opening hours: time-of-day mix | issue 6 | done, `feat/local-tier-nl` |
| FSI and the Spacemate chart | issue 4 | FSI and OSR done from BAG floor area; 3DBAG heights still blocked (`data.3dbag.nl` unreachable) |
| GitHub Pages deploy | issue 11 | done: Pages source switched from legacy to GitHub Actions |
| Border vacuums | issue 7 | todo |
| Eyes on the street: frontage and active ground floors | issue 8 | todo |
| Parks and their surroundings | issue 9 | todo |
| Next cities: New York, Hanoi | issues 12, 13 | todo |

The national registers turned out to be reachable from a local machine even
though the cloud build environment blocks them, so the local tier for Rotterdam
is in. Only 3DBAG is genuinely unavailable. See
[docs/data-sources.md](docs/data-sources.md#host-access-as-measured).

Drafts of the issues are in `docs/issues/`. `scripts/create_issues.sh` files them
on GitHub.

## 6. Caveats

* Jacobs' arguments are qualitative. Every indicator here is an interpretation, and
  the site should say so.
* Correlations between areas (for example with crime data) are not proof of cause.
  Present them carefully, or leave them out.
* The book describes cities in 1961. Today's data shows what came after, which is
  itself part of the story.
