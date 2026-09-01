// Optional, on-demand scene detection. MobileNet gives ImageNet-1k labels; we
// map the scene-bearing ones onto our "shoot type" buckets with weights, vote
// over a short rolling window, and only switch buckets when a challenger leads
// clearly and persistently. Still a heuristic - ImageNet has no class for e.g.
// a staircase, so `stairs` only ever comes from the manual chip.
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
  { kw: 'washer', w: { indoor: 0.5 } },
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
  { kw: 'four poster', w: { indoor: 0.6 } },
  { kw: 'crib', w: { indoor: 0.4 } },
  { kw: 'altar', w: { indoor: 0.4, urban: 0.2 } },
  { kw: 'pew', w: { indoor: 0.4, urban: 0.3 } },
  { kw: 'throne', w: { indoor: 0.4, urban: 0.2 } },
];

const WINDOW = 4;
const MIN_SCORE = 0.15;
const SWITCH_MARGIN = 1.3;
const CONFIRM = 2;

let history: Array<Map<SceneCategory, number>> = [];
let reported: SceneCategory | null = null;
let challenger: SceneCategory | null = null;
let challengerStreak = 0;

export function resetSceneHistory(): void {
  history = [];
  reported = null;
  challenger = null;
  challengerStreak = 0;
}

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

export async function classifyScene(video: HTMLVideoElement): Promise<SceneCategory | null> {
  if (!video.videoWidth) return reported;

  const model = await preloadClassifier();
  history.push(scoreFrame(await model.classify(video, 8)));
  if (history.length > WINDOW) history.shift();

  const summed = new Map<SceneCategory, number>();
  for (const m of history) {
    for (const [b, s] of m) summed.set(b, (summed.get(b) ?? 0) + s);
  }

  let leader: SceneCategory | null = null;
  let leaderScore = 0;
  for (const [b, s] of summed) {
    if (s > leaderScore) {
      leaderScore = s;
      leader = b;
    }
  }

  if (!leader || leaderScore < MIN_SCORE || leader === reported) {
    if (leader === reported) {
      challenger = null;
      challengerStreak = 0;
    }
    return reported;
  }

  challengerStreak = leader === challenger ? challengerStreak + 1 : 1;
  challenger = leader;

  const clearLead = reported == null || leaderScore > (summed.get(reported) ?? 0) * SWITCH_MARGIN;
  const need = reported == null ? 1 : CONFIRM;
  if (clearLead && challengerStreak >= need) {
    reported = leader;
    challenger = null;
    challengerStreak = 0;
  }
  return reported;
}
