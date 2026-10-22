"""Metric definitions shared by the pipeline and the website.

`direction` says which way is "more like what Jacobs asked for": "higher" or
"lower". The site uses it to orient profile charts, never to recolor maps.
"""

from __future__ import annotations

GENERATORS = [
    {"id": "mixed_uses", "label": "Mixed primary uses", "chapter": 8,
     "summary": "People on the street at different times, for different purposes."},
    {"id": "short_blocks", "label": "Short blocks", "chapter": 9,
     "summary": "Frequent streets and chances to turn corners."},
    {"id": "aged_buildings", "label": "Aged buildings", "chapter": 10,
     "summary": "A mingling of buildings of different ages and rents.",
     "status": "needs BAG construction years (see issue tracker)"},
    {"id": "concentration", "label": "Concentration", "chapter": 11,
     "summary": "A dense enough concentration of people, residents included."},
]

METRICS = [
    {"id": "use_mix", "generator": "mixed_uses", "label": "Use mix", "unit": "0–1",
     "direction": "higher", "format": ".2f",
     "description": "Evenness of open places across six kinds of use (work, shopping, food & drink, "
                    "personal services, civic, culture & leisure). Shannon entropy scaled to 0–1; "
                    "hexagons with fewer than 5 places are left blank.",
     "source": "Overture places"},
    {"id": "places_per_ha", "generator": "mixed_uses", "label": "Places per ha", "unit": "per ha",
     "direction": "higher", "format": ".1f",
     "description": "Open shops, offices, cafés, schools, clinics and other places per hectare of land.",
     "source": "Overture places"},
    {"id": "places_per_100_units", "generator": "mixed_uses", "label": "Places per 100 addresses",
     "unit": "per 100", "direction": "higher", "format": ".1f",
     "description": "Non-residential activity relative to the number of addresses: low values mean "
                    "mostly homes, very high values mostly business.",
     "source": "Overture places + BAG addresses"},
    {"id": "intersection_density", "generator": "short_blocks", "label": "Street intersections",
     "unit": "per km²", "direction": "higher", "format": ".0f",
     "description": "Street intersections (three or more ways) per km² of land. Footpaths through "
                    "green space are not counted.",
     "source": "Overture transportation (OSM)"},
    {"id": "median_link_m", "generator": "short_blocks", "label": "Street length between corners",
     "unit": "m", "direction": "lower", "format": ".0f",
     "description": "Median length of street between two intersections: Jacobs' block length.",
     "source": "Overture transportation (OSM)"},
    {"id": "median_block_ha", "generator": "short_blocks", "label": "Block size", "unit": "ha",
     "direction": "lower", "format": ".2f",
     "description": "Median area of the blocks enclosed by streets (blocks over 25 ha are left out).",
     "source": "Overture transportation (OSM)"},
    {"id": "path_intersection_density", "generator": "short_blocks", "label": "Path intersections",
     "unit": "per km²", "direction": "higher", "format": ".0f",
     "description": "Intersections on the full walking network, footpaths included. Compare with "
                    "street intersections to see where permeability comes from paths in green space.",
     "source": "Overture transportation (OSM)"},
    {"id": "units_per_ha", "generator": "concentration", "label": "Addresses per ha", "unit": "per ha",
     "direction": "higher", "format": ".0f",
     "description": "BAG addresses (homes and other units) per hectare of land, gross. Jacobs' "
                    "threshold of about 100 dwellings per net acre is roughly 250 per net hectare.",
     "source": "Overture addresses (BAG)"},
    {"id": "coverage", "generator": "concentration", "label": "Building coverage", "unit": "share",
     "direction": "higher", "format": ".0%",
     "description": "Share of land covered by building footprints (GSI).",
     "source": "Overture buildings (OSM)"},
]

METRIC_IDS = [m["id"] for m in METRICS]
