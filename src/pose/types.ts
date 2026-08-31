export type Landmark = { x: number; y: number; z: number; visibility: number };

export type World = { x: number; y: number; z: number };

export type PoseResult = {
  /** Primary subject (largest in frame): 33 landmarks in normalized image
   *  space (0..1), or null if no person found. */
  landmarks: Landmark[] | null;
  /** Primary subject in metric world space (metres, hip-centred), or null. */
  worldLandmarks: World[] | null;
  /** Additional people in frame, for drawing only (not matched). */
  extra: Landmark[][];
};

/** A person silhouette (from the pose segmentation mask) stored with a template. */
export type Silhouette = {
  /** White RGBA PNG, alpha = foreground. */
  dataUrl: string;
  /** Person bounds in normalized image coords. */
  bbox: { x: number; y: number; w: number; h: number };
};

export type Template = {
  id: string;
  name: string;
  createdAt: number;
  /** 33 landmarks, normalized image space. */
  landmarks: Landmark[];
  /** Metric world landmarks, when captured from a photo. */
  world?: World[];
  /** Person cut-out, when captured from a photo. */
  silhouette?: Silhouette;
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
