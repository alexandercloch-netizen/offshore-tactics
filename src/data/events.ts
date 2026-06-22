import { GameEvent, HazardKey } from '../types';
import { rnd, rndPick } from '../engine/rng';

// ---------------------------------------------------------------------------
// Generic tactical events — can appear in any race.
// ---------------------------------------------------------------------------
export const GENERIC_EVENTS: GameEvent[] = [
  {
    id: 'evt-windshift',
    title: 'Wind Shift Ahead',
    prompt:
      'The navigator spots a header building on the next stretch. Do you tack onto the lift or hold your lane and bank the distance?',
    kind: 'tactical',
    pointOfSail: 'Upwind',
    choices: [
      {
        id: 'evt-windshift-tack',
        label: 'Tack onto the shift',
        description: 'Commit to the new breeze and gain hard miles — if it holds.',
        timeDelta: -0.6,
        staminaDelta: -6,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.3,
      },
      {
        id: 'evt-windshift-hold',
        label: 'Hold your lane',
        description: 'Play it safe and keep the boat in clear air.',
        timeDelta: 0.2,
        staminaDelta: -1,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.05,
      },
    ],
  },
  {
    id: 'evt-spinnaker',
    title: 'Spinnaker Call',
    prompt:
      'The breeze has come aft. Hoist the big kite for downwind speed, or stick with the safe headsail?',
    kind: 'tactical',
    pointOfSail: 'Downwind',
    choices: [
      {
        id: 'evt-spinnaker-hoist',
        label: 'Hoist the kite',
        description: 'Surf the waves and reel in the fleet.',
        timeDelta: -1.1,
        staminaDelta: -8,
        moraleDelta: 5,
        hullDelta: -4,
        risk: 0.25,
      },
      {
        id: 'evt-spinnaker-white',
        label: 'Stay under white sails',
        description: 'Steady and controlled, if a touch slower.',
        timeDelta: 0.3,
        staminaDelta: -1,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.03,
      },
    ],
  },
  {
    id: 'evt-gear',
    title: 'Gear Failure',
    prompt:
      'A block has exploded under load. Rig a jury repair on the fly, or heave-to and do it properly?',
    kind: 'tactical',
    choices: [
      {
        id: 'evt-gear-jury',
        label: 'Jury-rig on the fly',
        description: 'Lose almost no time, but the fix may not hold.',
        timeDelta: -0.1,
        staminaDelta: -6,
        moraleDelta: -1,
        hullDelta: -6,
        risk: 0.3,
      },
      {
        id: 'evt-gear-proper',
        label: 'Heave-to and fix it right',
        description: 'A solid repair that restores the boat — at a cost in time.',
        timeDelta: 1.0,
        staminaDelta: -4,
        moraleDelta: 2,
        hullDelta: 8,
        risk: 0.03,
      },
    ],
  },
  {
    id: 'evt-layline',
    title: 'Layline Decision',
    prompt:
      'You are closing on the layline to the next mark. Send it now and risk overstanding, or hold for one more shift and round tight?',
    kind: 'tactical',
    pointOfSail: 'Upwind',
    choices: [
      {
        id: 'evt-layline-send',
        label: 'Tack now and foot fast',
        description: 'Lock in the corner — clean air all the way to the mark.',
        timeDelta: -0.5,
        staminaDelta: -4,
        moraleDelta: 3,
        hullDelta: 0,
        risk: 0.22,
      },
      {
        id: 'evt-layline-hold',
        label: 'Hold for the shift',
        description: 'Squeeze a few more boatlengths and round tight, if it comes.',
        timeDelta: 0.3,
        staminaDelta: -2,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.07,
      },
    ],
  },
  {
    id: 'evt-lane',
    title: 'Defending Your Lane',
    prompt:
      'A rival is rolling over the top of you, dirtying your air. Dig low to hold your lane, or duck behind and look for a clear road?',
    kind: 'tactical',
    choices: [
      {
        id: 'evt-lane-fight',
        label: 'Fight for the lane',
        description: 'Trim hard and refuse to be rolled — taxing on the crew.',
        timeDelta: -0.4,
        staminaDelta: -7,
        moraleDelta: 3,
        hullDelta: 0,
        risk: 0.2,
      },
      {
        id: 'evt-lane-duck',
        label: 'Duck and find clear air',
        description: 'Concede a touch now to sail your own race in clean breeze.',
        timeDelta: 0.4,
        staminaDelta: -1,
        moraleDelta: -1,
        hullDelta: 0,
        risk: 0.05,
      },
    ],
  },
  {
    id: 'evt-kelp',
    title: 'Weed on the Keel',
    prompt:
      'The boat feels sticky — there is weed snagged on the keel or rudder. Back down to clear it, or grind on and live with the drag?',
    kind: 'tactical',
    choices: [
      {
        id: 'evt-kelp-clear',
        label: 'Back down to clear it',
        description: 'Stop briefly to shed the weed and get the foils clean again.',
        timeDelta: 0.5,
        staminaDelta: -3,
        moraleDelta: 1,
        hullDelta: 0,
        risk: 0.04,
      },
      {
        id: 'evt-kelp-ignore',
        label: 'Grind on with the drag',
        description: 'Keep racing and hope it sheds itself — slower until it does.',
        timeDelta: 0.6,
        staminaDelta: -1,
        moraleDelta: -2,
        hullDelta: 0,
        risk: 0.05,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Crew morale events — the human side of the race.
// ---------------------------------------------------------------------------
export const MORALE_EVENTS: GameEvent[] = [
  {
    id: 'evt-fatigue',
    title: 'Crew Fatigue',
    prompt:
      'The watch is flagging after a brutal night. Push on through the tiredness or ease off and let them recover?',
    kind: 'tactical',
    choices: [
      {
        id: 'evt-fatigue-push',
        label: 'Push the watch hard',
        description: 'Keep the pace up at the cost of fresh legs and spirits.',
        timeDelta: -0.5,
        staminaDelta: -12,
        moraleDelta: -5,
        hullDelta: 0,
        risk: 0.18,
      },
      {
        id: 'evt-fatigue-rest',
        label: 'Ease off and rotate watches',
        description: 'Trade pace for a recharged, happier crew.',
        timeDelta: 0.7,
        staminaDelta: 9,
        moraleDelta: 8,
        hullDelta: 1,
        risk: 0.02,
      },
    ],
  },
  {
    id: 'evt-morale-meal',
    title: 'A Hot Meal at Midnight',
    prompt:
      'Spirits are low and the galley is cold. The cook offers to fire up a proper hot meal, but it means a hand off the deck for an hour.',
    kind: 'tactical',
    choices: [
      {
        id: 'evt-morale-meal-yes',
        label: 'Send the cook below',
        description: 'A hot feed lifts the whole boat — worth the lost hand.',
        timeDelta: 0.5,
        staminaDelta: 6,
        moraleDelta: 10,
        hullDelta: 0,
        risk: 0.02,
      },
      {
        id: 'evt-morale-meal-no',
        label: 'All hands stay on deck',
        description: 'Keep every body racing the boat. Morale takes the hit.',
        timeDelta: -0.3,
        staminaDelta: -4,
        moraleDelta: -6,
        hullDelta: 0,
        risk: 0.06,
      },
    ],
  },
  {
    id: 'evt-rally',
    title: 'Spirits Flagging',
    prompt:
      'The fleet has stretched away and the crew has gone quiet. The skipper can call everyone aft for a rallying word, or just let them work.',
    kind: 'tactical',
    choices: [
      {
        id: 'evt-rally-speak',
        label: 'Rally the troops',
        description: 'A few honest words to refocus the boat and lift heads.',
        timeDelta: 0.2,
        staminaDelta: 2,
        moraleDelta: 9,
        hullDelta: 0,
        risk: 0.03,
      },
      {
        id: 'evt-rally-grind',
        label: 'Let them grind it out',
        description: 'Say nothing and keep racing — heads-down, no distraction.',
        timeDelta: -0.2,
        staminaDelta: -3,
        moraleDelta: -3,
        hullDelta: 0,
        risk: 0.05,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Weather-on-the-horizon events — forecasting and reacting to what's coming.
// ---------------------------------------------------------------------------
export const WEATHER_EVENTS: GameEvent[] = [
  {
    id: 'evt-squall',
    title: 'Squall on the Horizon',
    prompt:
      'A dark squall line is bearing down. You can push hard under full sail for the speed, or reef early and ride it out.',
    kind: 'weather',
    choices: [
      {
        id: 'evt-squall-push',
        label: 'Send it under full sail',
        description: 'Maximum pace, but the rig and crew will pay for it.',
        timeDelta: -0.9,
        staminaDelta: -10,
        moraleDelta: 3,
        hullDelta: -12,
        risk: 0.35,
      },
      {
        id: 'evt-squall-reef',
        label: 'Reef and ride it out',
        description: 'Lose a little time to keep the boat and crew intact.',
        timeDelta: 0.5,
        staminaDelta: -2,
        moraleDelta: 1,
        hullDelta: -1,
        risk: 0.08,
      },
    ],
  },
  {
    id: 'evt-front',
    title: 'Front Approaching',
    prompt:
      'The barometer is tumbling and the sky to windward has gone an ugly grey. A front is coming through within the hour.',
    kind: 'weather',
    choices: [
      {
        id: 'evt-front-position',
        label: 'Position for the shift',
        description: 'Gamble on the wind backing and set up to pounce.',
        timeDelta: -1.2,
        staminaDelta: -7,
        moraleDelta: 4,
        hullDelta: -2,
        risk: 0.32,
      },
      {
        id: 'evt-front-conservative',
        label: 'Sail conservatively',
        description: 'Shorten sail and keep options open until it passes.',
        timeDelta: 0.6,
        staminaDelta: -2,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.05,
      },
    ],
  },
  {
    id: 'evt-fog',
    title: 'Fog Bank Rolling In',
    prompt:
      'Visibility is dropping fast as a fog bank swallows the fleet. Hold racing pace on instruments, or back off and post a lookout?',
    kind: 'weather',
    choices: [
      {
        id: 'evt-fog-press',
        label: 'Race on the instruments',
        description: 'Trust the electronics and keep the hammer down in the murk.',
        timeDelta: -0.6,
        staminaDelta: -6,
        moraleDelta: 2,
        hullDelta: -2,
        risk: 0.3,
      },
      {
        id: 'evt-fog-careful',
        label: 'Ease off, post a lookout',
        description: 'Slow down and keep everyone safe until it clears.',
        timeDelta: 0.6,
        staminaDelta: -2,
        moraleDelta: 1,
        hullDelta: 0,
        risk: 0.05,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Man-overboard — rare, dramatic, high stakes. The right call is obvious; the
// cost is the time it bleeds, but failing to act is catastrophic.
// ---------------------------------------------------------------------------
export const MOB_EVENTS: GameEvent[] = [
  {
    id: 'evt-mob',
    title: 'MAN OVERBOARD!',
    prompt:
      'A wave sweeps a crew member off the rail into the cold sea. Every second counts. How do you bring them back aboard?',
    kind: 'mob',
    choices: [
      {
        id: 'evt-mob-crash',
        label: 'Crash-tack and recover immediately',
        description:
          'Abandon the race instantly and execute a textbook recovery. Costly in time, but you get them back fast and safe.',
        timeDelta: 1.6,
        staminaDelta: -10,
        moraleDelta: 6,
        hullDelta: 0,
        risk: 0.05,
      },
      {
        id: 'evt-mob-quickstop',
        label: 'Quick-stop manoeuvre',
        description:
          'A tight, practised quick-stop. Faster than a full recovery, but it demands a sharp crew.',
        timeDelta: 0.8,
        staminaDelta: -14,
        moraleDelta: 2,
        hullDelta: -3,
        risk: 0.25,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Hazard-specific events — one signature decision per race hazard.
// ---------------------------------------------------------------------------
export const HAZARD_EVENTS: Record<HazardKey, GameEvent> = {
  tidal_gate: {
    id: 'evt-hz-tidal',
    title: 'The Needles Tidal Gate',
    prompt:
      'The tide is about to turn foul at The Needles. Push hard to make the gate before it shuts, or take the safe line in shore?',
    kind: 'hazard',
    hazard: 'tidal_gate',
    choices: [
      {
        id: 'evt-hz-tidal-push',
        label: 'Send it for the gate',
        description: 'Make it and you ride the last of the fair tide. Miss it and you stall.',
        timeDelta: -1.4,
        staminaDelta: -7,
        moraleDelta: 5,
        hullDelta: -2,
        risk: 0.4,
      },
      {
        id: 'evt-hz-tidal-safe',
        label: 'Take the inshore line',
        description: 'Sneak along the beach out of the worst of the foul tide.',
        timeDelta: 0.4,
        staminaDelta: -3,
        moraleDelta: 1,
        hullDelta: 0,
        risk: 0.1,
      },
    ],
  },
  light_air: {
    id: 'evt-hz-light',
    title: 'The Parking Lot',
    prompt:
      'The breeze has died and boats ahead are sitting still. Do you head inshore chasing a thermal, or hold offshore and wait it out?',
    kind: 'hazard',
    hazard: 'light_air',
    choices: [
      {
        id: 'evt-hz-light-inshore',
        label: 'Chase the inshore thermal',
        description: 'Gybe in toward the shore and gamble on a sea breeze filling.',
        timeDelta: -1.5,
        staminaDelta: -6,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.38,
      },
      {
        id: 'evt-hz-light-offshore',
        label: 'Hold offshore',
        description: 'Stay on the rhumb line and trust the gradient breeze to return.',
        timeDelta: 0.6,
        staminaDelta: -2,
        moraleDelta: -1,
        hullDelta: 0,
        risk: 0.12,
      },
    ],
  },
  med_fickle: {
    id: 'evt-hz-med',
    title: 'Strait of Messina',
    prompt:
      'The current through the strait runs hard. Time it right and it slingshots you through; time it wrong and you crawl.',
    kind: 'hazard',
    hazard: 'med_fickle',
    choices: [
      {
        id: 'evt-hz-med-time',
        label: 'Time the current',
        description: 'Trust the navigator and commit to the tidal window.',
        timeDelta: -1.3,
        staminaDelta: -6,
        moraleDelta: 5,
        hullDelta: 0,
        risk: 0.35,
      },
      {
        id: 'evt-hz-med-steady',
        label: 'Sail it steady',
        description: 'Take the conservative line and accept an average passage.',
        timeDelta: 0.5,
        staminaDelta: -2,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.08,
      },
    ],
  },
  gulf_stream: {
    id: 'evt-hz-gulf',
    title: 'Gulf Stream Meander',
    prompt:
      'The navigator has found a warm eddy spinning off the Stream. Divert to ride the favourable current, or hold the direct line?',
    kind: 'hazard',
    hazard: 'gulf_stream',
    choices: [
      {
        id: 'evt-hz-gulf-ride',
        label: 'Ride the favourable eddy',
        description: 'Add miles to hook into a 2-knot push toward Bermuda.',
        timeDelta: -1.6,
        staminaDelta: -7,
        moraleDelta: 5,
        hullDelta: 0,
        risk: 0.34,
      },
      {
        id: 'evt-hz-gulf-direct',
        label: 'Hold the rhumb line',
        description: 'Stay direct and risk punching into a foul meander.',
        timeDelta: 0.5,
        staminaDelta: -3,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.12,
      },
    ],
  },
  celtic_weather: {
    id: 'evt-hz-celtic',
    title: 'Rounding the Fastnet Rock',
    prompt:
      'A gale is building as you approach the Rock. Carry sail to round it quickly, or back off and round it safe in the rising sea?',
    kind: 'hazard',
    hazard: 'celtic_weather',
    choices: [
      {
        id: 'evt-hz-celtic-press',
        label: 'Press on and round hard',
        description: 'Get around the Rock before the worst arrives — at a price.',
        timeDelta: -1.0,
        staminaDelta: -10,
        moraleDelta: 4,
        hullDelta: -10,
        risk: 0.36,
      },
      {
        id: 'evt-hz-celtic-ease',
        label: 'Ease off and round safe',
        description: 'Shorten sail and protect the boat in the building gale.',
        timeDelta: 0.9,
        staminaDelta: -4,
        moraleDelta: 1,
        hullDelta: -1,
        risk: 0.08,
      },
    ],
  },
  island_accel: {
    id: 'evt-hz-island',
    title: 'Acceleration Zone',
    prompt:
      'Between the islands the trade wind funnels into a screaming gust. Sail high to load up for the blast, or bear away and play it safe?',
    kind: 'hazard',
    hazard: 'island_accel',
    choices: [
      {
        id: 'evt-hz-island-high',
        label: 'Sail high into the gust',
        description: 'Set up for maximum speed when the acceleration hits.',
        timeDelta: -1.3,
        staminaDelta: -8,
        moraleDelta: 5,
        hullDelta: -5,
        risk: 0.33,
      },
      {
        id: 'evt-hz-island-low',
        label: 'Bear away and ease',
        description: 'Take the safer angle and keep the boat under control.',
        timeDelta: 0.4,
        staminaDelta: -3,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.1,
      },
    ],
  },
  bass_strait: {
    id: 'evt-hz-bass',
    title: 'Southerly Buster',
    prompt:
      'A violent southerly change slams across Bass Strait. Drive the boat hard into it for the miles, or run off and survive the worst?',
    kind: 'hazard',
    hazard: 'bass_strait',
    choices: [
      {
        id: 'evt-hz-bass-drive',
        label: 'Drive into the change',
        description: 'Punch through for hard-won miles — the boat will take a beating.',
        timeDelta: -1.1,
        staminaDelta: -12,
        moraleDelta: 3,
        hullDelta: -14,
        risk: 0.42,
      },
      {
        id: 'evt-hz-bass-run',
        label: 'Run off and ride it out',
        description: 'Ease away from the seas to protect crew and boat.',
        timeDelta: 1.0,
        staminaDelta: -5,
        moraleDelta: 1,
        hullDelta: -2,
        risk: 0.1,
      },
    ],
  },
  tidal_rapids: {
    id: 'evt-hz-rapids',
    title: 'Seymour Narrows',
    prompt:
      'The Narrows runs at up to sixteen knots. Hit the last of the ebb and you shoot through; mistime it and the flood stops you dead — or worse.',
    kind: 'hazard',
    hazard: 'tidal_rapids',
    choices: [
      {
        id: 'evt-hz-rapids-send',
        label: 'Send it on the last of the ebb',
        description: 'Ride the fair current through before the gate shuts — if your timing holds.',
        timeDelta: -1.5,
        staminaDelta: -7,
        moraleDelta: 5,
        hullDelta: -2,
        risk: 0.4,
      },
      {
        id: 'evt-hz-rapids-wait',
        label: 'Wait for slack water',
        description: 'Tuck in and wait for the safe window. Slower, but sure.',
        timeDelta: 0.8,
        staminaDelta: -2,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.08,
      },
    ],
  },
  doldrums: {
    id: 'evt-hz-doldrums',
    title: 'Edge of the Pacific High',
    prompt:
      'Routing models disagree on the High. Dive south for stronger breeze and extra miles, or take the shorter great-circle route and risk parking?',
    kind: 'hazard',
    hazard: 'doldrums',
    choices: [
      {
        id: 'evt-hz-doldrums-south',
        label: 'Dive south for pressure',
        description: 'Sail extra distance to stay in the trades and keep moving.',
        timeDelta: -1.4,
        staminaDelta: -7,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.3,
      },
      {
        id: 'evt-hz-doldrums-rhumb',
        label: 'Take the short route',
        description: 'Shortest distance to Hawaii — if the High does not swallow you.',
        timeDelta: 0.8,
        staminaDelta: -3,
        moraleDelta: -1,
        hullDelta: 0,
        risk: 0.18,
      },
    ],
  },
};

// Flat list of every generic/morale/weather event for fallbacks and lookups.
export const EVENTS: GameEvent[] = [
  ...GENERIC_EVENTS,
  ...MORALE_EVENTS,
  ...WEATHER_EVENTS,
];

export function pickEvent(): GameEvent {
  return rndPick(EVENTS);
}

// Pick from a pool, preferring entries not yet seen this race; only once every
// option has been shown does it allow a repeat.
function pickFresh(pool: GameEvent[], seen: Set<string>): GameEvent {
  const fresh = pool.filter((e) => !seen.has(e.id));
  return rndPick(fresh.length > 0 ? fresh : pool);
}

// Chooses an everyday decision to present during a race. The signature hazard
// is handled separately by the engine (it fires at its mark), so this picker
// covers the rare man-overboard drama plus the everyday tactical/weather/crew
// calls — drawn without repeating until the pool is exhausted, so consecutive
// decisions feel varied. `shown` is the ids already presented this race.
export function pickEventForRace(shown: string[] = []): GameEvent {
  const seen = new Set(shown);
  const roll = rnd();

  // A rare man-overboard drama, at most once.
  if (!seen.has(MOB_EVENTS[0].id) && roll < 0.08) {
    return MOB_EVENTS[0];
  }
  // Everyday tactical/weather/crew calls drawn from the combined pool, never
  // repeating until all of them have been seen.
  const everyday = [...WEATHER_EVENTS, ...MORALE_EVENTS, ...GENERIC_EVENTS];
  return pickFresh(everyday, seen);
}
