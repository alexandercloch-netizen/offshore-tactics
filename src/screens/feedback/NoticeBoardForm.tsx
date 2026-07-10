import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing, status } from '../../theme';
import { FeedbackContext, FeedbackDraft, FeedbackKind } from '../../services/feedback';
import Segmented from '../../components/Segmented';
import NauticalButton from '../../components/NauticalButton';

// The Notice Board form — props-driven and free of navigation/game context, so a
// render test mounts it with a stub submit (mirroring the Sailor's Card). Theme
// tokens only. The success state is an inline swap, never a modal.

export interface NoticeBoardFormProps {
  signedIn: boolean;
  diagnostics: FeedbackContext; // auto-attached, shown honestly, never editable
  submit: (draft: FeedbackDraft) => Promise<{ ok: boolean; queued: boolean }>;
  onClose: () => void; // Cancel / Back — pops the pushed screen
}

interface CatConfig {
  value: FeedbackKind;
  label: string;
  testID: string;
  messageLabel: string;
  messagePlaceholder: string;
  subjectLabel?: string;
  subjectPlaceholder?: string;
}

// One config per category: the tab label, its per-segment testID, and the one or
// two fields it asks for. Message is always required; a subject is optional.
const CATEGORIES: CatConfig[] = [
  {
    value: 'race_suggestion',
    label: 'Race',
    testID: 'feedback-cat-race',
    subjectLabel: 'Which race or course?',
    subjectPlaceholder: 'e.g. Sydney to Hobart',
    messageLabel: 'Why would it be a great addition?',
    messagePlaceholder: 'Tell the committee what makes it special…',
  },
  {
    value: 'bug',
    label: 'Bug',
    testID: 'feedback-cat-bug',
    messageLabel: 'What happened?',
    messagePlaceholder: 'Describe what went wrong…',
    subjectLabel: 'What did you expect? (optional)',
    subjectPlaceholder: 'What you thought would happen',
  },
  {
    value: 'content_request',
    label: 'Content',
    testID: 'feedback-cat-content',
    messageLabel: "What would you like to see?",
    messagePlaceholder: 'A boat, a crew member, a feature…',
    subjectLabel: 'Any detail? (optional)',
    subjectPlaceholder: 'Anything that helps',
  },
  {
    value: 'other',
    label: 'General',
    testID: 'feedback-cat-general',
    messageLabel: 'Your note',
    messagePlaceholder: 'Log anything for the committee…',
  },
];

const MESSAGE_SOFT_CAP = 1000;

export const NoticeBoardForm: React.FC<NoticeBoardFormProps> = ({
  signedIn,
  diagnostics,
  submit,
  onClose,
}) => {
  const [kind, setKind] = useState<FeedbackKind>('race_suggestion');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [replyOk, setReplyOk] = useState(false);
  const [sending, setSending] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [done, setDone] = useState<{ queued: boolean } | null>(null);

  const cat = CATEGORIES.find((c) => c.value === kind) ?? CATEGORIES[0];
  const trimmed = message.trim();
  const canSend = trimmed.length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const result = await submit({
      kind,
      message: trimmed,
      subject: subject.trim() || undefined,
      replyOk: signedIn ? replyOk : undefined,
    });
    setSending(false);
    if (result.ok) setDone({ queued: result.queued });
  };

  const reset = () => {
    setSubject('');
    setMessage('');
    setReplyOk(false);
    setDone(null);
  };

  if (done) {
    return (
      <View style={styles.card} testID="feedback-success">
        <Text style={styles.successTitle}>Logged in the ship's book. Thank you, Skipper.</Text>
        <Text style={styles.successSub}>
          {done.queued
            ? "Saved on board — it'll be posted next time you're in range."
            : 'Your note reached the Race Committee.'}
        </Text>
        <View style={styles.actions}>
          <NauticalButton label="Send another" variant="secondary" onPress={reset} testID="feedback-send-another" />
          <NauticalButton label="Back" variant="ghost" onPress={onClose} testID="feedback-back" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.column}>
      <View style={styles.card}>
        <Text style={styles.title}>Message to the Race Committee</Text>
        <Text style={styles.sub}>
          Log a note in the ship's book — suggestions, bugs and requests all welcome.
        </Text>

        <Text style={styles.fieldLabel}>What's this about?</Text>
        <Segmented<FeedbackKind>
          value={kind}
          options={CATEGORIES.map((c) => ({ value: c.value, label: c.label, testID: c.testID }))}
          onSelect={setKind}
          testID="feedback-category"
        />

        <Text style={styles.fieldLabel}>{cat.messageLabel}</Text>
        <TextInput
          style={styles.messageInput}
          value={message}
          onChangeText={(t) => setMessage(t.slice(0, MESSAGE_SOFT_CAP))}
          placeholder={cat.messagePlaceholder}
          placeholderTextColor={colors.slate}
          multiline
          testID="feedback-message"
        />
        <Text style={styles.counter}>
          {trimmed.length}/{MESSAGE_SOFT_CAP}
        </Text>

        {cat.subjectLabel ? (
          <>
            <Text style={styles.fieldLabel}>{cat.subjectLabel}</Text>
            <TextInput
              style={styles.subjectInput}
              value={subject}
              onChangeText={setSubject}
              placeholder={cat.subjectPlaceholder}
              placeholderTextColor={colors.slate}
              testID="feedback-subject"
            />
          </>
        ) : null}
      </View>

      {/* Diagnostics — auto-attached, never hidden, never editable. */}
      <View style={styles.card}>
        <Pressable
          onPress={() => setShowDiag((s) => !s)}
          accessibilityRole="button"
          testID="feedback-diagnostics-toggle"
        >
          <Text style={styles.diagToggle}>
            {showDiag ? '▾' : '▸'} Diagnostics attached
          </Text>
        </Pressable>
        {showDiag ? (
          <View style={styles.diagBody} testID="feedback-diagnostics">
            <DiagRow label="Version" value={diagnostics.appVersion ?? '—'} />
            <DiagRow label="Platform" value={diagnostics.platform} />
            <DiagRow label="Screen" value={diagnostics.screen ?? '—'} />
            {diagnostics.locale ? <DiagRow label="Locale" value={diagnostics.locale} /> : null}
            <DiagRow label="Signed in" value={diagnostics.signedIn ? 'Yes' : 'No'} />
          </View>
        ) : null}
      </View>

      {/* Reply-to-me — only when signed in (the server stamps the email; we never
          type or attach it). Guests get an honest note instead. */}
      <View style={styles.card}>
        {signedIn ? (
          <Pressable
            onPress={() => setReplyOk((r) => !r)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: replyOk }}
            style={styles.replyRow}
            testID="feedback-reply-toggle"
          >
            <View style={[styles.checkbox, replyOk && styles.checkboxOn]}>
              {replyOk ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.replyLabel}>
              You may reply to me at my account email.
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.guestNote} testID="feedback-guest-note">
            We read every note, but can't reply to guests.
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <NauticalButton
          label="Send to Committee"
          onPress={send}
          disabled={!canSend}
          loading={sending}
          testID="feedback-submit"
        />
        <NauticalButton label="Cancel" variant="ghost" onPress={onClose} testID="feedback-cancel" />
      </View>
    </View>
  );
};

const DiagRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.diagRow}>
    <Text style={styles.diagLabel}>{label}</Text>
    <Text style={styles.diagValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  column: { gap: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
  },
  title: { color: colors.foam, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  sub: { color: colors.mist, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.xs },
  fieldLabel: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  messageInput: {
    color: colors.foam,
    fontSize: fontSize.md,
    minHeight: 110,
    textAlignVertical: 'top',
    backgroundColor: colors.abyss,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.md,
  },
  subjectInput: {
    color: colors.foam,
    fontSize: fontSize.md,
    backgroundColor: colors.abyss,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.md,
  },
  counter: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  diagToggle: { color: colors.mist, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  diagBody: { marginTop: spacing.md, gap: spacing.xs },
  diagRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  diagLabel: { color: colors.slate, fontSize: fontSize.xs },
  diagValue: { color: colors.mist, fontSize: fontSize.xs },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.steel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.brass, borderColor: colors.brassLight },
  checkboxMark: { color: colors.abyss, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  replyLabel: { color: colors.mist, fontSize: fontSize.sm, flexShrink: 1 },
  guestNote: { color: colors.mist, fontSize: fontSize.sm, lineHeight: 20 },
  successTitle: { color: colors.foam, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  successSub: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  actions: { gap: spacing.md, marginTop: spacing.sm },
});

export default NoticeBoardForm;
