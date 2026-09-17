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
const BG = [11, 11, 15, 255];
const INK = [34, 211, 238, 255]; // cyan-400

function stampDisc(png, cx, cy, r, color) {
  const { width: w, height: h, data } = png;
  for (let y = Math.max(0, cy - r | 0); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r | 0); x <= Math.min(w - 1, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const i = (w * y + x) << 2;
        data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = color[3];
      }
    }
  }
}

function stampLine(png, x0, y0, x1, y1, thick, color) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    stampDisc(png, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), thick, color);
  }
}

function drawIcon(size, scale) {
  const png = new PNG({ width: size, height: size });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = BG[0]; png.data[i + 1] = BG[1]; png.data[i + 2] = BG[2]; png.data[i + 3] = BG[3];
  }
  // stick figure in a centred box of side = size*scale
  const box = size * scale;
  const ox = (size - box) / 2;
  const oy = (size - box) / 2;
  const P = (nx, ny) => [ox + nx * box, oy + ny * box];
  const lw = Math.max(2, box * 0.028);
  const jr = Math.max(2, box * 0.022);

  const head = P(0.5, 0.16);
  const neck = P(0.5, 0.30);
  const hip = P(0.5, 0.60);
  const lSho = P(0.34, 0.34), rSho = P(0.66, 0.34);
  const lHand = P(0.24, 0.60), rHand = P(0.80, 0.52);
  const lFoot = P(0.36, 0.92), rFoot = P(0.62, 0.90);

  stampLine(png, ...neck, ...hip, lw, INK);
  stampLine(png, ...lSho, ...rSho, lw, INK);
  stampLine(png, ...lSho, ...lHand, lw, INK);
  stampLine(png, ...rSho, ...rHand, lw, INK);
  stampLine(png, ...hip, ...lFoot, lw, INK);
  stampLine(png, ...hip, ...rFoot, lw, INK);
  for (const p of [neck, hip, lSho, rSho, lHand, rHand, lFoot, rFoot]) stampDisc(png, Math.round(p[0]), Math.round(p[1]), jr, INK);
  stampDisc(png, Math.round(head[0]), Math.round(head[1]), box * 0.085, INK);
  return png;
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
