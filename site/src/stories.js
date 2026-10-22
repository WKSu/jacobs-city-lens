// The story told before each tab's indicators: Jacobs' idea, a scene from the
// book, and how the map counts it. City-specific scenes and the places to look
// at come from config/cities/<city>.yaml (city.story) so every city can tell
// its own version.

export const STORIES = {
  mixed_uses: {
    idea: "A district needs more than one main reason for people to be there, so that the streets are used at different times of day. With one use, the street is empty for part of the day, and the shops and cafés that need customers all day can't survive.",
    scene: "In lower Manhattan the financial district was packed at noon and deserted after five. On Hudson Street, by contrast, different people took over the same sidewalk in shifts: shopkeepers opening up, children walking to school, office workers at lunch, people coming home, the bar crowd at night.",
    chapter: 8,
    model: "day",
    counts: "On the map, each dot is one shop, office, café, school or other open place, coloured by the reason people come to it. Grey dots are addresses, mostly homes. Each hexagon's use mix summarises how evenly its places split across six kinds of use: 1 is a perfectly even split, 0 means one kind only.",
    honest: "A count of places is not a count of people, and the map can't show time of day yet. Overture also misses some places.",
  },
  short_blocks: {
    idea: "Long blocks keep people on separate paths. Short blocks give many routes between two points, so paths cross and mix, and a shop on a side street still sees people walking past.",
    scene: "On Manhattan's Upper West Side, blocks about 240 m long meant people living on one street hardly ever used the next one. Jacobs imagined cutting an extra street through the middle of each block and watched the separate paths mix.",
    chapter: 9,
    model: "grid",
    counts: "On the map, each street is coloured by its length between two corners, which is Jacobs' block length. Dots are intersections. Each hexagon counts its intersections per km² and takes the median street length.",
    honest: "Footpaths through green space make a street network look finely cut without bringing the street life Jacobs meant, so footpaths are counted separately (path intersections).",
  },
  aged_buildings: {
    idea: "A district needs buildings of many ages, including plenty of old, plain ones. Only old buildings have rents low enough for new and marginal businesses.",
    scene: "\"Old ideas can sometimes use new buildings. New ideas must use old buildings.\"",
    chapter: 10,
    model: null,
    counts: "Planned: construction years from the BAG building register, shown per building, with the spread of ages and the share built before 1945 per hexagon.",
    honest: "This chapter waits for BAG construction years, which the cloud build can't download yet.",
  },
  concentration: {
    idea: "A district needs enough people, residents included, to keep the shops and street life of the other three conditions going. Jacobs gave about 100 dwellings per acre as a rough floor, and warned not to confuse high density with overcrowding (too many people per room).",
    scene: "Planners called Boston's North End a slum because its buildings were packed so closely. When Jacobs visited, she found it healthy, safe and busy, and the district's health and crime figures agreed with her.",
    chapter: 11,
    model: "quiz",
    counts: "On the map, each dot is one address from the BAG register, mostly homes. Each hexagon divides its addresses by its land area. Building coverage is the share of land under buildings.",
    honest: "Addresses are not exactly dwellings, and a hexagon's gross hectare includes streets, unlike Jacobs' net acre.",
  },
  eyes: {
    idea: "A street is safe when people watch it without meaning to: shopkeepers, residents at their windows, people walking past. That needs buildings that face the street, and reasons for people to be on it.",
    scene: "From her window on Hudson Street, Jacobs saw a man trying to make a little girl go with him. The butcher's wife, the locksmith, the fruit seller and men from the bar all stepped out to watch. The man turned out to be the girl's father. Nobody was assigned to watch, but someone always was.",
    chapter: 2,
    model: "eyes",
    counts: "Zoom in and each street gets its own score. The model above uses the same three measures: street wall (how much of the street is lined by buildings), buildings fronting the street (the grain of doors and windows) and places along the street.",
    honest: "The data sees building footprints and places, not windows or doors that are actually used. Offices close at six.",
  },
  border_vacuums: {
    idea: "A large single use, such as a rail yard, a motorway, a campus or a big park, is a dead end for most people on foot. Few people cross it, so its edges get little through traffic, and the shops and life near those edges thin out.",
    scene: "Jacobs pointed to the streets along rail tracks, waterfronts, campuses and expressways, which so often lie quiet and run down, even right next to busy districts.",
    chapter: 14,
    model: "walk",
    counts: "Dashed outlines on the map are the border vacuums. Each hexagon gets its share of land inside one and its distance to the nearest edge. The chart further down counts places in 50 m bands away from each kind of edge.",
    honest: "Vacuums are detected from Overture land use and the street network, and some edges (a quiet canal, a lively park entrance) behave differently from others.",
  },
  parks: {
    idea: "A neighbourhood park doesn't bring its district to life. The district brings the park to life, with people around it for different reasons at different times of day.",
    scene: "Philadelphia had several squares of the same age and size. Rittenhouse Square, ringed by homes, shops, a church and offices, was used all day. Washington Square, ringed by offices, emptied outside working hours and became a haunt of the down-and-out.",
    chapter: 5,
    model: "day-park",
    counts: "Parks on the map are coloured by what surrounds them: the use mix and addresses within 400 m, and how much of the park's edge has buildings looking onto it.",
    honest: "A 400 m ring is a simple stand-in for a park's catchment, and the data can't see how a park is actually used.",
  },
};
