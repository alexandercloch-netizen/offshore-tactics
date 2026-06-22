import { buildInstrumentReport } from '../engine/instruments';
import { WeatherOutlook } from '../engine/wind';
import { BoatCondition, InstrumentReading, RaceProgress } from '../types';

const condition: BoatCondition = { hullIntegrity: 80, crewStamina: 70, crewMorale: 60 };
const outlook: WeatherOutlook = {
  nowKn: 15,
  soonKn: 19,
  peakKn: 19,
  trend: 'building',
  warn: false,
  headline: 'Fresh breeze building',
  lookaheadH: 2,
};

function reading(
  atNm: number,
  hours: number,
  windDir: number,
  windSpeedKn: number,
  speedKn: number,
  position: number
): InstrumentReading {
  return { atNm, hours, windDir, windSpeedKn, speedKn, position };
}

function progress(readings: InstrumentReading[], over: Partial<RaceProgress> = {}): RaceProgress {
  return {
    distanceCoveredNm: 110,
    totalDistanceNm: 200,
    windDir: 208,
    windSpeedKn: 15,
    pointOfSail: 'Reach',
    position: 3,
    legStartNm: 100,
    readings,
    ...over,
  } as unknown as RaceProgress;
}

describe('buildInstrumentReport', () => {
  const readings = [
    reading(100, 10, 200, 12, 7, 5),
    reading(105, 10.5, 204, 13, 7.5, 4),
    reading(110, 11, 208, 15, 8, 3),
  ];

  it('reports the current instruments from the latest sample and progress', () => {
    const r = buildInstrumentReport(progress(readings), condition, 20, outlook);
    expect(r.now.speedKn).toBe(8); // latest reading
    expect(r.now.windSpeedKn).toBe(15);
    expect(r.now.position).toBe(3);
    expect(r.now.fleetSize).toBe(20);
    expect(r.now.distanceToGoNm).toBe(90);
    expect(r.now.hull).toBe(80);
  });

  it('summarises the leg: distance, a veering build, and places gained', () => {
    const r = buildInstrumentReport(progress(readings), condition, 20, outlook);
    expect(r.leg.nm).toBe(10);
    expect(r.leg.hours).toBeCloseTo(1, 5);
    expect(r.leg.avgSpeedKn).toBeCloseTo(10, 5);
    expect(r.leg.windShiftDeg).toBe(8); // 200 -> 208, veered
    expect(r.leg.windDeltaKn).toBe(3); // 12 -> 15, building
    expect(r.leg.placesGained).toBe(2); // 5th -> 3rd
    expect(r.windSeries).toEqual([12, 13, 15]);
  });

  it('reads a backing shift as negative', () => {
    const backing = [reading(100, 10, 200, 12, 7, 4), reading(110, 11, 188, 12, 7, 4)];
    const r = buildInstrumentReport(progress(backing), condition, 20, outlook);
    expect(r.leg.windShiftDeg).toBe(-12);
  });

  it('only counts samples from the current leg', () => {
    // An older reading before legStartNm must be ignored.
    const withOld = [reading(40, 4, 100, 9, 6, 8), ...readings];
    const r = buildInstrumentReport(progress(withOld), condition, 20, outlook);
    expect(r.leg.nm).toBe(10); // 100 -> 110, not 40 -> 110
    expect(r.windSeries).toEqual([12, 13, 15]);
  });
});
