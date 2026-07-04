// The supabase client drags the React Native chain into a node test; the gate
// under test is pure, so stub the client out (unconfigured = null, as in CI).
jest.mock('../lib/supabase', () => ({ supabase: null }));

import { submitRaceResult } from '../services/leaderboard';
import { LeaderboardEntry, RaceResult } from '../types';

// The leaderboard gate: the ranked ladder is the seasonal game only. A result
// carrying a weather-scenario stamp must NEVER reach the submit function —
// fail-closed at the single submission choke point.

const result = (overrides: Partial<RaceResult> = {}): RaceResult => ({
  raceId: 'race-fastnet',
  raceName: 'Rolex Fastnet Race',
  boatId: 'boat-sprite',
  finished: true,
  retired: false,
  position: 3,
  fleetSize: 20,
  elapsedHours: 90,
  prizeMoney: 1000,
  summary: 'A podium.',
  timestamp: 1,
  ...overrides,
});

const entry: LeaderboardEntry = {
  user_id: 'u1',
  display_name: 'Sailor',
  race_id: 'race-fastnet',
  race_name: 'Rolex Fastnet Race',
  position: 3,
  fleet_size: 20,
  elapsed_hours: 90,
  prize_money: 1000,
  retired: false,
};

describe('submitRaceResult', () => {
  it('never calls the submit fn for a scenario run', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    await submitRaceResult(
      result({
        scenario: {
          kind: 'live',
          model: 'ecmwf_ifs025',
          issuedAt: '2026-07-04T06:00:00.000Z',
          label: "Today's forecast",
        },
      }),
      entry,
      submit
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('gates a historic scenario too — any stamp fails closed', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    await submitRaceResult(
      result({
        scenario: {
          kind: 'historic',
          model: 'era5',
          issuedAt: '2026-07-04T06:00:00.000Z',
          label: 'The 1979 race',
          year: 1979,
        },
      }),
      entry,
      submit
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits a seasonal run unchanged', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    await submitRaceResult(result(), entry, submit);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(entry);
  });
});
