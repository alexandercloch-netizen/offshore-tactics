import React from 'react';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import ProfileCard, { ProfileCardProps } from '../screens/profile/ProfileCard';
import { emptyCareer, applyRaceToCareer } from '../engine/career';
import { evaluateHonours, sailorRank } from '../engine/honours';
import { logbookStats } from '../engine/logbook';
import { RaceResult } from '../types';

// Structural render tests for the props-driven Sailor's Card. Mounted with plain
// fixtures (no game/auth context), mirroring the Harbour dashboard test.

function finish(raceId: string, position: number, timestamp = 1): RaceResult {
  return {
    raceId,
    raceName: raceId,
    boatId: 'b',
    finished: true,
    retired: false,
    position,
    fleetSize: 10,
    elapsedHours: 8,
    prizeMoney: 1000,
    summary: '',
    timestamp,
    optimalHours: 7.5,
  };
}

function props(overrides: Partial<ProfileCardProps> = {}): ProfileCardProps {
  const history = overrides.career ? [] : [finish('race-fastnet', 1), finish('race-round-island', 2, 2)];
  const career = overrides.career ?? [...history].reverse().reduce(applyRaceToCareer, emptyCareer());
  const stats = logbookStats(history);
  const awards = evaluateHonours(career, history).awards;
  return {
    displayName: 'Test Skipper',
    isGuest: true,
    club: 'Royal Yacht Squadron',
    homePortName: 'Cowes, Isle of Wight',
    rank: sailorRank(career),
    career,
    stats,
    awards,
    best: { raceName: 'race-fastnet', elapsedHours: 8 },
    funds: 250000,
    money: (n: number) => `$${n}`,
    currency: 'USD',
    ownedBoats: [{ id: 'boat-1', name: 'Sea Sprite' }],
    crew: [{ id: 'crew-1', name: 'Skip' }],
    homeWatersLabel: 'UK & Ireland',
    goalLabel: 'Win, obviously',
    configured: false,
    signedIn: false,
    privacyNote: 'Your logbook lives on this device unless you sign in.',
    creditLine: 'Weather data by Open-Meteo.com',
    width: 360,
    onSetCurrency: () => undefined,
    onEditPreferences: () => undefined,
    onViewTrophyCase: () => undefined,
    ...overrides,
  };
}

function mount(p: ProfileCardProps): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ProfileCard {...p} />);
  });
  return tree;
}

function byTestID(tree: ReactTestRenderer, id: string): ReactTestInstance[] {
  return tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
}

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAll((n) => typeof n.type === 'string' && (n.type as string) === 'Text')
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.join('') : String(c ?? '');
    })
    .join(' | ');
}

describe('the Sailor\'s Card', () => {
  it('mounts every populated section', () => {
    const tree = mount(props());
    for (const section of [
      'profile-identity',
      'profile-career',
      'profile-honours-strip',
      'profile-form',
      'profile-shed',
      'profile-prefs',
      'profile-account',
    ]) {
      expect(byTestID(tree, section)).toHaveLength(1);
    }
    // The currency toggle the e2e depends on is preserved.
    expect(byTestID(tree, 'currency-toggle')).toHaveLength(1);
  });

  it('shows the honours earned count and a trophy-case affordance', () => {
    const career = applyRaceToCareer(emptyCareer(), finish('race-fastnet', 1));
    const awards = evaluateHonours(career, [finish('race-fastnet', 1)]).awards;
    const earned = awards.filter((a) => a.earned).length;
    const tree = mount(props({ career, awards }));
    expect(byTestID(tree, 'profile-honours-strip')).toHaveLength(1);
    expect(byTestID(tree, 'view-trophy-case')).toHaveLength(1);
    expect(allText(tree)).toContain(`${earned} / `);
  });

  it('renders a start-your-logbook CTA, not a grid of zeros, at zero history', () => {
    const tree = mount(props({ career: emptyCareer(), awards: evaluateHonours(emptyCareer(), []).awards }));
    expect(byTestID(tree, 'profile-identity')).toHaveLength(1);
    expect(byTestID(tree, 'profile-career')).toHaveLength(1);
    expect(allText(tree)).toContain('Your logbook is empty.');
    // No form or shed data → those cards are absent (never invented zeros).
    expect(byTestID(tree, 'profile-form')).toHaveLength(0);
  });

  it('renders the Free Sailing toggle when wired, and frozen funds read as the mode', () => {
    // Without the setter (older mounts/fixtures) the toggle is simply absent.
    expect(byTestID(mount(props()), 'free-sailing-toggle')).toHaveLength(0);
    const tree = mount(props({ freeSailing: true, onSetFreeSailing: () => undefined }));
    expect(byTestID(tree, 'free-sailing-toggle')).toHaveLength(1);
    // The funds row shows the mode, not a frozen number.
    expect(allText(tree)).toContain('Free Sailing');
  });

  it('does not crash with an empty career and no honours', () => {
    expect(() =>
      mount(props({ career: emptyCareer(), awards: [], stats: logbookStats([]) as ProfileCardProps['stats'], best: undefined, ownedBoats: [], crew: [] }))
    ).not.toThrow();
  });

  it('hosts no Modal', () => {
    const tree = mount(props());
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0);
  });

  it('splits into two panes when wide', () => {
    const tree = mount(props({ twoPane: true, width: 900 }));
    expect(byTestID(tree, 'profile-left-pane')).toHaveLength(1);
    expect(byTestID(tree, 'profile-right-pane')).toHaveLength(1);
  });
});
