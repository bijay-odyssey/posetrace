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
  /** One result per template pose, in template order (unfilled slots are empty). */
  perPose: MatchResult[];
  /** Index into `livePeople` assigned to each template pose (null if unfilled). */
  assigned: Array<number | null>;
  /** How many template slots got a live person. */
  filled: number;
  /** Mean score over the filled slots only. */
  score: number;
  ready: boolean;
};

/**
 * Match every person in a group template. Each template slot takes the nearest
 * still-unclaimed live person by bounding-box centre (extremes first), which
 * stays correct when the live head-count changes mid-session.
 */
export function matchGroup(
  livePeople: Landmark[][],
  template: Template,
  opts: MatchOptions,
): GroupMatch {
  const poses = templatePoses(template);
  const tCent = poses.map((p) => bbox(p.landmarks).cx);
  const lCent = livePeople.map((p) => bbox(p).cx);

  const perPose: MatchResult[] = new Array(poses.length);
  const assigned: Array<number | null> = new Array(poses.length).fill(null);
  const used = new Set<number>();

  const order = poses.map((_, i) => i).sort((a, b) => tCent[a] - tCent[b]);
  for (const ti of order) {
    let best = -1;
    let bestD = Infinity;
    lCent.forEach((lx, li) => {
      if (used.has(li)) return;
      const d = Math.abs(lx - tCent[ti]);
      if (d < bestD) {
        bestD = d;
        best = li;
      }
    });
    if (best >= 0) {
      used.add(best);
      assigned[ti] = best;
      perPose[ti] = matchPose(livePeople[best], poses[ti].landmarks, opts);
    } else {
      perPose[ti] = emptyResult();
    }
  }

  const filled = assigned.reduce<number>((n, a) => (a === null ? n : n + 1), 0);
  const sum = assigned.reduce<number>((s, a, i) => (a === null ? s : s + perPose[i].score), 0);
  const score = filled > 0 ? Math.round(sum / filled) : 0;
  const ready = filled === poses.length && assigned.every((a, i) => a === null || perPose[i].ready);
  return { perPose, assigned, filled, score, ready };
}
