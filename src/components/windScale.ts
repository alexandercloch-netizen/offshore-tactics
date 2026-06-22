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

export function windHeatColor(speedKn: number): string {
  const s = Math.max(0, speedKn);
  for (let i = 1; i < HEAT_STOPS.length; i += 1) {
    const a = HEAT_STOPS[i - 1];
    const b = HEAT_STOPS[i];
    if (s <= b.kn) {
      const t = (s - a.kn) / (b.kn - a.kn || 1);
      const ch = (j: number) => Math.round(a.rgb[j] + (b.rgb[j] - a.rgb[j]) * t);
      return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
    }
  }
  const last = HEAT_STOPS[HEAT_STOPS.length - 1].rgb;
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}
