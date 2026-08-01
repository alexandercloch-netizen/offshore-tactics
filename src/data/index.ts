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
  HAZARD_RACE_EVENTS,
  hazardEventForRace,
  pickEvent,
  pickEventForRace,
  conditionBand,
  racePhase,
  signatureOutcomeFor,
} from './events';
export {
  STORYLINES,
  storylineForRace,
  signatureBeat,
  debriefBeat,
} from './storylines';

// Sized against the real 27-race cost surface (entry + boat + full pro crew +
// bluewater provisions): a mid-boat pro campaign runs ~42–50k anywhere on the
// calendar (wages dominate — a Corsair's 6 pros are ~25k a race), and the
// worst case — the 14-berth maxi on an Ocean course — is ~111k. The start
// funds a serious GLOBAL campaign from day one: a proper boat plus several
// full-crew campaigns in hand before results have to pay the bills.
export const STARTING_FUNDS = 400000;

// Anti-soft-lock sponsor: if the campaign chest falls below the trigger, a
// sponsor tops it back up to the floor so the player can always go racing.
// The floor covers TWO mid-boat pro campaigns (~50k each) anywhere in the
// world — a real rebuild, not a scrap — while the maxi-class campaign (~111k)
// stays results-funded. The trigger sits just below one serious campaign so
// there is no dead band (too rich for the sponsor, too poor to campaign):
// below it you are topped straight back to global-campaign strength.
export const STIPEND_TRIGGER = 40000;
export const STIPEND_FLOOR = 100000;

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
