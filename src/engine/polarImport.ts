import { BoatPolar } from '../types';
import { computeTargets } from './polarTable';

export interface PolarParseResult {
  ok: boolean;
  polar?: BoatPolar;
  error?: string;
}

const isNum = (s: string): boolean => s !== '' && Number.isFinite(Number(s));

function tokenize(line: string): string[] {
  const trimmed = line.trim();
  const raw = trimmed.includes(',')
    ? trimmed.split(',')
    : trimmed.includes('\t')
      ? trimmed.split('\t')
      : trimmed.split(/\s+/);
  return raw.map((t) => t.replace(/^["']|["']$/g, '').trim());
}

// Linear interpolation over sorted (x, y) control points, clamped at the ends.
function interpCurve(points: { x: number; y: number }[], x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0].x) return points[0].y;
  const last = points[points.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a.x && x <= b.x) {
      const span = b.x - a.x || 1;
      return a.y + (b.y - a.y) * ((x - a.x) / span);
    }
  }
  return last.y;
}

// Grid / matrix format: a header row of TWS values (with a corner token or
// blank first cell), then one row per TWA.
function parseGrid(lines: string[][]): PolarParseResult {
  const header = lines[0];
  const corner = header[0];
  const tws = header.slice(1).filter(isNum).map(Number);
  if (tws.length < 2) return { ok: false, error: 'Could not read wind-speed columns.' };

  const twa: number[] = [];
  const speed: number[][] = [];
  for (let r = 1; r < lines.length; r += 1) {
    const row = lines[r];
    if (!isNum(row[0])) continue;
    const angle = Number(row[0]);
    const speeds = row.slice(1, tws.length + 1).map((v) => (isNum(v) ? Number(v) : 0));
    if (speeds.length < tws.length) continue;
    twa.push(angle);
    speed.push(speeds);
  }
  if (twa.length < 2) return { ok: false, error: 'Could not read wind-angle rows.' };

  const importedFrom = corner === '' ? 'predictwind' : 'generic';
  const polar: BoatPolar = { tws, twa, speed, targets: { beatAngle: [], beatSpeed: [], runAngle: [], runSpeed: [] }, source: 'imported', importedFrom };
  polar.targets = computeTargets(polar);
  return { ok: true, polar };
}

// Curve / list format (Expedition, ORC export): one line per wind speed —
// `TWS angle1 speed1 angle2 speed2 …` — with angle sets that may differ per line.
function parseCurve(lines: string[][]): PolarParseResult {
  const perWind: { tws: number; points: { x: number; y: number }[] }[] = [];
  const allAngles = new Set<number>();

  for (const row of lines) {
    const nums = row.filter(isNum).map(Number);
    if (nums.length < 3 || nums.length % 2 === 0) continue; // need tws + angle/speed pairs
    const tws = nums[0];
    const points: { x: number; y: number }[] = [];
    for (let i = 1; i + 1 < nums.length; i += 2) {
      points.push({ x: nums[i], y: nums[i + 1] });
      allAngles.add(nums[i]);
    }
    points.sort((a, b) => a.x - b.x);
    perWind.push({ tws, points });
  }
  if (perWind.length < 2) return { ok: false, error: 'Could not read any wind-speed curves.' };

  perWind.sort((a, b) => a.tws - b.tws);
  const tws = perWind.map((p) => p.tws);
  const twa = [...allAngles].filter((a) => a > 0).sort((a, b) => a - b);
  if (twa.length < 2) return { ok: false, error: 'Could not read wind-angle points.' };

  const speed = twa.map((angle) => perWind.map((p) => Math.round(interpCurve(p.points, angle) * 100) / 100));
  const polar: BoatPolar = { tws, twa, speed, targets: { beatAngle: [], beatSpeed: [], runAngle: [], runSpeed: [] }, source: 'imported', importedFrom: 'expedition' };
  polar.targets = computeTargets(polar);
  return { ok: true, polar };
}

// Parse a polar from pasted/imported text, auto-detecting the format. A header
// row whose first cell is non-numeric/blank is a grid; otherwise it's treated
// as Expedition/ORC curve lines.
export function parsePolar(text: string): PolarParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[!#]/.test(l))
    .map(tokenize);
  if (lines.length < 2) return { ok: false, error: 'Not enough data to read a polar.' };

  const firstCell = lines[0][0] ?? '';
  return isNum(firstCell) ? parseCurve(lines) : parseGrid(lines);
}
