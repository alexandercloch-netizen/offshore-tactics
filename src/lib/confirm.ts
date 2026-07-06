import { Alert, Platform } from 'react-native';

// A cross-platform destructive confirm. On native it uses Alert.alert (with a
// cancel + destructive button). On web Alert.alert is effectively a no-op, so
// requests route to the root-mounted ConfirmHost sheet — the app's one
// sanctioned modal (rare, blocking, destructive) — otherwise the "Retire",
// "Sign out" and "Delete account" actions would fire silently or not at all on
// the web build (which is how CI and most players run the game). If no host is
// mounted (a bare unit test, a crashed root) the old window.confirm fallback
// still stands, so a destructive action is never a silent yes.
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

// The fully-defaulted request a presenter receives.
export interface ConfirmRequest extends Required<Omit<ConfirmOptions, 'onCancel'>> {
  onCancel?: () => void;
}

type ConfirmPresenter = (request: ConfirmRequest) => void;

let presenter: ConfirmPresenter | null = null;

// Mounted by ConfirmHost. Returns the matching unregister so a remount can
// never leave a stale presenter behind.
export function registerConfirmPresenter(p: ConfirmPresenter): () => void {
  presenter = p;
  return () => {
    if (presenter === p) presenter = null;
  };
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
    if (presenter) {
      presenter({ title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel });
      return;
    }
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
