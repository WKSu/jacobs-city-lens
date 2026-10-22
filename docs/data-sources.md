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
| Car space | **BGT** road / parking surfaces; CBS cars per household | Overture road class + width | — | motorbike ownership (census) |
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

## Access status in the current build environment

This session's network allows Overture's S3 bucket but blocks PDOK
(`service.pdok.nl`, `api.pdok.nl`), CBS (`opendata.cbs.nl`, `datasets.cbs.nl`),
3DBAG (`data.3dbag.nl`), GHSL (`jeodpp.jrc.ec.europa.eu`) and OSM mirrors. So the
first build uses **Overture only**. The BAG, 3DBAG, CBS and BGT adapters are
tracked as separate issues and can be added once those hosts are allowed or run
locally.

## Licences

* Overture: CDLA-Permissive-2.0, with ODbL for OSM-derived layers (buildings,
  transportation, base). Outputs derived from these layers carry ODbL attribution.
* BAG, BGT, CBS: CC0 / CC-BY 4.0.
* 3DBAG: CC-BY 4.0.
* GHSL: CC-BY 4.0.
