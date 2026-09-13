// Picks the best available inference path and hides the difference behind a
// single `detect(video, ts)` call:
//   1. Web Worker + GPU  (smoothest; needs Worker + OffscreenCanvas)
//   2. Web Worker + CPU
//   3. Main thread + GPU  (fallback for older iOS Safari)
//   4. Main thread + CPU
import * as Comlink from 'comlink';
import { initVideoLandmarker, detectVideo } from './runLandmarker';
import { WASM_PATH } from './wasmPath';
import type { PoseWorkerApi } from './worker';
import type { PoseResult } from './types';

const MODEL_PATH = '/models/pose_landmarker_lite.task';

export interface PoseEngine {
  readonly mode: string;
  detect(video: HTMLVideoElement, ts: number): Promise<PoseResult>;
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
    await api.init({ wasmPath: WASM_PATH, modelPath: MODEL_PATH, delegate: 'GPU' });
  } catch {
    delegate = 'CPU';
    await api.init({ wasmPath: WASM_PATH, modelPath: MODEL_PATH, delegate: 'CPU' });
  }

  return {
    mode: `worker/${delegate}`,
    async detect(video, ts) {
      const bitmap = await createImageBitmap(video);
      return api.detect(Comlink.transfer(bitmap, [bitmap]), ts);
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

  return {
    mode: `main/${delegate}`,
    async detect(video, ts) {
      return detectVideo(lm, video, ts);
    },
    close() {
      lm.close();
    },
  };
}
