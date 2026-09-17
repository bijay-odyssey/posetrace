import { bbox } from '../match/normalize';
import { detectImage, initImageLandmarker } from '../pose/runLandmarker';
import { WASM_PATH } from '../pose/wasmPath';
import type { Landmark, MaskData, Silhouette, World } from '../pose/types';

let imageLandmarker: Awaited<ReturnType<typeof initImageLandmarker>> | null = null;

async function getLandmarker() {
  imageLandmarker ??= await initImageLandmarker({
    wasmPath: WASM_PATH,
    modelPath: '/models/pose_landmarker_lite.task',
  });
  return imageLandmarker;
}

async function makeThumb(bitmap: ImageBitmap, maxSize: number): Promise<string> {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.7);
}

/** Turn the pose segmentation mask into a cropped, translucent white cut-out. */
function buildSilhouette(mask: MaskData): Silhouette | undefined {
  const { data, width, height } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] >= 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return undefined;

  const pad = Math.round(Math.max(width, height) * 0.02);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const s = Math.min(1, 220 / Math.max(cw, ch));
  const ow = Math.max(1, Math.round(cw * s));
  const oh = Math.max(1, Math.round(ch * s));

  const canvas = document.createElement('canvas');
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(ow, oh);
  for (let j = 0; j < oh; j++) {
    const sy = Math.min(height - 1, minY + Math.floor(j / s));
    for (let i = 0; i < ow; i++) {
      const sx = Math.min(width - 1, minX + Math.floor(i / s));
      const conf = data[sy * width + sx];
      const a = Math.max(0, Math.min(1, (conf - 0.35) / 0.4));
      const o = (j * ow + i) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    bbox: { x: minX / width, y: minY / height, w: cw / width, h: ch / height },
  };
}

export type ExtractedPose = {
  landmarks: Landmark[];
  world?: World[];
  silhouette?: Silhouette;
};

export type Extraction = {
  /** People found, ordered left-to-right by bounding-box centre. */
  people: ExtractedPose[];
  /** Index of the most prominent (largest) person. */
  primary: number;
  /** JPEG data URL of the source photo. */
  thumb: string;
};

/** Drop detections much smaller than the biggest one (posters, reflections, passers-by). */
const MIN_AREA_RATIO = 0.22;

/** Run pose estimation on an uploaded reference photo. Returns null if no person. */
export async function extractPoses(file: File): Promise<Extraction | null> {
  const lm = await getLandmarker();
  const bitmap = await createImageBitmap(file);
  try {
    const found = detectImage(lm, bitmap);
    const thumb = await makeThumb(bitmap, 160);
    if (found.length === 0) return null;

    const meta = found.map((p) => {
      const b = bbox(p.landmarks);
      return { p, cx: b.cx, area: Math.max(b.w * b.h, 1e-6) };
    });
    const maxArea = Math.max(...meta.map((m) => m.area));
    const kept = meta
      .filter((m) => m.area >= maxArea * MIN_AREA_RATIO)
      .sort((a, b) => a.cx - b.cx);

    // Silhouettes are only used for single-person ghosts.
    const single = kept.length === 1;
    const people: ExtractedPose[] = kept.map((m) => ({
      landmarks: m.p.landmarks,
      world: m.p.world ?? undefined,
      silhouette: single && m.p.mask ? buildSilhouette(m.p.mask) : undefined,
    }));

    let primary = 0;
    let biggest = -1;
    kept.forEach((m, i) => {
      if (m.area > biggest) {
        biggest = m.area;
        primary = i;
      }
    });

    return { people, primary, thumb };
  } finally {
    bitmap.close();
  }
}
