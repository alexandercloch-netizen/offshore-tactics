import { GameEvent } from '../types';

export const EVENTS: GameEvent[] = [
  {
    id: 'evt-windshift',
    title: 'Wind Shift Ahead',
    prompt:
      'The navigator spots a header building on the next stretch. Do you tack onto the lift or hold your lane and bank the distance?',
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
    id: 'evt-squall',
    title: 'Squall on the Horizon',
    prompt:
      'A dark squall line is bearing down. You can push hard under full sail for the speed, or reef early and ride it out.',
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
    id: 'evt-headland',
    title: 'Headland Decision',
    prompt:
      'A headland looms. The inshore route is shorter but rock-strewn; offshore is safer but adds miles.',
    pointOfSail: 'Reach',
    choices: [
      {
        id: 'evt-headland-inshore',
        label: 'Take the inshore short-cut',
        description: 'Shave miles by hugging the coast — mind the rocks.',
        timeDelta: -0.8,
        staminaDelta: -5,
        moraleDelta: 2,
        hullDelta: -3,
        risk: 0.28,
      },
      {
        id: 'evt-headland-offshore',
        label: 'Go offshore and stay safe',
        description: 'Add distance for clean water and peace of mind.',
        timeDelta: 0.4,
        staminaDelta: -2,
        moraleDelta: 1,
        hullDelta: 0,
        risk: 0.04,
      },
    ],
  },
  {
    id: 'evt-spinnaker',
    title: 'Spinnaker Call',
    prompt:
      'The breeze has come aft. Hoist the big kite for downwind speed, or stick with the safe headsail?',
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
    id: 'evt-fatigue',
    title: 'Crew Fatigue',
    prompt:
      'The watch is flagging after a brutal night. Push on through the tiredness or ease off and let them recover?',
    choices: [
      {
        id: 'evt-fatigue-push',
        label: 'Push the watch hard',
        description: 'Keep the pace up at the cost of fresh legs.',
        timeDelta: -0.5,
        staminaDelta: -12,
        moraleDelta: -3,
        hullDelta: 0,
        risk: 0.18,
      },
      {
        id: 'evt-fatigue-rest',
        label: 'Ease off and rotate watches',
        description: 'Trade pace for a recharged, happier crew.',
        timeDelta: 0.7,
        staminaDelta: 9,
        moraleDelta: 6,
        hullDelta: 1,
        risk: 0.02,
      },
    ],
  },
  {
    id: 'evt-gear',
    title: 'Gear Failure',
    prompt:
      'A block has exploded under load. Rig a jury repair on the fly, or heave-to and do it properly?',
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
];

export function pickEvent(): GameEvent {
  const index = Math.floor(Math.random() * EVENTS.length);
  return EVENTS[index];
}
