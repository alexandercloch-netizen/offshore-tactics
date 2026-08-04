import { colors, status } from '../../theme';
import { InstrumentReport } from '../../engine/instruments';
import { SailMode } from '../../types';

// The instrument band as data: pure functions from the report to exactly six
// cell descriptors, so the one-home-per-number contract and the honesty rules
// (VMC not "VMG", signed TWA, %TGT thresholds, the SAIL tint) are unit-testable
// without a renderer.

export interface CellSpec {
  id: 'sog' | 'vmc' | 'tgt' | 'twa' | 'tws' | 'sail';
  label: string;
  value: string;
  tint?: string; // resolved colour; undefined = neutral foam
  a11y: string;
  minWidth: number; // reserves digits so a live value never reflows the band
  badge?: string; // the SAIL cell's ⇄N counter
}

// %TGT thresholds: sailing the leg well (≥95), off the pace (85–94), parked
// (<85). The a11y suffix spells the colour out for screen readers.
export function pctTargetTint(pct: number): string | undefined {
  if (pct >= 95) return status.good;
  if (pct >= 85) return status.warn;
  return status.bad;
}
export function pctTargetA11y(pct: number): string {
  if (pct >= 95) return 'on target';
  if (pct >= 85) return 'below target';
  return 'well below target';
}

// The SAIL cell's tint: the working set is the boat as rated — neutral, never
// red, however wrong the moment. A specialist reads by its fit: right sail
// (neutral), marginal (amber), badly wrong (red).
export function sailTint(isWorking: boolean, coverage: number): string | undefined {
  if (isWorking) return undefined;
  if (coverage >= 0.75) return undefined;
  if (coverage >= 0.35) return status.warn;
  return status.bad;
}

// Lift or header? A veer (+) lifts the starboard tack and heads port; a back (-)
// does the reverse. Same sign as TWA (which is + on starboard) = lifted. This is
// the one number a tactician steers by upwind, so it rides on the TWA cell as a
// tinted badge rather than costing a seventh cell.
export function shiftBadge(shiftDeg: number | undefined, twaDeg: number): { text: string; tint?: string } | undefined {
  if (shiftDeg === undefined) return undefined;
  const mag = Math.round(Math.abs(shiftDeg));
  if (mag < 3) return { text: 'STDY' }; // steady — no phase worth calling
  const lifted = Math.sign(shiftDeg) === Math.sign(twaDeg);
  // Only a BEAT has lifts and headers; off the wind just report the swing.
  const beating = Math.abs(twaDeg) < 70;
  return {
    text: `${shiftDeg > 0 ? '+' : '-'}${mag}\u00b0`,
    tint: beating ? (lifted ? status.good : status.warn) : undefined,
  };
}

// Signed TWA with the tack suffix: positive = wind over the starboard side.
export function formatTwa(twaDeg: number): string {
  const mag = Math.round(Math.abs(twaDeg));
  if (mag === 0 || mag === 180) return `${mag}°`;
  return `${mag}°${twaDeg > 0 ? 'S' : 'P'}`;
}

// The composite health chip: worst of hull/crew/morale at the long-standing
// <60 / <35 thresholds; undefined when all's well.
export function healthTint(hull: number, stamina: number, morale: number): string | undefined {
  const worst = Math.min(hull, stamina, morale);
  if (worst < 35) return status.bad;
  if (worst < 60) return status.warn;
  return undefined;
}

// The auto-helm modes, capitalised for the SAIL a11y label ("… on Balanced
// auto").
const SAIL_MODE_WORD: Record<Exclude<SailMode, 'manual'>, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
};

// The phone-primary band — EXACTLY six cells, fixed slot order, identical idle
// and docked. `smoothedPct` is the screen's short rolling average of %TGT so
// the hero number doesn't strobe tick to tick. `sailMode` marks the SAIL cell
// when the auto-helm is flying the wardrobe (an `A⇄N` badge, no layout change).
export function buildPrimaryCells(
  report: InstrumentReport,
  smoothedPct?: number,
  sailMode?: SailMode
): CellSpec[] {
  const now = report.now;
  const pct = Math.round(smoothedPct ?? now.polarPct ?? 0);
  const sail = now.activeSail;
  const sailName = sail?.name ?? 'Working Sails';
  const changes = sail?.changes ?? 0;
  const auto = sailMode !== undefined && sailMode !== 'manual';
  return [
    {
      id: 'sog',
      label: 'SOG',
      value: now.speedKn.toFixed(1),
      a11y: `Speed over ground ${now.speedKn.toFixed(1)} knots`,
      minWidth: 44,
    },
    {
      id: 'vmc',
      label: 'VMC',
      value: (now.vmcKn ?? 0).toFixed(1),
      a11y: `Velocity made good on course ${(now.vmcKn ?? 0).toFixed(1)} knots`,
      minWidth: 44,
    },
    {
      id: 'tgt',
      label: '%TGT',
      value: `${pct}`,
      tint: pctTargetTint(pct),
      a11y: `${pct} percent of target speed, ${pctTargetA11y(pct)}`,
      minWidth: 40,
    },
    (() => {
      const badge = shiftBadge(now.shiftDeg, now.twaDeg);
      const beating = Math.abs(now.twaDeg) < 70;
      const phase =
        badge && badge.text !== 'STDY' && beating
          ? Math.sign(now.shiftDeg!) === Math.sign(now.twaDeg)
            ? `, lifted ${badge.text.replace('-', 'minus ')}`
            : `, headed ${badge.text.replace('-', 'minus ')}`
          : '';
      return {
        id: 'twa' as const,
        label: 'TWA',
        value: formatTwa(now.twaDeg),
        tint: badge?.tint,
        a11y: `True wind angle ${Math.round(Math.abs(now.twaDeg))} degrees ${
          now.twaDeg > 0 ? 'starboard' : 'port'
        }${phase}`,
        minWidth: 52,
        badge: badge?.text,
      };
    })(),
    {
      id: 'tws',
      label: 'TWS',
      value: `${Math.round(now.windSpeedKn)}`,
      a11y: `True wind speed ${Math.round(now.windSpeedKn)} knots`,
      minWidth: 32,
    },
    {
      id: 'sail',
      label: 'SAIL',
      value: shortSailName(sailName),
      tint: sail ? sailTint(sail.isWorking, sail.coverage) : undefined,
      a11y: `Sail ${sailName}, ${changes} changes${
        auto ? `, ${SAIL_MODE_WORD[sailMode as Exclude<SailMode, 'manual'>]} auto-helm` : ''
      }${
        sail && !sail.isWorking && sail.coverage < 0.75 ? ', wrong sail for these conditions' : ''
      }. Opens the sail picker`,
      minWidth: 64,
      badge: auto ? `A⇄${changes}` : `⇄${changes}`,
    },
  ];
}

// Sail names cut for a band cell ("Light #1 Genoa" → "Genoa #1" is too clever;
// keep the honest head of the name).
export function shortSailName(name: string): string {
  const cuts: Record<string, string> = {
    'Working Sails': 'Working',
    'All-round Kite': 'Kite',
    'Light #1 Genoa': 'Genoa 1',
    'Code 0': 'Code 0',
    'Light Spinnaker (A1.5)': 'A1.5',
    'Jib Top / Heavy Reacher': 'Jib Top',
    'Heavy Spinnaker (S4)': 'S4',
    'Storm Jib & Trysail': 'Storm',
  };
  return cuts[name] ?? (name.length > 8 ? name.slice(0, 8) : name);
}

// Re-exported so the band and the tests agree on the neutral value colour.
export const NEUTRAL_VALUE = colors.foam;
