import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { useAuth } from '../store/AuthContext';
import { updateDisplayName } from '../services/profile';
import { PRIVACY_URL } from '../lib/authProviders';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

type Mode = 'signin' | 'signup';

export const AuthScreen: React.FC<Props> = ({ navigation }) => {
  const { configured, user, displayName, signIn, signUp, signOut, deleteAccount } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);
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
      return;
    }
    navigation.goBack();
  };

  // Keep the editable name field seeded with the live display name.
  useEffect(() => {
    if (user && displayName) setName(displayName);
  }, [user, displayName]);

  const saveName = async () => {
    if (!user) return;
    setError(null);
    setNotice(null);
    if (!name.trim()) {
      setError('Enter a display name.');
      return;
    }
    setBusy(true);
    const result = await updateDisplayName(user.id, name);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice('Display name updated.');
  };

  const confirmDelete = () => {
    if (!user) return;
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all your cloud data — fleet, history and saved campaign. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const result = await deleteAccount();
            setBusy(false);
            if (result.error) setError(result.error);
            // On success the session ends and the navigator swaps to the wall.
          },
        },
      ]
    );
  };

  if (!configured) {
    return (
      <View style={styles.notConfigured}>
        <Text style={styles.title}>Cloud features are off</Text>
        <Text style={styles.body}>
          Supabase isn't configured for this build, so sign-in, cloud save and
          the leaderboard are disabled. The game still runs and saves locally on
          this device.
        </Text>
        <NauticalButton label="Back" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  if (user) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Your account</Text>
          <Text style={styles.body}>
            Signed in as {user.email}. Your campaign syncs across every device you
            sign in on. Your display name is what appears on the global leaderboard.
          </Text>

          <Field
            label="Display name"
            value={name}
            onChangeText={setName}
            placeholder="Skipper name"
            autoCapitalize="words"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <View style={styles.actions}>
            <NauticalButton label="Save Display Name" onPress={saveName} loading={busy} />
            <NauticalButton
              label="Sign Out"
              variant="secondary"
              onPress={async () => {
                await signOut();
                navigation.goBack();
              }}
            />
            <NauticalButton label="Back" variant="ghost" onPress={() => navigation.goBack()} />
          </View>

          <View style={styles.dangerZone}>
            <Text style={styles.privacyLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
            <Text style={styles.deleteLink} onPress={confirmDelete}>
              Delete account
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {mode === 'signin' ? 'Welcome back' : 'Join the fleet'}
        </Text>
        <Text style={styles.body}>
          Sign in to sync your campaign across devices and post times to the
          global leaderboard.
        </Text>

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
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
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
            onPress={submit}
            loading={busy}
          />
          <NauticalButton
            label={
              mode === 'signin'
                ? "Need an account? Sign up"
                : 'Have an account? Sign in'
            }
            variant="ghost"
            onPress={() => {
              setError(null);
              setNotice(null);
              setMode(mode === 'signin' ? 'signup' : 'signin');
            }}
          />
        </View>
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
    <TextInput
      {...inputProps}
      placeholderTextColor={colors.slate}
      style={styles.input}
    />
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  content: {
    padding: spacing.xl,
  },
  notConfigured: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.abyss,
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.mist,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  field: {
    marginBottom: spacing.md,
  },
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
  error: {
    color: colors.signalRed,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  notice: {
    color: colors.signalGreen,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  dangerZone: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  privacyLink: {
    color: colors.slate,
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
  },
  deleteLink: {
    color: colors.signalRed,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});

export default AuthScreen;
