import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme';
import { PRIVACY_URL, TERMS_URL } from '../lib/authProviders';

// Opens an external URL, swallowing any platform/permission error so a dead link
// can never crash the auth screen. Exported so screens sharing the pattern reuse
// the same guarded open.
export async function openExternal(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch (err) {
    console.warn('Could not open link', url, err);
  }
}

// The consent line shown under both the login wall and the account form: a plain
// statement that continuing accepts the Terms and Privacy Policy, with each
// linked to its static page.
export const ConsentFooter: React.FC = () => (
  <View style={styles.wrap}>
    <Text style={styles.text}>
      By continuing you agree to our{' '}
      <Text
        style={styles.link}
        accessibilityRole="button"
        onPress={() => openExternal(TERMS_URL)}
      >
        Terms
      </Text>{' '}
      and{' '}
      <Text
        style={styles.link}
        accessibilityRole="button"
        onPress={() => openExternal(PRIVACY_URL)}
      >
        Privacy Policy
      </Text>
      .
    </Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  text: {
    color: colors.mist,
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  link: {
    color: colors.brassLight,
    textDecorationLine: 'underline',
  },
});

export default ConsentFooter;
