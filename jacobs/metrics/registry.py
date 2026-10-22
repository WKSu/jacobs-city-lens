"""Metric definitions shared by the pipeline and the website.

`direction` says which way is "more like what Jacobs asked for": "higher" or
"lower". The site uses it to orient profile charts, never to recolor maps.

`tier` is "global" for metrics computed the same way for every city, so cities
can be compared, and "local" for metrics that depend on a national register and
exist only where that register does. Local metrics are richer but must always
be labelled as not comparable between countries. It defaults to "global".
"""

from __future__ import annotations

GENERATORS = [
    {"id": "mixed_uses", "label": "Mixed primary uses", "chapter": 8,
     "summary": "People on the street at different times, for different purposes."},
    {"id": "short_blocks", "label": "Short blocks", "chapter": 9,
     "summary": "Frequent streets and chances to turn corners."},
    {"id": "aged_buildings", "label": "Aged buildings", "chapter": 10,
     "summary": "A mingling of buildings of different ages and rents."},
    {"id": "concentration", "label": "Concentration", "chapter": 11,
     "summary": "A dense enough concentration of people, residents included."},
    # Later chapters: not generators, but the same map and profile treatment.
    {"id": "eyes", "label": "Eyes on the street", "chapter": 2, "kind": "chapter",
     "summary": "Streets lined by buildings that face them, with doors and shops to watch from."},
    {"id": "border_vacuums", "label": "Border vacuums", "chapter": 14, "kind": "chapter",
     "summary": "Large single-use areas that leave dead edges around them."},
    {"id": "parks", "label": "Parks", "chapter": 5, "kind": "chapter",
     "summary": "A park lives on the mix of uses around it, not on its size."},
    {"id": "cars", "label": "Erosion by automobiles", "chapter": 18, "kind": "chapter",
     "summary": "How much of the street is given over to driving and parking."},
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
    {"id": "eyes_score", "generator": "eyes", "label": "Eyes score", "unit": "0–1",
     "direction": "higher", "format": ".2f", "links": True,
     "description": "Average of the three street measures below, each as a percentile among the city's "
                    "streets. A summary for the map, not a finding on its own. Zoom in to see single streets.",
     "source": "Overture buildings, places and transportation"},
    {"id": "frontage_share", "generator": "eyes", "label": "Street wall", "unit": "share",
     "direction": "higher", "format": ".0%", "links": True,
     "description": "Share of street length, both sides, with a building within 20 m of the street's "
                    "centre line: how much of the street is lined rather than open to lawns or car parks.",
     "source": "Overture buildings (OSM) + transportation"},
    {"id": "buildings_per_100m", "generator": "eyes", "label": "Buildings fronting the street",
     "unit": "per 100 m", "direction": "higher", "format": ".1f", "links": True,
     "description": "Distinct buildings facing the street per 100 m, both sides: the grain of doors and "
                    "windows. A row of narrow houses scores high, one slab in a lawn scores low.",
     "source": "Overture buildings (OSM) + transportation"},
    {"id": "places_per_100m", "generator": "eyes", "label": "Places along the street",
     "unit": "per 100 m", "direction": "higher", "format": ".1f", "links": True,
     "description": "Open shops, cafés, offices and other places within 30 m of the street, per 100 m.",
     "source": "Overture places + transportation"},
    {"id": "vacuum_share", "generator": "border_vacuums", "label": "Land in border vacuums",
     "unit": "share", "direction": "lower", "format": ".0%",
     "description": "Share of land inside a large single-use area: rail, motorways, industry and port, "
                    "campuses and hospitals, large parks, and superblocks over 5 ha between "
                    "streets. Large water is a vacuum too, but only land is counted here.",
     "source": "Overture land use, transportation and water"},
    {"id": "vacuum_dist_m", "generator": "border_vacuums", "label": "Distance to a vacuum edge",
     "unit": "m", "direction": "higher", "format": ".0f",
     "description": "Distance from the hexagon's centre to the nearest edge of a border vacuum (0 inside one).",
     "source": "Overture land use, transportation and water"},
    {"id": "ring_use_mix", "generator": "parks", "label": "Use mix around the park", "unit": "0–1",
     "direction": "higher", "format": ".2f", "layer": "parks",
     "description": "Evenness of open places across six kinds of use within 400 m of the park "
                    "(same measure as the hexagon use mix). Parks over 0.5 ha.",
     "source": "Overture land use + places"},
    {"id": "ring_units_per_ha", "generator": "parks", "label": "Addresses around the park",
     "unit": "per ha", "direction": "higher", "format": ".0f", "layer": "parks",
     "description": "Addresses per ha of land within 400 m of the park: the people who could use it.",
     "source": "Overture land use + addresses (BAG)"},
    {"id": "edge_built_share", "generator": "parks", "label": "Edge with buildings", "unit": "share",
     "direction": "higher", "format": ".0%", "layer": "parks",
     "description": "Share of the park's edge with a building within 40 m outside it: an edge that "
                    "windows look onto.",
     "source": "Overture land use + buildings"},

    # --- local tier: Netherlands (BAG, CBS, BGT) and OSM opening hours -------
    {"id": "bag_use_mix", "generator": "mixed_uses", "tier": "local",
     "label": "Use mix (floor area)", "unit": "0–1", "direction": "higher", "format": ".2f",
     "description": "Evenness of floor area across the legal use classes of every unit in the "
                    "register, housing included. Closer to Jacobs' mixed primary uses than any "
                    "count of shops can be, because it can see the homes.",
     "source": "BAG (NL)"},
    {"id": "open_hours_share", "generator": "mixed_uses", "tier": "local",
     "label": "Hours with something open", "unit": "share of the week", "direction": "higher",
     "format": ".0%",
     "description": "Share of the week's 168 hours when at least three places nearby are open. "
                    "Only about a tenth of places publish opening hours in OSM, and chains are "
                    "tagged better than independent shops, so this needs five readable places in "
                    "a hexagon and is blank away from high streets and centres.",
     "source": "OSM opening hours"},
    {"id": "evening_share", "generator": "mixed_uses", "tier": "local",
     "label": "Open in the evening", "unit": "share of 18–24h", "direction": "higher",
     "format": ".0%",
     "description": "The same measure for 18:00–24:00, when offices are shut and a street either "
                    "has life of its own or does not.",
     "source": "OSM opening hours"},
    {"id": "age_diversity", "generator": "aged_buildings", "tier": "local",
     "label": "Age mix", "unit": "0–1", "direction": "higher", "format": ".2f",
     "description": "Evenness of units across six construction-year bands (before 1900, "
                    "1900–1944, 1945–1969, 1970–1989, 1990–2009, 2010 and later). A district of "
                    "one age tends to be a district of one rent.",
     "source": "BAG (NL)"},
    {"id": "share_pre_1945", "generator": "aged_buildings", "tier": "local",
     "label": "Built before 1945", "unit": "share", "direction": "higher", "format": ".0%",
     "description": "Share of units in buildings finished before 1945. In Rotterdam this is "
                    "largely a map of what the 1940 bombing and the clearances missed.",
     "source": "BAG (NL)"},
    {"id": "woz_spread", "generator": "aged_buildings", "tier": "local",
     "label": "Spread of dwelling value", "unit": "coeff. of variation", "direction": "higher",
     "format": ".2f",
     "description": "How much average dwelling value varies between the 100 m cells in a hexagon "
                    "and its neighbours. Jacobs' case for old buildings is a case for a mix of "
                    "rents, so the spread is the point and the average is not.",
     "source": "CBS 100 m grid (NL)"},
    {"id": "rental_share", "generator": "aged_buildings", "tier": "local",
     "label": "Rented homes", "unit": "share", "direction": "higher", "format": ".0%",
     "description": "Share of dwellings that are rented rather than owned, shown as context for "
                    "the spread of value rather than as something to maximise.",
     "source": "CBS 100 m grid (NL)"},
    {"id": "dwellings_per_ha", "generator": "concentration", "tier": "local",
     "label": "Dwellings per ha", "unit": "per ha", "direction": "higher", "format": ".0f",
     "description": "Dwellings per hectare of land, gross. Only units whose legal use is housing "
                    "are counted, unlike the address count in the global tier.",
     "source": "BAG (NL)"},
    {"id": "dwellings_per_net_ha", "generator": "concentration", "tier": "local",
     "label": "Dwellings per net ha", "unit": "per ha", "direction": "higher", "format": ".0f",
     "description": "Dwellings per hectare of land that is not road surface. This is the figure "
                    "to set against Jacobs' threshold of about 100 dwellings per net acre, "
                    "roughly 250 per hectare.",
     "source": "BAG + BGT (NL)"},
    {"id": "fsi", "generator": "concentration", "tier": "local",
     "label": "Floor space index", "unit": "m² per m²", "direction": "higher", "format": ".2f",
     "description": "Floor area of all units per square metre of land. Plotted against building "
                    "coverage this gives a Spacemate diagram, which separates the two things "
                    "Jacobs insisted were different: dense, which she wanted, and overcrowded, "
                    "which she did not. Based on usable floor area, so it reads lower than an "
                    "FSI built from gross areas.",
     "source": "BAG (NL)"},
    {"id": "osr", "generator": "concentration", "tier": "local",
     "label": "Open space ratio", "unit": "m² per m²", "direction": "lower", "format": ".2f",
     "description": "Unbuilt land per square metre of floor area: the amount of open space each "
                    "unit of building has around it. High values are the towers-in-parkland "
                    "pattern Jacobs argued against.",
     "source": "BAG + Overture buildings"},
    {"id": "pop_per_ha", "generator": "concentration", "tier": "local",
     "label": "Residents per ha", "unit": "per ha", "direction": "higher", "format": ".0f",
     "description": "Residents per hectare of land. Jacobs argued for dense concentrations of "
                    "people, and was careful to distinguish that from overcrowded dwellings.",
     "source": "CBS 100 m grid (NL)"},
    {"id": "car_space_share", "generator": "cars", "tier": "local",
     "label": "Street space for cars", "unit": "share of paving", "direction": "lower",
     "format": ".0%",
     "description": "Carriageway and parking as a share of all mapped paved public space; "
                    "pavements and cycle paths make up most of the rest.",
     "source": "BGT (NL)"},
    {"id": "pedestrian_share", "generator": "cars", "tier": "local",
     "label": "Street space for walking", "unit": "share of paving", "direction": "higher",
     "format": ".0%",
     "description": "Footways and pedestrian areas as a share of all mapped paved public space.",
     "source": "BGT (NL)"},
    {"id": "car_space_per_ha", "generator": "cars", "tier": "local",
     "label": "Land under cars", "unit": "share of land", "direction": "lower", "format": ".0%",
     "description": "Share of all land, not only paving, taken by carriageway and parking.",
     "source": "BGT (NL)"},
    {"id": "cars_per_household", "generator": "cars", "tier": "local",
     "label": "Cars per household", "unit": "per household", "direction": "lower", "format": ".2f",
     "description": "Cars owned per household. Published per neighbourhood rather than per 100 m, "
                    "so a hexagon takes a households-weighted average of the neighbourhoods it "
                    "overlaps and the map is blockier than the rest.",
     "source": "CBS neighbourhood statistics (NL)"},
]

for _metric in METRICS:
    _metric.setdefault("tier", "global")

# Metrics computed per hexagon (the rest belong to another layer, such as parks).
HEX_METRICS = [m for m in METRICS if m.get("layer", "hex") == "hex"]

METRIC_IDS = [m["id"] for m in HEX_METRICS]
LINK_METRIC_IDS = [m["id"] for m in METRICS if m.get("links")]
PARK_METRIC_IDS = [m["id"] for m in METRICS if m.get("layer") == "parks"]
GLOBAL_METRIC_IDS = [m["id"] for m in HEX_METRICS if m["tier"] == "global"]
