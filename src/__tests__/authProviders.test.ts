import { enabledOAuthProviders } from '../lib/authProviders';

describe('enabledOAuthProviders', () => {
  it('shows nothing when no flags are set', () => {
    expect(enabledOAuthProviders({})).toEqual([]);
  });

  it('enables a provider for truthy flag values, case-insensitively', () => {
    expect(enabledOAuthProviders({ EXPO_PUBLIC_ENABLE_GOOGLE: '1' }).map((p) => p.id)).toEqual([
      'google',
    ]);
    expect(enabledOAuthProviders({ EXPO_PUBLIC_ENABLE_APPLE: 'TRUE' }).map((p) => p.id)).toEqual([
      'apple',
    ]);
    expect(enabledOAuthProviders({ EXPO_PUBLIC_ENABLE_GOOGLE: 'yes' })).toHaveLength(1);
  });

  it('ignores falsy / unrecognised values', () => {
    expect(enabledOAuthProviders({ EXPO_PUBLIC_ENABLE_GOOGLE: '0' })).toEqual([]);
    expect(enabledOAuthProviders({ EXPO_PUBLIC_ENABLE_APPLE: 'false' })).toEqual([]);
    expect(enabledOAuthProviders({ EXPO_PUBLIC_ENABLE_GOOGLE: '' })).toEqual([]);
  });

  it('returns both, Google first, when both are enabled', () => {
    const ids = enabledOAuthProviders({
      EXPO_PUBLIC_ENABLE_GOOGLE: '1',
      EXPO_PUBLIC_ENABLE_APPLE: '1',
    }).map((p) => p.id);
    expect(ids).toEqual(['google', 'apple']);
  });
});
