// Angles for the "blueprint" ghost style's on-screen callouts. Distinct from
// angles.ts (which measures error against a normalized target pose): these
// read the live, unnormalized landmarks directly for display, degrees not
// radians, and skip anything not confidently visible.
import { LM } from '../pose/landmarks';
import type { Hand, Landmark } from '../pose/types';
import { jointAngle } from './angles';

const VIS = 0.3;
const isVisible = (p: Landmark | undefined): p is Landmark => !!p && (p.visibility ?? 1) >= VIS;
const toDeg = (rad: number): number => Math.round((rad * 180) / Math.PI);

/** How close a hand's wrist must be to a pose wrist to pair with it, as a
 *  fraction of frame width (the `aspect` param corrects the y-axis for it,
 *  since landmark coords are normalized per-axis to width/height separately). */
const HAND_PAIR_DIST = 0.08;

export type LiveAngles = {
  torsoLeanDeg: number | null;
  headTiltDeg: number | null;
  lWristDeg: number | null;
  rWristDeg: number | null;
};

function torsoLean(pose: Landmark[]): number | null {
  const lSho = pose[LM.lShoulder];
  const rSho = pose[LM.rShoulder];
  const lHip = pose[LM.lHip];
  const rHip = pose[LM.rHip];
  if (!isVisible(lSho) || !isVisible(rSho) || !isVisible(lHip) || !isVisible(rHip)) return null;
  const shoC = { x: (lSho.x + rSho.x) / 2, y: (lSho.y + rSho.y) / 2 };
  const hipC = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
  return toDeg(Math.atan2(hipC.x - shoC.x, hipC.y - shoC.y));
}

function headTilt(pose: Landmark[]): number | null {
  const lEar = pose[LM.lEar];
  const rEar = pose[LM.rEar];
  if (!isVisible(lEar) || !isVisible(rEar)) return null;
  return toDeg(Math.atan2(rEar.y - lEar.y, rEar.x - lEar.x));
}

/**
 * Exclusively pairs each visible pose wrist to the nearest still-unclaimed
 * detected hand (closest pair first), so clasped/crossed hands - the exact
 * shape of the pose this feature was designed against - can't bind the same
 * hand to both wrist labels.
 */
function pairHandsToWrists(
  lWrist: Landmark | undefined,
  rWrist: Landmark | undefined,
  hands: Hand[],
  aspect: number,
): { l: Hand | null; r: Hand | null } {
  const wrists: Array<{ side: 'l' | 'r'; wrist: Landmark }> = [];
  if (isVisible(lWrist)) wrists.push({ side: 'l', wrist: lWrist });
  if (isVisible(rWrist)) wrists.push({ side: 'r', wrist: rWrist });

  const candidates: Array<{ side: 'l' | 'r'; hand: Hand; dist: number }> = [];
  for (const { side, wrist } of wrists) {
    for (const hand of hands) {
      const dx = hand.landmarks[0].x - wrist.x;
      const dy = (hand.landmarks[0].y - wrist.y) * aspect;
      const dist = Math.hypot(dx, dy);
      if (dist <= HAND_PAIR_DIST) candidates.push({ side, hand, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);

  const used = new Set<Hand>();
  const result: { l: Hand | null; r: Hand | null } = { l: null, r: null };
  for (const c of candidates) {
    if (result[c.side] || used.has(c.hand)) continue;
    result[c.side] = c.hand;
    used.add(c.hand);
  }
  return result;
}

/** Coarse wrist angle (forearm vs. palm direction), degrees. 180 = straight. */
function wristAngleFor(elbow: Landmark | undefined, wrist: Landmark | undefined, hand: Hand | null): number | null {
  if (!isVisible(elbow) || !isVisible(wrist) || !hand) return null;
  const palm = hand.landmarks[9]; // middle-finger MCP
  const a = jointAngle(elbow, wrist, palm);
  return isFinite(a) ? toDeg(a) : null;
}

/** @param aspect frame height / frame width, to keep HAND_PAIR_DIST isotropic. */
export function computeLiveAngles(pose: Landmark[], hands: Hand[], aspect = 1): LiveAngles {
  const lWrist = pose[LM.lWrist];
  const rWrist = pose[LM.rWrist];
  const paired = hands.length ? pairHandsToWrists(lWrist, rWrist, hands, aspect) : { l: null, r: null };
  return {
    torsoLeanDeg: torsoLean(pose),
    headTiltDeg: headTilt(pose),
    lWristDeg: wristAngleFor(pose[LM.lElbow], lWrist, paired.l),
    rWristDeg: wristAngleFor(pose[LM.rElbow], rWrist, paired.r),
  };
}
