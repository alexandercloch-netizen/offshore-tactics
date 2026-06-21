import { Race } from '../types';

export const RACES: Race[] = [
  {
    id: 'race-harbour-sprint',
    name: 'Harbour Sprint',
    location: 'Cowes, Solent',
    description:
      'A short, sharp inshore dash around the cans. Forgiving conditions and a great place to learn the ropes.',
    distanceNm: 24,
    difficulty: 'Inshore',
    totalLegs: 4,
    fleetSize: 10,
    entryFee: 1200,
    prizeMoney: 6000,
    recordTimeHours: 3.2,
  },
  {
    id: 'race-channel-dash',
    name: 'Channel Dash',
    location: 'Solent to Cherbourg',
    description:
      'A cross-Channel coastal race with shifting tides and shipping lanes to negotiate.',
    distanceNm: 68,
    difficulty: 'Coastal',
    totalLegs: 6,
    fleetSize: 14,
    entryFee: 2600,
    prizeMoney: 14000,
    recordTimeHours: 8.5,
  },
  {
    id: 'race-fastnet',
    name: 'Rock Challenge',
    location: 'Cowes to the Fastnet Rock',
    description:
      'The classic offshore test. Long legs, big tactical decisions and weather that bites.',
    distanceNm: 320,
    difficulty: 'Offshore',
    totalLegs: 8,
    fleetSize: 18,
    entryFee: 4800,
    prizeMoney: 32000,
    recordTimeHours: 38,
  },
  {
    id: 'race-biscay-storm',
    name: 'Biscay Gauntlet',
    location: 'Brittany to A Coruña',
    description:
      'Across the notorious Bay of Biscay. Punishing seas reward stout boats and steady crews.',
    distanceNm: 410,
    difficulty: 'Offshore',
    totalLegs: 9,
    fleetSize: 16,
    entryFee: 6200,
    prizeMoney: 46000,
    recordTimeHours: 52,
  },
  {
    id: 'race-transatlantic',
    name: 'Transatlantic Passage',
    location: 'Lisbon to Bridgetown',
    description:
      'A true ocean crossing. Trade winds, squalls and days at sea separate sailors from legends.',
    distanceNm: 2700,
    difficulty: 'Ocean',
    totalLegs: 12,
    fleetSize: 22,
    entryFee: 9000,
    prizeMoney: 90000,
    recordTimeHours: 312,
  },
];
