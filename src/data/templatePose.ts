import type { Template, TemplatePose } from '../pose/types';

/** Normalized view of a template's people, whether it's v1 (single) or a group. */
export function templatePoses(t: Template): TemplatePose[] {
  if (t.poses && t.poses.length > 0) return t.poses;
  return [{ landmarks: t.landmarks, world: t.world, silhouette: t.silhouette }];
}

export function isGroupTemplate(t: Template): boolean {
  return !!t.poses && t.poses.length > 1;
}
