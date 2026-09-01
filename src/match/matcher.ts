import type { Landmark, MatchOptions, MatchResult, Template } from '../pose/types';
import { templatePoses } from '../data/templatePose';
import { bbox, normalizePose } from './normalize';
import { poseAngles } from './angles';
import { buildHints } from './hints';

const WEIGHTS: Record<string, number> = {
  lElbow: 1,
  rElbow: 1,
  lShoulder: 1.2,
  rShoulder: 1.2,
  lHip: 1,
  rHip: 1,
  lKnee: 0.9,
  rKnee: 0.9,
  torso: 1.3,
};

/** Weighted mean angle error (radians) that maps to score 0. ~51 degrees. */
const MAX_ERR = 0.9;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function matchPose(
  liveRaw: Landmark[],
  targetLandmarks: Landmark[],
  opts: MatchOptions,
): MatchResult {
  const liveAngles = poseAngles(normalizePose(liveRaw));
  const targetAngles = poseAngles(normalizePose(targetLandmarks));

  const jointErrors: Record<string, number> = {};
  let weightSum = 0;
  let errSum = 0;

  for (const key of Object.keys(WEIGHTS)) {
    const a = liveAngles[key];
    const b = targetAngles[key];
    if (!isFinite(a) || !isFinite(b)) continue;
    const err = Math.abs(a - b);
    jointErrors[key] = err;
    weightSum += WEIGHTS[key];
    errSum += WEIGHTS[key] * Math.min(err, MAX_ERR);
  }

  const meanErr = weightSum > 0 ? errSum / weightSum : MAX_ERR;
  const score = Math.round(clamp01(1 - meanErr / MAX_ERR) * 100);

  const lb = bbox(liveRaw);
  const tb = bbox(targetLandmarks);
  const framing = {
    dx: lb.cx - tb.cx,
    dy: lb.cy - tb.cy,
    scale: tb.h > 1e-4 ? lb.h / tb.h : 1,
  };

  return {
    score,
    ready: score >= opts.readyScore,
    jointErrors,
    framing,
    hints: buildHints(jointErrors, liveAngles, targetAngles, framing, opts.mirror),
  };
}

const emptyResult = (): MatchResult => ({
  score: 0,
  ready: false,
  jointErrors: {},
  hints: [],
  framing: { dx: 0, dy: 0, scale: 1 },
});

export type GroupMatch = {
  /** One result per template pose, in template order. */
  perPose: MatchResult[];
  /** Index into `livePeople` assigned to each template pose (null if unfilled). */
  assigned: Array<number | null>;
  /** Mean of the per-pose scores. */
  score: number;
  ready: boolean;
};

/**
 * Match every person in a group template. People are lined up left-to-right by
 * bounding-box centre and paired by position, which is robust for the usual
 * side-by-side group shot.
 */
export function matchGroup(
  livePeople: Landmark[][],
  template: Template,
  opts: MatchOptions,
): GroupMatch {
  const poses = templatePoses(template);
  const byX = <T extends { cx: number }>(arr: T[]): T[] => arr.slice().sort((a, b) => a.cx - b.cx);

  const tSlots = byX(poses.map((p, i) => ({ i, cx: bbox(p.landmarks).cx })));
  const lSlots = byX(livePeople.map((p, i) => ({ i, cx: bbox(p).cx })));

  const perPose: MatchResult[] = new Array(poses.length);
  const assigned: Array<number | null> = new Array(poses.length).fill(null);

  tSlots.forEach((slot, rank) => {
    const live = lSlots[rank];
    if (live) {
      assigned[slot.i] = live.i;
      perPose[slot.i] = matchPose(livePeople[live.i], poses[slot.i].landmarks, opts);
    } else {
      perPose[slot.i] = emptyResult();
    }
  });

  const score = Math.round(perPose.reduce((s, r) => s + r.score, 0) / (poses.length || 1));
  const ready = assigned.every((a) => a !== null) && perPose.every((r) => r.ready);
  return { perPose, assigned, score, ready };
}
