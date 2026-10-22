---
title: "BAG ingest: use classes per unit and construction years (Rotterdam)"
labels: [data, rotterdam, generator:aged-buildings, generator:mixed-uses]
---
**Why.** BAG is the best source for three of the four generators: every unit's legal use class (`gebruiksdoel`), floor area, and its building's construction year (`oorspronkelijkBouwjaar`).

**What**
- `jacobs/sources/bag.py`: download BAG for one municipality (PDOK BAG OGC API `api.pdok.nl/kadaster/bag/ogc/v2`, or the national BAG GeoPackage) into `data/raw/<city>/bag/`.
- Join to Overture addresses by BAG id (`record_id` = `nummeraanduiding`) where useful.
- New hexagon metrics (local tier):
  - `bag_use_mix`: entropy of floor area across the 11 use classes, *homes included*. This is the proper Jacobs mixed-uses measure.
  - `dwellings_per_ha`: residential units only. Also a *net* version using residential plots, comparable with Jacobs' 100 per acre.
  - `age_diversity`: entropy of construction-year classes (pre-1900, 1900–1944, 1945–1969, 1970–1989, 1990–2009, 2010+), plus `share_pre_1945`.
- Enable the "Aged buildings" tab on the site.

**Blocked:** `service.pdok.nl` / `api.pdok.nl` are not reachable from the cloud build environment. Allow them in the environment's network settings, or run the fetch locally.
