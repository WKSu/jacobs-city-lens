// The story told in each tab: Jacobs' claim, a scene from the book, how it
// works, whether the data can see it, and (tests.js) what the city shows.
// City-specific scenes and the places to look at come from
// config/cities/<city>.yaml (city.story) so every city can tell its own version.
//
// fit: "good" when the data measures what Jacobs meant, "proxy" when it sees
// only part of it or a stand-in, "none" when it can't see it at all.
// lead: the map layer to open with, when it is not the first in the registry.

export const FIT_LABEL = {
  good: "The data sees this well",
  proxy: "The data sees part of it",
  none: "The data can't see this",
};

export const STORIES = {
  mixed_uses: {
    idea: "A district needs more than one main reason for people to be there, so that the streets are used at different times of day. With one use, the street is empty for part of the day, and the shops and cafés that need customers all day can't survive.",
    scene: "In lower Manhattan the financial district was packed at noon and deserted after five. On Hudson Street, by contrast, different people took over the same sidewalk in shifts: shopkeepers opening up, children walking to school, office workers at lunch, people coming home, the bar crowd at night.",
    chapter: 8,
    model: "day",
    lead: "bag_use_mix",
    fit: "proxy",
    measure: "The building register records what every unit is legally for (home, office, shop, school and so on) and how big it is, so the mix of floor area is a good picture of the primary uses Jacobs meant. What it can't show is the point of the mix: people on the street at different hours. That part is described here in words.",
    counts: "On the map, each dot is one shop, office, café, school or other open place, coloured by the reason people come to it. Grey dots are addresses, mostly homes. Each hexagon's use mix summarises how evenly its places split across six kinds of use: 1 is a perfectly even split, 0 means one kind only.",
    honest: "A count of places is not a count of people, and the map can't show time of day yet. Overture also misses some places.",
  },
  short_blocks: {
    idea: "Long blocks keep people on separate paths. Short blocks give many routes between two points, so paths cross and mix, and a shop on a side street still sees people walking past.",
    scene: "On Manhattan's Upper West Side, blocks about 240 m long meant people living on one street hardly ever used the next one. Jacobs imagined cutting an extra street through the middle of each block and watched the separate paths mix.",
    chapter: 9,
    model: "grid",
    lead: "intersection_density",
    fit: "proxy",
    measure: "Corners per km² is a fair count of how many routes a neighbourhood offers. Block length alone misleads in Rotterdam: Ommoord's streets between two corners are as short as Oude Noorden's, but they loop and end, so there are far fewer corners. The data can't see whether people actually take different routes.",
    counts: "On the map, each street is coloured by its length between two corners, which is Jacobs' block length. Dots are intersections. Each hexagon counts its intersections per km² and takes the median street length.",
    honest: "Footpaths through green space make a street network look finely cut without bringing the street life Jacobs meant, so footpaths are counted separately (path intersections).",
  },
  aged_buildings: {
    idea: "A district needs buildings of many ages, including plenty of old, plain ones. Only old buildings have rents low enough for new and marginal businesses.",
    scene: "\"Old ideas can sometimes use new buildings. New ideas must use old buildings.\"",
    chapter: 10,
    model: "rents",
    lead: "age_diversity",
    fit: "proxy",
    measure: "The building register gives the construction year of every unit, so the mix of ages is measured well. Jacobs cared about age because of rent, and rents are not in the data. The spread of home values is the nearest stand-in.",
    counts: "Each hexagon's age mix says how evenly its homes and other units spread across six construction periods, from before 1900 to after 2010. Built before 1945 is the share of units that survived the 1940 bombing and later clearances.",
    honest: "Home values are not rents, and much of Rotterdam's old housing is renovated or social housing.",
  },
  concentration: {
    idea: "A district needs enough people, residents included, to keep the shops and street life of the other three conditions going. Jacobs gave about 100 dwellings per acre as a rough floor, and warned not to confuse high density with overcrowding (too many people per room).",
    scene: "Planners called Boston's North End a slum because its buildings were packed so closely. When Jacobs visited, she found it healthy, safe and busy, and the district's health and crime figures agreed with her.",
    chapter: 11,
    model: "quiz",
    lead: "dwellings_per_net_ha",
    fit: "good",
    measure: "The building register counts every home, so homes per hectare of building land comes close to Jacobs' own measure. Her warning not to confuse density with overcrowding can be checked too: residents per hectare sits next to it.",
    counts: "On the map, each dot is one address from the BAG register, mostly homes. Each hexagon divides its addresses by its land area. Building coverage is the share of land under buildings.",
    honest: "Addresses are not exactly dwellings, and a hexagon's gross hectare includes streets, unlike Jacobs' net acre.",
  },
  eyes: {
    idea: "A street is safe when people watch it without meaning to: shopkeepers, residents at their windows, people walking past. That needs buildings that face the street, and reasons for people to be on it.",
    scene: "From her window on Hudson Street, Jacobs saw a man trying to make a little girl go with him. The butcher's wife, the locksmith, the fruit seller and men from the bar all stepped out to watch. The man turned out to be the girl's father. Nobody was assigned to watch, but someone always was.",
    chapter: 2,
    model: "eyes",
    lead: "frontage_share",
    fit: "proxy",
    measure: "The data sees building fronts: how much of each street is lined by buildings, how many buildings face it, and how many front doors (address locations) open onto it. It can't see windows that are used, people who are there, or whether the street is safe.",
    counts: "The map opens on the street wall, the share of each street lined by buildings. The eyes score averages street wall, buildings and front doors; shops are shown separately, because whether they make a street safer is disputed. The score ranks neighbourhoods much like each of its parts does, so the simplest one comes first. Zoom in and each street gets its own values.",
    honest: "The data sees building footprints and places, not windows or doors that are actually used. Offices close at six.",
  },
  border_vacuums: {
    idea: "A large single use, such as a rail yard, a motorway, a campus or a big park, is a dead end for most people on foot. Few people cross it, so its edges get little through traffic, and the shops and life near those edges thin out.",
    scene: "Jacobs pointed to the streets along rail tracks, waterfronts, campuses and expressways, which so often lie quiet and run down, even right next to busy districts.",
    chapter: 14,
    model: "walk",
    fit: "proxy",
    measure: "Rail lines, motorways, big parks and superblocks are easy to find on the map, and so is the distance from their edges. Jacobs' mechanism, that few people cross them on foot, is not in the data.",
    counts: "Dashed outlines on the map are the border vacuums. Each hexagon gets its share of land inside one and its distance to the nearest edge. The chart further down counts places in 50 m bands away from each kind of edge.",
    honest: "Vacuums are detected from Overture land use and the street network, and some edges (a quiet canal, a lively park entrance) behave differently from others.",
  },
  parks: {
    idea: "A neighbourhood park doesn't bring its district to life. The district brings the park to life, with people around it for different reasons at different times of day.",
    scene: "Philadelphia had several squares of the same age and size. Rittenhouse Square, ringed by homes, shops, a church and offices, was used all day. Washington Square, ringed by offices, emptied outside working hours and became a haunt of the down-and-out.",
    chapter: 5,
    model: "day-park",
    fit: "none",
    measure: "The map can describe what surrounds a park, but it can't see how much the park is used, which was Jacobs' whole test of a park.",
    counts: "Parks on the map are coloured by what surrounds them: the use mix and addresses within 400 m, and how much of the park's edge has buildings looking onto it.",
    honest: "A 400 m ring is a simple stand-in for a park's catchment, and the data can't see how a park is actually used.",
  },
  cars: {
    idea: "Cars and cities can coexist, but each concession to traffic, a wider road, a bigger car park, makes walking a little worse. Fewer people walk, so the case for the next concession grows. Jacobs called it erosion.",
    scene: "Jacobs described streets widened bit by bit, pavements narrowed, a block cleared for parking, until the street was a road and the walkers had gone. She proposed the reverse, attrition: give space back to people a little at a time and watch whether traffic finds other ways.",
    chapter: 18,
    model: null,
    lead: "car_space_share",
    fit: "proxy",
    measure: "The large-scale base map (BGT) shows how today's street space divides between carriageway and parking on one side and pavements and cycle paths on the other. It is a snapshot, so it can't show the erosion over time that Jacobs wrote about.",
    counts: "Each hexagon gets the share of its paved public space given to cars, the share given to walking, and the average number of cars per household in its neighbourhood.",
    honest: "Car ownership is published per neighbourhood, not per hexagon, so it is smoothed.",
  },
  together: {
    idea: "Jacobs insisted that the four conditions only work together. Mixed uses without enough people, or density without short blocks and old buildings, would not do. All four together make a district where people are around at all hours, for many reasons.",
    scene: "\"The necessity for these four conditions is the most important point this book has to make.\"",
    chapter: 7,
    model: null,
    fit: "proxy",
    measure: "Each hexagon gets one point for each condition where it is in the top 40% of Rotterdam: mix of uses, corners, mix of building ages and homes per hectare. The count goes from 0 to 4. It says nothing about whether the street is actually lively; that is described, not measured.",
    counts: "The map shows how many of the four conditions each hexagon meets. Hexagons with very little land, or missing one of the four measures, are left blank.",
    honest: "The top 40% is a line drawn relative to Rotterdam, not one Jacobs drew. A city where nothing is dense would still have a top 40%.",
  },
};
