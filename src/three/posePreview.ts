// Lazy-loaded three.js widget: a small translucent 3D figure built from a
// pose's landmarks (metric world landmarks when available, otherwise the flat
// 2D pose). Drag to orbit, pinch / wheel to zoom; idles into a slow spin.
import { CONNECTIONS } from '../pose/landmarks';
import type { Landmark, World } from '../pose/types';

export type PosePreview = {
  setPose(landmarks: Landmark[], world?: World[]): void;
  dispose(): void;
};

export async function createPosePreview(
  canvas: HTMLCanvasElement,
  initial?: { landmarks: Landmark[]; world?: World[] },
): Promise<PosePreview> {
  const THREE = await import('three');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.width, canvas.height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 3.4);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(1.5, 2, 3);
  scene.add(key);

  const spin = new THREE.Group();
  const inner = new THREE.Group();
  spin.add(inner);
  scene.add(spin);

  const jointMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.95 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.4 });
  const jointGeo = new THREE.SphereGeometry(0.035, 12, 12);
  const boneGeo = new THREE.CylinderGeometry(0.017, 0.017, 1, 8);

  const joints = Array.from({ length: 33 }, () => {
    const m = new THREE.Mesh(jointGeo, jointMat);
    m.visible = false;
    inner.add(m);
    return m;
  });
  const bones = CONNECTIONS.map(() => {
    const m = new THREE.Mesh(boneGeo, boneMat);
    m.visible = false;
    inner.add(m);
    return m;
  });

  const pts = Array.from({ length: 33 }, () => new THREE.Vector3());
  const UP = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const midV = new THREE.Vector3();

  function setPose(landmarks: Landmark[], world?: World[]): void {
    for (let i = 0; i < 33; i++) {
      const lm = landmarks[i];
      if (world && world[i]) {
        pts[i].set(world[i].x, -world[i].y, -world[i].z);
      } else if (lm) {
        pts[i].set((lm.x - 0.5) * 1.7, -(lm.y - 0.5) * 2.1, 0);
      }
      const vis = (lm?.visibility ?? 0) >= 0.3;
      joints[i].visible = vis;
      joints[i].position.copy(pts[i]);
    }

    midV.copy(pts[23]).add(pts[24]).multiplyScalar(0.5);
    inner.position.set(-midV.x, -midV.y, -midV.z);

    CONNECTIONS.forEach(([a, b], k) => {
      const mesh = bones[k];
      const ok = (landmarks[a]?.visibility ?? 0) >= 0.3 && (landmarks[b]?.visibility ?? 0) >= 0.3;
      mesh.visible = ok;
      if (!ok) return;
      dir.copy(pts[b]).sub(pts[a]);
      const len = dir.length();
      mesh.position.copy(pts[a]).add(pts[b]).multiplyScalar(0.5);
      mesh.scale.set(1, Math.max(len, 1e-3), 1);
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    });
  }

  if (initial) setPose(initial.landmarks, initial.world);

  // ---- drag to orbit, pinch / wheel to zoom, idle spin when left alone ------
  const MIN_Z = 1.8;
  const MAX_Z = 6;
  const IDLE_MS = 2500;
  const pointers = new Map<number, { x: number; y: number }>();
  let yaw = 0;
  let pitch = 0;
  let pinchDist = 0;
  let lastInteract = -IDLE_MS;

  const clampZoom = (z: number) => Math.max(MIN_Z, Math.min(MAX_Z, z));

  const onPointerDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinchDist = 0;
    lastInteract = performance.now();
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size === 1) {
      yaw += dx * 0.01;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.01));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) camera.position.z = clampZoom((camera.position.z * pinchDist) / d);
      pinchDist = d;
    }
    lastInteract = performance.now();
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    lastInteract = performance.now();
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    camera.position.z = clampZoom(camera.position.z + e.deltaY * 0.002);
    lastInteract = performance.now();
  };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  let raf = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    if (pointers.size === 0 && performance.now() - lastInteract > IDLE_MS) yaw += 0.012;
    spin.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    setPose,
    dispose() {
      stopped = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      jointGeo.dispose();
      boneGeo.dispose();
      jointMat.dispose();
      boneMat.dispose();
      renderer.dispose();
    },
  };
}
