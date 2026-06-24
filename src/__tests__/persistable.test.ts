import { cloudSnapshot } from '../store/persistable';
import { GameState } from '../types';

// A representative mid-race state with both durable and transient fields set.
const midRace = {
  funds: 5000,
  selectedDivision: 'pro',
  ownedBoatIds: ['boat-sprite'],
  selectedCrewIds: ['c1', 'c2'],
  provisions: [],
  strategy: { bias: 0, effort: 'cruise' },
  profile: { fleet: [] },
  condition: { hullIntegrity: 90, crewStamina: 80, crewMorale: 80 },
  history: [],
  eventLog: ['Off the line'],
  savedAt: 123,
  // Transient live-race runtime — should be stripped before the cloud write.
  progress: { distanceCoveredNm: 10 },
  windField: { baseDir: 220 },
  tidalField: { peakRateKn: 1.5 },
  fleet: [{ id: 'ai-1' }, { id: 'ai-2' }],
  weather: { windStrength: 'Fresh' },
} as unknown as GameState;

describe('cloudSnapshot', () => {
  it('strips the transient live-race fields', () => {
    const snap = cloudSnapshot(midRace);
    expect(snap.progress).toBeUndefined();
    expect(snap.windField).toBeUndefined();
    expect(snap.tidalField).toBeUndefined();
    expect(snap.fleet).toBeUndefined();
    expect(snap.weather).toBeUndefined();
  });

  it('keeps the durable campaign state', () => {
    const snap = cloudSnapshot(midRace);
    expect(snap.funds).toBe(5000);
    expect(snap.ownedBoatIds).toEqual(['boat-sprite']);
    expect(snap.selectedCrewIds).toEqual(['c1', 'c2']);
    expect(snap.history).toEqual([]);
    expect(snap.eventLog).toEqual(['Off the line']);
    expect(snap.savedAt).toBe(123);
    expect(snap.strategy).toEqual({ bias: 0, effort: 'cruise' });
  });

  it('does not mutate the original state', () => {
    cloudSnapshot(midRace);
    expect(midRace.progress).toBeDefined();
    expect(midRace.fleet).toBeDefined();
  });
});
