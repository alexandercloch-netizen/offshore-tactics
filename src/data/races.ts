import { Race } from '../types';

// A laddered roster of real-world offshore classics, from accessible
// club/Corinthian races up to elite ocean passages. Distances and course
// records are tuned for gameplay; waypoints are real public course geometry
// used to draw the chart and derive the point of sail along the track.
export const RACES: Race[] = [
  {
    id: 'race-round-island',
    name: 'Round the Island Race',
    location: 'Isle of Wight, England',
    description:
      'A 50-mile dash around the Isle of Wight against a fleet of over a thousand boats. The friendliest grand day out in sailing.',
    distanceNm: 50,
    difficulty: 'Inshore',
    recordTimeHours: 4,
    corinthianRating: 5,
    hazard: 'tidal_gate',
    hazardWaypoint: 'The Needles',
    prevailingWind: { fromDeg: 225, speedKn: 12 },
    signatureHazard: 'Tidal gate at The Needles — time it wrong and the fleet sails away from you.',
    season: 'June',
    // The Solent is tide-dominated: a semidiurnal stream setting roughly E on the
    // flood, running hardest at the Needles and the St Catherine's overfalls.
    // Validated fair in the standings (see current.test.ts) — both the player and
    // the fleet feel the same stream, so timing the gates is genuine tactics.
    tide: {
      floodDeg: 90,
      peakRateKn: 1.5,
      gates: [
        { waypoint: 'The Needles', gain: 0.5, radiusNm: 4 },
        { waypoint: "St Catherine's Point", gain: 0.4, radiusNm: 5 },
      ],
    },
    // Marks sit in navigable water and the rhumb legs between them clear the
    // drawn Isle of Wight coastline (validated against the full-res landmass),
    // so the course rounds the island instead of cutting across it. Clockwise
    // from the RYS line in the Solent, out west to the Needles, down the back of
    // the island past St Catherine's and Dunnose, then home up the eastern Solent.
    waypoints: [
      { name: 'Cowes (RYS Line)', lat: 50.7946, lon: -1.2835, type: 'start' },
      { name: 'Gurnard Ledge', lat: 50.7525, lon: -1.4024, type: 'turn' },
      { name: 'Hamstead Ledge', lat: 50.698, lon: -1.5741, type: 'turn' },
      { name: 'The Needles', lat: 50.6479, lon: -1.6431, type: 'turn' },
      { name: "St Catherine's Point", lat: 50.5314, lon: -1.3022, type: 'turn' },
      { name: 'Dunnose', lat: 50.5673, lon: -1.1158, type: 'turn' },
      { name: 'Bembridge Ledge Buoy', lat: 50.6611, lon: -1.0138, type: 'mark' },
      { name: "No Man's Land Fort", lat: 50.7494, lon: -1.0509, type: 'mark' },
      { name: 'Ryde Middle', lat: 50.7625, lon: -1.1316, type: 'turn' },
      { name: 'Cowes (Finish)', lat: 50.7946, lon: -1.2835, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 400, prizeMoney: 2500, fleetSize: 30, paceTarget: 1.3 },
      pro: { entryFee: 900, prizeMoney: 6000, fleetSize: 60, paceTarget: 1.08 },
    },
  },
  {
    id: 'race-chicago-mac',
    name: 'Chicago Yacht Club Race to Mackinac',
    location: 'Lake Michigan, USA',
    description:
      'The oldest annual freshwater distance race — 333 miles up Lake Michigan to Mackinac Island. No tides, but plenty of cunning.',
    distanceNm: 289,
    difficulty: 'Coastal',
    recordTimeHours: 23.5,
    corinthianRating: 5,
    hazard: 'light_air',
    hazardWaypoint: 'Mid-Lake Michigan',
    prevailingWind: { fromDeg: 200, speedKn: 10 },
    signatureHazard: 'Light-air "parking lots" and sudden Great Lakes squalls.',
    season: 'July',
    waypoints: [
      { name: 'Chicago Harbor Light', lat: 41.89, lon: -87.59, type: 'start' },
      { name: 'Mid-Lake Michigan', lat: 43.5, lon: -87, type: 'turn' },
      { name: 'Manitou Passage', lat: 45.05, lon: -86.05, type: 'turn' },
      { name: 'Manitou Passage approach 1', lat: 45.1363, lon: -86.0932, type: 'turn' },
      { name: 'Manitou Passage approach 2', lat: 45.3624, lon: -85.9443, type: 'turn' },
      { name: 'Manitou Passage approach 3', lat: 45.4783, lon: -85.8717, type: 'turn' },
      { name: 'Manitou Passage approach 4', lat: 45.795, lon: -85.5383, type: 'turn' },
      { name: "Gray's Reef Passage", lat: 45.7825, lon: -85.5, type: 'mark' },
      { name: 'Straits of Mackinac', lat: 45.82, lon: -84.9, type: 'turn' },
      { name: 'Mackinac Island', lat: 45.85, lon: -84.62, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 900, prizeMoney: 7000, fleetSize: 20, paceTarget: 1.28 },
      pro: { entryFee: 2200, prizeMoney: 16000, fleetSize: 40, paceTarget: 1.07 },
    },
  },
  {
    id: 'race-middle-sea',
    name: 'Rolex Middle Sea Race',
    location: 'Malta, around Sicily',
    description:
      'A spectacular 606-mile lap of Sicily, past the smoking cone of Stromboli. Scenic, demanding and beloved by Corinthian crews.',
    distanceNm: 606,
    difficulty: 'Offshore',
    recordTimeHours: 33,
    corinthianRating: 4,
    hazard: 'med_fickle',
    hazardWaypoint: 'Strait of Messina',
    prevailingWind: { fromDeg: 315, speedKn: 14 },
    signatureHazard: 'Fickle Mediterranean winds and the current through the Strait of Messina.',
    season: 'October',
    unlockAfter: 'race-chicago-mac',
    // The Med is all but tideless — except the Strait of Messina, where a real
    // tidal stream runs hard (the Scylla & Charybdis of legend). A low base rate
    // with a strong, localised gate at the strait, so only Messina bites.
    tide: {
      floodDeg: 0, // the strait's stream sets ~N on the flood
      peakRateKn: 0.3,
      gates: [{ waypoint: 'Strait of Messina', gain: 0.6, radiusNm: 16 }],
    },
    waypoints: [
      { name: 'Grand Harbour, Valletta', lat: 35.9177, lon: 14.5366, type: 'start' },
      { name: 'Grand Harbour, Valletta approach 1', lat: 36.6774, lon: 15.1594, type: 'turn' },
      { name: 'Capo Passero', lat: 36.7039, lon: 15.1539, type: 'turn' },
      { name: 'Capo Passero approach 1', lat: 37.026, lon: 15.3544, type: 'turn' },
      { name: 'Capo Passero approach 2', lat: 38.2308, lon: 15.6135, type: 'turn' },
      { name: 'Strait of Messina', lat: 38.2676, lon: 15.6742, type: 'turn' },
      { name: 'Stromboli', lat: 38.83, lon: 15.25, type: 'island' },
      { name: 'Stromboli approach 1', lat: 38.1867, lon: 12.6948, type: 'turn' },
      { name: 'Stromboli approach 2', lat: 38.182, lon: 12.6901, type: 'turn' },
      { name: 'Stromboli approach 3', lat: 37.9528, lon: 12.3575, type: 'turn' },
      { name: 'Stromboli approach 4', lat: 37.9216, lon: 12.3935, type: 'turn' },
      { name: 'Stromboli approach 5', lat: 37.8944, lon: 12.3487, type: 'turn' },
      { name: 'Stromboli approach 6', lat: 37.9015, lon: 12.3198, type: 'turn' },
      { name: 'Favignana (Egadi Is.)', lat: 37.9011, lon: 12.322, type: 'island' },
      { name: 'Pantelleria', lat: 36.8606, lon: 11.9417, type: 'island' },
      { name: 'Pantelleria approach 1', lat: 36.8265, lon: 11.8968, type: 'turn' },
      { name: 'Pantelleria approach 2', lat: 36.8136, lon: 11.9, type: 'turn' },
      { name: 'Lampedusa', lat: 35.5358, lon: 12.61, type: 'island' },
      { name: 'South Comino Channel', lat: 35.9857, lon: 14.3043, type: 'turn' },
      { name: 'South Comino Channel approach 1', lat: 35.9534, lon: 14.3042, type: 'turn' },
      { name: 'South Comino Channel approach 2', lat: 35.8521, lon: 14.3379, type: 'turn' },
      { name: 'South Comino Channel approach 3', lat: 35.7871, lon: 14.4935, type: 'turn' },
      { name: 'South Comino Channel approach 4', lat: 35.8088, lon: 14.5606, type: 'turn' },
      { name: 'South Comino Channel approach 5', lat: 35.8815, lon: 14.5857, type: 'turn' },
      { name: 'Marsamxett (Finish)', lat: 35.9173, lon: 14.5367, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 1800, prizeMoney: 14000, fleetSize: 14, paceTarget: 1.26 },
      pro: { entryFee: 4200, prizeMoney: 32000, fleetSize: 26, paceTarget: 1.06 },
    },
  },
  {
    id: 'race-newport-bermuda',
    name: 'Newport Bermuda Race',
    location: 'Newport, RI → Bermuda',
    description:
      'The "Thrash to the Onion Patch" — 635 miles across the Gulf Stream to Bermuda. A dedicated Corinthian division keeps it accessible.',
    distanceNm: 635,
    difficulty: 'Offshore',
    recordTimeHours: 34,
    corinthianRating: 4,
    hazard: 'gulf_stream',
    hazardWaypoint: 'Gulf Stream',
    prevailingWind: { fromDeg: 225, speedKn: 15 },
    signatureHazard: 'Reading the Gulf Stream eddies — find a fair meander or fight a foul current.',
    season: 'June (biennial)',
    // The Gulf Stream: a persistent, non-reversing current setting ENE across the
    // rhumb to Bermuda — the race's defining tactical problem. A weak general
    // offshore drift everywhere, intensified into a strong band at the Stream
    // crossing (the gate). No shelf tide out here.
    tide: {
      floodDeg: 60,
      peakRateKn: 0,
      driftDeg: 60,
      driftKn: 0.6,
      gates: [{ waypoint: 'Gulf Stream', gain: 3.0, radiusNm: 80 }],
    },
    unlockAfter: 'race-middle-sea',
    waypoints: [
      { name: 'Newport, RI (Start)', lat: 41.4386, lon: -71.3432, type: 'start' },
      { name: 'Gulf Stream', lat: 38.5, lon: -69.5, type: 'turn' },
      { name: 'Kitchen Shoals', lat: 32.46, lon: -64.65, type: 'mark' },
      { name: "St David's Lighthouse", lat: 32.3746, lon: -64.6302, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 2200, prizeMoney: 18000, fleetSize: 16, paceTarget: 1.27 },
      pro: { entryFee: 5200, prizeMoney: 40000, fleetSize: 30, paceTarget: 1.06 },
    },
  },
  {
    id: 'race-fastnet',
    name: 'Rolex Fastnet Race',
    location: 'Cowes → Fastnet Rock → Cherbourg',
    description:
      "The world's largest offshore race — 695 miles out to the Fastnet Rock and back across the Channel. Prestige and punishment in equal measure.",
    distanceNm: 695,
    difficulty: 'Offshore',
    recordTimeHours: 44,
    corinthianRating: 3,
    hazard: 'celtic_weather',
    hazardWaypoint: 'Fastnet Rock',
    prevailingWind: { fromDeg: 240, speedKn: 18 },
    signatureHazard: 'Brutal Celtic Sea weather and tidal gates the whole way to the Rock.',
    season: 'July / August',
    // The English Channel and its approaches are strongly tidal: the stream sets
    // ENE up-Channel on the flood, running hardest at the Portland tidal race and
    // the Alderney Race off Cap de la Hague. Generous gate radii so the spread-out
    // fleet feels the same streams the player does (it stays fair in the standings).
    tide: {
      floodDeg: 75,
      peakRateKn: 1.1,
      gates: [
        { waypoint: 'Portland Bill', gain: 1.0, radiusNm: 12 },
        { waypoint: 'Cap de la Hague', gain: 1.2, radiusNm: 14 },
      ],
    },
    unlockAfter: 'race-newport-bermuda',
    waypoints: [
      { name: 'Cowes (RYS Line)', lat: 50.7876, lon: -1.2901, type: 'start' },
      { name: 'Cowes approach 1', lat: 50.7542, lon: -1.4016, type: 'turn' },
      { name: 'Cowes approach 2', lat: 50.7382, lon: -1.507, type: 'turn' },
      { name: 'Cowes approach 3', lat: 50.699, lon: -1.5585, type: 'turn' },
      { name: 'Cowes approach 4', lat: 50.5774, lon: -2.039, type: 'turn' },
      { name: 'Portland Bill', lat: 50.5084, lon: -2.4591, type: 'turn' },
      { name: 'Start Point', lat: 50.209, lon: -3.6279, type: 'turn' },
      { name: 'The Lizard', lat: 49.9428, lon: -5.2076, type: 'turn' },
      { name: "Land's End TSS", lat: 50.05, lon: -5.8, type: 'mark' },
      { name: 'Fastnet Rock', lat: 51.39, lon: -9.6, type: 'turn' },
      { name: 'Bishop Rock', lat: 49.87, lon: -6.45, type: 'mark' },
      { name: 'Cap de la Hague', lat: 49.728, lon: -1.9667, type: 'turn' },
      { name: 'Cap de la Hague approach 1', lat: 49.7043, lon: -1.6787, type: 'turn' },
      { name: 'Cherbourg (Finish)', lat: 49.673, lon: -1.5893, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 2800, prizeMoney: 26000, fleetSize: 20, paceTarget: 1.25 },
      pro: { entryFee: 6500, prizeMoney: 60000, fleetSize: 40, paceTarget: 1.05 },
    },
  },
  {
    id: 'race-caribbean-600',
    name: 'RORC Caribbean 600',
    location: 'Antigua, around 11 islands',
    description:
      'A fast, warm 600-mile sprint weaving around eleven Caribbean islands. Festive on the dock, ferocious in the acceleration zones.',
    distanceNm: 600,
    difficulty: 'Offshore',
    recordTimeHours: 33,
    corinthianRating: 3,
    hazard: 'island_accel',
    hazardWaypoint: 'Saba',
    prevailingWind: { fromDeg: 75, speedKn: 18 },
    signatureHazard: 'Island acceleration zones — big gusts funnelling between the headlands.',
    season: 'February',
    // The Caribbean Current sets WNW through the islands at ~0.6 kn, with a light
    // tidal stream squeezing between the headlands (hardest in the Saba channel).
    tide: {
      floodDeg: 290,
      peakRateKn: 0.3,
      driftDeg: 290,
      driftKn: 0.6,
      gates: [{ waypoint: 'Saba', gain: 0.8, radiusNm: 12 }],
    },
    unlockAfter: 'race-fastnet',
    waypoints: [
      { name: 'Antigua (English Harbour)', lat: 16.9799, lon: -61.7539, type: 'start' },
      { name: 'Antigua approach 1', lat: 16.9709, lon: -61.722, type: 'turn' },
      { name: 'Green Island', lat: 17.0718, lon: -61.6461, type: 'mark' },
      { name: 'Barbuda', lat: 17.55, lon: -61.85, type: 'island' },
      { name: 'Barbuda approach 1', lat: 17.0845, lon: -62.5643, type: 'turn' },
      { name: 'Nevis', lat: 17.0926, lon: -62.6256, type: 'island' },
      { name: 'Nevis approach 1', lat: 17.3749, lon: -62.8821, type: 'turn' },
      { name: 'St Kitts', lat: 17.4178, lon: -62.8612, type: 'island' },
      { name: 'St Kitts approach 1', lat: 17.5614, lon: -63.0264, type: 'turn' },
      { name: 'Saba', lat: 17.6594, lon: -63.2258, type: 'island' },
      { name: 'Saba approach 1', lat: 17.9473, lon: -62.8618, type: 'turn' },
      { name: 'St Barthélemy', lat: 17.9417, lon: -62.83, type: 'island' },
      { name: 'Tintamarre', lat: 18.12, lon: -62.98, type: 'island' },
      { name: 'Tintamarre approach 1', lat: 17.0884, lon: -62.4083, type: 'turn' },
      { name: 'Tintamarre approach 2', lat: 16.3884, lon: -61.8083, type: 'turn' },
      { name: 'Tintamarre approach 3', lat: 16.0884, lon: -61.7916, type: 'turn' },
      { name: 'Tintamarre approach 4', lat: 15.9293, lon: -61.6923, type: 'turn' },
      { name: 'Guadeloupe (Les Saintes)', lat: 15.8452, lon: -61.5952, type: 'island' },
      { name: 'Guadeloupe approach 1', lat: 16.1218, lon: -61.8616, type: 'turn' },
      { name: 'Guadeloupe approach 2', lat: 16.7551, lon: -62.2616, type: 'turn' },
      { name: 'Redonda', lat: 16.94, lon: -62.35, type: 'island' },
      { name: 'Antigua (Finish)', lat: 16.9899, lon: -61.7675, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 2600, prizeMoney: 24000, fleetSize: 12, paceTarget: 1.24 },
      pro: { entryFee: 6000, prizeMoney: 55000, fleetSize: 24, paceTarget: 1.05 },
    },
  },
  {
    id: 'race-sydney-hobart',
    name: 'Rolex Sydney Hobart',
    location: 'Sydney → Hobart, Australia',
    description:
      'The Boxing Day classic — 628 miles south across Bass Strait to Hobart. One of the toughest tests in ocean racing.',
    distanceNm: 628,
    difficulty: 'Ocean',
    recordTimeHours: 33.25,
    corinthianRating: 2,
    hazard: 'bass_strait',
    hazardWaypoint: 'Bass Strait',
    prevailingWind: { fromDeg: 30, speedKn: 16 },
    signatureHazard: 'Bass Strait storms and the dreaded "southerly buster".',
    season: 'December',
    // The East Australian Current sweeps south down the NSW coast (~1.2 kn — a big
    // gain if you ride it offshore), then Bass Strait adds a strong oscillating
    // tidal stream. The current never reverses; the Strait tide does.
    tide: {
      floodDeg: 280,
      peakRateKn: 0.7,
      driftDeg: 195,
      driftKn: 1.2,
      gates: [
        { waypoint: 'NSW South Coast', gain: 0.8, radiusNm: 70 },
        { waypoint: 'Bass Strait', gain: 1.0, radiusNm: 45 },
      ],
    },
    unlockAfter: 'race-caribbean-600',
    waypoints: [
      { name: 'Sydney Heads', lat: -33.8487, lon: 151.3068, type: 'start' },
      { name: 'Sydney Heads approach 1', lat: -33.9227, lon: 151.3314, type: 'turn' },
      { name: 'NSW South Coast', lat: -36.5, lon: 150.3, type: 'turn' },
      { name: 'Bass Strait', lat: -39.5, lon: 149.5, type: 'turn' },
      { name: 'Tasman Island', lat: -43.2405, lon: 148.0009, type: 'turn' },
      { name: 'Tasman Island approach 1', lat: -43.259, lon: 147.781, type: 'turn' },
      { name: 'Storm Bay', lat: -43.1, lon: 147.55, type: 'turn' },
      { name: 'Iron Pot (Derwent)', lat: -43.0507, lon: 147.4205, type: 'mark' },
      { name: 'Iron Pot approach 1', lat: -42.875, lon: 147.3585, type: 'turn' },
      { name: 'Hobart', lat: -42.877, lon: 147.3625, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 3200, prizeMoney: 34000, fleetSize: 16, paceTarget: 1.23 },
      pro: { entryFee: 7500, prizeMoney: 78000, fleetSize: 30, paceTarget: 1.04 },
    },
  },
  {
    id: 'race-transpac',
    name: 'Transpac',
    location: 'Los Angeles → Honolulu',
    description:
      'The 2,225-mile downwind "sleigh ride" to Hawaii. Position the Pacific High right and surf the trades all the way to Diamond Head.',
    distanceNm: 2225,
    difficulty: 'Ocean',
    recordTimeHours: 130,
    corinthianRating: 2,
    hazard: 'doldrums',
    hazardWaypoint: 'Mid-Pacific (Trades)',
    prevailingWind: { fromDeg: 45, speedKn: 16 },
    signatureHazard: 'Routing around the Pacific High — too close and you park, too far and you sail extra miles.',
    season: 'July',
    // A gentle westerly set across the Pacific toward Hawaii — the North Pacific
    // drift under the trades. Light (this is a wind race), but there to read.
    tide: {
      floodDeg: 250,
      peakRateKn: 0,
      driftDeg: 250,
      driftKn: 0.4,
    },
    unlockAfter: 'race-sydney-hobart',
    waypoints: [
      { name: 'Point Fermin (San Pedro)', lat: 33.7, lon: -118.29, type: 'start' },
      { name: 'Point Fermin approach 1', lat: 33.3099, lon: -118.2759, type: 'turn' },
      { name: 'Catalina Channel', lat: 33.3, lon: -118.5, type: 'turn' },
      { name: 'Mid-Pacific (Trades)', lat: 28, lon: -135, type: 'turn' },
      { name: 'NE Pacific Approach', lat: 23, lon: -150, type: 'turn' },
      { name: 'Diamond Head (Finish)', lat: 21.2375, lon: -157.8056, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 5000, prizeMoney: 60000, fleetSize: 14, paceTarget: 1.22 },
      pro: { entryFee: 11000, prizeMoney: 130000, fleetSize: 26, paceTarget: 1.04 },
    },
  },
  {
    id: 'race-r2ak',
    name: 'Race to Alaska',
    location: 'Port Townsend, WA → Ketchikan, AK',
    description:
      'The "R2AK" — 750 engineless miles up the Inside Passage. Wind, oars and grit only; first to the $10,000 nailed to a tree wins, second takes a set of steak knives.',
    distanceNm: 710,
    difficulty: 'Offshore',
    recordTimeHours: 90,
    corinthianRating: 2,
    hazard: 'tidal_rapids',
    hazardWaypoint: 'Seymour Narrows',
    prevailingWind: { fromDeg: 315, speedKn: 12 },
    signatureHazard:
      'Seymour Narrows runs at up to 16 knots of tide — hit the slack-water gate or anchor in place.',
    season: 'June',
    unlockAfter: 'race-transpac',
    // The Inside Passage is intensely tidal. A steady base stream through the
    // channels, with a fierce gate at Seymour Narrows (the signature hazard) and a
    // lesser one at the exposed Dixon Entrance. Generous radii keep it fair across
    // the spread-out fleet.
    tide: {
      floodDeg: 135, // floods SE down the passage
      peakRateKn: 0.5,
      gates: [
        { waypoint: 'Seymour Narrows', gain: 1.2, radiusNm: 10 },
        { waypoint: 'Dixon Entrance', gain: 0.4, radiusNm: 14 },
      ],
    },
    waypoints: [
      { name: 'Port Townsend, WA', lat: 48.1223, lon: -122.7128, type: 'start' },
      { name: 'Port Townsend, WA approach 1', lat: 48.1502, lon: -122.7652, type: 'turn' },
      { name: 'Victoria, BC', lat: 48.4, lon: -123.3852, type: 'turn' },
      { name: 'Victoria, BC approach 1', lat: 48.3874, lon: -123.3473, type: 'turn' },
      { name: 'Victoria, BC approach 2', lat: 48.4327, lon: -123.2292, type: 'turn' },
      { name: 'Victoria, BC approach 3', lat: 48.5504, lon: -123.3056, type: 'turn' },
      { name: 'Victoria, BC approach 4', lat: 48.6623, lon: -123.3447, type: 'turn' },
      { name: 'Victoria, BC approach 5', lat: 48.7956, lon: -123.3727, type: 'turn' },
      { name: 'Victoria, BC approach 6', lat: 48.9068, lon: -123.4917, type: 'turn' },
      { name: 'Victoria, BC approach 7', lat: 49.0544, lon: -123.7156, type: 'turn' },
      { name: 'Victoria, BC approach 8', lat: 49.1264, lon: -123.7481, type: 'turn' },
      { name: 'Victoria, BC approach 9', lat: 49.121, lon: -123.6923, type: 'turn' },
      { name: 'Victoria, BC approach 10', lat: 49.1481, lon: -123.6872, type: 'turn' },
      { name: 'Victoria, BC approach 11', lat: 49.1505, lon: -123.6925, type: 'turn' },
      { name: 'Victoria, BC approach 12', lat: 49.1502, lon: -123.6916, type: 'turn' },
      { name: 'Victoria, BC approach 13', lat: 49.7289, lon: -124.3614, type: 'turn' },
      { name: 'Victoria, BC approach 14', lat: 49.9806, lon: -125.1556, type: 'turn' },
      { name: 'Victoria, BC approach 15', lat: 50.1263, lon: -125.323, type: 'turn' },
      { name: 'Seymour Narrows', lat: 50.1261, lon: -125.3223, type: 'turn' },
      { name: 'Seymour Narrows approach 1', lat: 50.1367, lon: -125.3327, type: 'turn' },
      { name: 'Seymour Narrows approach 2', lat: 50.3409, lon: -125.4477, type: 'turn' },
      { name: 'Seymour Narrows approach 3', lat: 50.3594, lon: -125.5123, type: 'turn' },
      { name: 'Seymour Narrows approach 4', lat: 50.3768, lon: -125.5827, type: 'turn' },
      { name: 'Seymour Narrows approach 5', lat: 50.3768, lon: -125.7911, type: 'turn' },
      { name: 'Seymour Narrows approach 6', lat: 50.4927, lon: -126.279, type: 'turn' },
      { name: 'Seymour Narrows approach 7', lat: 50.5223, lon: -126.6151, type: 'turn' },
      { name: 'Seymour Narrows approach 8', lat: 50.9927, lon: -127.529, type: 'turn' },
      { name: 'Cape Caution', lat: 51.1541, lon: -127.795, type: 'turn' },
      { name: 'Cape Caution approach 1', lat: 51.5031, lon: -128.1431, type: 'turn' },
      { name: 'Cape Caution approach 2', lat: 51.8621, lon: -128.2784, type: 'turn' },
      { name: 'Cape Caution approach 3', lat: 52.1155, lon: -128.1232, type: 'turn' },
      { name: 'Bella Bella', lat: 52.1675, lon: -128.123, type: 'mark' },
      { name: 'Bella Bella approach 1', lat: 52.2032, lon: -128.1411, type: 'turn' },
      { name: 'Bella Bella approach 2', lat: 52.2635, lon: -128.3679, type: 'turn' },
      { name: 'Bella Bella approach 3', lat: 52.2635, lon: -129.1012, type: 'turn' },
      { name: 'Bella Bella approach 4', lat: 53.5588, lon: -130.5708, type: 'turn' },
      { name: 'Bella Bella approach 5', lat: 53.8799, lon: -130.7554, type: 'turn' },
      { name: 'Bella Bella approach 6', lat: 54.1659, lon: -130.6334, type: 'turn' },
      { name: 'Dixon Entrance', lat: 54.3, lon: -130.7, type: 'turn' },
      { name: 'Dixon Entrance approach 1', lat: 54.4303, lon: -130.9174, type: 'turn' },
      { name: 'Dixon Entrance approach 2', lat: 54.5619, lon: -131.1323, type: 'turn' },
      { name: 'Dixon Entrance approach 3', lat: 55.0032, lon: -131.6428, type: 'turn' },
      { name: 'Dixon Entrance approach 4', lat: 55.3091, lon: -131.6022, type: 'turn' },
      { name: 'Ketchikan, AK', lat: 55.3176, lon: -131.6205, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 2400, prizeMoney: 20000, fleetSize: 16, paceTarget: 1.28 },
      pro: { entryFee: 5500, prizeMoney: 48000, fleetSize: 28, paceTarget: 1.06 },
    },
  },
];
