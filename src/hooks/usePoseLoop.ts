import { useEffect, useRef } from 'preact/hooks';
import { PoseFilter } from '../filter/oneEuro';
import { matchPose } from '../match/matcher';
import { drawOverlay } from '../overlay/draw';
import type { PoseEngine } from '../pose/poseClient';
import type { Landmark, MatchResult, Template } from '../pose/types';

export type LoopStats = {
  score: number;
  hints: string[];
  ready: boolean;
  fps: number;
  mode: string;
};

export type GhostStyle = 'skeleton' | 'silhouette' | 'both';

export type LoopSettings = {
  mirror: boolean;
  showGrid: boolean;
  autoShutter: boolean;
  readyScore: number;
  ghostStyle: GhostStyle;
  burnOverlay: boolean;
};

type Ref<T> = { current: T | null };

export type SilhouetteHandle = {
  img: CanvasImageSource;
  bbox: { x: number; y: number; w: number; h: number };
};

/** Latest inference output, for compositing the overlay into a captured photo. */
export type FrameSnapshot = {
  live: Landmark[] | null;
  others: Landmark[][];
  jointErrors: Record<string, number> | null;
};

type Props = {
  videoRef: Ref<HTMLVideoElement>;
  canvasRef: Ref<HTMLCanvasElement>;
  engine: PoseEngine | null;
  running: boolean;
  templateRef: Ref<Template>;
  settingsRef: Ref<LoopSettings>;
  levelRef?: Ref<{ roll: number }>;
  silhouetteRef?: Ref<SilhouetteHandle>;
  frameRef?: Ref<FrameSnapshot>;
  onStats: (s: LoopStats) => void;
  onAutoCapture: () => void;
  onReadyChange?: (ready: boolean) => void;
};

export function usePoseLoop(props: Props): void {
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const { engine, running } = props;
    const video = props.videoRef.current;
    const canvas = props.canvasRef.current;
    if (!engine || !running || !video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeCanvas = () => {
      const r = video.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(video);

    const filter = new PoseFilter();
    let stopped = false;
    let raf = 0;
    let busy = false;
    let lastTs = 0;
    let liveLandmarks: Landmark[] | null = null;
    let others: Landmark[][] = [];
    let match: MatchResult | null = null;
    let readySince: number | null = null;
    let prevReady = false;

    let frameCount = 0;
    let fpsWindowStart = performance.now();
    let fps = 0;
    let lastStatPush = 0;

    const infer = async () => {
      if (busy || video.readyState < 2) return;
      busy = true;
      const now = performance.now();
      const ts = Math.max(lastTs + 1, Math.round(now));
      lastTs = ts;
      try {
        const res = await engine.detect(video, ts);
        others = res.extra ?? [];
        if (res.landmarks) {
          liveLandmarks = filter.apply(res.landmarks, now);
          const tpl = latest.current.templateRef.current;
          const s = latest.current.settingsRef.current;
          match =
            tpl && s
              ? matchPose(liveLandmarks, tpl, { readyScore: s.readyScore, mirror: s.mirror })
              : null;
        } else {
          liveLandmarks = null;
          match = null;
          filter.reset();
        }
      } catch {
        /* transient inference error - keep looping */
      } finally {
        busy = false;
      }

      frameCount++;
      const now2 = performance.now();
      if (now2 - fpsWindowStart >= 1000) {
        fps = Math.round((frameCount * 1000) / (now2 - fpsWindowStart));
        frameCount = 0;
        fpsWindowStart = now2;
      }
    };

    const render = () => {
      if (stopped) return;
      void infer();

      const s = latest.current.settingsRef.current;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Map normalized camera-frame coords -> CSS pixels, matching the
      // `object-fit: cover` crop the <video> applies.
      const vw = video.videoWidth || w;
      const vh = video.videoHeight || h;
      const coverScale = Math.max(w / vw, h / vh);
      const dispW = vw * coverScale;
      const dispH = vh * coverScale;
      const offX = (w - dispW) / 2;
      const offY = (h - dispH) / 2;
      const project = (nx: number, ny: number): [number, number] => [
        offX + nx * dispW,
        offY + ny * dispH,
      ];

      drawOverlay(ctx, {
        w,
        h,
        mirror: s?.mirror ?? false,
        project,
        live: liveLandmarks,
        others,
        template: latest.current.templateRef.current,
        jointErrors: match?.jointErrors ?? null,
        showGrid: s?.showGrid ?? false,
        silhouette: latest.current.silhouetteRef?.current ?? null,
        ghostStyle: s?.ghostStyle ?? 'both',
        level: latest.current.levelRef?.current ?? null,
      });

      if (latest.current.frameRef) {
        latest.current.frameRef.current = {
          live: liveLandmarks,
          others,
          jointErrors: match?.jointErrors ?? null,
        };
      }

      const readyNow = match?.ready ?? false;
      if (readyNow !== prevReady) {
        prevReady = readyNow;
        latest.current.onReadyChange?.(readyNow);
      }

      const now = performance.now();
      if (now - lastStatPush > 150) {
        lastStatPush = now;
        latest.current.onStats({
          score: match?.score ?? 0,
          hints: match?.hints ?? [],
          ready: readyNow,
          fps,
          mode: engine.mode,
        });

        if (s?.autoShutter && match?.ready) {
          readySince ??= now;
          if (now - readySince > 700) {
            readySince = null;
            latest.current.onAutoCapture();
          }
        } else {
          readySince = null;
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [props.engine, props.running]);
}
