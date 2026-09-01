import { useEffect, useRef } from 'preact/hooks';
import { templatePoses } from '../data/templatePose';
import { PoseFilter } from '../filter/oneEuro';
import { type GroupMatch, matchGroup, matchPose } from '../match/matcher';
import { coverCrop, makeProjection } from '../overlay/coverCrop';
import { drawOverlay, type OverlayGhost, type OverlayPerson } from '../overlay/draw';
import type { PoseEngine } from '../pose/poseClient';
import type { Landmark, MatchResult, Template } from '../pose/types';

export type { SilhouetteHandle } from '../overlay/draw';

export type LoopStats = {
  score: number;
  /** Per-person scores when a group template is active; empty otherwise. */
  perScore: number[];
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

/** Overlay layers for the current frame, reused for live draw and photo burn-in. */
export type FrameSnapshot = {
  ghosts: OverlayGhost[];
  people: OverlayPerson[];
};

type Props = {
  videoRef: Ref<HTMLVideoElement>;
  canvasRef: Ref<HTMLCanvasElement>;
  engine: PoseEngine | null;
  running: boolean;
  templateRef: Ref<Template>;
  settingsRef: Ref<LoopSettings>;
  levelRef?: Ref<{ roll: number }>;
  silhouetteRef?: Ref<import('../overlay/draw').SilhouetteHandle>;
  frameRef?: Ref<FrameSnapshot>;
  onStats: (s: LoopStats) => void;
  onAutoCapture: () => void;
  onReadyChange?: (ready: boolean) => void;
};

function groupHints(g: GroupMatch | null): string[] {
  if (!g) return [];
  let worst = -1;
  let worstScore = 101;
  g.perPose.forEach((r, i) => {
    if (g.assigned[i] != null && r.score < worstScore) {
      worstScore = r.score;
      worst = i;
    }
  });
  return worst >= 0 ? g.perPose[worst].hints : [];
}

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
    let primary: Landmark[] | null = null;
    let people: Landmark[][] = [];
    let match: MatchResult | null = null;
    let group: GroupMatch | null = null;
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
        const extra = res.extra ?? [];
        if (res.landmarks) {
          primary = filter.apply(res.landmarks, now);
          people = [primary, ...extra];
          const tpl = latest.current.templateRef.current;
          const s = latest.current.settingsRef.current;
          if (tpl && s) {
            const opts = { readyScore: s.readyScore, mirror: s.mirror };
            if (templatePoses(tpl).length > 1) {
              group = matchGroup(people, tpl, opts);
              match = null;
            } else {
              match = matchPose(primary, templatePoses(tpl)[0].landmarks, opts);
              group = null;
            }
          } else {
            match = null;
            group = null;
          }
        } else {
          primary = null;
          people = [];
          match = null;
          group = null;
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

    const buildModel = (): FrameSnapshot => {
      const tpl = latest.current.templateRef.current;
      if (!people.length) return { ghosts: [], people: [] };

      const bystanders = (matchedIdx: (i: number) => boolean): OverlayPerson[] =>
        people.map((lm, i) => ({ landmarks: lm, jointErrors: null, dim: !matchedIdx(i) }));

      if (!tpl) return { ghosts: [], people: bystanders((i) => i < 0) };

      const poses = templatePoses(tpl);

      if (group) {
        const g = group;
        const ghosts: OverlayGhost[] = [];
        poses.forEach((p, i) => {
          const li = g.assigned[i];
          if (li == null) return;
          ghosts.push({
            target: p.landmarks,
            anchor: people[li],
            jointErrors: g.perPose[i].jointErrors,
            silhouette: null,
          });
        });
        const overlayPeople: OverlayPerson[] = people.map((lm, i) => {
          const slot = g.assigned.indexOf(i);
          return {
            landmarks: lm,
            jointErrors: slot >= 0 ? g.perPose[slot].jointErrors : null,
            dim: slot < 0,
          };
        });
        return { ghosts, people: overlayPeople };
      }

      if (!primary) return { ghosts: [], people: bystanders((i) => i < 0) };
      return {
        ghosts: [
          {
            target: poses[0].landmarks,
            anchor: primary,
            jointErrors: match?.jointErrors ?? null,
            silhouette: latest.current.silhouetteRef?.current ?? null,
          },
        ],
        people: people.map((lm, i) =>
          i === 0
            ? { landmarks: lm, jointErrors: match?.jointErrors ?? null }
            : { landmarks: lm, jointErrors: null, dim: true },
        ),
      };
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
      const project = makeProjection(coverCrop(vw, vh, w, h), vw, vh, w, h);

      const model = buildModel();
      drawOverlay(ctx, {
        w,
        h,
        mirror: s?.mirror ?? false,
        project,
        ghosts: model.ghosts,
        people: model.people,
        showGrid: s?.showGrid ?? false,
        ghostStyle: s?.ghostStyle ?? 'both',
        level: latest.current.levelRef?.current ?? null,
      });

      // Only kept for photo burn-in.
      if (latest.current.frameRef && s?.burnOverlay) latest.current.frameRef.current = model;

      const readyNow = match?.ready ?? group?.ready ?? false;
      if (readyNow !== prevReady) {
        prevReady = readyNow;
        latest.current.onReadyChange?.(readyNow);
      }

      const now = performance.now();
      if (now - lastStatPush > 150) {
        lastStatPush = now;
        latest.current.onStats({
          score: match?.score ?? group?.score ?? 0,
          perScore: group ? group.perPose.map((r) => r.score) : [],
          hints: match?.hints ?? groupHints(group),
          ready: readyNow,
          fps,
          mode: engine.mode,
        });

        if (s?.autoShutter && readyNow) {
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
