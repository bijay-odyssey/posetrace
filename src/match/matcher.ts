import type { Landmark, MatchOptions, MatchResult, Template } from '../pose/types';
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
  template: Template,
  opts: MatchOptions,
): MatchResult {
  const liveAngles = poseAngles(normalizePose(liveRaw));
  const targetAngles = poseAngles(normalizePose(template.landmarks));

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
  const tb = bbox(template.landmarks);
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
