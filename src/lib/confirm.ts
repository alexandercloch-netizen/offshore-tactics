import { Alert, Platform } from 'react-native';

// A cross-platform destructive confirm. On native it uses Alert.alert (with a
// cancel + destructive button); on web Alert.alert is effectively a no-op, so it
// falls back to the browser's window.confirm — otherwise the "Retire", "Sign
// out" and "Delete account" actions would fire silently or not at all on the web
// build (which is how CI and most players run the game).
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function confirmAction({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmOptions): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`${title}\n\n${message}`)
      : true;
    if (ok) onConfirm();
    else onCancel?.();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel', onPress: onCancel },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}
