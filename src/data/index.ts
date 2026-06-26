import { Boat, CrewMember, Provision, Race } from '../types';
import { RACES } from './races';
import { BOATS } from './boats';
import { CREW } from './crew';
import { PROVISIONS } from './provisions';

export { RACES } from './races';
export { BOATS } from './boats';
export { CREW, crewForTier } from './crew';
export { PROVISIONS } from './provisions';
export { WEATHER, pickWeather, pickWeatherForHazard } from './weather';
export {
  EVENTS,
  GENERIC_EVENTS,
  MORALE_EVENTS,
  WEATHER_EVENTS,
  MOB_EVENTS,
  HAZARD_EVENTS,
  pickEvent,
  pickEventForRace,
  signatureOutcomeFor,
} from './events';
export {
  STORYLINES,
  storylineForRace,
  signatureBeat,
  debriefBeat,
} from './storylines';

export const STARTING_FUNDS = 250000;

// Anti-soft-lock sponsor: if the campaign chest falls below the trigger, a
// sponsor tops it back up to the floor so the player can always go racing.
export const STIPEND_TRIGGER = 15000;
export const STIPEND_FLOOR = 75000;

// Funds topped up to the floor when below the trigger; otherwise unchanged.
export function applyStipend(funds: number): number {
  return funds < STIPEND_TRIGGER ? Math.max(funds, STIPEND_FLOOR) : funds;
}

export function getRaceById(id?: string): Race | undefined {
  return RACES.find((r) => r.id === id);
}

export function getBoatById(id?: string): Boat | undefined {
  return BOATS.find((b) => b.id === id);
}

export function getCrewById(id?: string): CrewMember | undefined {
  return CREW.find((c) => c.id === id);
}

export function getProvisionById(id?: string): Provision | undefined {
  return PROVISIONS.find((p) => p.id === id);
}
