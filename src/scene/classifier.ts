// Optional, on-demand scene detection. MobileNet gives ImageNet-1k labels; we
// map the scene-bearing ones onto our "shoot type" buckets with weights, smooth
// over the last few polls, and only switch buckets when a challenger both leads
// the smoothed mean and is corroborated by consecutive individual polls. Still a
// heuristic - ImageNet has no class for e.g. a staircase, so `stairs` only ever
// comes from the manual chip.
import type { SceneCategory } from '../data/poseBank';

type Prediction = { className: string; probability: number };
type MobileNet = { classify(el: HTMLVideoElement, topk?: number): Promise<Prediction[]> };

let modelPromise: Promise<MobileNet> | null = null;

async function load(): Promise<MobileNet> {
  const tf = await import('@tensorflow/tfjs-core');
  await import('@tensorflow/tfjs-backend-webgl');
  const mobilenet = await import('@tensorflow-models/mobilenet');
  try {
    await tf.setBackend('webgl');
  } catch {
    await tf.setBackend('cpu');
  }
  await tf.ready();
  return mobilenet.load({ version: 2, alpha: 1.0 }) as unknown as Promise<MobileNet>;
}

export function preloadClassifier(): Promise<MobileNet> {
  modelPromise ??= load();
  return modelPromise;
}

type Weights = Partial<Record<SceneCategory, number>>;

/** Distinctive substrings of ImageNet-1k class names -> weighted buckets. */
const SYNSETS: Array<{ kw: string; w: Weights }> = [
  // water's edge
  { kw: 'seashore', w: { beach: 1 } },
  { kw: 'sandbar', w: { beach: 0.9 } },
  { kw: 'lakeside', w: { beach: 0.6, nature: 0.4 } },
  { kw: 'lakeshore', w: { beach: 0.6, nature: 0.4 } },
  { kw: 'breakwater', w: { beach: 0.7, urban: 0.2 } },
  { kw: 'promontory', w: { beach: 0.5, nature: 0.5 } },
  { kw: 'cliff', w: { nature: 0.6, beach: 0.2 } },
  { kw: 'coral reef', w: { beach: 0.5 } },
  { kw: 'dock', w: { beach: 0.4, urban: 0.4 } },
  { kw: 'pier', w: { beach: 0.4, street: 0.3 } },
  // wilderness / outdoors
  { kw: 'alp', w: { nature: 1 } },
  { kw: 'valley', w: { nature: 0.9 } },
  { kw: 'volcano', w: { nature: 0.8 } },
  { kw: 'geyser', w: { nature: 0.8 } },
  { kw: 'hay', w: { nature: 0.5 } },
  { kw: 'rapeseed', w: { nature: 0.6 } },
  { kw: 'mountain tent', w: { nature: 0.7 } },
  { kw: 'yurt', w: { nature: 0.4 } },
  { kw: 'apiary', w: { nature: 0.5 } },
  { kw: 'park bench', w: { nature: 0.5, urban: 0.3 } },
  { kw: 'worm fence', w: { nature: 0.5 } },
  { kw: 'barn', w: { nature: 0.5, urban: 0.2 } },
  // street level
  { kw: 'street sign', w: { street: 1 } },
  { kw: 'traffic light', w: { street: 0.9 } },
  { kw: 'parking meter', w: { street: 0.9 } },
  { kw: 'manhole cover', w: { street: 0.8 } },
  { kw: 'gas pump', w: { street: 0.7 } },
  { kw: 'streetcar', w: { street: 0.7 } },
  { kw: 'trolleybus', w: { street: 0.7 } },
  { kw: 'taxi', w: { street: 0.7 } },
  { kw: 'minibus', w: { street: 0.5 } },
  { kw: 'school bus', w: { street: 0.5 } },
  { kw: 'police van', w: { street: 0.5 } },
  { kw: 'tow truck', w: { street: 0.4 } },
  { kw: 'fire engine', w: { street: 0.4 } },
  { kw: 'moving van', w: { street: 0.4 } },
  { kw: 'recreational vehicle', w: { street: 0.3 } },
  // architecture / cityscape
  { kw: 'castle', w: { urban: 0.9 } },
  { kw: 'church', w: { urban: 0.8 } },
  { kw: 'mosque', w: { urban: 0.8 } },
  { kw: 'monastery', w: { urban: 0.8 } },
  { kw: 'palace', w: { urban: 0.8 } },
  { kw: 'triumphal arch', w: { urban: 0.8 } },
  { kw: 'bell cote', w: { urban: 0.6 } },
  { kw: 'dome', w: { urban: 0.7 } },
  { kw: 'stupa', w: { urban: 0.7 } },
  { kw: 'obelisk', w: { urban: 0.7 } },
  { kw: 'planetarium', w: { urban: 0.6 } },
  { kw: 'prison', w: { urban: 0.6 } },
  { kw: 'water tower', w: { urban: 0.5 } },
  { kw: 'flagpole', w: { urban: 0.4 } },
  { kw: 'suspension bridge', w: { urban: 0.6, street: 0.3 } },
  { kw: 'steel arch bridge', w: { urban: 0.6, street: 0.3 } },
  { kw: 'viaduct', w: { urban: 0.6 } },
  { kw: 'fountain', w: { urban: 0.5, street: 0.3 } },
  { kw: 'megalith', w: { urban: 0.3, nature: 0.3 } },
  { kw: 'patio', w: { urban: 0.4, nature: 0.3 } },
  { kw: 'mobile home', w: { urban: 0.3, street: 0.2 } },
  { kw: 'picket fence', w: { urban: 0.4, nature: 0.3 } },
  { kw: 'stone wall', w: { urban: 0.3, nature: 0.3 } },
  { kw: 'chainlink fence', w: { urban: 0.4, street: 0.2 } },
  { kw: 'turnstile', w: { urban: 0.3, street: 0.3 } },
  { kw: 'greenhouse', w: { nature: 0.4, urban: 0.3 } },
  { kw: 'boathouse', w: { nature: 0.3, beach: 0.3 } },
  // storefronts (indoor-ish, some street signal)
  { kw: 'barbershop', w: { indoor: 0.6, urban: 0.2 } },
  { kw: 'bookshop', w: { indoor: 0.5, urban: 0.2 } },
  { kw: 'butcher shop', w: { indoor: 0.5 } },
  { kw: 'grocery store', w: { indoor: 0.5, urban: 0.2 } },
  { kw: 'shoe shop', w: { indoor: 0.5 } },
  { kw: 'tobacco shop', w: { indoor: 0.5 } },
  { kw: 'toyshop', w: { indoor: 0.5 } },
  { kw: 'confectionery', w: { indoor: 0.5 } },
  { kw: 'bakery', w: { indoor: 0.5 } },
  { kw: 'restaurant', w: { indoor: 0.6 } },
  { kw: 'cinema', w: { indoor: 0.4, urban: 0.4 } },
  { kw: 'library', w: { indoor: 0.5, urban: 0.3 } },
  // interiors
  { kw: 'home theater', w: { indoor: 0.7 } },
  { kw: 'four-poster', w: { indoor: 0.7 } },
  { kw: 'studio couch', w: { indoor: 0.7 } },
  { kw: 'dining table', w: { indoor: 0.6 } },
  { kw: 'desk', w: { indoor: 0.6 } },
  { kw: 'wardrobe', w: { indoor: 0.6 } },
  { kw: 'china cabinet', w: { indoor: 0.6 } },
  { kw: 'entertainment center', w: { indoor: 0.6 } },
  { kw: 'bookcase', w: { indoor: 0.6 } },
  { kw: 'file cabinet', w: { indoor: 0.5 } },
  { kw: 'refrigerator', w: { indoor: 0.6 } },
  { kw: 'dishwasher', w: { indoor: 0.6 } },
  { kw: 'automatic washer', w: { indoor: 0.5 } },
  { kw: 'stove', w: { indoor: 0.6 } },
  { kw: 'microwave', w: { indoor: 0.5 } },
  { kw: 'toaster', w: { indoor: 0.4 } },
  { kw: 'espresso maker', w: { indoor: 0.4 } },
  { kw: 'bathtub', w: { indoor: 0.5 } },
  { kw: 'shower curtain', w: { indoor: 0.5 } },
  { kw: 'toilet seat', w: { indoor: 0.5 } },
  { kw: 'window shade', w: { indoor: 0.4 } },
  { kw: 'shoji', w: { indoor: 0.4 } },
  { kw: 'sliding door', w: { indoor: 0.4 } },
  { kw: 'radiator', w: { indoor: 0.4 } },
  { kw: 'table lamp', w: { indoor: 0.4 } },
  { kw: 'crib', w: { indoor: 0.4 } },
  { kw: 'altar', w: { indoor: 0.4, urban: 0.2 } },
  { kw: 'pew', w: { indoor: 0.4, urban: 0.3 } },
  { kw: 'throne', w: { indoor: 0.4, urban: 0.2 } },
];

const WINDOW = 4; // polls kept for the smoothed mean (~10 s at one poll / 2.5 s)
const MIN_SCORE = 0.15; // window-mean floor for a bucket to be reportable
const FRAME_FLOOR = 0.1; // this poll's own top bucket must reach this to count
const SWITCH_MARGIN = 1.3; // challenger must beat the held bucket by 30 %
const CONFIRM = 2; // consecutive corroborating polls before switching (~5 s)

function scoreFrame(preds: Prediction[]): Map<SceneCategory, number> {
  const frame = new Map<SceneCategory, number>();
  for (const pred of preds) {
    const name = pred.className.toLowerCase();
    for (const { kw, w } of SYNSETS) {
      if (!name.includes(kw)) continue;
      for (const [bucket, weight] of Object.entries(w) as Array<[SceneCategory, number]>) {
        frame.set(bucket, (frame.get(bucket) ?? 0) + weight * pred.probability);
      }
    }
  }
  return frame;
}

function topBucket(scores: Map<SceneCategory, number>): { bucket: SceneCategory | null; score: number } {
  let bucket: SceneCategory | null = null;
  let score = 0;
  for (const [b, s] of scores) {
    if (s > score) {
      score = s;
      bucket = b;
    }
  }
  return { bucket, score };
}

/**
 * Turns a stream of MobileNet classifications into a stable scene bucket. Owned
 * by whoever is polling (one per `Auto` session) so there is no shared state to
 * reset and an in-flight poll from a previous session can't leak in.
 */
export class SceneVoter {
  private history: Array<Map<SceneCategory, number>> = [];
  private reported: SceneCategory | null = null;
  private challenger: SceneCategory | null = null;
  private streak = 0;

  get current(): SceneCategory | null {
    return this.reported;
  }

  push(preds: Prediction[]): SceneCategory | null {
    const frame = scoreFrame(preds);
    this.history.push(frame);
    if (this.history.length > WINDOW) this.history.shift();

    const mean = new Map<SceneCategory, number>();
    for (const m of this.history) {
      for (const [b, s] of m) mean.set(b, (mean.get(b) ?? 0) + s);
    }
    for (const [b, s] of mean) mean.set(b, s / this.history.length);

    const smoothed = topBucket(mean);
    const instant = topBucket(frame);

    // The streak only advances when THIS poll's own leader corroborates the
    // smoothed leader, so a single stale frame in the window can't drive a switch.
    const corroborates =
      smoothed.bucket != null &&
      smoothed.score >= MIN_SCORE &&
      instant.bucket === smoothed.bucket &&
      instant.score >= FRAME_FLOOR &&
      smoothed.bucket !== this.reported;

    if (!corroborates) {
      this.challenger = null;
      this.streak = 0;
      return this.reported;
    }

    this.streak = smoothed.bucket === this.challenger ? this.streak + 1 : 1;
    this.challenger = smoothed.bucket;

    const held = this.reported ? (mean.get(this.reported) ?? 0) : 0;
    const clearLead = this.reported == null || smoothed.score > held * SWITCH_MARGIN;
    if (clearLead && this.streak >= CONFIRM) {
      this.reported = smoothed.bucket;
      this.challenger = null;
      this.streak = 0;
    }
    return this.reported;
  }
}

export async function classifyScene(
  video: HTMLVideoElement,
  voter: SceneVoter,
): Promise<SceneCategory | null> {
  if (!video.videoWidth) return voter.current;
  const model = await preloadClassifier();
  return voter.push(await model.classify(video, 8));
}
