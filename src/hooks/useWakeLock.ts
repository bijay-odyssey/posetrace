import { useEffect } from 'preact/hooks';

type Sentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };

/** Keep the screen awake while `active`. No-op where unsupported (iOS < 16.4). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await nav.wakeLock!.request('screen');
      } catch {
        /* denied or blocked - ignore */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
