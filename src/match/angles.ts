import { JOINTS, LM } from '../pose/landmarks';
import { mid, type Vec } from './normalize';

/** Interior angle at `b` between rays b->a and b->c, in radians (0..PI). */
export function jointAngle(a: Vec, b: Vec, c: Vec): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (mag < 1e-6) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag)));
}

/**
 * All comparison angles for a (normalized) pose. Includes every entry in
 * JOINTS plus `torso`: signed lean of the spine, ~0 when upright.
 */
export function poseAngles(lms: Vec[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(JOINTS)) {
    const [a, b, c] = JOINTS[key];
    out[key] = jointAngle(lms[a], lms[b], lms[c]);
  }
  const shoC = mid(lms[LM.lShoulder], lms[LM.rShoulder]);
  const hipC = mid(lms[LM.lHip], lms[LM.rHip]);
  out.torso = Math.atan2(hipC.x - shoC.x, hipC.y - shoC.y);
  return out;
}
