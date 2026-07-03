import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { OAuthProvider } from '../lib/authProviders';
import { clearState } from './storage';

export interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  displayName: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string; sent?: boolean }>;
  signInWithProvider: (provider: OAuthProvider) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: string }>;
}

// Where Supabase should send the user back after a magic link / OAuth round-trip
// (the web origin; native deep-linking is configured separately).
function redirectTo(): string | undefined {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return undefined;
}

function nameFromUser(user: User | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata as { display_name?: string } | undefined;
  return meta?.display_name || user.email || 'Sailor';
}

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

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error ? { error: mapAuthError(error.message) } : {};
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!supabase) return { error: 'Supabase is not configured.' };
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) return { error: mapAuthError(error.message) };
      // If email confirmation is enabled there is no session yet.
      return { needsConfirmation: !data.session };
    },
    []
  );

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    return error ? { error: error.message } : { sent: true };
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo() },
    });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  // Removes the account and all its data. A SECURITY DEFINER RPC deletes the
  // auth user, which cascades to saves/profile/leaderboard via their FKs. The
  // device's local cache for this user is cleared too, so nothing lingers after
  // deletion.
  const deleteAccount = useCallback(async () => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const uid = session?.user?.id;
    const { error } = await supabase.rpc('delete_account');
    if (error) return { error: mapAuthError(error.message) };
    if (uid) await clearState(uid);
    await supabase.auth.signOut();
    return {};
  }, [session]);

  const user = session?.user ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user,
      displayName: nameFromUser(user),
      signIn,
      signUp,
      signInWithMagicLink,
      signInWithProvider,
      signOut,
      deleteAccount,
    }),
    [
      loading,
      session,
      user,
      signIn,
      signUp,
      signInWithMagicLink,
      signInWithProvider,
      signOut,
      deleteAccount,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
