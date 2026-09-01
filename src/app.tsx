import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { startCamera, stopStream, type Facing } from './camera';
import { createPoseEngine, type PoseEngine } from './pose/poseClient';
import {
  usePoseLoop,
  type FrameSnapshot,
  type LoopSettings,
  type LoopStats,
  type SilhouetteHandle,
} from './hooks/usePoseLoop';
import { coverCrop, makeProjection } from './overlay/coverCrop';
import { drawOverlay } from './overlay/draw';
import { useWakeLock } from './hooks/useWakeLock';
import { requestLevelPermission, useLevel } from './hooks/useLevel';
import {
  deleteTemplate,
  exportTemplates,
  importTemplatesJson,
  listTemplates,
  newTemplate,
  saveTemplate,
} from './store/templates';
import { extractPoses } from './reference/importImage';
import { POSE_BANK, bankPoseToTemplate, type BankPose, type SceneCategory } from './data/poseBank';
import { suggestPoses } from './data/suggest';
import { classifyScene, preloadClassifier } from './scene/classifier';
import { renderSkeletonThumb } from './overlay/thumb';
import { Cues } from './audio/cues';
import { TemplateSheet } from './ui/TemplateSheet';
import { SuggestBar } from './ui/SuggestBar';
import { OptionsSheet } from './ui/OptionsSheet';
import { PosePreview3D } from './ui/PosePreview3D';
import { ReviewScreen } from './ui/ReviewScreen';
import type { Template } from './pose/types';

const DEFAULT_SETTINGS: LoopSettings = {
  mirror: false,
  showGrid: true,
  autoShutter: false,
  readyScore: 82,
  ghostStyle: 'both',
  burnOverlay: false,
};

export function App() {
  const [phase, setPhase] = useState<'intro' | 'live'>('intro');
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cues = useRef(new Cues()).current;

  const [engine, setEngine] = useState<PoseEngine | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');

  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const templateRef = useRef<Template | null>(null);
  templateRef.current = activeTemplate;
  const activeId = activeTemplate?.id ?? null;

  const [settings, setSettings] = useState<LoopSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef<LoopSettings>(settings);
  settingsRef.current = settings;

  const frameRef = useRef<FrameSnapshot | null>(null);

  const [stats, setStats] = useState<LoopStats>({
    score: 0,
    perScore: [],
    hints: [],
    ready: false,
    fps: 0,
    mode: '',
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [preview3dOpen, setPreview3dOpen] = useState(false);
  const [review, setReview] = useState<{ url: string; blob: Blob | null } | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;

  // Decoded silhouette image for the active template (Phase 3 ghost).
  const silhouetteRef = useRef<SilhouetteHandle | null>(null);
  useEffect(() => {
    const sil = activeTemplate?.silhouette;
    silhouetteRef.current = null;
    if (!sil) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) silhouetteRef.current = { img, bbox: sil.bbox };
    };
    img.src = sil.dataUrl;
    return () => {
      alive = false;
      silhouetteRef.current = null;
    };
  }, [activeTemplate?.id]);

  // ---- suggestion / scene ---------------------------------------------------
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [sceneCat, setSceneCat] = useState<SceneCategory | null>(null);
  const [autoScene, setAutoScene] = useState(false);
  const [detectedScene, setDetectedScene] = useState<SceneCategory | null>(null);
  const thumbs = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of POSE_BANK) map[p.id] = renderSkeletonThumb(p.landmarks);
    return map;
  }, []);
  const suggestions = useMemo(() => suggestPoses(sceneCat), [sceneCat]);

  // ---- level (device tilt) ------------------------------------------------------
  const [levelEnabled, setLevelEnabled] = useState(false);
  const level = useLevel(levelEnabled);
  const levelRef = useRef<{ roll: number } | null>(null);
  levelRef.current = level;

  useWakeLock(phase === 'live');

  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!autoScene || phase !== 'live') return;
    let stopped = false;
    const tick = async () => {
      if (stopped || !videoRef.current) return;
      try {
        const c = await classifyScene(videoRef.current);
        if (!stopped && c) {
          setDetectedScene(c);
          setSceneCat(c);
        }
      } catch {
        /* ignore a bad frame */
      }
    };
    void tick();
    const id = setInterval(tick, 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [autoScene, phase]);

  async function start() {
    setFatal(null);
    setBusy('Starting camera…');
    try {
      streamRef.current = await startCamera(videoRef.current!, facing);
      cues.resume();
      requestLevelPermission()
        .then((ok) => ok && setLevelEnabled(true))
        .catch(() => undefined);
      setPhase('live');
      setBusy('Loading pose model…');
      try {
        setEngine(await createPoseEngine());
      } catch (e) {
        setNotice('Pose model failed to load. Run `npm run prepare:assets`, then reload.');
        console.error(e);
      }
    } catch (e) {
      setFatal(errMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function flip() {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    stopStream(streamRef.current);
    try {
      streamRef.current = await startCamera(videoRef.current!, next);
      setFacing(next);
      setSettings((s) => ({ ...s, mirror: next === 'user' }));
    } catch (e) {
      setNotice(errMessage(e));
    }
  }

  async function toggleAutoScene() {
    const next = !autoScene;
    setAutoScene(next);
    if (!next) return;
    setBusy('Loading scene model…');
    try {
      await preloadClassifier();
    } catch {
      setNotice('Scene model failed to load.');
      setAutoScene(false);
    } finally {
      setBusy(null);
    }
  }

  function pickBankPose(p: BankPose) {
    setActiveTemplate(bankPoseToTemplate(p, thumbs[p.id]));
  }

  async function capture() {
    const v = videoRef.current;
    const overlay = canvasRef.current;
    if (!v || !v.videoWidth || !overlay) return;
    cues.shutter();

    const s = settingsRef.current;
    const vW = v.videoWidth;
    const vH = v.videoHeight;
    const frame = frameRef.current;
    const burn = s.burnOverlay && !!frame;

    // Default: save the full sensor frame. When burning the overlay in, crop to
    // the visible `object-fit: cover` region so overlay and photo share geometry.
    let crop = { srcX: 0, srcY: 0, srcW: vW, srcH: vH };
    if (burn) {
      const box = overlay.getBoundingClientRect();
      crop = coverCrop(vW, vH, box.width || vW, box.height || vH);
    }
    const outW = Math.round(crop.srcW);
    const outH = Math.round(crop.srcH);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    if (s.mirror) {
      ctx.translate(outW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, crop.srcX, crop.srcY, crop.srcW, crop.srcH, 0, 0, outW, outH);
    ctx.restore();

    if (burn && frame) {
      drawOverlay(ctx, {
        w: outW,
        h: outH,
        mirror: s.mirror,
        project: makeProjection(crop, vW, vH, outW, outH),
        ghosts: frame.ghosts,
        people: frame.people,
        showGrid: false,
        ghostStyle: s.ghostStyle,
        level: null,
        clear: false,
      });
    }

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return;
    setReview({ url: URL.createObjectURL(blob), blob });
  }

  async function importPhoto(file: File) {
    setSheetOpen(false);
    setBusy('Reading pose from photo…');
    try {
      const res = await extractPoses(file);
      if (!res || res.people.length === 0) {
        setNotice('No person detected in that photo.');
        return;
      }
      const primary = res.people[0];
      const group = res.people.length > 1;
      const base = file.name.replace(/\.[^.]+$/, '');
      const tpl = newTemplate(
        group ? `${base} (${res.people.length})` : base,
        primary.landmarks,
        res.thumb,
        {
          world: primary.world,
          silhouette: primary.silhouette,
          poses: group
            ? res.people.map((p) => ({
                landmarks: p.landmarks,
                world: p.world,
                silhouette: p.silhouette,
              }))
            : undefined,
        },
      );
      await saveTemplate(tpl);
      setTemplates(await listTemplates());
      setActiveTemplate(tpl);
      if (group) setNotice(`Group template — ${res.people.length} people, lined up left to right.`);
    } catch (e) {
      setNotice(errMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeTemplate(id: string) {
    await deleteTemplate(id);
    setTemplates(await listTemplates());
    if (activeTemplate?.id === id) setActiveTemplate(null);
  }

  async function doExport() {
    const json = await exportTemplates();
    downloadBlob(new Blob([json], { type: 'application/json' }), 'posetrace-templates.json');
  }

  async function doImportJson(file: File) {
    try {
      const n = await importTemplatesJson(await file.text());
      setTemplates(await listTemplates());
      setNotice(`Imported ${n} template${n === 1 ? '' : 's'}.`);
    } catch (e) {
      setNotice(errMessage(e));
    }
  }

  usePoseLoop({
    videoRef,
    canvasRef,
    engine,
    running: phase === 'live' && !review,
    templateRef,
    settingsRef,
    levelRef,
    silhouetteRef,
    frameRef,
    onStats: setStats,
    onReadyChange: (ready) => {
      if (ready) cues.aligned();
    },
    onAutoCapture: () => {
      if (!reviewRef.current) void capture();
    },
  });

  const iconFor = (t: Template | null) =>
    t?.thumb ? <img src={t.thumb} alt="" /> : '▦';

  return (
    <>
      <div class={`stage${settings.mirror ? ' mirror' : ''}`} hidden={phase !== 'live'}>
        <video ref={videoRef} />
        <canvas ref={canvasRef} />

        <div class="hud">
          <div class={`score${stats.ready ? ' ready' : ''}`}>
            <b>{activeTemplate ? stats.score : '–'}</b>
            <span>
              {activeTemplate
                ? stats.ready
                  ? 'READY'
                  : stats.perScore.length > 1
                    ? stats.perScore.join(' · ')
                    : '% match'
                : 'no reference'}
            </span>
          </div>
          <div class="hints">
            {notice && <span class="hint">{notice}</span>}
            {activeTemplate &&
              stats.hints.map((h) => (
                <span class="hint" key={h}>
                  {h}
                </span>
              ))}
          </div>
        </div>

        <div class="debug">
          {stats.mode || 'starting…'} · {stats.fps} fps
        </div>

        {preview3dOpen && activeTemplate && (
          <PosePreview3D template={activeTemplate} onClose={() => setPreview3dOpen(false)} />
        )}

        {suggestOpen && (
          <SuggestBar
            category={sceneCat}
            onCategory={(c) => {
              setSceneCat(c);
              if (autoScene) setAutoScene(false);
            }}
            autoScene={autoScene}
            onToggleAuto={() => void toggleAutoScene()}
            detected={detectedScene}
            suggestions={suggestions}
            thumbs={thumbs}
            activeId={activeId}
            onPick={pickBankPose}
          />
        )}

        <div class="bar">
          <div class="side">
            <button class="iconbtn" onClick={() => setSheetOpen(true)} title="Reference pose">
              {iconFor(activeTemplate)}
            </button>
            <button
              class={`iconbtn${optionsOpen ? ' on' : ''}`}
              onClick={() => setOptionsOpen(true)}
              title="Options"
            >
              ⋯
            </button>
          </div>

          <button
            class={`shutter${stats.ready ? ' ready' : ''}`}
            onClick={() => {
              cues.resume();
              void capture();
            }}
            aria-label="Take photo"
          />

          <div class="side right">
            <button
              class={`iconbtn${suggestOpen ? ' on' : ''}`}
              onClick={() => setSuggestOpen((v) => !v)}
              title="Pose suggestions"
            >
              ✦
            </button>
            <button class="iconbtn" onClick={() => void flip()} title="Flip camera">
              {'↻'}
            </button>
          </div>
        </div>
      </div>

      {phase === 'intro' && (
        <div class="intro">
          <h1>PoseTrace</h1>
          <p>
            Pick a suggested pose or import a reference photo, then match it live. Limbs turn green
            as you line up with the ghost.
          </p>
          <button class="cta" onClick={() => void start()}>
            Start camera
          </button>
          {fatal && <p class="err">{fatal}</p>}
        </div>
      )}

      {sheetOpen && (
        <TemplateSheet
          templates={templates}
          activeId={activeId}
          onPick={(id) => {
            setActiveTemplate(id ? templates.find((t) => t.id === id) ?? null : null);
            setSheetOpen(false);
          }}
          onDelete={(id) => void removeTemplate(id)}
          onImportPhoto={(f) => void importPhoto(f)}
          onExport={() => void doExport()}
          onImportJson={(f) => void doImportJson(f)}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {optionsOpen && (
        <OptionsSheet
          settings={settings}
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          preview3d={preview3dOpen}
          onPreview3d={setPreview3dOpen}
          canPreview3d={!!activeTemplate}
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {review && (
        <ReviewScreen
          url={review.url}
          blob={review.blob}
          onRetake={() => {
            URL.revokeObjectURL(review.url);
            setReview(null);
          }}
        />
      )}

      {busy && <div class="spinner">{busy}</div>}
    </>
  );
}

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function errMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'NotAllowedError') return 'Camera permission denied. Enable it in Settings and reload.';
    if (e.name === 'NotFoundError') return 'No camera found on this device.';
    return e.message;
  }
  return String(e);
}
