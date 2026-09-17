// Picks the best available inference path and hides the difference behind a
// single `detect(video, ts)` call:
//   1. Web Worker + GPU  (smoothest; needs Worker + OffscreenCanvas)
//   2. Web Worker + CPU
//   3. Main thread + GPU  (fallback for older iOS Safari)
//   4. Main thread + CPU
import * as Comlink from 'comlink';
import {
  detectHandsVideo,
  detectVideo,
  initVideoHandLandmarker,
  initVideoLandmarker,
} from './runLandmarker';
import { WASM_PATH } from './wasmPath';
import type { PoseWorkerApi } from './worker';
import type { Hand, PoseResult } from './types';

const MODEL_PATH = '/models/pose_landmarker_lite.task';
const HAND_MODEL_PATH = '/models/hand_landmarker.task';

export interface PoseEngine {
  readonly mode: string;
  detect(video: HTMLVideoElement, ts: number): Promise<PoseResult>;
  /** Lazily loads the hand model on first enable; a no-op cost after that. */
  setHandTracking(enabled: boolean): Promise<void>;
  close(): void;
}

export async function createPoseEngine(): Promise<PoseEngine> {
  const workerCapable =
    typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

  if (workerCapable) {
    try {
      return await workerEngine();
    } catch (err) {
      console.warn('[pose] worker engine unavailable, using main thread', err);
    }
  }
  return mainThreadEngine();
}

async function workerEngine(): Promise<PoseEngine> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const api = Comlink.wrap<PoseWorkerApi>(worker);

  let delegate: 'GPU' | 'CPU' = 'GPU';
  try {
    await api.init({ wasmPath: WASM_PATH, modelPath: MODEL_PATH, handModelPath: HAND_MODEL_PATH, delegate: 'GPU' });
  } catch {
    delegate = 'CPU';
    await api.init({ wasmPath: WASM_PATH, modelPath: MODEL_PATH, handModelPath: HAND_MODEL_PATH, delegate: 'CPU' });
  }

  return {
    mode: `worker/${delegate}`,
    async detect(video, ts) {
      const bitmap = await createImageBitmap(video);
      return api.detect(Comlink.transfer(bitmap, [bitmap]), ts);
    },
    setHandTracking(enabled) {
      return api.setHandTracking(enabled);
    },
    close() {
      worker.terminate();
    },
  };
}

async function mainThreadEngine(): Promise<PoseEngine> {
  let delegate: 'GPU' | 'CPU' = 'GPU';
  let lm;
  try {
    lm = await initVideoLandmarker({ wasmPath: WASM_PATH, modelPath: MODEL_PATH, delegate: 'GPU' });
  } catch {
    delegate = 'CPU';
    lm = await initVideoLandmarker({ wasmPath: WASM_PATH, modelPath: MODEL_PATH, delegate: 'CPU' });
  }

  let handLm: Awaited<ReturnType<typeof initVideoHandLandmarker>> | null = null;
  let handTrackingEnabled = false;

  return {
    mode: `main/${delegate}`,
    async detect(video, ts) {
      const pose = detectVideo(lm, video, ts);
      const hands: Hand[] = handTrackingEnabled && handLm ? detectHandsVideo(handLm, video, ts) : [];
      return { ...pose, hands };
    },
    async setHandTracking(enabled) {
      handTrackingEnabled = enabled;
      if (enabled && !handLm) {
        handLm = await initVideoHandLandmarker({ wasmPath: WASM_PATH, modelPath: HAND_MODEL_PATH, delegate });
      }
    },
    close() {
      lm.close();
      handLm?.close();
    },
  };
}
