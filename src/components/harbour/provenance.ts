import { WEATHER_MODEL_LABEL } from '../../services/weather';

// The provenance chip's vocabulary — every Harbour chart that paints weather
// carries its source line ON the chart, one of exactly three rungs, worded
// once here so the label can never drift from the ladder:
//   live lattice / live board   → "ECMWF · as of 14:05"
//   the seasonal world          → "Seasonal pattern · ERA5 · July"
//   region IDW / vanes fallback → "Seasonal · indicative"

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// A live claim is a timestamped claim: the reading's local wall-clock time,
// straight off the fetch stamp that also drives the demotion clock.
export function liveProvenance(fetchedAt: number): string {
  const d = new Date(fetchedAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WEATHER_MODEL_LABEL} · as of ${hh}:${mm}`;
}

// The baked world climatology, labelled by what it is and which month it shows.
export function seasonalWorldProvenance(monthIndex: number): string {
  return `Seasonal pattern · ERA5 · ${MONTHS[Math.max(0, Math.min(11, monthIndex))]}`;
}

// A region falling back to seasonal course samples (blended where the 500 km
// gate allows, vanes-only where it doesn't): indicative, and it says so.
export const SEASONAL_INDICATIVE = 'Seasonal · indicative';
