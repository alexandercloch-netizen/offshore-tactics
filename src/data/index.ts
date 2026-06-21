import { Boat, CrewMember, Provision, Race } from '../types';
import { RACES } from './races';
import { BOATS } from './boats';
import { CREW } from './crew';
import { PROVISIONS } from './provisions';

export { RACES } from './races';
export { BOATS } from './boats';
export { CREW } from './crew';
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
} from './events';

export const STARTING_FUNDS = 50000;

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
