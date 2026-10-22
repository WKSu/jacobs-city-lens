---
title: "Time-of-day mix from opening hours"
labels: [data, generator:mixed-uses, viz]
---
Jacobs' first generator is about people being out at *different times*.
- Parse OSM `opening_hours` (Overture places has no opening hours) for Rotterdam shops, cafés, offices, schools.
- Per hexagon: share of the 24 hours × 7 days in which at least N places are open; the hour profile.
- Visual: small-multiple "day clocks" (24-hour radial or strip) for each study area.
- Needs an OSM extract (Geofabrik or Overpass; currently blocked in the cloud build environment).
