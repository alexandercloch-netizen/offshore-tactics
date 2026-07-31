import { validateCredentials, mapAuthError } from '../store/authValidation';
import { keyFor, GUEST_SCOPE } from '../store/storage';

// The store layer's security-relevant pure logic: per-account cache-key scoping
// (a cross-account save-leak surface) and the login-gate validators. All pure —
// no I/O — so they unit-test directly.

describe('storage keyFor — per-account cache isolation', () => {
  it('guest scope uses the bare base key', () => {
    expect(keyFor(GUEST_SCOPE)).toBe(keyFor('local'));
  });

  it('distinct accounts get distinct, non-overlapping keys', () => {
    const guest = keyFor(GUEST_SCOPE);
    const alice = keyFor('user-alice');
    const bob = keyFor('user-bob');
    expect(alice).not.toBe(bob);
    expect(alice).not.toBe(guest);
    expect(bob).not.toBe(guest);
    // A user key must be namespaced under (not equal to) the guest key, so a
    // signed-in save can never be read as the guest save or another user's.
    expect(alice.startsWith(guest)).toBe(true);
    expect(alice).toContain('user-alice');
  });
});

describe('validateCredentials — the pre-network gate', () => {
  it('accepts a well-formed email + password', () => {
    expect(validateCredentials('skipper@example.com', 'hunter2')).toBeNull();
  });
  it('rejects a malformed email', () => {
    expect(validateCredentials('not-an-email', 'hunter2')).toMatch(/valid email/i);
    expect(validateCredentials('a@b', 'hunter2')).toMatch(/valid email/i);
  });
  it('rejects a short password', () => {
    expect(validateCredentials('skipper@example.com', '123')).toMatch(/6 characters/i);
  });
  it('trims whitespace around the email', () => {
    expect(validateCredentials('  skipper@example.com  ', 'hunter2')).toBeNull();
  });
});

describe('mapAuthError — friendly, never hides a real message', () => {
  it('rewrites the common Supabase errors', () => {
    expect(mapAuthError('Invalid login credentials')).toMatch(/incorrect/i);
    expect(mapAuthError('Email not confirmed')).toMatch(/confirm your email/i);
    expect(mapAuthError('User already registered')).toMatch(/already exists/i);
  });
  it('passes an unrecognised message through unchanged', () => {
    expect(mapAuthError('Kraken sighted off the port bow')).toBe('Kraken sighted off the port bow');
    expect(mapAuthError(undefined)).toBeUndefined();
  });
});
