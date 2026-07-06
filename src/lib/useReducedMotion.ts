import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// Does the player prefer reduced motion? react-native-web does NOT honour the
// CSS media query for RN Animated work, so we read it ourselves: `matchMedia`
// on web, `AccessibilityInfo` on native. Defaults to false (full motion) until
// the platform answers; both paths subscribe so a live settings change is
// respected mid-race.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Guard the DOM APIs: jsdom-less tests and very old browsers lack them.
      type MediaQueryLike = {
        matches: boolean;
        addEventListener?: (type: 'change', cb: (e: { matches: boolean }) => void) => void;
        removeEventListener?: (type: 'change', cb: (e: { matches: boolean }) => void) => void;
      };
      const w = globalThis as { matchMedia?: (q: string) => MediaQueryLike };
      if (typeof w.matchMedia !== 'function') return undefined;
      const query = w.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(query.matches);
      const onChange = (e: { matches: boolean }): void => setReduced(e.matches);
      query.addEventListener?.('change', onChange);
      return () => query.removeEventListener?.('change', onChange);
    }
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (mounted) setReduced(Boolean(v));
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) =>
      setReduced(Boolean(v))
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

export default useReducedMotion;
