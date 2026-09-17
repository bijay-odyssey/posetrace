export type Landmark = { x: number; y: number; z: number; visibility: number };

export type World = { x: number; y: number; z: number };

/** 21 hand landmarks (wrist, then 4 joints per finger: thumb, index, middle, ring, pinky). */
export type Hand = {
  landmarks: Landmark[];
  handedness: 'Left' | 'Right';
};

export type PoseResult = {
  /** Primary subject (largest in frame): 33 landmarks in normalized image
   *  space (0..1), or null if no person found. */
  landmarks: Landmark[] | null;
  /** Primary subject in metric world space (metres, hip-centred), or null. */
  worldLandmarks: World[] | null;
  /** Additional people in frame, for drawing only (not matched). */
  extra: Landmark[][];
  /** Detected hands, live display only (not matched against a template). */
  hands: Hand[];
};

/** A person silhouette (from the pose segmentation mask) stored with a template. */
export type Silhouette = {
  /** White RGBA PNG, alpha = foreground. */
  dataUrl: string;
  /** Person bounds in normalized image coords. */
  bbox: { x: number; y: number; w: number; h: number };
};

/** One person's pose within a template. */
export type TemplatePose = {
  landmarks: Landmark[];
  world?: World[];
  silhouette?: Silhouette;
};

export type Template = {
  id: string;
  name: string;
  createdAt: number;
  /** Primary pose (mirrors `poses[0]`); kept for compatibility with v1 data. */
  landmarks: Landmark[];
  world?: World[];
  silhouette?: Silhouette;
  /** Present for multi-person templates. Absent = single-person (use fields above). */
  poses?: TemplatePose[];
  /** Small JPEG/PNG data URL used as a thumbnail. */
  thumb?: string;
};

export type MatchResult = {
  score: number;
  ready: boolean;
  jointErrors: Record<string, number>;
  hints: string[];
  framing: { dx: number; dy: number; scale: number };
};

export type MatchOptions = { readyScore: number; mirror: boolean };
