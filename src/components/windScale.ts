// Shared wind-speed colour ramp (kn → colour) for the forecast heatmap and its
// legend — the familiar purple→blue→green→yellow→red scale of marine charts.

export const HEAT_STOPS: { kn: number; rgb: [number, number, number] }[] = [
  { kn: 0, rgb: [59, 31, 143] }, // deep purple — glassy
  { kn: 8, rgb: [43, 89, 208] }, // blue — light
  { kn: 14, rgb: [31, 182, 201] }, // teal — moderate
  { kn: 20, rgb: [54, 199, 89] }, // green — fresh
  { kn: 26, rgb: [201, 210, 58] }, // chartreuse — strong
  { kn: 32, rgb: [227, 161, 58] }, // orange — near gale
  { kn: 40, rgb: [215, 38, 61] }, // red — gale
  { kn: 55, rgb: [140, 16, 41] }, // dark red — storm
];

// Tidal-stream colour ramp (kn → colour): slack near-black water building through
// blue to a bright spring-tide cyan, so the strong gates read at a glance. Tide
// rates are an order of magnitude below wind speeds, so this scale tops out ~4 kn.
export const TIDE_STOPS: { kn: number; rgb: [number, number, number] }[] = [
  { kn: 0, rgb: [12, 28, 46] }, // slack — near the deep-sea base
  { kn: 0.6, rgb: [22, 64, 110] }, // gentle set
  { kn: 1.4, rgb: [33, 118, 184] }, // moderate stream
  { kn: 2.4, rgb: [73, 182, 255] }, // strong stream (theme `tide`)
  { kn: 3.6, rgb: [150, 222, 255] }, // a gate in full spring
  { kn: 5, rgb: [216, 244, 255] }, // rip
];

function rampColor(stops: { kn: number; rgb: [number, number, number] }[], v: number): string {
  const s = Math.max(0, v);
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1];
    const b = stops[i];
    if (s <= b.kn) {
      const t = (s - a.kn) / (b.kn - a.kn || 1);
      const ch = (j: number) => Math.round(a.rgb[j] + (b.rgb[j] - a.rgb[j]) * t);
      return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
    }
  }
  const last = stops[stops.length - 1].rgb;
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

export function windHeatColor(speedKn: number): string {
  return rampColor(HEAT_STOPS, speedKn);
}

export function tideHeatColor(rateKn: number): string {
  return rampColor(TIDE_STOPS, rateKn);
}
