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

/** How close (normalized image units) a hand's wrist must be to a pose wrist to pair with it. */
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

/** Nearest detected hand to a pose wrist, within HAND_PAIR_DIST, or null. */
function nearestHand(wrist: Landmark, hands: Hand[]): Hand | null {
  let best: Hand | null = null;
  let bestDist = HAND_PAIR_DIST;
  for (const hand of hands) {
    const d = Math.hypot(hand.landmarks[0].x - wrist.x, hand.landmarks[0].y - wrist.y);
    if (d < bestDist) {
      bestDist = d;
      best = hand;
    }
  }
  return best;
}

/** Coarse wrist angle (forearm vs. palm direction), degrees. 180 = straight. */
function wristAngle(elbow: Landmark | undefined, wrist: Landmark | undefined, hands: Hand[]): number | null {
  if (!isVisible(elbow) || !isVisible(wrist)) return null;
  const hand = nearestHand(wrist, hands);
  if (!hand) return null;
  const palm = hand.landmarks[9]; // middle-finger MCP
  const a = jointAngle(elbow, wrist, palm);
  return isFinite(a) ? toDeg(a) : null;
}

export function computeLiveAngles(pose: Landmark[], hands: Hand[]): LiveAngles {
  return {
    torsoLeanDeg: torsoLean(pose),
    headTiltDeg: headTilt(pose),
    lWristDeg: wristAngle(pose[LM.lElbow], pose[LM.lWrist], hands),
    rWristDeg: wristAngle(pose[LM.rElbow], pose[LM.rWrist], hands),
  };
}
