/// <reference lib="webworker" />
import { expose } from 'comlink';
import {
  detectHandsVideo,
  detectVideo,
  initVideoHandLandmarker,
  initVideoLandmarker,
  setSegmentationEnabled,
  type InitOpts,
} from './runLandmarker';
import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Hand, PoseResult } from './types';

export type WorkerInitOpts = InitOpts & { handModelPath: string };

let landmarker: PoseLandmarker | null = null;
let handLandmarker: HandLandmarker | null = null;
let handLandmarkerPromise: Promise<HandLandmarker> | null = null;
let handTrackingEnabled = false;
let initOpts: WorkerInitOpts | null = null;

const api = {
  async init(opts: WorkerInitOpts): Promise<boolean> {
    initOpts = opts;
    landmarker = await initVideoLandmarker(opts);
    return true;
  },
  /** Lazily loads the hand model on first enable; a no-op cost after that.
   *  Concurrent calls share the same in-flight load instead of racing. */
  async setHandTracking(enabled: boolean): Promise<void> {
    handTrackingEnabled = enabled;
    if (enabled && !handLandmarker && !handLandmarkerPromise && initOpts) {
      const opts = initOpts;
      handLandmarkerPromise = initVideoHandLandmarker({
        wasmPath: opts.wasmPath,
        modelPath: opts.handModelPath,
        delegate: opts.delegate,
      }).catch((e) => {
        handLandmarkerPromise = null;
        throw e;
      });
    }
    if (handLandmarkerPromise) {
      handLandmarker = await handLandmarkerPromise;
    }
  },
  /** Reconfigures the already-loaded pose model; no second model involved. */
  async setBodyOutline(enabled: boolean): Promise<void> {
    if (!landmarker) return;
    await setSegmentationEnabled(landmarker, enabled);
  },
  detect(bitmap: ImageBitmap, ts: number): PoseResult {
    if (!landmarker) throw new Error('worker landmarker not initialised');
    try {
      const pose = detectVideo(landmarker, bitmap, ts);
      const hands: Hand[] =
        handTrackingEnabled && handLandmarker ? detectHandsVideo(handLandmarker, bitmap, ts) : [];
      return { ...pose, hands };
    } finally {
      bitmap.close();
    }
  },
};

export type PoseWorkerApi = typeof api;
expose(api);
