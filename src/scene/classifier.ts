// Optional, on-demand scene detection. MobileNet gives ImageNet labels, which we
// map onto a few coarse "shoot type" buckets. It is a heuristic, not a real scene
// classifier - treat the result as a hint, not ground truth.
import type { SceneCategory } from '../data/poseBank';

type MobileNet = { classify(el: HTMLVideoElement, topk?: number): Promise<Array<{ className: string; probability: number }>> };

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

const RULES: Array<[RegExp, SceneCategory[]]> = [
  [/seashore|sandbar|lakeside|beach|ocean|coast|promontory|breakwater|cliff/, ['beach', 'nature']],
  [/alp|valley|volcano|geyser|\bpark\b|hay|meadow|rapeseed|forest|\btree\b|garden|mountain|lakeshore/, ['nature']],
  [/street sign|traffic light|parking meter|taxicab|streetcar|trolleybus|\bpier\b|bridge|fountain|crosswalk|manhole/, ['street', 'urban']],
  [/castle|church|bell cote|monastery|palace|dome|triumphal arch|\btower\b|prison|library|planetarium|cinema/, ['urban']],
  [/bookshop|bookcase|restaurant|home theater|\bdesk\b|dining table|four-poster|studio couch|wardrobe|shoji|china cabinet|refrigerator|\bstove\b|dishwasher/, ['indoor']],
  [/staircase|stairway|\bsteps\b|escalator/, ['stairs']],
  [/patio|terrace|greenhouse|\bbarn\b|boathouse|picket fence|worm fence|stone wall|mobile home/, ['urban', 'nature']],
];

export async function classifyScene(video: HTMLVideoElement): Promise<SceneCategory | null> {
  if (!video.videoWidth) return null;
  const model = await preloadClassifier();
  const preds = await model.classify(video, 5);
  const votes = new Map<SceneCategory, number>();
  for (const pred of preds) {
    const name = pred.className.toLowerCase();
    for (const [re, cats] of RULES) {
      if (re.test(name)) for (const c of cats) votes.set(c, (votes.get(c) ?? 0) + pred.probability);
    }
  }
  let best: SceneCategory | null = null;
  let bestScore = 0.12;
  for (const [c, s] of votes) {
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}
