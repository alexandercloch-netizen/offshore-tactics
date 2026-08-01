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
    // NOTE: the sailed waypoint geometry is ~60 nm (courseLengthNm) while this reads
    // 50 (the event's real distance). The player's progress already runs on the
    // geometric length (initialProgress), so the mismatch only over-counts the
    // benchmark's wear-per-mile a touch — the race is TUNED around that today, and
    // correcting it to 60 re-paces the fleet faster (a rebalance, not a pure fix).
    // Left at 50 for this pass and EXEMPTED in racePlausibility; revisit with a
    // proper round-island re-tune (the impactful distance bugs — caribbean, r2ak —
    // are corrected below).
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
    // so the course rounds the island instead of cutting across it. Anti-clockwise
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
    recordTimeHours: 40,
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
    // The real RORC event is 600 nm; our simplified 11-island track covers ~461 nm
    // (courseLengthNm). distanceNm follows the sailed geometry so the progress
    // fraction is honest — a mismatch put the boat at "77% covered" from the gun.
    // A full-length waypoint set to reach the real 600 nm is a content follow-up.
    distanceNm: 461,
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
    // Sailed waypoint geometry ≈ 616 nm (the real event is ~750); distanceNm tracks
    // the geometry so the progress fraction stays honest (race-plausibility guard).
    distanceNm: 616,
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
      // Seymour Narrows runs to ~16 kn in reality; the game streams are gentle,
      // but the vetting found the gate too weak to make the slack-water timing —
      // and the inside route — actually matter. Bumped to a race-meaningful level:
      // a stronger base stream and a much fiercer Seymour gate, so the signature
      // gate bites. (~0.8 × (1 + 2.4) ≈ 2.7 kn at the centre.) Validated fair in
      // the standings — both player and fleet feel the same stream.
      peakRateKn: 0.8,
      gates: [
        { waypoint: 'Seymour Narrows', gain: 2.4, radiusNm: 10 },
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

  // -------------------------------------------------------------------------
  // Home-port classics — the races the local fleets actually sail out of each
  // home port, one per port. All always open (no unlockAfter): these are the
  // club races you can enter the day you arrive, alongside the ladder.
  // -------------------------------------------------------------------------
  {
    id: 'race-cowes-dinard',
    name: 'Cowes–Dinard–St Malo Race',
    location: 'Cowes → St Malo, France',
    description:
      'The oldest offshore race still sailed (est. 1906) — 151 miles from the Squadron line, across the Channel and down through the Channel Islands to St Malo. Tschüss 2 set the course record of 10h 56m in 2023.',
    distanceNm: 151,
    difficulty: 'Coastal',
    recordTimeHours: 11,
    corinthianRating: 4,
    hazard: 'tidal_gate',
    hazardWaypoint: 'Alderney Race',
    prevailingWind: { fromDeg: 225, speedKn: 14 },
    signatureHazard:
      'The Alderney Race — the hardest-running tidal gate in the Channel. Carry it fair or crawl against it.',
    season: 'July',
    // The Channel flood sets ENE (the Fastnet pattern), running hardest through
    // the Alderney Race between Cap de la Hague and the island — the race's
    // signature gate, and the reason the Channel crossing is a tide sum first
    // and a wind call second.
    tide: {
      floodDeg: 75,
      peakRateKn: 1.0,
      gates: [{ waypoint: 'Alderney Race', gain: 1.4, radiusNm: 12 }],
    },
    waypoints: [
      { name: 'Cowes (RYS Line)', lat: 50.7946, lon: -1.2835, type: 'start' },
      { name: 'Gurnard Ledge', lat: 50.7525, lon: -1.4024, type: 'turn' },
      { name: 'Hamstead Ledge', lat: 50.698, lon: -1.5741, type: 'turn' },
      { name: 'Needles Fairway', lat: 50.63, lon: -1.7, type: 'turn' },
      { name: 'Mid-Channel', lat: 50.2, lon: -1.9, type: 'turn' },
      { name: 'Alderney Race', lat: 49.71, lon: -2.02, type: 'turn' },
      { name: 'Les Hanois approach 1', lat: 49.55, lon: -2.65, type: 'turn' },
      { name: 'Les Hanois', lat: 49.42, lon: -2.76, type: 'turn' },
      { name: 'St Malo (Le Grand Jardin)', lat: 48.668, lon: -2.083, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 600, prizeMoney: 4500, fleetSize: 24, paceTarget: 1.29 },
      pro: { entryFee: 1500, prizeMoney: 10500, fleetSize: 44, paceTarget: 1.07 },
    },
  },
  {
    id: 'race-tri-state',
    name: 'Tri-State Regatta',
    location: 'Chicago → St. Joseph, Michigan',
    description:
      'The Labor Day weekend classic, sailed for over seventy years — the Friday-dusk overnight diagonal across southern Lake Michigan from Chicago to St. Joseph. Short, sociable, and famous for shutting down after sunset.',
    distanceNm: 51,
    difficulty: 'Inshore',
    recordTimeHours: 7,
    corinthianRating: 5,
    hazard: 'light_air',
    hazardWaypoint: 'Mid-Lake Michigan',
    prevailingWind: { fromDeg: 190, speedKn: 9 },
    signatureHazard:
      'The evening lake shutdown — the breeze goes home with the sun, mid-crossing, every year.',
    season: 'September',
    waypoints: [
      { name: 'Chicago Harbor Light', lat: 41.89, lon: -87.59, type: 'start' },
      { name: 'Mid-Lake Michigan', lat: 42.0, lon: -87.05, type: 'turn' },
      { name: 'St. Joseph, MI (Finish)', lat: 42.11, lon: -86.52, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 300, prizeMoney: 2000, fleetSize: 28, paceTarget: 1.3 },
      pro: { entryFee: 700, prizeMoney: 4800, fleetSize: 52, paceTarget: 1.08 },
    },
  },
  {
    id: 'race-malta-syracuse',
    name: 'Malta–Syracuse Race',
    location: 'Valletta → Siracusa, Sicily',
    description:
      "The Mediterranean's oldest offshore race (est. 1952) — 80 miles out of Marsamxett Harbour, overnight across the Malta Channel to the ancient harbour of Siracusa. A fickle-air sprint the Maltese fleet sails every July.",
    distanceNm: 80,
    difficulty: 'Coastal',
    recordTimeHours: 9,
    corinthianRating: 4,
    hazard: 'med_fickle',
    hazardWaypoint: 'Capo Murro di Porco',
    prevailingWind: { fromDeg: 315, speedKn: 10 },
    signatureHazard:
      'The night crossing dies under the Sicilian shore — and Capo Murro di Porco casts a wind shadow over the last miles.',
    season: 'July',
    waypoints: [
      { name: 'Marsamxett Harbour', lat: 35.915, lon: 14.518, type: 'start' },
      { name: 'Malta Channel', lat: 36.35, lon: 14.9, type: 'turn' },
      { name: 'Capo Murro di Porco', lat: 37.0, lon: 15.36, type: 'turn' },
      { name: 'Siracusa (Finish)', lat: 37.045, lon: 15.315, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 400, prizeMoney: 2800, fleetSize: 20, paceTarget: 1.3 },
      pro: { entryFee: 950, prizeMoney: 6500, fleetSize: 38, paceTarget: 1.08 },
    },
  },
  {
    id: 'race-annapolis-newport',
    name: 'Annapolis to Newport Race',
    location: 'Annapolis → Newport, RI',
    description:
      'The 475-mile East Coast passage race: a light-air, current-riddled prologue down Chesapeake Bay, the parking lot at the capes, then open Atlantic past Montauk to the Castle Hill finish. Warrior set the record of 40h 14m in 2019.',
    distanceNm: 475,
    difficulty: 'Offshore',
    recordTimeHours: 40,
    corinthianRating: 4,
    hazard: 'light_air',
    hazardWaypoint: 'Cape Henry',
    prevailingWind: { fromDeg: 210, speedKn: 11 },
    signatureHazard:
      'The Chesapeake bay-mouth parking lot — a hundred miles of bay tactics decided in one glassy morning at Cape Henry.',
    season: 'June (biennial)',
    // The Chesapeake is a current race before it's a wind race: an oscillating
    // bay tide (flooding N up the bay) over a gentle net outflow, running
    // hardest where the whole bay drains past Cape Henry. Offshore the drift
    // fades into the mid-Atlantic Bight's weak southerly set.
    tide: {
      floodDeg: 355,
      peakRateKn: 0.5,
      driftDeg: 170,
      driftKn: 0.25,
      gates: [{ waypoint: 'Cape Henry', gain: 1.2, radiusNm: 10 }],
    },
    waypoints: [
      { name: 'Annapolis (Start)', lat: 38.95, lon: -76.41, type: 'start' },
      { name: 'Bloody Point', lat: 38.83, lon: -76.4, type: 'turn' },
      { name: 'Sharps Island Light', lat: 38.64, lon: -76.38, type: 'turn' },
      { name: 'Point No Point', lat: 38.13, lon: -76.3, type: 'turn' },
      { name: 'Smith Point Light', lat: 37.9, lon: -76.1, type: 'turn' },
      { name: 'Wolf Trap Light', lat: 37.39, lon: -76.19, type: 'turn' },
      { name: 'Cape Henry', lat: 36.96, lon: -76.0, type: 'turn' },
      { name: 'Chesapeake Light', lat: 36.91, lon: -75.71, type: 'mark' },
      { name: 'Montauk Point', lat: 41.02, lon: -71.8, type: 'turn' },
      { name: 'Block Island (SE)', lat: 41.15, lon: -71.46, type: 'turn' },
      { name: 'Castle Hill (Newport Finish)', lat: 41.4386, lon: -71.3432, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 1500, prizeMoney: 12000, fleetSize: 16, paceTarget: 1.27 },
      pro: { entryFee: 3600, prizeMoney: 28000, fleetSize: 30, paceTarget: 1.06 },
    },
  },
  {
    id: 'race-antigua-360',
    name: 'Antigua 360 Race',
    location: 'Antigua, one lap',
    description:
      "A single flat-out lap of Antigua from English Harbour — 48 miles of trade-wind reaching, reef-dodging and one long gamble in the island's lee. Leopard 3 holds the record at 3h 32m.",
    distanceNm: 48,
    difficulty: 'Inshore',
    recordTimeHours: 3.5,
    corinthianRating: 4,
    hazard: 'island_lee',
    hazardWaypoint: 'Boon Point',
    prevailingWind: { fromDeg: 80, speedKn: 16 },
    signatureHazard:
      "The lee of Antigua — the west coast is the short road home, and it's dead in the island's wind shadow.",
    season: 'February',
    waypoints: [
      { name: 'Antigua (English Harbour)', lat: 16.9799, lon: -61.7539, type: 'start' },
      { name: 'Green Island', lat: 17.0718, lon: -61.6461, type: 'mark' },
      { name: 'Great Bird Island', lat: 17.18, lon: -61.68, type: 'turn' },
      { name: 'Prickly Pear Island', lat: 17.2, lon: -61.79, type: 'turn' },
      { name: 'Boon Point', lat: 17.2, lon: -61.87, type: 'turn' },
      { name: 'Pearns Point', lat: 17.02, lon: -61.93, type: 'turn' },
      { name: 'Cades Reef', lat: 16.95, lon: -61.89, type: 'turn' },
      { name: 'Antigua (Finish)', lat: 16.9899, lon: -61.7675, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 350, prizeMoney: 2400, fleetSize: 18, paceTarget: 1.3 },
      pro: { entryFee: 800, prizeMoney: 5500, fleetSize: 34, paceTarget: 1.08 },
    },
  },
  {
    id: 'race-cabbage-tree',
    name: 'Cabbage Tree Island Race',
    location: 'Sydney → Cabbage Tree Island → Sydney',
    description:
      'The CYCA\'s 172-mile Hobart qualifier: out of the Heads, north up the NSW coast against the East Australian Current, round Cabbage Tree Island off Port Stephens in the dark, and home to Watsons Bay. Andoo Comanche set the record of 12h 19m in 2022.',
    distanceNm: 172,
    difficulty: 'Coastal',
    recordTimeHours: 12.3,
    corinthianRating: 4,
    hazard: 'eac_coastal',
    hazardWaypoint: 'Norah Head',
    prevailingWind: { fromDeg: 45, speedKn: 14 },
    signatureHazard:
      'The East Australian Current pours south against the northbound fleet — how hard you hug the coast to cheat it decides the race.',
    season: 'November',
    // The EAC sets south down the NSW coast (~1 kn) — foul all the way north to
    // Cabbage Tree, fair on the run home — over a light coastal tide. The same
    // stream Sydney–Hobart rides south is the enemy here: the inversion is the
    // whole tactical problem.
    tide: {
      floodDeg: 280,
      peakRateKn: 0.3,
      driftDeg: 195,
      driftKn: 0.9,
    },
    waypoints: [
      { name: 'Point Piper (Start)', lat: -33.862, lon: 151.27, type: 'start' },
      { name: 'Sydney Heads', lat: -33.8487, lon: 151.3068, type: 'turn' },
      { name: 'Long Reef', lat: -33.73, lon: 151.35, type: 'turn' },
      { name: 'Norah Head', lat: -33.29, lon: 151.63, type: 'turn' },
      { name: 'Newcastle Bight', lat: -32.9, lon: 152.05, type: 'turn' },
      { name: 'Cabbage Tree Island', lat: -32.695, lon: 152.245, type: 'island' },
      { name: 'Newcastle Bight (Return)', lat: -32.95, lon: 152.1, type: 'turn' },
      { name: 'Norah Head (Return)', lat: -33.32, lon: 151.66, type: 'turn' },
      { name: 'Long Reef (Return)', lat: -33.75, lon: 151.38, type: 'turn' },
      { name: 'Watsons Bay (Finish)', lat: -33.848, lon: 151.28, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 700, prizeMoney: 5200, fleetSize: 20, paceTarget: 1.28 },
      pro: { entryFee: 1700, prizeMoney: 12000, fleetSize: 38, paceTarget: 1.07 },
    },
  },
  {
    id: 'race-islands-race',
    name: 'Islands Race',
    location: 'Los Angeles → San Diego, via the islands',
    description:
      'The Southern California winter overnighter — 142 miles from the LA start, seaward of Catalina and San Clemente islands, to the Point Loma finish off San Diego. Sailed in the dark, in the lees, in February.',
    distanceNm: 142,
    difficulty: 'Coastal',
    recordTimeHours: 13,
    corinthianRating: 4,
    hazard: 'island_lee',
    hazardWaypoint: 'Catalina West End',
    prevailingWind: { fromDeg: 290, speedKn: 9 },
    signatureHazard:
      "Catalina's lee at night — the gradient dies with the sun and the island's shadow lies across the short road south.",
    season: 'February',
    waypoints: [
      { name: 'Point Fermin (Start)', lat: 33.7, lon: -118.29, type: 'start' },
      { name: 'Catalina West End', lat: 33.5, lon: -118.64, type: 'turn' },
      { name: 'Catalina Windward Side', lat: 33.32, lon: -118.5, type: 'turn' },
      { name: 'San Clemente Island (West)', lat: 32.92, lon: -118.68, type: 'turn' },
      { name: 'Pyramid Head', lat: 32.76, lon: -118.36, type: 'turn' },
      { name: 'Point Loma (Finish)', lat: 32.66, lon: -117.26, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 500, prizeMoney: 3600, fleetSize: 18, paceTarget: 1.29 },
      pro: { entryFee: 1200, prizeMoney: 8500, fleetSize: 34, paceTarget: 1.07 },
    },
  },
  {
    id: 'race-swiftsure',
    name: 'Swiftsure International Yacht Race',
    location: 'Victoria, BC → Swiftsure Bank → Victoria',
    description:
      'The Pacific Northwest\'s crown jewel since 1930 — the Lightship Classic: 138 miles from Clover Point, west down the Strait of Juan de Fuca, round Swiftsure Bank at the open Pacific\'s edge, and back east to Victoria. Fog, ships, and a tide that owns the strait.',
    distanceNm: 138,
    difficulty: 'Coastal',
    recordTimeHours: 16,
    corinthianRating: 4,
    hazard: 'strait_fog',
    hazardWaypoint: 'Swiftsure Bank',
    prevailingWind: { fromDeg: 255, speedKn: 12 },
    signatureHazard:
      'Rounding Swiftsure Bank in fog, with the ebb about to turn against the westerly and stand the strait on end.',
    season: 'May',
    // The Strait of Juan de Fuca floods ENE and ebbs hard out to sea, squeezing
    // to a race at Race Rocks and boiling over the shallows of Swiftsure Bank —
    // the ebb-gate timing at the Bank is the race.
    tide: {
      floodDeg: 75,
      peakRateKn: 1.0,
      gates: [
        { waypoint: 'Race Rocks', gain: 1.4, radiusNm: 8 },
        { waypoint: 'Swiftsure Bank', gain: 0.7, radiusNm: 12 },
      ],
    },
    waypoints: [
      { name: 'Clover Point (Start)', lat: 48.395, lon: -123.343, type: 'start' },
      { name: 'Race Rocks', lat: 48.28, lon: -123.54, type: 'turn' },
      { name: 'Strait of Juan de Fuca', lat: 48.3, lon: -123.95, type: 'turn' },
      { name: 'Juan de Fuca Entrance', lat: 48.47, lon: -124.67, type: 'turn' },
      { name: 'Swiftsure Bank', lat: 48.55, lon: -125.0, type: 'turn' },
      { name: 'Strait of Juan de Fuca (Return)', lat: 48.28, lon: -124.1, type: 'turn' },
      { name: 'Race Passage (Return)', lat: 48.27, lon: -123.55, type: 'turn' },
      { name: 'Victoria (Finish)', lat: 48.405, lon: -123.385, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 550, prizeMoney: 3800, fleetSize: 24, paceTarget: 1.29 },
      pro: { entryFee: 1300, prizeMoney: 9000, fleetSize: 46, paceTarget: 1.07 },
    },
  },
  {
    id: 'race-giraglia',
    name: 'Rolex Giraglia',
    location: 'Saint-Tropez → Giraglia Rock → Genoa',
    description:
      'The Mediterranean classic: out of the gulf of Saint-Tropez, across the Ligurian Sea to the lonely Giraglia rock off Cap Corse, then north to Genoa — chasing a breeze that dies at dusk and fills from somewhere new at dawn.',
    distanceNm: 208,
    difficulty: 'Coastal',
    recordTimeHours: 15,
    corinthianRating: 4,
    hazard: 'med_fickle',
    hazardWaypoint: 'Giraglia Rock',
    prevailingWind: { fromDeg: 250, speedKn: 10 },
    signatureHazard:
      'The rounding at the Giraglia at nightfall — the sea breeze quits, and whoever reads the new gradient first sails away.',
    season: 'June',
    unlockAfter: 'race-malta-syracuse',
    waypoints: [
      { name: 'Saint-Tropez (Start)', lat: 43.27, lon: 6.66, type: 'start' },
      { name: 'Cap Camarat offing', lat: 43.17, lon: 6.75, type: 'turn' },
      { name: 'Ligurian Sea', lat: 43.05, lon: 8.1, type: 'turn' },
      { name: 'Giraglia Rock', lat: 43.05, lon: 9.42, type: 'island' },
      { name: 'Ligurian approach', lat: 43.9, lon: 9.05, type: 'turn' },
      { name: 'Genoa (Finish)', lat: 44.38, lon: 8.92, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 900, prizeMoney: 7000, fleetSize: 26, paceTarget: 1.28 },
      pro: { entryFee: 2000, prizeMoney: 16000, fleetSize: 50, paceTarget: 1.06 },
    },
  },
  {
    id: 'race-sydney-goldcoast',
    name: 'Sydney to Gold Coast',
    location: 'Sydney → Southport, Australia',
    description:
      'The winter classic north: out of the Heads and 380 miles up the NSW coast to the Gold Coast, with the East Australian Current running hard against you the whole way. Inshore for relief or offshore for breeze — pick your poison.',
    distanceNm: 386,
    difficulty: 'Offshore',
    recordTimeHours: 26,
    corinthianRating: 3,
    hazard: 'eac_coastal',
    hazardWaypoint: 'Smoky Cape',
    prevailingWind: { fromDeg: 225, speedKn: 15 },
    signatureHazard:
      'The EAC line at Smoky Cape — hug the beach out of the current and risk the holes, or take the south-setting river offshore for pressure.',
    season: 'July',
    unlockAfter: 'race-cabbage-tree',
    // The East Australian Current: a steady south-setting river offshore of the
    // rhumb line — foul the whole way north, which IS the race.
    tide: {
      floodDeg: 0,
      peakRateKn: 0,
      driftDeg: 200,
      driftKn: 0.7,
    },
    waypoints: [
      { name: 'Sydney Heads (Start)', lat: -33.83, lon: 151.3, type: 'start' },
      { name: 'Broken Bay offing', lat: -33.5, lon: 151.46, type: 'turn' },
      { name: 'Port Stephens offing', lat: -32.68, lon: 152.32, type: 'turn' },
      { name: 'Smoky Cape', lat: -30.9, lon: 153.15, type: 'turn' },
      { name: 'Cape Byron offing', lat: -28.6, lon: 153.75, type: 'turn' },
      { name: 'Southport (Finish)', lat: -27.94, lon: 153.44, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 850, prizeMoney: 6500, fleetSize: 22, paceTarget: 1.27 },
      pro: { entryFee: 1900, prizeMoney: 15000, fleetSize: 42, paceTarget: 1.06 },
    },
  },
  {
    id: 'race-china-sea',
    name: 'China Sea Race',
    location: 'Hong Kong → Subic Bay, Philippines',
    description:
      "Asia's blue-water classic since 1962: 565 miles across the South China Sea on the dying northeast monsoon, dodging fishing fleets by night and squall lines by day, to a finish under the palms of Subic Bay.",
    distanceNm: 572,
    difficulty: 'Offshore',
    recordTimeHours: 47,
    corinthianRating: 3,
    hazard: 'monsoon_squall',
    hazardWaypoint: 'Mid-Channel (South China Sea)',
    prevailingWind: { fromDeg: 60, speedKn: 14 },
    signatureHazard:
      'The mid-channel squall line — forty knots and blinding rain on its face, a glassy hole behind it, and the fleet split by who carried sail.',
    season: 'April',
    unlockAfter: 'race-sydney-hobart',
    waypoints: [
      { name: 'Victoria Harbour (Start)', lat: 22.28, lon: 114.22, type: 'start' },
      { name: 'Tathong Channel', lat: 22.22, lon: 114.3, type: 'turn' },
      { name: 'Lema Channel offing', lat: 21.9, lon: 114.75, type: 'turn' },
      { name: 'Mid-Channel (South China Sea)', lat: 19.8, lon: 116.9, type: 'turn' },
      { name: 'Luzon approach', lat: 16.6, lon: 119.3, type: 'turn' },
      { name: 'Capones Island', lat: 14.92, lon: 120.02, type: 'island' },
      { name: 'Subic Bay (Finish)', lat: 14.82, lon: 120.27, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 1100, prizeMoney: 9000, fleetSize: 18, paceTarget: 1.26 },
      pro: { entryFee: 2400, prizeMoney: 20000, fleetSize: 34, paceTarget: 1.06 },
    },
  },
  {
    id: 'race-cape2rio',
    name: 'Cape to Rio',
    location: 'Cape Town → Rio de Janeiro',
    description:
      'The great South Atlantic crossing: 3,300 miles from Table Mountain to Sugarloaf. Ride the Benguela north, pick your moment to cut the corner of the South Atlantic High, then surf the southeast trades all the way to Brazil.',
    distanceNm: 3363,
    difficulty: 'Ocean',
    recordTimeHours: 252,
    corinthianRating: 2,
    hazard: 'ocean_high',
    hazardWaypoint: 'High Gate',
    prevailingWind: { fromDeg: 150, speedKn: 15 },
    signatureHazard:
      'The South Atlantic High — arc wide round the ridge with pressure all the road, or gamble the shorter line through its glassy heart.',
    season: 'January',
    unlockAfter: 'race-transpac',
    // The Benguela current sets north-west up the African coast, then the South
    // Equatorial drift carries you toward Brazil — a fair push most of the way.
    tide: {
      floodDeg: 0,
      peakRateKn: 0,
      driftDeg: 290,
      driftKn: 0.3,
    },
    waypoints: [
      { name: 'Table Bay (Start)', lat: -33.88, lon: 18.38, type: 'start' },
      { name: 'Atlantic offing', lat: -33.2, lon: 15.5, type: 'turn' },
      { name: 'High Gate', lat: -30.0, lon: 5.0, type: 'turn' },
      { name: 'Trindade offing', lat: -25.5, lon: -15.0, type: 'turn' },
      { name: 'Cabo Frio offing', lat: -23.6, lon: -35.0, type: 'turn' },
      { name: 'Rio de Janeiro (Finish)', lat: -23.0, lon: -43.15, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 3200, prizeMoney: 32000, fleetSize: 14, paceTarget: 1.24 },
      pro: { entryFee: 6500, prizeMoney: 70000, fleetSize: 24, paceTarget: 1.05 },
    },
  },
  {
    id: 'race-bayview-mac',
    name: 'Bayview Mackinac Race',
    location: 'Port Huron → Mackinac Island, Lake Huron',
    description:
      'The other Mac: 204 miles up Lake Huron from Port Huron to the same finish line off Mission Point. Fresh water, no tide, and a lake that can serve champagne sailing and a parking lot in the same afternoon.',
    distanceNm: 207,
    difficulty: 'Coastal',
    recordTimeHours: 21,
    corinthianRating: 5,
    hazard: 'light_air',
    hazardWaypoint: 'Thunder Bay offing',
    prevailingWind: { fromDeg: 225, speedKn: 10 },
    signatureHazard:
      'The evening glass-off north of Thunder Bay — the lake shuts down at dusk, and the boats that found the night land breeze are gone by dawn.',
    season: 'July',
    waypoints: [
      { name: 'Port Huron (Start)', lat: 43.05, lon: -82.41, type: 'start' },
      { name: 'Lexington offing', lat: 43.4, lon: -82.4, type: 'turn' },
      { name: 'Harbor Beach offing', lat: 43.85, lon: -82.55, type: 'turn' },
      { name: 'Pointe aux Barques', lat: 44.15, lon: -82.85, type: 'turn' },
      { name: 'Thunder Bay offing', lat: 45.0, lon: -83.2, type: 'turn' },
      { name: 'Presque Isle offing', lat: 45.4, lon: -83.4, type: 'turn' },
      { name: 'Bois Blanc approach', lat: 45.78, lon: -84.35, type: 'turn' },
      { name: 'Mackinac Island (Finish)', lat: 45.85, lon: -84.6, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 500, prizeMoney: 3500, fleetSize: 28, paceTarget: 1.3 },
      pro: { entryFee: 1100, prizeMoney: 8000, fleetSize: 52, paceTarget: 1.08 },
    },
  },
  {
    id: 'race-van-isle',
    name: 'Van Isle 360',
    location: 'Round Vancouver Island, Canada',
    description:
      'The great lap of Vancouver Island: threading the rapids of the inside passage, rounding the surf-swept top at Cape Scott, then running the wild Pacific coast to a finish under Victoria\'s lights — a race with two entirely different oceans in it.',
    distanceNm: 504,
    difficulty: 'Offshore',
    recordTimeHours: 70,
    corinthianRating: 2,
    hazard: 'tidal_rapids',
    hazardWaypoint: 'Seymour Narrows',
    prevailingWind: { fromDeg: 305, speedKn: 12 },
    signatureHazard:
      'Seymour Narrows again — but this time with the whole west coast of the island waiting on the other side.',
    season: 'June',
    unlockAfter: 'race-swiftsure',
    // The inside passage is tide-dominated: the stream funnels hard through
    // Discovery Passage at Seymour Narrows; the outside coast feels the Pacific.
    tide: {
      floodDeg: 135, // floods SE down Discovery Passage — same water, same convention as r2ak
      peakRateKn: 1.1,
      gates: [{ waypoint: 'Seymour Narrows', gain: 2.0, radiusNm: 5 }],
    },
    waypoints: [
      { name: 'Nanaimo (Start)', lat: 49.17, lon: -123.93, type: 'start' },
      { name: 'Ballenas offing', lat: 49.36, lon: -124.2, type: 'turn' },
      { name: 'Cape Mudge', lat: 49.98, lon: -125.18, type: 'turn' },
      { name: 'Seymour Narrows', lat: 50.13, lon: -125.35, type: 'turn' },
      // The Johnstone Strait channel chain reuses R2AK's proven marks — the same
      // drawn channels, threaded by the same coordinates the land audit blesses.
      { name: 'Chatham Point', lat: 50.3409, lon: -125.4477, type: 'turn' },
      { name: 'Kelsey Bay', lat: 50.3594, lon: -125.5123, type: 'turn' },
      { name: 'Hardwicke Island', lat: 50.3768, lon: -125.5827, type: 'turn' },
      { name: 'Johnstone Strait', lat: 50.3768, lon: -125.7911, type: 'turn' },
      { name: 'Robson Bight', lat: 50.4927, lon: -126.279, type: 'turn' },
      { name: 'Alert Bay', lat: 50.5223, lon: -126.6151, type: 'turn' },
      { name: 'Goletas Channel', lat: 50.9927, lon: -127.529, type: 'turn' },
      { name: 'Shushartie Bay offing', lat: 50.88, lon: -127.86, type: 'turn' },
      { name: 'Cape Sutil offing', lat: 50.9, lon: -128.07, type: 'turn' },
      { name: 'Cape Scott', lat: 50.82, lon: -128.5, type: 'turn' },
      { name: 'Brooks Peninsula offing', lat: 50.0, lon: -128.35, type: 'turn' },
      { name: 'Estevan Point offing', lat: 49.15, lon: -126.95, type: 'turn' },
      { name: 'Barkley Sound offing', lat: 48.6, lon: -125.55, type: 'turn' },
      { name: 'Race Rocks (Return)', lat: 48.28, lon: -123.54, type: 'turn' },
      { name: 'Victoria (Finish)', lat: 48.4, lon: -123.36, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 1200, prizeMoney: 9500, fleetSize: 16, paceTarget: 1.26 },
      pro: { entryFee: 2600, prizeMoney: 21000, fleetSize: 30, paceTarget: 1.06 },
    },
  },
  {
    id: 'race-ensenada',
    name: 'Newport to Ensenada',
    location: 'Newport Beach → Ensenada, Mexico',
    description:
      'The biggest little ocean race in the world: 125 miles down the California coast into Mexico, famous for margarita finishes and infamous for the midnight hole off the Coronados that has swallowed whole fleets.',
    distanceNm: 128,
    difficulty: 'Coastal',
    recordTimeHours: 8,
    corinthianRating: 5,
    hazard: 'island_lee',
    hazardWaypoint: 'Islas Coronados',
    prevailingWind: { fromDeg: 310, speedKn: 10 },
    signatureHazard:
      'The Coronados at midnight — inside for the rhumb line and the island lee, or offshore where the gradient survives the night.',
    season: 'April',
    waypoints: [
      { name: 'Newport Beach (Start)', lat: 33.59, lon: -117.9, type: 'start' },
      { name: 'Dana Point offing', lat: 33.35, lon: -117.75, type: 'turn' },
      { name: 'San Diego offing', lat: 32.6, lon: -117.45, type: 'turn' },
      { name: 'Islas Coronados', lat: 32.35, lon: -117.4, type: 'island' },
      { name: 'Ensenada (Finish)', lat: 31.86, lon: -116.63, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 350, prizeMoney: 2500, fleetSize: 32, paceTarget: 1.32 },
      pro: { entryFee: 800, prizeMoney: 5500, fleetSize: 60, paceTarget: 1.09 },
    },
  },
  {
    id: 'race-block-island',
    name: 'Block Island Race',
    location: 'Stamford → Block Island → Stamford',
    description:
      'The Memorial Day classic: 186 miles down Long Island Sound, out through the tide-race at The Race, round Block Island and home. Two passes through one of the hardest-running tidal gates on the US east coast.',
    distanceNm: 183,
    difficulty: 'Coastal',
    recordTimeHours: 14,
    corinthianRating: 4,
    hazard: 'tidal_gate',
    hazardWaypoint: 'The Race',
    prevailingWind: { fromDeg: 225, speedKn: 11 },
    signatureHazard:
      'The Race at full ebb — four knots of fair tide if you time it, a standing wall of foul water if you miss.',
    season: 'May',
    // Long Island Sound floods west; the stream funnels ferociously through The
    // Race at the Sound's eastern gate — the same water, twice.
    tide: {
      floodDeg: 255,
      peakRateKn: 1.2,
      gates: [{ waypoint: 'The Race', gain: 1.5, radiusNm: 4 }],
    },
    waypoints: [
      { name: 'Stamford (Start)', lat: 41.0, lon: -73.52, type: 'start' },
      { name: 'Stratford Shoal', lat: 41.06, lon: -73.1, type: 'turn' },
      { name: 'Plum Island offing', lat: 41.2, lon: -72.25, type: 'turn' },
      { name: 'The Race', lat: 41.23, lon: -72.05, type: 'turn' },
      { name: 'Block Island (South)', lat: 41.1, lon: -71.55, type: 'island' },
      { name: 'The Race (Return)', lat: 41.24, lon: -72.07, type: 'turn' },
      { name: 'Middle Ground', lat: 41.07, lon: -73.0, type: 'turn' },
      { name: 'Stamford (Finish)', lat: 41.01, lon: -73.51, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 450, prizeMoney: 3200, fleetSize: 26, paceTarget: 1.3 },
      pro: { entryFee: 1000, prizeMoney: 7500, fleetSize: 48, paceTarget: 1.08 },
    },
  },
  {
    id: 'race-faerder',
    name: 'Færder Race',
    location: 'Oslofjord, Norway',
    description:
      "Norway's midsummer madness: a thousand boats pour down the Oslofjord on a June evening, round the Færder lighthouse in the small hours of a night that never gets dark, and beat home to Horten on whatever the fjord deigns to serve.",
    distanceNm: 71,
    difficulty: 'Coastal',
    recordTimeHours: 7,
    corinthianRating: 5,
    hazard: 'light_air',
    hazardWaypoint: 'Færder Lighthouse',
    prevailingWind: { fromDeg: 190, speedKn: 8 },
    signatureHazard:
      'The pre-dawn calm at the lighthouse — the fjord breeze dies with the light, and the fleet anchors against the current or ghosts on private zephyrs.',
    season: 'June',
    waypoints: [
      { name: 'Steilene (Start)', lat: 59.82, lon: 10.6, type: 'start' },
      { name: 'Drøbak Sound', lat: 59.66, lon: 10.61, type: 'turn' },
      { name: 'Filtvet', lat: 59.57, lon: 10.63, type: 'turn' },
      { name: 'Bastøy offing', lat: 59.32, lon: 10.55, type: 'turn' },
      { name: 'Færder Lighthouse', lat: 59.03, lon: 10.52, type: 'island' },
      { name: 'Bolærne offing', lat: 59.22, lon: 10.55, type: 'turn' },
      { name: 'Horten (Finish)', lat: 59.42, lon: 10.5, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 300, prizeMoney: 2200, fleetSize: 34, paceTarget: 1.32 },
      pro: { entryFee: 700, prizeMoney: 5000, fleetSize: 60, paceTarget: 1.09 },
    },
  },
  {
    id: 'race-marion-bermuda',
    name: 'Marion to Bermuda',
    location: 'Marion, MA → St. David\'s Head, Bermuda',
    description:
      'The cruising sailor\'s Bermuda race: 645 miles from Buzzards Bay across the Gulf Stream to the Onion Patch, sailed shorthanded and celestial-friendly — a gentler flag, the same unforgiving piece of ocean.',
    distanceNm: 645,
    difficulty: 'Offshore',
    recordTimeHours: 64,
    corinthianRating: 3,
    hazard: 'gulf_stream',
    hazardWaypoint: 'Gulf Stream Crossing',
    prevailingWind: { fromDeg: 230, speedKn: 13 },
    signatureHazard:
      'The Stream entry — cross square for the shortest wet ride, or buy a favourable meander with miles you may never get back.',
    season: 'June',
    unlockAfter: 'race-annapolis-newport',
    // The Gulf Stream sets hard ENE across the course's middle third.
    tide: {
      floodDeg: 0,
      peakRateKn: 0,
      driftDeg: 65,
      driftKn: 0.6,
      gates: [{ waypoint: 'Gulf Stream Crossing', gain: 1.0, radiusNm: 60 }],
    },
    waypoints: [
      { name: 'Marion (Start)', lat: 41.69, lon: -70.75, type: 'start' },
      { name: 'Buzzards Bay exit', lat: 41.42, lon: -71.02, type: 'turn' },
      { name: 'Continental Shelf', lat: 40.2, lon: -69.9, type: 'turn' },
      { name: 'Gulf Stream Crossing', lat: 38.5, lon: -68.3, type: 'turn' },
      { name: 'Sargasso approach', lat: 35.5, lon: -66.3, type: 'turn' },
      { name: 'St. David\'s Head (Finish)', lat: 32.37, lon: -64.65, type: 'finish' },
    ],
    divisions: {
      corinthian: { entryFee: 1300, prizeMoney: 10000, fleetSize: 18, paceTarget: 1.27 },
      pro: { entryFee: 2800, prizeMoney: 22000, fleetSize: 32, paceTarget: 1.06 },
    },
  },
];
