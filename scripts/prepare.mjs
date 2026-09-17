// One-shot asset preparation: pose model download, MediaPipe wasm copy, app icons.
// Safe to run repeatedly; each step is skipped when its output already exists.
// Runs automatically on postinstall / predev / prebuild, or `npm run prepare:assets`.
import { existsSync, mkdirSync, cpSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const pub = resolve(root, 'public');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

async function fetchOne(url, dest, label) {
  if (existsSync(dest)) return console.log(`[prepare] ${label} model present`);
  mkdirSync(dirname(dest), { recursive: true });
  console.log(`[prepare] downloading ${label} model…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} model download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`[prepare] ${label} model saved (${(buf.length / 1e6).toFixed(1)} MB)`);
}

async function fetchModel() {
  await fetchOne(MODEL_URL, resolve(pub, 'models/pose_landmarker_lite.task'), 'pose');
}

// Hand tracking is opt-in at runtime, but downloaded up front like the pose
// model so `npm run dev`/`build` never needs network mid-session to fetch it.
async function fetchHandModel() {
  await fetchOne(HAND_MODEL_URL, resolve(pub, 'models/hand_landmarker.task'), 'hand');
}

function copyWasm() {
  const src = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
  const dest = resolve(pub, 'mediapipe/wasm');
  if (!existsSync(src)) {
    console.warn('[prepare] @mediapipe/tasks-vision not installed yet - skipping wasm copy');
    return;
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log('[prepare] copied MediaPipe wasm -> public/mediapipe/wasm');
}

// ---- procedural icons (no native deps) ---------------------------------------
// Rendered supersampled (SS x final size) then box-filtered down, so edges are
// anti-aliased instead of the hard jagged pixels a 1x raster stamp produces.
const BG_TOP = [17, 18, 26, 255];
const BG_BOTTOM = [8, 8, 12, 255];
const INK = [34, 211, 238, 255]; // cyan-400
const GLOW = [34, 211, 238];
const SS = 4;

function makeBuffer(size) {
  return { size, data: new Uint8ClampedArray(size * size * 4).fill(255) };
}

function setPx(buf, x, y, color) {
  if (x < 0 || y < 0 || x >= buf.size || y >= buf.size) return;
  const i = (buf.size * y + x) * 4;
  buf.data[i] = color[0];
  buf.data[i + 1] = color[1];
  buf.data[i + 2] = color[2];
  buf.data[i + 3] = color[3] ?? 255;
}

function fillGradient(buf, top, bottom) {
  for (let y = 0; y < buf.size; y++) {
    const t = y / (buf.size - 1);
    const c = [0, 1, 2].map((k) => Math.round(top[k] + (bottom[k] - top[k]) * t));
    for (let x = 0; x < buf.size; x++) setPx(buf, x, y, c);
  }
}

function stampDisc(buf, cx, cy, r, color) {
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(buf.size - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(buf.size - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(buf, x, y, color);
    }
  }
}

function stampLine(buf, x0, y0, x1, y1, thick, color) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    stampDisc(buf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick, color);
  }
}

/** Soft radial falloff, alpha-blended onto the existing background (a real glow, not a hard-edged disc). */
function stampGlow(buf, cx, cy, r, rgb, peakAlpha) {
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(buf.size - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(buf.size - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d > 1) continue;
      const a = peakAlpha * (1 - d) ** 2;
      const i = (buf.size * y + x) * 4;
      buf.data[i] = buf.data[i] * (1 - a) + rgb[0] * a;
      buf.data[i + 1] = buf.data[i + 1] * (1 - a) + rgb[1] * a;
      buf.data[i + 2] = buf.data[i + 2] * (1 - a) + rgb[2] * a;
    }
  }
}

/** Box-filter downsample from an SS-oversized buffer into a final-size PNG. */
function downsample(buf, outSize) {
  const ss = buf.size / outSize;
  const png = new PNG({ width: outSize, height: outSize });
  for (let oy = 0; oy < outSize; oy++) {
    const sy0 = Math.floor(oy * ss);
    const sy1 = Math.floor((oy + 1) * ss);
    for (let ox = 0; ox < outSize; ox++) {
      const sx0 = Math.floor(ox * ss);
      const sx1 = Math.floor((ox + 1) * ss);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          const i = (buf.size * y + x) * 4;
          r += buf.data[i]; g += buf.data[i + 1]; b += buf.data[i + 2]; a += buf.data[i + 3];
          n++;
        }
      }
      const o = (outSize * oy + ox) * 4;
      png.data[o] = Math.round(r / n);
      png.data[o + 1] = Math.round(g / n);
      png.data[o + 2] = Math.round(b / n);
      png.data[o + 3] = Math.round(a / n);
    }
  }
  return png;
}

function drawIcon(size, scale) {
  const buf = makeBuffer(size * SS);
  fillGradient(buf, BG_TOP, BG_BOTTOM);

  const box = size * SS * scale;
  const ox = (size * SS - box) / 2;
  const oy = (size * SS - box) / 2;
  const P = (nx, ny) => [ox + nx * box, oy + ny * box];
  const lw = Math.max(2, box * 0.026);
  const jr = Math.max(2, box * 0.02);

  const head = P(0.5, 0.16);
  const neck = P(0.5, 0.3);
  const hip = P(0.5, 0.6);
  const lSho = P(0.34, 0.34), rSho = P(0.66, 0.34);
  const lHand = P(0.24, 0.6), rHand = P(0.8, 0.52);
  const lFoot = P(0.36, 0.92), rFoot = P(0.62, 0.9);

  stampGlow(buf, ...P(0.5, 0.48), box * 0.62, GLOW, 0.22);

  for (const [a, b] of [[neck, hip], [lSho, rSho], [lSho, lHand], [rSho, rHand], [hip, lFoot], [hip, rFoot]]) {
    stampLine(buf, a[0], a[1], b[0], b[1], lw, INK);
  }
  for (const p of [neck, hip, lSho, rSho, lHand, rHand, lFoot, rFoot]) stampDisc(buf, p[0], p[1], jr, INK);
  stampDisc(buf, head[0], head[1], box * 0.085, INK);

  return downsample(buf, size);
}

function savePng(png, file) {
  return new Promise((res, rej) => {
    const out = createWriteStream(file);
    png.pack().pipe(out);
    out.on('finish', res);
    out.on('error', rej);
  });
}

async function genIcons() {
  const dir = resolve(pub, 'icons');
  mkdirSync(dir, { recursive: true });
  const targets = [
    ['icon-192.png', 192, 0.78],
    ['icon-512.png', 512, 0.78],
    ['maskable-512.png', 512, 0.6],
  ];
  for (const [name, size, scale] of targets) {
    const file = resolve(dir, name);
    if (existsSync(file)) continue;
    await savePng(drawIcon(size, scale), file);
    console.log('[prepare] wrote icons/' + name);
  }
}

// ---------------------------------------------------------------------------
try { await fetchModel(); } catch (e) { console.warn('[prepare] model step:', e.message); }
try { await fetchHandModel(); } catch (e) { console.warn('[prepare] hand model step:', e.message); }
copyWasm();
try { await genIcons(); } catch (e) { console.warn('[prepare] icon step:', e.message); }
