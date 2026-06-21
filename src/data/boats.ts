import { Boat } from '../types';

export const BOATS: Boat[] = [
  {
    id: 'boat-sprite',
    name: 'Sea Sprite',
    className: 'Sport 26',
    description:
      'A nimble one-design sportsboat. Quick in the light stuff but tender when it pipes up.',
    baseSpeed: 7.5,
    upwind: 72,
    downwind: 80,
    stability: 45,
    crewCapacity: 4,
    price: 6500,
  },
  {
    id: 'boat-corsair',
    name: 'Corsair',
    className: 'Performance 35',
    description:
      'A balanced cruiser-racer. A dependable all-rounder for coastal and offshore work.',
    baseSpeed: 8.6,
    upwind: 78,
    downwind: 76,
    stability: 68,
    crewCapacity: 6,
    price: 11500,
  },
  {
    id: 'boat-tempest',
    name: 'Tempest',
    className: 'Offshore 42',
    description:
      'A powerful offshore weapon. Loves a breeze and shrugs off heavy weather.',
    baseSpeed: 9.4,
    upwind: 82,
    downwind: 85,
    stability: 80,
    crewCapacity: 8,
    price: 18500,
  },
  {
    id: 'boat-meridian',
    name: 'Meridian',
    className: 'Bluewater 48',
    description:
      'A rugged ocean passagemaker. Not the fastest, but it will get you there in one piece.',
    baseSpeed: 8.9,
    upwind: 70,
    downwind: 79,
    stability: 92,
    crewCapacity: 8,
    price: 21000,
  },
  {
    id: 'boat-mistral',
    name: 'Mistral',
    className: 'Grand Prix 52',
    description:
      'A thoroughbred grand-prix racer. Blistering pace in skilled hands, demanding in every other.',
    baseSpeed: 10.6,
    upwind: 90,
    downwind: 92,
    stability: 62,
    crewCapacity: 10,
    price: 28000,
  },
];
