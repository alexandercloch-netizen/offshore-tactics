import {
  ConditionBand,
  GameEvent,
  HazardKey,
  PointOfSail,
  RacePhase,
  SignatureOutcome,
} from '../types';
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
        field: true,
      },
      {
        id: 'evt-windshift-half',
        label: 'Split the difference',
        description: 'Work halfway toward the shift and keep an exit — a bit of the gain, less of the gamble.',
        timeDelta: -0.15,
        staminaDelta: -3,
        moraleDelta: 2,
        hullDelta: 0,
        risk: 0.16,
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
        label: 'Hoist the big kite',
        description: 'Surf the waves and reel in the fleet.',
        timeDelta: -1.1,
        staminaDelta: -8,
        moraleDelta: 5,
        hullDelta: -4,
        risk: 0.25,
        field: true,
        crewSkill: 'Bowman',
        sets: 'big-kite',
      },
      {
        id: 'evt-spinnaker-small',
        label: 'Set the heavy runner',
        description: 'A smaller, stouter kite — most of the pace, far less on the edge.',
        timeDelta: -0.4,
        staminaDelta: -4,
        moraleDelta: 2,
        hullDelta: -1,
        risk: 0.12,
        crewSkill: 'Bowman',
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
        sets: 'jury-rig',
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
        field: true,
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
        field: true,
        crewSkill: 'Trimmer',
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
        description: 'Stop to shed the weed and get the foils clean again — costs time, but the crew is glad of it.',
        timeDelta: 0.7,
        staminaDelta: -2,
        moraleDelta: 2,
        hullDelta: 0,
        risk: 0.03,
      },
      {
        id: 'evt-kelp-ignore',
        label: 'Grind on with the drag',
        description: 'Keep racing to save the manoeuvre — the drag wears on the watch until it sheds.',
        timeDelta: 0.4,
        staminaDelta: -4,
        moraleDelta: -3,
        hullDelta: 0,
        risk: 0.06,
      },
    ],
  },
  {
    id: 'evt-tss',
    title: 'Traffic in the Lane',
    prompt:
      'A ship is bearing down on the traffic-separation scheme dead ahead. Hold your line and cross ahead of her, or bear off and duck under her stern?',
    kind: 'tactical',
    choices: [
      {
        id: 'evt-tss-cross',
        label: 'Hold on and cross ahead',
        description: 'Stand on and save the miles — if you have read her speed right.',
        timeDelta: -0.4,
        staminaDelta: -3,
        moraleDelta: 2,
        hullDelta: 0,
        risk: 0.28,
        field: true,
      },
      {
        id: 'evt-tss-duck',
        label: 'Duck under her stern',
        description: 'Bear off, give way, and cross behind — a few lengths lost, no drama.',
        timeDelta: 0.4,
        staminaDelta: -1,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.04,
      },
    ],
  },
  {
    id: 'evt-reef',
    title: 'The Reef Question',
    prompt:
      'It is up to the top of the wind range and the boat is starting to labour. Carry full sail for the pace, or tuck a reef in before something lets go?',
    kind: 'tactical',
    pointOfSail: 'Upwind',
    conditions: ['fresh', 'heavy'],
    choices: [
      {
        id: 'evt-reef-full',
        label: 'Carry full sail',
        description: 'Keep the power on and drive — the rig and crew earn their keep.',
        timeDelta: -0.6,
        staminaDelta: -8,
        moraleDelta: 3,
        hullDelta: -6,
        risk: 0.3,
        field: true,
        crewSkill: 'Trimmer',
      },
      {
        id: 'evt-reef-tuck',
        label: 'Tuck a reef in',
        description: 'Shorten down early and sail the boat on her lines — a touch slower, far kinder.',
        timeDelta: 0.5,
        staminaDelta: -2,
        moraleDelta: 1,
        hullDelta: -1,
        risk: 0.06,
        crewSkill: 'Bowman',
        sets: 'reefed',
      },
    ],
  },
  {
    id: 'evt-peel',
    title: 'The Peel',
    prompt:
      'The runner is nose-diving in the building breeze. Peel to the bigger, fuller kite for pace, or hold the sail already drawing and keep it simple?',
    kind: 'tactical',
    pointOfSail: 'Downwind',
    conditions: ['moderate', 'fresh'],
    choices: [
      {
        id: 'evt-peel-big',
        label: 'Peel to the big kite',
        description: 'A bare-headed change for real downwind pace — a nervy minute on the foredeck.',
        timeDelta: -0.8,
        staminaDelta: -7,
        moraleDelta: 4,
        hullDelta: -3,
        risk: 0.26,
        field: true,
        crewSkill: 'Bowman',
        sets: 'big-kite',
      },
      {
        id: 'evt-peel-hold',
        label: 'Hold the kite you have',
        description: 'Leave the sail up and trim it hard — no risk of a wrap, a little less speed.',
        timeDelta: 0.3,
        staminaDelta: -1,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.05,
        crewSkill: 'Trimmer',
      },
    ],
  },
  {
    id: 'evt-broach',
    title: 'On the Edge',
    prompt:
      'She is lit up and threatening to round up on every surf. Push the edge for the big planes, ease a fraction to hold the plane, or soak low and keep her flat?',
    kind: 'tactical',
    pointOfSail: 'Downwind',
    conditions: ['fresh', 'heavy'],
    choices: [
      {
        id: 'evt-broach-push',
        label: 'Push the edge',
        description: 'Ride every wave to the hilt and dare the broach — huge if it comes off.',
        timeDelta: -1.0,
        staminaDelta: -9,
        moraleDelta: 4,
        hullDelta: -6,
        risk: 0.36,
        field: true,
        crewSkill: 'Trimmer',
      },
      {
        id: 'evt-broach-ease',
        label: 'Ease to hold the plane',
        description: 'Bleed a touch of load to stay planing without burying the bow.',
        timeDelta: -0.3,
        staminaDelta: -5,
        moraleDelta: 2,
        hullDelta: -2,
        risk: 0.2,
        crewSkill: 'Trimmer',
      },
      {
        id: 'evt-broach-soak',
        label: 'Soak low and stay flat',
        description: 'Sail the safe angle and keep her on her feet — the boat thanks you for it.',
        timeDelta: 0.4,
        staminaDelta: -3,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.07,
      },
    ],
  },
  {
    id: 'evt-seaway',
    title: 'Driving the Seaway',
    prompt:
      'The sea has stood up and the boat is slamming off the crests. Drive her hard through the waves, or steer the seaway and preserve boat and crew?',
    kind: 'tactical',
    pointOfSail: 'Reach',
    conditions: ['fresh', 'heavy'],
    choices: [
      {
        id: 'evt-seaway-drive',
        label: 'Drive her through it',
        description: 'Foot fast and take the pounding for the miles — jarring, hard work, quick.',
        timeDelta: -0.7,
        staminaDelta: -8,
        moraleDelta: 3,
        hullDelta: -5,
        risk: 0.3,
        field: true,
      },
      {
        id: 'evt-seaway-steer',
        label: 'Steer the waves',
        description: 'Work the helm around the worst of it — smoother, gentler, a shade slower.',
        timeDelta: 0.5,
        staminaDelta: -3,
        moraleDelta: 1,
        hullDelta: -1,
        risk: 0.07,
      },
    ],
  },
  {
    id: 'evt-headland',
    title: 'Cutting the Headland',
    prompt:
      'A headland juts across the course, a back-eddy of fair tide running tight along its rocks. Shave it close for the free ride, or stand off in clean water?',
    kind: 'tactical',
    pointOfSail: 'Upwind',
    regions: ['uk', 'pnw', 'lakes'],
    choices: [
      {
        id: 'evt-headland-shave',
        label: 'Shave the headland',
        description: 'Tuck in tight and steal the back-eddy — with the rocks a stone\'s throw to leeward.',
        timeDelta: -0.7,
        staminaDelta: -5,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.3,
        field: true,
      },
      {
        id: 'evt-headland-off',
        label: 'Stand off in clean tide',
        description: 'Give the point a berth and sail the safe water — no free ride, no white knuckles.',
        timeDelta: 0.4,
        staminaDelta: -2,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.06,
      },
    ],
  },
  {
    id: 'evt-kelpline',
    title: 'The Kelp Paddock',
    prompt:
      'A ribbon of kelp lies across the shortest line inshore. Plough straight through and pick it off later, or skirt to seaward of it in clear water?',
    kind: 'tactical',
    regions: ['uk', 'pnw', 'lakes', 'caribbean'],
    choices: [
      {
        id: 'evt-kelpline-through',
        label: 'Plough straight through',
        description: 'Hold the short line and live with the fouled foils until they clear — sticky and glum.',
        timeDelta: -0.5,
        staminaDelta: -4,
        moraleDelta: -2,
        hullDelta: 0,
        risk: 0.22,
        field: true,
      },
      {
        id: 'evt-kelpline-skirt',
        label: 'Skirt to seaward',
        description: 'Add a few lengths to stay in clean water — clean foils, happy crew.',
        timeDelta: 0.5,
        staminaDelta: -1,
        moraleDelta: 1,
        hullDelta: 0,
        risk: 0.03,
      },
    ],
  },
  {
    id: 'evt-phasing',
    title: 'Phasing the Shifts',
    prompt:
      'The breeze is oscillating in a rhythm the navigator can just about read. Work every header for the gains, or sail the long tack and keep it clean?',
    kind: 'tactical',
    pointOfSail: 'Upwind',
    choices: [
      {
        id: 'evt-phasing-work',
        label: 'Work every shift',
        description: 'Tack on each header and grind the gains — busy, tiring, and quick if you call them right.',
        timeDelta: -0.7,
        staminaDelta: -8,
        moraleDelta: 3,
        hullDelta: 0,
        risk: 0.24,
        field: true,
      },
      {
        id: 'evt-phasing-long',
        label: 'Sail the long tack',
        description: 'Keep it simple, stay in phase on the long board — fewer manoeuvres, fewer mistakes.',
        timeDelta: 0.3,
        staminaDelta: -2,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.06,
      },
    ],
  },
  {
    id: 'evt-injury',
    title: 'A Hand Hurt',
    prompt:
      'A crew member has taken a bad knock in the pit and is favouring an arm. Strap it and keep them on deck, or stand them down and redistribute the watch?',
    kind: 'tactical',
    choices: [
      {
        id: 'evt-injury-strap',
        label: 'Strap it and press on',
        description: 'Patch them up and keep every hand racing — the boat holds pace, the crew grits its teeth.',
        timeDelta: -0.2,
        staminaDelta: -6,
        moraleDelta: -4,
        hullDelta: 0,
        risk: 0.2,
        sets: 'strapped-hand',
      },
      {
        id: 'evt-injury-rest',
        label: 'Stand them down',
        description: 'Send them below to rest and cover the watch — a hand short, but the right call by them.',
        timeDelta: 0.6,
        staminaDelta: -2,
        moraleDelta: 3,
        hullDelta: 0,
        risk: 0.04,
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
        sets: 'burned-watch',
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
  {
    id: 'evt-nightwatch',
    title: 'The Long Night Watch',
    prompt:
      'It is the small hours and the off-watch is dead on its feet. Keep a full watch driving through the dark, or sail short-handed and let half of them sleep?',
    kind: 'tactical',
    phase: 'late',
    choices: [
      {
        id: 'evt-nightwatch-full',
        label: 'Full watch, keep driving',
        description: 'Every hand on deck and the hammer down through the night — pace held, legs paid for.',
        timeDelta: -0.4,
        staminaDelta: -9,
        moraleDelta: -2,
        hullDelta: 0,
        risk: 0.16,
        field: true,
        sets: 'burned-watch',
      },
      {
        id: 'evt-nightwatch-sleep',
        label: 'Sail short-handed, let them sleep',
        description: 'Ease the boat along under a thin watch and bank the rest — slower now, sharper by dawn.',
        timeDelta: 0.5,
        staminaDelta: 8,
        moraleDelta: 5,
        hullDelta: 0,
        risk: 0.03,
      },
    ],
  },
  {
    id: 'evt-seasick',
    title: 'Seasickness Below',
    prompt:
      'The motion has laid a couple of the crew low and green. Dose them and keep everyone racing, or send the worst below to recover?',
    kind: 'tactical',
    conditions: ['fresh', 'heavy'],
    choices: [
      {
        id: 'evt-seasick-dose',
        label: 'Dose them and race on',
        description: 'Pills, a biscuit, and back to the rail — the boat keeps its numbers, the crew suffers on.',
        timeDelta: -0.2,
        staminaDelta: -5,
        moraleDelta: -3,
        hullDelta: 0,
        risk: 0.14,
      },
      {
        id: 'evt-seasick-below',
        label: 'Send the worst below',
        description: 'Get them horizontal to recover — short-handed for a watch, whole again after.',
        timeDelta: 0.5,
        staminaDelta: 3,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.03,
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
        field: true,
        crewSkill: 'Trimmer',
      },
      {
        id: 'evt-squall-shorten',
        label: 'Shorten down and press',
        description: 'A reef in and still driving hard through the front of it — most of the pace, less of the peril.',
        timeDelta: -0.2,
        staminaDelta: -6,
        moraleDelta: 2,
        hullDelta: -5,
        risk: 0.2,
        crewSkill: 'Bowman',
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
        field: true,
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
  {
    id: 'evt-seabreeze',
    title: 'Sea Breeze Filling',
    prompt:
      'A sea breeze is starting to fill along the shore as the land heats up. Commit inshore to hook into the new pressure, or hold the offshore gradient you can trust?',
    kind: 'weather',
    conditions: ['light', 'moderate'],
    phase: 'early',
    regions: ['med', 'uk', 'lakes', 'caribbean'],
    choices: [
      {
        id: 'evt-seabreeze-inshore',
        label: 'Commit inshore for the new breeze',
        description: 'Bank on the sea breeze building and set up to ride it in — a lovely gain if it fills.',
        timeDelta: -0.9,
        staminaDelta: -6,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.28,
        field: true,
      },
      {
        id: 'evt-seabreeze-hold',
        label: 'Hold the offshore gradient',
        description: 'Stay in the breeze you have rather than gamble on the one you hope for.',
        timeDelta: 0.5,
        staminaDelta: -2,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.06,
      },
    ],
  },
  {
    id: 'evt-hole',
    title: 'A Hole Opening Up',
    prompt:
      'A soft patch is spreading across the rhumb line ahead. Bulldoze straight through it, or sail the extra distance around the light air?',
    kind: 'weather',
    conditions: ['light'],
    regions: ['lakes', 'med'],
    choices: [
      {
        id: 'evt-hole-through',
        label: 'Bulldoze through it',
        description: 'Hold the short line and hope the boat carries her way across the soft spot — nervy, glum if you park.',
        timeDelta: -0.5,
        staminaDelta: -3,
        moraleDelta: -3,
        hullDelta: 0,
        risk: 0.2,
        field: true,
      },
      {
        id: 'evt-hole-around',
        label: 'Sail around the light air',
        description: 'Add miles to stay in pressure — longer on the water, always moving.',
        timeDelta: 0.6,
        staminaDelta: -1,
        moraleDelta: 1,
        hullDelta: 0,
        risk: 0.03,
      },
    ],
  },
  {
    id: 'evt-windline',
    title: 'Chasing the Pressure Line',
    prompt:
      'There is a darker band of breeze on the water off to one side. Dig out toward the new pressure line, or stay in the steady breeze you are already carrying?',
    kind: 'weather',
    conditions: ['moderate', 'fresh'],
    choices: [
      {
        id: 'evt-windline-dig',
        label: 'Dig out to the pressure',
        description: 'Sail toward the darker water for more wind — extra distance now, more speed if it holds.',
        timeDelta: -0.8,
        staminaDelta: -6,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.26,
        field: true,
      },
      {
        id: 'evt-windline-stay',
        label: 'Stay in the steady breeze',
        description: 'Keep sailing the wind you trust rather than chase a band that may fade.',
        timeDelta: 0.4,
        staminaDelta: -2,
        moraleDelta: 0,
        hullDelta: 0,
        risk: 0.06,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Follow-on decisions — decision memory. Each is chained to a situation an
// earlier choice left the boat in (its `followsFrom` matches a choice's
// `sets`): the reef you tucked is the reef you're later asked to shake out.
// They are ONLY eligible while that situation is live on progress, so they can
// never fire out of the blue — and with no situation pending the picker's path
// is byte-identical to the plain draw.
// ---------------------------------------------------------------------------
export const FOLLOWON_EVENTS: GameEvent[] = [
  {
    id: 'evt-fo-shakeout',
    title: 'Shake Out the Reef?',
    prompt:
      'The blast you reefed for has blown through and she feels under-canvassed, wallowing off her numbers. Shake it out and power up, or keep the reef in your pocket for the next line of dark water?',
    kind: 'tactical',
    followsFrom: 'reefed',
    choices: [
      {
        id: 'evt-fo-shakeout-full',
        label: 'Shake it out',
        description: 'Full sail back on and chase the fleet — betting the ease is real.',
        timeDelta: -0.6,
        staminaDelta: -5,
        moraleDelta: 3,
        hullDelta: 0,
        risk: 0.22,
        field: true,
        crewSkill: 'Bowman',
      },
      {
        id: 'evt-fo-shakeout-keep',
        label: 'Keep the reef in',
        description: 'Stay snugged down and give nothing back if the breeze returns.',
        timeDelta: 0.3,
        staminaDelta: -1,
        moraleDelta: -1,
        hullDelta: 0,
        risk: 0.04,
      },
    ],
  },
  {
    id: 'evt-fo-kitedrop',
    title: 'The Kite Has Overstayed',
    prompt:
      'The breeze has built well past the big kite\'s range and the bow is starting to bury. The drop is overdue — and every minute it waits, the foredeck\'s job gets uglier.',
    kind: 'tactical',
    pointOfSail: 'Downwind',
    followsFrom: 'big-kite',
    choices: [
      {
        id: 'evt-fo-kitedrop-hang',
        label: 'Hang on for the miles',
        description: 'Carry it through the worst and bet the pressure softens — glorious or grim.',
        timeDelta: -0.5,
        staminaDelta: -7,
        moraleDelta: 2,
        hullDelta: -5,
        risk: 0.34,
        field: true,
        crewSkill: 'Trimmer',
      },
      {
        id: 'evt-fo-kitedrop-letterbox',
        label: 'Letterbox it down now',
        description: 'A brutal, practised drop through the boom slot while it\'s still possible.',
        timeDelta: 0.3,
        staminaDelta: -5,
        moraleDelta: 1,
        hullDelta: -1,
        risk: 0.16,
        crewSkill: 'Bowman',
      },
      {
        id: 'evt-fo-kitedrop-smother',
        label: 'Run deep and smother it',
        description: 'Bear away, blanket the kite behind the main and take it down soft — slow, sure.',
        timeDelta: 0.6,
        staminaDelta: -3,
        moraleDelta: -1,
        hullDelta: 0,
        risk: 0.06,
      },
    ],
  },
  {
    id: 'evt-fo-hand',
    title: 'The Strapped Hand Is Fading',
    prompt:
      'The arm you strapped is stiffening and the grinding is a hand short of honest. Keep them in the rotation and hold the boat\'s pace, or stand them down at last and split the watch?',
    kind: 'tactical',
    followsFrom: 'strapped-hand',
    choices: [
      {
        id: 'evt-fo-hand-press',
        label: 'Keep them in the watch',
        description: 'Every hand still counts — the pace holds while the arm, and the mood, wear thin.',
        timeDelta: -0.2,
        staminaDelta: -8,
        moraleDelta: -4,
        hullDelta: 0,
        risk: 0.18,
      },
      {
        id: 'evt-fo-hand-stand',
        label: 'Stand them down at last',
        description: 'Overdue but right: send them below and cover the gap — slower, and the boat knows it.',
        timeDelta: 0.5,
        staminaDelta: -2,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.04,
      },
    ],
  },
  {
    id: 'evt-fo-jury',
    title: 'The Jury Rig Is Working Loose',
    prompt:
      'The lashing on your on-the-fly repair has started to creep under load — you can hear it groan on every wave. Heave-to and make it permanent, or nurse it and pray it holds to the line?',
    kind: 'tactical',
    followsFrom: 'jury-rig',
    choices: [
      {
        id: 'evt-fo-jury-nurse',
        label: 'Nurse it to the finish',
        description: 'Ease the sheets a shade and will it to hold — quick while it lasts.',
        timeDelta: -0.1,
        staminaDelta: -3,
        moraleDelta: -2,
        hullDelta: -7,
        risk: 0.3,
      },
      {
        id: 'evt-fo-jury-fix',
        label: 'Heave-to and fix it properly',
        description: 'Park the boat and do it once, right — the repair outlives the race.',
        timeDelta: 0.9,
        staminaDelta: -4,
        moraleDelta: 2,
        hullDelta: 6,
        risk: 0.04,
      },
    ],
  },
  {
    id: 'evt-fo-watch',
    title: 'Paying for the Night',
    prompt:
      'The watch you drove through the dark is moving like treacle and small mistakes are creeping in. Force a proper rest cycle now, or keep the ragged rotation and stay in the fight?',
    kind: 'tactical',
    followsFrom: 'burned-watch',
    choices: [
      {
        id: 'evt-fo-watch-rest',
        label: 'Force a rest cycle',
        description: 'Half the crew horizontal by order — pace given up now, bought back sharper.',
        timeDelta: 0.6,
        staminaDelta: 10,
        moraleDelta: 6,
        hullDelta: 0,
        risk: 0.03,
      },
      {
        id: 'evt-fo-watch-grind',
        label: 'Keep the ragged rotation',
        description: 'No one sleeps while there are boats to catch — the mistakes are the price.',
        timeDelta: -0.3,
        staminaDelta: -7,
        moraleDelta: -3,
        hullDelta: 0,
        risk: 0.2,
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
    pinToWaypoint: 'The Needles', // the signature gate — fired as the boat reaches the mark
    storyBeat: 'race-round-island',
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
        field: true,
      },
      {
        id: 'evt-hz-tidal-shade',
        label: 'Shade toward the gate',
        description: 'Edge for the fair stream without betting the lap on the timing.',
        timeDelta: -0.3,
        staminaDelta: -5,
        moraleDelta: 2,
        hullDelta: -1,
        risk: 0.22,
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
    title: 'Inside or Outside the Manitous',
    prompt:
      'The Manitou Islands split the fleet. Cut inside through the passage — short and sheltered, but it can go glassy — or hold outside in the open lake for live breeze and more miles?',
    kind: 'hazard',
    hazard: 'light_air',
    pinToWaypoint: 'Manitou Passage', // the inside/outside fork — fired at the islands
    storyBeat: 'race-chicago-mac',
    choices: [
      {
        id: 'evt-hz-light-inside',
        label: 'Cut inside the islands',
        description: 'Take the short, sheltered passage and gamble the breeze holds in the lee.',
        timeDelta: -1.5,
        staminaDelta: -6,
        moraleDelta: 4,
        hullDelta: 0,
        risk: 0.38,
        field: true,
      },
      {
        id: 'evt-hz-light-split',
        label: 'Edge in, keep an exit',
        description: 'Shade toward the passage but hold a lane back out to the open lake.',
        timeDelta: -0.3,
        staminaDelta: -4,
        moraleDelta: 1,
        hullDelta: 0,
        risk: 0.22,
      },
      {
        id: 'evt-hz-light-outside',
        label: 'Hold outside in open water',
        description: 'Sail the extra miles for breeze you can trust to keep blowing.',
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
    pinToWaypoint: 'Strait of Messina', // the current ribbon — fired in the narrows
    storyBeat: 'race-middle-sea',
    choices: [
      {
        id: 'evt-hz-med-time',
        label: 'Ride the fair-tide ribbon',
        description: 'Trust the navigator and commit to the stream\'s slingshot window.',
        timeDelta: -1.3,
        staminaDelta: -6,
        moraleDelta: 5,
        hullDelta: 0,
        risk: 0.35,
        field: true,
      },
      {
        id: 'evt-hz-med-edge',
        label: 'Work toward the stream',
        description: 'Edge for the fair tide without fully committing to the window.',
        timeDelta: -0.3,
        staminaDelta: -4,
        moraleDelta: 2,
        hullDelta: 0,
        risk: 0.2,
      },
      {
        id: 'evt-hz-med-steady',
        label: 'Hold a steady line',
        description: 'Take the conservative line down the middle and accept an average passage.',
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
    pinToWaypoint: 'Gulf Stream', // the warm-eddy hunt — fired at the Stream crossing
    storyBeat: 'race-newport-bermuda',
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
        field: true,
      },
      {
        id: 'evt-hz-gulf-shade',
        label: 'Shade toward the warm water',
        description: 'Edge off the rhumb for a touch of the push without fully committing.',
        timeDelta: -0.4,
        staminaDelta: -5,
        moraleDelta: 2,
        hullDelta: 0,
        risk: 0.22,
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
    pinToWaypoint: 'Fastnet Rock', // the race's signature set-piece, fired at the mark
    storyBeat: 'race-fastnet',
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
        field: true,
      },
      {
        id: 'evt-hz-celtic-shade',
        label: 'Carry a shortened rig',
        description: 'A reef in but still driving — round her quick-ish without burying the boat.',
        timeDelta: 0.2,
        staminaDelta: -7,
        moraleDelta: 2,
        hullDelta: -5,
        risk: 0.2,
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
    title: 'The Saba Funnel',
    prompt:
      'The trade wind funnels round Saba into a screaming acceleration zone. Sail high to load up for the blast, or bear away and play it safe?',
    kind: 'hazard',
    hazard: 'island_accel',
    pinToWaypoint: 'Saba', // the acceleration zone — fired in the Saba channel
    storyBeat: 'race-caribbean-600',
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
        field: true,
      },
      {
        id: 'evt-hz-island-work',
        label: 'Work a trimmed angle',
        description: 'Load up part-way but keep the boat on her feet through the gust.',
        timeDelta: -0.3,
        staminaDelta: -5,
        moraleDelta: 2,
        hullDelta: -2,
        risk: 0.2,
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
    pinToWaypoint: 'Bass Strait', // the Buster positioning — fired in the Strait
    storyBeat: 'race-sydney-hobart',
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
        field: true,
      },
      {
        id: 'evt-hz-bass-work',
        label: 'Work a holding angle',
        description: 'Crack off a little and work the boat through the change under control.',
        timeDelta: 0.1,
        staminaDelta: -8,
        moraleDelta: 2,
        hullDelta: -7,
        risk: 0.24,
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
    pinToWaypoint: 'Seymour Narrows', // the slack-water gate — fired at the Narrows
    storyBeat: 'race-r2ak',
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
        field: true,
      },
      {
        id: 'evt-hz-rapids-edge',
        label: 'Feel for the easing boil',
        description: 'Edge in as the ebb slackens — neither charging the gate nor sitting it out.',
        timeDelta: -0.2,
        staminaDelta: -4,
        moraleDelta: 2,
        hullDelta: -1,
        risk: 0.22,
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
    pinToWaypoint: 'Mid-Pacific (Trades)', // the High south-dive — fired at the routing fork
    storyBeat: 'race-transpac',
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
        field: true,
      },
      {
        id: 'evt-hz-doldrums-shade',
        label: 'Shade south, keep miles in hand',
        description: 'Edge toward the trades without committing to the deep detour.',
        timeDelta: -0.2,
        staminaDelta: -5,
        moraleDelta: 1,
        hullDelta: 0,
        risk: 0.22,
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

// Flat list of every generic/morale/weather/follow-on event for fallbacks and
// lookups.
export const EVENTS: GameEvent[] = [
  ...GENERIC_EVENTS,
  ...MORALE_EVENTS,
  ...WEATHER_EVENTS,
  ...FOLLOWON_EVENTS,
];

export function pickEvent(): GameEvent {
  return rndPick(EVENTS);
}

// ---------------------------------------------------------------------------
// Context-aware "local knowledge" tagging.
//
// Coarse region keys for the everyday decisions: a handful of watery
// neighbourhoods whose local calls (a headland back-eddy, a kelp paddock, a sea
// breeze filling) belong there more than anywhere else. Kept independent of the
// onboarding `SailingRegion` so content and profiling stay decoupled — the
// picker maps the race to its region and prefers events tagged for it, but the
// flat fallback keeps every event eligible everywhere, so nothing is ever gated
// out of a draw.
// ---------------------------------------------------------------------------
export const RACE_REGION: Record<string, string> = {
  'race-round-island': 'uk',
  'race-fastnet': 'uk',
  'race-middle-sea': 'med',
  'race-chicago-mac': 'lakes',
  'race-newport-bermuda': 'atlantic',
  'race-caribbean-600': 'caribbean',
  'race-sydney-hobart': 'tasman',
  'race-transpac': 'pacific',
  'race-r2ak': 'pnw',
};

// The moment the picker fits an everyday decision to: which race/region, the
// live breeze band, and how far through the passage we are. All optional — with
// an empty context every event fits, so the picker behaves exactly as the plain
// point-of-sail draw did (determinism unchanged for the no-context path).
export interface EventContext {
  raceId?: string;
  band?: ConditionBand;
  phase?: RacePhase;
  // Decision memory: the key of a live situation an earlier choice opened (a
  // choice's `sets`). Matching follow-on events become eligible AND preferred;
  // absent, follow-ons are excluded entirely and the draw is unchanged.
  pending?: string;
}

// Map the live wind speed to a coarse breeze band (matches the WindStrength
// bands the UI already uses, folded to the four everyday-decision bands).
export function conditionBand(windSpeedKn: number): ConditionBand {
  if (windSpeedKn < 9) return 'light';
  if (windSpeedKn < 17) return 'moderate';
  if (windSpeedKn < 25) return 'fresh';
  return 'heavy';
}

// Where in the passage we are, by fraction of the course sailed.
export function racePhase(coveredNm: number, totalNm: number): RacePhase {
  const f = totalNm > 0 ? coveredNm / totalNm : 0;
  if (f < 0.34) return 'early';
  if (f < 0.67) return 'mid';
  return 'late';
}

// Does this event's context tags fit the moment? Each *specified* tag must be
// compatible; an unspecified tag, or an absent piece of context, never
// disqualifies — tags only ever add fit. An untagged event fits everywhere.
function eventFits(e: GameEvent, ctx: EventContext): boolean {
  if (e.conditions && ctx.band && !e.conditions.includes(ctx.band)) return false;
  if (e.phase && ctx.phase && e.phase !== ctx.phase) return false;
  if (e.regions && ctx.raceId) {
    const region = RACE_REGION[ctx.raceId];
    const match = e.regions.some((r) => r === ctx.raceId || r === region);
    if (!match) return false;
  }
  return true;
}

// An event with none of the context tags is situation-agnostic — the flat pool
// the picker falls back to when nothing else fits, so a draw is always possible.
function isFlat(e: GameEvent): boolean {
  return !e.conditions && !e.regions && !e.phase;
}

// Chooses an everyday decision to present during a race. The signature hazard
// is handled separately by the engine (it fires at its mark), so this picker
// covers the rare man-overboard drama plus the everyday tactical/weather/crew
// calls — drawn without repeating until the pool is exhausted, so consecutive
// decisions feel varied. `shown` is the ids already presented this race.
//
// `pointOfSail` gates the draw to the current leg: an event authored for a
// specific point of sail (e.g. the Upwind-only wind-shift, the Downwind-only
// spinnaker call) can only be drawn on a matching leg, so a downwind stretch
// never surfaces an upwind gauge. Events without a `pointOfSail` are situation-
// agnostic and always eligible.
//
// `context` fits the draw to the moment beyond the leg — the local breeze band,
// the region's waters, the phase of the passage — *preferring* events whose tags
// suit, but always falling back to the flat/untagged pool (and, if need be, the
// whole pool) so a draw is guaranteed. Critically, however narrow the preferred
// set becomes, the draw still ends in exactly ONE seeded `rndPick`, so the same
// seed and context always yield the same sequence.
export function pickEventForRace(
  shown: string[] = [],
  pointOfSail?: PointOfSail,
  context: EventContext = {}
): GameEvent {
  const seen = new Set(shown);
  const roll = rnd();

  // A rare man-overboard drama, at most once.
  if (!seen.has(MOB_EVENTS[0].id) && roll < 0.08) {
    return MOB_EVENTS[0];
  }
  // Everyday tactical/weather/crew calls, filtered to the current leg's point of
  // sail so the decision can't contradict what the boat is doing. Follow-on
  // events are gated to their live situation: with nothing pending they are
  // excluded entirely, so the no-memory path is byte-identical to the plain
  // draw over the everyday pool.
  const everyday = [...WEATHER_EVENTS, ...MORALE_EVENTS, ...GENERIC_EVENTS, ...FOLLOWON_EVENTS].filter(
    (e) =>
      (!pointOfSail || !e.pointOfSail || e.pointOfSail === pointOfSail) &&
      (!e.followsFrom || e.followsFrom === context.pending)
  );

  // Preference tiers, each narrower than the last, falling through to a set that
  // is guaranteed non-empty. Fresh (unseen) events are always preferred, so the
  // "no repeat until the pool is exhausted" behaviour holds; within the fresh
  // set, a follow-on chained to the live situation trumps everything (the story
  // beat the boat is actually in), then events whose tags fit the moment. The
  // final `rndPick` is the only source of randomness, so determinism is
  // preserved.
  const fresh = everyday.filter((e) => !seen.has(e.id));
  const followFresh = fresh.filter((e) => e.followsFrom !== undefined);
  const fittingFresh = fresh.filter((e) => eventFits(e, context));
  const flatFresh = fresh.filter(isFlat);
  const candidates =
    followFresh.length > 0
      ? followFresh
      : fittingFresh.length > 0
        ? fittingFresh
        : flatFresh.length > 0
          ? flatFresh
          : fresh.length > 0
            ? fresh
            : everyday;
  return rndPick(candidates);
}

// Classify which signature choice the player made for the storyline debrief.
// The fork is authored as bold (the field-resolved gamble) / safe (the lowest-
// risk, dependable option) / hedge (the middle). Derived from the choices
// themselves so a re-tuned event keeps mapping correctly without a second list.
export function signatureOutcomeFor(
  event: GameEvent,
  choiceId: string
): SignatureOutcome {
  const bold = event.choices.find((c) => c.field);
  if (bold && choiceId === bold.id) return 'bold';
  // The safe option is the calmest call: the lowest authored risk.
  const safe = event.choices.reduce((a, b) => (b.risk < a.risk ? b : a), event.choices[0]);
  if (safe && choiceId === safe.id) return 'safe';
  return 'hedge';
}
