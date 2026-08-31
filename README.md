# PoseTrace

An installable (Add to Home Screen) PWA that overlays a live **pose trace** on the
phone camera — like the Huawei / Xiaomi "ghost silhouette" pose guide.

**Phase 1:**

- Live 33-point skeleton on the camera feed (MediaPipe PoseLandmarker, runs in a
  Web Worker with a main-thread fallback for older iOS).
- **Reference-photo mode:** import any photo → its pose skeleton is extracted and
  projected onto the viewfinder as a white "ghost".
- **Match scoring:** joint-angle comparison, normalized for body size and camera
  distance. Each limb turns green / yellow / red by how close it is.
- Short coaching hints ("raise your left arm", "step back").
- Auto-shutter when you hold the pose, or tap to capture. Save / share the photo.
- Templates saved locally (IndexedDB) with JSON export / import.

**Phase 2:**

- **Pose bank + suggestions** (`✦` button): 10 built-in poses, each tagged by
  shoot type. Tap a scene chip (Portrait / Street / Beach / Stairs / …) to reorder
  suggestions, tap a thumbnail to load it as the ghost.
- **Auto scene detect** (`Auto` chip): lazy-loads TensorFlow.js MobileNet and maps
  its ImageNet guesses onto those buckets. Heuristic — a hint, not ground truth.
- **Level guide:** device-tilt bar in the centre, green when the phone is level
  (needs the motion-sensor permission prompt on iOS).
- **Audio cue:** rising chime when the pose locks in; click on capture. (iOS web
  has no vibration API.)
- **Wake lock:** screen stays on while the camera is live (iOS 16.4+).

**Phase 3:**

- **Silhouette ghost:** importing a photo also keeps the person cut-out from
  MediaPipe's pose segmentation mask. It's re-anchored onto you as a translucent
  shape — the Huawei-style "ghost". `Options → Ghost style` switches between
  Silhouette / Skeleton / Both. (Bank poses have no cut-out → skeleton only.)
- **3D pose preview:** `Options → 3D pose preview` opens a small three.js panel
  showing the target pose as a slowly rotating translucent figure — built from the
  photo's metric world landmarks, or the flat 2D pose for bank poses. three.js is
  a lazy chunk, loaded only when opened.
- **Group aware:** up to 3 people are detected; the largest/nearest is the one
  scored, the others are drawn dimly so friends in frame don't break the match.
- Offline after first use — app shell is precached; wasm, pose model, the
  TensorFlow bundle and the three.js bundle are cached on first fetch.

## Run it

```bash
npm install          # also downloads the pose model + copies wasm + builds icons
npm run dev          # https://localhost:5173  (and your LAN IP, HTTPS)
```

`npm install` runs `scripts/prepare.mjs`, which needs network once to fetch
`pose_landmarker_lite.task` (~3 MB) into `public/models/`. Re-run any time with
`npm run prepare:assets`.

### Testing on a real iPhone

iOS only grants camera access over HTTPS, so:

1. `npm run dev -- --host`, note the `https://<your-lan-ip>:5173` URL.
2. Open it in Safari on the iPhone. Accept the self-signed certificate warning
   (Advanced → Proceed). Grant camera permission.
3. Share → **Add to Home Screen**. Launch from the icon — it runs full-screen with
   no browser chrome.

For a warning-free experience, deploy `npm run build` output (`dist/`) to any
static host (Cloudflare Pages / Netlify / Vercel free tier) and open that on the
phone.

## How the matching works

| Step | File |
| --- | --- |
| Camera + `getUserMedia` | `src/camera.ts` |
| Pose inference (worker / main, GPU / CPU) | `src/pose/poseClient.ts`, `src/pose/worker.ts`, `src/pose/runLandmarker.ts` |
| Landmark de-jitter (1€ filter) | `src/filter/oneEuro.ts` |
| Normalize (hip-centre + torso scale) | `src/match/normalize.ts` |
| Joint angles + torso lean | `src/match/angles.ts` |
| Score, per-joint error, framing delta | `src/match/matcher.ts` |
| Coaching phrases | `src/match/hints.ts` |
| Skeleton + ghost drawing | `src/overlay/draw.ts` |
| Frame loop (infer → filter → match → draw) | `src/hooks/usePoseLoop.ts` |
| Reference-photo pose extraction | `src/reference/importImage.ts` |
| Template persistence | `src/store/templates.ts` |
| Built-in pose bank + scene tags | `src/data/poseBank.ts`, `src/data/suggest.ts` |
| Scene detection (lazy MobileNet) | `src/scene/classifier.ts` |
| Audio cues / wake lock / level | `src/audio/cues.ts`, `src/hooks/useWakeLock.ts`, `src/hooks/useLevel.ts` |
| Silhouette cut-out from seg mask | `src/reference/importImage.ts` (`buildSilhouette`) |
| 3D pose preview (lazy three.js) | `src/three/posePreview.ts`, `src/ui/PosePreview3D.tsx` |
| Multi-person select + draw | `src/pose/runLandmarker.ts` (`primaryIndex`), `src/overlay/draw.ts` |

Tuning knobs: `WEIGHTS` / `MAX_ERR` in `src/match/matcher.ts`, colour thresholds
in `src/overlay/draw.ts`, filter constants in `src/filter/oneEuro.ts`,
`readyScore` in `src/app.tsx` (`DEFAULT_SETTINGS`), scene-label rules in
`src/scene/classifier.ts` (`RULES`), pose coordinates in `src/data/poseBank.ts`.

## Known iOS / PWA limits

- Camera in a home-screen PWA works iOS 13.4+ (solid 14.3+).
- Worker + `OffscreenCanvas` path needs iOS 16.4+; older devices auto-fall back to
  main-thread inference.
- No `navigator.vibrate` on iOS — feedback is sound + colour only.
- IndexedDB can be evicted for PWAs; use the JSON export.
- Use the **Lite** model only; heavier models can crash the Safari tab.
- Running MediaPipe + MobileNet together is heavy; `Auto` scene detect ticks at
  0.4 Hz and is off by default.
- `DeviceOrientation` (level guide) needs a permission prompt on iOS, triggered
  from the "Start camera" tap.
- `numPoses` is 3 (group support); drop it to 1 in `src/pose/runLandmarker.ts`
  if inference is too slow on an older device.
- IMAGE-mode world landmarks (used by the 3D preview) are approximate; the panel
  labels itself "flat" when a pose has none.

## Roadmap

- Group *templates* (match several people to a multi-person reference), not just
  drawing extra skeletons.
- A real scene model (Places365 converted to TFJS) to replace the ImageNet-label
  heuristic in `src/scene/classifier.ts`.
- Burn-in option: composite the skeleton/silhouette into the saved photo.
- Orbit/pinch controls on the 3D preview instead of auto-rotate.

## Credits (all Apache-2.0 / MIT)

MediaPipe Tasks Vision · TensorFlow.js + MobileNet · three.js · Preact · Vite ·
vite-plugin-pwa (Workbox) · Comlink · idb-keyval · pngjs. Matching approach
inspired by Google's *Move Mirror*.
