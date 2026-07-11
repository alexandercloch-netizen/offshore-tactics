import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types';
import { colors, spacing } from '../theme';
import { useAuth } from '../store/AuthContext';
import { feedbackContext, FeedbackDraft, submitFeedback } from '../services/feedback';
import NoticeBoardForm from './feedback/NoticeBoardForm';

// The Notice Board route — a thin wrapper that assembles the diagnostics context
// and the submit closure, then hands them to the props-driven form. Pushed over
// the profile/home, guest-first: with no Supabase env the submit degrades to the
// local queue and the form reports it honestly.

type Props = NativeStackScreenProps<RootStackParamList, 'NoticeBoard'>;

export const NoticeBoardScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user, configured } = useAuth();
  const signedIn = Boolean(user && configured);

  const diagnostics = useMemo(
    () => feedbackContext(signedIn, route.params?.fromRoute),
    [signedIn, route.params?.fromRoute]
  );

  const submit = (draft: FeedbackDraft) => submitFeedback(draft, diagnostics, user?.id);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      testID="notice-board"
    >
      <NoticeBoardForm
        signedIn={signedIn}
        diagnostics={diagnostics}
        submit={submit}
        onClose={() => navigation.goBack()}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg },
});

export default NoticeBoardScreen;
