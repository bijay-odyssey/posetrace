// Thin wrapper around @mediapipe/tasks-vision that runs in either the main
// thread or a worker. Keep this environment-agnostic (no DOM-only globals
// beyond what a worker also has).
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Hand, Landmark, PoseResult, World } from './types';

export type InitOpts = {
  wasmPath: string;
  modelPath: string;
  delegate: 'GPU' | 'CPU';
};

type AnyLandmark = { x: number; y: number; z: number; visibility?: number };

const toLandmarks = (arr: AnyLandmark[]): Landmark[] =>
  arr.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 }));

const toWorld = (arr: AnyLandmark[] | undefined): World[] | null =>
  arr ? arr.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null;

function bboxArea(lms: Landmark[]): number {
  let minX = 2;
  let minY = 2;
  let maxX = -1;
  let maxY = -1;
  for (const p of lms) {
    if ((p.visibility ?? 1) < 0.3) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return maxX < minX ? 0 : (maxX - minX) * (maxY - minY);
}

/** Index of the largest (nearest) person. */
function primaryIndex(people: Landmark[][]): number {
  let idx = 0;
  let best = -1;
  people.forEach((p, i) => {
    const a = bboxArea(p);
    if (a > best) {
      best = a;
      idx = i;
    }
  });
  return idx;
}

export async function initVideoLandmarker(o: InitOpts): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(o.wasmPath);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: o.modelPath, delegate: o.delegate },
    runningMode: 'VIDEO',
    numPoses: 3,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
}

export async function initImageLandmarker(o: Omit<InitOpts, 'delegate'>): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(o.wasmPath);
  const make = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.modelPath, delegate },
      runningMode: 'IMAGE',
      // Matches the live numPoses so a group template can actually fill every slot.
      numPoses: 3,
      minPoseDetectionConfidence: 0.5,
      outputSegmentationMasks: true,
    });
  try {
    return await make('GPU');
  } catch {
    return await make('CPU');
  }
}

/** Pose detection only; callers merge in `hands` from `detectHandsVideo` when enabled. */
export type PoseOnlyResult = Omit<PoseResult, 'hands'>;

export function detectVideo(
  lm: PoseLandmarker,
  src: HTMLVideoElement | ImageBitmap,
  ts: number,
): PoseOnlyResult {
  const r = lm.detectForVideo(src as unknown as HTMLVideoElement, ts);
  const people = (r.landmarks ?? []).map(toLandmarks);
  if (people.length === 0) return { landmarks: null, worldLandmarks: null, extra: [] };
  const pi = primaryIndex(people);
  return {
    landmarks: people[pi],
    worldLandmarks: toWorld(r.worldLandmarks?.[pi]),
    extra: people.filter((_, i) => i !== pi),
  };
}

// ---- hands (opt-in, live display only - not matched against a template) -----

export async function initVideoHandLandmarker(o: InitOpts): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(o.wasmPath);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: o.modelPath, delegate: o.delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export function detectHandsVideo(
  lm: HandLandmarker,
  src: HTMLVideoElement | ImageBitmap,
  ts: number,
): Hand[] {
  const r = lm.detectForVideo(src as unknown as HTMLVideoElement, ts);
  return (r.landmarks ?? []).map((lms, i) => ({
    landmarks: toLandmarks(lms),
    handedness: (r.handedness?.[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right') as Hand['handedness'],
  }));
}

export type MaskData = { data: Float32Array; width: number; height: number };

export type ImagePerson = {
  landmarks: Landmark[];
  world: World[] | null;
  mask: MaskData | null;
};

/** Every person detected in a still image, in the model's own order. */
export function detectImage(lm: PoseLandmarker, src: ImageBitmap): ImagePerson[] {
  const r = lm.detect(src as unknown as ImageBitmap);
  return (r.landmarks ?? []).map((lms, i) => {
    let mask: MaskData | null = null;
    const mp = r.segmentationMasks?.[i];
    if (mp) {
      mask = { data: mp.getAsFloat32Array(), width: mp.width, height: mp.height };
      mp.close();
    }
    return { landmarks: toLandmarks(lms), world: toWorld(r.worldLandmarks?.[i]), mask };
  });
}
