import { CONNECTIONS } from '../pose/landmarks';
import type { Landmark } from '../pose/types';

/** Renders a skeleton to a small dark PNG data URL for pose-picker thumbnails. */
export function renderSkeletonThumb(landmarks: Landmark[], size = 168): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, size, size);

  const vis = landmarks.filter((p) => (p.visibility ?? 0) >= 0.3);
  if (vis.length < 2) return canvas.toDataURL('image/png');

  const xs = vis.map((p) => p.x);
  const ys = vis.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = size * 0.14;
  const inner = size - pad * 2;
  const s = Math.min(inner / Math.max(1e-3, maxX - minX), inner / Math.max(1e-3, maxY - minY));
  const ox = pad + (inner - s * (maxX - minX)) / 2;
  const oy = pad + (inner - s * (maxY - minY)) / 2;
  const at = (p: Landmark): [number, number] => [ox + (p.x - minX) * s, oy + (p.y - minY) * s];

  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [a, b] of CONNECTIONS) {
    const p = landmarks[a];
    const q = landmarks[b];
    if ((p?.visibility ?? 0) < 0.3 || (q?.visibility ?? 0) < 0.3) continue;
    const [ax, ay] = at(p);
    const [bx, by] = at(q);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  ctx.fillStyle = '#22d3ee';
  for (const p of vis) {
    const [x, y] = at(p);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL('image/png');
}
