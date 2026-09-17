import type { LiveAngles } from '../match/liveAngles';
import { HAND_CONNECTIONS } from '../pose/handLandmarks';
import { CONNECTIONS, CONNECTION_JOINT, LM, connKey } from '../pose/landmarks';
import { dist, mid, normalizePose } from '../match/normalize';
import type { Hand, Landmark, MaskData } from '../pose/types';

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
  /** Live display only - not matched against a template. */
  hands?: Hand[];
  /** Live display only, for the 'blueprint' style's on-screen callouts. */
  angles?: LiveAngles | null;
  /** Live display only, for the body-outline glow. */
  mask?: MaskData | null;
  showGrid: boolean;
  ghostStyle?: 'skeleton' | 'silhouette' | 'both' | 'blueprint';
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
  connections: Array<[number, number]> = CONNECTIONS,
): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = lineWidth;
  for (const [a, b] of connections) {
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

function drawHands(
  ctx: CanvasRenderingContext2D,
  hands: Hand[],
  project: Project,
  colour: string = CYAN,
  lineWidth = 2.5,
): void {
  for (const hand of hands) {
    drawSkeleton(ctx, hand.landmarks, project, () => colour, lineWidth, HAND_CONNECTIONS);
    drawJoints(ctx, hand.landmarks, project, colour, lineWidth);
  }
}

// ---- body outline: soft glow contour traced from the segmentation mask -------

const OUTLINE_RGB: [number, number, number] = [34, 211, 238]; // --accent cyan
let maskCanvas: HTMLCanvasElement | null = null;

/** Thresholds + tints the mask into a reusable offscreen canvas (resized only when needed). */
function maskToCanvas(mask: MaskData): HTMLCanvasElement {
  maskCanvas ??= document.createElement('canvas');
  if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
    maskCanvas.width = mask.width;
    maskCanvas.height = mask.height;
  }
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) return maskCanvas;
  const img = mctx.createImageData(mask.width, mask.height);
  const [r, g, b] = OUTLINE_RGB;
  for (let i = 0; i < mask.data.length; i++) {
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = mask.data[i] > 0.5 ? 255 : 0;
  }
  mctx.putImageData(img, 0, 0);
  return maskCanvas;
}

/**
 * Draws a glowing rim around the mask shape: a blurred copy, then the same
 * sharp shape punched out of it (`destination-out`), leaving only the halo
 * that spread past the sharp edge. Must run before anything else this frame
 * so the punch can't erase other already-drawn overlay pixels.
 */
function drawBodyOutline(ctx: CanvasRenderingContext2D, mask: MaskData, project: Project): void {
  const canvas = maskToCanvas(mask);
  const [x0, y0] = project(0, 0);
  const [x1, y1] = project(1, 1);
  const dw = x1 - x0;
  const dh = y1 - y0;

  ctx.save();
  ctx.filter = 'blur(8px)';
  ctx.globalAlpha = 0.9;
  ctx.drawImage(canvas, x0, y0, dw, dh);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(canvas, x0, y0, dw, dh);
  ctx.restore();
}

// ---- blueprint style: monochrome line skeleton + live angle callouts --------

const MONO = 'rgba(255,255,255,0.9)';
const MONO_GHOST = 'rgba(255,255,255,0.4)';
const MONO_DIM = 'rgba(255,255,255,0.2)';

/** Draws upright even when the outer context is horizontally mirrored. */
function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, mirror: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawAngleLabels(
  ctx: CanvasRenderingContext2D,
  primary: Landmark[] | undefined,
  angles: LiveAngles,
  project: Project,
  mirror: boolean,
): void {
  if (!primary) return;
  const at = (p: Landmark | undefined, dx: number, dy: number): [number, number] | null => {
    if (!visible(p)) return null;
    const [x, y] = project(p.x, p.y);
    return [x + dx, y + dy];
  };

  if (angles.torsoLeanDeg != null) {
    const lSho = primary[LM.lShoulder];
    const rSho = primary[LM.rShoulder];
    const lHip = primary[LM.lHip];
    const rHip = primary[LM.rHip];
    if (visible(lSho) && visible(rSho) && visible(lHip) && visible(rHip)) {
      const mx = (lSho.x + rSho.x + lHip.x + rHip.x) / 4;
      const my = (lSho.y + rSho.y + lHip.y + rHip.y) / 4;
      const [x, y] = project(mx, my);
      drawLabel(ctx, x + 16, y, `Torso lean: ${angles.torsoLeanDeg}°`, mirror);
    }
  }
  const head = at(primary[LM.nose], 0, -18);
  if (angles.headTiltDeg != null && head) {
    drawLabel(ctx, head[0], head[1], `Head tilt: ${angles.headTiltDeg}°`, mirror);
  }
  const lWrist = at(primary[LM.lWrist], 14, -14);
  if (angles.lWristDeg != null && lWrist) {
    drawLabel(ctx, lWrist[0], lWrist[1], `L wrist: ${angles.lWristDeg}°`, mirror);
  }
  const rWrist = at(primary[LM.rWrist], -14, -14);
  if (angles.rWristDeg != null && rWrist) {
    drawLabel(ctx, rWrist[0], rWrist[1], `R wrist: ${angles.rWristDeg}°`, mirror);
  }
}

function drawBlueprintPass(ctx: CanvasRenderingContext2D, input: OverlayInput, project: Project): void {
  for (const g of input.ghosts) {
    const ghost = ghostFrom(g.target, g.anchor);
    drawSkeleton(ctx, ghost, project, () => MONO_GHOST, 1.5);
    drawJoints(ctx, ghost, project, MONO_GHOST, 2.5);
  }

  for (const person of input.people) {
    const colour = person.dim ? MONO_DIM : MONO;
    drawSkeleton(ctx, person.landmarks, project, () => colour, person.dim ? 1 : 1.5);
    drawJoints(ctx, person.landmarks, project, colour, person.dim ? 1.8 : 2.5);
  }

  if (input.hands?.length) drawHands(ctx, input.hands, project, MONO, 1.8);

  if (input.angles) {
    drawAngleLabels(ctx, input.people[0]?.landmarks, input.angles, project, input.mirror);
  }
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

function drawLevelBar(ctx: CanvasRenderingContext2D, input: OverlayInput, w: number, h: number): void {
  if (!input.level) return;
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

export function drawOverlay(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { w, h, mirror, project, ghosts, people, showGrid } = input;
  const ghostStyle = input.ghostStyle ?? 'both';
  if (input.clear !== false) ctx.clearRect(0, 0, w, h);

  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  // Must run first: it punches a hole in whatever it draws, so anything drawn
  // before it in this pass could get partially erased where it overlaps the body.
  if (input.mask) drawBodyOutline(ctx, input.mask, project);

  if (showGrid) drawThirds(ctx, w, h);

  if (ghostStyle === 'blueprint') {
    drawBlueprintPass(ctx, input, project);
    ctx.restore();
    drawLevelBar(ctx, input, w, h);
    return;
  }

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

  // Dim bystanders first so the scored subject stays on top.
  for (const person of people) {
    if (!person.dim) continue;
    drawSkeleton(ctx, person.landmarks, project, () => 'rgba(255,255,255,0.22)', 3);
  }
  for (const person of people) {
    if (person.dim) continue;
    drawSkeleton(ctx, person.landmarks, project, (a, b) => colourForBone(a, b, person.jointErrors), 4);
    drawJoints(ctx, person.landmarks, project, CYAN, 3.5);
  }

  if (input.hands?.length) drawHands(ctx, input.hands, project);

  ctx.restore();
  drawLevelBar(ctx, input, w, h);
}
