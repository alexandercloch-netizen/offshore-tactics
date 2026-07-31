// Pure client-side auth helpers, extracted from AuthContext so they carry no
// React / Supabase / react-native imports and are unit-testable in isolation
// (see storeSafety.test.ts). AuthContext re-exports these unchanged.
// Light client-side check before hitting the network, so obvious slips get an
// instant, friendly nudge instead of a round-trip error. Returns an error string
// to show, or null when the credentials look well-formed.
export function validateCredentials(email: string, password: string): string | null {
  const trimmed = email.trim();
  // Deliberately permissive: just enough to catch a fat-fingered address.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Enter a valid email address.';
  }
  if (password.length < 6) {
    return 'Password must be at least 6 characters.';
  }
  return null;
}

// Turns Supabase's terse auth errors into plain, reassuring language. Anything
// unrecognised falls through unchanged so we never hide a real message.
export function mapAuthError(message: string | undefined): string | undefined {
  if (!message) return message;
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'That email or password is incorrect.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'An account with that email already exists. Try signing in instead.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts just now. Please wait a moment and try again.';
  }
  if (m.includes('password should be') || m.includes('password')) {
    return 'Password must be at least 6 characters.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Network problem — check your connection and try again.';
  }
  return message;
}
