import { POSE_BANK, type BankPose, type SceneCategory } from './poseBank';

function relevance(pose: BankPose, cats: SceneCategory[]): number {
  let n = 0;
  for (const c of cats) if (pose.scenes.includes(c)) n += c === 'candid' ? 0.5 : 1;
  return n;
}

/** Bank poses ordered by relevance to the given scene (all poses always returned). */
export function suggestPoses(category: SceneCategory | null): BankPose[] {
  const cats: SceneCategory[] = category ? [category, 'candid'] : ['portrait', 'candid'];
  return POSE_BANK.map((p, i) => ({ p, i, s: relevance(p, cats) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}
