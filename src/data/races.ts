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
      { name: 'Cowes (RYS Line)', lat: 50.7966, lon: -1.3017, type: 'start' },
      { name: 'Gurnard Ledge', lat: 50.7563, lon: -1.4361, type: 'turn' },
      { name: 'Hamstead Ledge', lat: 50.7172, lon: -1.5487, type: 'turn' },
      { name: 'The Needles', lat: 50.6479, lon: -1.6431, type: 'turn' },
      { name: "St Catherine's Point", lat: 50.5314, lon: -1.3022, type: 'turn' },
      { name: 'Dunnose', lat: 50.5673, lon: -1.1158, type: 'turn' },
      { name: 'Bembridge Ledge Buoy', lat: 50.6611, lon: -1.0138, type: 'mark' },
      { name: "No Man's Land Fort", lat: 50.7494, lon: -1.0509, type: 'mark' },
      { name: 'Ryde Middle', lat: 50.7702, lon: -1.1418, type: 'turn' },
      { name: 'Cowes (Finish)', lat: 50.7966, lon: -1.3017, type: 'finish' },
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
      { name: 'Mid-Lake Michigan', lat: 43.5, lon: -87.0, type: 'turn' },
      { name: 'Manitou Passage', lat: 45.05, lon: -86.05, type: 'turn' },
      { name: "Gray's Reef Passage", lat: 45.77, lon: -85.5, type: 'mark' },
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
      { name: 'Grand Harbour, Valletta', lat: 35.9, lon: 14.52, type: 'start' },
      { name: 'Capo Passero', lat: 36.69, lon: 15.13, type: 'turn' },
      { name: 'Strait of Messina', lat: 38.27, lon: 15.65, type: 'turn' },
      { name: 'Stromboli', lat: 38.83, lon: 15.25, type: 'island' },
      { name: 'Favignana (Egadi Is.)', lat: 37.93, lon: 12.32, type: 'island' },
      { name: 'Pantelleria', lat: 36.84, lon: 11.95, type: 'island' },
      { name: 'Lampedusa', lat: 35.51, lon: 12.61, type: 'island' },
      { name: 'South Comino Channel', lat: 35.98, lon: 14.33, type: 'turn' },
      { name: 'Marsamxett (Finish)', lat: 35.9, lon: 14.51, type: 'finish' },
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
    unlockAfter: 'race-middle-sea',
    waypoints: [
      { name: 'Newport, RI (Start)', lat: 41.45, lon: -71.34, type: 'start' },
      { name: 'Gulf Stream', lat: 38.5, lon: -69.5, type: 'turn' },
      { name: 'Kitchen Shoals', lat: 32.46, lon: -64.65, type: 'mark' },
      { name: "St David's Lighthouse", lat: 32.36, lon: -64.65, type: 'finish' },
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
      { name: 'Cowes (RYS Line)', lat: 50.76, lon: -1.3, type: 'start' },
      { name: 'Portland Bill', lat: 50.51, lon: -2.46, type: 'turn' },
      { name: 'Start Point', lat: 50.22, lon: -3.65, type: 'turn' },
      { name: 'The Lizard', lat: 49.96, lon: -5.2, type: 'turn' },
      { name: "Land's End TSS", lat: 50.05, lon: -5.8, type: 'mark' },
      { name: 'Fastnet Rock', lat: 51.39, lon: -9.6, type: 'turn' },
      { name: 'Bishop Rock', lat: 49.87, lon: -6.45, type: 'mark' },
      { name: 'Cap de la Hague', lat: 49.72, lon: -1.94, type: 'turn' },
      { name: 'Cherbourg (Finish)', lat: 49.65, lon: -1.62, type: 'finish' },
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
    unlockAfter: 'race-fastnet',
    waypoints: [
      { name: 'Antigua (English Harbour)', lat: 17.0, lon: -61.75, type: 'start' },
      { name: 'Green Island', lat: 17.07, lon: -61.65, type: 'mark' },
      { name: 'Barbuda', lat: 17.55, lon: -61.85, type: 'island' },
      { name: 'Nevis', lat: 17.1, lon: -62.62, type: 'island' },
      { name: 'St Kitts', lat: 17.4, lon: -62.85, type: 'island' },
      { name: 'Saba', lat: 17.63, lon: -63.24, type: 'island' },
      { name: 'St Barthélemy', lat: 17.92, lon: -62.83, type: 'island' },
      { name: 'Tintamarre', lat: 18.12, lon: -62.98, type: 'island' },
      { name: 'Guadeloupe (Les Saintes)', lat: 15.85, lon: -61.6, type: 'island' },
      { name: 'Redonda', lat: 16.94, lon: -62.35, type: 'island' },
      { name: 'Antigua (Finish)', lat: 17.01, lon: -61.76, type: 'finish' },
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
    unlockAfter: 'race-caribbean-600',
    waypoints: [
      { name: 'Sydney Heads', lat: -33.83, lon: 151.28, type: 'start' },
      { name: 'NSW South Coast', lat: -36.5, lon: 150.3, type: 'turn' },
      { name: 'Bass Strait', lat: -39.5, lon: 149.5, type: 'turn' },
      { name: 'Tasman Island', lat: -43.24, lon: 148.0, type: 'turn' },
      { name: 'Storm Bay', lat: -43.1, lon: 147.55, type: 'turn' },
      { name: 'Iron Pot (Derwent)', lat: -43.05, lon: 147.42, type: 'mark' },
      { name: 'Hobart', lat: -42.89, lon: 147.34, type: 'finish' },
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
    unlockAfter: 'race-sydney-hobart',
    waypoints: [
      { name: 'Point Fermin (San Pedro)', lat: 33.7, lon: -118.29, type: 'start' },
      { name: 'Catalina Channel', lat: 33.3, lon: -118.5, type: 'turn' },
      { name: 'Mid-Pacific (Trades)', lat: 28.0, lon: -135.0, type: 'turn' },
      { name: 'NE Pacific Approach', lat: 23.0, lon: -150.0, type: 'turn' },
      { name: 'Diamond Head (Finish)', lat: 21.25, lon: -157.81, type: 'finish' },
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
      { name: 'Port Townsend, WA', lat: 48.11, lon: -122.76, type: 'start' },
      { name: 'Victoria, BC', lat: 48.42, lon: -123.37, type: 'turn' },
      { name: 'Seymour Narrows', lat: 50.14, lon: -125.35, type: 'turn' },
      { name: 'Cape Caution', lat: 51.16, lon: -127.79, type: 'turn' },
      { name: 'Bella Bella', lat: 52.16, lon: -128.14, type: 'mark' },
      { name: 'Dixon Entrance', lat: 54.3, lon: -130.7, type: 'turn' },
      { name: 'Ketchikan, AK', lat: 55.34, lon: -131.65, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 2400, prizeMoney: 20000, fleetSize: 16, paceTarget: 1.28 },
      pro: { entryFee: 5500, prizeMoney: 48000, fleetSize: 28, paceTarget: 1.06 },
    },
  },
];
