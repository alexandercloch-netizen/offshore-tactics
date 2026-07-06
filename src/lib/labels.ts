import { BoatType, DivisionKey } from '../types';

// Player-facing names for engine enums. The engine speaks in keys
// ('cruiserRacerIRC', 'pro'); the UI must never leak one raw — a chip that
// says "cruiserRacerIRC" is a bug. Presentation only, so this lives in lib,
// not the engine.

export const LABEL_BY_TYPE: Record<BoatType, string> = {
  cruiserRacerIRC: 'Cruiser-Racer',
  tp52: 'TP52',
  class40: 'Class40',
  maxi72: 'Maxi 72',
};

export function boatTypeName(type: BoatType): string {
  return LABEL_BY_TYPE[type];
}

export function divisionName(division: DivisionKey): string {
  return division === 'pro' ? 'Pro' : 'Corinthian';
}
