import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { useAuth } from '../store/AuthContext';
import { enabledOAuthProviders, PRIVACY_URL } from '../lib/authProviders';
import NauticalButton from '../components/NauticalButton';

type Mode = 'signin' | 'signup';

// The login wall. Shown as the whole app when cloud is configured and nobody is
// signed in; once a session exists the navigator swaps to the game, so this
// screen never needs to navigate anywhere itself.
export const AuthGateScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithMagicLink, signInWithProvider } = useAuth();
  const providers = enabledOAuthProviders();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setNotice(null);
  };

  const onProvider = async (provider: 'google' | 'apple') => {
    reset();
    setBusy(true);
    const result = await signInWithProvider(provider);
    setBusy(false);
    if (result.error) setError(result.error);
    // On success the browser redirects; the session change swaps the navigator.
  };

  const onMagicLink = async () => {
    reset();
    if (!email) {
      setError('Enter your email for a sign-in link.');
      return;
    }
    setBusy(true);
    const result = await signInWithMagicLink(email);
    setBusy(false);
    if (result.error) setError(result.error);
    else setNotice('Check your email for a one-tap sign-in link.');
  };

  const onPassword = async () => {
    reset();
    if (!email || !password || (mode === 'signup' && !name)) {
      setError('Please fill in every field.');
      return;
    }
    setBusy(true);
    const result =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, name);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'signup' && 'needsConfirmation' in result && result.needsConfirmation) {
      setNotice('Account created. Check your email to confirm, then sign in.');
      setMode('signin');
    }
    // Otherwise a session now exists and the navigator swaps automatically.
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text style={styles.kicker}>Offshore Tactics</Text>
        <Text style={styles.title}>Sign in to sail</Text>
        <Text style={styles.body}>
          Your campaign, fleet and times sync across every device. It only takes a
          moment.
        </Text>

        {providers.length > 0 ? (
          <View style={styles.providerGroup}>
            {providers.map((p) => (
              <NauticalButton
                key={p.id}
                label={p.label}
                variant="secondary"
                onPress={() => onProvider(p.id)}
                disabled={busy}
              />
            ))}
            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.line} />
            </View>
          </View>
        ) : null}

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <NauticalButton
          label="Email me a sign-in link"
          variant="secondary"
          onPress={onMagicLink}
          loading={busy}
        />

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>or use a password</Text>
          <View style={styles.line} />
        </View>

        {mode === 'signup' ? (
          <Field
            label="Display name"
            value={name}
            onChangeText={setName}
            placeholder="Skipper name"
            autoCapitalize="words"
          />
        ) : null}
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <View style={styles.actions}>
          <NauticalButton
            label={mode === 'signin' ? 'Sign In' : 'Create Account'}
            onPress={onPassword}
            loading={busy}
          />
          <NauticalButton
            label={mode === 'signin' ? "Need an account? Sign up" : 'Have an account? Sign in'}
            variant="ghost"
            onPress={() => {
              reset();
              setMode(mode === 'signin' ? 'signup' : 'signin');
            }}
          />
        </View>

        <Text style={styles.privacy} onPress={() => Linking.openURL(PRIVACY_URL)}>
          Privacy Policy
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

interface FieldProps extends React.ComponentProps<typeof TextInput> {
  label: string;
}

const Field: React.FC<FieldProps> = ({ label, ...inputProps }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput {...inputProps} placeholderTextColor={colors.slate} style={styles.input} />
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { paddingHorizontal: spacing.xl },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: { color: colors.foam, fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  body: { color: colors.mist, fontSize: fontSize.md, lineHeight: 22, marginTop: spacing.sm, marginBottom: spacing.xl },
  providerGroup: { gap: spacing.md },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.hull },
  dividerText: { color: colors.slate, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 1 },
  field: { marginBottom: spacing.md },
  label: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.foam,
    fontSize: fontSize.md,
  },
  error: { color: colors.signalRed, fontSize: fontSize.sm, marginTop: spacing.sm },
  notice: { color: colors.signalGreen, fontSize: fontSize.sm, marginTop: spacing.sm },
  actions: { gap: spacing.md, marginTop: spacing.md },
  privacy: {
    color: colors.slate,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xl,
    textDecorationLine: 'underline',
  },
});

export default AuthGateScreen;
