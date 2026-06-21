import { BoatType, Sail } from '../types';
import { getClassOption } from './polarLibrary';

// The specialist-sail catalogue. Every boat already sails its base polar under
// a standard wardrobe (working main, all-round jib, all-round kite). These
// sails are the optional extras a campaign invests in to gain speed in a
// particular slice of the wind range — the boat's sail crossover. Each lifts
// boat speed within its operating envelope and does nothing outside it, so the
// right wardrobe is the one matched to the races you intend to sail.
export const SAILS: Sail[] = [
  {
    id: 'light-genoa',
    name: 'Light #1 Genoa',
    category: 'headsail',
    blurb: 'Pointing high in light air',
    twaMin: 40,
    twaMax: 75,
    twsMin: 2,
    twsMax: 9,
    boost: 0.06,
    baseCost: 3000,
  },
  {
    id: 'code-zero',
    name: 'Code 0',
    category: 'reacher',
    blurb: 'Close reaching in light to medium air',
    twaMin: 55,
    twaMax: 110,
    twsMin: 4,
    twsMax: 13,
    boost: 0.08,
    baseCost: 6000,
  },
  {
    id: 'light-spinnaker',
    name: 'Light Spinnaker (A1.5)',
    category: 'spinnaker',
    blurb: 'Running and broad reaching in light air',
    twaMin: 80,
    twaMax: 150,
    twsMin: 3,
    twsMax: 10,
    boost: 0.08,
    baseCost: 5000,
  },
  {
    id: 'jib-top',
    name: 'Jib Top / Heavy Reacher',
    category: 'reacher',
    blurb: 'Reaching hard in a breeze',
    twaMin: 55,
    twaMax: 110,
    twsMin: 16,
    twsMax: 30,
    boost: 0.05,
    baseCost: 4500,
  },
  {
    id: 'heavy-spinnaker',
    name: 'Heavy Spinnaker (S4)',
    category: 'spinnaker',
    blurb: 'Running fast and safe in strong wind',
    twaMin: 120,
    twaMax: 180,
    twsMin: 17,
    twsMax: 32,
    boost: 0.07,
    baseCost: 7000,
  },
  {
    id: 'storm-set',
    name: 'Storm Jib & Trysail',
    category: 'stormsail',
    blurb: 'Keeping the boat driving in a gale',
    twaMin: 40,
    twaMax: 95,
    twsMin: 27,
    twsMax: 45,
    boost: 0.04,
    baseCost: 4000,
  },
];

// Which specialist sails each class can carry. Inshore grand-prix boats run a
// deep light-air and reaching programme; offshore boats favour big asymmetrics
// and storm canvas; cruiser-racers sit in between.
const AVAILABILITY: Record<BoatType, string[]> = {
  cruiserRacerIRC: ['light-genoa', 'code-zero', 'light-spinnaker', 'storm-set'],
  tp52: ['light-genoa', 'code-zero', 'light-spinnaker', 'jib-top', 'heavy-spinnaker'],
  class40: ['code-zero', 'light-spinnaker', 'jib-top', 'heavy-spinnaker', 'storm-set'],
  maxi72: [
    'light-genoa',
    'code-zero',
    'light-spinnaker',
    'jib-top',
    'heavy-spinnaker',
    'storm-set',
  ],
};

// Cruiser-racer price anchors the sail-cost scale; bigger, faster boats carry
// proportionally pricier sails.
const COST_ANCHOR = 16000;

export function getSailById(id: string): Sail | undefined {
  return SAILS.find((s) => s.id === id);
}

// The sails a given class is allowed to add, in catalogue order.
export function availableSailsFor(boatType: BoatType): Sail[] {
  const ids = AVAILABILITY[boatType] ?? [];
  return ids
    .map((id) => getSailById(id))
    .filter((s): s is Sail => Boolean(s));
}

// Price of a sail for a particular class, scaled from its base cost by how the
// class price compares to the cruiser-racer anchor.
export function sailCost(boatType: BoatType, sail: Sail): number {
  const price = getClassOption(boatType)?.price ?? COST_ANCHOR;
  const factor = price / COST_ANCHOR;
  return Math.round((sail.baseCost * factor) / 100) * 100;
}

// Half the purchase price is recovered when a sail is sold out of the wardrobe.
export function sailRefund(boatType: BoatType, sail: Sail): number {
  return Math.round((sailCost(boatType, sail) * 0.5) / 100) * 100;
}
