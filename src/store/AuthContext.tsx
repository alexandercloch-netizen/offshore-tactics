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
    return error ? { error: error.message } : {};
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!supabase) return { error: 'Supabase is not configured.' };
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) return { error: error.message };
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
  // auth user, which cascades to saves/profile/leaderboard via their FKs.
  const deleteAccount = useCallback(async () => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.rpc('delete_account');
    if (error) return { error: error.message };
    await supabase.auth.signOut();
    return {};
  }, []);

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
