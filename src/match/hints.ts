// Turns pose/framing error into short spoken-style coaching phrases.
//
// All directions in these phrases are screen-space: "left" means the left side
// of the screen (matching the framing/lean phrases below). On a mirrored preview
// the anatomical side already lands on the matching side of the screen; on a
// non-mirrored preview they are opposite, so the word is swapped there.
type Framing = { dx: number; dy: number; scale: number };

const side = (key: string, mirror: boolean): 'left' | 'right' => {
  const anatomicalLeft = key[0] === 'l';
  return anatomicalLeft === mirror ? 'left' : 'right';
};

/** @param d live angle minus target angle, radians */
function jointHint(key: string, d: number, mirror: boolean): string | null {
  if (Math.abs(d) < 0.2) return null;
  const s = side(key, mirror);
  if (key.endsWith('Elbow')) return d < 0 ? `straighten your ${s} arm` : `bend your ${s} arm more`;
  if (key.endsWith('Shoulder')) return d < 0 ? `raise your ${s} arm` : `lower your ${s} arm`;
  if (key.endsWith('Knee')) return d < 0 ? `straighten your ${s} leg` : `bend your ${s} knee`;
  if (key.endsWith('Hip')) return d < 0 ? `swing your ${s} leg forward` : `swing your ${s} leg back`;
  return null;
}

function torsoHint(d: number, mirror: boolean): string | null {
  if (Math.abs(d) < 0.16) return null;
  let dir = d > 0 ? 'right' : 'left';
  if (mirror) dir = dir === 'right' ? 'left' : 'right';
  return `lean slightly ${dir}`;
}

function framingHints(f: Framing, mirror: boolean): string[] {
  const out: string[] = [];
  if (f.scale < 0.8) out.push('step closer');
  else if (f.scale > 1.25) out.push('step back');

  let dx = f.dx;
  if (mirror) dx = -dx;
  if (Math.abs(dx) > 0.09) out.push(dx > 0 ? 'move left' : 'move right');

  if (f.dy > 0.12) out.push('lift the camera');
  else if (f.dy < -0.12) out.push('lower the camera');
  return out;
}

export function buildHints(
  jointErrors: Record<string, number>,
  live: Record<string, number>,
  target: Record<string, number>,
  framing: Framing,
  mirror: boolean,
): string[] {
  const framing2 = framingHints(framing, mirror);

  const jointOrder = Object.keys(jointErrors)
    .filter((k) => k !== 'torso' && isFinite(jointErrors[k]))
    .sort((a, b) => jointErrors[b] - jointErrors[a]);

  const jointPhrases = jointOrder
    .map((k) => jointHint(k, live[k] - target[k], mirror))
    .filter((v): v is string => !!v);

  const torso = torsoHint(live.torso - target.torso, mirror);

  const ordered = [...framing2, ...(torso ? [torso] : []), ...jointPhrases];
  return [...new Set(ordered)].slice(0, 2);
}
