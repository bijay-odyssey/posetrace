import { useEffect, useState } from 'preact/hooks';

export type Level = { roll: number };

type OrientationEventCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** iOS 13+ gates device orientation behind a user-gesture permission call. */
export async function requestLevelPermission(): Promise<boolean> {
  const Ctor = (window as unknown as { DeviceOrientationEvent?: OrientationEventCtor }).DeviceOrientationEvent;
  if (Ctor?.requestPermission) {
    try {
      return (await Ctor.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** Left/right tilt in degrees, sampled at most once per frame. */
export function useLevel(enabled: boolean): Level | null {
  const [level, setLevel] = useState<Level | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let pending: number | null = null;

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null) return;
      pending = e.gamma;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pending != null) setLevel({ roll: pending });
        });
      }
    };

    window.addEventListener('deviceorientation', onOrient);
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return level;
}
