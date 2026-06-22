// OAuth providers are shown only when explicitly enabled, because each needs
// matching client credentials configured in the Supabase dashboard. This keeps
// the login wall honest — no buttons that would error because the provider
// isn't set up yet. Magic-link and email/password always work with just the
// Supabase URL + anon key.

export type OAuthProvider = 'google' | 'apple';

export interface OAuthProviderInfo {
  id: OAuthProvider;
  label: string;
}

const FLAG_TRUE = new Set(['1', 'true', 'yes']);

function enabled(value: string | undefined): boolean {
  return value !== undefined && FLAG_TRUE.has(value.toLowerCase());
}

// The OAuth providers to surface on the login wall, per env flags.
export function enabledOAuthProviders(
  env: Record<string, string | undefined> = process.env
): OAuthProviderInfo[] {
  const providers: OAuthProviderInfo[] = [];
  if (enabled(env.EXPO_PUBLIC_ENABLE_GOOGLE)) {
    providers.push({ id: 'google', label: 'Continue with Google' });
  }
  if (enabled(env.EXPO_PUBLIC_ENABLE_APPLE)) {
    providers.push({ id: 'apple', label: 'Continue with Apple' });
  }
  return providers;
}

// Where the privacy policy lives (required for app-store / GDPR compliance).
export const PRIVACY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://offshoretactics.netlify.app/privacy';
