import { logbookStats } from '../engine/logbook';
import { getRaceById } from '../data';
import { RaceResult } from '../types';

// The logbook aggregates ONLY what the history actually recorded — old saves
// miss every newer optional field, and their races must still count without a
// single invented number.

// A pre-analytics save entry: nothing optional at all.
function oldSave(raceId: string, position: number, over: Partial<RaceResult> = {}): RaceResult {
  return {
    raceId,
    raceName: raceId,
    boatId: 'b',
    finished: true,
    retired: false,
    position,
    fleetSize: 10,
    elapsedHours: 8,
    prizeMoney: 0,
    summary: '',
    timestamp: 1,
    ...over,
  };
}

describe('logbookStats', () => {
  it('opens empty for a fresh profile — zero counts, no invented metrics', () => {
    const stats = logbookStats([]);
    expect(stats.sailed).toBe(0);
    expect(stats.finished).toBe(0);
    expect(stats.nmLogged).toBe(0);
    expect(stats.paceVsOptimalPct).toBeUndefined();
    expect(stats.rightSailPct).toBeUndefined();
    expect(stats.fumbleRatePct).toBeUndefined();
    expect(stats.bestDuel).toBeUndefined();
    expect(stats.biggestWin).toBeUndefined();
    expect(stats.positionSpark).toEqual([]);
  });

  it('counts an old save with no optional fields, hiding the data-less stats', () => {
    const stats = logbookStats([oldSave('race-round-island', 4)]);
    expect(stats.sailed).toBe(1);
    expect(stats.finished).toBe(1);
    expect(stats.podiums).toBe(0);
    expect(stats.nmLogged).toBe(getRaceById('race-round-island')!.distanceNm);
    expect(stats.paceVsOptimalPct).toBeUndefined();
    expect(stats.rightSailPct).toBeUndefined();
    expect(stats.fumbleRatePct).toBeUndefined();
    expect(stats.bestDuel).toBeUndefined();
    expect(stats.positionSpark).toEqual([(10 - 4) / 9]);
  });

  it('a retirement counts as sailed, never as finished miles', () => {
    const stats = logbookStats([
      oldSave('race-round-island', 9, { retired: true, finished: false }),
    ]);
    expect(stats.sailed).toBe(1);
    expect(stats.finished).toBe(0);
    expect(stats.nmLogged).toBe(0);
    expect(stats.positionSpark).toEqual([]);
  });

  it('aggregates the full analytics from a mixed history', () => {
    const history: RaceResult[] = [
      // Old save, corrected 5th of 10.
      oldSave('race-round-island', 5),
      // A retirement (counts sailed only).
      oldSave('race-cowes-dinard', 10, { retired: true, finished: false }),
      // A podium with the debrief geometry and sail bookkeeping.
      oldSave('race-round-island', 2, {
        optimalHours: 8, // sailed 10h against an 8h perfect line → 80%
        elapsedHours: 10,
        rightSailPct: 90,
        sailChanges: 3,
        sailChangesFumbled: 1,
        nearestCorrectedGapSeconds: 95,
        nearestRivalName: 'Sea Wolf',
        nearestRivalAhead: true,
      }),
      // A win with a wide margin over second.
      oldSave('race-malta-syracuse', 1, {
        optimalHours: 9,
        elapsedHours: 10, // 90%
        rightSailPct: 70,
        sailChanges: 1,
        sailChangesFumbled: 0,
        nearestCorrectedGapSeconds: 600,
        nearestRivalName: 'Kestrel',
        nearestRivalAhead: false,
      }),
    ];
    const stats = logbookStats(history);
    expect(stats.sailed).toBe(4);
    expect(stats.finished).toBe(3);
    expect(stats.podiums).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.nmLogged).toBe(
      getRaceById('race-round-island')!.distanceNm * 2 +
        getRaceById('race-malta-syracuse')!.distanceNm
    );
    // Only the two races that captured optimalHours count toward pace.
    expect(stats.paceVsOptimalPct).toBeCloseTo(((0.8 + 0.9) / 2) * 100);
    expect(stats.rightSailPct).toBeCloseTo(80);
    // 1 fumble across 4 committed changes.
    expect(stats.fumbleRatePct).toBeCloseTo(25);
    expect(stats.bestDuel).toEqual({
      gapSeconds: 95,
      rival: 'Sea Wolf',
      raceName: 'race-round-island',
    });
    expect(stats.biggestWin).toEqual({
      gapSeconds: 600,
      rival: 'Kestrel',
      raceName: 'race-malta-syracuse',
    });
    // Percentiles for the three FINISHED races, oldest first.
    expect(stats.positionSpark).toEqual([(10 - 5) / 9, (10 - 2) / 9, 1]);
  });

  it('caps the sparkline at the last ten finishes', () => {
    const history = Array.from({ length: 14 }, (_, i) =>
      oldSave('race-round-island', (i % 10) + 1)
    );
    expect(logbookStats(history).positionSpark).toHaveLength(10);
  });

  it('ignores a zero-change wardrobe race in the fumble rate denominator', () => {
    const stats = logbookStats([
      oldSave('race-round-island', 3, { sailChanges: 0, sailChangesFumbled: 0 }),
    ]);
    expect(stats.fumbleRatePct).toBeUndefined();
  });
});
