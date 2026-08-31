import { CONNECTIONS, CONNECTION_JOINT, LM, connKey } from '../pose/landmarks';
import { dist, mid, normalizePose } from '../match/normalize';
import type { Landmark, Template } from '../pose/types';

export type OverlayInput = {
  w: number;
  h: number;
  mirror: boolean;
  /** Maps a normalized landmark (0..1 in the camera frame) to canvas CSS pixels,
   *  accounting for `object-fit: cover` cropping of the video. */
  project: (nx: number, ny: number) => [number, number];
  live: Landmark[] | null;
  template: Template | null;
  jointErrors: Record<string, number> | null;
  showGrid: boolean;
  /** Other people in frame, drawn dimly (not matched). */
  others?: Landmark[][] | null;
  /** Decoded template silhouette + its bounds in template-normalized coords. */
  silhouette?: { img: CanvasImageSource; bbox: { x: number; y: number; w: number; h: number } } | null;
  ghostStyle?: 'skeleton' | 'silhouette' | 'both';
  /** Device left/right tilt in degrees; draws a centred level bar. */
  level?: { roll: number } | null;
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
 * Re-anchor a template onto the live subject: same hip position and torso
 * length as the person, but the template's limb angles. This is the "ghost"
 * the user tries to match.
 */
function ghostFromTemplate(template: Landmark[], live: Landmark[]): Landmark[] {
  const normalized = normalizePose(template);
  const { hipC, scale } = anchorOf(live);
  return normalized.map((p, i) => ({
    x: p.x * scale + hipC.x,
    y: p.y * scale + hipC.y,
    z: 0,
    visibility: template[i]?.visibility ?? 1,
  }));
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
  const { w, h, mirror, project, live, template, jointErrors, showGrid } = input;
  const ghostStyle = input.ghostStyle ?? 'both';
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  if (showGrid) drawThirds(ctx, w, h);

  // Silhouette ghost: re-anchored onto the live subject like the skeleton.
  if (template && live && input.silhouette && ghostStyle !== 'skeleton') {
    const t = anchorOf(template.landmarks);
    const l = anchorOf(live);
    const bb = input.silhouette.bbox;
    const map = (nx: number, ny: number): [number, number] => {
      const ux = (nx - t.hipC.x) / t.scale;
      const uy = (ny - t.hipC.y) / t.scale;
      return project(ux * l.scale + l.hipC.x, uy * l.scale + l.hipC.y);
    };
    const [x0, y0] = map(bb.x, bb.y);
    const [x1, y1] = map(bb.x + bb.w, bb.y + bb.h);
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = 0.42;
    try {
      ctx.drawImage(input.silhouette.img, x0, y0, x1 - x0, y1 - y0);
    } catch {
      /* image decode not finished yet */
    }
    ctx.globalAlpha = prevAlpha;
  }

  const showGhostSkeleton =
    template && live && (ghostStyle !== 'silhouette' || !input.silhouette);
  if (showGhostSkeleton) {
    const ghost = ghostFromTemplate(template!.landmarks, live!);
    drawSkeleton(ctx, ghost, project, () => 'rgba(255,255,255,0.55)', 7);
    drawJoints(ctx, ghost, project, 'rgba(255,255,255,0.5)', 4);
  }

  if (input.others) {
    for (const other of input.others) {
      drawSkeleton(ctx, other, project, () => 'rgba(255,255,255,0.22)', 3);
    }
  }

  if (live) {
    drawSkeleton(ctx, live, project, (a, b) => colourForBone(a, b, jointErrors), 4);
    drawJoints(ctx, live, project, CYAN, 3.5);
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
