// BlazePose / MediaPipe PoseLandmarker 33-point topology.

export const LM = {
  nose: 0,
  lEar: 7,
  rEar: 8,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
  lFootIndex: 31,
  rFootIndex: 32,
} as const;

/** Bones we actually draw. */
export const CONNECTIONS: Array<[number, number]> = [
  [11, 12], [11, 23], [12, 24], [23, 24], // torso
  [11, 13], [13, 15], [12, 14], [14, 16], // arms
  [23, 25], [25, 27], [24, 26], [26, 28], // legs
  [27, 31], [28, 32], // feet
  [0, 11], [0, 12], // head -> shoulders (rough neck)
];

/** Joint = [a, vertex, c]; angle is measured at the vertex between a->vertex and c->vertex. */
export const JOINTS: Record<string, [number, number, number]> = {
  lElbow: [11, 13, 15],
  rElbow: [12, 14, 16],
  lShoulder: [13, 11, 23],
  rShoulder: [14, 12, 24],
  lHip: [11, 23, 25],
  rHip: [12, 24, 26],
  lKnee: [23, 25, 27],
  rKnee: [24, 26, 28],
};

export const connKey = (a: number, b: number) => `${a}-${b}`;

/** Maps a drawn bone to the joint whose error should colour it. */
export const CONNECTION_JOINT: Record<string, string> = {
  '11-13': 'lShoulder',
  '13-15': 'lElbow',
  '12-14': 'rShoulder',
  '14-16': 'rElbow',
  '23-25': 'lHip',
  '25-27': 'lKnee',
  '24-26': 'rHip',
  '26-28': 'rKnee',
  '11-23': 'torso',
  '12-24': 'torso',
  '23-24': 'torso',
  '11-12': 'torso',
};
