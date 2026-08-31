/// <reference lib="webworker" />
import { expose } from 'comlink';
import { initVideoLandmarker, detectVideo, type InitOpts } from './runLandmarker';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseResult } from './types';

let landmarker: PoseLandmarker | null = null;

const api = {
  async init(opts: InitOpts): Promise<boolean> {
    landmarker = await initVideoLandmarker(opts);
    return true;
  },
  detect(bitmap: ImageBitmap, ts: number): PoseResult {
    if (!landmarker) throw new Error('worker landmarker not initialised');
    try {
      return detectVideo(landmarker, bitmap, ts);
    } finally {
      bitmap.close();
    }
  },
};

export type PoseWorkerApi = typeof api;
expose(api);
