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
- Auto-shutter when you hold the pose, or tap to capture. The review screen
  shows a match badge (score, reference thumbnail) before you save / share.
- Templates saved locally (IndexedDB) with JSON export / import.

**Phase 2:**

- **Pose bank + suggestions** (`✦` button): 10 built-in poses, each tagged by
  shoot type. Tap a scene chip (Portrait / Street / Beach / Stairs / …) to reorder
  suggestions, tap a thumbnail to load it as the ghost.
- **Auto scene detect** (`Auto` chip): lazy-loads TensorFlow.js MobileNet, maps
  the scene-bearing ImageNet-1k labels onto those buckets with weights, smooths
  over the last few polls, and only switches when a challenger leads the mean
  *and* is corroborated by consecutive polls (~5 s). Still a heuristic — ImageNet
  has no class for a staircase, so `Stairs` stays manual.
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
  showing the target pose as a translucent figure — drag to orbit, pinch/wheel to
  zoom, idles into a slow spin. Built from the photo's metric world landmarks, or
  the flat 2D pose for bank poses. three.js is a lazy chunk, loaded only when
  opened.
- **Group aware:** up to 3 people are detected. With a single-person reference the
  largest/nearest is scored and the rest are drawn dimly. Import a photo with
  several people and it becomes a **group template**: each template slot takes the
  nearest live person, everyone gets their own ghost and score, and the HUD shows
  the per-person breakdown (`–` for a missing person) plus the mean over whoever's
  present. READY needs every slot filled. Import drops detections much smaller than
  the biggest one (posters, reflections), so group members should be at a similar
  distance. Only the primary person is jitter-filtered; group ghosts are skeletons
  (no per-person silhouette).
- **Burn overlay into photo:** `Options` toggle — the skeleton / silhouette ghost
  is composited into the saved JPEG (grid and level guides never are). When on,
  the photo is cropped to the viewfinder so it lines up.
- **Hand tracking:** `Options` toggle (off by default) — a second MediaPipe
  model (HandLandmarker, 21 points/hand, up to 2 hands) runs alongside pose and
  draws a hand skeleton. Live display only, not matched against a template; a
  second full inference pass per frame, so it costs real CPU/GPU — the ~8 MB
  model only downloads the first time it's switched on.
- **Blueprint ghost style:** a fourth `Ghost style` option (`Options`) —
  monochrome thin-line skeleton instead of cyan/silhouette, plus live on-screen
  callouts computed from your actual tracked pose: torso lean and head tilt
  always, wrist angle for each hand when `Hand tracking` is also on and a hand
  is paired to that wrist (nearest hand within ~8% of frame width). Works with
  no reference template selected — these are live readouts of your own pose,
  not comparisons against a target.
- **Body outline:** `Options` toggle (off by default) — a soft glowing contour
  traced from the pose model's own segmentation mask, layered under the
  skeleton/silhouette/blueprint rendering regardless of `Ghost style`.
  Reconfigures the *already-loaded* pose model live (`PoseLandmarker.setOptions`)
  rather than loading anything new, but segmentation itself adds real per-frame
  cost, hence opt-in.
- Offline after first use — app shell is precached; wasm, pose model, hand
  model, the TensorFlow bundle and the three.js bundle are cached on first
  fetch.

## Run it

Quickest path — one script installs dependencies (first run only) and starts
the dev server:

```bash
./start.sh        # macOS / Linux / Git Bash
start.bat         # Windows (double-click, or run from a terminal)
```

`start.sh build` / `start.bat build` builds the production bundle and serves it
with `vite preview` instead.

Or run the underlying commands yourself:

```bash
npm install          # also downloads the pose model + copies wasm + builds icons
npm run dev          # https://localhost:5173  (and your LAN IP, HTTPS)
```

`npm install` runs `scripts/prepare.mjs`, which needs network once to fetch
`pose_landmarker_lite.task` (~3 MB) into `public/models/`. Re-run any time with
`npm run prepare:assets`.

There's only one server to run — the Vite dev server serves the whole app
(no separate backend).

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
| `object-fit: cover` crop math (preview + capture) | `src/overlay/coverCrop.ts` |
| Reference-photo pose extraction | `src/reference/importImage.ts` |
| Template persistence | `src/store/templates.ts` |
| Built-in pose bank + scene tags | `src/data/poseBank.ts`, `src/data/suggest.ts` |
| Scene detection (lazy MobileNet) | `src/scene/classifier.ts` |
| Audio cues / wake lock / level | `src/audio/cues.ts`, `src/hooks/useWakeLock.ts`, `src/hooks/useLevel.ts` |
| Silhouette cut-out from seg mask | `src/reference/importImage.ts` (`buildSilhouette`) |
| 3D pose preview (lazy three.js) | `src/three/posePreview.ts`, `src/ui/PosePreview3D.tsx` |
| Multi-person select + draw | `src/pose/runLandmarker.ts` (`primaryIndex`), `src/overlay/draw.ts` |
| Group templates (multi-person) | `src/data/templatePose.ts`, `src/match/matcher.ts` (`matchGroup`) |
| Hand tracking (lazy HandLandmarker) | `src/pose/runLandmarker.ts`, `src/pose/handLandmarks.ts`, wired through `worker.ts`/`poseClient.ts` |
| Blueprint style + live angle callouts | `src/overlay/draw.ts` (`drawBlueprintPass`), `src/match/liveAngles.ts` |
| Body outline glow (segmentation) | `src/overlay/draw.ts` (`drawBodyOutline`), `src/pose/runLandmarker.ts` (`setSegmentationEnabled`) |

Tuning knobs: `WEIGHTS` / `MAX_ERR` in `src/match/matcher.ts`, colour thresholds
in `src/overlay/draw.ts`, filter constants in `src/filter/oneEuro.ts`,
`readyScore` in `src/app.tsx` (`DEFAULT_SETTINGS`), scene weights in
`src/scene/classifier.ts` (`SYNSETS` / `WINDOW` / `SWITCH_MARGIN`), pose
coordinates in `src/data/poseBank.ts`.

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
- `numPoses` is 3 for both live and image (group cap); drop it in
  `src/pose/runLandmarker.ts` if inference is too slow on an older device.
- IMAGE-mode world landmarks (used by the 3D preview) are approximate; the panel
  labels itself "flat" when a pose has none.

## Roadmap

Auto scene detect is still an ImageNet-1k heuristic. A real scene model
(Places365) would need a one-time offline Caffe/PyTorch → TF.js conversion;
there's no ready-made browser build to drop in. Tracked in issue #4.

## Credits (all Apache-2.0 / MIT)

MediaPipe Tasks Vision · TensorFlow.js + MobileNet · three.js · Preact · Vite ·
vite-plugin-pwa (Workbox) · Comlink · idb-keyval · pngjs. Matching approach
inspired by Google's *Move Mirror*.
