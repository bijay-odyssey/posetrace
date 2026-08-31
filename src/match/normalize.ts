import { LM } from '../pose/landmarks';
import type { Landmark } from '../pose/types';

export type Vec = { x: number; y: number };

export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Translate to hip centre and scale by torso length, so poses become
 * comparable regardless of where the subject stands or how big they appear.
 */
export function normalizePose(lms: Landmark[]): Vec[] {
  const hipC = mid(lms[LM.lHip], lms[LM.rHip]);
  const shoC = mid(lms[LM.lShoulder], lms[LM.rShoulder]);
  let scale = dist(hipC, shoC);
  if (!isFinite(scale) || scale < 1e-4) scale = 1e-4;
  return lms.map((p) => ({ x: (p.x - hipC.x) / scale, y: (p.y - hipC.y) / scale }));
}

export type Bbox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

/** Bounding box over visible landmarks, in the landmarks' own coordinate space. */
export function bbox(lms: Landmark[], visThreshold = 0.3): Bbox {
  let pts = lms.filter((p) => (p.visibility ?? 1) >= visThreshold);
  if (pts.length < 4) pts = lms;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX,
    h: maxY - minY,
  };
}
