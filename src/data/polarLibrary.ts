import { Boat, BoatPolar, BoatType } from '../types';
import { polarSpeed } from '../engine/polar';
import { computeTargets } from '../engine/polarTable';

// Canonical axes (ORC-style columns); data-driven everywhere else.
const TWS = [6, 8, 10, 12, 14, 16, 20, 24];
const TWA = [40, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180];

interface ClassParams {
  boatType: BoatType;
  name: string;
  className: string;
  description: string;
  baseSpeed: number;
  upwind: number;
  downwind: number;
  stability: number;
  crewCapacity: number;
  price: number;
}

// Build a polar table for a class by sampling the parametric model — gives each
// class a distinct, sensible starting curve the player can then tweak or import.
function synthesizePolar(p: ClassParams): BoatPolar {
  const pseudo: Boat = {
    id: `class-${p.boatType}`,
    name: p.name,
    className: p.className,
    description: p.description,
    baseSpeed: p.baseSpeed,
    upwind: p.upwind,
    downwind: p.downwind,
    stability: p.stability,
    crewCapacity: p.crewCapacity,
    price: p.price,
  };
  const speed = TWA.map((twa) =>
    TWS.map((tws) => Math.round(polarSpeed(pseudo, twa, tws) * 100) / 100)
  );
  const polar: BoatPolar = {
    tws: [...TWS],
    twa: [...TWA],
    speed,
    targets: { beatAngle: [], beatSpeed: [], runAngle: [], runSpeed: [] },
    source: 'class',
  };
  polar.targets = computeTargets(polar);
  return polar;
}

export const CLASS_PARAMS: ClassParams[] = [
  {
    boatType: 'cruiserRacerIRC',
    name: 'Cruiser-Racer',
    className: 'IRC 40',
    description: 'A versatile 40-footer — the backbone of club and offshore fleets. Forgiving and all-round.',
    baseSpeed: 8.4, upwind: 62, downwind: 60, stability: 70, crewCapacity: 8, price: 16000,
  },
  {
    boatType: 'tp52',
    name: 'TP52',
    className: 'TP52',
    description: 'A grand-prix inshore weapon. Blistering upwind and on the reach, but demands a sharp crew.',
    baseSpeed: 11.2, upwind: 84, downwind: 80, stability: 55, crewCapacity: 12, price: 42000,
  },
  {
    boatType: 'class40',
    name: 'Class40',
    className: 'Class40',
    description: 'A rugged shorthanded offshore flier — superb downwind, built to be sailed hard by few hands.',
    baseSpeed: 12.0, upwind: 70, downwind: 88, stability: 74, crewCapacity: 4, price: 30000,
  },
  {
    boatType: 'maxi72',
    name: 'Maxi 72',
    className: 'Maxi 72',
    description: 'A 72-foot maxi — vast sail area and outright pace across the range, with a full professional crew.',
    baseSpeed: 14.2, upwind: 80, downwind: 84, stability: 62, crewCapacity: 18, price: 78000,
  },
];

export interface ClassOption extends ClassParams {
  polar: BoatPolar;
}

export const CLASS_LIBRARY: ClassOption[] = CLASS_PARAMS.map((p) => ({
  ...p,
  polar: synthesizePolar(p),
}));

export function getClassOption(boatType: BoatType): ClassOption | undefined {
  return CLASS_LIBRARY.find((c) => c.boatType === boatType);
}
