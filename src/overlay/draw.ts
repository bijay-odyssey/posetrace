import { CONNECTIONS, CONNECTION_JOINT, LM, connKey } from '../pose/landmarks';
import { dist, mid, normalizePose } from '../match/normalize';
import type { Landmark } from '../pose/types';

export type SilhouetteHandle = {
  img: CanvasImageSource;
  /** Person bounds in the template pose's normalized coords. */
  bbox: { x: number; y: number; w: number; h: number };
};

/** A target pose re-anchored onto one live person. */
export type OverlayGhost = {
  target: Landmark[];
  anchor: Landmark[];
  jointErrors: Record<string, number> | null;
  silhouette?: SilhouetteHandle | null;
};

/** A live person's skeleton. `dim` = detected bystander, not matched. */
export type OverlayPerson = {
  landmarks: Landmark[];
  jointErrors: Record<string, number> | null;
  dim?: boolean;
};

export type OverlayInput = {
  w: number;
  h: number;
  mirror: boolean;
  /** Maps a normalized landmark (0..1 in the camera frame) to canvas CSS pixels,
   *  accounting for `object-fit: cover` cropping of the video. */
  project: (nx: number, ny: number) => [number, number];
  ghosts: OverlayGhost[];
  people: OverlayPerson[];
  showGrid: boolean;
  ghostStyle?: 'skeleton' | 'silhouette' | 'both';
  /** Device left/right tilt in degrees; draws a centred level bar. */
  level?: { roll: number } | null;
  /** Clear the canvas first (default true); false to composite over existing pixels. */
  clear?: boolean;
};

const CYAN = '#22d3ee';
const GOOD = '#22c55e';
const WARN = '#eab308';
const BAD = '#ef4444';

function colourForBone(a: number, b: number, je: Record<string, number> | null): string {
  if (!je) return CYAN;
  const joint = CONNECTION_JOINT[connKey(a, b)];
  const e = joint ? je[joint] : undefined;
  if (e == null || !isFinite(e)) return CYAN;
  if (e < 0.18) return GOOD;
  if (e < 0.45) return WARN;
  return BAD;
}

function visible(p: Landmark | undefined): p is Landmark {
  return !!p && (p.visibility ?? 1) >= 0.3;
}

type Project = (nx: number, ny: number) => [number, number];

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  pts: Landmark[],
  project: Project,
  colour: (a: number, b: number) => string,
  lineWidth: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = lineWidth;
  for (const [a, b] of CONNECTIONS) {
    const p = pts[a];
    const q = pts[b];
    if (!visible(p) || !visible(q)) continue;
    ctx.strokeStyle = colour(a, b);
    ctx.beginPath();
    ctx.moveTo(...project(p.x, p.y));
    ctx.lineTo(...project(q.x, q.y));
    ctx.stroke();
  }
}

function drawJoints(
  ctx: CanvasRenderingContext2D,
  pts: Landmark[],
  project: Project,
  fill: string,
  r: number,
): void {
  ctx.fillStyle = fill;
  for (const p of pts) {
    if (!visible(p)) continue;
    const [x, y] = project(p.x, p.y);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function anchorOf(lms: Landmark[]): { hipC: { x: number; y: number }; scale: number } {
  const hipC = mid(lms[LM.lHip], lms[LM.rHip]);
  const shoC = mid(lms[LM.lShoulder], lms[LM.rShoulder]);
  return { hipC, scale: Math.max(dist(hipC, shoC), 1e-4) };
}

/**
 * Re-anchor a target pose onto a live person: same hip position and torso
 * length as the person, but the target's limb angles. This is the "ghost".
 */
function ghostFrom(target: Landmark[], anchor: Landmark[]): Landmark[] {
  const normalized = normalizePose(target);
  const { hipC, scale } = anchorOf(anchor);
  return normalized.map((p, i) => ({
    x: p.x * scale + hipC.x,
    y: p.y * scale + hipC.y,
    z: 0,
    visibility: target[i]?.visibility ?? 1,
  }));
}

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  project: Project,
  sil: SilhouetteHandle,
  target: Landmark[],
  anchor: Landmark[],
): void {
  const t = anchorOf(target);
  const l = anchorOf(anchor);
  const map = (nx: number, ny: number): [number, number] => {
    const ux = (nx - t.hipC.x) / t.scale;
    const uy = (ny - t.hipC.y) / t.scale;
    return project(ux * l.scale + l.hipC.x, uy * l.scale + l.hipC.y);
  };
  const [x0, y0] = map(sil.bbox.x, sil.bbox.y);
  const [x1, y1] = map(sil.bbox.x + sil.bbox.w, sil.bbox.y + sil.bbox.h);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 0.42;
  try {
    ctx.drawImage(sil.img, x0, y0, x1 - x0, y1 - y0);
  } catch {
    /* image decode not finished yet */
  }
  ctx.globalAlpha = prevAlpha;
}

function drawThirds(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo((w * i) / 3, 0);
    ctx.lineTo((w * i) / 3, h);
    ctx.moveTo(0, (h * i) / 3);
    ctx.lineTo(w, (h * i) / 3);
  }
  ctx.stroke();
}

export function drawOverlay(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { w, h, mirror, project, ghosts, people, showGrid } = input;
  const ghostStyle = input.ghostStyle ?? 'both';
  if (input.clear !== false) ctx.clearRect(0, 0, w, h);

  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  if (showGrid) drawThirds(ctx, w, h);

  for (const g of ghosts) {
    if (g.silhouette && ghostStyle !== 'skeleton') {
      drawSilhouette(ctx, project, g.silhouette, g.target, g.anchor);
    }
    if (ghostStyle !== 'silhouette' || !g.silhouette) {
      const ghost = ghostFrom(g.target, g.anchor);
      drawSkeleton(ctx, ghost, project, () => 'rgba(255,255,255,0.55)', 7);
      drawJoints(ctx, ghost, project, 'rgba(255,255,255,0.5)', 4);
    }
  }

  for (const person of people) {
    if (person.dim) {
      drawSkeleton(ctx, person.landmarks, project, () => 'rgba(255,255,255,0.22)', 3);
      continue;
    }
    drawSkeleton(ctx, person.landmarks, project, (a, b) => colourForBone(a, b, person.jointErrors), 4);
    drawJoints(ctx, person.landmarks, project, CYAN, 3.5);
  }

  ctx.restore();

  if (input.level) {
    const { roll } = input.level;
    const lvl = Math.abs(roll) < 2;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-roll * Math.PI) / 180);
    ctx.strokeStyle = lvl ? 'rgba(34,197,94,0.9)' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.16, 0);
    ctx.lineTo(w * 0.16, 0);
    ctx.stroke();
    ctx.restore();
  }
}
