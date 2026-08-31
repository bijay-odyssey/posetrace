import type { Landmark, Template } from '../pose/types';

export type SceneCategory =
  | 'portrait'
  | 'street'
  | 'urban'
  | 'indoor'
  | 'nature'
  | 'beach'
  | 'stairs'
  | 'candid';

export const SCENE_CATEGORIES: Array<{ id: SceneCategory; label: string }> = [
  { id: 'portrait', label: 'Portrait' },
  { id: 'candid', label: 'Candid' },
  { id: 'street', label: 'Street' },
  { id: 'urban', label: 'Urban' },
  { id: 'indoor', label: 'Indoor' },
  { id: 'nature', label: 'Nature' },
  { id: 'beach', label: 'Beach' },
  { id: 'stairs', label: 'Stairs' },
];

type XY = [number, number];

// Only the joints the matcher / renderer use. Anatomical "left" (index 11, 13, ...)
// sits at a LARGER x, i.e. the subject faces the camera. Coordinates are in
// normalized image space (x right, y down), figure roughly centred.
type Skel = {
  nose: XY;
  lSho: XY;
  rSho: XY;
  lElb: XY;
  rElb: XY;
  lWri: XY;
  rWri: XY;
  lHip: XY;
  rHip: XY;
  lKne: XY;
  rKne: XY;
  lAnk: XY;
  rAnk: XY;
};

function skel(s: Skel): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  const put = (i: number, [x, y]: XY, v = 1) => {
    pts[i] = { x, y, z: 0, visibility: v };
  };
  put(0, s.nose);
  put(11, s.lSho);
  put(12, s.rSho);
  put(13, s.lElb);
  put(14, s.rElb);
  put(15, s.lWri);
  put(16, s.rWri);
  put(23, s.lHip);
  put(24, s.rHip);
  put(25, s.lKne);
  put(26, s.rKne);
  put(27, s.lAnk);
  put(28, s.rAnk);
  put(31, [s.lAnk[0] - 0.02, s.lAnk[1] + 0.03]);
  put(32, [s.rAnk[0] - 0.02, s.rAnk[1] + 0.03]);
  return pts;
}

export type BankPose = {
  id: string;
  name: string;
  scenes: SceneCategory[];
  landmarks: Landmark[];
};

export const POSE_BANK: BankPose[] = [
  {
    id: 'relaxed',
    name: 'Relaxed',
    scenes: ['portrait', 'indoor', 'candid'],
    landmarks: skel({
      nose: [0.485, 0.11],
      lSho: [0.565, 0.275], rSho: [0.44, 0.28],
      lElb: [0.585, 0.4], rElb: [0.415, 0.4],
      lWri: [0.6, 0.515], rWri: [0.405, 0.515],
      lHip: [0.55, 0.52], rHip: [0.46, 0.52],
      lKne: [0.55, 0.72], rKne: [0.475, 0.72],
      lAnk: [0.555, 0.925], rAnk: [0.49, 0.925],
    }),
  },
  {
    id: 'hand-on-hip',
    name: 'Hand on hip',
    scenes: ['portrait', 'urban', 'indoor'],
    landmarks: skel({
      nose: [0.485, 0.11],
      lSho: [0.57, 0.275], rSho: [0.44, 0.275],
      lElb: [0.605, 0.4], rElb: [0.405, 0.4],
      lWri: [0.615, 0.52], rWri: [0.455, 0.505],
      lHip: [0.55, 0.52], rHip: [0.46, 0.52],
      lKne: [0.545, 0.72], rKne: [0.475, 0.71],
      lAnk: [0.55, 0.925], rAnk: [0.5, 0.92],
    }),
  },
  {
    id: 'power-stance',
    name: 'Power stance',
    scenes: ['urban', 'portrait', 'street'],
    landmarks: skel({
      nose: [0.5, 0.11],
      lSho: [0.575, 0.275], rSho: [0.425, 0.275],
      lElb: [0.62, 0.4], rElb: [0.38, 0.4],
      lWri: [0.565, 0.5], rWri: [0.435, 0.5],
      lHip: [0.55, 0.52], rHip: [0.45, 0.52],
      lKne: [0.6, 0.72], rKne: [0.4, 0.72],
      lAnk: [0.635, 0.925], rAnk: [0.365, 0.925],
    }),
  },
  {
    id: 'arms-crossed',
    name: 'Arms crossed',
    scenes: ['urban', 'portrait', 'indoor'],
    landmarks: skel({
      nose: [0.5, 0.11],
      lSho: [0.57, 0.28], rSho: [0.43, 0.28],
      lElb: [0.6, 0.4], rElb: [0.4, 0.4],
      lWri: [0.44, 0.37], rWri: [0.56, 0.37],
      lHip: [0.545, 0.52], rHip: [0.455, 0.52],
      lKne: [0.55, 0.72], rKne: [0.45, 0.72],
      lAnk: [0.555, 0.925], rAnk: [0.445, 0.925],
    }),
  },
  {
    id: 'both-hands-up',
    name: 'Hands up',
    scenes: ['beach', 'nature', 'candid'],
    landmarks: skel({
      nose: [0.5, 0.12],
      lSho: [0.565, 0.28], rSho: [0.435, 0.28],
      lElb: [0.63, 0.185], rElb: [0.37, 0.185],
      lWri: [0.695, 0.095], rWri: [0.305, 0.095],
      lHip: [0.545, 0.52], rHip: [0.455, 0.52],
      lKne: [0.55, 0.72], rKne: [0.45, 0.72],
      lAnk: [0.555, 0.925], rAnk: [0.445, 0.925],
    }),
  },
  {
    id: 'wave',
    name: 'Wave',
    scenes: ['candid', 'street', 'beach'],
    landmarks: skel({
      nose: [0.5, 0.11],
      lSho: [0.565, 0.28], rSho: [0.435, 0.28],
      lElb: [0.585, 0.4], rElb: [0.4, 0.19],
      lWri: [0.6, 0.515], rWri: [0.44, 0.09],
      lHip: [0.545, 0.52], rHip: [0.455, 0.52],
      lKne: [0.55, 0.72], rKne: [0.45, 0.72],
      lAnk: [0.555, 0.925], rAnk: [0.445, 0.925],
    }),
  },
  {
    id: 'hair-touch',
    name: 'Looking away',
    scenes: ['portrait', 'beach', 'candid'],
    landmarks: skel({
      nose: [0.47, 0.115],
      lSho: [0.565, 0.28], rSho: [0.44, 0.28],
      lElb: [0.6, 0.2], rElb: [0.42, 0.41],
      lWri: [0.52, 0.12], rWri: [0.435, 0.52],
      lHip: [0.55, 0.52], rHip: [0.46, 0.52],
      lKne: [0.55, 0.72], rKne: [0.475, 0.72],
      lAnk: [0.555, 0.925], rAnk: [0.49, 0.925],
    }),
  },
  {
    id: 'lean-wall',
    name: 'Lean',
    scenes: ['urban', 'indoor', 'portrait'],
    landmarks: skel({
      nose: [0.455, 0.13],
      lSho: [0.585, 0.28], rSho: [0.455, 0.31],
      lElb: [0.61, 0.41], rElb: [0.44, 0.43],
      lWri: [0.6, 0.52], rWri: [0.47, 0.52],
      lHip: [0.55, 0.53], rHip: [0.475, 0.54],
      lKne: [0.55, 0.73], rKne: [0.505, 0.74],
      lAnk: [0.5, 0.93], rAnk: [0.53, 0.93],
    }),
  },
  {
    id: 'sit-steps',
    name: 'Sit on steps',
    scenes: ['stairs', 'urban', 'candid'],
    landmarks: skel({
      nose: [0.5, 0.31],
      lSho: [0.56, 0.44], rSho: [0.44, 0.44],
      lElb: [0.585, 0.55], rElb: [0.415, 0.55],
      lWri: [0.57, 0.63], rWri: [0.43, 0.63],
      lHip: [0.55, 0.65], rHip: [0.45, 0.65],
      lKne: [0.58, 0.6], rKne: [0.42, 0.6],
      lAnk: [0.6, 0.83], rAnk: [0.4, 0.83],
    }),
  },
  {
    id: 'walk',
    name: 'Walking',
    scenes: ['street', 'nature', 'candid'],
    landmarks: skel({
      nose: [0.49, 0.11],
      lSho: [0.565, 0.28], rSho: [0.435, 0.28],
      lElb: [0.605, 0.4], rElb: [0.415, 0.39],
      lWri: [0.6, 0.5], rWri: [0.45, 0.31],
      lHip: [0.545, 0.52], rHip: [0.455, 0.52],
      lKne: [0.5, 0.7], rKne: [0.585, 0.72],
      lAnk: [0.475, 0.9], rAnk: [0.6, 0.87],
    }),
  },
];

export function bankPoseToTemplate(p: BankPose, thumb?: string): Template {
  return { id: `bank:${p.id}`, name: p.name, landmarks: p.landmarks, thumb, createdAt: 0 };
}
